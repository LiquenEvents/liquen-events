/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO TEMPO CUSTA MESMO UMA PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Registar o tempo ativo gasto por proposta e por secção (não
 * relógio de parede: tempo com a página em foco).»
 *
 * A distinção é a coisa toda. Uma proposta aberta às 9h e enviada às 18h não
 * custou nove horas: custou duas, partidas por telefonemas, almoço e três
 * visitas a quintas. Um relógio de parede diria nove e a conclusão que se
 * tirava dele — «isto é insustentável» — seria falsa.
 *
 * ── O QUE CONTA COMO TRABALHO ─────────────────────────────────────────────
 * Tempo com a página EM FOCO e com sinais de vida. Duas travas:
 *
 *  · sem foco não conta — o separador está atrás do email, ou o portátil
 *    fechado;
 *  · em foco mas sem um toque, uma tecla ou um scroll durante
 *    {@link PARADO_AO_FIM_DE} não conta a partir daí. É o ecrã que ficou
 *    aberto enquanto ela foi ao telefone, que é o caso mais comum de todos.
 *
 * ── PURO DE PROPÓSITO ─────────────────────────────────────────────────────
 * Não tem `Date.now()` lá dentro, não sabe o que é uma janela e não escreve em
 * lado nenhum: recebe acontecimentos com o instante em que se deram e devolve
 * um total. É o que permite medir isto num teste — com um relógio falso — em
 * vez de o experimentar com um cronómetro à frente do ecrã.
 */

/** Ao fim de quanto tempo sem sinais de vida se deixa de contar (ms). */
export const PARADO_AO_FIM_DE = 60_000;

export type Acontecimento =
  /** A página ganhou foco, ou houve toque/tecla/scroll. */
  | { tipo: "vida"; em: number }
  /** A página perdeu o foco, ficou escondida, ou fechou-se. */
  | { tipo: "pausa"; em: number };

export interface Contagem {
  /** Milissegundos de trabalho ACTIVO. */
  activo: number;
  /** O instante do último sinal de vida, ou `null` se está em pausa. */
  desde: number | null;
}

export const CONTAGEM_VAZIA: Contagem = { activo: 0, desde: null };

/**
 * Acrescenta um acontecimento à contagem.
 *
 * A regra da parada está aqui e não num temporizador: o intervalo entre dois
 * sinais de vida é contado até ao limite de {@link PARADO_AO_FIM_DE}. Assim,
 * cinco minutos sem tocar em nada acrescentam um minuto — não cinco, e não
 * zero, porque o primeiro minuto foi mesmo a olhar para o ecrã.
 */
export function comAcontecimento(c: Contagem, a: Acontecimento): Contagem {
  if (a.tipo === "vida") {
    if (c.desde === null) return { activo: c.activo, desde: a.em };
    const decorrido = Math.max(0, a.em - c.desde);
    return { activo: c.activo + Math.min(decorrido, PARADO_AO_FIM_DE), desde: a.em };
  }
  if (c.desde === null) return c;
  const decorrido = Math.max(0, a.em - c.desde);
  return { activo: c.activo + Math.min(decorrido, PARADO_AO_FIM_DE), desde: null };
}

/** O total AGORA, incluindo o tempo desde o último sinal de vida. */
export function totalAte(c: Contagem, agora: number): number {
  if (c.desde === null) return c.activo;
  return c.activo + Math.min(Math.max(0, agora - c.desde), PARADO_AO_FIM_DE);
}

/**
 * O tempo em palavras, curto — «12 min», «1 h 05».
 *
 * Sem segundos: o número que interessa é o da ordem de grandeza («esta proposta
 * levou duas horas»), e segundos a mudar num canto do ecrã são um relógio a
 * pedir atenção que não merece.
 */
export function emPalavras(ms: number): string {
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas} h ${String(resto).padStart(2, "0")}`;
}
