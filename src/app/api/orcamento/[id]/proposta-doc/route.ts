import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Proposal } from "@/lib/orcamento/types";
import { type ProposalDoc, withProposalDefaults } from "@/lib/proposal-doc";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { createProposal } from "@/lib/proposals-store";
import { renderProposalDocPdf } from "@/lib/proposal-doc-pdf";
import { fetchProposalImageBytes } from "@/lib/proposal-storage";
import { createProposalToken } from "@/lib/proposal-token";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/** Best-effort parse of the studio's free-text total ("3.000,00 € + IVA",
 *  "14.700,00 €") into a number for the proposal record + accept notification. */
function parseMoney(text: string | undefined): number {
  if (!text) return 0;
  const m = text.match(/\d[\d.\s]*(?:,\d{1,2})?/);
  if (!m) return 0;
  const norm = m[0].replace(/[.\s]/g, "").replace(",", ".");
  return Number.parseFloat(norm) || 0;
}

/** Replace every image reference (cover + mood boards) with inline base64 so the
 *  storage-agnostic generator can embed them. Missing images are dropped. */
async function resolveImages(doc: ProposalDoc): Promise<ProposalDoc> {
  const toB64 = async (ref: string): Promise<string | null> => {
    const bytes = await fetchProposalImageBytes(ref);
    return bytes ? bytes.toString("base64") : null;
  };
  const cover = (await Promise.all((doc.coverImages ?? []).map(toB64))).filter(
    (s): s is string => !!s,
  );
  const moodBoards = await Promise.all(
    (doc.moodBoards ?? []).map(async (mb) => ({
      ...mb,
      images: (await Promise.all(mb.images.map(toB64))).filter((s): s is string => !!s),
    })),
  );
  return { ...doc, coverImages: cover, moodBoards };
}

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

    const resolved = await resolveImages(doc);
    const pdfBytes = await renderProposalDocPdf(resolved);
    const pdfBuffer = Buffer.from(pdfBytes);

    if (mode === "preview") {
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="proposta-preview.pdf"',
        },
      });
    }

    // ── Send ──
    const total = parseMoney(doc.totalText || doc.totalEstimatedText);
    const proposal: Proposal = {
      id: randomUUID(),
      quoteId: id,
      clientName: doc.clientNames,
      clientEmail: quote.email,
      currency: "EUR",
      lineItems: [],
      vatRate: 0.23,
      subtotal: total,
      vat: 0,
      total,
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

    try {
      await updateQuote(id, { status: "cotado", quotedPrice: total });
    } catch (e) {
      log.error("proposta-doc: actualizar pedido falhou", e);
    }

    return NextResponse.json({ ok: true, id: proposal.id, emailed: mail.sent });
  } catch (err) {
    log.error("proposta-doc POST falhou", err);
    return NextResponse.json({ error: "Erro ao gerar a proposta" }, { status: 500 });
  }
}
