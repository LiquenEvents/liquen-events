import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim() || "Re: o seu e-mail";
    const message = String(body.message ?? "").trim();

    if (!to || !message) {
      return NextResponse.json({ error: "Destinatário e mensagem são obrigatórios." }, { status: 400 });
    }

    const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p style="font-size:14px;line-height:1.7;color:#222;white-space:pre-wrap">${esc(message)}</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#777;font-size:12px">
        Líquen Events · ${esc(MAIL_TO)} · +351 919 259 820
      </div>
    </div>`;

    const mail = await sendMail({ to, replyTo: MAIL_TO, subject, html, text: message });
    return NextResponse.json({ ok: true, emailed: mail.sent });
  } catch (err) {
    console.error("[inbox reply POST]", err);
    return NextResponse.json({ error: "Erro ao enviar a resposta." }, { status: 500 });
  }
}
