import type { Proposal, Quote } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARA ONDE É QUE ESTA FOTO JÁ FOI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `fotosDeBiblioteca` de cada proposta enviada diz de que ficheiros da
 * biblioteca saíram as fotos dela. Ao contrário, dá isto: por ficheiro, os
 * casamentos onde ele já apareceu.
 *
 * ── NÃO É UMA PROIBIÇÃO ────────────────────────────────────────────────────
 * Repetir uma foto pode ser a decisão certa: é a melhor que há daquele arco, e
 * os dois casamentos são em pontas opostas do país com dois anos pelo meio.
 * O que faz a repetição doer é a PROXIMIDADE — mesmo mês, meia hora de carro —
 * e por isso a resposta traz a data e o sítio, para quem decide poder decidir.
 */

/** Um casamento onde uma foto já foi parar. */
export interface UsoAnterior {
  /** O casal, como está na proposta. */
  cliente: string;
  /** A data do casamento (do pedido), quando se sabe. */
  data?: string;
  /** O sítio, quando se sabe. */
  local?: string;
  /** Quando a proposta seguiu. */
  enviadaEm: string;
}

export interface FotoRepetida {
  /** O caminho do ficheiro na biblioteca. */
  origem: string;
  usos: UsoAnterior[];
}

/**
 * As fotos de biblioteca já usadas noutros pedidos, e onde.
 *
 * `pedidoActual` fica de fora: uma proposta em revisão reencontra as suas
 * próprias fotos, e se elas contassem, a segunda versão de qualquer proposta
 * abria com um aviso de repetição sobre si mesma.
 */
export function ondeJaFoi(
  pedidoActual: string,
  propostas: Proposal[],
  quotes: Quote[],
): FotoRepetida[] {
  const porId = new Map(quotes.map((q) => [q.id, q]));
  const mapa = new Map<string, UsoAnterior[]>();

  for (const p of propostas) {
    if (p.quoteId === pedidoActual) continue;
    // Um rascunho não foi a lado nenhum: a foto ainda não se repetiu, e avisar
    // sobre trabalho por acabar seria avisar sobre o que ela está a fazer.
    if (p.status === "rascunho") continue;
    const origens = p.doc?.fotosDeBiblioteca;
    if (!Array.isArray(origens) || origens.length === 0) continue;

    const q = porId.get(p.quoteId);
    const uso: UsoAnterior = {
      cliente: p.clientName || q?.name || "outro casamento",
      data: q?.date || undefined,
      local: q?.location || undefined,
      enviadaEm: p.sentAt || p.createdAt,
    };

    for (const origem of origens) {
      if (typeof origem !== "string" || !origem) continue;
      const lista = mapa.get(origem);
      if (lista) lista.push(uso);
      else mapa.set(origem, [uso]);
    }
  }

  return [...mapa.entries()]
    .map(([origem, usos]) => ({
      origem,
      // Do mais recente para o mais antigo: a repetição que interessa é a que
      // ainda está fresca na memória de quem viu as duas propostas.
      usos: usos.sort((a, b) => (a.enviadaEm > b.enviadaEm ? -1 : 1)),
    }))
    .sort((a, b) => b.usos.length - a.usos.length);
}

/** Uma frase para a marca na grelha: "Já usada — Ana e Rui, 12 set 2026". */
export function comoSeDiz(f: FotoRepetida): string {
  const [primeiro] = f.usos;
  if (!primeiro) return "Já usada";
  const quando = primeiro.data
    ? new Date(primeiro.data).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  const resto = f.usos.length > 1 ? ` (+${f.usos.length - 1})` : "";
  return [primeiro.cliente, quando].filter(Boolean).join(", ") + resto;
}
