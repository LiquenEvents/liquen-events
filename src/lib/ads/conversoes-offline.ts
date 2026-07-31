import type { Quote, Proposal } from "@/lib/orcamento/types";
import { contractedAmounts } from "@/lib/orcamento/dossier";
import { desserializar, JANELA_MS, type ParametroClique } from "./click-id";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONVERSÕES OFFLINE — DEVOLVER À GOOGLE O VALOR REAL DO CASAMENTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O PROBLEMA. Um pedido de orçamento não é uma venda. Sem isto, a Google só
 * sabe que alguém preencheu um formulário e optimiza para MAIS FORMULÁRIOS —
 * que é, quase sempre, optimizar para os formulários mais fáceis de obter, ou
 * seja os piores. A conta enche-se de pedidos de casamentos de 3 000 € e a
 * campanha que trazia os de 25 000 € é cortada por "converter menos".
 *
 * A CORRECÇÃO. Quando um casamento FECHA, devolve-se à Google o identificador
 * do clique que o originou e o valor real do negócio. A partir daí ela licita
 * para casamentos fechados e não para formulários preenchidos. É a alteração
 * isolada com maior efeito numa conta de serviços de ticket alto, e a maior
 * parte das contas pequenas nunca a faz porque dá trabalho a ligar ao sistema
 * de gestão. Aqui o sistema de gestão é este repositório, portanto não dá.
 *
 * ── O QUE CONTA COMO "FECHADO" ─────────────────────────────────────────────
 * O pedido com estado `aceite`. É o estado que o back office atribui quando a
 * proposta é aceite, e é o que gera contrato e fatura de sinal — ou seja, é a
 * primeira vez que existe dinheiro comprometido, e não apenas intenção.
 *
 * ── QUE VALOR SE ENVIA ─────────────────────────────────────────────────────
 * O valor SEM IVA (`contractedAmounts().net`). Duas razões: o IVA não é receita
 * (é dinheiro do Estado a passar pela conta), e enviá-lo inflacionaria o ROAS
 * em 23% — o que levaria a Google a licitar mais alto do que o negócio aguenta.
 * Este projecto já teve exactamente este erro noutro sítio, com o `quotedPrice`
 * gravado com IVA num campo rotulado "sem IVA".
 *
 * ── PORQUE É QUE ISTO É UM FICHEIRO E NÃO UMA CHAMADA À API ────────────────
 * A API do Google Ads exige um token de programador, uma conta de gestor
 * aprovada e credenciais OAuth de longa duração guardadas no servidor. Para
 * uma operação que corre UMA VEZ POR MÊS e trata de meia dúzia de linhas, isso
 * é uma superfície de ataque e um custo de manutenção que não se justificam —
 * e um segredo a mais para gerir é um segredo a mais para vazar. O ficheiro
 * carrega-se na interface do Google Ads em Ferramentas → Conversões →
 * Carregamentos. Demora menos de um minuto.
 */

/** Nome da acção de conversão a criar no Google Ads. TEM de bater certo. */
export const NOME_CONVERSAO = "Casamento fechado";

/** Fuso horário declarado no cabeçalho do ficheiro. */
export const FUSO = "Europe/Lisbon";

export interface LinhaConversao {
  /** O identificador em cru. */
  id: string;
  tipo: ParametroClique;
  /** "yyyy-MM-dd HH:mm:ss" no fuso declarado. */
  quando: string;
  /** Valor SEM IVA, em euros. */
  valor: number;
  /** Referência do pedido — não vai no ficheiro, serve para conferir. */
  ref: string;
}

/** Porque é que um pedido fechado NÃO gerou linha. */
export type MotivoExclusao =
  | "sem-identificador"
  | "identificador-ilegivel"
  | "fora-da-janela"
  | "sem-valor"
  | "data-anterior-ao-clique";

export interface Excluido {
  ref: string;
  motivo: MotivoExclusao;
  /** Detalhe legível para o relatório. */
  detalhe?: string;
}

export interface Resultado {
  linhas: LinhaConversao[];
  excluidos: Excluido[];
  /** Quantos pedidos fechados foram examinados. */
  examinados: number;
}

