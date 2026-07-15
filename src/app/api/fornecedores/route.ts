import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listSuppliers, createSupplier } from "@/lib/suppliers-store";
import { supplierUpdateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listSuppliers());
  } catch (err) {
    log.error("fornecedores GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    // Validate + bound the same way the PATCH path does (was ad-hoc String()
    // coercion with no length limits before).
    const parsed = supplierUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const name = (parsed.data.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    const supplier = await createSupplier({
      name,
      category: parsed.data.category || "Outro",
      email: parsed.data.email || undefined,
      phone: parsed.data.phone || undefined,
      location: parsed.data.location || undefined,
      notes: parsed.data.notes || undefined,
    });
    return NextResponse.json(supplier);
  } catch (err) {
    log.error("fornecedores POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
