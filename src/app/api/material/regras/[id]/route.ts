import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { updateRule, deleteRule } from "@/lib/material-rules-store";
import type { MaterialRule } from "@/lib/material-rules";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const patch: Partial<MaterialRule> = {};
    if (typeof body.name === "string") {
      const nome = body.name.trim().slice(0, 120);
      if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
      patch.name = nome;
    }
    // Ligar e desligar é o gesto mais útil aqui: deixa experimentar sem perder
    // a regra escrita.
    if ("enabled" in body) patch.enabled = Boolean(body.enabled);
    if (typeof body.matchValue === "string") {
      patch.matchValue = body.matchValue.trim().slice(0, 120) || undefined;
    }
    if ("position" in body) patch.position = Number(body.position) || 0;

    const atualizada = await updateRule(id, patch);
    if (!atualizada) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json(atualizada);
  } catch (err) {
    log.error("material regra PATCH falhou", err);
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
    await deleteRule(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("material regra DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
