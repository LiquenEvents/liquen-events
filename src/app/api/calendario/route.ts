import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listCalendarEvents, createCalendarEvent } from "@/lib/calendar-store";
import { jsonWithEtag } from "@/lib/api-cache";
import type { CalendarEventKind } from "@/lib/orcamento/types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: CalendarEventKind[] = ["reuniao", "evento", "bloqueio", "nota"];

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return jsonWithEtag(request, await listCalendarEvents());
  } catch (err) {
    log.error("calendario GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    // JSON malformado é pedido errado, não avaria: sem isto o `request.json()`
    // atirava e saía 500 do `catch` lá em baixo, e um `null` rebentava as
    // leituras abaixo com um TypeError. Mesmo padrão do PATCH de
    // `/api/orcamento/[id]`.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
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
    log.error("calendario POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
