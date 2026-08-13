"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { idUnico } from "@/lib/id-unico";
import { PENDING_IMAGE_PREFIX } from "@/lib/proposal-doc";
import {
  MAX_IMPORT_BATCH,
  THEME_PAGE_SIZE,
  type ThemeImage,
  type ThemeSummary,
} from "@/lib/theme-types";
import { useToast } from "./Toast";
import { useFocusTrap } from "./useFocusTrap";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { Button } from "./ui";
import {
  type PaginaTema,
  buscarPrimeiraPagina,
  buscarTemas,
  esquecerBiblioteca,
  fotoEmCache,
  guardarPagina,
  paginaEmCache,
  temasEmCache,
  vaiRevalidar,
} from "./theme-picker-cache";

/**
 * Escolher fotos da Biblioteca de Temas para uma proposta.
 *
 * O fluxo que isto resolve: em vez de ir ao Pinterest ou às pastas do disco a
 * cada proposta, a equipa carrega uma vez as fotos de cada tema ("Itália",
 * "Terracotta") e aqui escolhe o tema → vê as fotos → seleciona → entram no
 * mood board (ou na capa).
 *
 * As fotos escolhidas são COPIADAS para a pasta desta proposta pela rota
 * `/assets/importar`, que devolve os caminhos definitivos — os mesmos que um
 * carregamento manual devolveria, por isso tudo a jusante (rascunho,
 * pré-visualização, PDF) fica igual.
 *
 * Este seletor é o meio minuto que tem de parecer instantâneo. Por isso:
 *   · a grelha mostra a MINIATURA (`thumbUrl`) e só uma PÁGINA de cada vez —
 *     abrir um tema com 2000 fotos custa o mesmo que abrir um com 30;
 *   · o original (`url`, ~3000 px) só é puxado na pré-visualização grande, que
 *     é onde ele faz falta para distinguir duas mesas de terracota;
 *   · o que a biblioteca já leu fica em cache DE MÓDULO: reabrir o diálogo na
 *     mesma sessão não custa pedido nenhum e reabre no mesmo tema, no mesmo
 *     sítio do rolo;
 *   · a CÓPIA saiu do diálogo. Ver mais abaixo.
 *
 * ── Porque é que a cópia deixou de acontecer "dentro" do diálogo ───────────
 *
 * Havia aqui uma barra de progresso. Com 5 fotos ela mostrava exatamente dois
 * estados — 0 % e 100 % —, porque um lote de 8 é UM pedido: a barra não estava
 * a mostrar progresso nenhum, estava a mostrar o princípio e o fim, com o
 * diálogo refém pelo meio. E o diálogo refém é o verdadeiro custo: quem
 * escolheu as fotos já decidiu, não tem mais nada a fazer ali.
 *
 * Agora o botão FECHA o diálogo no instante em que é premido e a cópia
 * continua em segundo plano, num runtime que vive fora do React (ver
 * `startImport`) — por isso sobrevive ao diálogo desaparecer. Cada lote que
 * chega é entregue ao estúdio, com a miniatura que viajou com a cópia: a foto
 * aparece no mood board já leve, no mesmo sítio e com o mesmo aspect-ratio das
 * outras, sem salto de layout e sem um único pedido novo para a VER.
 *
 * ── E agora a foto aparece no INSTANTE do clique ───────────────────────────
 *
 * Faltava o último passo: as fotos só apareciam no estúdio quando a cópia
 * CONFIRMAVA. A objeção da altura era boa — pôr lá um cartão provisório obriga
 * a trocar depois um caminho pelo outro DENTRO do documento, e o documento é do
 * `ProposalStudio`; forçá-lo daqui deixaria caminhos do bucket de TEMAS
 * gravados no rascunho, que é precisamente o que a cópia existe para evitar.
 *
 * O que a resolve é o marcador não ser um caminho: `pending:<uuid>` (ver
 * `PENDING_IMAGE_PREFIX`, em `proposal-doc`) não é morada de coisa nenhuma, em
 * tema nenhum, e é reconhecível por um `startsWith` em qualquer fronteira. E a
 * troca continua a ser do dono do documento: daqui só se ANUNCIA — `onReserve`
 * no instante do clique, o `marcador` dentro de cada imagem entregue quando a
 * cópia confirma, `onDropped` quando não há foto para entregar. Quem escreve no
 * documento é sempre o estúdio, que é também quem filtra os marcadores antes de
 * gravar ou de enviar.
 *
 * Quem não passa `onReserve` continua a receber só o `onPicked` de antes, a
 * acrescentar — o contrato antigo não se partiu, ganhou um degrau.
 *
 * O estado da cópia mora numa pastilha discreta no canto (ver `ImportChip`),
 * fora do diálogo e fora do documento: nunca bloqueia nada, mostra o que
 * falhou, deixa repetir e deixa parar. O aviso de falha é dela e só dela — o
 * estúdio limita-se a tirar o marcador do sítio, sem duplicar a mensagem.
 */

/** Último tema usado, para abrir já no sítio certo na proposta seguinte. */
const LAST_THEME_KEY = "liquen-tema-recente";

/** A partir de quantas fotos o rodapé passa a contar "X de 40": a meio do
 *  caminho, cedo o suficiente para o teto não aparecer de surpresa. */
const COUNTDOWN_FROM = MAX_IMPORT_BATCH / 2;

/** Fotos por pedido de importação.
 *
 *  A rota aceita as 40 de uma assentada, mas isso são ~10 s de silêncio e um
 *  "falhou" que não diz quais. Em lotes de 8 o que falha fica circunscrito ao
 *  lote (as outras já entraram), as primeiras fotos aparecem no estúdio muito
 *  antes das últimas, e a ordem por que a Catarina tocou nas fotos mantém-se —
 *  os lotes são enviados em sequência e cada um preserva a ordem que lhe deram. */
const IMPORT_CHUNK = 8;

/**
 * A partir de quantas fotos é que a pastilha mostra uma BARRA.
 *
 * Abaixo disto a barra mentiria: um lote de 5 fotos é um pedido só, portanto
 * teria dois estados (0 % e 100 %). Acima disto há lotes que cheguem para a
 * barra andar de verdade — e um lote grande demora o suficiente para valer a
 * pena dizer por onde vai.
 */
const BIG_BATCH = 16;

/** Quanto tempo a pastilha fica no ecrã depois de correr tudo bem. O suficiente
 *  para se ler "8 fotos adicionadas", pouco para não virar mobília. */
const DONE_LINGER_MS = 4000;

/**
 * QUANTOS ORIGINAIS SE DESCARREGAM AO MESMO TEMPO nesta grelha.
 *
 * Uma foto sem miniatura (tudo o que foi carregado antes de elas existirem)
 * obriga a puxar o original: ~2,6 MB para desenhar uma célula de 150 px.
 * Medido em Chromium sobre HTTP/2, 60 fotos, 50 Mbit/s partilhados: com os 60
 * pedidos ao mesmo tempo — que é o que o browser faz, e o `loading="lazy"` não
 * trava — a PRIMEIRA foto aparece aos 26 351 ms, porque os 60 downloads
 * repartem o canal e acabam todos no fim. Com um tecto de 3 em voo, a primeira
 * aparece aos 1405 ms e a última não chega mais tarde do que chegava.
 *
 * Às fotos COM miniatura não se põe tecto nenhum: são ~25 KB, e medir mostrou
 * que aí um tecto só atrasa (1019 ms contra 350 ms para as 60).
 *
 * O número é o mesmo da Biblioteca de Temas (`Temas.tsx`) e a fila é a mesma
 * ideia — está aqui repetida, e não partilhada, para este diálogo do estúdio
 * não arrastar para o seu pacote o ecrã inteiro da biblioteca.
 */
const HEAVY_IMAGE_CONCURRENCY = 3;

/** Células da primeira dobra: carregam já e com prioridade (o diálogo mostra
 *  5 colunas, portanto duas linhas). */
const ABOVE_FOLD = 10;

/** Quantas miniaturas se aquecem ao adivinhar um tema (o rato passou por cima
 *  do separador, ou do botão que abre a biblioteca). É a primeira dobra e mais
 *  uma linha: o que ela vai VER antes de rolar. Só miniaturas — aquecer
 *  originais seria trocar 25 KB por 2,6 MB de palpite. */
const WARM_THUMBS = 15;

/** Quanto se espera, depois de a primeira página estar no ecrã, para ir
 *  buscar a seguinte. Ver `Temas.tsx`: a primeira página tem de chegar
 *  primeiro, senão estaríamos a repartir o canal outra vez. */
const PREFETCH_DELAY_MS = 1500;

/** Se um download ficar pendurado, a vez volta ao fim deste tempo. */
const HEAVY_SLOT_TIMEOUT_MS = 30_000;

interface HeavySlot {
  start: () => void;
  started: boolean;
  released: boolean;
}
const heavyWaiting: HeavySlot[] = [];
let heavyLive = 0;

function pumpHeavy() {
  while (heavyLive < HEAVY_IMAGE_CONCURRENCY && heavyWaiting.length > 0) {
    const slot = heavyWaiting.shift();
    if (!slot || slot.released) continue;
    slot.started = true;
    heavyLive += 1;
    slot.start();
  }
}

/** Pede vez para descarregar um original; devolve a função de a largar
 *  (acabou ou desistiu — é idempotente). */
