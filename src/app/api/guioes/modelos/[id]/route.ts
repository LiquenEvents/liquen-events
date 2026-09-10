import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { apagarModeloDeGuiao } from "@/lib/guiao-modelos-guardados";
import { MODELOS_DA_CASA } from "@/lib/orcamento/guiao-modelos";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apagar um modelo dela.
 *
 * Um modelo DA CASA não se apaga, e a recusa é explícita em vez de silenciosa:
 * o `apagarModeloDeGuiao` filtra por id sobre a lista guardada, onde os da casa
 * não estão — portanto apagá-los «funcionava» (200, lista igual) e o ecrã
 * voltava a mostrá-los. Um botão que responde OK e não faz nada ensina a não
 * confiar nos botões.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  if (MODELOS_DA_CASA.some((m) => m.id === id)) {
    return NextResponse.json({ error: "Os modelos da casa não se apagam." }, { status: 409 });
  }
  try {
    const { modelos, escrita } = await apagarModeloDeGuiao(id);
    return NextResponse.json({ modelos, escrita });
  } catch (err) {
    log.error("modelos de guião DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
