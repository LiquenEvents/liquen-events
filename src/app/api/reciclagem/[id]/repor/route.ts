import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { NaoDaParaRepor, reporDaReciclagem } from "@/lib/reciclagem";
import { log } from "@/lib/logger";

/**
 * «Repor»: volta tal e qual, com o mesmo id, e sai da Reciclagem.
 *
 * Quando não pode — já existe outra vez com o mesmo id, ou falta aquilo de que
 * depende — responde 409 com a frase do porquê, e não pisa nada.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const entrada = await reporDaReciclagem(id);
    return NextResponse.json({
      ok: true,
      tipo: entrada.tipo,
      origemId: entrada.origemId,
      rotulo: entrada.rotulo,
    });
  } catch (err) {
    if (err instanceof NaoDaParaRepor) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    log.error("reciclagem repor falhou", err);
    return NextResponse.json({ error: "Não foi possível repor." }, { status: 500 });
  }
}
