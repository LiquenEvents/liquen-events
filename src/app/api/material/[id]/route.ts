import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { updateMaterial, deleteMaterial } from "@/lib/material-store";
import { MATERIAL_CATEGORIES, type MaterialItem } from "@/lib/material-types";
import { log } from "@/lib/logger";
import { isMissingTable } from "@/lib/repository";

const NAO_INSTALADO =
  "O Material ainda não está criado na base de dados. No Supabase → SQL Editor, cola e corre o " +
  "ficheiro db/schema.sql (pode repetir-se sem risco) e recarrega esta página.";

export const runtime = "nodejs";

/** `id` e `updatedAt` são do servidor e nunca se sobrescrevem por PATCH. */
const PERMITIDOS: (keyof MaterialItem)[] = [
  "name",
  "category",
  "kind",
  "unit",
  "stock",
  "minStock",
  "notes",
];

/** Valida e converte um campo do patch. `undefined` = ignorar este campo. */
function coerce(key: keyof MaterialItem, value: unknown): unknown {
  switch (key) {
    case "name":
      return typeof value === "string" ? value.trim().slice(0, 120) : undefined;
    case "category": {
      const c = typeof value === "string" ? value.trim().slice(0, 60) : "";
      return MATERIAL_CATEGORIES.includes(c) ? c : "Ferramentas";
    }
    case "kind":
      return value === "consumivel" || value === "reutilizavel" ? value : undefined;
    case "stock": {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.min(n, 1_000_000);
    }
    case "minStock": {
      // `null` é uma instrução — "deixa de vigiar este item" — e tem de chegar
      // ao store como null, não ser ignorada como um campo inválido.
      if (value === null || value === "") return null;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return undefined;
      return Math.min(n, 1_000_000);
    }
    case "unit":
      return typeof value === "string" ? value.trim().slice(0, 24) || null : undefined;
    case "notes":
      return typeof value === "string" ? value.trim().slice(0, 500) || null : undefined;
    default:
      return undefined;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    for (const key of PERMITIDOS) {
      if (key in body) {
        const v = coerce(key, body[key]);
        if (v !== undefined) patch[key] = v;
      }
    }
    if ("name" in patch && !patch.name) {
      return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    }
    const updated = await updateMaterial(id, patch as Partial<MaterialItem>);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("material PATCH falhou", err);
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
    await deleteMaterial(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("material DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
