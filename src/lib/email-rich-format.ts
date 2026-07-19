/**
 * Document model + injection-safe serializer for the visual ("WYSIWYG") email
 * editor in the back office ("Modelos de email").
 *
 * WHY A MODEL: a non-technical operator composes the email visually and never
 * sees markup. We NEVER persist the raw HTML a `contentEditable` produces.
 * Instead the editor's DOM is read into a small, controlled document model
 * ({@link RichDoc}) — a whitelist of block/inline shapes we understand — and the
 * outgoing email HTML is BUILT from that model, escaping every piece of text and
 * emitting only a fixed set of tags/inline-styles we control. So the output is
 * injection-safe *by construction*: crafted input (`<script>`, stray `<`, `"`…)
 * can only ever become escaped text inside a whitelisted tag.
 *
 * STORAGE: like the "modo simples" marker, a visual body is prefixed with a
 * hidden marker comment `<!-- liquen:rich:v1:<base64(JSON)> -->` holding the
 * exact model. base64 uses only `[A-Za-z0-9+/=]`, so the payload can never
 * contain `-->` (which would break the comment) nor `{` (so the send path's
 * `{key}` replacement never touches it). Re-opening restores the model exactly.
 *
 * SEND PATH: unchanged. `{token}` placeholders survive verbatim into the output
 * (`esc` never escapes braces), so `renderTemplate` still substitutes them and
 * HTML-escapes the values. {@link renderPreview} mirrors that for the preview.
 *
 * CLIENT-SAFE: no `server-only`, no `*-store.ts` value import. The DOM reader
 * only touches the DOM when handed an element (never at module load), so this
 * module imports cleanly on the server too.
 */

import { esc, toBase64, fromBase64 } from "./email-template-format";

// ── Document model ─────────────────────────────────────────────────────────

/** Horizontal alignment for a block. `left` is the default and never serialized. */
export type RichAlign = "left" | "center" | "right";

/**
 * A styled run of text. Marks are additive; `href` turns the run into a link.
 * `color` is only ever one of the brand palette hexes (validated on the way in
 * and again on the way out). Text may contain `{token}` placeholders and `\n`
 * soft breaks (rendered as `<br>`).
 */
export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** A brand palette hex (see {@link BRAND_TEXT_COLORS}); anything else is dropped. */
  color?: string;
  /** A safe href: `http(s)://…`, `mailto:…`, or a bare `{token}`. */
  href?: string;
}

export type RichBlock =
  | { type: "heading"; align?: RichAlign; runs: RichRun[] }
  | { type: "subheading"; align?: RichAlign; runs: RichRun[] }
  | { type: "paragraph"; align?: RichAlign; runs: RichRun[] }
  | { type: "bullets"; items: RichRun[][] }
  | { type: "numbers"; items: RichRun[][] }
  | { type: "button"; href: string; label: string; align?: RichAlign }
  | { type: "divider" };

export interface RichDoc {
  version: 1;
  blocks: RichBlock[];
}

/** A fresh document with a single empty paragraph — the editor's blank slate. */
export function emptyRichDoc(): RichDoc {
  return { version: 1, blocks: [{ type: "paragraph", runs: [] }] };
}

// ── Brand palette ──────────────────────────────────────────────────────────

/**
 * The small, on-brand text-colour palette offered in the toolbar. The first
 * entry is the default ink and is treated as "no colour" (never serialized),
 * so a run only carries a `color` when it deliberately differs from the body.
 */
export const BRAND_TEXT_COLORS: { label: string; value: string }[] = [
  { label: "Predefinida", value: "#2a2620" },
  { label: "Verde-musgo", value: "#4d6350" },
  { label: "Verde", value: "#637a5f" },
  { label: "Cinza", value: "#6f6a62" },
  { label: "Bordô", value: "#8a2a22" },
];

const DEFAULT_COLOR = "#2a2620";
const COLOR_SET = new Set(BRAND_TEXT_COLORS.map((c) => c.value.toLowerCase()));

