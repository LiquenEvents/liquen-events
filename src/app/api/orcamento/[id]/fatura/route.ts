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
import { emailAoCliente } from "@/lib/email-assinatura";
import { isAuthed } from "@/lib/admin-auth";
import { respostaDeConflito, respostaDeMigracaoEmFalta } from "@/lib/resposta-de-conflito";
import { log } from "@/lib/logger";
/**
 * DOIS FORMATADORES, E É DE PROPÓSITO — a fronteira é quem lê.
 *
 * O `eurDocumento` escreve os milhares com PONTO e é o de tudo o que sai para o
 * CLIENTE: sem ele, um recibo de 4 600 € dizia «4600,00 €» no email e
 * «4.600,00 €» no PDF anexo, porque o `Intl` de pt-PT só agrupa a partir de
 * cinco dígitos (ver `money.ts`).
 *
 * O `eur` fica na linha do HISTÓRICO, que é do back office e só é lida no
 * painel (`ActivityLog.tsx`). Mudá-la aqui deixava-a a discordar das linhas
 * escritas pelas rotas irmãs — o mesmo defeito outra vez, só que por dentro.
 * Uma mudança de formato no back office é uma decisão de produto e faz-se toda
 * de uma vez, apontando o `eur` ao `eurDocumento`, não rota a rota.
 */
