import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { imapConfigured, listInbox } from "@/lib/inbox";
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
    const messages = await listInbox(30);
    return NextResponse.json({ configured: true, messages });
  } catch (err) {
    log.error("[inbox GET]", err);
    return NextResponse.json(
      { configured: true, messages: [], error: "Não foi possível ligar ao e-mail." },
      { status: 502 },
    );
  }
}
