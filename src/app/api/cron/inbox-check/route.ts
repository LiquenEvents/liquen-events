import { NextRequest, NextResponse } from "next/server";
import { imapConfigured, listInbox } from "@/lib/inbox";
import { sendPushToAll } from "@/lib/push";
import { isAuthed } from "@/lib/admin-auth";
import { getState, setState } from "@/lib/app-state";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Polls the team inbox and pushes a notification when new email arrives — so a
 * proposal/lead that comes in by email (not the site form) still reaches the
 * phone/PC. Meant to be hit by a frequent cron (e.g. every few minutes).
 *
 * Dedupe: a persistent marker (lib/app-state — Supabase when configured, so it
 * survives serverless deploys/instances) remembers the highest UID already
 * notified. On the very first run it just records the current top UID (no
 * flood of historical mail); thereafter it only notifies about newer messages.
 *
 * Requires IMAP to be configured (the IMAP_ / SMTP_ env vars). No-ops otherwise.
 * Protected by CRON_SECRET (Bearer); a logged-in admin may trigger it manually.
 * When CRON_SECRET is unset it only runs freely outside production
 * (local/preview convenience) — in production a missing secret fails closed
 * instead of leaving the endpoint wide open (see lib/env.ts).
 */
const MARKER_KEY = "inbox-last-uid";

async function readMarker(): Promise<number | null> {
  const value = await getState<number>(MARKER_KEY);
  return typeof value === "number" ? value : null;
}
async function writeMarker(lastUid: number): Promise<void> {
  await setState(MARKER_KEY, lastUid);
}

function authorized(req: NextRequest): boolean {
  if (isAuthed(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!imapConfigured()) {
    return NextResponse.json({ configured: false, sent: 0 });
  }

  try {
    const items = await listInbox(20);
    if (items.length === 0) return NextResponse.json({ sent: 0, reason: "inbox vazia" });

    const maxUid = Math.max(...items.map((i) => i.uid));
    const lastUid = await readMarker();

    // First run on this server: record the high-water mark, don't notify about
    // mail that was already there before notifications were switched on.
    if (lastUid === null) {
      await writeMarker(maxUid);
      return NextResponse.json({ sent: 0, initialized: maxUid });
    }

    const fresh = items.filter((i) => i.uid > lastUid).sort((a, b) => b.uid - a.uid);

    if (fresh.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const latest = fresh[0];
    const body =
      fresh.length === 1
        ? `${latest.from}: ${latest.subject}`
        : `${fresh.length} novos · ${latest.from}: ${latest.subject}`;

    const { sent } = await sendPushToAll({
      title: fresh.length === 1 ? "Novo email" : `${fresh.length} novos emails`,
      body,
      url: "/orcamento/admin",
      tag: "novo-email",
    });

    await writeMarker(maxUid);
    return NextResponse.json({ sent, novos: fresh.length });
  } catch (err) {
    log.error("inbox-check falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
