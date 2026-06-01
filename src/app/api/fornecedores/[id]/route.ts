import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { updateSupplier, deleteSupplier } from "@/lib/suppliers-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const updated = await updateSupplier(id, await request.json());
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    log.error("fornecedores PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteSupplier(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("fornecedores DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