/** "2026-03-15T14:22:01.000Z" → "2026-03-15 14:22:01". */
export function formatarInstante(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Quando é que o casamento fechou.
 *
 * Por ordem: a data de aceitação do contrato (é a data com significado legal),
 * depois a última alteração ao pedido, depois a submissão. A última é um mau
 * recurso mas é melhor do que descartar a linha: a Google exige uma data e uma
 * data ligeiramente errada custa muito menos do que uma conversão em falta.
 */
export function instanteDoFecho(quote: Quote, aceiteEm?: string): string {
  return aceiteEm ?? quote.lastUpdated ?? quote.submittedAt;
}

/**
 * Constrói as linhas de conversão a partir dos pedidos fechados.
 *
 * Devolve TAMBÉM os excluídos e a razão. Não é um extra: um exportador que
 * devolve seis linhas quando havia dez negócios fechados, sem dizer nada,
 * levaria alguém a concluir que a publicidade só trouxe seis — quando a causa
 * pode ser um identificador expirado ou um pedido sem preço final gravado. O
 * silêncio aqui produz decisões erradas sobre orçamento.
 */
export function construirConversoes(
  quotes: Quote[],
  propostaDe: (quoteId: string) => Proposal | null | undefined,
  aceiteEmDe: (quoteId: string) => string | undefined,
): Resultado {
  const fechados = quotes.filter((q) => q.status === "aceite" && !q.archived);
  const linhas: LinhaConversao[] = [];
  const excluidos: Excluido[] = [];

  for (const q of fechados) {
    const ref = q.id;
    const cru = (q.adClick ?? "").trim();
    if (!cru) {
      // O caso NORMAL: a maior parte dos casamentos não vem de um anúncio.
      excluidos.push({ ref, motivo: "sem-identificador" });
      continue;
    }
    const clique = desserializar(cru);
    if (!clique) {
      excluidos.push({ ref, motivo: "identificador-ilegivel", detalhe: cru.slice(0, 40) });
      continue;
    }

    const quandoIso = instanteDoFecho(q, aceiteEmDe(q.id));
    const fecho = Date.parse(quandoIso);
    const clicou = Date.parse(clique.em);

    if (!Number.isFinite(fecho)) {
      excluidos.push({ ref, motivo: "data-anterior-ao-clique", detalhe: "data de fecho ilegível" });
      continue;
    }
    // A Google recusa uma conversão anterior ao clique. Acontece de verdade
    // quando alguém corrige o estado de um pedido antigo à mão.
    if (fecho < clicou) {
      excluidos.push({
        ref,
        motivo: "data-anterior-ao-clique",
        detalhe: `fecho ${quandoIso} antes do clique ${clique.em}`,
      });
      continue;
    }
    // E recusa um clique com mais de 90 dias. Enviar essas linhas não faz mal
    // nenhum além de aparecerem como erro no carregamento, mas vale mais
    // dizê-lo aqui, onde se percebe porquê.
    if (fecho - clicou > JANELA_MS) {
      const dias = Math.round((fecho - clicou) / 86_400_000);
      excluidos.push({
        ref,
        motivo: "fora-da-janela",
        detalhe: `${dias} dias entre o clique e o fecho (a Google aceita 90)`,
      });
      continue;
    }

    const { net } = contractedAmounts(q, propostaDe(q.id));
    if (!(net > 0)) {
      excluidos.push({
        ref,
        motivo: "sem-valor",
        detalhe: "sem preço final nem proposta — grava o valor no pedido",
      });
      continue;
    }

    linhas.push({
      id: clique.valor,
      tipo: clique.tipo,
      quando: formatarInstante(quandoIso),
      valor: Math.round(net * 100) / 100,
      ref,
    });
  }

  return { linhas, excluidos, examinados: fechados.length };
}

/**
 * O ficheiro CSV no formato que o Google Ads aceita.
 *
 * O `gclid` e os `gbraid`/`wbraid` NÃO cabem no mesmo ficheiro: a Google pede
 * uma coluna com nome diferente para cada um. Por isso saem dois ficheiros, e
 * o segundo só é gerado quando existe alguma linha de iOS.
 */
export function csvConversoes(linhas: LinhaConversao[], tipo: ParametroClique): string {
  const doTipo = linhas.filter((l) => l.tipo === tipo);
  const coluna = tipo === "gclid" ? "Google Click ID" : tipo === "gbraid" ? "GBRAID" : "WBRAID";
  const cabecalho = [
    `Parameters:TimeZone=${FUSO}`,
    [coluna, "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency"].join(
      ",",
    ),
  ];
  const corpo = doTipo.map((l) =>
    [l.id, NOME_CONVERSAO, l.quando, l.valor.toFixed(2), "EUR"].join(","),
  );
  return [...cabecalho, ...corpo].join("\n") + "\n";
}

/** Relatório legível do que ficou de fora, para acompanhar o ficheiro. */
export function relatorio(r: Resultado): string {
  const porMotivo = new Map<MotivoExclusao, Excluido[]>();
  for (const e of r.excluidos) {
    const lista = porMotivo.get(e.motivo) ?? [];
    lista.push(e);
    porMotivo.set(e.motivo, lista);
  }
  const EXPLICACAO: Record<MotivoExclusao, string> = {
    "sem-identificador":
      "não vieram de um anúncio (é o caso normal — passa-a-palavra, orgânico, Instagram)",
    "identificador-ilegivel": "o identificador guardado não tem a forma esperada",
    "fora-da-janela": "passaram mais de 90 dias entre o clique e o fecho; a Google recusa",
    "sem-valor": "não têm preço final nem proposta gravada — sem valor não há ROAS",
    "data-anterior-ao-clique": "a data de fecho é anterior ao clique; a Google recusa",
  };
  const linhas = [
    `Casamentos fechados examinados: ${r.examinados}`,
    `Conversões a enviar: ${r.linhas.length}`,
    `Valor total: ${r.linhas.reduce((s, l) => s + l.valor, 0).toFixed(2)} € (sem IVA)`,
    "",
  ];
  for (const [motivo, lista] of porMotivo) {
    linhas.push(`${lista.length} × ${motivo}: ${EXPLICACAO[motivo]}`);
    // Os que precisam de acção da parte dela vão nomeados; os que são normais
    // ficam só contados, senão o relatório fica ilegível de tanto ruído.
    if (motivo !== "sem-identificador") {
      for (const e of lista) linhas.push(`    ${e.ref}${e.detalhe ? ` — ${e.detalhe}` : ""}`);
    }
  }
  return linhas.join("\n") + "\n";
}
