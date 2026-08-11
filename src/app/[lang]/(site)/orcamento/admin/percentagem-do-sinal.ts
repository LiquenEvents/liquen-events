"use client";

import { SINAL_POR_OMISSAO } from "@/lib/money";
import { useCachedList } from "./useCachedList";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PERCENTAGEM DO SINAL DE UM PEDIDO, DO MESMO SÍTIO DE ONDE SAI A FACTURA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O sinal deixou de ser 30% no dia em que o estúdio ganhou a caixa
 * «Sinal (%)». As rotas que EMITEM as facturas passaram a lê-la
 * (`depositPercentOf`), mas os dois ecrãs onde ela vê o número ANTES de emitir
 * — o formulário de Faturas e o painel de Pagamentos — continuavam a dividir
 * 30/70 à letra. Numa proposta de 50%: o formulário prometia «sinal
 * 3.690,00 €», ela carregava em Emitir, e no livro apareciam duas faturas de
 * 6.150,00 €. Não é um erro de contas — é o ecrã a dizer uma coisa e o botão a
 * fazer outra, que é a espécie de coisa que faz perder a confiança no resto.
 *
 * Vive num sítio só, e não copiado nos dois componentes, precisamente porque
 * duas cópias é a forma de um deles voltar a ficar para trás.
 *
 * ── Porque é que sai da lista LEVE de propostas ───────────────────────────
 * `/api/propostas?semDoc=1` já é pedida (e pré-aquecida em ociosidade pelo
 * AdminClient), já está em cache de módulo, e traz este número como facto
 * derivado — sem os documentos, que são quase tudo o que se descarregaria. Um
 * pedido novo por evento, só para ir buscar um inteiro, seria pior em todos os
 * eixos.
 */

/** O que esta leitura precisa da lista leve. O resto dos campos ignora-se. */
interface PropostaLeve {
  quoteId?: string;
  pctSinal?: number;
}

/**
 * A percentagem do sinal do pedido, ou a da casa quando ainda não há proposta.
 *
 * A proposta escolhida é a MAIS RECENTE do pedido — a mesma que a rota de
 * facturação escolhe (`getProposalByQuote`), e a lista chega ordenada da mais
 * nova para a mais velha.
 */
export function usePercentagemDoSinal(quoteId: string | null | undefined): number {
  const { data } = useCachedList<PropostaLeve[]>("propostas-leves", "/api/propostas?semDoc=1");
  // Enquanto a lista não chega — ou se a leitura falhar — vale a percentagem da
  // casa. É o que o servidor também aplica quando não há proposta que diga
  // outra coisa, por isso o ecrã nunca promete um número que ninguém emitiria.
  if (!quoteId || !Array.isArray(data)) return SINAL_POR_OMISSAO;
  const proposta = data.find((p) => p?.quoteId === quoteId);
  const pct = proposta?.pctSinal;
  return typeof pct === "number" && Number.isFinite(pct) && pct >= 1 && pct <= 99
    ? Math.round(pct)
    : SINAL_POR_OMISSAO;
}
