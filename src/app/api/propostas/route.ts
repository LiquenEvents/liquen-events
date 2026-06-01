import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listAllProposals } from "@/lib/proposals-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listAllProposals());
  } catch (err) {
    log.error("propostas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
