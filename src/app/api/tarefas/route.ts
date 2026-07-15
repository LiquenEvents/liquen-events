import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listTasks, createTask } from "@/lib/tasks-store";
import { taskUpdateSchema, firstError } from "@/lib/validation";
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
    // Validate + bound the same way the PATCH path does.
    const parsed = taskUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const title = (parsed.data.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
    const task = await createTask({
      title,
      priority: parsed.data.priority ?? "normal",
      dueDate: parsed.data.dueDate || undefined,
      quoteId: parsed.data.quoteId || undefined,
      clientName: parsed.data.clientName || undefined,
      assignee: parsed.data.assignee || undefined,
      area: parsed.data.area || undefined,
    });
    return NextResponse.json(task);
  } catch (err) {
    log.error("tarefas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