function queueHeavyImage(start: () => void): () => void {
  const slot: HeavySlot = { start, started: false, released: false };
  heavyWaiting.push(slot);
  pumpHeavy();
  return () => {
    if (slot.released) return;
    slot.released = true;
    if (slot.started) {
      heavyLive = Math.max(0, heavyLive - 1);
      pumpHeavy();
      return;
    }
    const i = heavyWaiting.indexOf(slot);
    if (i >= 0) heavyWaiting.splice(i, 1);
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** O que a pastilha de um tema mostra a seguir ao nome. `imageCount` a `null` =
 *  a pasta não pôde ser lida — dizer "0" faria a equipa pensar que as fotos
 *  desapareceram; `truncated` = a contagem é um MÍNIMO ("500+"). */
function themeCountLabel(theme: ThemeSummary): string {
  if (theme.imageCount === null) return "Fotos indisponíveis";
  return theme.truncated ? `${theme.imageCount}+` : `${theme.imageCount}`;
}

/** Junta uma página nova ao que já se mostra, sem repetir. A chave é o `path`
 *  (estável), não a aritmética dos offsets: se entretanto subirem fotos ao
 *  tema, o pior que acontece é uma foto vir duas vezes do servidor — e aqui
 *  fica só uma. */
function mergePage(prev: ThemeImage[], page: ThemeImage[]): ThemeImage[] {
  const seen = new Set(prev.map((i) => i.path));
  return [...prev, ...page.filter((i) => !seen.has(i.path))];
}

/**
 * Uma foto importada, com o caminho de ORIGEM na biblioteca.
 *
 * A cópia para a proposta nasce com um uuid novo, por isso o caminho de
 * destino não diz de onde veio. É este `sourcePath` que o estúdio guarda para
 * poder marcar "já nesta proposta" da próxima vez que o seletor abrir — sem
 * mexer na arrumação do Storage. Vem em falta quando não se consegue
 * emparelhar com segurança; nesse caso perde-se a marca, nada mais.
 */
export interface ImportedImage extends ThemeImage {
  sourcePath?: string;
  /**
   * O marcador provisório que esta cópia vem substituir, quando houve um.
   *
   * Com ele, o estúdio troca o marcador pelo caminho definitivo NO LUGAR (a
   * mesma célula, a mesma ordem); sem ele — quem não reservou nada — a imagem
   * é acrescentada, como sempre foi.
   */
  marcador?: string;
}

/** Uma foto RESERVADA: o lugar já é dela no documento, o caminho ainda não
 *  existe. É o que `onReserve` entrega no instante do clique. */
export interface ReservedImage {
  /** `pending:<uuid>` — nunca um caminho de Storage. */
  marcador: string;
  /** A miniatura que a grelha JÁ desenhou: mostrá-la não custa pedido nenhum. */
  thumbUrl?: string;
  /** A foto da BIBLIOTECA de onde esta vem — é o que deixa marcar "já nesta
   *  proposta" enquanto a cópia ainda vai a caminho. */
  sourcePath: string;
}

/**
 * Um marcador novo. Não é um segredo, só tem de ser único — mas o gerador vive
 * em `id-unico.ts` e não tem `Math.random()` nenhum lá dentro.
 *
 * ── PORQUE É QUE ISTO DEIXOU DE SE CHAMAR «TOKEN» ─────────────────────────
 * Chamava-se, e o resto do ficheiro chamava-lhe marcador — dois nomes para a
 * mesma coisa, que é o género de deriva que faz o próximo leitor procurar duas
 * coisas onde só há uma.
 *
 * E tinha custo a sério: a análise de segurança do GitHub trata um campo
 * chamado `token` como informação sensível, e via-o a ser gravado no
 * `localStorage` junto com o rascunho — «clear text storage of sensitive
 * information», severidade alta. O rascunho já filtra TODOS os marcadores antes
 * de gravar (`semProvisorios`), portanto o achado era falso; mas um aviso alto
 * que se explica de cada vez que aparece é um aviso que um dia se ignora quando
 * for verdadeiro. O nome passou a dizer o que a coisa é.
 */
function novoMarcador(): string {
  return `${PENDING_IMAGE_PREFIX}${idUnico()}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Cache da biblioteca (vive no módulo, sobrevive a fechar o diálogo)
// ───────────────────────────────────────────────────────────────────────────

/** A página guardada de um tema, tolerando "ainda não há tema escolhido" — que
 *  é o estado do diálogo antes de a lista chegar. */
const cachedTheme = (themeId: string | null): PaginaTema | null =>
  themeId ? paginaEmCache(themeId) : null;

/** Onde o rolo ficou, por tema. */
const themeScroll = new Map<string, number>();
/** O tema em que o diálogo estava quando fechou (a memória curta; o
 *  `localStorage` é a longa, entre sessões). */
let lastThemeId: string | null = null;
/** O que ficou por entrar, por proposta: reabrir o seletor traz a seleção de
 *  volta em vez de a obrigar a escolher tudo outra vez. */
const failedByQuote = new Map<string, string[]>();
/** As fotos da biblioteca que JÁ foram copiadas para cada proposta nesta
 *  sessão — a marca "já nesta proposta" aparece sem esperar pelo estúdio. */
const importedByQuote = new Map<string, Set<string>>();

/**
 * Deita fora o que está guardado da biblioteca.
 *
 * O `theme-picker-cache` já se defende do que é velho sozinho, revalidando por
 * trás. Isto é para o caso em que esperar não serve: uma foto foi ADICIONADA
 * ou REMOVIDA num tema (o que acontece no ecrã `Temas`, não aqui) e a abertura
 * seguinte tem de ver isso já, não daqui a meio minuto.
 *
 * Fica à escuta do evento `liquen:biblioteca-alterada` para esse ecrã poder
 * avisar sem que este módulo precise de o conhecer. O que se limpa aqui a mais
 * do que lá é o rolo: a grelha vai mudar de tamanho, e devolver o scroll a uma
 * posição que já não existe deixava-a a olhar para o meio do nada.
 */
export function invalidateThemeLibraryCache(): void {
  esquecerBiblioteca();
  themeScroll.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("liquen:biblioteca-alterada", invalidateThemeLibraryCache);
}

/** Põe as miniaturas na cache do browser antes de a grelha as pedir. */
function warmThumbs(images: readonly ThemeImage[]): void {
  if (typeof window === "undefined" || typeof window.Image !== "function") return;
  for (const im of images.slice(0, WARM_THUMBS)) {
    // Só `thumbUrl`: uma foto sem miniatura custa ~2,6 MB e tem a sua própria
    // fila (ver `HEAVY_IMAGE_CONCURRENCY`). Adivinhar não pode furar essa fila.
    if (!im.thumbUrl) continue;
    const img = new window.Image();
    img.decoding = "async";
    img.src = im.thumbUrl;
  }
}

/** Qual o tema por que o diálogo abre: o desta sessão, o da sessão passada, ou
 *  o primeiro da lista. */
function preferredThemeId(list: readonly ThemeSummary[]): string | null {
  if (lastThemeId && list.some((t) => t.id === lastThemeId)) return lastThemeId;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LAST_THEME_KEY);
  } catch {
    /* localStorage indisponível — segue com o primeiro tema */
  }
  if (saved && list.some((t) => t.id === saved)) return saved;
  return list[0]?.id ?? null;
}

/** Adivinha um tema: metadados + miniaturas, sem nada no ecrã ainda. */
export function prefetchTheme(themeId: string): void {
  const have = cachedTheme(themeId);
  if (have) {
    warmThumbs(have.images);
    return;
  }
  void buscarPrimeiraPagina(themeId)
    .then((entry) => warmThumbs(entry.images))
    .catch(() => {
      /* adivinhar e falhar não é um erro que se mostre: quem abrir pede outra vez */
    });
}

/**
 * Aquece a biblioteca ANTES de o diálogo abrir: a lista de temas e as
 * miniaturas do tema por onde ele vai abrir.
 *
 * Exportada para quem desenha o botão "Escolher da biblioteca de temas" a
 * poder chamar no `onPointerEnter`/`onFocus`. Como esse botão vive noutro
 * ficheiro, há também a rede de segurança abaixo, que apanha o gesto por
 * delegação. Idempotente e barata: com cache, não faz nada.
 */
export function prefetchThemeLibrary(): void {
  void buscarTemas()
    .then((list) => {
      const id = preferredThemeId(list);
      if (id) prefetchTheme(id);
    })
    .catch(() => {});
}

/**
 * O gesto que abre a biblioteca começa a carregá-la.
 *
 * Por delegação no documento, e não por um `onPointerEnter` no botão, porque o
 * botão é do estúdio de propostas. Quem quiser ser explícito marca-o com
 * `data-biblioteca-temas`; sem marca, reconhece-se pelo nome ("Escolher da
 * biblioteca de temas"). Custa uma leitura de `textContent` no rato a passar e
 * o resultado é o diálogo abrir já com as fotos desenhadas.
 */
const OPEN_HINT = /biblioteca de temas/i;
let hintInstalled = false;
function installOpenHint(): void {
  if (hintInstalled || typeof document === "undefined") return;
  hintInstalled = true;
  const hint = (e: Event) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const trigger = el.closest("[data-biblioteca-temas],button,a");
    if (!trigger) return;
    if (
      !trigger.hasAttribute("data-biblioteca-temas") &&
      !OPEN_HINT.test(trigger.textContent ?? "")
    )
      return;
    prefetchThemeLibrary();
  };
  document.addEventListener("pointerover", hint, { passive: true });
  document.addEventListener("focusin", hint, { passive: true });
}
installOpenHint();

// ───────────────────────────────────────────────────────────────────────────
// A cópia, em segundo plano (fora do React, para sobreviver ao diálogo)
// ───────────────────────────────────────────────────────────────────────────

type PhotoState = "pending" | "done" | "failed";

interface JobPhoto {
  /** Caminho na BIBLIOTECA. */
  path: string;
  /** A imagem que a pastilha mostra — a miniatura que a grelha já desenhou,
   *  portanto já está na cache do browser: vê-la não custa pedido nenhum. */
  thumb?: string;
  /** O lugar que esta foto já ocupa no documento (`pending:<uuid>`). Uma
   *  segunda tentativa ganha um marcador NOVO: o anterior já saiu do
   *  documento quando esta foto falhou. */
  marcador: string;
  state: PhotoState;
}

interface ImportJob {
  id: number;
  quoteId: string;
  photos: JobPhoto[];
  /** Onde entregar cada lote que chega. É o `onPicked` tal como estava no
   *  instante do clique — e é isso que faz as fotos irem parar ao mood board
   *  (ou à capa) de onde o diálogo foi aberto, mesmo já com ele fechado. */
  deliver: (images: ImportedImage[]) => void;
  /** Guardar o lugar no documento, no instante do clique. Opcional: quem não
   *  o passa recebe as fotos só quando a cópia confirmar, como antes. */
  reserve?: (reservas: ReservedImage[]) => void;
  /** Estes marcadores já não vão ter foto — tira-os do documento. */
  drop?: (marcadores: string[]) => void;
  running: boolean;
  /** Pediram para parar: o que ainda não saiu não sai. */
  stopping: boolean;
  stopped: boolean;
  /** O pedido que está em voo AGORA, para o "Parar" o poder cortar.
   *
   *  Verificar `stopping` só ENTRE lotes não chegava: com `IMPORT_CHUNK` fotos
   *  ou menos há um lote só, portanto a verificação já tinha passado quando o
   *  botão aparecia, e carregar nele não fazia rigorosamente nada. Era
   *  decorativo exactamente no caso mais comum. */
  emVoo: AbortController | null;
  /** A primeira mensagem de erro do servidor, para se poder dizer porquê. */
  error: string | null;
}

const jobs: ImportJob[] = [];
/** `quoteId\npath` de tudo o que está em voo — a rede contra o duplo clique. */
const inFlight = new Set<string>();
let jobSeq = 0;

const flightKey = (quoteId: string, path: string) => `${quoteId}\n${path}`;

// Um contador de versão como estado externo: quem depende disto (a pastilha e
// o próprio diálogo) volta a desenhar; a informação verdadeira lê-se de `jobs`.
let version = 0;
const listeners = new Set<() => void>();
function emit(): void {
  version += 1;
  for (const l of Array.from(listeners)) l();
  syncOverlay();
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => version;
function useImportRuntime(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** As fotos desta proposta que estão a ser copiadas AGORA. */
function pendingSources(quoteId: string): Set<string> {
  const out = new Set<string>();
  for (const job of jobs) {
    if (job.quoteId !== quoteId) continue;
    for (const p of job.photos) if (p.state === "pending") out.add(p.path);
  }
  return out;
}

/** As fotos desta proposta que já foram copiadas nesta sessão. */
function importedSources(quoteId: string): ReadonlySet<string> {
  return importedByQuote.get(quoteId) ?? new Set<string>();
}

/** O que ficou por entrar nesta proposta, à espera de uma segunda tentativa. */
function failedFor(quoteId: string): string[] {
  return failedByQuote.get(quoteId) ?? [];
}

function clearFailed(quoteId: string): void {
  if (failedByQuote.delete(quoteId)) emit();
}

function rememberImported(quoteId: string, path: string): void {
  const set = importedByQuote.get(quoteId) ?? new Set<string>();
  set.add(path);
  importedByQuote.set(quoteId, set);
}

function mark(job: ImportJob, path: string, state: PhotoState): void {
  const photo = job.photos.find((p) => p.path === path);
  if (photo) photo.state = state;
}

/**
 * Põe a copiar as fotos escolhidas e devolve o número do lote (0 = não havia
 * nada por copiar).
 *
 * Tudo o que já vai a caminho é descartado aqui, em silêncio e de forma
 * síncrona — é isto que faz do duplo clique (ou do segundo clique numa rede
 * lenta) um não-acontecimento em vez de uma importação a dobrar.
 */
function startImport(opts: {
  quoteId: string;
  images: readonly ThemeImage[];
  deliver: (images: ImportedImage[]) => void;
  reserve?: (reservas: ReservedImage[]) => void;
  drop?: (marcadores: string[]) => void;
}): number {
  const photos: JobPhoto[] = [];
  const seen = new Set<string>();
  for (const im of opts.images) {
    if (seen.has(im.path)) continue;
    seen.add(im.path);
    const key = flightKey(opts.quoteId, im.path);
    if (inFlight.has(key)) continue;
    inFlight.add(key);
    photos.push({
      path: im.path,
      thumb: im.thumbUrl || im.url || undefined,
      marcador: novoMarcador(),
      state: "pending",
    });
  }
  if (photos.length === 0) return 0;

  const job: ImportJob = {
    id: ++jobSeq,
    quoteId: opts.quoteId,
    photos,
    deliver: opts.deliver,
    reserve: opts.reserve,
    drop: opts.drop,
    running: true,
    stopping: false,
    stopped: false,
    emVoo: null,
    error: null,
  };
  jobs.push(job);
  // O lugar é guardado AQUI, antes de qualquer viagem à rede: é isto que faz a
  // foto aparecer no mood board no mesmo gesto em que o diálogo fecha.
  reservePhotos(job, photos);
  emit();
  void runJob(job);
  return job.id;
}

/** Anuncia os lugares destas fotos a quem abriu o seletor. */
function reservePhotos(job: ImportJob, photos: readonly JobPhoto[]): void {
  if (!job.reserve || photos.length === 0) return;
  job.reserve(photos.map((p) => ({ marcador: p.marcador, thumbUrl: p.thumb, sourcePath: p.path })));
}

async function runJob(job: ImportJob): Promise<void> {
  job.running = true;
  job.error = null;
  job.stopped = false;

  const queue = job.photos.filter((p) => p.state === "pending").map((p) => p.path);
  /** O marcador que uma foto da biblioteca ocupa neste lote. */
  const marcadorDe = (path: string) => job.photos.find((p) => p.path === path)?.marcador;
  /** Estes lugares ficaram sem foto: saem do documento (a pastilha é que
   *  avisa; aqui só se desocupa o sítio). */
  const largar = (paths: readonly string[]) => {
    if (!job.drop) return;
    const marcadores = paths.map(marcadorDe).filter((t): t is string => !!t);
    if (marcadores.length > 0) job.drop(marcadores);
  };

  for (let i = 0; i < queue.length; i += IMPORT_CHUNK) {
    if (job.stopping) {
      job.stopped = true;
      break;
    }
    const chunk = queue.slice(i, i + IMPORT_CHUNK);
    try {
      job.emVoo = new AbortController();
      const res = await fetch(`/api/orcamento/${job.quoteId}/assets/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: chunk }),
        signal: job.emVoo.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao adicionar as imagens.");
      const copied: ImportedImage[] = Array.isArray(data?.images) ? data.images : [];
      const failedHere: string[] = Array.isArray(data?.failed) ? data.failed : [];
      // A ORIGEM de cada foto vem agora NA RESPOSTA (`sourcePath`), desde que a
      // rota deixou de copiar bytes e passou a devolver referências à
      // biblioteca: ela sabe-a de certeza e nós deixámos de a ter de deduzir
      // pela posição.
      //
      // O emparelhamento posicional fica como plano B, para uma resposta antiga
      // (um separador aberto durante um deploy) que chegue sem o campo. Se nem
      // isso bater certo, prefere-se ficar sem a marca "já nesta proposta" a
      // inventar uma origem errada.
      const sources = chunk.filter((p) => !failedHere.includes(p));
      const daResposta = copied.length > 0 && copied.every((im) => !!im.sourcePath);
      const aligned = daResposta || sources.length === copied.length;
      // Sem emparelhamento seguro não há troca no lugar: as fotos entram na
      // mesma, pelo caminho de acrescentar, e os lugares reservados saem. Uma
      // foto no fim do mood board é um contratempo; uma foto trocada com outra
      // é uma proposta errada.
      const picked: ImportedImage[] = copied.map((im, k) => {
        const origem = im.sourcePath ?? sources[k];
        return aligned && origem
          ? { ...im, sourcePath: origem, marcador: marcadorDe(origem) }
          : { ...im };
      });
      for (const p of sources) {
        mark(job, p, "done");
        if (aligned) rememberImported(job.quoteId, p);
      }
      for (const p of failedHere) mark(job, p, "failed");
      largar(aligned ? failedHere : chunk);
      if (picked.length > 0) job.deliver(picked);
    } catch (err) {
      // Um lote cortado pelo "Parar" não é uma avaria: ela mandou-o parar. Sem
      // esta distinção a pastilha mostrava "The user aborted a request" como se
      // fosse o servidor a queixar-se.
      const abortado = err instanceof DOMException && err.name === "AbortError";
      if (!job.error && !abortado) {
        job.error = err instanceof Error ? err.message : "Falha ao adicionar as imagens.";
      }
      for (const p of chunk) mark(job, p, "failed");
      largar(chunk);
      // O `finally` faz a limpeza à mesma — sair daqui não a salta.
      if (abortado) {
        job.stopped = true;
        break;
      }
    } finally {
      for (const p of chunk) inFlight.delete(flightKey(job.quoteId, p));
      job.emVoo = null;
    }
    emit();
  }

  // Parar é parar o que falta E o que ia a caminho (ver `stopJob`). O que aqui
  // sobra são as fotos que nunca chegaram a sair: saem do documento pelo
  // `largar`, senão ficavam lugares reservados à espera de uma foto que já
  // ninguém foi buscar.
  const abandonadas: string[] = [];
  for (const p of job.photos) {
    if (p.state !== "pending") continue;
    p.state = "failed";
    abandonadas.push(p.path);
    inFlight.delete(flightKey(job.quoteId, p.path));
  }
  largar(abandonadas);

  job.running = false;
  // O que este lote deixou por entrar junta-se ao que já estava à espera (pode
  // haver mais do que um lote a caminho da mesma proposta) e tira de lá o que
  // este conseguiu.
  const failed = job.photos.filter((p) => p.state === "failed").map((p) => p.path);
  const done = new Set(job.photos.filter((p) => p.state === "done").map((p) => p.path));
  const carried = failedFor(job.quoteId).filter((p) => !done.has(p) && !failed.includes(p));
  const next = [...carried, ...failed];
  if (next.length > 0) failedByQuote.set(job.quoteId, next);
  else failedByQuote.delete(job.quoteId);
  emit();

  if (failed.length === 0) {
    window.setTimeout(() => dismissJob(job.id), DONE_LINGER_MS);
  }
}

