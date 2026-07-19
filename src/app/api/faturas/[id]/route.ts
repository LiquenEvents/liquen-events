import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import {
  getInvoice,
  updateInvoice,
  deleteInvoice,
  listInvoicesForQuote,
  createInvoice,
  newInvoiceId,
  nextInvoiceNumber,
  splitThirtySeventy,
  isUniqueViolation,
  type Invoice,
} from "@/lib/invoices-store";
import { getProposalByQuote } from "@/lib/proposals-store";
import { round2 } from "@/lib/money";
import { log } from "@/lib/logger";
import { invoiceUpdateSchema, readJsonBody, validateBody } from "@/lib/invoice-validation";

export const runtime = "nodejs";

/** Dias de vencimento por omissão do saldo. Ver `maybeAutoIssueSaldo`. */
const SALDO_DUE_DAYS = 30;

/**
 * Quando um sinal (30%) passa a `paga`, emite automaticamente o saldo (70%)
 * — a mesma automação que a aceitação da proposta faz para o sinal. Só o falta
 * era este passo, que a equipa tinha de lembrar-se de fazer à mão.
 *
 * Idempotente: se já existir um saldo para o mesmo pedido, não faz nada.
 * Best-effort e totalmente isolado: NUNCA pode fazer falhar o PATCH original
 * (marcar como paga tem de resultar sempre). Devolve o saldo criado (ou null)
 * para a UI poder refrescar; qualquer erro é registado e engolido.
 */
