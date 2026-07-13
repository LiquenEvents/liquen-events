import { NextRequest, NextResponse } from "next/server";
import type { QuoteMessage } from "@/lib/orcamento/types";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  return isAuthed(request);
}

// Reply to the client by email, from within the dashboard.
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

    const body = await request.json();
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p style="font-size:14px;line-height:1.7;color:#222;white-space:pre-wrap">${esc(message)}</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#777;font-size:12px">
        Líquen Events · ${esc(MAIL_TO)} · ${SITE.phoneDisplay}<br>
        <span style="color:#999">Organizamos eventos, eternizamos memórias.</span>
      </div>
    </div>`;

    const mail = await sendMail({
      to: quote.email,
      replyTo: MAIL_TO,
      subject: `Líquen Events — sobre o seu pedido (${id})`,
      html,
      text: message,
    });

    const newMessage: QuoteMessage = { at: new Date().toISOString(), body: message };
    const messages = [...(quote.messages ?? []), newMessage];

    const updated = await updateQuote(id, { messages });

    return NextResponse.json({ ok: true, emailed: mail.sent, quote: updated });
  } catch (err) {
    log.error("mensagem POST falhou", err);
    return NextResponse.json({ error: "Erro ao enviar a mensagem" }, { status: 500 });
  }
}