import { eur, eurDocumento } from "@/lib/money";
import { registarAcontecimento } from "@/lib/estado-do-pedido-servidor";
import { dataIso } from "@/lib/validation";
import { hojeNoEstudio } from "@/lib/proposal-doc";

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

    // JSON malformado é pedido errado, não avaria. Sem isto o `request.json()`
    // atirava, o `catch` lá em baixo devolvia 500 e o painel dizia «erro ao
    // gerar o recibo» — que se lê como avaria e leva a reemitir um documento
    // que ainda por cima é numerado. Mesmo padrão do PATCH de
    // `/api/orcamento/[id]`.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
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
    // Coerção da data ao formato yyyy-mm-dd: um `date` malformado do painel
    // persistia tal-e-qual e depois alimentava `new Date(date+"T12:00:00")` no
    // PDF → "Invalid Date" no recibo (e no `paidAt` derivado). A regra estava
    // escrita aqui e copiada à mão para a rota /faturas; agora é a mesma
    // `dataIso` para toda a gente — inclusive para a validade da proposta, que
    // dizia «Válida até Invalid Date» por lhe faltar esta verificação.
    // Um valor ausente ou malformado cai para hoje.
    // O recurso é o dia de LISBOA, não o de Greenwich — ver `hojeNoEstudio`.
    const issuedAt = dataIso(body.date) || hojeNoEstudio();
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
    // For ad-hoc payments, dedupe by the payment MARKER when one is supplied:
    // two distinct payments of the same value must each get their own numbered
    // document, so we must NOT fall back to a kind+amount match when a fresh
    // paymentRef is present (that reused/overwrote an unrelated same-amount
    // invoice). The kind+amount heuristic is reserved for legacy records that
    // carry no marker.
    let invoice =
      (isSinalOrSaldo
        ? activeLedger.find((inv) => inv.kind === invoiceKind)
        : paymentRef
          ? activeLedger.find((inv) => (inv.note ?? "").includes(paymentRef))
          : activeLedger.find((inv) => inv.kind === invoiceKind && inv.amount === amount)) ?? null;

    /**
     * ════════════════════════════════════════════════════════════════════════
     * O DESTINATÁRIO DECIDE-SE ANTES DE SE GASTAR UM NÚMERO
     * ════════════════════════════════════════════════════════════════════════
     *
     * `types.ts` avisa, em cima do `email` do pedido: «Todo o código que envia
     * email para o cliente TEM de verificar isto». A mensagem, a proposta e o
     * proposta-doc verificam. Esta rota não verificava, e a ordem das operações
     * era a pior possível:
     *
     *   • Pedido nascido de um telefonema (`email: ""`): o `to ?? MAIL_TO` não
     *     apanha a string vazia (o `??` só apanha `null`/`undefined`), portanto
     *     descia ao nodemailer, que atira «No recipients defined» → 500 «Erro
     *     ao gerar o recibo». Só que isso acontecia DEPOIS de o número da
     *     fatura estar gasto, do livro escrito e do estado do pedido mexido.
     *     Ela lê «erro», carrega outra vez, e gasta outro número.
     *   • Email `undefined`/`null` (o esquema de reposição aceita `.nullish()`
     *     e o pedido volta como blob verbatim): o `??` entregava o documento do
     *     CLIENTE na caixa da CASA e respondia `emailed: true`.
     *
     * Por isso a validação vem aqui: depois de LER o livro (preciso de saber
     * para onde é que este documento está endereçado), antes de lhe ESCREVER
     * seja o que for. Recusar cedo não gasta nada — nem número, nem livro, nem
     * histórico do pedido — e a frase diz o que fazer a seguir.
     *
     * O endereço é o da FATURA, não o do pedido: um documento fiscal guarda o
     * endereço com que foi emitido, e pode estar endereçado de propósito a
     * outro pagador (o espaço, a wedding planner). Só quando a fatura não tem
     * endereço nenhum (registos antigos) é que se cai para o do pedido.
     */
    const destinatario = String(invoice?.clientEmail || quote.email || "").trim();
    const destinatarioValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destinatario);
    if (email && !destinatarioValido) {
      return NextResponse.json(
        {
          error:
            "Este pedido não tem email de cliente válido — não foi emitido nem numerado nada. " +
            "Acrescenta o email do cliente na ficha do pedido e volta a enviar; " +
            "entretanto podes descarregar o PDF e enviá-lo à mão.",
        },
        { status: 400 },
      );
    }

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

    /**
     * ════════════════════════════════════════════════════════════════════════
     * O DOCUMENTO ESTÁ NO LIVRO — O QUADRO TEM DE SABER
     * ════════════════════════════════════════════════════════════════════════
     *
     * Emitir um recibo daqui não mexia no pedido. Ela podia ter o sinal
     * emitido e pago, a data reservada, e o pedido a dizer «Cotado»: o trabalho
     * ganho e a única coluna que ela usa para saber o que falta fazer a mentir.
     *
     * São dois acontecimentos diferentes e vale a pena distingui-los na linha
     * do histórico, mesmo que hoje levem ao mesmo estado: uma factura EMITIDA é
     * o compromisso, um pagamento RECEBIDO é o dinheiro. Meses depois, ao ler o
     * histórico, não é a mesma frase.
     *
     * Depois de o livro estar escrito e ANTES do PDF/email de propósito: a
     * transição não pode ficar refém de um envio de correio que falhe. E não
     * atira — ver `registarAcontecimento`.
     */
    await registarAcontecimento(
      id,
      invoice.status === "paga" ? "pagamento_recebido" : "fatura_emitida",
      `${invoice.number} · ${eur(invoice.amount)}`,
    );

    /**
     * ════════════════════════════════════════════════════════════════════════
     * «RECIBO» É PROVA DE PAGAMENTO — A PALAVRA SAI DAQUI, E SÓ DAQUI
     * ════════════════════════════════════════════════════════════════════════
     *
     * O mesmo botão emite as duas coisas: uma linha já paga (recibo) e uma
     * linha por liquidar (fatura). Escrevia-se «Recibo» sempre — assunto, nome
     * do anexo, título e corpo —, e o cliente que ainda não tinha pago recebia
     * «segue em anexo o recibo» com um PDF que diz FATURA em cima e AGUARDA
     * PAGAMENTO a meio. Perante o cliente e perante o fisco, é falso.
     *
     * O critério é o mais simples que existe e é o MESMO que o PDF imprime: o
     * estado do documento no livro. Uma linha só, aqui, de onde saem todas as
     * ocorrências da palavra — incluindo a que o painel mostra, que vem na
     * resposta em vez de ser recalculada do outro lado. Se as duas pontas
     * voltarem a decidir em separado, voltam a divergir daqui a três meses.
     */
    const pago = invoice.status === "paga";
    const docLabel = pago ? "Recibo" : "Fatura";
    const docArtigo = pago ? "o recibo" : "a fatura";

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
      paid: pago,
    });
    const pdfBuffer = Buffer.from(pdfBytes);

    let emailed = false;
    if (email) {
      // Só o corpo: a moldura e a assinatura da casa vêm do
      // `email-assinatura`. A alternativa em TEXTO simples anda sempre com o
      // HTML — passa melhor pelos filtros de spam e é o que se lê num cliente
      // só de texto ou num leitor de ecrã.
      const mensagem = emailAoCliente({
        html: `<h2 style="font-size:18px;margin:0 0 12px">${docLabel} — Líquen Events</h2>
        <p style="font-size:14px;line-height:1.6;color:#333">Olá ${esc(invoice.clientName)},</p>
        <p style="font-size:14px;line-height:1.6;color:#333">Segue em anexo ${docArtigo} no valor de <strong style="color:#7c854b">${eurDocumento(invoice.amount)}</strong>.</p>`,
        texto: [
          `${docLabel} — Líquen Events`,
          "",
          `Olá ${invoice.clientName},`,
          "",
          `Segue em anexo ${docArtigo} no valor de ${eurDocumento(invoice.amount)}.`,
        ].join("\n"),
      });
      const mail = await sendMail({
        // Endereço já validado acima — nenhum `?? MAIL_TO` decide nada por nós
        // neste caminho: o documento do cliente nunca pode cair na caixa da casa.
        to: destinatario,
        replyTo: MAIL_TO,
        subject: `${docLabel} ${number} — Líquen Events`,
        html: mensagem.html,
        text: mensagem.text,
        // O documento junta-se aos anexos da assinatura, não os substitui.
        attachments: [
          ...mensagem.attachments,
          {
            filename: `${docLabel}-${number.replace(/\//g, "-")}.pdf`,
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
      // A palavra que o CLIENTE leu, e o endereço para onde ela foi mesmo. O
      // painel mostra-as tal e qual em vez de as recalcular: era essa a origem
      // das duas mentiras no ecrã («Fatura enviada» sobre um email que dizia
      // «Recibo», e «enviado para {quote.email}» sobre um envio que saiu para o
      // endereço congelado na fatura).
      docLabel,
      ...(email ? { emailedTo: destinatario } : {}),
      pdfBase64: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    // Colisão ao reaproveitar um documento já emitido (marcá-lo `paga`, anexar
    // o marcador do pagamento) enquanto alguém o editava em /faturas. Um 500
    // aqui dizia "Erro ao gerar o recibo" com o livro por saber se mexeu — e ela
    // reemitia. 409 com as duas versões: o número não se gasta, nada se duplica.
    const conflito = respostaDeConflito(err);
    if (conflito) return conflito;
    const migracao = respostaDeMigracaoEmFalta(err, "As faturas");
    if (migracao) return migracao;
    log.error("fatura POST falhou", err);
    return NextResponse.json({ error: "Erro ao gerar o recibo" }, { status: 500 });
  }
}
