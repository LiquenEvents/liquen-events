import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { valoresDoPedidoReal } from "@/lib/email-modelos-previsualizacao";
import { MODELO_POR_OMISSAO, rascunhoParaEnvio } from "@/lib/email-modelos-rascunho";
import { listarModelos, type IdiomaDoModelo } from "@/lib/email-templates-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RASCUNHO QUE O ECRÃ DE ENVIO ABRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Dá-lhe o pedido e (se quiser) o modelo, e recebe o texto dela já preenchido
 * com os dados daquele casal, pronto a pôr numa caixa editável. Sem `modelo`,
 * vem o «Registo formal» — o dela — que é o que abre por omissão.
 *
 * ESTA ROTA SÓ LÊ. Não envia, não grava, e não toca no modelo: enviar um email
 * com o texto mudado não pode mudar o modelo, senão o envio seguinte partia do
 * que alguém improvisou para outro casal. Guardar no modelo é um gesto à
 * parte, em `PUT /api/email-templates/bilingues`.
 *
 * A lista de modelos vem junto para o ecrã poder oferecer os outros dois sem
 * uma segunda ida à rede — com o que abre marcado.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const pedido = String(searchParams.get("pedido") ?? "").trim();
  const chave = String(searchParams.get("modelo") ?? "").trim() || MODELO_POR_OMISSAO;
  const idiomaPedido = searchParams.get("idioma");
  if (!pedido) return NextResponse.json({ error: "Falta o pedido" }, { status: 400 });

  try {
    const dados = await valoresDoPedidoReal(
      pedido,
      idiomaPedido === "en" ? "en" : idiomaPedido === "pt" ? "pt" : undefined,
    );
    if (!dados) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const idioma: IdiomaDoModelo = dados.idioma;
    const rascunho = await rascunhoParaEnvio({ chave, idioma, valores: dados.valores });
    if ("erro" in rascunho) return NextResponse.json({ error: rascunho.erro }, { status: 409 });

    const modelos = await listarModelos().catch(() => []);
    return NextResponse.json({
      rascunho,
      porOmissao: MODELO_POR_OMISSAO,
      // O endereço do cliente vai para o ecrã PREENCHER o destinatário. É o
      // envio a sério — ao contrário do teste, que o recusa de propósito.
      paraOCliente: dados.emailDoCliente,
      modelos: modelos.map((m) => ({
        chave: m.chave,
        nome: m.nome,
        descricao: m.descricao,
        temEsteIdioma: !!m[idioma].subject.trim() || !!m[idioma].body.trim(),
      })),
    });
  } catch (err) {
    log.error("email-templates rascunho GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
