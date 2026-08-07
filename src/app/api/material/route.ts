import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listMaterial, createMaterial } from "@/lib/material-store";
import { MATERIAL_CATEGORIES, type MaterialKind } from "@/lib/material-types";
import { jsonWithEtag } from "@/lib/api-cache";
import { log } from "@/lib/logger";
import { isMissingTable } from "@/lib/repository";

const NAO_INSTALADO =
  "O Material ainda não está criado na base de dados. No Supabase → SQL Editor, cole e corra o " +
  "ficheiro db/schema.sql (pode repetir-se sem risco) e recarregue esta página.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Número não-negativo e limitado. Decimal: há metros e rolos. */
export function normNumero(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 1_000_000);
}

/** O mínimo distingue "não vigiar" (nulo) de zero. Ver `material-store`. */
export function normMinimo(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(n, 1_000_000);
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return jsonWithEtag(request, await listMaterial());
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("material GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const name = str(body?.name, 120);
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    const category = str(body?.category, 60);
    const kind: MaterialKind = body?.kind === "consumivel" ? "consumivel" : "reutilizavel";

    const item = await createMaterial({
      name,
      category: MATERIAL_CATEGORIES.includes(category) ? category : "Ferramentas",
      kind,
      unit: str(body?.unit, 24) || undefined,
      stock: normNumero(body?.stock),
      minStock: normMinimo(body?.minStock),
      notes: str(body?.notes, 500) || undefined,
    });
    return NextResponse.json(item);
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("material POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
