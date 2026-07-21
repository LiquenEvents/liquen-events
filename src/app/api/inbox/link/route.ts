import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/admin-auth";
import {
  getLink,
  listLinks,
  listLinksForQuote,
  linkToQuote,
  setArchived,
  setPinned,
  toggleLabel,
  upsertLink,
} from "@/lib/message-links-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read/set the LOCAL overlay for an inbox message (keyed by Message-ID): its CRM
 * link, labels, pin, and soft-archive flag. Thin routes over
 * `message-links-store` — none of this touches the mailbox. "Archive" maps to a
 * hide timestamp, never an IMAP delete.
 */

// GET  /api/inbox/link                 → all overlays
// GET  /api/inbox/link?messageId=<id>  → one overlay (or null)
// GET  /api/inbox/link?quoteId=<id>    → overlays linked to a quote
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");
    const quoteId = searchParams.get("quoteId");
    if (messageId) return NextResponse.json({ link: await getLink(messageId) });
    if (quoteId) return NextResponse.json({ links: await listLinksForQuote(quoteId) });
    return NextResponse.json({ links: await listLinks() });
  } catch (err) {
    log.error("inbox link GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

const postSchema = z.object({
  messageId: z.string().trim().min(1).max(998),
  // `null` clears the link; a string sets it; absent leaves it untouched.
  quoteId: z.string().trim().max(200).nullable().optional(),
  proposalId: z.string().trim().max(200).nullable().optional(),
  toggleLabel: z.string().trim().min(1).max(64).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

// POST /api/inbox/link  — apply one or more overlay mutations, return the result.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo do pedido inválido (JSON malformado)." },
      {
        status: 400,
      },
    );
  }
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Pedido inválido (messageId obrigatório)." },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const has = (k: string) =>
    !!raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, k);

  try {
    let link = null;
    if (has("quoteId") || has("proposalId")) {
      // Per the schema contract ("absent leaves it untouched"), only the fields
      // actually present in the body may change; the OTHER link is preserved by
      // carrying its current value forward. `linkToQuote` writes both keys, so
      // passing an absent field as `undefined` would silently clear it.
      const existing = await getLink(d.messageId);
      const quoteId = has("quoteId") ? (d.quoteId ?? undefined) : existing?.quoteId;
      const proposalId = has("proposalId") ? (d.proposalId ?? undefined) : existing?.proposalId;
      link = await linkToQuote(d.messageId, quoteId, proposalId);
    }
    if (d.toggleLabel !== undefined) link = await toggleLabel(d.messageId, d.toggleLabel);
    if (d.pinned !== undefined) link = await setPinned(d.messageId, d.pinned);
    if (d.archived !== undefined) link = await setArchived(d.messageId, d.archived);
    // No mutating field ⇒ ensure a row exists and return it (idempotent touch).
    if (!link) link = (await getLink(d.messageId)) ?? (await upsertLink(d.messageId, {}));
    return NextResponse.json({ ok: true, link });
  } catch (err) {
    log.error("inbox link POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
