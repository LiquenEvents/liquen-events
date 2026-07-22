"use client";

import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import { createPortal, flushSync } from "react-dom";
import Image from "next/image";
import type { Label } from "./photos-data";
import { collectionFor } from "./collections";
import { type Photo, interleaveByCollection } from "./interleave";
import type { Dict } from "@/lib/i18n";
import { ViewTransition } from "@/components/vt";

/**
 * Morph thumbnail→lightbox (View Transitions API). Cada miniatura e a foto do
 * lightbox partilham um `view-transition-name` (`g-<índice do pool>`): abrir e
 * fechar animam a MESMA foto a crescer/encolher fisicamente entre os dois
 * lugares. A miniatura ativa fica sem nome enquanto o lightbox está aberto —
 * nunca há dois elementos com o mesmo nome no snapshot. Sem suporte da API
 * (React/browser), tudo funciona como antes.
 */
function VTWrap({
  name,
  exit,
  children,
}: {
  name?: string;
  exit?: string;
  children: React.ReactNode;
}) {
  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition name={name} share="gallery-morph" exit={exit} default="none">
      {children}
    </ViewTransition>
  );
}

const CATS = ["Todos", "Casamento", "Corporativo", "Conferência", "Aéreo", "Evento"] as const;

// next/image throws if placeholder="blur" is set without a blurDataURL. The
// gallery only ships blur data for the first-paint photos (payload trim in
// page.tsx); the rest fall back to the default placeholder over the gallery's
// near-black background.
function blurProps(p: Photo) {
  return p.blurDataURL ? ({ placeholder: "blur", blurDataURL: p.blurDataURL } as const) : {};
}
type Cat = (typeof CATS)[number];
const PAGE = 24;
// Fewer tiles on the FIRST paint than each subsequent page: React hydrating the
// initial grid is a synchronous burst (measured up to a ~1s main-thread freeze
// on a 6×-throttled phone when navigating into /galeria). A smaller first mount
// cuts that freeze; the infinite-scroll append (in a yieldable startTransition)
// fills the rest within a frame. Same value SSR + client → no hydration mismatch.
const INITIAL_PAGE = 12;

// URL-hash slugs for each category, so a filtered view is shareable &
// bookmarkable (e.g. /galeria#casamentos) and survives the back button.
const CAT_SLUGS: Record<Cat, string> = {
  Todos: "",
  Casamento: "casamentos",
  Corporativo: "corporativos",
  Conferência: "conferencias",
  Aéreo: "aereos",
  Evento: "eventos",
};
function catFromSlug(slug: string): Cat {
  return (CATS.find((c) => CAT_SLUGS[c] === slug) as Cat) ?? "Todos";
}

// "Ver este casamento" — a shareable, URL-hashable view of a single couple's
// full story (as opposed to the deliberately-interleaved category grids).
// Prefixed `c-` in the hash so it can't collide with a CAT_SLUGS value.
// Matches combining marks left behind by NFD decomposition (Unicode "Mark"
// category).
const DIACRITICS_RE = /\p{M}/gu;
function collectionSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function collectionFromSlug(slug: string, names: string[]): string | null {
  return names.find((n) => collectionSlug(n) === slug) ?? null;
}
const STRIP = 7;
const SLIDE_MS = 5000; // ritmo do slideshow cinematográfico

