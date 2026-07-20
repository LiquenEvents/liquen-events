import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listItems, createItem, PROP_CATEGORIES, type PropItem } from "@/lib/inventory-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONDITIONS: PropItem["condition"][] = ["novo", "bom", "usado", "danificado"];

/** Coerce and bound a raw quantity to a non-negative integer (max 1_000_000). */
function normQuantity(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 1_000_000);
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listItems());
  } catch (err) {
    log.error("inventario GET falhou", err);
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
    const condition = CONDITIONS.includes(body?.condition) ? body.condition : "bom";

    const item = await createItem({
      name,
      category: category && PROP_CATEGORIES.includes(category) ? category : "Outro",
      quantity: normQuantity(body?.quantity),
      unit: str(body?.unit, 24) || undefined,
      condition,
      location: str(body?.location, 120) || undefined,
      notes: str(body?.notes, 500) || undefined,
    });
    return NextResponse.json(item);
  } catch (err) {
    log.error("inventario POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