function stopJob(id: number): void {
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  job.stopping = true;
  // Corta o pedido que está a decorrer, não só o lote seguinte — senão, no caso
  // de um lote único, o "Parar" não parava nada. O servidor pode já ter copiado
  // alguma coisa: essas fotos ficam no bucket sem entrar na proposta, que é
  // exactamente o que acontece a qualquer falha de rede, e é preferível a
  // deixá-la a olhar para um pedido que ela mandou parar.
  job.emVoo?.abort();
  emit();
}

function retryJob(id: number): void {
  const job = jobs.find((j) => j.id === id);
  if (!job || job.running) return;
  job.stopping = false;
  job.stopped = false;
  const outra_vez: JobPhoto[] = [];
  for (const p of job.photos) {
    if (p.state !== "failed") continue;
    p.state = "pending";
    // Marcador NOVO: o de que esta foto era dona já saiu do documento quando
    // ela falhou. Reaproveitá-lo seria pedir ao estúdio para trocar um lugar
    // que já não existe.
    p.marcador = novoMarcador();
    outra_vez.push(p);
    inFlight.add(flightKey(job.quoteId, p.path));
  }
  reservePhotos(job, outra_vez);
  emit();
  void runJob(job);
}

function dismissJob(id: number): void {
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0) return;
  const [job] = jobs.splice(i, 1);
  // Descartar esta pastilha esquece o que ELA tinha por entrar — nunca o que
  // ficou de outro lote da mesma proposta.
  const gone = new Set(job.photos.map((p) => p.path));
  const rest = failedFor(job.quoteId).filter((p) => !gone.has(p));
  if (rest.length > 0) failedByQuote.set(job.quoteId, rest);
  else failedByQuote.delete(job.quoteId);
  emit();
}

