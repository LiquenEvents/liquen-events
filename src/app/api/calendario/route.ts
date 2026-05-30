import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listCalendarEvents, createCalendarEvent } from "@/lib/calendar-store";
import type { CalendarEventKind } from "@/app/orcamento/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: CalendarEventKind[] = ["reuniao", "evento", "bloqueio", "nota"];

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listCalendarEvents());
  } catch (err) {
    console.error("[calendario GET]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const date = String(body.date ?? "").trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Título e data são obrigatórios" }, { status: 400 });
    }
    const kind: CalendarEventKind = KINDS.includes(body.kind) ? body.kind : "evento";
    const event = await createCalendarEvent({
      title,
      date,
      kind,
      time: body.time || undefined,
      note: body.note || undefined,
    });
    return NextResponse.json(event);
  } catch (err) {
    console.error("[calendario POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
