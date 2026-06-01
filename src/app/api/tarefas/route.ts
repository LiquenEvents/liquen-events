import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listTasks, createTask } from "@/lib/tasks-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listTasks());
  } catch (err) {
    log.error("tarefas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
    const task = await createTask({
      title,
      priority: body.priority ?? "normal",
      dueDate: body.dueDate || undefined,
      quoteId: body.quoteId || undefined,
      clientName: body.clientName || undefined,
      assignee: body.assignee || undefined,
      area: body.area || undefined,
    });
    return NextResponse.json(task);
  } catch (err) {
    log.error("tarefas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
