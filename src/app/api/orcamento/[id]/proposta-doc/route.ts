import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Proposal } from "@/lib/orcamento/types";
import {
  type ProposalDoc,
  withProposalDefaults,
  resolveProposalMoney,
  resolveValidUntil,
} from "@/lib/proposal-doc";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { createProposal } from "@/lib/proposals-store";
import { renderStoredProposalDocPdf } from "@/lib/proposal-doc-render";
import { createProposalToken } from "@/lib/proposal-token";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as {
      mode?: "preview" | "send";
      doc?: ProposalDoc;
    } | null;
    const raw = body?.doc;
    const mode = body?.mode === "send" ? "send" : "preview";
    if (!raw || !raw.ref || !raw.clientNames) {
      return NextResponse.json({ error: "Proposta incompleta." }, { status: 400 });
    }
    // Fill the studio's fixed boilerplate (condições, observações, faseamento,
    // cancelamento) + event-token substitution so the UI only sends what varies.
    const doc = withProposalDefaults(raw);

    // Shared pipeline (resolve Storage images → render) — the exact same helper
    // the public portal PDF route uses, so both emit an identical document.
    const pdfBuffer = await renderStoredProposalDocPdf(doc);

    if (mode === "preview") {
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="proposta-preview.pdf"',
        },
      });
    }

    // ── Send ──
    // Resolve o total ESTRUTURADO para um bruto (com IVA) coerente. O
    // `total` guardado é sempre o BRUTO, para que splitThirtySeventy(total)
    // devolva o sinal correto e o invoice-pdf (base = amount/(1+IVA)) fique
    // consistente. Se a proposta dizia "+ IVA", o valor é grossed-up aqui.
    const money = resolveProposalMoney(doc);
    // Validade: honra uma data explícita no doc, senão hoje + validUntilDays
    // (30 por omissão) — o /proposta recusa aceitar uma proposta expirada.
    const validUntil = resolveValidUntil(doc);
    const proposal: Proposal = {
      id: randomUUID(),
      quoteId: id,
      clientName: doc.clientNames,
      clientEmail: quote.email,
      currency: "EUR",
      lineItems: [],
      vatRate: money.vatRate,
      subtotal: money.base,
      vat: money.vat,
      total: money.gross,
      validUntil,
      status: "enviada",
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      doc, // stored with Storage paths so it can be re-opened + edited
    };

    try {
      await createProposal(proposal);
    } catch (e) {
      log.error("proposta-doc: guardar falhou", e, { id });
      return NextResponse.json(
        { error: "Não foi possível guardar a proposta. Tente novamente." },
        { status: 503 },
      );
    }

    const acceptUrl = `${SITE.url}/proposta/${createProposalToken(proposal.id)}`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2a2620">
        <h2 style="font-size:18px;margin:0 0 12px">A sua proposta — Líquen Events</h2>
        <p style="font-size:14px;line-height:1.6">Olá ${esc(doc.clientNames)},</p>
        <p style="font-size:14px;line-height:1.6">Segue em anexo a proposta personalizada para o seu evento. Pode vê-la e responder online através do botão abaixo.</p>
        <p style="margin:24px 0"><a href="${acceptUrl}" style="display:inline-block;background:#637a5f;color:#f7f4ee;text-decoration:none;padding:13px 28px;border-radius:4px;font-size:13px;letter-spacing:0.06em">Ver e responder à proposta →</a></p>
        <p style="font-size:13px;color:#6b665c;margin-top:20px">Líquen Events · ${esc(MAIL_TO)} · ${SITE.phoneDisplay}</p>
      </div>`;
    const text = [
      "A sua proposta — Líquen Events",
      "",
      `Olá ${doc.clientNames},`,
      "",
      "Segue em anexo a proposta personalizada para o seu evento.",
      `Ver e responder online: ${acceptUrl}`,
      "",
      `Líquen Events · ${MAIL_TO} · ${SITE.phoneDisplay}`,
    ].join("\n");

    // A proposta JÁ foi guardada acima. O envio do email é um passo separado: se
    // falhar (SMTP em baixo, credenciais erradas, email do cliente inválido) NÃO
    // pode deitar abaixo a geração inteira com um 500 — senão o utilizador vê
    // "erro", tenta de novo e cria propostas duplicadas. Falhar no email devolve
    // 200 com emailed:false + motivo, para a UI explicar o que aconteceu.
    const hasRecipient = !!quote.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email);
    let emailed = false;
    let emailError: string | undefined;
    if (!hasRecipient) {
      emailError = "O pedido não tem um email de cliente válido.";
    } else {
      try {
        const mail = await sendMail({
          to: quote.email,
          replyTo: MAIL_TO,
          subject: `Proposta para o seu evento — Líquen Events (${proposal.id.slice(0, 8)})`,
          html,
          text,
          attachments: [
            {
              filename: `Proposta-Liquen-${id}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });
        emailed = mail.sent;
        if (!mail.sent) emailError = "Envio de email não configurado.";
      } catch (e) {
        log.error("proposta-doc: envio de email falhou", e, { id });
        emailError = "A proposta foi guardada, mas o email ao cliente falhou.";
      }
    }

    try {
      await updateQuote(id, { status: "cotado", quotedPrice: money.gross });
    } catch (e) {
      log.error("proposta-doc: actualizar pedido falhou", e);
    }

    return NextResponse.json({ ok: true, id: proposal.id, emailed, emailError });
  } catch (err) {
    log.error("proposta-doc POST falhou", err);
    return NextResponse.json({ error: "Erro ao gerar a proposta" }, { status: 500 });
  }
}
