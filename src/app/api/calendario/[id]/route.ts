import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { deleteCalendarEvent } from "@/lib/calendar-store";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    await deleteCalendarEvent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[calendario DELETE]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
