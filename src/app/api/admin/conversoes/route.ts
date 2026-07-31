import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { listContracts } from "@/lib/contracts-store";
import { construirConversoes, csvConversoes, relatorio } from "@/lib/ads/conversoes-offline";
import { PARAMETROS } from "@/lib/ads/click-id";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DESCARREGAR AS CONVERSÕES OFFLINE PARA CARREGAR NO GOOGLE ADS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma vez por mês: abre-se este endereço, lê-se o relatório, e descarrega-se o
 * CSV para carregar em Google Ads → Ferramentas → Conversões → Carregamentos. A
 * partir daí a Google licita para casamentos FECHADOS em vez de licitar para
 * formulários preenchidos.
 *
 *   /api/admin/conversoes                  → o relatório (é o padrão)
 *   /api/admin/conversoes?ficheiro=gclid   → o CSV para carregar
 *   /api/admin/conversoes?ficheiro=gbraid  → idem, tráfego de iOS
 *
 * PROTEGIDA. Estes ficheiros contêm valores de negócios fechados: quanto é que
 * cada casamento rendeu. É informação comercial, e a rota exige sessão de
 * administração como qualquer outra do back office.
 *
 * SÃO TRÊS FICHEIROS E NÃO UM ARQUIVO. Não se acrescentou uma dependência de
 * compressão só para isto, e há uma vantagem: o relatório é o que abre por
 * omissão, portanto quem vem aqui vê primeiro quantos negócios há e o que ficou
 * de fora, e só depois carrega. Um carregamento na Google é difícil de desfazer.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const [quotes, propostas, contratos] = await Promise.all([
    listQuotes(),
    listAllProposals(),
    listContracts(),
  ]);

  // A proposta MAIS RECENTE de cada pedido é a que vale: se houve revisão de
  // preço, o valor do negócio é o da última, não o da primeira.
  const propostaPorQuote = new Map<string, (typeof propostas)[number]>();
  for (const p of propostas) {
    const atual = propostaPorQuote.get(p.quoteId);
    if (!atual || (p.createdAt ?? "") > (atual.createdAt ?? "")) propostaPorQuote.set(p.quoteId, p);
  }

  // A data de aceitação do contrato é a data com significado legal do fecho.
  const aceiteEmPorQuote = new Map<string, string>();
  for (const c of contratos) {
    if (!c.acceptedAt) continue;
    const atual = aceiteEmPorQuote.get(c.quoteId);
    // A primeira aceitação é a que marca o fecho; uma segunda seria um aditamento.
    if (!atual || c.acceptedAt < atual) aceiteEmPorQuote.set(c.quoteId, c.acceptedAt);
  }

  const resultado = construirConversoes(
    quotes,
    (id) => propostaPorQuote.get(id) ?? null,
    (id) => aceiteEmPorQuote.get(id),
  );

  const dia = new Date().toISOString().slice(0, 10);
  const pedido = req.nextUrl.searchParams.get("ficheiro") ?? "relatorio";

  log.info("conversoes-offline: exportadas", {
    ficheiro: pedido,
    examinados: resultado.examinados,
    linhas: resultado.linhas.length,
    excluidos: resultado.excluidos.length,
  });

  // O RELATÓRIO É O PADRÃO, e não o CSV. É deliberado: quem abre isto pela
  // primeira vez deve ver quantos negócios há, quanto valem e o que ficou de
  // fora ANTES de carregar seja o que for na Google. Um carregamento é difícil
  // de desfazer; ler primeiro não custa nada.
  if (pedido === "relatorio") {
    const disponiveis = PARAMETROS.filter(
      (t) => t === "gclid" || resultado.linhas.some((l) => l.tipo === t),
    );
    const rodape =
      "\n" +
      "Ficheiros para carregar em Google Ads > Ferramentas > Conversoes > Carregamentos:\n" +
      disponiveis.map((t) => `    ?ficheiro=${t}`).join("\n") +
      "\n";
    return new NextResponse(relatorio(resultado) + rodape, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const tipo = PARAMETROS.find((t) => t === pedido);
  if (!tipo) {
    return NextResponse.json(
      { error: `ficheiro desconhecido: ${pedido}`, aceites: ["relatorio", ...PARAMETROS] },
      { status: 400 },
    );
  }

  return new NextResponse(csvConversoes(resultado.linhas, tipo), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversoes-${tipo}-${dia}.csv"`,
      // Nunca em cache: os valores mudam a cada negócio fechado, e uma resposta
      // guardada aqui faria carregar duas vezes as mesmas conversões.
      "Cache-Control": "no-store",
    },
  });
}
