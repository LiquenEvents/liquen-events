import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { pedidosParaPreVisualizar, valoresDoPedidoReal } from "@/lib/email-modelos-previsualizacao";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Os dados para a pré-visualização: sem `pedido`, a lista para o menu; com
 * `pedido`, os valores REAIS desse pedido — os mesmos que o envio usaria.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const pedido = String(searchParams.get("pedido") ?? "").trim();
  try {
    if (!pedido) return NextResponse.json({ pedidos: await pedidosParaPreVisualizar() });
    const dados = await valoresDoPedidoReal(pedido);
    if (!dados) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    return NextResponse.json(dados);
  } catch (err) {
    log.error("email-templates dados GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
