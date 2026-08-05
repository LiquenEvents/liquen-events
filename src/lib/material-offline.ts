/**
 * MARCAR SEM REDE, E NÃO PERDER NADA.
 *
 * ── O problema ────────────────────────────────────────────────────────────
 * Quem carrega a carrinha está de pé, com as mãos ocupadas, numa quinta onde a
 * rede vai e vem. Duas horas sem rede são quarenta marcações. Se uma se perder,
 * o escadote fica para trás.
 *
 * ── A regra ───────────────────────────────────────────────────────────────
 * Marcar escreve PRIMEIRO no armazenamento local, e só depois tenta a rede. O
 * dedo nunca espera pela rede: esperar, no meio de uma quinta, é perder a
 * marcação.
 *
 * O que não chegou ao servidor fica numa FILA DE SAÍDA persistente, reenviada
 * quando a ligação voltar e ao reabrir a página. Persistente e não em memória:
 * uma aba fechada por engano não pode levar quarenta marcações com ela.
 *
 * ── Conflitos ─────────────────────────────────────────────────────────────
 * Ganha a última marcação, pelo relógio de QUEM MARCOU (não pelo do servidor —
 * o telemóvel pode estar offline há uma hora e a marcação dele é mais antiga do
 * que a de alguém que marcou agora, mesmo chegando depois). A que perde fica
 * registada em vez de desaparecer.
 *
 * Este módulo é puro e sem React de propósito: é a parte onde os erros custam
 * marcações, e tem de poder ser testada sem montar um ecrã.
 */

export type AccaoOffline = "loaded" | "unloaded" | "returned" | "missing" | "note" | "used";

export interface MarcacaoPendente {
  /** Único por marcação, para o servidor poder ignorar repetições. */
  id: string;
  eventId: string;
  itemId: string;
  accao: AccaoOffline;
  valor?: string;
  /** ISO do relógio de quem marcou. É por aqui que se resolve o conflito. */
  markedAt: string;
  actor: string;
}

/** O que vive no armazenamento local, por evento. */
export interface EstadoLocal<T> {
  eventId: string;
  itens: T[];
  /** Quando é que o servidor confirmou esta lista pela última vez. */
  syncedAt?: string;
}

export const CHAVE_FILA = "liquen-material-fila";
export const chaveEvento = (eventId: string) => `liquen-material-${eventId}`;

/** Lê a fila. Um armazenamento indisponível (modo privado, quota) não pode
 *  rebentar o ecrã — devolve-se vazio e continua-se a trabalhar online. */
export function lerFila(store: Pick<Storage, "getItem">): MarcacaoPendente[] {
  try {
    const bruto = store.getItem(CHAVE_FILA);
    if (!bruto) return [];
    const v = JSON.parse(bruto);
    return Array.isArray(v) ? (v as MarcacaoPendente[]) : [];
  } catch {
    return [];
  }
}

export function escreverFila(store: Pick<Storage, "setItem">, fila: MarcacaoPendente[]): void {
  try {
    store.setItem(CHAVE_FILA, JSON.stringify(fila));
  } catch {
    /* sem espaço ou sem armazenamento: a marcação já está no ecrã e vai por rede */
  }
}

/**
 * Junta uma marcação à fila.
 *
 * Marcar e desmarcar o mesmo item repetidamente não pode encher a fila com
 * cinquenta entradas: fica só a ÚLTIMA por (item, acção), porque é o estado
 * final que interessa ao servidor. As acções que ACUMULAM — notas e consumos —
 * não são substituídas, porque cada uma diz uma coisa diferente.
 */
export function juntarAFila(fila: MarcacaoPendente[], marca: MarcacaoPendente): MarcacaoPendente[] {
  const acumula = marca.accao === "note" || marca.accao === "used";
  if (acumula) return [...fila, marca];
  const substitui = (m: MarcacaoPendente) =>
    m.itemId === marca.itemId &&
    // "loaded" e "unloaded" são a mesma pergunta com duas respostas: a última
    // apaga a anterior, senão o servidor recebia as duas e a ordem decidia.
    (m.accao === marca.accao ||
      (marca.accao === "loaded" && m.accao === "unloaded") ||
      (marca.accao === "unloaded" && m.accao === "loaded"));
  return [...fila.filter((m) => !substitui(m)), marca];
}

/**
 * Põe a fila POR CIMA do que o servidor devolveu.
 *
 * Sem isto perde-se uma marcação de maneira quase invisível: marcar enquanto o
 * primeiro pedido ainda vai a caminho, e a resposta dele — que ainda não sabia
 * da marcação — chega e apaga-a do ecrã. Numa quinta com rede lenta é
 * exactamente quando acontece, e a pessoa não tem como saber que aconteceu.
 *
 * A fila é a verdade do que ainda não foi confirmado. Aplicá-la por cima é o
 * que faz o ecrã continuar a dizer o que a pessoa marcou.
 */
export function aplicarFila<
  T extends { id: string; loadedAt?: string; loadedBy?: string; note?: string },
>(itens: T[], fila: MarcacaoPendente[], eventId: string): T[] {
  const pendentes = fila.filter((m) => m.eventId === eventId);
  if (pendentes.length === 0) return itens;
  const porItem = new Map<string, MarcacaoPendente[]>();
  for (const m of pendentes) {
    porItem.set(m.itemId, [...(porItem.get(m.itemId) ?? []), m]);
  }
  return itens.map((i) => {
    const minhas = porItem.get(i.id);
    if (!minhas) return i;
    let out = { ...i };
    // Por ordem de marcação: a última é a que fica.
    for (const m of [...minhas].sort((a, b) => a.markedAt.localeCompare(b.markedAt))) {
      if (m.accao === "loaded") out = { ...out, loadedAt: m.markedAt, loadedBy: m.actor };
      else if (m.accao === "unloaded") out = { ...out, loadedAt: undefined, loadedBy: undefined };
      else if (m.accao === "note") out = { ...out, note: m.valor };
    }
    return out;
  });
}

/**
 * Ganha a marcação mais recente PELO RELÓGIO DE QUEM MARCOU.
 *
 * Devolve também a que perdeu, para ficar registada: uma marcação que
 * desaparece sem rasto é o que faz duas pessoas discutirem sobre quem marcou o
 * quê.
 */
export function resolverConflito(
  local: MarcacaoPendente,
  servidor: { markedAt?: string } | null,
): { ganha: "local" | "servidor"; perdida?: MarcacaoPendente } {
  if (!servidor?.markedAt) return { ganha: "local" };
  // Empate fica para o servidor: já lá está, e trocar por trocar só produzia
  // uma escrita a mais.
  return local.markedAt > servidor.markedAt
    ? { ganha: "local" }
    : { ganha: "servidor", perdida: local };
}
