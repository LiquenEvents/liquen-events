import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { imapConfigured, listInbox } from "@/lib/inbox";
import { sendPushToAll } from "@/lib/push";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Polls the team inbox and pushes a notification when new email arrives — so a
 * proposal/lead that comes in by email (not the site form) still reaches the
 * phone/PC. Meant to be hit by a frequent cron (e.g. every few minutes).
 *
 * Dedupe: a marker file remembers the highest UID already notified. On the very
 * first run it just records the current top UID (no flood of historical mail);
 * thereafter it only notifies about messages newer than the marker.
 *
 * Requires IMAP to be configured (the IMAP_ / SMTP_ env vars). No-ops otherwise.
 * Protected by CRON_SECRET (Bearer); a logged-in admin may trigger it manually.
 */
const MARKER_FILE = path.join(process.cwd(), "data", "inbox-marker.json");

async function readMarker(): Promise<number | null> {
  try {
    const raw = JSON.parse(await fs.readFile(MARKER_FILE, "utf-8"));
    return typeof raw?.lastUid === "number" ? raw.lastUid : null;
  } catch {
    return null;
  }
}
async function writeMarker(lastUid: number): Promise<void> {
  try {
    await fs.mkdir(path.dirname(MARKER_FILE), { recursive: true });
    await fs.writeFile(MARKER_FILE, JSON.stringify({ lastUid }, null, 2));
  } catch (err) {
    log.error("inbox-check: não foi possível gravar o marcador", err);
  }
}

function authorized(req: NextRequest): boolean {
  if (isAuthed(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
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