/** A colour is kept only if it is a brand palette hex other than the default ink. */
function normalizeColor(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const hex = raw.trim().toLowerCase();
  if (hex === DEFAULT_COLOR) return undefined;
  return COLOR_SET.has(hex) ? hex : undefined;
}

/**
 * Validate an href for safe emission. Allows only absolute `http(s)`/`mailto`
 * URLs and bare merge tokens like `{link}` — everything else (notably
 * `javascript:` / `data:`) is rejected so no active URL can be emitted.
 */
export function safeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const h = raw.trim();
  if (!h) return undefined;
  if (/^\{[a-zA-Z0-9_]+\}$/.test(h)) return h; // a merge token, e.g. {link}
  if (/^https?:\/\/[^\s]+$/i.test(h)) return h;
  if (/^mailto:[^\s]+$/i.test(h)) return h;
  return undefined;
}

// ── Normalization (defensive: never trust a stored/parsed model) ────────────

function normalizeRun(raw: unknown): RichRun | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = typeof r.text === "string" ? r.text : "";
  const run: RichRun = { text };
  if (r.bold) run.bold = true;
  if (r.italic) run.italic = true;
  if (r.underline) run.underline = true;
  const color = normalizeColor(r.color);
  if (color) run.color = color;
  const href = safeHref(r.href);
  if (href) run.href = href;
  return run;
}

/** True when two runs carry identical marks (so their text can be merged). */
function sameMarks(a: RichRun, b: RichRun): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    a.color === b.color &&
    a.href === b.href
  );
}

/** Drop empty runs and merge adjacent runs with identical marks (idempotent). */
function normalizeRuns(raw: unknown): RichRun[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: RichRun[] = [];
  for (const item of list) {
    const run = normalizeRun(item);
    if (!run || run.text === "") continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last, run)) last.text += run.text;
    else out.push(run);
  }
  return out;
}

function normalizeAlign(raw: unknown): RichAlign | undefined {
  return raw === "center" || raw === "right" ? raw : undefined;
}

function normalizeBlock(raw: unknown): RichBlock | null {
  const b = (raw ?? {}) as Record<string, unknown>;
  switch (b.type) {
    case "heading":
    case "subheading":
    case "paragraph": {
      const type = b.type;
      const runs = normalizeRuns(b.runs);
      const align = normalizeAlign(b.align);
      return align ? { type, runs, align } : { type, runs };
    }
    case "bullets":
    case "numbers": {
      const rawItems = Array.isArray(b.items) ? b.items : [];
      const items = rawItems.map((it) => normalizeRuns(it)).filter((it) => it.length > 0);
      if (items.length === 0) return null;
      return { type: b.type, items };
    }
    case "button": {
      const href = safeHref(b.href);
      const label = typeof b.label === "string" ? b.label : "";
      if (!href || !label.trim()) return null;
      const block: RichBlock = { type: "button", href, label };
      const align = normalizeAlign(b.align);
      if (align) block.align = align;
      return block;
    }
    case "divider":
      return { type: "divider" };
    default:
      return null;
  }
}

/**
 * Re-validate an arbitrary value into a trustworthy {@link RichDoc}: unknown
 * block/mark shapes are dropped, colours/hrefs re-checked. Idempotent, so it
 * doubles as the guard applied to both freshly-read and stored models.
 */
export function normalizeDoc(raw: unknown): RichDoc {
  const d = (raw ?? {}) as Record<string, unknown>;
  const rawBlocks = Array.isArray(d.blocks) ? d.blocks : [];
  const blocks = rawBlocks.map(normalizeBlock).filter((b): b is RichBlock => b !== null);
  return { version: 1, blocks };
}

// ── Serializer: model → safe HTML ───────────────────────────────────────────

const S = {
  container:
    "font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2a2620",
  heading: "font-size:20px;line-height:1.3;margin:0 0 12px;color:#1b2119;font-weight:600",
  subheading: "font-size:16px;line-height:1.4;margin:0 0 10px;color:#1b2119;font-weight:600",
  paragraph: "font-size:14px;line-height:1.6;margin:0 0 16px;color:#2a2620",
  list: "font-size:14px;line-height:1.6;margin:0 0 16px;padding-left:22px;color:#2a2620",
  li: "margin:0 0 6px",
  buttonWrap: "margin:0 0 20px",
  button:
    "display:inline-block;background:#4d6350;color:#ffffff;text-decoration:none;" +
    "padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;font-family:inherit",
  divider: "border:none;border-top:1px solid #e5e0d8;margin:20px 0",
  link: "color:#4d6350",
} as const;

