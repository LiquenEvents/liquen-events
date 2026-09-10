import type { AnaliseDoDia } from "./guiao-do-dia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GEOMETRIA DO HORÁRIO — UMA SÓ, PARA O ECRÃ E PARA O PAPEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── PORQUE É QUE ISTO SAIU DA `GrelhaDoDia` ──────────────────────────────
 *
 * Ela mandou o horário de uma faculdade e disse duas coisas seguidas: «quero
 * que o timeline seja mesmo assim» e «quero que para imprimir seja algo assim».
 * A partir daí o mesmo desenho passa a existir em três sítios — a grelha do
 * ecrã, a folha que sai na impressora, e o PDF que se descarrega — e a janela
 * de horas tem de ser a MESMA nos três.
 *
 * Se cada um a calculasse por si, bastava alguém afinar o arredondamento de um
 * para o papel deixar de bater certo com o ecrã: o bloco das 08:50 a começar
 * colado ao topo numa folha e com dez minutos de respiro na outra. Não é um
 * erro que dê vermelho em lado nenhum — é um erro que se descobre em frente ao
 * cliente, com a folha na mão.
 *
 * Por isso a janela vive aqui, é pura, e não sabe o que é um píxel: devolve
 * MINUTOS. Quem desenha é que decide quanto vale um minuto — 1 px no ecrã, e
 * outra coisa no papel, onde a altura é a da folha e não a do rolo.
 */

/** Sessenta. Está aqui para as três contas não o escreverem cada uma à sua maneira. */
export const MINUTOS_POR_HORA = 60;

/** O princípio e o fim do horário, ambos em minutos desde a meia-noite do dia. */
export interface JanelaDoHorario {
  /** A hora cheia imediatamente antes (ou igual a) do primeiro momento. */
  inicio: number;
  /** A hora cheia imediatamente depois (ou igual a) do último. Nunca igual ao início. */
  fim: number;
}

/**
 * A janela do horário de um dia, arredondada às horas cheias.
 *
 * ── PORQUE É QUE ARREDONDA PARA FORA ─────────────────────────────────────
 *
 * Porque um horário sem horas cheias não é um horário. Um dia que começa às
 * 08:50 desenhado a partir das 08:50 dá uma primeira faixa de dez minutos e
 * uma coluna de horas com «08:50, 09:50, 10:50» — números que ninguém procura.
 * A começar às 08:00, a primeira faixa é uma hora como as outras e o bloco
 * entra a cinquenta minutos do topo, que é onde ele está mesmo.
 *
 * ── E PORQUE É QUE O FIM NUNCA É O INÍCIO ────────────────────────────────
 *
 * Um dia com um instante só — uma nota às 14:00 e mais nada — tem `inicio` e
 * `fim` iguais, e arredondados dariam uma janela de altura zero: uma grelha sem
 * uma única faixa, que é uma grelha que não se vê. O chão de uma hora dá-lhe a
 * faixa das 14:00 às 15:00 com o instante no cimo.
 *
 * Devolve `null` quando não há forma nenhuma — um dia sem um único momento com
 * hora legível. Quem chama tem de o dizer por palavras, e não desenhar uma
 * grelha vazia a fingir que o dia está livre.
 */
export function janelaDoHorario(dia: AnaliseDoDia): JanelaDoHorario | null {
  if (dia.inicio === null || dia.fim === null) return null;
  const inicio = Math.floor(dia.inicio / MINUTOS_POR_HORA) * MINUTOS_POR_HORA;
  const fim = Math.max(
    Math.ceil(dia.fim / MINUTOS_POR_HORA) * MINUTOS_POR_HORA,
    inicio + MINUTOS_POR_HORA,
  );
  return { inicio, fim };
}

/**
 * As horas cheias da janela, do princípio ao fim, inclusive.
 *
 * Inclusive dos dois lados de propósito: o último número é o FIM do dia, e é
 * ele que fecha a última faixa. Quem desenha faixas usa `horas.slice(0, -1)` —
 * há sempre uma faixa a menos do que números, porque cada faixa é o espaço
 * ENTRE dois.
 */
export function horasDaJanela(janela: JanelaDoHorario): number[] {
  const horas: number[] = [];
  for (let m = janela.inicio; m <= janela.fim; m += MINUTOS_POR_HORA) horas.push(m);
  return horas;
}
