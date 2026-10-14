import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { NaoDeuParaApagar, apagarDeVez } from "@/lib/reciclagem";
import { log } from "@/lib/logger";

/** «Apagar de vez»: a última cópia sai. Não há volta — o ecrã pergunta antes. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const apagada = await apagarDeVez(id);
    if (!apagada) {
      return NextResponse.json({ error: "Isto já não está na Reciclagem." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NaoDeuParaApagar) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    log.error("reciclagem DELETE falhou", err);
    return NextResponse.json({ error: "Não foi possível apagar de vez." }, { status: 500 });
  }
}
