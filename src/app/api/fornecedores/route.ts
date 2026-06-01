import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listSuppliers, createSupplier } from "@/lib/suppliers-store";
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
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    const supplier = await createSupplier({
      name,
      category: String(body.category ?? "Outro"),
      email: body.email || undefined,
      phone: body.phone || undefined,
      location: body.location || undefined,
      notes: body.notes || undefined,
    });
    return NextResponse.json(supplier);
  } catch (err) {
    log.error("fornecedores POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