/** Append a `text-align` declaration for non-default alignment. */
function withAlign(style: string, align?: RichAlign): string {
  return align === "center" || align === "right" ? `${style};text-align:${align}` : style;
}

/**
 * Escape run text for HTML text context and turn soft breaks into `<br>`.
 * `esc` escapes `& < > "` but never `{`/`}`, so `{token}` survives verbatim.
 */
function runText(text: string): string {
  return esc(text).replace(/\n/g, "<br>");
}

/** Serialize one run, wrapping escaped text in whitelisted mark tags/styles. */
function renderRun(run: RichRun): string {
  let inner = runText(run.text);
  const color = normalizeColor(run.color);
  if (color) inner = `<span style="color:${color}">${inner}</span>`;
  if (run.underline) inner = `<span style="text-decoration:underline">${inner}</span>`;
  if (run.italic) inner = `<em>${inner}</em>`;
  if (run.bold) inner = `<strong>${inner}</strong>`;
  const href = safeHref(run.href);
  if (href) inner = `<a href="${esc(href)}" style="${S.link}">${inner}</a>`;
  return inner;
}

function renderRuns(runs: RichRun[]): string {
  return runs.map(renderRun).join("");
}

interface RenderOpts {
  /** When true, add editor-only hooks (`data-liquen`, `contenteditable=false`). */
  editable?: boolean;
}

function renderBlock(block: RichBlock, opts: RenderOpts): string {
  switch (block.type) {
    case "heading":
      return `<h2 style="${withAlign(S.heading, block.align)}">${renderRuns(block.runs)}</h2>`;
    case "subheading":
      return `<h3 style="${withAlign(S.subheading, block.align)}">${renderRuns(block.runs)}</h3>`;
    case "paragraph":
      return `<p style="${withAlign(S.paragraph, block.align)}">${renderRuns(block.runs)}</p>`;
    case "bullets":
    case "numbers": {
      const tag = block.type === "numbers" ? "ol" : "ul";
      const items = block.items
        .map((runs) => `<li style="${S.li}">${renderRuns(runs)}</li>`)
        .join("");
      return `<${tag} style="${S.list}">${items}</${tag}>`;
    }
    case "button": {
      const href = safeHref(block.href) ?? "#";
      const wrapAttr = opts.editable ? ` data-liquen="button"` : "";
      const aAttr = opts.editable ? ` contenteditable="false"` : "";
      return (
        `<div style="${withAlign(S.buttonWrap, block.align)}"${wrapAttr}>` +
        `<a href="${esc(href)}" style="${S.button}"${aAttr}>${esc(block.label)}</a>` +
        `</div>`
      );
    }
    case "divider": {
      const attr = opts.editable ? ` data-liquen="divider" contenteditable="false"` : "";
      return `<hr style="${S.divider}"${attr}>`;
    }
  }
}

/**
 * Render just the block HTML (no marker, no container/footer). This is what the
 * editable region holds; {@link buildRichEmailHtml} wraps it for storage/send.
 */
export function renderRichInnerHtml(doc: RichDoc, opts: RenderOpts = {}): string {
  return normalizeDoc(doc)
    .blocks.map((b) => renderBlock(b, opts))
    .join("\n");
}

/**
 * Build the full stored/sent email HTML from the model: a hidden `rich` marker
 * carrying the exact model, then the on-brand container with the blocks and the
 * shared footer. Deterministic, so re-opening a template is not falsely "dirty".
 */
