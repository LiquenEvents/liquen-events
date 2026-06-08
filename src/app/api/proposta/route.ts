import { NextRequest, NextResponse } from "next/server";
import { readProposalToken } from "@/lib/proposal-token";
import { getProposal, updateProposal } from "@/lib/proposals-store";
import { updateQuote } from "@/lib/quotes-store";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { sendPushToAll } from "@/lib/push";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

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
    const limited = rateLimit(`proposta:${clientIp(request)}`, 10, 60_000);
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

    const accepted = action === "aceitar";
    const newStatus = accepted ? "aceite" : "rejeitada";
    const respondedAt = new Date().toISOString();
    await updateProposal(proposal.id, { status: newStatus, respondedAt });
    // Advance the linked quote in the pipeline.
    await updateQuote(proposal.quoteId, { status: accepted ? "aceite" : "rejeitado" }).catch((e) =>
      log.error("proposta: atualizar pedido falhou", e, { id: proposal.quoteId }),
    );

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
