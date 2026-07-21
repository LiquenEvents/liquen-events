import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/admin-auth";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

// `to` is validated (bounded, no header-injection newlines, must contain a real
// address — tolerating a "Name <addr>" form) and the body sizes are capped, so
// a borrowed/compromised admin session can't turn this into an open relay for
// arbitrary bulk mail. It's also rate-limited below.
const replySchema = z.object({
  to: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .refine(
      (v) => !/[\r\n]/.test(v) && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(v),
      "Destinatário inválido",
    ),
  // TODO(qa): `subject` isn't CRLF-guarded like `to`. Not provably exploitable —
  // nodemailer encodes/sanitizes header values so a newline here can't inject a
  // second header — but a defence-in-depth `!/[\r\n]/` refine would mirror `to`.
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1, "Mensagem obrigatória").max(10_000),
});

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Cap send volume even for an authenticated admin.
  sweep();
  const limited = await rateLimit(`inbox-reply:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Demasiadas respostas. Tente novamente dentro de momentos." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter ?? 60) } },
    );
  }

  // Parse the JSON body on its own so a malformed request is a clean 400,
  // never a 500 swallowed by the send/error handler below.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  try {
    const parsed = replySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Destinatário e mensagem são obrigatórios." },
        { status: 400 },
      );
    }
    const { to, message } = parsed.data;
    const subject = parsed.data.subject?.trim() || "Re: o seu e-mail";

    const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p style="font-size:14px;line-height:1.7;color:#222;white-space:pre-wrap">${esc(message)}</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#777;font-size:12px">
        Líquen Events · ${esc(MAIL_TO)} · ${SITE.phoneDisplay}
      </div>
    </div>`;

    const mail = await sendMail({ to, replyTo: MAIL_TO, subject, html, text: message });
    return NextResponse.json({ ok: true, emailed: mail.sent });
  } catch (err) {
    log.error("inbox reply POST falhou", err);
    return NextResponse.json({ error: "Erro ao enviar a resposta." }, { status: 500 });
  }
}