// ── A pastilha, na proposta e fora do diálogo ──────────────────────────────
//
// Vive na sua própria raiz de React, colada ao `body`: é o que lhe permite
// continuar no ecrã depois de o diálogo (que é quem a manda começar)
// desaparecer da árvore. Fixa no canto, sem fundo por cima de nada — não
// bloqueia o estúdio nem o diálogo.

let overlayRoot: Root | null = null;
let overlayHost: HTMLElement | null = null;
let overlayTeardown = 0;

function syncOverlay(): void {
  if (typeof document === "undefined" || !document.body) return;
  if (jobs.length > 0) {
    if (overlayTeardown) {
      window.clearTimeout(overlayTeardown);
      overlayTeardown = 0;
    }
    if (overlayRoot) return;
    overlayHost = document.createElement("div");
    overlayHost.setAttribute("data-importacoes", "");
    document.body.appendChild(overlayHost);
    overlayRoot = createRoot(overlayHost);
    overlayRoot.render(<ImportOverlay />);
    return;
  }
  if (!overlayRoot || overlayTeardown) return;
  // Desmontar uma raiz a partir de dentro de uma renderização é proibido —
  // isto chega sempre de um `emit()`, que pode vir de um evento. Sai do caminho.
  overlayTeardown = window.setTimeout(() => {
    overlayTeardown = 0;
    if (jobs.length > 0) return;
    overlayRoot?.unmount();
    overlayRoot = null;
    overlayHost?.remove();
    overlayHost = null;
  }, 0);
}

function ImportOverlay() {
  useImportRuntime();
  if (jobs.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-[70] flex max-w-[calc(100vw-3rem)] flex-col gap-2 sm:max-w-sm">
      {jobs.map((job) => (
        <ImportChip key={job.id} job={job} />
      ))}
    </div>
  );
}

