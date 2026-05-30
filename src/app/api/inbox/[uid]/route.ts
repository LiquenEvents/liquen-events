import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getInboxMessage } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { uid } = await params;
  try {
    const message = await getInboxMessage(Number(uid));
    if (!message) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(message);
  } catch (err) {
    console.error("[inbox uid GET]", err);
    return NextResponse.json({ error: "Erro ao ler a mensagem." }, { status: 502 });
  }
}
