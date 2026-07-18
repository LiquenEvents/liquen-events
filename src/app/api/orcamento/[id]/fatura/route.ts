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
    // Idempotência: se já existir uma fatura para esta linha de pagamento
    // (mesmo `paymentId`; na sua ausência, mesma espécie + valor para o pedido)
    // reaproveitamo-la em vez de cunhar um número novo — descarregar ou reenviar
    // o mesmo recibo não duplica o livro nem salta números da sequência.
    const ledger = await listInvoicesForQuote(id);
    let invoice =
      ledger.find((inv) =>
        paymentRef
          ? (inv.note ?? "").includes(paymentRef)
          : inv.kind === invoiceKind && inv.amount === amount,
      ) ?? null;

    if (invoice) {
      // Documento já emitido: se entretanto foi liquidado, actualizamos o estado
      // (mantendo o MESMO número) para a reimpressão reflectir a realidade.
      if (paid && invoice.status !== "paga") {
        invoice =
          (await updateInvoice(invoice.id, { status: "paga", paidAt: issuedAt })) ?? invoice;
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
