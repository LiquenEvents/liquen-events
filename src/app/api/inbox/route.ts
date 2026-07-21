import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { imapConfigured, listInbox } from "@/lib/inbox";
import { listLinks } from "@/lib/message-links-store";
import type { InboxItemEnriched } from "@/lib/inbox-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!imapConfigured()) {
    return NextResponse.json({ configured: false, messages: [] });
  }
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 30;
    const q = searchParams.get("q")?.trim() || undefined;
    const beforeRaw = searchParams.get("before");
    const before = beforeRaw ? Number(beforeRaw) : undefined;

    const messages = await listInbox({ limit, q, before });

    // Enrich with the local overlay (CRM links, labels, pin, archive). Purely
    // additive — the existing UI ignores the `link` field — and best-effort: an
    // overlay-store hiccup must never take down the read-only inbox.
    let enriched: InboxItemEnriched[] = messages;
    try {
      const links = await listLinks();
      const byId = new Map(links.map((l) => [l.messageId, l]));
      enriched = messages.map((m) => {
        const link = m.messageId ? byId.get(m.messageId) : undefined;
        return link ? { ...m, link } : m;
      });
    } catch (err) {
      log.warn("inbox GET: falha ao carregar sobreposição local (a devolver sem enriquecimento)", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ configured: true, messages: enriched });
  } catch (err) {
    log.error("inbox GET falhou", err);
    return NextResponse.json(
      { configured: true, messages: [], error: "Não foi possível ligar ao e-mail." },
      { status: 502 },
    );
  }
}
