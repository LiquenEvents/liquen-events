/**
 * Fila de carregamento das fotos da galeria: um tecto de pedidos em voo.
 *
 * PORQUÊ. Percorrendo as 427 fotos num Chromium real sobre HTTP/2 (o que a
 * Vercel serve), a grelha chegou a ter 116 pedidos `/_next/image` em voo ao
 * mesmo tempo com 4 CPUs e 169 com o optimizador fixado a 1 vCPU. Nesse regime
 * o optimizador não devolveu um único 5xx: devolveu LATÊNCIA — p50 9846ms, p95
 * 14813ms, máx 19193ms, com 202 de 431 pedidos acima de 10 segundos. Uma cauda
 * assim passa qualquer timeout de gateway/CDN, e um pedido cortado deixava o
 * mosaico partido para sempre (ver GalleryImage).
 *
 * A mesma travessia em local NUNCA falhou — e não por o servidor ser melhor:
 * `next start` serve HTTP/1.1, onde o browser já limita a 6 ligações por
 * origem. Foi esse tecto acidental que protegeu todas as medições locais. Esta
 * fila repõe o mesmo tecto explicitamente, independentemente do protocolo.
 *
 * Medido no lado do custo: 96 pedidos frios simultâneos a w=1280 levaram 60,1s
 * de relógio e 4 nunca terminaram; os mesmos 96 a w=768 levaram 7,4s com zero
 * falhas. Ou seja, a rajada só é fatal quando é funda E larga: esta fila trata
 * da profundidade, o `sizes` dos mosaicos trata da largura.
 */

/** Um lugar na fila. `start` só corre quando houver vaga. */
interface Slot {
  start: () => void;
  started: boolean;
  done: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface LoadQueue {
  /**
   * Pede um lugar. `start` corre assim que houver vaga (imediatamente, se a
   * fila estiver abaixo do tecto). A função devolvida liberta o lugar — ou
   * desiste da espera, se ainda não tiver arrancado. É idempotente.
   */
  acquire(start: () => void): () => void;
  /** Telemetria/testes: quantos estão em voo e quantos esperam. */
  stats(): { inflight: number; waiting: number };
}

export function createLoadQueue(max: number, watchdogMs = 12_000): LoadQueue {
  let inflight = 0;
  const waiting: Slot[] = [];

  function pump() {
    while (inflight < max && waiting.length > 0) {
      const slot = waiting.shift()!;
      if (slot.done) continue;
      slot.started = true;
      inflight++;
      // Cão-de-guarda. Um pedido que nunca resolve (nem `load` nem `error`) é
      // exactamente o que se mediu na cauda dos 19s, e um lugar retido para
      // sempre entupiria a grelha inteira. Passado o tempo limite libertamos o
      // LUGAR (não abortamos a imagem: se ela ainda vier, óptimo). O tecto pode
      // ser ultrapassado nesse caso — é uma válvula de segurança, não um
      // contrato.
      slot.timer = setTimeout(() => release(slot), watchdogMs);
      slot.start();
    }
  }

  function release(slot: Slot) {
    if (slot.done) return;
    slot.done = true;
    if (slot.timer !== null) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }
    if (slot.started) {
      inflight--;
      pump();
      return;
    }
    const i = waiting.indexOf(slot);
    if (i >= 0) waiting.splice(i, 1);
  }

  return {
    acquire(start) {
      const slot: Slot = { start, started: false, done: false, timer: null };
      waiting.push(slot);
      pump();
      return () => release(slot);
    },
    stats: () => ({ inflight, waiting: waiting.length }),
  };
}

/**
 * 6 = o mesmo tecto que o HTTP/1.1 impunha por acidente nas corridas locais em
 * que ZERO imagens falharam. As fotos com prioridade (o mosaico 2x2, candidato
 * a LCP) não passam pela fila — ver GalleryImage.
 */
export const GALLERY_MAX_INFLIGHT = 6;

export const galleryLoadQueue = createLoadQueue(GALLERY_MAX_INFLIGHT);
