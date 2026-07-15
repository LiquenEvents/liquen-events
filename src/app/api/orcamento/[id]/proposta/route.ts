import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Proposal } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { createProposal, listProposalsForQuote } from "@/lib/proposals-store";
import { renderProposalPdf } from "@/lib/proposal-pdf";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { createProposalToken } from "@/lib/proposal-token";
import { isAuthed } from "@/lib/admin-auth";
import { proposalCreateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  return isAuthed(request);
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

// List existing proposals for a quote (admin)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const proposals = await listProposalsForQuote(id);
    return NextResponse.json(proposals);
  } catch (err) {
    log.error("proposta GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Create + send a proposal as a PDF emailed to the client
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = proposalCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const lineItems = parsed.data.lineItems.filter((it) => it.description && it.qty > 0);

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "A proposta precisa de pelo menos uma linha válida." },
        { status: 400 },
      );
    }

    const vatRate = parsed.data.vatRate ?? 0.23;
    const subtotal = lineItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const vat = subtotal * vatRate;
    const total = subtotal + vat;

    const proposal: Proposal = {
      id: randomUUID(),
      quoteId: id,
      clientName: quote.name,
      clientEmail: quote.email,
      currency: "EUR",
      lineItems,
      vatRate,
      subtotal,
      vat,
      total,
      validUntil: parsed.data.validUntil || undefined,
      notes: parsed.data.notes || undefined,
      status: "enviada",
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
    };

    // Event metadata for the PDF header
    const eventType =
      quote.category && quote.eventType
        ? (EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)?.label ??
          CATEGORIES.find((c) => c.id === quote.category)?.label)
        : CATEGORIES.find((c) => c.id === quote.category)?.label;

    const pdfBytes = await renderProposalPdf(proposal, {
      eventType,
      date: quote.date,
      guests: quote.guests,
      location: quote.location,
    });
    const pdfBuffer = Buffer.from(pdfBytes);

    // Signed link so the client can accept/decline the proposal online.
    const acceptUrl = `${SITE.url}/proposta/${createProposalToken(proposal.id)}`;

    // Email the client with the PDF attached.
    const clientHtml = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="font-size:18px;margin:0 0 12px">A sua proposta — Líquen Events</h2>
      <p style="font-size:14px;line-height:1.6;color:#333">Olá ${esc(quote.name)},</p>
      <p style="font-size:14px;line-height:1.6;color:#333">
        Obrigado pelo seu interesse. Segue em anexo a proposta personalizada para o seu evento,
        no valor total de <strong style="color:#7c854b">${eur(total)}</strong> (IVA incluído).
      </p>
      ${proposal.validUntil ? `<p style="font-size:13px;color:#777">Válida até ${esc(new Date(proposal.validUntil + "T12:00:00").toLocaleDateString("pt-PT"))}.</p>` : ""}
      <p style="margin:24px 0">
        <a href="${acceptUrl}" style="display:inline-block;background:#7c854b;color:#f5f3ee;text-decoration:none;padding:13px 28px;border-radius:4px;font-size:13px;letter-spacing:0.06em">Ver e responder à proposta online →</a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#333">
        Ficamos ao dispor para qualquer questão ou ajuste. Será um prazer criar este momento consigo.
      </p>
      <p style="font-size:13px;color:#777;margin-top:20px">
        Líquen Events · ${esc(MAIL_TO)} · ${SITE.phoneDisplay}
      </p>
    </div>`;

    // Persist the proposal BEFORE emailing. The email carries a signed accept
    // link; sending it before the proposal exists means that link 404s the moment
    // the client clicks "accept". A persistence failure here is fatal — we do not
    // send an un-acceptable proposal.
    try {
      await createProposal(proposal);
    } catch (e) {
      log.error("guardar proposta falhou", e, { id });
      return NextResponse.json(
        { error: "Não foi possível guardar a proposta. Tente novamente." },
        { status: 503 },
      );
    }

    const mail = await sendMail({
      to: quote.email,
      replyTo: MAIL_TO,
      subject: `Proposta para o seu evento — Líquen Events (${proposal.id.slice(0, 8)})`,
      html: clientHtml,
      attachments: [
        {
          filename: `Proposta-Liquen-${id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    // Advance the quote status (best-effort — the proposal is already saved & sent).
    try {
      await updateQuote(id, { status: "cotado", quotedPrice: total });
    } catch (e) {
      log.error("actualizar pedido falhou", e);
    }

    return NextResponse.json({
      ok: true,
      id: proposal.id,
      total,
      emailed: mail.sent,
      pdfBase64: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    log.error("proposta POST falhou", err);
    return NextResponse.json({ error: "Erro ao gerar a proposta" }, { status: 500 });
  }
}
