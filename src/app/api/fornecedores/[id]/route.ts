import { NextRequest, NextResponse } from "next/server";
import type { Supplier } from "@/lib/orcamento/types";
import { isAuthed } from "@/lib/admin-auth";
import { updateSupplier, deleteSupplier } from "@/lib/suppliers-store";
import { supplierUpdateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

// id/createdAt are server-assigned and must never be overwritable via PATCH.
const ALLOWED: (keyof Supplier)[] = [
  "name",
  "category",
  "email",
  "phone",
  "location",
  "notes",
  "rating",
  "preferred",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const picked: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in body) picked[key] = body[key];
    }
    const parsed = supplierUpdateSchema.safeParse(picked);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const updated = await updateSupplier(id, parsed.data as Partial<Supplier>);
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
