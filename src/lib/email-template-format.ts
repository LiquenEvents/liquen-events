/**
 * Client-safe helpers for the "Modelos de email" editor.
 *
 * IMPORTANT: no `server-only` import — this module is bundled into the
 * back-office client component. It carries no secrets and only manipulates
 * template strings.
 *
 * The back office lets a non-technical operator edit transactional emails in a
 * plain-language "modo simples" (paragraphs separated by blank lines) while an
 * "HTML avançado" mode stays available for hand-written templates. Both modes
 * ultimately store the SAME thing the send path already expects: an HTML `body`
 * with `{merge}` placeholders. Simple-mode bodies additionally carry a hidden
 * marker comment holding the exact plain text, so the editor can re-open them
 * losslessly without ever guessing text back out of HTML.
 *
 * The send path (`renderTemplate` in `email-templates-store.ts`) is unchanged:
 * it replaces every `{key}` and HTML-escapes the value. {@link renderPreview}
 * mirrors that exactly so the live preview matches the real email.
 */

/** Friendly example values used to fill merge fields in the live preview. */
export const EXAMPLE_VARS: Record<string, string> = {
  nome: "Maria Silva",
  link: "https://liquenevents.pt/proposta/exemplo",
  valor: "14.500 €",
  data_evento: "12 de setembro de 2026",
  local: "Herdade da Malhadinha, Alentejo",
  empresa: "Líquen Events",
};

/**
 * HTML-escape a value. Mirrors `esc` in `src/lib/mail.ts` byte-for-byte so the
 * preview renders identically to what the server sends.
 */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Resolve `{key}` placeholders against `vars`, mirroring `renderTemplate`:
 * every placeholder is replaced, missing keys become empty strings, and values
 * are HTML-escaped. Used to render both the subject and the body in the preview.
 */
export function renderPreview(source: string, vars: Record<string, string> = EXAMPLE_VARS): string {
  return source.replace(/\{(\w+)\}/g, (_m, key: string) => (key in vars ? esc(vars[key]) : ""));
}

// ── Simple ⇄ HTML ─────────────────────────────────────────────────────────
//
// A simple-mode body starts with an HTML comment marker whose payload is the
// base64 of the operator's exact plain text. base64 uses only [A-Za-z0-9+/=]
// so it can never contain `-->` (breaking the comment) nor `{` (so the send
// path's `{key}` replacement leaves it untouched inside the invisible comment).

const MARKER_RE = /<!--\s*liquen:simple:v1:([A-Za-z0-9+/=]*)\s*-->/;

/** UTF-8 → base64. Uses only web-standard globals (works in Node 18+ and browsers). */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** base64 → UTF-8. */
function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** True when `body` was produced by {@link buildSimpleEmailHtml} (i.e. modo simples). */
export function isSimpleBody(body: string): boolean {
  return MARKER_RE.test(body);
}

/**
 * Recover the exact plain text a simple-mode body was built from, or `null`
 * when `body` is a hand-written (advanced) template. Lossless: the text is read
 * back from the marker payload, never reverse-engineered from the HTML.
 */
export function extractSimpleText(body: string): string | null {
  const m = body.match(MARKER_RE);
  if (!m) return null;
  try {
    return fromBase64(m[1]);
  } catch {
    return null;
  }
}

/** Split plain text into paragraph blocks on blank lines. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/^\n+|\n+$/g, "").trim())
    .filter((p) => p.length > 0);
}

/** Escape one paragraph, turn single newlines into `<br>`, and linkify `{link}`. */
function paragraphHtml(raw: string): string {
  const escaped = esc(raw).replace(/\n/g, "<br>");
  // Make a `{link}` token clickable and on-brand; the send path still resolves
  // the `{link}` in both the href and the visible text.
  return escaped.replace(/\{link\}/g, '<a href="{link}" style="color:#637a5f">{link}</a>');
}

/**
 * Wrap plain text (paragraphs by blank lines) in the on-brand email HTML the
 * rest of the product uses, prefixed with a hidden marker holding the source
 * text. `{merge}` tokens are preserved verbatim for the send path.
 */
export function buildSimpleEmailHtml(text: string): string {
  const marker = `<!-- liquen:simple:v1:${toBase64(text)} -->`;
  const paragraphs = splitParagraphs(text)
    .map(
      (p) =>
        `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#2a2620">${paragraphHtml(p)}</p>`,
    )
    .join("\n");
  return [
    marker,
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2a2620">`,
    paragraphs,
    `  <hr style="border:none;border-top:1px solid #eee;margin:20px 0 12px">`,
    `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Évora, Alentejo</p>`,
    `</div>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Best-effort plain text from arbitrary HTML — only used when an operator
 * deliberately converts a hand-written template into modo simples. Never called
 * on the send path; the original HTML is only replaced after an explicit
 * confirmation in the UI.
 */
export function htmlToPlainText(html: string): string {
  // Turn line-break / block-closing tags into newlines up front.
  let s = html
    .replace(MARKER_RE, "")
    .replace(/<\s*(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n\n");
  // Decode the handful of entities we emit — `&amp;` LAST so `&amp;lt;`
  // stays the literal text `&lt;` instead of collapsing to a real `<`.
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  // Remove every `<…>` span by scanning, NOT by a "strip the tag" regex.
  // Walking `<` → next `>` can't be defeated by nested/overlapping sequences
  // the way a single global regex can (e.g. `<scr<script>ipt>`), and it leaves
  // no markup behind — this is plain text for a textarea, never HTML.
  s = stripAngleSpans(s);
  // Belt-and-braces: drop any stray angle bracket (e.g. a lone `>` with no
  // preceding `<`) so the result is guaranteed to contain no `<` or `>`.
  s = s.replace(/[<>]/g, "");
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Remove every `<…>` span, including an unclosed trailing `<…`, by scanning
 * for the next `<` and skipping to its matching `>`. Deliberately NOT a regex:
 * a character scan can't be bypassed by crafted/overlapping tags, so the
 * output is guaranteed free of angle-bracket markup.
 */
function stripAngleSpans(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const lt = input.indexOf("<", i);
    if (lt === -1) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, lt);
    const gt = input.indexOf(">", lt + 1);
    if (gt === -1) break; // unclosed tag: drop the remainder
    i = gt + 1;
  }
  return out;
}

/**
 * Pure text-insertion used by the merge-field buttons: splice `token` into
 * `value` over the `[start, end)` selection and report the new caret position.
 */
export function insertToken(
  value: string,
  start: number,
  end: number,
  token: string,
): { text: string; caret: number } {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  const text = value.slice(0, s) + token + value.slice(e);
  return { text, caret: s + token.length };
}