async function maybeAutoIssueSaldo(sinal: Invoice): Promise<Invoice | null> {
  try {
    // 1. Idempotência: no máximo UM saldo ACTIVO por pedido. Um saldo `anulada`
    //    NÃO conta — ele representa um saldo órfão que foi anulado quando o sinal
    //    reverteu (ver `maybeAnnulOrphanSaldo`), por isso um novo pagamento do
    //    sinal corrigido tem de poder reemitir um saldo fresco. Se contássemos os
    //    anulados, a guarda bloquearia permanentemente a reemissão corrigida.
    const existing = await listInvoicesForQuote(sinal.quoteId);
    if (existing.some((i) => i.kind === "saldo" && i.status !== "anulada")) return null;

    // 2. Valor do saldo — a fonte de verdade é o SINAL EFECTIVAMENTE FATURADO,
    //    não a proposta. `getProposalByQuote` devolve a proposta mais RECENTE, que
    //    pode ter sido revista após o aceite; usá-la daria um saldo incoerente com
    //    o sinal já cobrado (ex.: sinal €3000 de €10000 + saldo €8400 de uma
    //    proposta revista para €12000). Como o sinal é 30%, o saldo é sinal/3×7 —
    //    e as duas parcelas fecham sempre o mesmo total acordado.
    const amount = round2((sinal.amount / 3) * 7);

    // Verificação de sanidade (só observabilidade): se existir uma proposta e o
    // seu saldo 70% divergir do valor derivado do sinal, registamos — indício de
    // proposta revista após o aceite, a reconciliar manualmente. O valor faturado
    // continua a ser o derivado do sinal; a proposta NUNCA o sobrepõe.
    try {
      const proposal = await getProposalByQuote(sinal.quoteId);
      if (proposal && proposal.total > 0) {
        const fromProposal = splitThirtySeventy(proposal.total).saldo;
        if (fromProposal !== amount) {
          log.warn("faturas: saldo derivado do sinal diverge da proposta mais recente", {
            quoteId: sinal.quoteId,
            fromSinal: amount,
            fromProposal,
          });
        }
      }
    } catch {
      /* cross-check é opcional — nunca afeta o valor faturado nem o fluxo */
    }

    const issuedAt = new Date().toISOString().slice(0, 10);
    // Vencimento por omissão: hoje + 30 dias. A data do evento não é conhecida
    // aqui (não vive na fatura), por isso usamos um prazo padrão de pagamento —
    // a equipa pode ajustá-lo no back office se necessário.
    const dueAt = new Date(Date.now() + SALDO_DUE_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const saldo: Invoice = {
      id: newInvoiceId(),
      number: await nextInvoiceNumber(),
      quoteId: sinal.quoteId,
      clientName: sinal.clientName,
      clientEmail: sinal.clientEmail,
      kind: "saldo",
      amount,
      // O saldo espelha a taxa de IVA do SINAL que já faturou (as propostas
      // podem ser a 6%/13%/23%), não um 0,23 fixo. Fallback 0,23 se ausente.
      vatRate: typeof sinal.vatRate === "number" ? sinal.vatRate : 0.23,
      issuedAt,
      dueAt,
      status: "emitida",
      note: "Saldo 70% — remanescente após sinal",
    };
    try {
      await createInvoice(saldo);
    } catch (err) {
      // Backstop TOCTOU: dois sinal→paga concorrentes podem ambos passar a
      // verificação de idempotência acima e cada um tentar criar um saldo. O
      // índice parcial único (invoices_one_active_saldo_uk, db/schema.sql) deixa
      // só um vencer; o outro apanha a violação de unicidade — tratamo-la como
      // "saldo já emitido" (não é erro): não duplicamos nem falhamos o PATCH.
      if (isUniqueViolation(err)) {
        log.warn("faturas: saldo já emitido por liquidação concorrente (unicidade ignorada)", {
          quoteId: sinal.quoteId,
        });
        return null;
      }
      throw err; // erro genuíno → engolido pelo catch externo (best-effort)
    }
    return saldo;
  } catch (err) {
    log.error("faturas: emissão automática do saldo falhou", err, { quoteId: sinal.quoteId });
    return null;
  }
}

/**
 * Simétrico de `maybeAutoIssueSaldo`: quando um sinal deixa de estar `paga` —
 * revertido (paga→emitida) ou anulado (→anulada) — o saldo 70% que foi emitido
 * automaticamente nessa liquidação fica órfão. Se ainda estiver por pagar
 * (`emitida`), anulamo-lo para não deixar uma dívida fantasma no livro. Um saldo
 * já `paga` NÃO se toca (dinheiro real entrou; a equipa reconcilia à mão).
 *
 * Best-effort e totalmente isolado: NUNCA pode fazer falhar o PATCH original.
 * Devolve o saldo anulado (ou null) para a UI poder refrescar.
 */
async function maybeAnnulOrphanSaldo(sinal: Invoice): Promise<Invoice | null> {
  try {
    const existing = await listInvoicesForQuote(sinal.quoteId);
    const orphan = existing.find((i) => i.kind === "saldo" && i.status === "emitida");
    if (!orphan) return null;
    const annulled = await updateInvoice(orphan.id, {
      status: "anulada",
      paidAt: undefined,
      note: [orphan.note, "(anulado: sinal revertido)"].filter(Boolean).join(" "),
    });
    return annulled ?? null;
  } catch (err) {
    log.error("faturas: anulação do saldo órfão falhou", err, { quoteId: sinal.quoteId });
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const invoice = await getInvoice(id);
    if (!invoice) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (err) {
    log.error("faturas GET (id) falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // Read the prior state up front so we can detect the sinal→paga transition
    // precisely (prior status vs. incoming patch) and 404 before mutating.
    const prior = await getInvoice(id);
    if (!prior) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

    // ── Input validation (400 before mutating) ── malformed JSON, a non-object
    // body, an unknown status or a wrong-typed date now get a clean 400 instead
    // of a 500 (the old `"status" in body` threw on a non-object body).
    const read = await readJsonBody(request);
    if (!read.ok) {
      return NextResponse.json(
        { error: "Corpo do pedido inválido (JSON malformado)." },
        { status: 400 },
      );
    }
    const valid = validateBody(invoiceUpdateSchema, read.body);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    const body = valid.data;
    const patch: Partial<Invoice> = {};

    if ("status" in body) {
      patch.status = body.status;
      // Keep paidAt in lockstep with the status unless the caller set it
      // explicitly: marking paga stamps today, un-paying (or annulling) clears it.
      if (body.status === "paga" && !("paidAt" in body)) {
        patch.paidAt = new Date().toISOString().slice(0, 10);
      } else if (body.status !== "paga") {
        patch.paidAt = undefined;
      }
    }

    if ("paidAt" in body) {
      const s = String(body.paidAt ?? "").slice(0, 10);
      patch.paidAt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    }
    if ("note" in body) {
      patch.note = body.note
        ? String(body.note)
            .replace(/[\r\n]+/g, " ")
            .slice(0, 500)
        : undefined;
    }
    if ("dueAt" in body) {
      const s = String(body.dueAt ?? "").slice(0, 10);
      patch.dueAt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    }

    const updated = await updateInvoice(id, patch);
    if (!updated) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

    // Transição sinal→paga: este PATCH marca um sinal como pago que ainda não o
    // estava. Só aqui (e não noutras edições, nem se já estava paga) emitimos o
    // saldo. A criação é best-effort e nunca pode fazer falhar a marcação acima.
    const becamePaid =
      updated.kind === "sinal" && updated.status === "paga" && prior.status !== "paga";
    // Reversão sinal paga→(emitida|anulada): o saldo auto-emitido nessa liquidação
    // fica órfão — se ainda não foi pago, anulamo-lo para não estranular o livro.
    const revertedFromPaid =
      updated.kind === "sinal" && prior.status === "paga" && updated.status !== "paga";

    const saldo = becamePaid ? await maybeAutoIssueSaldo(updated) : null;
    const saldoAnnulled = revertedFromPaid ? await maybeAnnulOrphanSaldo(updated) : null;

    // Incluímos o saldo criado/anulado (quando há) para a UI refrescar sem refetch.
    if (saldo) return NextResponse.json({ ...updated, saldoAutoIssued: saldo });
    if (saldoAnnulled) return NextResponse.json({ ...updated, saldoAnnulled });
    return NextResponse.json(updated);
  } catch (err) {
    log.error("faturas PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Remoção definitiva de uma fatura do livro.
 *
 * REGRA FISCAL (só anuladas): uma fatura só pode ser apagada se já estiver
 * `anulada`. Uma fatura viva (emitida/paga) nunca se apaga — anula-se primeiro
 * (PATCH → anulada) e só depois se remove. Assim uma fatura ativa nunca
 * desaparece por engano. As falhas na numeração sequencial são aceitáveis
 * apenas para linhas anuladas (a integridade da sequência fiscal mantém-se: o
 * número já estava fora de circulação antes de a linha ser removida).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const invoice = await getInvoice(id);
    if (!invoice) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    if (invoice.status !== "anulada") {
      return NextResponse.json(
        { error: "Só é possível apagar faturas anuladas. Anule a fatura primeiro." },
        { status: 409 },
      );
    }
    await deleteInvoice(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("faturas DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