// Corre trabalho NÃO crítico quando a main thread está livre, para que a
// hidratação e a primeira interação não fiquem bloqueadas por observers /
// listeners que a primeira pintura não precisa. `requestIdleCallback` onde
// existe; caso contrário (Safari) um setTimeout curto. Devolve um cancelador.
function onIdle(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(cb, { timeout: 500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 1);
  return () => window.clearTimeout(id);
}

// Nome View-Transition estável de uma foto (puro → nível de módulo, partilhado
// pela grelha e pelo lightbox).
const vtId = (src: string) => `g-${src.replace(/[^a-zA-Z0-9_-]/g, "")}`;

// Rede lenta? Em Save-Data ou effectiveType 2g/3g não vale a pena pré-carregar
// especulativamente os vizinhos full-screen do lightbox (imagens grandes que o
// utilizador pode nunca ver). Em rede normal → comportamento inalterado.
const SLOW_ET = new Set(["slow-2g", "2g", "3g"]);
function shouldPreloadNeighbours(): boolean {
  if (typeof navigator === "undefined") return true;
  const c = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !(c.effectiveType && SLOW_ET.has(c.effectiveType));
}

// Keyboard focus ring that survives `overflow-hidden`. The global :focus-visible
// outline is a box-shadow, which these image cells clip; an *inset* ring renders
// inside the box, so it stays visible for keyboard users tabbing the grid.
const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80";

// Hover overlay — reused in hero cells and masonry cells
function HoverOverlay({ caption, sub }: { caption: string; sub?: string }) {
  return (
    <>
      {/* Reveal on keyboard focus too (not just hover) so tabbing the grid
          surfaces the same caption sighted mouse users get (WCAG 1.4.13). */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/65 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between gap-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 translate-y-1.5 group-hover:translate-y-0 group-focus-visible:translate-y-0 transition-all duration-300 pointer-events-none">
        <span className="min-w-0">
          <span
            className="block text-white/90 text-[12px] font-medium truncate"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {caption}
          </span>
          {sub && (
            <span className="block text-white/55 text-[9px] tracking-[0.2em] uppercase mt-0.5">
              {sub}
            </span>
          )}
        </span>
        <span className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
          <svg
            className="w-3.5 h-3.5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm-3-3v6m-3-3h6"
            />
          </svg>
        </span>
      </div>
    </>
  );
}

export default function GaleriaClient({
  photos,
  dict,
}: {
  photos: Photo[];
  dict: Dict["galeria"];
}) {
  const collectionNames = useMemo(
    () =>
      Array.from(new Set(photos.map((p) => collectionFor(p.src)).filter((c): c is string => !!c))),
    [photos],
  );
  const [cat, setCat] = useState<Cat>("Todos");
  // Non-null = "ver este casamento" mode: browsing one couple's full story
  // (in shoot order, no interleaving) instead of a category grid.
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [shown, setShown] = useState(INITIAL_PAGE);
  // Per-visit arrangement seed. Empty on SSR + first client render (so hydration
  // matches); a random value is set once on mount, re-rolling the interleave so
  // every fresh entry to the gallery lays out differently. It never changes
  // after mount, so the grid stays put while browsing (no mid-scroll reshuffle).
  const [orderSeed, setOrderSeed] = useState("");
  // Re-roll da ordem por visita — não crítico para a primeira pintura (o SSR
  // mostra a ordem por defeito), por isso é adiado para idle: a grelha só se
  // re-baralha depois de a hidratação assentar, libertando o TTI.
  useEffect(
    () => onIdle(() => setOrderSeed(":" + Math.floor(Math.random() * 0x7fffffff).toString(36))),
    [],
  );
  const [fading, setFading] = useState(false);
  const [lb, setLb] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  // A fechar? Enquanto true o lightbox corre o fade+scale de saída (lb-closing)
  // e só depois desmonta. Fecho fiável por CSS — ver comentário em close().
  const [closing, setClosing] = useState(false);
  // Acabou de abrir via morph? Suprime o lb-photo-in dessa primeira foto para
  // a entrada ser SÓ o morph (voltam a coexistir ao navegar com ←/→).
  const [justOpened, setJustOpened] = useState(false);
  // Breakpoint sm (as fotos 1-4 vivem no mosaico em sm+ e no masonry em mobile;
  // o CSS esconde uma). `isSm` diz qual é a instância VISÍVEL de cada foto.
  const [isSm, setIsSm] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setIsSm(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  // Nº de colunas da masonry — medido no cliente para podermos distribuir os
  // tiles MANUALMENTE por colunas equilibradas (ver `masonryColumns`). Começa em
  // 1 (mobile-first) para que o SSR e a primeira renderização no cliente
  // coincidam (sem hydration mismatch); o efeito ajusta para o valor real. Espelha
  // os breakpoints antigos (columns-1 / sm:columns-2 / md:columns-3).
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const sm = window.matchMedia("(min-width: 640px)");
    const md = window.matchMedia("(min-width: 768px)");
    const apply = () => setCols(md.matches ? 3 : sm.matches ? 2 : 1);
    apply();
    sm.addEventListener("change", apply);
    md.addEventListener("change", apply);
    return () => {
      sm.removeEventListener("change", apply);
      md.removeEventListener("change", apply);
    };
  }, []);
  // O `<ViewTransition name>` serve UMA coisa: o morph miniatura↔lightbox. Fora
  // desse morph, nenhuma tile da grelha precisa de nome — e tê-los sempre era o
  // que gerava os avisos "dois <ViewTransition> com o mesmo nome": ao filtrar ou
  // cruzar o breakpoint, o nome de uma foto migrava entre a instância do
  // mosaico e a do masonry (ou entre posições da lista), coexistindo por um
  // commit. Fix estrutural: a grelha só nomeia a foto que está ATIVAMENTE em
  // morph (`morphSrc`) e só na sua instância visível (gate `isSm`). Em repouso
  // — a navegar, filtrar, redimensionar — não há nomes nenhuns, portanto a
  // colisão é impossível; no morph existe exatamente um par miniatura↔lightbox.
  const [morphSrc, setMorphSrc] = useState<string | null>(null);
  /** Nome VT de uma tile: só quando é a foto em morph E é a sua instância
      visível (mosaico em sm+, masonry em mobile — codificado em `active`). */
  const tileName = (src: string, active: boolean) =>
    active && morphSrc === src ? vtId(src) : undefined;
  const mosaicName = (idx: number) => tileName(visible[idx].src, idx === 0 || isSm === true);
  const masonryName = (idx: number, src: string) => tileName(src, idx < 5 ? isSm === false : true);
  // O lightbox (portal, listeners de teclado/gesto, trap de foco, slideshow,
  // pré-carga de vizinhos) vive num componente-filho `Lightbox` que só é montado
  // quando `lb !== null`. Assim, nada da sua configuração — refs, efeitos,
  // listeners — corre na primeira pintura; só arranca quando o utilizador abre
  // uma foto. Comportamento idêntico depois de aberto.

  // Scroll-reveal for masonry tiles — they fade+rise as they enter view, so the
  // wall assembles itself instead of popping in. One shared IntersectionObserver
  // for every tile (created lazily on the first ref), transform/opacity only
  // (compositor work, never blocks scroll), and it unobserves each tile once
  // revealed. `registerTile` returns a cleanup (React 19 ref cleanup) so tiles
  // that unmount on a filter change stop being observed — no leak. Reduced
  // motion / no IntersectionObserver → shown immediately.
  const revealObs = useRef<IntersectionObserver | null>(null);
  const registerTile = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      el.classList.add("in", "done");
      return;
    }
    if (!revealObs.current) {
      revealObs.current = new IntersectionObserver(
        (entries, obs) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const tile = e.target as HTMLElement;
            tile.classList.add("in");
            obs.unobserve(tile);
            tile.addEventListener("transitionend", () => tile.classList.add("done"), {
              once: true,
            });
          }
        },
        { rootMargin: "0px 0px -6% 0px" },
      );
    }
    revealObs.current.observe(el);
    return () => revealObs.current?.unobserve(el);
  }, []);
  useEffect(() => () => revealObs.current?.disconnect(), []);

  // Infinite scroll — a sentinel below the grid loads the next page as it nears
  // the viewport (no "Ver mais" click). Recreated whenever `shown`/`pool.length`
  // change: re-observing reports the current intersection immediately, so if the
  // sentinel is still in view after a page loads it chains to the next one, and
  // it naturally stops once every photo is shown. rootMargin loads ~one viewport
  // ahead so tiles are ready before they scroll in. Browsers without
  // IntersectionObserver fall back to the manual button (see `ioSupported`).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [ioSupported, setIoSupported] = useState(true);
  useEffect(() => {
    setIoSupported(typeof window !== "undefined" && "IntersectionObserver" in window);
  }, []);

  // "Voltar ao topo" — o botão flutuante aparece depois de descer bastante (a
  // página cresce muito com o scroll infinito). Listener passivo, throttled com
  // rAF; setShowTop só re-renderiza quando o booleano muda (React ignora o resto).
  const [showTop, setShowTop] = useState(false);
  // O botão "voltar ao topo" só interessa depois de o utilizador descer bastante,
  // por isso registamos o scroll listener em idle — nada de trabalho de scroll na
  // main thread durante a primeira pintura.
  useEffect(() => {
    let raf = 0;
    let remove = () => {};
    const cancel = onIdle(() => {
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          setShowTop(window.scrollY > 1200);
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      remove = () => window.removeEventListener("scroll", onScroll);
    });
    return () => {
      cancel();
      remove();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  const scrollTop = useCallback(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  // Sync the active filter with the URL hash so categories and single-couple
  // views are shareable and the browser back button restores the previous
  // filter. Read post-hydration (avoids any SSR/CSR mismatch) and on every
  // hashchange.
  useEffect(() => {
    let remove = () => {};
    const cancel = onIdle(() => {
      const apply = () => {
        const hash = window.location.hash.replace(/^#/, "");
        if (hash.startsWith("c-")) {
          const name = collectionFromSlug(hash.slice(2), collectionNames);
          if (name) {
            setCollectionFilter(name);
            setShown(PAGE);
            return;
          }
        }
        setCollectionFilter(null);
        const c = catFromSlug(hash);
        setCat((prev) => (prev === c ? prev : c));
        setShown(PAGE);
      };
      apply();
      window.addEventListener("hashchange", apply);
      remove = () => window.removeEventListener("hashchange", apply);
    });
    return () => {
      cancel();
      remove();
    };
  }, [collectionNames]);

  // Localized display helpers — internal label keys stay PT (used for
  // filtering); only what the user reads is translated.
  const labelText = (l: Label) => dict.labels[l];
  // Per-photo alt text. The category template (dict.alt) alone would make
  // hundreds of photos share one identical string (bad for image SEO + a11y),
  // so when the shoot/couple is known we append it — every photo then reads
  // uniquely and descriptively (e.g. "Casamento … no Alentejo — Daniela &
  // Guilherme") while keeping the localized, keyword-rich base.
  const altText = (src: string, l: Label) => {
    const base = dict.alt[l];
    const c = collectionFor(src);
    return c ? `${base} — ${c}` : base;
  };
  const caption = (src: string, label: Label): { caption: string; sub?: string } => {
    const c = collectionFor(src);
    return c ? { caption: c, sub: labelText(label) } : { caption: labelText(label) };
  };

  // Interleave AFTER filtering, so every category is independently well-mixed:
  // spreading across the full library first, then filtering, would let same-
  // event photos drift back together once the other categories are removed.
  // A collection view is the opposite intent — it's ONE event told in shoot
  // order — so it skips interleaving entirely.
  //
  // TUDO MISTURADO: sem blocos temáticos (a antiga regra "decoração primeiro"
  // empilhava bouquets/arranjos no topo). O interleave por coleção espalha
  // cada evento uniformemente, por isso o grid abre já com uma mistura real —
  // casais, mesas, decoração, aéreas — sem aglomerados.
  const pool = useMemo(() => {
    if (collectionFilter) {
      return photos.filter((p) => collectionFor(p.src) === collectionFilter);
    }
    const filtered = cat === "Todos" ? photos : photos.filter((p) => p.label === cat);
    return interleaveByCollection(filtered, orderSeed);
  }, [cat, collectionFilter, photos, orderSeed]);
  const visible = pool.slice(0, shown);

  // Masonry manual: distribui as fotos por `cols` colunas equilibradas, sempre
  // para a coluna MAIS CURTA (usando a altura real de cada tile = H/W do
  // aspectRatio). Porquê não CSS multi-column: o `column-fill: balance`
  // dimensiona cada bloco de página pela sua coluna MAIS ALTA, por isso as
  // colunas mais curtas deixavam uma cauda preta até essa altura — o "fundo
  // preto no meio das fotos". O empacotamento guloso mantém as colunas quase
  // iguais (só uma pequena cauda no fundo de tudo) e é estável por prefixo:
  // carregar mais uma página nunca desloca tiles já colocados, portanto a grelha
  // continua a não re-baralhar a meio do scroll.
  const masonryColumns = useMemo(() => {
    // O mosaico-herói fica com a foto 0 (e 1–4 em sm+); a masonry leva o resto.
    const start = collectionFilter ? 0 : cols === 1 ? 1 : 5;
    const cells: { p: Photo; idx: number }[][] = Array.from({ length: cols }, () => []);
    const heights = new Array<number>(cols).fill(0);
    for (let i = start; i < visible.length; i++) {
      const p = visible[i];
      const [w, h] = p.aspectRatio.split("/").map((n) => parseFloat(n));
      const rel = w > 0 && h > 0 ? h / w : 1; // altura do tile a largura de coluna unitária
      let c = 0;
      for (let k = 1; k < cols; k++) if (heights[k] < heights[c]) c = k;
      cells[c].push({ p, idx: i });
      heights[c] += rel;
    }
    return cells;
  }, [visible, cols, collectionFilter]);

  // Infinite scroll — a sentinel below the grid loads the next page as it nears
  // the viewport (no "Ver mais" click). Recreated whenever `shown`/`pool.length`
  // change: re-observing reports the current intersection immediately, so if the
  // sentinel is still in view after a page loads it chains to the next one, and
  // it naturally stops once every photo is shown. rootMargin loads ~one viewport
  // ahead so tiles are ready before they scroll in. Browsers without
  // IntersectionObserver fall back to the manual button (see `ioSupported`).
  useEffect(() => {
    if (shown >= pool.length) return;
    const el = sentinelRef.current;
    if (!el || typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        // Non-urgent update: React yields while mounting the next page of tiles
        // so a long scroll never stutters ("super fluido"). The new tiles carry
        // `default="none"` view-transition-names, so no morph/flash fires here.
        if (entries[0]?.isIntersecting)
          startTransition(() => setShown((s) => Math.min(s + PAGE, pool.length)));
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, pool.length]);

  // Lightbox navigation (through entire pool, not just shown)
  // Abrir/fechar dentro de startTransition ativa o morph <ViewTransition>;
  // navegar (←/→) fica fora — usa o lb-photo-in clássico entre fotos.
  const openAt = useCallback(
    (idx: number) => {
      // Nomear a miniatura ANTES de capturar o snapshot "antes" do morph.
      // flushSync força esse commit já; sem isto o setMorphSrc seria agrupado
      // com o setLb e o snapshot "antes" ainda não teria o nome → sem morph.
      flushSync(() => setMorphSrc(pool[idx].src));
      setJustOpened(true);
      startTransition(() => setLb(idx));
    },
    [pool],
  );
  const close = useCallback(() => {
    // Fecho FIÁVEL com animação de saída via CSS (não ViewTransition). Com a
    // camada de motion ativa, o ViewTransition de fecho do React revelou-se
    // instável (o Escape disparava mas a transição não fazia commit). Aqui
    // marcamos `closing` → o lightbox faz um fade+scale de saída (classe
    // lb-closing) e só depois desmonta. O morph de ABERTURA (openAt) mantém-se.
    setPlaying(false);
    setClosing(true);
    window.setTimeout(() => {
      setMorphSrc(null);
      setLb(null);
      setClosing(false);
    }, 260);
  }, []);
  // Fecho sem morph — para o gesto de arrastar-para-baixo, onde a própria foto
  // já saiu do ecrã com o dedo (o morph de volta à miniatura ficaria estranho).
  const dismiss = useCallback(() => {
    setMorphSrc(null);
    setLb(null);
    setPlaying(false);
  }, []);
  // Navegar (←/→): sem morph entre fotos, mas `morphSrc` acompanha a foto
  // atual para que o FECHO faça o morph de volta à miniatura certa.
  const prev = useCallback(() => {
    if (lb === null) return;
    setJustOpened(false);
    const n = (lb - 1 + pool.length) % pool.length;
    setLb(n);
    setMorphSrc(pool[n].src);
  }, [lb, pool]);
  const next = useCallback(() => {
    if (lb === null) return;
    setJustOpened(false);
    const n = (lb + 1) % pool.length;
    setLb(n);
    setMorphSrc(pool[n].src);
  }, [lb, pool]);
  // Depois de fechar, largar o nome assim que o morph de volta captura — em
  // repouso a grelha fica sem nomes nenhuns (colisão impossível).
  useEffect(() => {
    if (lb !== null || morphSrc === null) return;
    const id = setTimeout(() => setMorphSrc(null), 400);
    return () => clearTimeout(id);
  }, [lb, morphSrc]);

  // (Todos os efeitos exclusivos do lightbox — teclado/trap de foco, foco de
  // entrada/saída, slideshow, bloqueio de scroll do body e gestos táteis — vivem
  // agora dentro do componente `Lightbox`, que só monta quando está aberto.)

  function switchCat(c: Cat) {
    if (c === cat && !collectionFilter) return;
    setFading(true);
    setTimeout(() => {
      setCat(c);
      setCollectionFilter(null);
      setShown(PAGE);
      setFading(false);
    }, 160);
    // Reflect the filter in the URL (shareable / bookmarkable) without adding a
    // history entry per click.
    const slug = CAT_SLUGS[c];
    const url = slug ? `#${slug}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
  }

  // Called from inside the (open) lightbox, so the grid fade doesn't apply —
  // it's hidden behind the modal. Deliberately does NOT go through close()
  // first: re-pointing `lb` at the same photo's new index, in the same
  // commit as the pool swap, means the visible photo never changes (same
  // src → same view-transition-name), so nothing needs to morph. Closing
  // first and re-opening after would fire two back-to-back ViewTransitions
  // on the same names — the exact bug that made resizing across the mobile
  // breakpoint log duplicate-name errors (see [[galeria-polish-jul-2026]]).
  const viewCollection = useCallback(
    (name: string) => {
      const newPool = photos.filter((p) => collectionFor(p.src) === name);
      const currentSrc = lb !== null ? pool[lb].src : null;
      const newIdx = currentSrc ? newPool.findIndex((p) => p.src === currentSrc) : -1;
      setCollectionFilter(name);
      setShown(PAGE);
      setJustOpened(false);
      if (newIdx >= 0) setLb(newIdx);
      else if (lb !== null) close();
      window.history.replaceState(null, "", `#c-${collectionSlug(name)}`);
    },
    [photos, pool, lb, close],
  );

  return (
    <>
      {/* ── Filtros / vista de casamento ── */}
      {/* A grelha é full-bleed (o wrapper max-w/px saiu da page), por isso o
          chrome dos filtros leva aqui o seu próprio padding lateral. */}
      {collectionFilter ? (
        <div className="flex items-center gap-4 mb-8 px-3 sm:px-4 lg:px-6">
          <button
            onClick={() => switchCat("Todos")}
            className="flex-shrink-0 flex min-h-[44px] items-center gap-1.5 border border-white/25 px-4 py-2 text-[11px] tracking-[0.2em] uppercase text-white/70 hover:border-white/60 hover:text-white transition-colors duration-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {dict.backToGallery}
          </button>
          <div className="min-w-0">
            <p
              className="text-white/90 text-base truncate"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {collectionFilter}
            </p>
            <p className="text-white/55 text-[10px] tracking-[0.15em] uppercase mt-0.5">
              {pool.length} {dict.photosLabel}
            </p>
          </div>
        </div>
      ) : (
        /* Category filter bar removed on request — the gallery shows every
           photo, with no category chrome. (Collection deep-links still work via
           the collection view above; there's just no category filter now.) */
        <div className="mb-6" />
      )}

      {/* ── Grid ── */}
      <div style={{ opacity: fading ? 0 : 1, transition: "opacity 0.16s" }}>
        {/* Hero — mosaico editorial de 5 fotos. Skipped in collection view:
            the mosaic/masonry dual-mount for slots 1-4, combined with a full
            pool swap, is exactly the combination that confuses React's
            <ViewTransition> into logging duplicate-name errors. A collection
            is one simple, uniform story anyway — no need for a hero. */}
        {!collectionFilter && visible.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 grid-rows-2 gap-0.5 mb-0.5 h-[320px] sm:h-[480px] lg:h-[600px]">
            {/* Foto grande — 2×2 */}
            <button
              onClick={() => openAt(0)}
              data-ripple
              data-cap={caption(visible[0].src, visible[0].label).caption}
              data-sub={caption(visible[0].src, visible[0].label).sub}
              className={`g-hero g-tile relative col-span-2 row-span-2 h-full w-full overflow-hidden group ${FOCUS_RING}`}
            >
              {/* Enquanto esta foto está aberta no lightbox, a miniatura
                  desmonta o seu <ViewTransition>: é o unmount/mount com o
                  mesmo nome que o React emparelha para o morph (dois montados
                  em simultâneo não é suportado). Fica escondida atrás do
                  overlay opaco, por isso nada se vê. */}
              {lb !== 0 && (
                <VTWrap name={mosaicName(0)}>
                  <Image
                    src={visible[0].src}
                    alt={altText(visible[0].src, visible[0].label)}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    quality={60}
                    className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                    // The 2×2 flagship tile is the largest grid image, the LCP
                    // candidate on this route, and the lightbox morph source —
                    // eager so it resolves without a lazy delay / pop-in.
                    loading="eager"
                    {...blurProps(visible[0])}
                  />
                </VTWrap>
              )}
              <HoverOverlay {...caption(visible[0].src, visible[0].label)} />
            </button>

            {/* 4 fotos satélite — só em sm+ (lazy: não descarrega no telemóvel) */}
            {[1, 2, 3, 4].map((idx) =>
              visible.length > idx ? (
                <button
                  key={idx}
                  onClick={() => openAt(idx)}
                  data-ripple
                  data-cap={caption(visible[idx].src, visible[idx].label).caption}
                  data-sub={caption(visible[idx].src, visible[idx].label).sub}
                  className={`g-hero g-tile relative hidden sm:block h-full w-full overflow-hidden group ${FOCUS_RING}`}
                  style={{ "--hero-delay": `${idx * 70}ms` } as React.CSSProperties}
                >
                  {lb !== idx && (
                    <VTWrap name={mosaicName(idx)}>
                      <Image
                        src={visible[idx].src}
                        alt={altText(visible[idx].src, visible[idx].label)}
                        fill
                        sizes="25vw"
                        quality={60}
                        className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                        loading="lazy"
                        {...blurProps(visible[idx])}
                      />
                    </VTWrap>
                  )}
                  <HoverOverlay {...caption(visible[idx].src, visible[idx].label)} />
                </button>
              ) : null,
            )}
          </div>
        )}

        {/* Masonry — fotos restantes (satélites 1-4 reaparecem aqui em
            mobile); numa vista de coleção começa em 0, sem hero, cada foto
            com um único nome VT estável (ver nota acima).

            Colunas flex distribuídas manualmente (ver `masonryColumns`), NÃO
            CSS multi-column: cada coluna é uma pilha independente que encolhe
            até ao seu conteúdo (`items-start`), por isso nunca há uma cauda
            preta por baixo de uma coluna mais curta. Como o empacotamento é
            estável por prefixo, carregar mais fotos apenas prolonga as colunas
            existentes — os tiles já vistos não mudam de sítio. */}
        {(collectionFilter ? visible.length > 0 : visible.length > 1) && (
          <div className="flex items-start gap-0.5">
            {masonryColumns.map((col, ci) => (
              <div key={ci} className="flex min-w-0 flex-1 flex-col gap-0.5">
                {col.map(({ p, idx }, j) => (
                  <div
                    key={p.src}
                    ref={registerTile}
                    className={`g-reveal${!collectionFilter && idx < 5 ? " sm:hidden" : ""}`}
                    style={{ "--reveal-delay": `${(j % 3) * 60}ms` } as React.CSSProperties}
                  >
                    <button
                      onClick={() => openAt(idx)}
                      data-ripple
                      data-cap={caption(p.src, p.label).caption}
                      data-sub={caption(p.src, p.label).sub}
                      className={`g-tile relative w-full overflow-hidden group ${FOCUS_RING}`}
                      style={{ aspectRatio: p.aspectRatio }}
                    >
                      {lb !== idx && (
                        <VTWrap
                          name={collectionFilter ? tileName(p.src, true) : masonryName(idx, p.src)}
                        >
                          <Image
                            src={p.src}
                            alt={altText(p.src, p.label)}
                            fill
                            // Match the real column count (1 col <640px, 2 cols
                            // 640–767px, 3 cols ≥768px). The old value declared
                            // 50vw on phones where a tile is actually full-width,
                            // under-fetching and softening the flagship gallery
                            // photos on mobile — the majority of visitors.
                            sizes="(max-width: 639px) 100vw, (max-width: 767px) 50vw, 33vw"
                            quality={60}
                            className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                            loading={collectionFilter && idx === 0 ? "eager" : "lazy"}
                            {...blurProps(p)}
                          />
                        </VTWrap>
                      )}
                      <HoverOverlay {...caption(p.src, p.label)} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Scroll infinito ── */}
      {shown < pool.length && (
        <div className="mt-14 flex flex-col items-center gap-4">
          {/* Sentinela invisível — o IntersectionObserver carrega a próxima
              página quando ela se aproxima do ecrã. */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          {ioSupported ? (
            <div className="g-loading flex items-center gap-2" aria-hidden>
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
            </div>
          ) : (
            // Fallback sem IntersectionObserver — botão manual (ghost quadrado,
            // preenche a branco no hover como os CTA do idioma SpaceX).
            <button
              onClick={() => setShown((s) => Math.min(s + PAGE, pool.length))}
              className="group flex min-h-[44px] items-center gap-3 border border-white/70 px-10 py-3.5 text-[11px] uppercase tracking-[0.3em] text-white transition-colors duration-300 hover:border-white hover:bg-white hover:text-[#0c0e0b]"
            >
              {dict.verMais}
              <span className="text-white/55 transition-colors group-hover:text-[#0c0e0b]/70">
                +{Math.min(PAGE, pool.length - shown)}
              </span>
            </button>
          )}
          <div className="relative h-px w-40 overflow-hidden bg-white/10">
            <div
              className="absolute left-0 top-0 h-full bg-moss/60 transition-all duration-500"
              style={{ width: `${(shown / pool.length) * 100}%` }}
            />
          </div>
          <p role="status" className="text-[10px] tracking-widest text-white/55">
            {shown} {dict.de} {pool.length}
          </p>
        </div>
      )}

      {/* ── Lightbox ── LAZY-MOUNT: só existe quando aberto. Todo o seu JS de
          runtime — portal, listeners de teclado/gesto, trap de foco, slideshow,
          pré-carga de vizinhos — não corre na primeira pintura; arranca apenas
          ao abrir uma foto e desmonta ao fechar. Comportamento idêntico. */}
      {lb !== null && (
        <Lightbox
          index={lb}
          pool={pool}
          playing={playing}
          setPlaying={setPlaying}
          closing={closing}
          justOpened={justOpened}
          setJustOpened={setJustOpened}
          setLb={setLb}
          close={close}
          prev={prev}
          next={next}
          dict={dict}
          dismiss={dismiss}
          viewCollection={viewCollection}
        />
      )}

      {/* ── Voltar ao topo ── Empilhado por cima do botão de WhatsApp (canto
          inferior direito); o canto esquerdo já tem o CTA "Pedir orçamento"
          (StickyCTA). Escondido enquanto o lightbox está aberto. */}
      <button
        onClick={scrollTop}
        aria-label={dict.backToTop}
        title={dict.backToTop}
        inert={!(showTop && lb === null)}
        className={`fixed z-40 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white/80 ring-1 ring-white/15 backdrop-blur-md transition-all duration-300 hover:scale-105 hover:bg-black/70 hover:text-white active:scale-95 ${
          showTop && lb === null
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
        style={{
          bottom: "calc(5rem + env(safe-area-inset-bottom))",
          right: "calc(1.25rem + env(safe-area-inset-right))",
        }}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </>
  );
}

/**
 * O lightbox propriamente dito. É montado SÓ quando aberto (ver `GaleriaClient`),
 * por isso todos os seus refs, efeitos e listeners (teclado, trap de foco, foco
 * de entrada/saída, slideshow, bloqueio de scroll, gestos táteis, pré-carga de
 * vizinhos) só arrancam ao abrir — nunca na primeira pintura da galeria. O
 * comportamento, o morph <ViewTransition> e a UX de fecho são idênticos ao que
 * era quando este código vivia inline no componente-pai.
 */
function Lightbox({
  index,
  pool,
  playing,
  setPlaying,
  closing,
  justOpened,
  setJustOpened,
  setLb,
  close,
  prev,
  next,
  dismiss,
  viewCollection,
  dict,
}: {
  index: number;
  pool: Photo[];
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  closing: boolean;
  justOpened: boolean;
  setJustOpened: (v: boolean) => void;
  setLb: (v: number | null) => void;
  close: () => void;
  prev: () => void;
  next: () => void;
  dismiss: () => void;
  viewCollection: (name: string) => void;
  dict: Dict["galeria"];
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Drag-to-dismiss / swipe gesture on the lightbox (touch). The photo layer
  // and backdrop are driven directly via refs during the drag (no per-frame
  // React re-render → stays at 60fps); state only changes on release.
  const photoLayerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef({ x: 0, y: 0, dx: 0, dy: 0, axis: "" as "" | "x" | "y" });

  const labelText = (l: Label) => dict.labels[l];
  const altText = (src: string, l: Label) => {
    const base = dict.alt[l];
    const c = collectionFor(src);
    return c ? `${base} — ${c}` : base;
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Tab" && dialogRef.current) {
        // Trap focus inside the lightbox dialog.
        const f = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (!dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [close, prev, next, setPlaying]);

  // Move focus into the dialog on open; restore it to the trigger on close
  // (mount = abrir, unmount = fechar, já que este componente só vive aberto).
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  // Slideshow cinematográfico — auto-avança enquanto estiver a reproduzir e o
  // separador estiver visível. Pausável (botão / barra de espaço) — WCAG 2.2.2.
  useEffect(() => {
    if (!playing) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const id = window.setTimeout(next, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [playing, next]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Touch gestures on the open lightbox: horizontal swipe = prev/next,
  // vertical drag-down = dismiss (the photo follows the finger and the backdrop
  // fades, iOS-photos style). Attached as a NATIVE non-passive listener so the
  // vertical drag can preventDefault (kill the rubber-band); the photo/backdrop
  // are moved by writing to refs, never React state, so a drag never re-renders.
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const g = gestureRef.current;
    const layer = () => photoLayerRef.current;
    const backdrop = () => backdropRef.current;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      g.x = touch.clientX;
      g.y = touch.clientY;
      g.dx = 0;
      g.dy = 0;
      g.axis = "";
    };
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      g.dx = touch.clientX - g.x;
      g.dy = touch.clientY - g.y;
      if (g.axis === "") {
        if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) return;
        g.axis = Math.abs(g.dy) > Math.abs(g.dx) ? "y" : "x";
        if (g.axis === "y") layer()?.classList.add("lb-dragging");
      }
      if (g.axis === "y" && g.dy > 0) {
        e.preventDefault();
        const l = layer();
        const b = backdrop();
        const scale = 1 - Math.min(g.dy / 1400, 0.12);
        if (l) l.style.transform = `translateY(${g.dy}px) scale(${scale})`;
        if (b) b.style.opacity = String(1 - Math.min(g.dy / 500, 0.72));
      }
    };
    const onEnd = () => {
      const l = layer();
      const b = backdrop();
      if (g.axis === "y") {
        l?.classList.remove("lb-dragging");
        if (g.dy > 120) {
          if (l) l.style.transform = "translateY(115%) scale(0.88)";
          if (b) b.style.opacity = "0";
          window.setTimeout(dismiss, 220);
        } else {
          if (l) l.style.transform = "";
          if (b) b.style.opacity = "";
        }
      } else if (g.axis === "x" && Math.abs(g.dx) > 50) {
        if (g.dx < 0) next();
        else prev();
      }
      g.axis = "";
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
    };
  }, [next, prev, dismiss]);

  if (typeof document === "undefined") return null;

  // Thumbnail strip around current photo
  const half = Math.floor(STRIP / 2);
  const stripStart = Math.max(0, Math.min(index - half, pool.length - STRIP));
  const stripIdx = Array.from({ length: Math.min(STRIP, pool.length) }, (_, k) => stripStart + k);
  // Em rede lenta / Save-Data não pré-carregamos os vizinhos full-screen.
  const preloadNeighbours = shouldPreloadNeighbours();

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${dict.lbGallery} — ${labelText(pool[index].label)}, ${dict.lbPhoto} ${index + 1} ${dict.lbOf} ${pool.length}`}
      tabIndex={-1}
      className={`fixed inset-0 z-[60] flex flex-col select-none focus:outline-none${closing ? " lb-closing" : ""}`}
      onClick={close}
    >
      {/* Fundo preto — camada própria que só anima opacidade, para o morph
          da foto poder crescer por cima sem brigar com o <ViewTransition>.
          É também o que o gesto de arrastar-para-baixo desvanece. */}
      <div ref={backdropRef} className="lb-backdrop absolute inset-0 bg-black" />

      {/* Barra superior */}
      <div
        className="lb-scrim lb-chrome relative z-10 flex items-center justify-between px-5 pb-3.5 flex-shrink-0"
        // Clear the notch so the counter / close button aren't hidden under
        // the status bar on notched phones (keeps its base top padding too).
        style={{ paddingTop: "calc(0.875rem + env(safe-area-inset-top))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-xs font-light tabular-nums">{index + 1}</span>
          <span className="text-white/40 text-xs">/</span>
          <span className="text-white/55 text-xs tabular-nums">{pool.length}</span>
          <span className="w-px h-3 bg-white/10 mx-1" />
          {collectionFor(pool[index].src) && (
            <span className="flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  viewCollection(collectionFor(pool[index].src)!);
                }}
                aria-label={`${dict.viewWedding} — ${collectionFor(pool[index].src)}`}
                title={dict.viewWedding}
                className="text-white/70 text-xs hover:text-white underline decoration-white/25 hover:decoration-white/70 underline-offset-4 transition-colors"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {collectionFor(pool[index].src)}
              </button>
              <span className="text-white/20 mx-1.5">·</span>
            </span>
          )}
          <span className="text-white/65 text-[10px] tracking-[0.15em] uppercase">
            {labelText(pool[index].label)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? dict.lbPause : dict.lbPlay}
            aria-pressed={playing}
            className={`p-3 transition-colors rounded-full hover:bg-white/8 ${playing ? "text-moss-light" : "text-white/40 hover:text-white"}`}
          >
            {playing ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.8-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
              </svg>
            )}
          </button>
          <button
            onClick={close}
            aria-label={dict.lbClose}
            className="p-3 text-white/40 hover:text-white transition-colors rounded-full hover:bg-white/8"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Barra de progresso do slideshow — reinicia a cada foto */}
      {playing && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/8 z-20 pointer-events-none">
          <div
            key={index}
            className="lb-progress h-full bg-gradient-to-r from-moss to-moss-light origin-left"
          />
        </div>
      )}

      {/* Área da foto + botões */}
      <div className="relative flex-1 flex items-center justify-center min-h-0">
        {/* Botão anterior */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label={dict.lbPrev}
          className="absolute left-3 md:left-6 z-10 grid place-items-center w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/8 backdrop-blur-md text-white/75 ring-1 ring-white/10 hover:bg-white/15 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Foto principal */}
        <div
          ref={photoLayerRef}
          className="lb-photo-layer absolute inset-0 mx-2 md:mx-20 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <VTWrap key={index} name={vtId(pool[index].src)} exit="vt-lb">
            <Image
              key={index}
              src={pool[index].src}
              alt={altText(pool[index].src, pool[index].label)}
              fill
              sizes="90vw"
              quality={60}
              className={`object-contain ${
                playing ? "lb-kenburns" : justOpened && ViewTransition ? "" : "lb-photo-in"
              }`}
              {...blurProps(pool[index])}
            />
          </VTWrap>
        </div>

        {/* Pré-carrega os vizinhos (anterior/seguinte) para que ← → seja
            instantâneo — fetch na mesma resolução do visor, fora de ecrã.
            Só em rede boa: em Save-Data / 2g / 3g é ignorado para não gastar
            dados com imagens grandes que talvez nunca sejam vistas. */}
        <div
          aria-hidden
          className="absolute h-px w-px overflow-hidden opacity-0 pointer-events-none"
        >
          {preloadNeighbours &&
            Array.from(
              new Set([(index - 1 + pool.length) % pool.length, (index + 1) % pool.length]),
            )
              .filter((i) => i !== index)
              .map((i) => (
                <Image
                  key={i}
                  src={pool[i].src}
                  alt=""
                  fill
                  sizes="90vw"
                  quality={60}
                  loading="eager"
                />
              ))}
        </div>

        {/* Botão próxima */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label={dict.lbNext}
          className="absolute right-3 md:right-6 z-10 grid place-items-center w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/8 backdrop-blur-md text-white/75 ring-1 ring-white/10 hover:bg-white/15 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Strip de thumbnails */}
      <div
        className="lb-chrome flex items-center justify-center gap-1 px-4 py-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {stripIdx.map((idx) => (
          <button
            key={idx}
            onClick={() => {
              setJustOpened(false);
              setLb(idx);
            }}
            aria-label={`${dict.lbPhoto} ${idx + 1} ${dict.lbOf} ${pool.length}`}
            aria-current={idx === index ? "true" : undefined}
            className={`relative flex-shrink-0 overflow-hidden transition-all duration-200 ${FOCUS_RING} ${
              idx === index
                ? "w-[72px] h-[52px] ring-1 ring-white/60 opacity-100"
                : "w-[60px] h-[44px] opacity-30 hover:opacity-60 hover:scale-105"
            }`}
          >
            <Image src={pool[idx].src} alt="" fill sizes="72px" className="object-cover" />
          </button>
        ))}
      </div>

      {/* Dicas teclado */}
      <p className="text-center text-white/45 text-[10px] tracking-widest pb-2 flex-shrink-0 hidden md:block">
        {dict.keyboardHint}
      </p>
    </div>,
    document.body,
  );
}
