import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { computeFollowUps } from "@/lib/followups";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only feed of rule-based follow-ups (proposals gone cold, overdue
 * payments, uncontacted leads, events happening this week). The detection is
 * pure logic in lib/followups.ts; this route just supplies the data + `now`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const [quotes, proposals] = await Promise.all([
      listQuotes().catch(() => []),
      listAllProposals().catch(() => []),
    ]);
    const followUps = computeFollowUps({ quotes, proposals, now: Date.now() });
    return NextResponse.json(followUps);
  } catch (err) {
    log.error("followups GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
