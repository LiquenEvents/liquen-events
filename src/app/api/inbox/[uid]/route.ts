import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getInboxMessage } from "@/lib/inbox";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { uid } = await params;
  // O UID é um número de sequência do IMAP. Mandar lá `NaN` (de um "abc" no
  // endereço) fazia o servidor recusar o comando e a rota devolver 502, como
  // se o correio estivesse em baixo. É o mesmo guarda da rota irmã `flags`.
  const uidNum = Number(uid);
  if (!Number.isInteger(uidNum) || uidNum <= 0) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }
  try {
    const message = await getInboxMessage(uidNum);
    if (!message) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(message);
  } catch (err) {
    log.error("inbox uid GET falhou", err);
    return NextResponse.json({ error: "Erro ao ler a mensagem." }, { status: 502 });
  }
}
