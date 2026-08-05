"use client";

import { THEME_PAGE_SIZE, type ThemeImage, type ThemeSummary } from "@/lib/theme-types";

/**
 * O QUE JÁ SE FOI BUSCAR À BIBLIOTECA, GUARDADO PARA A PRÓXIMA ABERTURA.
 *
 * ── O que isto arruma ─────────────────────────────────────────────────────
 * O seletor de temas desmonta ao fechar, e com ele morria tudo. Reabri-lo —
 * coisa que se faz várias vezes ao montar uma proposta, uma por mood board —
 * repetia os dois pedidos do zero, incluindo a lista de temas, que não muda de
 * um minuto para o outro. Trocar de separador e voltar tinha o mesmo custo.
 *
 * Vive no MÓDULO e não num estado de React, exactamente para sobreviver ao
 * desmontar. É por sessão de página: um F5 começa do zero, e está bem assim.
 *
 * ── Porque é que NÃO é "zero pedidos para sempre" ─────────────────────────
 * Era o alvo pedido, e teria um defeito calado: ela adiciona fotos na
 * Biblioteca de Temas, volta ao estúdio, abre o seletor — e vê a biblioteca
 * como estava antes, sem nada que lho diga. As fotos novas simplesmente não
 * existem para ela.
 *
 * Ligar a invalidação a cada sítio que mexe na biblioteca era possível, mas
 * são nove pontos de mutação em `Temas.tsx` e um décimo que alguém acrescenta
 * daqui a um mês sem saber que isto existe. Uma cache que depende de nunca
 * ninguém se esquecer é uma cache que vai servir dados velhos.
 *
 * Por isso: **mostra já, e confirma por trás**. A abertura é instantânea com o
 * que está guardado, e se a entrada tiver mais de `REVALIDAR_APOS_MS` pede-se
 * de novo em segundo plano, sem skeleton nenhum — a grelha só muda se a
 * resposta for diferente. Reabrir de seguida (o caso real, entre dois mood
 * boards) não gasta pedido nenhum; reabrir dez minutos depois gasta um, que
 * ninguém vê.
 *
 * ── E os URLs expiram ─────────────────────────────────────────────────────
 * Os URLs assinados valem 6 horas (`SIGNED_TTL` em `theme-storage.ts`). Uma
 * entrada guardada para lá disso serviria links mortos e a grelha aparecia
 * vazia. `VALIDADE_MS` é MUITO mais curto do que isso de propósito — não por
 * precisão, mas para a margem ser grande.
 */

/** Passado isto, a entrada é lixo: deita-se fora e vai-se buscar de novo, com
 *  skeleton. Bem abaixo das 6 h de validade dos URLs assinados. */
const VALIDADE_MS = 30 * 60 * 1000;

/** Passado isto, mostra-se o que está guardado E confirma-se por trás. */
const REVALIDAR_APOS_MS = 30 * 1000;

export interface PaginaTema {
  images: ThemeImage[];
  total: number;
  truncated: boolean;
  /** A página veio cheia → é provável que haja mais. */
  pageFull: boolean;
  /** A pasta não pôde ser LIDA. Não é o mesmo que "tema sem fotos". */
  unreadable: boolean;
  /** Quando foi buscada, para decidir revalidar ou deitar fora. */
  at: number;
}

interface Guardado<T> {
  valor: T;
  at: number;
}

const temas: { entrada: Guardado<ThemeSummary[]> | null } = { entrada: null };
const paginas = new Map<string, Guardado<PaginaTema>>();

/** Pedidos em voo, para dois sítios que peçam o mesmo ao mesmo tempo — o rato
 *  a passar por cima do botão e o clique logo a seguir — não fazerem dois. */
const emVooTemas: { p: Promise<ThemeSummary[]> | null } = { p: null };
const emVooPaginas = new Map<string, Promise<PaginaTema>>();

const fresco = (at: number) => Date.now() - at < VALIDADE_MS;

/** Já se pode usar isto sem esperar por rede? */
export function temasEmCache(): ThemeSummary[] | null {
  const e = temas.entrada;
  return e && fresco(e.at) ? e.valor : null;
}

export function paginaEmCache(themeId: string): PaginaTema | null {
  const e = paginas.get(themeId);
  return e && fresco(e.at) ? e.valor : null;
}

/** Está guardado mas já tem idade — mostra-se e confirma-se por trás. */
export const vaiRevalidar = (at: number) => Date.now() - at >= REVALIDAR_APOS_MS;

/**
 * A lista de temas. Serve da cache quando pode; senão vai à rede — e um
 * segundo pedido enquanto o primeiro está em voo espera pelo mesmo, em vez de
 * abrir outro.
 */
