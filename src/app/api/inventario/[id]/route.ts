import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { updateItem, deleteItem, PROP_CATEGORIES, type PropItem } from "@/lib/inventory-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const CONDITIONS: PropItem["condition"][] = ["novo", "bom", "usado", "danificado"];

// id/updatedAt are server-assigned and must never be overwritable via PATCH.
const ALLOWED: (keyof PropItem)[] = [
  "name",
  "category",
  "quantity",
  "unit",
  "condition",
  "location",
  "notes",
];

/** Validate + coerce a single patch field; returns undefined to skip it. */
function coerce(key: keyof PropItem, value: unknown): unknown {
  switch (key) {
    case "name":
      return typeof value === "string" ? value.trim().slice(0, 120) : undefined;
    case "category": {
      const c = typeof value === "string" ? value.trim().slice(0, 60) : "";
      return PROP_CATEGORIES.includes(c) ? c : "Outro";
    }
    case "quantity": {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.min(n, 1_000_000);
    }
    case "condition":
      return CONDITIONS.includes(value as PropItem["condition"]) ? value : undefined;
    case "unit":
      return typeof value === "string" ? value.trim().slice(0, 24) || null : undefined;
    case "location":
      return typeof value === "string" ? value.trim().slice(0, 120) || null : undefined;
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
    for (const key of ALLOWED) {
      if (key in body) {
        const v = coerce(key, body[key]);
        if (v !== undefined) patch[key] = v;
      }
    }
    if ("name" in patch && !patch.name) {
      return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    }
    const updated = await updateItem(id, patch as Partial<PropItem>);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    log.error("inventario PATCH falhou", err);
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
    await deleteItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("inventario DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
