import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { updateProposal } from "@/lib/proposals-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const allowed = ["status", "respondedAt"] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in body) patch[k] = body[k];
    }
    const updated = await updateProposal(id, patch);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    log.error("propostas PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
