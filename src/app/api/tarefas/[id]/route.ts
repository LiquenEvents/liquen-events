import { NextRequest, NextResponse } from "next/server";
import type { Task } from "@/lib/orcamento/types";
import { isAuthed } from "@/lib/admin-auth";
import { updateTask, deleteTask } from "@/lib/tasks-store";
import { taskUpdateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

// id/createdAt are server-assigned and must never be overwritable via PATCH.
const ALLOWED: (keyof Task)[] = [
  "title",
  "done",
  "priority",
  "dueDate",
  "quoteId",
  "clientName",
  "assignee",
  "area",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // Malformed or non-object body → 400, not a 500. `null`/primitives/arrays
    // would otherwise blow up the `key in body` check with a TypeError.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const source = body as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in source) picked[key] = source[key];
    }
    const parsed = taskUpdateSchema.safeParse(picked);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const updated = await updateTask(id, parsed.data as Partial<Task>);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    log.error("tarefas PATCH falhou", err);
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
    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("tarefas DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
