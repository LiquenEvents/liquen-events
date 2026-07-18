import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { readProposalToken } from "@/lib/proposal-token";
import { getProposal, updateProposal } from "@/lib/proposals-store";
import { updateQuoteWith } from "@/lib/quotes-store";
import { createContractIfAbsent, newContractId } from "@/lib/contracts-store";
import { TERMS_VERSION, DEFAULT_TERMS, termsToPlainText } from "@/lib/contract-terms";
import {
  createInvoice,
  newInvoiceId,
  nextInvoiceNumber,
  splitThirtySeventy,
} from "@/lib/invoices-store";
import { buildProductionPlanItems } from "@/lib/production-templates";
import { checklistTemplate } from "@/lib/checklist-templates";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { sendPushToAll } from "@/lib/push";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { eur } from "@/lib/money";

export const runtime = "nodejs";

/**
 * Public endpoint for a client to accept or decline a proposal via the signed
 * link in their email. No login: the HMAC token (lib/proposal-token) is the
 * authorisation — it can only ever target the proposal it was minted for, so
 * there's no enumeration and nothing to forge. Idempotent: a second response
 * just returns the recorded one.
 */
export async function POST(request: NextRequest) {
  try {
    sweep();
    const limited = await rateLimit(`proposta:${clientIp(request)}`, 10, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Demasiados pedidos. Tente novamente dentro de momentos." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter ?? 60) } },
      );
    }

    const body = await request.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token : "";
    const action = body?.action === "aceitar" || body?.action === "recusar" ? body.action : null;
    if (!token || !action) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const claim = readProposalToken(token);
    if (!claim) {
      return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 401 });
    }

    const proposal = await getProposal(claim.proposalId);
    if (!proposal) {
      return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
    }

    // Idempotent: if already answered, report the recorded decision.
    if (proposal.status === "aceite" || proposal.status === "rejeitada") {
      return NextResponse.json({ ok: true, status: proposal.status, already: true });
    }

    // Effective revocation: only a live, still-open proposal can be answered.
    // A signed link lives in the client's inbox for 14 days and is forwardable,
    // so without this a draft (never really offered) or one the team superseded/
    // withdrew in the back office (status moved off "enviada") could still be
    // accepted at a stale price. Reject anything that isn't currently "enviada".
    if (proposal.status !== "enviada") {
      return NextResponse.json(
        { error: "Esta proposta já não está disponível. Contacte-nos para uma atualizada." },
        { status: 409 },
      );
    }
    // Honour the proposal's own validity date — an expired offer is not bindable.
    if (proposal.validUntil && Date.parse(proposal.validUntil) < Date.now()) {
      return NextResponse.json(
        { error: "Esta proposta expirou. Contacte-nos para uma atualizada." },
        { status: 410 },
      );
    }

    const accepted = action === "aceitar";
    // Accepting is a binding commitment, so it must carry an explicit agreement
    // to the Termos & Condições plus the name of who is accepting (the signature
    // recorded in the contract). Declining requires neither.
    const acceptedName = typeof body?.acceptedName === "string" ? body.acceptedName.trim() : "";
    if (accepted && (body?.acceptedTerms !== true || !acceptedName)) {
      return NextResponse.json({ error: "É necessário aceitar as condições." }, { status: 400 });
    }

    const newStatus = accepted ? "aceite" : "rejeitada";
    const respondedAt = new Date().toISOString();
    await updateProposal(proposal.id, { status: newStatus, respondedAt });
    // Advance the linked quote in the pipeline, recording the client's
    // decision in its activity log (the team's audit trail).
    try {
      const entry = {
        id: randomBytes(4).toString("hex"),
        at: respondedAt,
        kind: "status_change" as const,
        actor: proposal.clientName,
        summary: accepted
          ? `Proposta aceite pelo cliente (${eur(proposal.total)})`
          : "Proposta recusada pelo cliente",
      };
      // Append on top of the freshly-read quote (with optimistic-locking retry)
      // so a simultaneous edit in the back office can't drop this log entry.
      await updateQuoteWith(proposal.quoteId, (quote) => ({
        ...quote,
        status: accepted ? "aceite" : "rejeitado",
        activityLog: [...(quote.activityLog ?? []), entry],
      }));
    } catch (e) {
      log.error("proposta: atualizar pedido falhou", e, { id: proposal.quoteId });
    }

    // On acceptance, record the contract (terms agreement) and auto-emit the 30%
    // sinal invoice into the ledger. Best-effort and fully wrapped: this must
    // NEVER block or fail the client's confirmation — if it throws, the proposal
    // is still accepted and the team can reconcile from the back office. Idempotent
    // via the per-proposal contract: a second accept (or a retry) neither
    // duplicates the contract nor the invoice.
    if (accepted) {
      try {
        // O CONTRATO é o lock do aceite: tentamos criá-lo primeiro e só emitimos
        // o sinal se fomos NÓS a criá-lo. `createContractIfAbsent` mantém o
        // caminho rápido (getContractByProposal) e, além disso, trata um conflito
        // do índice único `contracts_proposal_id_uk` como "já aceite" — fechando
        // a janela TOCTOU em que dois aceites concorrentes criariam 2 contratos +
        // 2 sinais. `created:false` ⇒ outro aceite já tratou de tudo, não emitimos.
        const { created } = await createContractIfAbsent({
          id: newContractId(),
          quoteId: proposal.quoteId,
          proposalId: proposal.id,
          clientName: proposal.clientName,
          clientEmail: proposal.clientEmail,
          termsVersion: TERMS_VERSION,
          termsSnapshot: termsToPlainText(DEFAULT_TERMS),
          status: "aceite",
          createdAt: respondedAt,
          acceptedAt: respondedAt,
          acceptedName,
          acceptedIp: clientIp(request),
        });
        if (created) {
          // 30% sinal — confirms the reservation of the date.
          const { sinal } = splitThirtySeventy(proposal.total);
          const invoiceNumber = await nextInvoiceNumber();
          await createInvoice({
            id: newInvoiceId(),
            number: invoiceNumber,
            quoteId: proposal.quoteId,
            clientName: proposal.clientName,
            clientEmail: proposal.clientEmail,
            kind: "sinal",
            amount: sinal,
            vatRate: 0.23,
            issuedAt: new Date().toISOString().slice(0, 10),
            status: "emitida",
            note: "Sinal 30% — reserva de data (aceitação da proposta)",
          });

          // Leave a trace in the quote's audit trail (separate from the client's
          // status_change entry above) so the team sees the contract + invoice.
          try {
            const entry = {
              id: randomBytes(4).toString("hex"),
              at: respondedAt,
              kind: "note_added" as const,
              actor: acceptedName,
              summary: `Termos aceites (v${TERMS_VERSION}) · fatura de sinal ${invoiceNumber} emitida (${eur(sinal)})`,
            };
            await updateQuoteWith(proposal.quoteId, (quote) => ({
              ...quote,
              activityLog: [...(quote.activityLog ?? []), entry],
            }));
          } catch (e) {
            log.error("proposta: registo de atividade do contrato falhou", e, {
              id: proposal.quoteId,
            });
          }
        }
      } catch (e) {
        log.error("proposta: contrato/fatura de sinal falhou", e, { id: proposal.id });
      }
    }

    // Auto-seed do lado da produção. Quando o cliente aceita, o separador Produção
    // arrancava vazio e a equipa reconstruía tudo à mão de cada vez. Aqui pré-
    // preenchemos o plano de produção decor e a checklist do evento a partir dos
    // mesmos templates que a UI usa (production-templates / checklist-templates),
    // para um seed-servidor == seed-UI. Passo SIBLING do contrato/sinal: best-effort
    // e totalmente isolado (try/catch próprio) — nunca bloqueia nem falha a
    // confirmação do cliente. Idempotente: só preenche campos vazios, por isso um
    // retry (ou um segundo aceite) não volta a semear nem duplica itens.
    if (accepted) {
      try {
        // Uma única mutação read-modify-write: lê o estado FRESCO do pedido lá
        // dentro e só toca nos campos ainda vazios, para não pisar a mutação do
        // status/contrato acima (que corre antes). Acrescenta UMA entrada de
        // atividade a resumir o que foi semeado; se não houver nada a semear,
        // devolve o pedido intacto (sem alteração, sem entrada).
        await updateQuoteWith(proposal.quoteId, (quote) => {
          const seededParts: string[] = [];

          // 1) Plano de produção decor (campo próprio `productionPlan`). Nunca
          //    sobrepõe um plano já existente — só semeia quando ausente/vazio.
          let productionPlan = quote.productionPlan;
          if (!productionPlan?.length) {
            productionPlan = buildProductionPlanItems(() => randomBytes(4).toString("hex"));
            seededParts.push(`plano de produção decor (${productionPlan.length} tarefas)`);
          }

          // 2) Checklist do evento (campo separado `checklist`, template canónico
          //    por categoria). Só semeia se estiver vazia.
          let checklist = quote.checklist;
          if (!checklist?.length) {
            checklist = checklistTemplate(quote.category).map((label) => ({
              id: randomBytes(4).toString("hex"),
              label,
              done: false,
            }));
            seededParts.push(`checklist do evento (${checklist.length} itens)`);
          }

          // 3) Fornecedores: a proposta não expõe uma lista estruturada de
          //    categorias que mapeie para EventSupplier (só line items em texto
          //    livre), por isso NÃO pré-criamos fornecedores — seria adivinhar.

          // Nada a semear (já tinha tudo): idempotente, devolve intacto.
          if (seededParts.length === 0) return quote;

          const entry = {
            id: randomBytes(4).toString("hex"),
            at: respondedAt,
            kind: "note_added" as const,
            actor: "Sistema",
            summary: `Produção pré-preenchida no aceite: ${seededParts.join(" · ")}`,
          };
          return {
            ...quote,
            productionPlan,
            checklist,
            activityLog: [...(quote.activityLog ?? []), entry],
          };
        });
      } catch (e) {
        log.error("proposta: seed do plano de produção falhou", e, { id: proposal.quoteId });
      }
    }

    // Notify the team (best-effort — never block the client's confirmation).
    const verb = accepted ? "ACEITE ✓" : "recusada";
    try {
      await sendPushToAll({
        title: `Proposta ${verb}`,
        body: `${proposal.clientName} · ${eur(proposal.total)}`,
        url: "/orcamento/admin",
        tag: "proposta-resposta",
      });
    } catch (e) {
      log.error("proposta: push falhou", e);
    }
    try {
      await sendMail({
        to: MAIL_TO,
        subject: `Proposta ${verb} — ${proposal.clientName}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
          <p style="font-size:15px">O cliente <strong>${esc(proposal.clientName)}</strong> ${
            accepted ? "<strong style='color:#7c854b'>aceitou</strong>" : "recusou"
          } a proposta de <strong>${esc(eur(proposal.total))}</strong>.</p>
          <p style="font-size:13px;color:#777">Ref. ${esc(proposal.quoteId)} · ${new Date().toLocaleString("pt-PT")}</p>
        </div>`,
      });
    } catch (e) {
      log.error("proposta: email falhou", e);
    }

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    log.error("proposta POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