export function buildRichEmailHtml(doc: RichDoc): string {
  const normalized = normalizeDoc(doc);
  const marker = `<!-- liquen:rich:v1:${toBase64(JSON.stringify(normalized))} -->`;
  const body = normalized.blocks.map((b) => renderBlock(b, {})).join("\n");
  return [
    marker,
    `<div style="${S.container}">`,
    body,
    `  <hr style="border:none;border-top:1px solid #eee;margin:20px 0 12px">`,
    `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Évora, Alentejo</p>`,
    `</div>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

// ── Marker detection / extraction ────────────────────────────────────────────

const RICH_MARKER_RE = /<!--\s*liquen:rich:v1:([A-Za-z0-9+/=]*)\s*-->/;

/** True when `body` was produced by {@link buildRichEmailHtml} (visual mode). */
export function isRichBody(body: string): boolean {
  return RICH_MARKER_RE.test(body);
}

/**
 * Recover the exact document model from a visual-mode body, or `null` for a
 * simple/hand-written template. The parsed payload is re-normalized, so a
 * tampered marker can never smuggle unknown shapes, bad colours or unsafe hrefs
 * into the model (and thus never into the emitted HTML).
 */
export function extractRichDoc(body: string): RichDoc | null {
  const m = body.match(RICH_MARKER_RE);
  if (!m) return null;
  try {
    return normalizeDoc(JSON.parse(fromBase64(m[1])));
  } catch {
    return null;
  }
}

/**
 * Build a document from plain paragraph text (blank-line separated), used to
 * open an older "modo simples" template in the visual editor. Single newlines
 * become soft breaks; merge tokens are preserved as text.
 */
export function docFromPlainText(text: string): RichDoc {
  const paragraphs = text
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/^\n+|\n+$/g, "").trim())
    .filter((p) => p.length > 0);
  const blocks: RichBlock[] = paragraphs.map((p) => ({
    type: "paragraph",
    runs: [{ text: p }],
  }));
  return normalizeDoc({ version: 1, blocks: blocks.length ? blocks : emptyRichDoc().blocks });
}

// ── DOM reader: contentEditable → model (the "never trust the DOM" boundary) ──
//
// Reading the editor's DOM into the model is what guarantees we never store
// arbitrary user markup: we only ever EXTRACT recognized structure + text into
// the model, then re-BUILD the HTML from it. Anything unrecognized contributes
// only its text.

type Marks = Omit<RichRun, "text">;

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "HR"]);

/** Parse an `rgb(...)`/hex colour string to a lowercase `#rrggbb` hex, or null. */
function toHex(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return "#" + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("");
}

/** Derive the marks contributed by an element, layered over inherited marks. */
function marksFrom(el: Element, base: Marks): Marks {
  const marks: Marks = { ...base };
  const tag = el.tagName;
  if (tag === "B" || tag === "STRONG") marks.bold = true;
  if (tag === "I" || tag === "EM") marks.italic = true;
  if (tag === "U") marks.underline = true;
  if (tag === "A") {
    const href = safeHref(el.getAttribute("href") ?? "");
    if (href) marks.href = href;
  }
  if (tag === "FONT") {
    const color = normalizeColor(toHex(el.getAttribute("color") ?? "") ?? "");
    if (color) marks.color = color;
  }
  const style = (el as HTMLElement).style;
  if (style) {
    const fw = style.fontWeight;
    if (fw === "bold" || fw === "bolder" || Number(fw) >= 600) marks.bold = true;
    if (style.fontStyle === "italic") marks.italic = true;
    const deco = style.textDecoration || style.textDecorationLine;
    if (deco && /underline/.test(deco)) marks.underline = true;
    if (style.color) {
      const color = normalizeColor(toHex(style.color) ?? "");
      if (color) marks.color = color;
    }
  }
  return marks;
}

function pushRun(out: RichRun[], text: string, marks: Marks): void {
  if (text === "") return;
  out.push({ ...marks, text });
}

/** Walk an inline subtree, accumulating styled runs (with `\n` for `<br>`). */
function readInline(node: Node, marks: Marks, out: RichRun[]): void {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    pushRun(out, node.textContent ?? "", marks);
    return;
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
  const el = node as Element;
  if (el.tagName === "BR") {
    out.push({ text: "\n" });
    return;
  }
  const childMarks = marksFrom(el, marks);
  el.childNodes.forEach((child) => readInline(child, childMarks, out));
}

function readInlineChildren(el: Element): RichRun[] {
  const out: RichRun[] = [];
  el.childNodes.forEach((child) => readInline(child, {}, out));
  return out;
}

function readAlign(el: Element): RichAlign | undefined {
  const a = ((el as HTMLElement).style?.textAlign || el.getAttribute("align") || "").toLowerCase();
  return a === "center" || a === "right" ? a : undefined;
}

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some(
    (c) => BLOCK_TAGS.has(c.tagName) || c.getAttribute("data-liquen") === "button",
  );
}

function readButton(el: Element): RichBlock | null {
  const anchor = el.tagName === "A" ? el : el.querySelector("a");
  const href = safeHref(anchor?.getAttribute("href") ?? "");
  const label = (el.textContent ?? "").trim();
  if (!href || !label) return null;
  const block: RichBlock = { type: "button", href, label };
  const align = readAlign(el);
  if (align) block.align = align;
  return block;
}

/** Text blocks (heading/subheading/paragraph) — the ones that carry alignment. */
type TextBlock = Extract<RichBlock, { runs: RichRun[] }>;

function withAlignBlock(block: TextBlock, el: Element): TextBlock {
  const align = readAlign(el);
  return align ? { ...block, align } : block;
}

/** Read a node list into blocks, buffering loose inline content into paragraphs. */
function readBlocks(nodes: NodeListOf<ChildNode> | ChildNode[]): RichBlock[] {
  const blocks: RichBlock[] = [];
  let pending: RichRun[] | null = null;
  const flush = () => {
    if (pending) {
      blocks.push({ type: "paragraph", runs: pending });
      pending = null;
    }
  };
  const list = Array.from(nodes);
  for (const node of list) {
    if (node.nodeType === 3 /* TEXT */) {
      const text = node.textContent ?? "";
      if (text.trim() === "" && !pending) continue; // ignore whitespace between blocks
      pending ??= [];
      readInline(node, {}, pending);
      continue;
    }
    if (node.nodeType !== 1 /* ELEMENT */) continue;
    const el = node as Element;

    if (el.getAttribute("data-liquen") === "button") {
      const btn = readButton(el);
      flush();
      if (btn) blocks.push(btn);
      continue;
    }
    const tag = el.tagName;
    if (tag === "HR") {
      flush();
      blocks.push({ type: "divider" });
      continue;
    }
    if (tag === "UL" || tag === "OL") {
      flush();
      const items = Array.from(el.children)
        .filter((c) => c.tagName === "LI")
        .map((li) => readInlineChildren(li))
        .filter((runs) => runs.length > 0);
      if (items.length) blocks.push({ type: tag === "OL" ? "numbers" : "bullets", items });
      continue;
    }
    if (tag === "H1" || tag === "H2") {
      flush();
      blocks.push(withAlignBlock({ type: "heading", runs: readInlineChildren(el) }, el));
      continue;
    }
    if (tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6") {
      flush();
      blocks.push(withAlignBlock({ type: "subheading", runs: readInlineChildren(el) }, el));
      continue;
    }
    if (tag === "P" || tag === "DIV") {
      flush();
      if (hasBlockChild(el)) {
        blocks.push(...readBlocks(el.childNodes));
      } else {
        blocks.push(withAlignBlock({ type: "paragraph", runs: readInlineChildren(el) }, el));
      }
      continue;
    }
    // Any other (inline) element at this level → buffer as loose paragraph text.
    pending ??= [];
    readInline(el, {}, pending);
  }
  flush();
  return blocks;
}

/**
 * Read a `contentEditable` root element into a normalized {@link RichDoc}. This
 * is the safety boundary: only recognized structure and escaped text ever make
 * it into the model, so the rebuilt HTML can never carry arbitrary user markup.
 */
export function readDocFromEditor(root: Element): RichDoc {
  const doc = normalizeDoc({ version: 1, blocks: readBlocks(root.childNodes) });
  // Keep at least one editable block so the editor never collapses to nothing.
  if (doc.blocks.length === 0) return emptyRichDoc();
  return doc;
}
