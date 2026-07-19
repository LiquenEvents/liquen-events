import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/quotes-store";
import {
  createInvoice,
  updateInvoice,
  listInvoicesForQuote,
  nextInvoiceNumber,
  newInvoiceId,
  type Invoice,
} from "@/lib/invoices-store";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { eur } from "@/lib/money";

export const runtime = "nodejs";

// O painel envia um `kind` de pagamento (PaymentKind); o livro de faturas usa o
// seu próprio conjunto (Invoice["kind"]). Um "pagamento" avulso é, para efeitos
// de numeração e registo, um documento de total.
const PAYMENT_TO_INVOICE_KIND: Record<string, Invoice["kind"]> = {
  sinal: "sinal",
  saldo: "saldo",
  pagamento: "total",
};
const KIND_LABEL: Record<Invoice["kind"], string> = {
  sinal: "Sinal",
  saldo: "Saldo final",
  total: "Pagamento",
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const body = await request.json();
    const amount = Math.min(Number(body.amount) || 0, 100_000_000);
    if (amount <= 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

    // Bound + strip line breaks em tudo o que chega do cliente: alimenta o
    // assunto do email e o nome do anexo, por isso mantém-se numa linha e curto.
    const clean = (v: unknown, max: number) =>
      String(v ?? "")
        .replace(/[\r\n]+/g, " ")
        .slice(0, max);
    const paymentKind = clean(body.kind, 40) || "pagamento";
    const invoiceKind = PAYMENT_TO_INVOICE_KIND[paymentKind] ?? "total";
    const vatRate =
      typeof body.vatRate === "number" ? Math.min(Math.max(body.vatRate, 0), 1) : 0.23;
    // TODO(qa): `issuedAt` (e, quando `paid`, o `paidAt` derivado) NÃO é validado
    // ao formato yyyy-mm-dd aqui (a rota /faturas fá-lo). Um `date` malformado do
    // painel é persistido tal-e-qual e depois alimenta `new Date(date+"T12:00:00")`
    // no PDF → "Invalid Date". É admin-only, por isso deixo nota em vez de mudar
    // comportamento; a corrigir com a mesma coerção yyyy-mm-dd de /faturas.
    const issuedAt = clean(body.date, 40) || new Date().toISOString().slice(0, 10);
    const paid = !!body.paid;
    const email = !!body.email;
    const description = String(body.description ?? "").slice(0, 2000);
    // Id da linha de pagamento no painel — a nossa chave de idempotência (ver
    // abaixo). Persistimo-lo na `note` da fatura com um marcador reconhecível.
    const paymentId = clean(body.paymentId, 80);
    const paymentRef = paymentId ? `[pag:${paymentId}]` : "";

    // ── Livro de faturas ────────────────────────────────────────────────────
    // Todo o documento entregue ao cliente é numerado e registado: a numeração
    // é sequencial (FT AAAA/NNNN), obrigatória e visível na vista de Faturas.
    //
    // INVARIANTE DE INTEGRIDADE: no máximo UMA fatura de sinal e UMA de saldo por
    // pedido, para sempre — nenhum caminho pode cunhar uma segunda.
    //
    // O sinal e o saldo são AUTO-emitidos noutros fluxos (aceite da proposta ⇒
    // sinal; transição sinal→paga ⇒ saldo) e NÃO carregam o marcador `[pag:<id>]`.
    // Quando o painel emite o recibo dessa mesma parcela envia SEMPRE `paymentId`,
    // por isso uma deduplicação guiada só pelo marcador nunca casaria com a fatura
    // auto-emitida e cunharia um SEGUNDO sinal/saldo (double-billing). Por isso,
    // para estas duas espécies, reaproveitamos SEMPRE uma fatura existente da
    // mesma espécie para o pedido (ela é única por invariante); só criamos quando
    // não existe nenhuma.
    //
    // Para as restantes espécies (total/pagamento), a chave de idempotência é o
    // marcador da linha de pagamento OU, em recurso, a mesma espécie + valor — o
    // fallback continua alcançável mesmo com `paymentRef` presente (marcador OU
    // espécie+valor), para reaproveitar um documento anterior sem marcador.
    const ledger = await listInvoicesForQuote(id);
    // Só reaproveitamos faturas ATIVAS: uma fatura `anulada` (voided) nunca volta
    // à vida. Os índices parciais únicos (invoices_one_active_{sinal,saldo}_uk)
    // excluem as anuladas de propósito, exatamente para permitir reemitir uma
    // fresca depois de anular a anterior — coerente com a rota /faturas e com
    // maybeAutoIssueSaldo. Sem este filtro, reaproveitar uma anulada por espécie
    // (sinal/saldo) ou por espécie+valor (total) ressuscitava um documento fiscal
    // anulado para `paga`, ou casava com o anulado ignorando o ativo existente.
    const activeLedger = ledger.filter((inv) => inv.status !== "anulada");
    const isSinalOrSaldo = invoiceKind === "sinal" || invoiceKind === "saldo";
    let invoice =
      (isSinalOrSaldo
        ? activeLedger.find((inv) => inv.kind === invoiceKind)
        : activeLedger.find(
            (inv) =>
              (!!paymentRef && (inv.note ?? "").includes(paymentRef)) ||
              (inv.kind === invoiceKind && inv.amount === amount),
          )) ?? null;

    if (invoice) {
      // Documento já emitido: reaproveitamos o MESMO número — nunca criamos um
      // segundo sinal/saldo. Actualizamos apenas o que a realidade deste recibo
      // exige: se representa liquidação, marcamos `paga`; e se traz um marcador de
      // pagamento que a fatura (auto-emitida) ainda não tem, anexamo-lo à nota
      // para reemissões futuras casarem pelo marcador e deixar o rasto da linha
      // de pagamento que a liquidou.
      const patch: Partial<Invoice> = {};
      if (paid && invoice.status !== "paga") {
        patch.status = "paga";
        patch.paidAt = issuedAt;
      }
      if (paymentRef && !(invoice.note ?? "").includes(paymentRef)) {
        patch.note = [invoice.note, paymentRef].filter(Boolean).join(" ");
      }
      if (Object.keys(patch).length > 0) {
        invoice = (await updateInvoice(invoice.id, patch)) ?? invoice;
      }
    } else {
      // Novo documento: alocamos o próximo número da sequência e registamo-lo no
      // livro ANTES de emitir o PDF/email — um documento entregue ao cliente tem
      // de existir nos livros. Se este `createInvoice` falhar, a exceção sobe e
      // devolvemos 500 sem enviar nada.
      const record: Invoice = {
        id: newInvoiceId(),
        number: await nextInvoiceNumber(),
        quoteId: id,
        clientName: quote.name,
        clientEmail: quote.email,
        kind: invoiceKind,
        amount,
        vatRate,
        issuedAt,
        status: paid ? "paga" : "emitida",
        ...(paid ? { paidAt: issuedAt } : {}),
        note: [KIND_LABEL[invoiceKind], paymentRef].filter(Boolean).join(" "),
      };
      await createInvoice(record);
      invoice = record;
    }

    // Render a partir do registo persistido → o número no PDF é, por construção,
    // o número no livro. (O NIF vive no pedido, não na fatura.)
    const number = invoice.number;
    const pdfBytes = await renderInvoicePdf({
      number,
      date: invoice.issuedAt,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      clientNif: quote.nif,
      description,
      amount: invoice.amount,
      vatRate: invoice.vatRate,
      kindLabel: KIND_LABEL[invoice.kind] ?? "Pagamento",
      paid: invoice.status === "paga",
    });
    const pdfBuffer = Buffer.from(pdfBytes);

    let emailed = false;
    if (email) {
      const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="font-size:18px;margin:0 0 12px">Recibo — Líquen Events</h2>
        <p style="font-size:14px;line-height:1.6;color:#333">Olá ${esc(invoice.clientName)},</p>
        <p style="font-size:14px;line-height:1.6;color:#333">Segue em anexo o recibo no valor de <strong style="color:#7c854b">${eur(invoice.amount)}</strong>.</p>
        <p style="font-size:13px;color:#777;margin-top:20px">Líquen Events · ${esc(MAIL_TO)} · ${SITE.phoneDisplay}</p>
      </div>`;
      // Plain-text alternative (multipart/alternative): better spam-filter
      // standing and readable by text-only / screen-reader mail clients.
      const text = [
        "Recibo — Líquen Events",
        "",
        `Olá ${invoice.clientName},`,
        "",
        `Segue em anexo o recibo no valor de ${eur(invoice.amount)}.`,
        "",
        `Líquen Events · ${MAIL_TO} · ${SITE.phoneDisplay}`,
      ].join("\n");
      const mail = await sendMail({
        to: invoice.clientEmail,
        replyTo: MAIL_TO,
        subject: `Recibo ${number} — Líquen Events`,
        html,
        text,
        attachments: [
          {
            filename: `Recibo-${number.replace(/\//g, "-")}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });
      emailed = mail.sent;
    }

    return NextResponse.json({
      ok: true,
      number,
      emailed,
      pdfBase64: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    log.error("fatura POST falhou", err);
    return NextResponse.json({ error: "Erro ao gerar o recibo" }, { status: 500 });
  }
}