function ImportChip({ job }: { job: ImportJob }) {
  const total = job.photos.length;
  const done = job.photos.filter((p) => p.state === "done").length;
  const failed = job.photos.filter((p) => p.state === "failed").length;
  const settled = !job.running;
  const withBar = total > BIG_BATCH && job.running;

  const message = job.running
    ? `A adicionar ${plural(total, "foto", "fotos")} à proposta…`
    : failed === 0
      ? `${plural(done, "foto adicionada", "fotos adicionadas")} à proposta.`
      : job.stopped
        ? `Parou — ${plural(failed, "foto ficou", "fotos ficaram")} por adicionar.`
        : `${plural(failed, "foto não entrou", "fotos não entraram")} na proposta.`;

  return (
    <div
      role="group"
      aria-label="Fotos a caminho da proposta"
      className={`pointer-events-auto rounded-xl border bg-white px-4 py-3 shadow-xl shadow-black/10 ${
        settled && failed > 0 ? "border-[#8a2a22]/25" : "border-foreground/10"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* As mesmas miniaturas que a grelha desenhou: já estão na cache do
            browser, portanto vê-las aqui não custa um pedido novo. */}
        <div className="flex shrink-0 -space-x-2" aria-hidden="true">
          {job.photos.slice(0, 4).map((p) => (
            <span
              key={p.path}
              className={`block h-7 w-7 overflow-hidden rounded-md border-2 border-white bg-foreground/[0.06] ${
                p.state === "pending" ? "opacity-55" : ""
              } ${p.state === "failed" ? "ring-2 ring-[#8a2a22]/60" : ""}`}
            >
              {p.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb} alt="" decoding="async" className="h-full w-full object-cover" />
              )}
            </span>
          ))}
          {total > 4 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-white bg-foreground/[0.08] text-[10px] text-foreground/70">
              +{total - 4}
            </span>
          )}
        </div>
        <p role="status" aria-live="polite" className="min-w-0 flex-1 text-sm text-foreground/80">
          {message}
        </p>
      </div>

      {withBar && (
        <div
          role="progressbar"
          aria-label="Progresso da importação"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done + failed}
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
        >
          <div
            className="h-full rounded-full bg-[#4d6350] motion-safe:transition-[width] motion-safe:duration-300"
            style={{ width: `${Math.round(((done + failed) / total) * 100)}%` }}
          />
        </div>
      )}

      {settled && failed > 0 && (
        <>
          <p className="bo-text-muted mt-1 text-xs">
            {done > 0 ? `${done} entraram. ` : ""}
            {job.error && !job.stopped ? job.error : "Continuam por adicionar — podes repetir."}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => retryJob(job.id)}>
              Repetir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismissJob(job.id)}>
              Descartar
            </Button>
          </div>
        </>
      )}

      {job.running && (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => stopJob(job.id)}>
            Parar
          </Button>
        </div>
      )}
    </div>
  );
}

/** A página seguinte, pedida antes de ela a pedir. Guarda o tema e o offset com
 *  que foi buscada: só encaixa onde foi pedida. */
interface Ahead {
  themeId: string;
  offset: number;
  images: ThemeImage[];
  total: number | null;
  truncated: boolean;
  full: boolean;
}

interface Props {
  quoteId: string;
  /** `false` para as capas (uma imagem por espaço). */
  multiple: boolean;
  /** Caminhos da BIBLIOTECA (`<tema>/<ficheiro>`) que já foram importados para
   *  esta proposta. Só serve para marcar a grelha — escolher outra vez é
   *  permitido (a mesma foto pode estar na capa e num mood board). */
  usedThemePaths?: readonly string[];
  /**
   * As fotos que já foram para OUTROS casamentos, e para onde.
   *
   * Chave: o caminho na biblioteca. Valor: a frase já escrita ("Ana e Rui,
   * 12 set 2026"). Não impede nada — repetir pode ser a decisão certa quando os
   * dois casamentos estão em pontas opostas do país. O que faz a repetição doer
   * é a proximidade, e por isso o que se mostra é ONDE foi, não um "não".
   */
  usadasNoutras?: Readonly<Record<string, string>>;
  onClose: () => void;
  /** Uma cópia confirmada. Traz o `marcador` do lugar que veio ocupar, quando
   *  houve reserva; sem `marcador`, é para acrescentar. */
  onPicked: (images: ImportedImage[]) => void;
  /** No INSTANTE do clique: estas fotos vão a caminho, guardem-lhes o lugar.
   *  Sem isto o seletor comporta-se como antes (a foto só aparece no fim). */
  onReserve?: (reservas: ReservedImage[]) => void;
  /** Estes lugares ficaram sem foto — a pastilha já avisa porquê. */
  onDropped?: (marcadores: string[]) => void;
}

export default function ThemePicker({
  quoteId,
  multiple,
  usedThemePaths,
  usadasNoutras,
  onClose,
  onPicked,
  onReserve,
  onDropped,
}: Props) {
  const { toast } = useToast();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  // O fundo não anda enquanto isto está à frente. `true` como o `useFocusTrap`
  // ao lado: este diálogo só existe montado, portanto estar montado É estar
  // aberto. Era um dos dois que faltavam quando o trinco passou a ser da casa.
  useTrincoDeScroll(true);
  const tick = useImportRuntime();

  // O que já está em cache entra no estado LOGO no primeiro desenho: reabrir o
  // diálogo na mesma sessão mostra a grelha desenhada, sem esqueleto nem
  // pedido — e sem um instante de "este tema não tem fotos".
  const [themes, setThemes] = useState<ThemeSummary[]>(() => temasEmCache() ?? []);
  const [loadingThemes, setLoadingThemes] = useState(() => temasEmCache() === null);
  /**
   * Começa JÁ num tema, sem esperar por rede nenhuma.
   *
   * Com a lista em cache, é o tema PREFERIDO — o desta sessão, o da sessão
   * passada, ou o primeiro —, validado contra a lista e portanto certo.
   *
   * ── Sem cache: um palpite, e o bloqueio que ele tira ──────────────────
   * Antes o `themeId` só era decidido DEPOIS de `/api/temas` responder, e o
   * efeito das imagens depende dele. Ou seja: enquanto a lista de temas não
   * chegasse, não se pedia UMA ÚNICA imagem. Era exactamente isso que se via —
   * os separadores com as contagens apareciam logo e a grelha ficava em
   * cinzento durante segundos. Quatro idas ao servidor antes do primeiro pixel.
   *
   * Mas o id do último tema já está aqui (a memória curta desta sessão) ou no
   * `localStorage`: não é preciso perguntar a ninguém. Assim as imagens e a
   * lista passam a ser pedidas EM PARALELO. É um PALPITE — pode apontar para um
   * tema entretanto apagado —, e é o efeito da lista, mais abaixo, que o
   * corrige quando estiver errado.
   *
   * Ler `localStorage` no desenho é seguro AQUI, e não seria em qualquer sítio:
   * este diálogo vive atrás de `{picker && …}` no estúdio, portanto só monta
   * depois de um clique e nunca faz parte do HTML do servidor — não há
   * hidratação com que discordar.
   */
  const [themeId, setThemeId] = useState<string | null>(() => {
    const list = temasEmCache();
    if (list) return preferredThemeId(list);
    if (lastThemeId) return lastThemeId;
    try {
      return localStorage.getItem(LAST_THEME_KEY);
    } catch {
      return null; // localStorage indisponível — espera-se pela lista
    }
  });

  /** As fotos JÁ CARREGADAS, mais recentes primeiro — sempre um PREFIXO da
   *  lista do servidor, que é o que faz do `images.length` um offset válido. */
  const [images, setImages] = useState<ThemeImage[]>(() => cachedTheme(themeId)?.images ?? []);
  const [total, setTotal] = useState<number | null>(() => cachedTheme(themeId)?.total ?? null);
  const [truncated, setTruncated] = useState(() => cachedTheme(themeId)?.truncated ?? false);
  /** A última página veio cheia → é provável que haja mais. */
  const [pageFull, setPageFull] = useState(() => cachedTheme(themeId)?.pageFull ?? false);
  /** A pasta não pôde ser LIDA. Não é o mesmo que "tema sem fotos". */
  const [unreadable, setUnreadable] = useState(false);
  const [loadingImages, setLoadingImages] = useState(() => cachedTheme(themeId) === null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** A página seguinte, já pedida e guardada — ver o efeito de adiantamento. */
  const [ahead, setAhead] = useState<Ahead | null>(null);

  /** A seleção sobrevive à troca de tema (é uma lista de caminhos, não de
   *  índices) e volta a aparecer quando o que ficou por entrar espera por uma
   *  segunda tentativa. */
  const [selected, setSelected] = useState<string[]>(() => {
    const carried = failedFor(quoteId);
    return multiple ? carried.slice(0, MAX_IMPORT_BATCH) : carried.slice(0, 1);
  });
  /**
   * Filtro dos temas, por nome e pela nota interna.
   *
   * A nota é o campo onde já vivem as etiquetas na prática — «tons quentes,
   * para espaços de pedra». Não há um campo de etiquetas a sério, e inventar
   * um exigia um sítio para as gerir, uma migração e um hábito novo; procurar
   * na nota dá o mesmo resultado com o que já existe.
   */
  const [procuraTema, setProcuraTema] = useState("");
  /** Qual a célula que responde ao Tab (roving tabindex). */
  const [focusIndex, setFocusIndex] = useState(0);
  /** Foto aberta em grande, por índice na grelha. */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  /** Onde começou o intervalo do Shift (clique ou seta). */
  const anchor = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** O rolo volta ao sítio uma vez por tema, não a cada renderização. */
  const restoreScroll = useRef(true);
  /** O pedido de importação que está em voo AGORA.
   *
   *  Sem isto, o "Parar" só era lido ENTRE lotes: com 8 fotos ou menos há um
   *  lote só, portanto a verificação já tinha passado quando o botão ficava
   *  disponível e carregar nele não fazia rigorosamente nada. Era decorativo
   *  exactamente no caso mais comum. */
  const emVoo = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Fechar o diálogo a meio de uma importação não pode deixar um pedido
      // pendurado a escrever para um ecrã que já não existe.
      emVoo.current?.abort();
      emVoo.current = null;
    };
  }, []);

  /** A memória curta desta sessão acompanha o tema que está no ecrã: reabrir o
   *  diálogo volta a este, mesmo que ela nunca tenha trocado de separador. */
  useEffect(() => {
    if (themeId) lastThemeId = themeId;
  }, [themeId]);

  /** A lista de temas, para LEITURA dentro de efeitos que não se devem repetir
   *  quando ela chega.
   *
   *  Pô-la nas dependências do efeito das imagens custava um pedido inteiro a
   *  mais: as imagens partiam a +72 ms (bem), a lista respondia a +1500 ms, e
   *  o efeito corria OUTRA VEZ a pedir exactamente as mesmas imagens. Medido, e
   *  visível no terceiro pedido do varrimento. Com a ref lê-se o valor mais
   *  recente sem que a mudança dispare nada. */
  const themesRef = useRef<ThemeSummary[]>(temasEmCache() ?? []);
  useEffect(() => {
    themesRef.current = themes;
  }, [themes]);

  // O `tick` do runtime entra nestas memórias porque é ele que diz que algo
  // mudou lá fora (um lote arrancou, chegou ou falhou) — o valor em si não
  // interessa a ninguém.
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  /** As que estão a ser copiadas AGORA: escolher outra vez seria importar a
   *  dobrar, por isso o toque é ignorado em silêncio. */
  const pendingSet = useMemo(() => pendingSources(quoteId), [quoteId, tick]);
  const usedSet = useMemo(() => {
    const set = new Set<string>(usedThemePaths ?? []);
    for (const p of importedSources(quoteId)) set.add(p);
    return set;
  }, [usedThemePaths, quoteId, tick]);
  /** O que não entrou na última tentativa — continua selecionado e marcado. */
  const failedPaths = useMemo(() => failedFor(quoteId), [quoteId, tick]);
  /** O que a grelha está a mostrar, para a seleção poder falar de outros temas. */
  const visiblePaths = useMemo(() => new Set(images.map((i) => i.path)), [images]);

  // O que ficou por entrar volta a ficar selecionado — inclusive quando falha
  // com o diálogo ainda aberto ("Adicionar e continuar"). A seleção nunca se
  // perde por uma falha de rede.
  const failedKey = failedPaths.join("\n");
  useEffect(() => {
    // Nas capas é uma foto por espaço: a que ficou por entrar já veio
    // selecionada na montagem, e juntar mais seria mentir sobre o espaço.
    if (failedPaths.length === 0 || !multiple) return;
    setSelected((prev) => {
      const have = new Set(prev);
      const next = prev.slice();
      for (const p of failedPaths) {
        if (have.has(p) || next.length >= MAX_IMPORT_BATCH) continue;
        next.push(p);
      }
      return next.length === prev.length ? prev : next;
    });
    // `failedKey` é o conteúdo da lista; a lista em si muda de referência a
    // cada `tick` do runtime e voltaria a correr isto sem nada ter mudado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedKey]);

  /** Passa o diálogo para um tema, usando o que já está em cache se lá estiver
   *  (sem esqueleto, sem pedido). Um só sítio a mexer nestes estados. */
  const showTheme = useCallback((id: string) => {
    const cached = cachedTheme(id);
    setThemeId(id);
    lastThemeId = id;
    setImages(cached?.images ?? []);
    setTotal(cached?.total ?? null);
    setTruncated(cached?.truncated ?? false);
    setPageFull(cached?.pageFull ?? false);
    setUnreadable(false);
    setLoadingImages(cached === null);
    setFocusIndex(0);
    setPreviewIndex(null);
    setAhead(null);
    anchor.current = null;
    restoreScroll.current = true;
  }, []);

  // ── Temas disponíveis ──
  useEffect(() => {
    // Já vieram da cache no primeiro desenho: reabrir não custa um pedido.
    if (temasEmCache()) return;
    let active = true;
    (async () => {
      try {
        const list = await buscarTemas();
        if (!active) return;
        setThemes(list);
        // A lista chega DEPOIS de já se estarem a pedir as imagens do tema
        // adivinhado. Aqui só se corrige o palpite quando ele estava errado: o
        // tema guardado foi apagado, ou nunca houve nenhum. Quando estava
        // certo — o caso normal — não se mexe em nada, e mexer seria voltar a
        // pedir as mesmas imagens e perder o rolo.
        setThemeId((atual) => {
          if (atual && list.some((t) => t.id === atual)) return atual;
          return preferredThemeId(list);
        });
      } catch {
        if (active) toast("Não foi possível carregar os temas.", "error");
      } finally {
        if (active) setLoadingThemes(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  // ── Primeira página de fotos do tema selecionado ──
  // Só esta página é assinada pelo servidor; o resto vem em "Mostrar mais".
  useEffect(() => {
    if (!themeId) return;
    // Em cache: o `showTheme` já a pôs no ecrã.
    if (cachedTheme(themeId)) return;
    let active = true;

    /** Põe uma página no ecrã. Serve tanto para a que veio da cache como para a
     *  que veio da rede — é o mesmo desenho, e é isso que faz a revalidação
     *  passar despercebida quando nada mudou. */
    const mostrar = (pagina: PaginaTema) => {
      setImages(pagina.images);
      setTotal(pagina.total);
      setTruncated(pagina.truncated);
      setPageFull(pagina.pageFull);
      setUnreadable(pagina.unreadable);
    };

    setFocusIndex(0);
    anchor.current = null;

    // ── Já cá está? Então aparece JÁ, sem skeleton e sem pedido nenhum ────
    const guardada = paginaEmCache(themeId);
    if (guardada) {
      mostrar(guardada);
      setLoadingImages(false);
      // Se tiver alguma idade, confirma-se por trás — sem skeleton, sem
      // mexer no que está no ecrã até haver resposta. Reabrir de seguida (o
      // caso real, entre dois mood boards) não gasta pedido nenhum.
      if (vaiRevalidar(guardada.at)) {
        void buscarPrimeiraPagina(themeId, true)
          .then((fresca) => {
            if (active) mostrar(fresca);
          })
          .catch(() => {
            /* a confirmação falhou — fica o que já estava, que é melhor do que
               um erro por uma coisa que ela nem pediu */
          });
      }
      return () => {
        active = false;
      };
    }

    setLoadingImages(true);
    setImages([]);
    setTotal(null);
    setTruncated(false);
    setPageFull(false);
    setUnreadable(false);
    (async () => {
      // Vai haver pedido: a grelha está a CARREGAR, não vazia. Sem isto, o
      // tema corrigido depois de um palpite errado passava um instante pela
      // mensagem de "este tema não tem fotos".
      setLoadingImages(true);
      try {
        mostrar(await buscarPrimeiraPagina(themeId));
      } catch (err) {
        // O tema que veio do `localStorage` pode já não existir — foi apagado
        // desde a última vez. Isso é um 404 ESPERADO, e não uma avaria: a lista
        // de temas está a chegar e vai corrigir a escolha sozinha, o que faz
        // este efeito correr outra vez no tema certo. Queixar-se aqui era
        // mostrar um erro por causa de um palpite nosso.
        const foi404 = err instanceof Error && err.message === "404";
        if (foi404 && !themesRef.current.some((t) => t.id === themeId)) return;
        if (active) toast("Não foi possível carregar as fotos deste tema.", "error");
      } finally {
        if (active) setLoadingImages(false);
      }
    })();
    return () => {
      active = false;
    };
    // `themes` NÃO entra aqui de propósito — é lido pela ref. Pô-lo nas
    // dependências fazia o efeito correr outra vez quando a lista chegasse, a
    // repedir as mesmas imagens que já estavam a caminho.
  }, [themeId, toast]);

  // O que a grelha tem passa a ser o que a cache tem — incluindo as páginas
  // que ela mandou vir com "Mostrar mais". Reabrir devolve o rolo inteiro.
  useEffect(() => {
    if (!themeId || loadingImages || unreadable || images.length === 0) return;
    guardarPagina(themeId, {
      images,
      total: total ?? images.length,
      truncated,
      pageFull,
      unreadable: false,
    });
  }, [themeId, images, total, truncated, pageFull, loadingImages, unreadable]);

  // O rolo volta ao sítio onde ficou neste tema (uma vez, quando há fotos).
  useEffect(() => {
    if (!themeId || images.length === 0 || !restoreScroll.current) return;
    restoreScroll.current = false;
    // Sempre atribuído, mesmo a 0: trocar de um tema rolado para um por
    // estrear tem de começar no princípio, não a meio da grelha nova.
    if (scrollRef.current) scrollRef.current.scrollTop = themeScroll.get(themeId) ?? 0;
  }, [themeId, images.length]);

  /** O offset seguinte é sempre quantas fotos já temos: `images` é um prefixo
   *  exato da lista do servidor (ver `mergePage`). */
  const nextOffset = images.length;
  const remaining = total === null ? null : Math.max(0, total - images.length);
  const hasMore = pageFull || (remaining !== null && remaining > 0);

  /** Junta ao ecrã uma página que já veio do servidor (pedida agora ou de
   *  antemão) — um só sítio a mexer nestes quatro estados. */
  const absorb = useCallback(
    (page: ThemeImage[], pageTotal: number | null, pageTruncated: boolean, full: boolean) => {
      setImages((prev) => mergePage(prev, page));
      if (pageTotal !== null) setTotal(pageTotal);
      setTruncated(pageTruncated);
      setPageFull(full);
    },
    [],
  );

  async function loadMore() {
    if (loadingMore || !themeId) return;
    // Já cá está: o "Mostrar mais" é instantâneo (foi pedida 1,5 s depois de a
    // primeira página aparecer).
    if (ahead && ahead.themeId === themeId && ahead.offset === images.length) {
      const next = ahead;
      setAhead(null);
      absorb(next.images, next.total, next.truncated, next.full);
      return;
    }
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/temas/${themeId}/imagens?offset=${nextOffset}&limit=${THEME_PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("falhou");
      const data = await res.json();
      if (!alive.current) return;
      const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
      absorb(
        page,
        typeof data?.total === "number" ? data.total : null,
        Boolean(data?.truncated),
        page.length >= THEME_PAGE_SIZE,
      );
    } catch {
      toast("Não foi possível carregar mais fotos.", "error");
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }

  /**
   * A PÁGINA SEGUINTE, ANTES DE ELA A PEDIR.
   *
   * Uma só, e só depois de a primeira estar no ecrã. Guarda o TEMA e o OFFSET
   * com que foi pedida: mudar de tema (ou a grelha crescer) invalida-a, senão
   * o "Mostrar mais" colava fotos do tema errado.
   */
  // Uma página guardada só serve no tema e no sítio para onde foi pedida —
  // lê-se aqui em vez de se apagar dentro do efeito (seria uma renderização a
  // mais para dizer o que já se sabe daqui).
  const aheadFits = ahead !== null && ahead.themeId === themeId && ahead.offset === images.length;
  useEffect(() => {
    if (!themeId || loadingImages || loadingMore || !hasMore || aheadFits) return;
    let cancelled = false;
    const offset = images.length;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const res = await fetch(
            `/api/temas/${themeId}/imagens?offset=${offset}&limit=${THEME_PAGE_SIZE}`,
            { cache: "no-store" },
          );
          if (!res.ok) return;
          const data = await res.json();
          if (cancelled || !alive.current) return;
          const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
          if (page.length === 0) return;
          setAhead({
            themeId,
            offset,
            images: page,
            total: typeof data?.total === "number" ? data.total : null,
            truncated: Boolean(data?.truncated),
            full: page.length >= THEME_PAGE_SIZE,
          });
        } catch {
          // Adivinhar e falhar não é um erro que se mostre: o botão continua a
          // fazer o pedido à mão, com a sua própria mensagem.
        }
      })();
    }, PREFETCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [themeId, loadingImages, loadingMore, hasMore, aheadFits, images.length]);

  // `dismiss`/`importSelected` e não `close`/`confirm`: os nomes curtos
  // escondiam o `window.close`/`window.confirm` — e o `window.confirm()` é o
  // idioma de confirmação desta ferramenta, não se pode ficar ambíguo.
  //
  // Fechar deixou de ter de esperar por nada: a cópia não vive aqui dentro.
  const dismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  // Escape fecha — primeiro a pré-visualização, só depois o diálogo (o foco
  // fica preso dentro do diálogo pelo useFocusTrap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (previewIndex !== null) {
        setPreviewIndex(null);
        // O foco volta à célula de onde a foto foi aberta — senão caía no
        // corpo do diálogo e o Tab seguinte recomeçava do princípio.
        setFocusIndex(previewIndex);
        gridRef.current?.querySelector<HTMLElement>(`[data-cell="${previewIndex}"]`)?.focus();
        return;
      }
      dismiss();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dismiss, previewIndex]);

  /** Os temas a mostrar, já filtrados. Sem acentos nem maiúsculas: «terracota»
   *  tem de encontrar «Terracotta». */
  const temasVisiveis = (() => {
    const q = procuraTema
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (!q) return themes;
    const limpo = (t: string) =>
      (t ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return themes.filter((t) => limpo(t.name).includes(q) || limpo(t.notes ?? "").includes(q));
  })();

  function pickTheme(id: string) {
    if (id === themeId) return;
    // A SELEÇÃO FICA.
    //
    // Antes, mudar de tema esvaziava-a — o que obrigava a fazer uma importação
    // por tema, e tornava impossível montar um mood board com fotos de dois
    // sítios sem repetir o percurso todo. Como a seleção é um conjunto de
    // CAMINHOS (e não de índices da grelha), guardá-la entre temas não custa
    // nada: a grelha marca as do tema à vista, e o rodapé conta todas.
    //
    // O `showTheme` trata do resto dos estados (imagens, foco, pré-visualização,
    // rolo) num sítio só.
    //
    // O que ficou por entrar NÃO se limpa aqui, ao contrário do que o ramo base
    // fazia: nesta arquitectura essa lista é do PEDIDO e não do tema (vive no
    // runtime de importação, ver `failedFor`), e limpá-la ao mudar de separador
    // apagava o que estava à espera de uma segunda tentativa noutro tema.
    showTheme(id);
    try {
      localStorage.setItem(LAST_THEME_KEY, id);
    } catch {
      /* não essencial */
    }
  }

  // ── Seleção ────────────────────────────────────────────────────────────────

  /** Junta caminhos à seleção pela ORDEM dada, parando no teto do lote. */
  function addUpToLimit(base: string[], paths: string[]): { next: string[]; capped: boolean } {
    const next = base.slice();
    const have = new Set(next);
    for (const p of paths) {
      if (have.has(p)) continue;
      // Já vai a caminho: escolher outra vez seria pedir a mesma cópia duas
      // vezes. Salta-se sem dizer nada — a pastilha já a mostra a entrar.
      if (pendingSet.has(p)) continue;
      if (next.length >= MAX_IMPORT_BATCH) return { next, capped: true };
      next.push(p);
      have.add(p);
    }
    return { next, capped: false };
  }

  /** O aviso do teto quando um gesto em bloco (intervalo, "todas as visíveis")
   *  não coube todo: sem isto ela contava 60 fotos no ecrã e 40 no rodapé. */
  function warnCapped() {
    toast(
      `Só cabem ${MAX_IMPORT_BATCH} fotos de cada vez — ficaram selecionadas as primeiras.`,
      "info",
    );
  }

  /** Marca (ou desmarca) tudo entre duas células, como qualquer gestor de
   *  ficheiros. O sentido é o que a foto do fim vai passar a ser. */
  function selectRange(from: number, to: number, turnOn: boolean) {
    const lo = Math.max(0, Math.min(from, to));
    const hi = Math.min(images.length - 1, Math.max(from, to));
    const range = images.slice(lo, hi + 1).map((i) => i.path);
    if (!turnOn) {
      const drop = new Set(range);
      setSelected(selected.filter((p) => !drop.has(p)));
      return;
    }
    const { next, capped } = addUpToLimit(selected, range);
    setSelected(next);
    if (capped) warnCapped();
  }

  function toggleAt(index: number, extend: boolean) {
    const im = images[index];
    if (!im) return;
    // Ignorado em silêncio: esta foto já vai a caminho desta proposta.
    if (pendingSet.has(im.path)) return;
    // A âncora é lida AGORA e só depois movida: dentro de um `setSelected`
    // preguiçoso já valeria `index`, e o Shift+clique passava a clique normal.
    const from = anchor.current;
    anchor.current = index;
    setFocusIndex(index);

    if (!multiple) {
      // Capas: uma foto por espaço — a segunda escolha substitui a primeira.
      setSelected(selectedSet.has(im.path) ? [] : [im.path]);
      return;
    }
    if (extend && from !== null && from !== index) {
      selectRange(from, index, !selectedSet.has(im.path));
      return;
    }
    if (selectedSet.has(im.path)) {
      setSelected(selected.filter((p) => p !== im.path));
      return;
    }
    // No teto, tocar numa foto por selecionar não faz nada — o rodapé já diz
    // porquê desde que o limite foi atingido. A validação do servidor
    // mantém-se: isto só evita que a equipa escolha 60 fotos e só depois
    // descubra que não cabiam.
    if (selected.length >= MAX_IMPORT_BATCH) return;
    setSelected([...selected, im.path]);
  }

  function selectAllVisible() {
    const { next, capped } = addUpToLimit(
      selected,
      images.map((i) => i.path),
    );
    setSelected(next);
    if (capped) warnCapped();
  }

  // ── Teclado na grelha ─────────────────────────────────────────────────────
  // Roving tabindex: uma só célula responde ao Tab, as setas movem-se por
  // dentro. As células continuam a ser `<button>`, por isso o Enter e o Espaço
  // seguem a semântica nativa (= alternar) e o `useFocusTrap` continua a
  // encontrá-las na sua consulta de focáveis; como o rodapé vem SEMPRE depois
  // da grelha no DOM, o "último focável" do trap nunca é uma célula.

  /** Quantas colunas a grelha tem neste ecrã (3 no telemóvel, 5 a partir de
   *  `sm`). Lê-se do CSS em vez de se duplicar aqui a media query. */
  function columnCount(): number {
    const el = gridRef.current;
    if (!el || typeof window === "undefined") return 1;
    const cols = window.getComputedStyle(el).gridTemplateColumns;
    const n = cols ? cols.split(" ").filter(Boolean).length : 0;
    return n > 0 ? n : 1;
  }

  function focusCell(index: number) {
    const clamped = Math.max(0, Math.min(images.length - 1, index));
    setFocusIndex(clamped);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${clamped}"]`)?.focus();
    return clamped;
  }

  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (images.length === 0) return;
    // De onde parte a tecla é uma pergunta ao DOM, não ao estado: o foco pode
    // ter chegado à célula por clique ou por Tab, e o `focusIndex` só o
    // alcança na renderização seguinte.
    const from = (e.target as HTMLElement | null)?.closest?.("[data-cell]");
    const current = from ? Number(from.getAttribute("data-cell")) : focusIndex;
    const cols = columnCount();
    let target: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        target = current + 1;
        break;
      case "ArrowLeft":
        target = current - 1;
        break;
      case "ArrowDown":
        target = current + cols;
        break;
      case "ArrowUp":
        target = current - cols;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = images.length - 1;
        break;
      case "v":
      case "V":
        e.preventDefault();
        setPreviewIndex(current);
        return;
      default:
        return;
    }
    e.preventDefault();
    const moved = focusCell(target);
    // Shift + seta estende a seleção sem largar a âncora — é o gesto de
    // intervalo para quem não usa rato.
    if (e.shiftKey && multiple) {
      if (anchor.current === null) anchor.current = current;
      selectRange(anchor.current, moved, true);
    } else if (!e.shiftKey) {
      anchor.current = moved;
    }
  }

  // ── Importação ────────────────────────────────────────────────────────────

  /** A `ThemeImage` de um caminho escolhido. Pode estar noutro tema (a seleção
   *  atravessa separadores), por isso procura-se também na cache. Não achar
   *  nada não impede a cópia: o que a rota precisa é do caminho — o resto só
   *  serve para a pastilha mostrar a miniatura. */
  function imageFor(path: string): ThemeImage {
    const here = images.find((i) => i.path === path);
    if (here) return here;
    return fotoEmCache(path) ?? { path, url: "" };
  }

  /**
   * Entrega a seleção à cópia e devolve o diálogo a quem o abriu.
   *
   * Nada aqui espera pela rede: o `startImport` é síncrono a arrancar (e a
   * descartar o que já vai a caminho), por isso um duplo clique não chega a
   * ser dois lotes — o segundo encontra os caminhos em voo e não faz nada. É
   * também aí, ainda dentro deste gesto, que o `onReserve` guarda o lugar de
   * cada foto no documento: quando o diálogo desaparece do ecrã, as fotos já lá
   * estão.
   */
  function submit(close: boolean) {
    if (selected.length === 0) return;
    startImport({
      quoteId,
      images: selected.map(imageFor),
      deliver: onPicked,
      reserve: onReserve,
      drop: onDropped,
    });
    // A seleção é entregue e limpa no MESMO gesto: é isso que desliga já o
    // botão ("desativado durante a submissão") sem o deixar preso ao lote — o
    // "continuar" existe precisamente para se escolher o lote seguinte
    // enquanto o anterior ainda vai a caminho.
    setSelected([]);
    clearFailed(quoteId);
    if (close) onClose();
  }

  const activeTheme = themes.find((t) => t.id === themeId) ?? null;
  /** Chegou-se ao teto: só se pode tirar fotos da seleção, não juntar mais. */
  const atLimit = multiple && selected.length >= MAX_IMPORT_BATCH;
  /** Quantas das escolhidas não estão neste tema — o rodapé tem de o dizer,
   *  senão a conta não bate certo com o que se vê. */
  const elsewhere = selected.filter((p) => !visiblePaths.has(p)).length;
  const preview = previewIndex === null ? null : (images[previewIndex] ?? null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Escolher fotos da biblioteca de temas"
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 border-b border-foreground/[0.08] px-5 py-4">
          <div>
            {/* `.bo-eyebrow` já vem auditado (4,95:1) — um `text-foreground/35`
                por cima só o tornava ilegível. */}
            <p className="bo-eyebrow">Biblioteca de temas</p>
            <h2 className="font-display text-lg text-foreground/85">
              {activeTheme ? activeTheme.name : "Escolher fotos"}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fechar"
            className="bo-text-muted rounded-lg p-1.5 hover:bg-foreground/[0.06] hover:text-foreground/70"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Temas */}
        <div className="border-b border-foreground/[0.06] px-5 py-3">
          {loadingThemes ? (
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bo-skeleton h-8 w-24 rounded-xl" aria-hidden />
              ))}
            </div>
          ) : themes.length === 0 ? (
            <p className="bo-text-muted text-sm">
              Ainda não há temas. Cria o primeiro em <strong>Temas</strong>, no menu lateral, e
              carrega lá as fotos de inspiração.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Só aparece quando há temas que cheguem para valer a pena
                  filtrar. Com três, a caixa era mais uma coisa a ler. */}
              {themes.length > 3 && (
                <input
                  value={procuraTema}
                  onChange={(e) => setProcuraTema(e.target.value)}
                  placeholder="Procurar tema por nome ou etiqueta…"
                  aria-label="Procurar tema"
                  className="bo-input w-full max-w-xs px-3 py-1.5 text-xs"
                />
              )}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Temas">
                {temasVisiveis.map((t) => (
                  <Button
                    key={t.id}
                    size="sm"
                    variant={t.id === themeId ? "subtle" : "ghost"}
                    aria-pressed={t.id === themeId}
                    onClick={() => pickTheme(t.id)}
                    /* PRÉ-CARREGAR AO APROXIMAR, não ao carregar. Entre o rato
                       chegar ao separador e o clique passam ~150–300 ms — que é
                       praticamente o que a rota demora. Buscar aí faz o tema
                       estar pronto no instante do clique, em vez de começar nele.

                       `focus` para quem navega por teclado; `touchstart` para o
                       telemóvel, onde não há hover nenhum — é o instante entre
                       pousar o dedo e o levantar, e sem ele o telemóvel era o
                       único sítio que não ganhava nada com isto. */
                    onPointerEnter={() => prefetchTheme(t.id)}
                    onFocus={() => prefetchTheme(t.id)}
                    onTouchStart={() => prefetchTheme(t.id)}
                  >
                    {t.name}
                    <span className="bo-text-muted">{themeCountLabel(t)}</span>
                  </Button>
                ))}
                {temasVisiveis.length === 0 && (
                  <p className="bo-text-muted text-xs">Nenhum tema com esse nome.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Barra de seleção — só faz sentido com várias fotos a escolher */}
        {multiple && images.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-foreground/[0.06] px-5 py-2.5">
            <Button size="sm" variant="ghost" onClick={selectAllVisible} disabled={atLimit}>
              Selecionar todas as visíveis
            </Button>
            {selected.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Limpar seleção
              </Button>
            )}
            <span className="bo-text-muted ml-auto hidden text-xs sm:inline">
              Shift + clique escolhe tudo o que está pelo meio · <strong>V</strong> mostra a foto em
              grande
            </span>
          </div>
        )}

        {/* Fotos */}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            if (themeId) themeScroll.set(themeId, e.currentTarget.scrollTop);
          }}
          className="min-h-[10rem] flex-1 overflow-y-auto px-5 py-4"
        >
          {loadingImages ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bo-skeleton aspect-square rounded-lg" aria-hidden />
              ))}
            </div>
          ) : !themeId ? null : unreadable ? (
            // Falha de leitura NÃO é "tema sem fotos" — dizer-lhe que o tema
            // está vazio seria mentira, e mandava-a carregar tudo outra vez.
            <div className="py-8 text-center">
              <p className="text-sm text-foreground/75">
                Não foi possível ler a pasta deste tema agora.
              </p>
              <p className="bo-text-muted mt-1 text-xs">
                É uma falha temporária — as fotos não desapareceram. Tenta daqui a pouco.
              </p>
            </div>
          ) : images.length === 0 ? (
            <p className="bo-text-muted py-8 text-center text-sm">
              Este tema ainda não tem fotos. Adiciona-as em <strong>Temas</strong>.
            </p>
          ) : (
            <>
              <div
                ref={gridRef}
                onKeyDown={onGridKeyDown}
                className="grid select-none grid-cols-3 gap-2 sm:grid-cols-5"
              >
                {images.map((im, i) => {
                  const on = selectedSet.has(im.path);
                  const going = pendingSet.has(im.path);
                  const used = !going && usedSet.has(im.path);
                  // "Já noutra proposta" só aparece quando NÃO está nesta: as
                  // duas marcas no mesmo sítio tapavam-se uma à outra, e a que
                  // interessa primeiro é a desta proposta.
                  const noutra = !going && !used ? usadasNoutras?.[im.path] : undefined;
                  const failed = failedPaths.includes(im.path);
                  // No teto, as fotos por escolher ficam apagadas e anunciadas
                  // como indisponíveis (aria-disabled, não `disabled`: o botão
                  // continua alcançável pelo teclado). O mesmo para as que já
                  // vão a caminho.
                  const blocked = (atLimit && !on) || going;
                  return (
                    // `aspect-square` PASSOU PARA AQUI, do botão para o
                    // invólucro. É o que torna a altura da célula independente
                    // do que está lá dentro — e sem isso `content-visibility`
                    // não podia saltar o conteúdo sem a célula encolher.
                    <div key={im.path} className="celula-saltavel group relative aspect-square">
                      <button
                        type="button"
                        data-cell={i}
                        tabIndex={i === focusIndex ? 0 : -1}
                        aria-pressed={on}
                        aria-disabled={blocked || undefined}
                        // Nome ESTÁVEL: quem diz se está escolhida é o
                        // aria-pressed. O "já nesta proposta" entra no nome
                        // porque é a única forma de a marca visual chegar a
                        // quem não vê a grelha.
                        aria-label={`Foto ${i + 1} de ${images.length}${
                          going
                            ? " (a adicionar)"
                            : used
                              ? " (já nesta proposta)"
                              : noutra
                                ? ` (já usada em ${noutra})`
                                : ""
                        }${failed ? " (não entrou)" : ""}`}
                        onClick={(e) => toggleAt(i, e.shiftKey)}
                        onFocus={() => setFocusIndex(i)}
                        /* `h-full w-full` e não `aspect-square`: quem é
                           quadrado agora é o INVÓLUCRO (ver `celula-saltavel`
                           em globals.css) — é isso que deixa o browser saltar
                           a célula sem ela colapsar. */
                        className={`relative block h-full w-full overflow-hidden rounded-lg border bg-foreground/[0.04] motion-safe:transition-all ${
                          failed
                            ? "border-[#8a2a22]/60 ring-2 ring-[#8a2a22]/25"
                            : on
                              ? "border-[#4d6350] ring-2 ring-[#4d6350]/35"
                              : "border-foreground/[0.1] hover:border-[#4d6350]/45"
                        } ${blocked ? "opacity-50" : ""}`}
                      >
                        <Photo image={im} priority={i < ABOVE_FOLD} />
                        {on && (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#4d6350] text-white">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="m5 13 4 4L19 7" />
                            </svg>
                          </span>
                        )}
                        {(used || going) && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-black/65 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-[0.06em] text-white"
                          >
                            {going ? "A adicionar…" : "Já nesta proposta"}
                          </span>
                        )}
                        {noutra && (
                          <span
                            aria-hidden
                            title={`Já usada em ${noutra}`}
                            className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-[#8a6420]/85 px-1.5 py-0.5 text-center text-[10px] tracking-[0.04em] text-white"
                          >
                            {noutra}
                          </span>
                        )}
                      </button>
                      {/* A lupa é o caminho do rato/toque para a foto em
                          grande; pelo teclado é a tecla V. Só é focável na
                          célula ativa, para o Tab não passar por 60 lupas. */}
                      <button
                        type="button"
                        tabIndex={i === focusIndex ? 0 : -1}
                        aria-label={`Ver a foto ${i + 1} em grande`}
                        onClick={() => setPreviewIndex(i)}
                        className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 motion-safe:transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.5-3.5" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              {hasMore ? (
                <div className="mt-4 flex flex-col items-center gap-1">
                  <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>
                    {remaining && remaining > 0
                      ? `Mostrar mais (faltam ${remaining}${truncated ? "+" : ""})`
                      : "Mostrar mais"}
                  </Button>
                  <p className="bo-text-muted text-xs">
                    As mais recentes aparecem primeiro. A grelha mostra {THEME_PAGE_SIZE} de cada
                    vez para o tema abrir depressa.
                  </p>
                </div>
              ) : (
                images.length > THEME_PAGE_SIZE && (
                  <p className="bo-text-muted mt-4 text-center text-xs">
                    Fim do tema — {plural(images.length, "foto", "fotos")}.
                  </p>
                )
              )}
            </>
          )}
        </div>

        {/* O que não entrou da última vez — os caminhos ficam guardados e
            voltam selecionados, não se volta a escolher */}
        {failedPaths.length > 0 && (
          <div className="border-t border-[#8a2a22]/20 bg-[#f6e6df]/40 px-5 py-3">
            <p className="text-sm text-foreground/80">
              {plural(failedPaths.length, "foto não entrou", "fotos não entraram")} na proposta.
            </p>
            <p className="bo-text-muted mt-0.5 text-xs">
              Continuam selecionadas — podes tentar outra vez sem as escolher de novo.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => submit(true)}>
                Tentar outra vez
              </Button>
              <Button size="sm" variant="ghost" onClick={() => clearFailed(quoteId)}>
                Descartar
              </Button>
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.08] px-5 py-4">
          {/* Uma só região viva: a contagem muda a cada escolha, e a linha do
              teto entra e sai com ela — ou seja, é anunciada na TRANSIÇÃO para
              o limite e não outra vez a cada toque bloqueado (esses não mudam
              nada, logo não anunciam nada). */}
          <div className="min-w-0" aria-live="polite">
            <p className="bo-text-muted text-xs">
              {selected.length === 0
                ? multiple
                  ? "Toca nas fotos que queres usar."
                  : "Escolhe uma foto."
                : multiple && selected.length >= COUNTDOWN_FROM
                  ? `${selected.length} de ${MAX_IMPORT_BATCH} selecionadas`
                  : `${selected.length} ${selected.length === 1 ? "selecionada" : "selecionadas"}`}
            </p>
            {elsewhere > 0 && (
              <p className="bo-text-muted mt-0.5 text-xs">
                {elsewhere === 1 ? "1 é de outro tema" : `${elsewhere} são de outros temas`}.
              </p>
            )}
            {atLimit && (
              <p className="bo-text-muted mt-0.5 text-xs">
                Podes adicionar até {MAX_IMPORT_BATCH} fotos de cada vez.
              </p>
            )}
            {pendingSet.size > 0 && (
              <p className="bo-text-muted mt-0.5 text-xs">
                {plural(pendingSet.size, "foto a caminho", "fotos a caminho")} da proposta.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Cancelar
            </Button>
            {/* "Continuar" mantém o diálogo aberto e limpa a seleção: a cópia
                já saiu daqui, portanto escolher o lote seguinte não espera pelo
                anterior. Nas capas não existe — é uma foto por espaço. */}
            {multiple && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => submit(false)}
                disabled={selected.length === 0}
              >
                {selected.length > 0
                  ? `Adicionar ${selected.length} e continuar`
                  : "Adicionar e continuar"}
              </Button>
            )}
            {/* `primary`, a cor cheia da marca: sem variante, aqui ao lado do
                "Cancelar", lia-se como desactivado mesmo com fotos escolhidas
                — e um botão que parece morto não se carrega. */}
            <Button
              variant="primary"
              size="sm"
              onClick={() => submit(true)}
              disabled={selected.length === 0}
            >
              {selected.length > 0 ? `Adicionar ${selected.length} e fechar` : "Adicionar e fechar"}
            </Button>
          </div>
        </div>

        {preview && previewIndex !== null && (
          <Preview
            image={preview}
            index={previewIndex}
            count={images.length}
            selected={selectedSet.has(preview.path)}
            used={usedSet.has(preview.path)}
            canSelect={!pendingSet.has(preview.path) && (!atLimit || selectedSet.has(preview.path))}
            onToggle={() => toggleAt(previewIndex, false)}
            onStep={(dir) => {
              const next = Math.max(0, Math.min(images.length - 1, previewIndex + dir));
              setPreviewIndex(next);
              setFocusIndex(next);
            }}
            onClose={() => {
              setPreviewIndex(null);
              focusCell(previewIndex);
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * A miniatura de uma célula da grelha.
 *
 * Mostra `thumbUrl` e cai no original quando ela não existe — é o caso das
 * fotos carregadas ANTES de as miniaturas existirem, e continua a ser o caso
 * se a miniatura tiver desaparecido do bucket (é derivada e dispensável; o
 * original é que é o ativo). O `onError` é a segunda rede: um URL assinado
 * para um objeto que já lá não está falha no browser, e sem isto ficava uma
 * célula partida no meio de uma grelha que funciona.
 */
function Photo({ image, priority }: { image: ThemeImage; priority?: boolean }) {
  /** A miniatura falhou (foi apagada do bucket): fica o original. */
  const [thumbBroken, setThumbBroken] = useState(false);
  /** A fila deu a vez a esta célula. */
  const [turn, setTurn] = useState(false);
  /** A fotografia já chegou — é o que dispara o fade por cima do LQIP. */
  const [pintada, setPintada] = useState(false);
  /** Sem miniatura, esta célula puxa ~2,6 MB: espera pela vez. */
  const heavy = !image.thumbUrl || thumbBroken;
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!heavy) return;
    let timer = 0;
    const free = queueHeavyImage(() => {
      setTurn(true);
      timer = window.setTimeout(() => release.current?.(), HEAVY_SLOT_TIMEOUT_MS);
    });
    release.current = () => {
      window.clearTimeout(timer);
      free();
    };
    return () => {
      release.current?.();
      release.current = null;
    };
  }, [heavy, image.url]);

  // Sem vez, sem `src`: um `src` posto é um download começado, e é isso mesmo
  // que a fila existe para espaçar.
  const src = heavy ? (turn ? image.url : undefined) : image.thumbUrl;

  const finished = () => {
    release.current?.();
    release.current = null;
  };

  return (
    /**
     * O LQIP É O FUNDO DA CÉLULA, e a fotografia entra por cima.
     *
     * Não é um segundo `<img>`: um `background-image` com um `data:` URI não é
     * um pedido, não entra na fila de descarregamentos e está PINTADO no
     * instante em que este elemento existe — que é o instante em que o JSON
     * chega. Medido na linha de base: era aqui que se ficava 1032 a 2192 ms a
     * olhar para uma caixa cinzenta.
     *
     * Sem `lqip` (fotos anteriores à migração) fica o fundo neutro de sempre.
     */
    <div
      className="h-full w-full bg-foreground/[0.04] bg-cover bg-center"
      style={image.lqip ? { backgroundImage: `url("${image.lqip}")` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading={heavy || priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onLoad={() => {
          finished();
          setPintada(true);
        }}
        onError={() => {
          finished();
          if (!heavy) setThumbBroken(true);
        }}
        /* 200 ms de fade, e NUNCA um corte seco: a fotografia final entra por
           cima da sua própria versão desfocada, que já lá está e já tem a cor
           certa. `motion-safe` porque quem pede menos movimento não quer um
           fade — quer a imagem. */
        className={`h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-200 ${
          pintada || !image.lqip ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/**
 * A foto em grande, por cima da grelha.
 *
 * Uma miniatura de 400 px não distingue duas mesas de terracota — aqui puxa-se
 * o ORIGINAL, que é justamente a foto que vai para a proposta. Fica dentro do
 * diálogo (e da armadilha de foco), com ← → a passar de foto e Esc a voltar.
 */
function Preview({
  image,
  index,
  count,
  selected,
  used,
  canSelect,
  onToggle,
  onStep,
  onClose,
}: {
  image: ThemeImage;
  index: number;
  count: number;
  selected: boolean;
  used: boolean;
  canSelect: boolean;
  onToggle: () => void;
  onStep: (dir: -1 | 1) => void;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-label={`Foto ${index + 1} de ${count} em grande`}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onStep(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onStep(1);
        }
      }}
      className="absolute inset-0 z-10 flex flex-col bg-white"
    >
      <div className="flex items-center justify-between gap-3 border-b border-foreground/[0.08] px-5 py-3">
        <p className="bo-text-muted text-xs">
          Foto {index + 1} de {count}
          {used ? " · já nesta proposta" : ""}
        </p>
        <Button ref={firstRef} size="sm" variant="ghost" onClick={onClose}>
          Voltar à grelha
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-foreground/[0.04] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt=""
          decoding="async"
          // É a foto que ela pediu para ver: passa à frente do que a grelha
          // esteja a descarregar por trás.
          fetchPriority="high"
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-foreground/[0.08] px-5 py-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => onStep(-1)} disabled={index === 0}>
            ← Anterior
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStep(1)}
            disabled={index === count - 1}
          >
            Seguinte →
          </Button>
        </div>
        <Button
          size="sm"
          variant={selected ? "secondary" : "primary"}
          onClick={onToggle}
          disabled={!canSelect}
        >
          {selected ? "Retirar da seleção" : "Escolher esta foto"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Esquece tudo o que este módulo guarda entre montagens — cache da biblioteca,
 * lotes em curso e a pastilha. Só para testes: em produção a cache é
 * precisamente o que faz o diálogo reabrir instantâneo.
 */
export function __resetThemePickerState(): void {
  invalidateThemeLibraryCache();
  lastThemeId = null;
  failedByQuote.clear();
  importedByQuote.clear();
  jobs.length = 0;
  inFlight.clear();
  if (overlayTeardown) {
    clearTimeout(overlayTeardown);
    overlayTeardown = 0;
  }
  overlayRoot?.unmount();
  overlayRoot = null;
  overlayHost?.remove();
  overlayHost = null;
}
