import type { Proposal, ProposalStatus, Quote } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ACONTECE À PROPOSTA DEPOIS DE SEGUIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Depois de enviada, uma proposta desaparecia do radar. Ficava numa lista por
 * data de criação, ao lado de rascunhos e de negócios fechados há meses, e a
 * única forma de saber quais é que ainda estavam vivas era abri-las uma a uma.
 *
 * Este módulo é a aritmética desse painel, sem nada de React, para poder ser
 * testada sozinha: o que está em aberto, quanto tempo falta, e por que ordem
 * merece a atenção de amanhã de manhã.
 *
 * ── UMA NOTA SOBRE "EXPIRADA" ──────────────────────────────────────────────
 * Não é um estado gravado, é uma leitura do calendário. Gravá-lo obrigaria
 * alguém a percorrer as propostas todas todos os dias só para manter uma
 * palavra certa — e no dia em que esse alguém falhasse, o painel mentia.
 */

/** Estados em que a proposta ainda pode virar negócio. */
export const EM_ABERTO: ProposalStatus[] = ["enviada", "em_negociacao"];

export function estaEmAberto(p: Proposal): boolean {
  return EM_ABERTO.includes(p.status);
}

/** Dias inteiros entre hoje e uma data "yyyy-mm-dd". Negativo = já passou. */
export function diasAte(iso: string | undefined, hoje = new Date()): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const alvo = new Date(`${iso}T12:00:00Z`).getTime();
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 12);
  if (Number.isNaN(alvo)) return null;
  return Math.round((alvo - base) / 86_400_000);
}

/** A validade já passou? Falso quando não há validade nenhuma marcada. */
export function estaExpirada(p: Proposal, hoje = new Date()): boolean {
  const d = diasAte(p.validUntil, hoje);
  return d !== null && d < 0;
}

/**
 * Quantos dias faltam para a validade acabar, para uma proposta ainda em
 * aberto. `null` quando não há validade, ou quando a proposta já fechou.
 */
export function diasDeValidade(p: Proposal, hoje = new Date()): number | null {
  if (!estaEmAberto(p)) return null;
  return diasAte(p.validUntil, hoje);
}

export type Urgencia = "expirada" | "expira-ja" | "evento-perto" | "normal";

/** A partir de quantos dias é que "está quase" passa a ser uma frase útil. */
export const AVISO_VALIDADE_DIAS = 7;
/** E o mesmo para a data do evento: a menos de um mês, adiar é decidir. */
export const AVISO_EVENTO_DIAS = 30;

export interface LinhaDeAcompanhamento {
  proposta: Proposal;
  /** O pedido a que pertence, quando o encontramos (dá a data do evento). */
  quote?: Quote;
  /** Dias até a validade acabar; negativo se já acabou; `null` se não há. */
  validade: number | null;
  /** Dias até ao evento; `null` quando o pedido não tem data marcada. */
  evento: number | null;
  /** Dias até ao seguimento que ela marcou; negativo = atrasado. */
  seguimento: number | null;
  urgencia: Urgencia;
  /**
   * O número por que a lista se ordena: o mais pequeno de tudo o que tem
   * relógio a contar. Menor = mais em cima.
   */
  chave: number;
}

/**
 * Ordena as propostas em aberto pela proximidade do que quer que esteja mais
 * perto — a validade a acabar, o evento a chegar, ou o seguimento marcado.
 *
 * Porque é o mínimo dos três e não só a validade: uma proposta válida mais 25
 * dias para um casamento que é daqui a 10 não pode esperar por causa da
 * validade. E uma proposta com seguimento marcado para amanhã sobe, mesmo que
 * o evento seja para o ano — foi ela que o marcou.
 *
 * O que já expirou vem SEMPRE à cabeça, por muito longe que o evento esteja:
 * é o único grupo onde a inação já custou alguma coisa.
 */
export function acompanhamento(
  propostas: Proposal[],
  quotes: Quote[],
  hoje = new Date(),
): LinhaDeAcompanhamento[] {
  const porId = new Map(quotes.map((q) => [q.id, q]));

  return propostas
    .filter(estaEmAberto)
    .map((proposta) => {
      const quote = porId.get(proposta.quoteId);
      const validade = diasAte(proposta.validUntil, hoje);
      const evento = diasAte(quote?.date, hoje);
      const seguimento = diasAte(proposta.followUpAt, hoje);

      const relogios = [validade, evento, seguimento].filter((n): n is number => n !== null);
      const chave = relogios.length > 0 ? Math.min(...relogios) : Number.POSITIVE_INFINITY;

      let urgencia: Urgencia = "normal";
      if (validade !== null && validade < 0) urgencia = "expirada";
      else if (validade !== null && validade <= AVISO_VALIDADE_DIAS) urgencia = "expira-ja";
      else if (evento !== null && evento >= 0 && evento <= AVISO_EVENTO_DIAS)
        urgencia = "evento-perto";

      return { proposta, quote, validade, evento, seguimento, urgencia, chave };
    })
    .sort((a, b) => {
      const expA = a.urgencia === "expirada" ? 0 : 1;
      const expB = b.urgencia === "expirada" ? 0 : 1;
      if (expA !== expB) return expA - expB;
      if (a.chave !== b.chave) return a.chave - b.chave;
      // Empate a dias: a mais antiga primeiro, que é a que espera há mais tempo.
      return a.proposta.createdAt.localeCompare(b.proposta.createdAt);
    });
}

/** Quantas propostas em aberto estão a poucos dias de perder a validade. */
export function aExpirar(linhas: LinhaDeAcompanhamento[]): LinhaDeAcompanhamento[] {
  return linhas.filter((l) => l.urgencia === "expira-ja" || l.urgencia === "expirada");
}

/** Seguimentos marcados para hoje ou já atrasados. */
export function seguimentosDevidos(linhas: LinhaDeAcompanhamento[]): LinhaDeAcompanhamento[] {
  return linhas.filter((l) => l.seguimento !== null && l.seguimento <= 0);
}
