import type { MaterialItem } from "./material-types";
import type { MaterialList, MaterialListItem } from "./material-list-types";
import { quantidadePara } from "./material-list-types";
import { chaveDeNome } from "./material-csv";

/**
 * O MOTOR: o que a proposta de um casamento implica em material.
 *
 * ── Uma condição por regra ────────────────────────────────────────────────
 * Não há E/OU nem aninhamento, por decisão. Condições compostas são uma
 * linguagem de programação com outro nome, e o sítio onde estas coisas deixam
 * de ser depuráveis por quem as escreveu. Duas condições fazem-se com duas
 * regras — e a checklist mostra qual delas disparou, o que é precisamente o
 * que uma condição composta esconderia.
 *
 * ── Tudo o que entra diz DE ONDE VEIO ─────────────────────────────────────
 * Cada linha gerada carrega a origem (essenciais, que regra, ou à mão). Uma
 * lista automática que ninguém consegue explicar é uma lista que toda a gente
 * começa a ignorar, e a partir daí o módulo não serve para nada.
 */

export type MatchKind = "sempre" | "servico" | "texto" | "pax";
export type RuleAction = "add_list" | "add_item";

export interface MaterialRule {
  id: string;
  name: string;
  enabled: boolean;
  matchKind: MatchKind;
  /** O que procurar. Em `pax`, o número mínimo de convidados. */
  matchValue?: string;
  action: RuleAction;
  listId?: string;
  itemId?: string;
  qty?: number;
  qtyPerPax?: number;
  position: number;
  updatedAt: string;
}

/** O que o motor precisa de saber sobre a proposta, sem depender da forma dela. */
export interface ContextoEvento {
  /** Rótulos dos serviços da proposta ("Arco floral cerimónia"). */
  servicos: string[];
  /** O documento inteiro em texto, para as regras de `texto`. */
  texto: string;
  pax: number;
}

export type Origem = "base" | "regra" | "manual";

export interface LinhaGerada {
  itemId: string;
  name: string;
  category: string;
  unit?: string;
  kind: MaterialItem["kind"];
  qty: number;
  critical: boolean;
  origin: Origem;
  /** Id da lista ou da regra que a trouxe; o nome legível vai em `originLabel`. */
  originRef?: string;
  originLabel: string;
}

/** Uma regra dispara? */
export function regraDispara(regra: MaterialRule, ctx: ContextoEvento): boolean {
  if (!regra.enabled) return false;
  const alvo = chaveDeNome(regra.matchValue ?? "");
  switch (regra.matchKind) {
    case "sempre":
      return true;
    case "servico":
      // Sem valor, "qualquer serviço" seria disparar sempre — que é o que a
      // regra `sempre` já faz, e por outro nome. Não dispara.
      if (!alvo) return false;
      return ctx.servicos.some((s) => chaveDeNome(s).includes(alvo));
    case "texto":
      if (!alvo) return false;
      return chaveDeNome(ctx.texto).includes(alvo);
    case "pax": {
      const minimo = Number(regra.matchValue);
      if (!Number.isFinite(minimo)) return false;
      return ctx.pax >= minimo;
    }
    default:
      return false;
  }
}

interface Fontes {
  regras: MaterialRule[];
  listas: MaterialList[];
  linhasDeLista: MaterialListItem[];
  catalogo: MaterialItem[];
}

/**
 * Junta tudo o que a checklist de um evento deve ter.
 *
 * Ordem: primeiro as listas marcadas como "vai sempre", depois as regras pela
 * sua posição. O MESMO item vindo de dois sítios NÃO aparece duas vezes — fica
 * a maior quantidade, e as origens somam-se no rótulo. Uma linha repetida numa
 * checklist é lida como um engano e faz perder a confiança na lista inteira.
 *
 * Ser crítico é contagioso: se qualquer origem o marcar como crítico, fica
 * crítico. É o erro seguro — um aviso a mais é um incómodo, um escadote sem
 * aviso é uma viagem perdida.
 */
export function gerarChecklist(ctx: ContextoEvento, fontes: Fontes): LinhaGerada[] {
  const { regras, listas, linhasDeLista, catalogo } = fontes;
  const porItemId = new Map(catalogo.map((i) => [i.id, i]));
  const porListaId = new Map(listas.map((l) => [l.id, l]));
  const geradas = new Map<string, LinhaGerada>();

  const juntar = (
    itemId: string,
    qty: number,
    critical: boolean,
    origin: Origem,
    originRef: string | undefined,
    originLabel: string,
  ) => {
    const item = porItemId.get(itemId);
    // Um item que já não existe no catálogo não entra: a alternativa era uma
    // linha sem nome nem unidade, que na carrinha não diz nada a ninguém.
    if (!item) return;
    const jaLa = geradas.get(itemId);
    if (!jaLa) {
      geradas.set(itemId, {
        itemId,
        name: item.name,
        category: item.category,
        unit: item.unit,
        kind: item.kind,
        qty,
        critical,
        origin,
        originRef,
        originLabel,
      });
      return;
    }
    jaLa.qty = Math.max(jaLa.qty, qty);
    jaLa.critical = jaLa.critical || critical;
    if (!jaLa.originLabel.includes(originLabel)) {
      jaLa.originLabel = `${jaLa.originLabel} + ${originLabel}`;
    }
  };

  const juntarLista = (listaId: string, origin: Origem, rotulo: string) => {
    for (const linha of linhasDeLista
      .filter((l) => l.listId === listaId)
      .sort((a, b) => a.position - b.position)) {
      juntar(linha.itemId, quantidadePara(linha, ctx.pax), linha.critical, origin, listaId, rotulo);
    }
  };

  for (const lista of listas.filter((l) => l.isDefault)) {
    juntarLista(lista.id, "base", lista.name);
  }

  for (const regra of [...regras].sort((a, b) => a.position - b.position)) {
    if (!regraDispara(regra, ctx)) continue;
    if (regra.action === "add_list" && regra.listId) {
      const lista = porListaId.get(regra.listId);
      juntarLista(regra.listId, "regra", lista ? `${regra.name}` : regra.name);
    } else if (regra.action === "add_item" && regra.itemId) {
      juntar(
        regra.itemId,
        quantidadePara({ qty: regra.qty ?? 1, qtyPerPax: regra.qtyPerPax }, ctx.pax),
        false,
        "regra",
        regra.id,
        regra.name,
      );
    }
  }

  // Ordenada por categoria e depois por nome: é assim que se carrega uma
  // carrinha — tudo o que é ferramenta de uma vez, não saltando de caixa em
  // caixa.
  return [...geradas.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}
