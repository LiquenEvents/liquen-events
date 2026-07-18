import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import {
  getInvoice,
  updateInvoice,
  listInvoicesForQuote,
  createInvoice,
  newInvoiceId,
  nextInvoiceNumber,
  splitThirtySeventy,
  type Invoice,
} from "@/lib/invoices-store";
import { getProposalByQuote } from "@/lib/proposals-store";
import { round2 } from "@/lib/money";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const VALID_STATUS: Invoice["status"][] = ["emitida", "paga", "anulada"];

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
    // 1. Idempotência: um único saldo por pedido. Se já houver um (mesmo
    //    anulado), não emitimos outro — a equipa reconcilia manualmente.
    const existing = await listInvoicesForQuote(sinal.quoteId);
    if (existing.some((i) => i.kind === "saldo")) return null;

    // 2. Valor do saldo — derivado de forma autoritária. Preferimos o total da
    //    proposta (a fonte de verdade do preço acordado) e o mesmo split 30/70
    //    usado na emissão do sinal; se não houver proposta, derivamos do próprio
    //    sinal (sinal ≈ 30% ⇒ saldo = sinal / 3 × 7).
    const proposal = await getProposalByQuote(sinal.quoteId);
    const amount =
      proposal && proposal.total > 0
        ? splitThirtySeventy(proposal.total).saldo
        : round2((sinal.amount / 3) * 7);

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
      vatRate: 0.23,
      issuedAt,
      dueAt,
      status: "emitida",
      note: "Saldo 70% — remanescente após sinal",
    };
    await createInvoice(saldo);
    return saldo;
  } catch (err) {
    log.error("faturas: emissão automática do saldo falhou", err, { quoteId: sinal.quoteId });
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

    const body = await request.json();
    const patch: Partial<Invoice> = {};

    if ("status" in body) {
      if (!VALID_STATUS.includes(body.status)) {
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      }
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
    const saldo = becamePaid ? await maybeAutoIssueSaldo(updated) : null;

    // Incluímos o saldo criado (quando há) para a UI poder refrescar sem refetch.
    return NextResponse.json(saldo ? { ...updated, saldoAutoIssued: saldo } : updated);
  } catch (err) {
    log.error("faturas PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
