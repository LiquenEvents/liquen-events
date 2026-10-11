import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listarEnvios } from "@/lib/envios-de-proposta";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * As cópias dos emails que seguiram com as propostas deste pedido.
 *
 * Eram guardadas a cada envio (`envios-de-proposta.ts`) e nenhum ecrã as
 * mostrava — só serviam a protecção contra envios repetidos. São o que ela
 * escreveu ao casal, tal e qual: para quem, quando, o assunto e o texto.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ ok: true, envios: await listarEnvios(id) });
  } catch (err) {
    log.error("envios GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
