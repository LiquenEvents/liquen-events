import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { inboxReplySchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const raw = await request.json().catch(() => null);
    const parsed = inboxReplySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const { to, subject, message } = parsed.data;

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
    log.error("[inbox reply POST]", err);
    return NextResponse.json({ error: "Erro ao enviar a resposta." }, { status: 500 });
  }
}
