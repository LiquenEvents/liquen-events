"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PASSAR O RATO NUM TEMA COMEÇA A IR BUSCAR AS FOTOS DELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do briefing da biblioteca: «prefetch on hover: passar o rato sobre um tema
 * começa a carregar as suas fotos».
 *
 * Abrir um tema são hoje duas esperas em fila: a listagem da pasta (uma ida à
 * base de dados e ao Storage) e só DEPOIS as miniaturas. Enquanto a primeira
 * não volta, a grelha não tem sequer endereços para pedir. O rato costuma
 * pousar num cartão um segundo antes de o clique acontecer — e esse segundo
 * chega para a listagem já estar cá quando ela carrega.
 *
 * ── O QUE SE GUARDA, E O QUE NÃO SE GUARDA ────────────────────────────────
 *
 * Guarda-se a PROMESSA, não o resultado. Duas razões: quem abrir a meio do
 * caminho apanha a mesma ida em vez de começar outra, e uma promessa que falha
 * não deixa nada guardado — a abertura a sério tenta de novo, como se nunca
 * tivesse havido prefetch.
 *
 * E guarda-se por pouco tempo. Uma listagem de há cinco minutos pode já não
 * dizer a verdade: entretanto carregaram-se fotos, apagaram-se outras, mudou-se
 * uma capa. Ao fim do prazo esquece-se, e quem abrir paga a ida normal — que é
 * o que acontecia sempre antes disto existir.
 *
 * ── E PORQUE É QUE NÃO EXISTE AO TOQUE ────────────────────────────────────
 *
 * Porque num telemóvel não há «passar por cima»: há tocar, e tocar já abre. Um
 * prefetch preso ao toque seria a mesma ida duas vezes — e num 4G fraco, numa
 * quinta, gastar dados a duplicar um pedido é o oposto do que isto quer.
 */

import { THEME_PAGE_SIZE, type ThemeImage } from "@/lib/theme-types";

export interface PaginaDeTema {
  images: ThemeImage[];
  total: number | null;
  truncated: boolean;
}

/** Quantas fotos a primeira página traz — o MESMO número da abertura a sério.
 *  Escrito à mão seria um número que um dia divergia, e o sintoma seria mudo:
 *  o adiantamento continuava a acontecer e deixava de servir para nada. */
export const PREFETCH_LIMITE = THEME_PAGE_SIZE;

/**
 * Quanto tempo uma listagem guardada continua a valer.
 *
 * Trinta segundos: cobre com folga o intervalo entre o rato pousar e o clique,
 * e é curto de mais para alguém carregar fotos nesse tempo.
 */
export const PREFETCH_VALIDADE_MS = 30_000;

interface Guardado {
  em: number;
  promessa: Promise<PaginaDeTema | null>;
}

const guardadas = new Map<string, Guardado>();

/** Lê a resposta da rota das imagens de um tema. Um só sítio, para o prefetch e
 *  a abertura não poderem discordar sobre o que a rota devolve. */
export function paginaDaResposta(data: unknown): PaginaDeTema {
  const d = data as Record<string, unknown> | null;
  const images = Array.isArray(d?.images) ? (d.images as ThemeImage[]) : [];
  return {
    images,
    // `ok: false` é uma pasta que NÃO pôde ser lida — o servidor manda
    // `total: 0` porque não tem outro número para dar. Aceitá-lo como zero
    // faria a grelha dizer «arrasta aqui as fotos» a um tema que pode ter 3000.
    total: d?.ok === false ? null : typeof d?.total === "number" ? d.total : images.length,
    truncated: Boolean(d?.truncated),
  };
}

const endereco = (id: string) =>
  `/api/temas/${encodeURIComponent(id)}/imagens?offset=0&limit=${PREFETCH_LIMITE}`;

/** Começa a ir buscar a primeira página de um tema, se ainda não estiver a
 *  caminho. Nunca lança e não devolve nada — é um adiantamento, não uma acção. */
export function adiantarTema(id: string, agora = Date.now()): void {
  const jaLa = guardadas.get(id);
  if (jaLa && agora - jaLa.em < PREFETCH_VALIDADE_MS) return;
  const promessa = fetch(endereco(id), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d ? paginaDaResposta(d) : null))
    // Uma falha aqui não é um erro de ninguém: a abertura a sério volta a
    // tentar e é ela que fala. Guardar `null` faz o `usarAdiantada` desistir.
    .catch(() => null);
  guardadas.set(id, { em: agora, promessa });
}

/**
 * A página adiantada deste tema, se ainda valer.
 *
 * Consome-a: a mesma listagem não serve duas aberturas, porque entre uma e
 * outra pode ter mudado tudo.
 */
export async function usarAdiantada(id: string, agora = Date.now()): Promise<PaginaDeTema | null> {
  const g = guardadas.get(id);
  guardadas.delete(id);
  if (!g || agora - g.em >= PREFETCH_VALIDADE_MS) return null;
  return g.promessa;
}

/** Esquece tudo. Para os testes, e para quando alguma coisa mexe na pasta. */
export function esquecerAdiantadas(): void {
  guardadas.clear();
}
