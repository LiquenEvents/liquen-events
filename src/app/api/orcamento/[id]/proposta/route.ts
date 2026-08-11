import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Proposal } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { getQuote, updateQuoteWith } from "@/lib/quotes-store";
import { createProposal, listProposalsForQuote } from "@/lib/proposals-store";
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

    // Lazy-load pdf-lib (large) only when actually rendering a PDF: this route's
    // GET handler lists proposals and never renders one, so the top-level import
    // was dragging pdf-lib into every cold start of the admin polling the list.
    const { renderProposalPdf } = await import("@/lib/proposal-pdf");
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

    // Plain-text alternative for the same email. A multipart/alternative message
    // (html + text) is less likely to be flagged by spam filters and is readable
    // by text-only / screen-reader mail clients — the two highest-value emails
    // (this proposal + the receipt) were HTML-only. Raw values here (no esc):
    // escaping is an HTML concern; plain text takes them verbatim.
    const clientText = [
      "A sua proposta — Líquen Events",
      "",
      `Olá ${quote.name},`,
      "",
      `Obrigado pelo seu interesse. Segue em anexo a proposta personalizada para o seu evento, no valor total de ${eur(total)} (IVA incluído).`,
      proposal.validUntil
        ? `Válida até ${new Date(proposal.validUntil + "T12:00:00").toLocaleDateString("pt-PT")}.`
        : "",
      "",
      `Ver e responder à proposta online: ${acceptUrl}`,
      "",
      "Ficamos ao dispor para qualquer questão ou ajuste. Será um prazer criar este momento consigo.",
      "",
      `Líquen Events · ${MAIL_TO} · ${SITE.phoneDisplay}`,
    ]
      .filter((line) => line !== "")
      .join("\n");

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

    /**
     * ══════════════════════════════════════════════════════════════════════
     * SEM EMAIL, O ENVIO CRIAVA PROPOSTAS FANTASMA
     * ══════════════════════════════════════════════════════════════════════
     *
     * Um pedido criado a partir de um telefonema tem `email: ""`. O servidor
     * de correio recusa um destinatário vazio, o envio atirava, e o `catch` de
     * topo devolvia 500 — mas a proposta JÁ TINHA SIDO GRAVADA, com um
     * identificador novo, e o estado do pedido nunca chegava a avançar.
     *
     * Cada nova tentativa gravava MAIS UMA proposta. Três tentativas eram três
     * propostas «enviada» na lista, no Acompanhamento, nas contagens e na
     * Análise — nenhuma delas enviada a ninguém.
     *
     * Agora sem destinatário não se tenta enviar: a proposta fica gravada (o
     * link continua a servir), o estado avança, e a resposta diz que o email
     * não saiu e porquê. Uma proposta por enviar é um negócio parado; três
     * propostas fantasma são um negócio confuso.
     */
    const temDestinatario = !!quote.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email);
    const mail = temDestinatario
      ? await sendMail({
          to: quote.email,
          replyTo: MAIL_TO,
          subject: `Proposta para o seu evento — Líquen Events (${proposal.id.slice(0, 8)})`,
          html: clientHtml,
          text: clientText,
          attachments: [
            {
              filename: `Proposta-Liquen-${id}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        })
      : { sent: false as const };

    // Advance the quote status (best-effort — the proposal is already saved & sent).
    try {
      // `subtotal` (SEM IVA) e não `total`. Ver a nota extensa na rota irmã
      // proposta-doc: o campo chama-se "Preço final (sem IVA)", quem o escreve
      // à mão escreve-o líquido, e o `contractedAmounts` multiplica-o pela taxa
      // para obter o valor com IVA. Gravar aqui o total inflacionava a margem
      // do evento em cerca de 23%.
      //
      // O ESTADO passa pela decisão única (`@/lib/orcamento/estado-do-pedido`)
      // em vez de ser escrito a seco: escrever "cotado" incondicionalmente
      // fazia recuar um pedido já ganho a quem se reenviasse uma proposta
      // revista. O preço grava-se nos dois casos — ver a nota longa na rota
      // irmã, que tem exactamente o mesmo problema e a mesma solução.
      await updateQuoteWith(id, (actual) => {
        const transicao = transicaoDoPedido({
          acontecimento: "proposta_enviada",
          estadoActual: actual.status,
          detalhe: eur(total),
        });
        return {
          ...actual,
          quotedPrice: subtotal,
          ...(transicao
            ? {
                status: transicao.status,
                activityLog: [...(actual.activityLog ?? []), transicao.entrada],
              }
            : {}),
        };
      });
    } catch (e) {
      log.error("actualizar pedido falhou", e);
    }

    return NextResponse.json({
      ok: true,
      id: proposal.id,
      total,
      emailed: mail.sent,
      ...(temDestinatario
        ? {}
        : {
            emailError:
              "Este pedido não tem email de cliente — a proposta foi gravada e o link continua a " +
              "servir, mas não foi enviada a ninguém. Acrescente o email e reenvie.",
          }),
      pdfBase64: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    log.error("proposta POST falhou", err);
    return NextResponse.json({ error: "Erro ao gerar a proposta" }, { status: 500 });
  }
}
