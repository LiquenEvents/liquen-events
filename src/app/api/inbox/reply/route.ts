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
      // Single recipient only: no CR/LF (header injection) and no comma/semicolon
      // (which would smuggle a recipient list past the "one reply" intent and
      // undermine the anti-bulk-mail guard).
      (v) => !/[\r\n,;]/.test(v) && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(v),
      "Destinatário inválido",
    ),
  // `subject` mirrors `to`'s CRLF guard: nodemailer already encodes header
  // values, but rejecting newlines here is defence-in-depth against header
  // injection and keeps the two header fields consistent.
  subject: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n]/.test(v), "Assunto inválido")
    .optional(),
  message: z.string().trim().min(1, "Mensagem obrigatória").max(10_000),
  // Os identificadores que ligam esta resposta à conversa do cliente: o
  // `messageId` e o `references` da mensagem aberta na caixa. Deliberadamente
  // `unknown` — vêm de um cabeçalho escrito por quem enviou, e é o
  // `cabecalhosDeConversa` que os valida um a um. Um identificador estragado
  // faz perder o encadeamento, nunca o envio: a resposta é o que a pessoa
  // pediu, o resto é acabamento.
  inReplyTo: z.unknown().optional(),
  references: z.unknown().optional(),
});

/**
 * Quantos identificadores cabem no `References`, e o comprimento de cada um.
 * Os mesmos tectos da leitura da caixa (ver `parseReferences` em
 * `src/lib/inbox.ts`) — 998 é o limite de linha do RFC 5322.
 */
const MAX_REFERENCIAS = 50;
const MAX_ID_REFERENCIA = 998;
/** Quantos identificadores CRUS se chegam a olhar (ver `cabecalhosDeConversa`). */
const MAX_BRUTAS = 200;

/**
 * Um Message-ID pronto a entrar num cabeçalho, ou `undefined` se não o for.
 *
 * O `\s` do teste apanha o CR/LF da injecção de cabeçalhos ao mesmo tempo que
 * os identificadores mal formados — a mesma defesa que o `to` e o `subject` já
 * fazem, aqui aplicada a texto que chegou de fora pelo IMAP. Os `<`, `>`, `,` e
 * `;` separam identificadores e por isso não podem viver dentro de um.
 */
function idDeMensagem(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const cru = valor.trim().replace(/^<|>$/g, "");
  // O `+ 2` é o par de `<>` que se volta a pôr.
  if (!cru || cru.length + 2 > MAX_ID_REFERENCIA || /[\s<>,;]/.test(cru)) return undefined;
  return `<${cru}>`;
}

/**
 * Os cabeçalhos que fazem a resposta CONTINUAR a conversa em vez de abrir uma
 * nova na caixa do cliente.
 *
 * `In-Reply-To` é a mensagem a que se responde; `References` é a linhagem toda
 * — o que essa mensagem já trazia, mais ela própria no fim (RFC 5322 §3.6.4).
 * É por estes dois que o Gmail, o Outlook e o telemóvel juntam as mensagens: a
 * resposta enviada sem eles chega na mesma, mas chega SOLTA, e do lado de quem
 * escreveu o histórico fica desfeito em assuntos avulsos.
 *
 * Devolve `{}` quando não há nada a encadear (uma mensagem sem `Message-ID`
 * legível é o caso), para não pôr cabeçalhos vazios no email.
 */
function cabecalhosDeConversa(inReplyTo: unknown, references: unknown): Record<string, string> {
  const emResposta = idDeMensagem(inReplyTo);

  // Tecto ANTES de percorrer, e não só no fim: nada no corpo do pedido limita o
  // tamanho desta lista, e a verificação de repetidos abaixo é quadrática — um
  // `references` com um milhão de entradas prendia a função a comparar strings.
  // Corta-se já pela raiz + linhagem, como em baixo.
  const brutas = Array.isArray(references) ? references : [];
  const anteriores =
    brutas.length <= MAX_BRUTAS ? brutas : [brutas[0], ...brutas.slice(-(MAX_BRUTAS - 1))];

  const cadeia: string[] = [];
  for (const bruto of [...anteriores, inReplyTo]) {
    const id = idDeMensagem(bruto);
    if (id && !cadeia.includes(id)) cadeia.push(id);
  }
  // Corta-se pelo meio e não pelo fim, como na leitura: o que agrupa a conversa
  // é a RAIZ (o primeiro) e a linhagem imediata (os últimos).
  const limitada =
    cadeia.length <= MAX_REFERENCIAS
      ? cadeia
      : [cadeia[0], ...cadeia.slice(-(MAX_REFERENCIAS - 1))];

  const headers: Record<string, string> = {};
  if (emResposta) headers["In-Reply-To"] = emResposta;
  if (limitada.length) headers.References = limitada.join(" ");
  return headers;
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Cap send volume even for an authenticated admin.
  sweep();
  const limited = await rateLimit(`inbox-reply:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Demasiadas respostas. Tenta novamente dentro de momentos." },
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

    const conversa = cabecalhosDeConversa(parsed.data.inReplyTo, parsed.data.references);
    const mail = await sendMail({
      to,
      replyTo: MAIL_TO,
      subject,
      html,
      text: message,
      headers: Object.keys(conversa).length ? conversa : undefined,
    });
    return NextResponse.json({ ok: true, emailed: mail.sent });
  } catch (err) {
    log.error("inbox reply POST falhou", err);
    return NextResponse.json({ error: "Erro ao enviar a resposta." }, { status: 500 });
  }
}