export async function buscarTemas(forcar = false): Promise<ThemeSummary[]> {
  if (!forcar) {
    const guardado = temasEmCache();
    if (guardado) return guardado;
  }
  if (emVooTemas.p) return emVooTemas.p;
  const p = (async () => {
    try {
      const res = await fetch("/api/temas", { cache: "no-store" });
      if (!res.ok) throw new Error("falhou");
      const list: ThemeSummary[] = await res.json();
      temas.entrada = { valor: list, at: Date.now() };
      return list;
    } finally {
      emVooTemas.p = null;
    }
  })();
  emVooTemas.p = p;
  return p;
}

/** A primeira página de fotos de um tema, com as mesmas regras. */
export async function buscarPrimeiraPagina(themeId: string, forcar = false): Promise<PaginaTema> {
  if (!forcar) {
    const guardado = paginaEmCache(themeId);
    if (guardado) return guardado;
  }
  const jaVai = emVooPaginas.get(themeId);
  if (jaVai) return jaVai;
  const p = (async () => {
    try {
      const res = await fetch(`/api/temas/${themeId}/imagens?offset=0&limit=${THEME_PAGE_SIZE}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const images: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
      const pagina: PaginaTema = {
        images,
        total: typeof data?.total === "number" ? data.total : images.length,
        truncated: Boolean(data?.truncated),
        pageFull: images.length >= THEME_PAGE_SIZE,
        unreadable: data?.ok === false,
        at: Date.now(),
      };
      // Uma pasta ILEGÍVEL não se guarda: é um estado passageiro (uma falha do
      // Storage), e guardá-lo fazia as próximas meia hora de aberturas
      // mostrarem "fotos indisponíveis" sem sequer tentar.
      if (!pagina.unreadable) paginas.set(themeId, { valor: pagina, at: pagina.at });
      return pagina;
    } finally {
      emVooPaginas.delete(themeId);
    }
  })();
  emVooPaginas.set(themeId, p);
  return p;
}

/**
 * Guarda o que a grelha tem AGORA de um tema — incluindo as páginas que o
 * "Mostrar mais" mandou vir, que o `buscarPrimeiraPagina` por definição não
 * conhece. Sem isto, reabrir um tema onde ela desceu três páginas devolvia-lhe
 * só a primeira e obrigava a descer outra vez.
 *
 * O relógio da entrada é o da PRIMEIRA leitura, não o desta escrita: os URLs
 * são assinados e têm hora de morte própria. Carimbar de novo a cada página
 * que entra fazia a entrada renovar-se sozinha para lá da assinatura, e a
 * grelha acabava a servir links mortos.
 */
export function guardarPagina(themeId: string, pagina: Omit<PaginaTema, "at">): void {
  const at = paginas.get(themeId)?.at ?? Date.now();
  paginas.set(themeId, { valor: { ...pagina, at }, at });
}

/**
 * Procura uma foto pelo caminho em tudo o que está guardado. A seleção
 * atravessa separadores, portanto uma foto escolhida pode já não estar na
 * grelha que se vê — e o que se quer dela é só a miniatura, para a pastilha.
 */
export function fotoEmCache(path: string): ThemeImage | null {
  for (const { valor } of paginas.values()) {
    const hit = valor.images.find((i) => i.path === path);
    if (hit) return hit;
  }
  return null;
}

/**
 * AQUECER: ir buscar o que o diálogo vai precisar, antes de ele abrir.
 *
 * Chamado quando o rato se aproxima do botão que abre o seletor. O tempo entre
 * apontar e carregar chega para os dois pedidos — e se ela carregar antes de
 * eles voltarem, não se perde nada: o `emVoo` faz o diálogo esperar pelo MESMO
 * pedido em vez de abrir outro.
 *
 * Nunca lança e nunca avisa de nada: isto é trabalho que ela não pediu, e uma
 * falha aqui não pode aparecer no ecrã. Se correr mal, o diálogo abre como
 * abria antes.
 */
export function aquecerBiblioteca(): void {
  void buscarTemas().catch(() => {});
  let ultimo: string | null = null;
  try {
    ultimo = localStorage.getItem("liquen-tema-recente");
  } catch {
    /* sem localStorage não há palpite — aquece-se só a lista */
  }
  if (ultimo) void buscarPrimeiraPagina(ultimo).catch(() => {});
}

/**
 * Esquecer tudo. Para quem MEXE na biblioteca (carregar, apagar, mudar de
 * tema) poder garantir que a abertura seguinte vê o que acabou de fazer, em
 * vez de esperar pela revalidação.
 */
export function esquecerBiblioteca(): void {
  temas.entrada = null;
  paginas.clear();
  emVooTemas.p = null;
  emVooPaginas.clear();
}

/** Só para os testes. */
export function estadoCacheBiblioteca(): { temas: boolean; paginas: number } {
  return { temas: temas.entrada !== null, paginas: paginas.size };
}
