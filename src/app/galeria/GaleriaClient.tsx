"use client";

import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { PhotoSrc, Label } from "./photos-data";
import { useTranslations } from "@/components/LocaleProvider";
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

/** Photo enriched server-side with its blur placeholder + real aspect ratio
 *  (see photos-data.ts) — keeps the site-wide blur-map.json / image-dims.json
 *  out of this client bundle. */
export interface Photo extends PhotoSrc {
  blurDataURL: string;
  aspectRatio: string;
}

// Human-readable collection (event) inferred from the file name — adds a
// curated, gallery-grade caption. Only confident matches; otherwise null.
function collectionFor(src: string): string | null {
  const f = src.toLowerCase();
  if (f.includes("danigui")) return "Daniela & Guilherme";
  if (f.includes("joao_e_pedro") || f.includes("j&p-")) return "João & Pedro";
  if (f.includes("ines-goncalo")) return "Inês & Gonçalo";
  if (f.includes("matilde-tomas") || f.includes("matilde-e-tomas")) return "Matilde & Tomás";
  if (f.includes("teresinhaeze")) return "Teresinha & Zé";
  if (f.includes("m&f")) return "Matilde & Filipe";
  if (f.includes("natalia e jonathan")) return "Natália & Jonathan";
  if (f.includes("stephanie-mizio")) return "Stephanie & Mizio";
  if (f.includes("miaejoao")) return "Mia & João";
  if (f.includes("j&a-")) return "J & A";
  if (f.includes("sophia&artur")) return "Sophia & Artur";
  return null;
}

/** The event/collection bucket a photo belongs to (named couple, else its
    category). Photos with no bucket match still cluster by category. */
function bucketKey(p: Photo): string {
  return collectionFor(p.src) ?? `cat:${p.label}`;
}

/**
 * Spread photos so the same event never clusters — no two consecutive photos
 * from the same collection (when mathematically possible) AND each collection
 * appears at its natural frequency throughout the grid, not bunched at the end.
 *
 * Method: give every photo a fractional rank `(j + 0.5) / size` — its position
 * within its own bucket, normalised to [0,1). A 100-photo shoot lands its
 * frames at 0.005, 0.015, 0.025 … so they're ~1/frequency apart across the
 * whole list; a 5-photo shoot lands at 0.1, 0.3, 0.5 … Sorting everything by
 * rank interleaves them proportionally. Deterministic (stable across
 * renders/SSR): equal-size buckets tie-break by first-appearance order, and
 * since a bucket's own ranks are all distinct it can never place itself twice
 * in a row unless it exceeds half the list (only possible inside a
 * single-collection category, where clustering is unavoidable anyway).
 */
function interleaveByCollection(list: Photo[]): Photo[] {
  const buckets = new Map<string, Photo[]>();
  const order: string[] = [];
  for (const p of list) {
    const key = bucketKey(p);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
      order.push(key);
    }
    arr.push(p);
  }
  const ordOf = new Map(order.map((k, i) => [k, i] as const));
  const ranked: { p: Photo; rank: number; ord: number }[] = [];
  for (const key of order) {
    const arr = buckets.get(key)!;
    const ord = ordOf.get(key)!;
    for (let j = 0; j < arr.length; j++) {
      ranked.push({ p: arr[j], rank: (j + 0.5) / arr.length, ord });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || a.ord - b.ord);
  return deAdjacent(ranked.map((r) => r.p));
}

/**
 * Final safety pass: eliminate the handful of same-event neighbours the
 * fractional spread can still leave (when two ranks happen to sort together
 * with no other bucket between them). For each such spot, pull forward the
 * nearest later photo whose bucket differs from both neighbours. When a
 * category is a single collection (Corporativo, Conferência…) no fix is
 * possible — the whole shoot is one event — so it's left untouched.
 */
function deAdjacent(list: Photo[]): Photo[] {
  const out = [...list];
  for (let i = 1; i < out.length; i++) {
    if (bucketKey(out[i]) !== bucketKey(out[i - 1])) continue;
    const left = bucketKey(out[i - 1]);
    const right = i + 1 < out.length ? bucketKey(out[i + 1]) : null;
    let swap = -1;
    for (let j = i + 1; j < out.length; j++) {
      const kj = bucketKey(out[j]);
      if (kj !== left && kj !== right) {
        swap = j;
        break;
      }
    }
    if (swap !== -1) {
      const [moved] = out.splice(swap, 1);
      out.splice(i, 0, moved);
    }
  }
  return out;
}

const CATS = ["Todos", "Casamento", "Corporativo", "Conferência", "Aéreo", "Evento"] as const;
type Cat = (typeof CATS)[number];
const PAGE = 24;

// DECOR (fotos de decoração puxadas para a frente) chega via prop decorSrcs.

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

// Keyboard focus ring that survives `overflow-hidden`. The global :focus-visible
// outline is a box-shadow, which these image cells clip; an *inset* ring renders
// inside the box, so it stays visible for keyboard users tabbing the grid.
const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80";

// Hover overlay — reused in hero cells and masonry cells
function HoverOverlay({ caption, sub }: { caption: string; sub?: string }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/65 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between gap-2 opacity-0 group-hover:opacity-100 translate-y-1.5 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
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
  decorSrcs,
}: {
  photos: Photo[];
  decorSrcs: readonly string[];
}) {
  const DECOR = useMemo(() => new Set(decorSrcs), [decorSrcs]);
  const collectionNames = useMemo(
    () =>
      Array.from(new Set(photos.map((p) => collectionFor(p.src)).filter((c): c is string => !!c))),
    [photos],
  );
  const [cat, setCat] = useState<Cat>("Todos");
  // Non-null = "ver este casamento" mode: browsing one couple's full story
  // (in shoot order, no interleaving) instead of a category grid.
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [fading, setFading] = useState(false);
  // Right-edge fade on the filter pill row, only while it actually
  // overflows — hints "more categories, swipe" without permanently
  // clipping the last pill on wide viewports where everything fits.
  const [filtersOverflow, setFiltersOverflow] = useState(false);
  const filterScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = filterScrollRef.current;
    if (!el) return;
    const check = () => setFiltersOverflow(el.scrollWidth - el.clientWidth > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [lb, setLb] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  // Acabou de abrir via morph? Suprime o lb-photo-in dessa primeira foto para
  // a entrada ser SÓ o morph (voltam a coexistir ao navegar com ←/→).
  const [justOpened, setJustOpened] = useState(false);
  // As fotos 1-4 existem duas vezes no DOM (mosaico em sm+, masonry em mobile;
  // o CSS esconde uma). O React NÃO permite dois <ViewTransition> montados com
  // o mesmo nome, por isso só a instância do breakpoint ativo recebe o nome —
  // decidido pós-hidratação (null = ainda sem nomes, nunca há duplicados).
  const [isSm, setIsSm] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setIsSm(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  /** Nome VT estável por FOTO (derivado do src, tal como as keys da grelha).
      Um nome por índice mudaria de foto quando o filtro reordena a lista e o
      React acusaria duplicados transitórios durante a remontagem. */
  const vtId = (src: string) => `g-${src.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  /** Nome VT da instância do mosaico (só a foto 0 é exclusiva do mosaico). */
  const mosaicName = (idx: number) => (idx === 0 || isSm ? vtId(visible[idx].src) : undefined);
  /** Nome VT da instância do masonry (índices 1-4 só contam em mobile). */
  const masonryName = (idx: number, src: string) =>
    idx < 5 ? (isSm === false ? vtId(src) : undefined) : vtId(src);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Drag-to-dismiss / swipe gesture on the lightbox (touch). The photo layer
  // and backdrop are driven directly via refs during the drag (no per-frame
  // React re-render → stays at 60fps); state only changes on release.
  const photoLayerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef({ x: 0, y: 0, dx: 0, dy: 0, axis: "" as "" | "x" | "y" });
  const open = lb !== null;
  const { t } = useTranslations();

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
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setShowTop(window.scrollY > 1200);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
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
    return () => window.removeEventListener("hashchange", apply);
  }, [collectionNames]);

  // Localized display helpers — internal label keys stay PT (used for
  // filtering); only what the user reads is translated.
  const labelText = (l: Label) => t.galeria.labels[l];
  const altText = (l: Label) => t.galeria.alt[l];
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
  // DECORAÇÃO PRIMEIRO: em qualquer vista de categoria, as fotos de decoração
  // (ver `DECOR`) sobem para a frente — a galeria abre com arranjos, mesas e
  // detalhes. Cada bloco (decor / resto) é intercalado por coleção à parte, para
  // não amontoar o mesmo evento. A vista de uma coleção específica ignora isto
  // (é a história de um casamento por ordem).
  const pool = useMemo(() => {
    if (collectionFilter) {
      return photos.filter((p) => collectionFor(p.src) === collectionFilter);
    }
    const filtered = cat === "Todos" ? photos : photos.filter((p) => p.label === cat);
    const decor = interleaveByCollection(filtered.filter((p) => DECOR.has(p.src)));
    const rest = interleaveByCollection(filtered.filter((p) => !DECOR.has(p.src)));
    return [...decor, ...rest];
  }, [cat, collectionFilter, photos, DECOR]);
  const visible = pool.slice(0, shown);

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
  const openAt = useCallback((idx: number) => {
    setJustOpened(true);
    startTransition(() => setLb(idx));
  }, []);
  const close = useCallback(() => {
    startTransition(() => {
      setLb(null);
      setPlaying(false);
    });
  }, []);
  // Fecho sem morph — para o gesto de arrastar-para-baixo, onde a própria foto
  // já saiu do ecrã com o dedo (o morph de volta à miniatura ficaria estranho).
  const dismiss = useCallback(() => {
    setLb(null);
    setPlaying(false);
  }, []);
  const prev = useCallback(() => {
    setJustOpened(false);
    setLb((i) => (i !== null ? (i - 1 + pool.length) % pool.length : null));
  }, [pool.length]);
  const next = useCallback(() => {
    setJustOpened(false);
    setLb((i) => (i !== null ? (i + 1) % pool.length : null));
  }, [pool.length]);

  useEffect(() => {
    if (lb === null) return;
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
  }, [lb, close, prev, next]);

  // Move focus into the dialog on open; restore it to the trigger on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Slideshow cinematográfico — auto-avança enquanto estiver a reproduzir e o
  // separador estiver visível. Pausável (botão / barra de espaço) — WCAG 2.2.2.
  useEffect(() => {
    if (lb === null || !playing) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const id = window.setTimeout(next, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [lb, playing, next]);

  useEffect(() => {
    document.body.style.overflow = lb !== null ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [lb]);

  // Touch gestures on the open lightbox: horizontal swipe = prev/next,
  // vertical drag-down = dismiss (the photo follows the finger and the backdrop
  // fades, iOS-photos style). Attached as a NATIVE non-passive listener so the
  // vertical drag can preventDefault (kill the rubber-band); the photo/backdrop
  // are moved by writing to refs, never React state, so a drag never re-renders.
  useEffect(() => {
    if (lb === null) return;
    const root = dialogRef.current;
    if (!root) return;
    const g = gestureRef.current;
    const layer = () => photoLayerRef.current;
    const backdrop = () => backdropRef.current;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      g.x = t.clientX;
      g.y = t.clientY;
      g.dx = 0;
      g.dy = 0;
      g.axis = "";
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      g.dx = t.clientX - g.x;
      g.dy = t.clientY - g.y;
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
  }, [lb, next, prev, dismiss]);

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
  function viewCollection(name: string) {
    const newPool = photos.filter((p) => collectionFor(p.src) === name);
    const currentSrc = lb !== null ? pool[lb].src : null;
    const newIdx = currentSrc ? newPool.findIndex((p) => p.src === currentSrc) : -1;
    setCollectionFilter(name);
    setShown(PAGE);
    setJustOpened(false);
    if (newIdx >= 0) setLb(newIdx);
    else if (lb !== null) close();
    window.history.replaceState(null, "", `#c-${collectionSlug(name)}`);
  }

  // Thumbnail strip around current photo
  const half = Math.floor(STRIP / 2);
  const stripStart = lb !== null ? Math.max(0, Math.min(lb - half, pool.length - STRIP)) : 0;
  const stripIdx =
    lb !== null
      ? Array.from({ length: Math.min(STRIP, pool.length) }, (_, k) => stripStart + k)
      : [];

  const counts = Object.fromEntries(
    CATS.map((c) => [
      c,
      c === "Todos" ? photos.length : photos.filter((p) => p.label === c).length,
    ]),
  ) as Record<Cat, number>;

  return (
    <>
      {/* ── Filtros / vista de casamento ── */}
      {collectionFilter ? (
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => switchCat("Todos")}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs tracking-[0.12em] uppercase bg-white/8 text-white/60 hover:bg-white/15 hover:text-white/90 transition-all duration-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.galeria.backToGallery}
          </button>
          <div className="min-w-0">
            <p
              className="text-white/90 text-base truncate"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {collectionFilter}
            </p>
            <p className="text-white/55 text-[10px] tracking-[0.15em] uppercase mt-0.5">
              {pool.length} {t.galeria.photosLabel}
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={filterScrollRef}
          className={`flex gap-2 mb-8 overflow-x-auto pb-1 scrollbar-none${filtersOverflow ? " g-filter-fade" : ""}`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => switchCat(c)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs tracking-[0.12em] uppercase transition-all duration-300 ${
                cat === c
                  ? "bg-moss-dark text-cream shadow-lg shadow-moss/20"
                  : "bg-white/8 text-white/60 hover:bg-white/15 hover:text-white/90"
              }`}
            >
              {t.galeria.labels[c]}
              <span
                className={`text-[10px] tabular-nums ${cat === c ? "text-cream/90" : "text-white/50"}`}
              >
                {counts[c]}
              </span>
            </button>
          ))}
        </div>
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
                    alt={altText(visible[0].label)}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                    loading="eager"
                    placeholder="blur"
                    blurDataURL={visible[0].blurDataURL}
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
                  className={`g-hero g-tile relative hidden sm:block h-full w-full overflow-hidden group ${FOCUS_RING}`}
                  style={{ "--hero-delay": `${idx * 70}ms` } as React.CSSProperties}
                >
                  {lb !== idx && (
                    <VTWrap name={mosaicName(idx)}>
                      <Image
                        src={visible[idx].src}
                        alt={altText(visible[idx].label)}
                        fill
                        sizes="25vw"
                        className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                        loading="lazy"
                        placeholder="blur"
                        blurDataURL={visible[idx].blurDataURL}
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
            com um único nome VT estável (ver nota acima). */}
        {(collectionFilter ? visible.length > 0 : visible.length > 1) && (
          <div className="columns-1 sm:columns-2 md:columns-3 gap-0.5">
            {(collectionFilter ? visible : visible.slice(1)).map((p, i) => {
              const idx = collectionFilter ? i : i + 1;
              return (
                <div
                  key={p.src}
                  ref={registerTile}
                  className={`g-reveal cv-auto break-inside-avoid mb-0.5${!collectionFilter && idx < 5 ? " sm:hidden" : ""}`}
                  style={{ "--reveal-delay": `${(i % 3) * 60}ms` } as React.CSSProperties}
                >
                  <button
                    onClick={() => openAt(idx)}
                    className={`g-tile relative w-full overflow-hidden group ${FOCUS_RING}`}
                    style={{ aspectRatio: p.aspectRatio }}
                  >
                    {lb !== idx && (
                      <VTWrap name={collectionFilter ? vtId(p.src) : masonryName(idx, p.src)}>
                        <Image
                          src={p.src}
                          alt={altText(p.label)}
                          fill
                          sizes="(max-width: 768px) 50vw, 33vw"
                          className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                          loading={collectionFilter && i === 0 ? "eager" : "lazy"}
                          placeholder="blur"
                          blurDataURL={p.blurDataURL}
                        />
                      </VTWrap>
                    )}
                    <HoverOverlay {...caption(p.src, p.label)} />
                  </button>
                </div>
              );
            })}
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
            <div className="g-loading flex items-center gap-2" aria-live="polite">
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
            </div>
          ) : (
            // Fallback sem IntersectionObserver — botão manual.
            <button
              onClick={() => setShown((s) => Math.min(s + PAGE, pool.length))}
              className="group flex items-center gap-3 rounded-full border border-white/15 px-10 py-3.5 text-xs uppercase tracking-[0.2em] text-white/60 transition-all duration-300 hover:border-white/40 hover:text-white/90"
            >
              {t.galeria.verMais}
              <span className="text-white/55 transition-colors group-hover:text-moss-light">
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
          <p className="text-[10px] tracking-widest text-white/55">
            {shown} {t.galeria.de} {pool.length}
          </p>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lb !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${t.galeria.lbGallery} — ${labelText(pool[lb].label)}, ${t.galeria.lbPhoto} ${lb + 1} ${t.galeria.lbOf} ${pool.length}`}
            tabIndex={-1}
            className="fixed inset-0 z-[60] flex flex-col select-none focus:outline-none"
            onClick={close}
          >
            {/* Fundo preto — camada própria que só anima opacidade, para o morph
                da foto poder crescer por cima sem brigar com o <ViewTransition>.
                É também o que o gesto de arrastar-para-baixo desvanece. */}
            <div ref={backdropRef} className="lb-backdrop absolute inset-0 bg-black" />

            {/* Barra superior */}
            <div
              className="lb-scrim lb-chrome relative z-10 flex items-center justify-between px-5 py-3.5 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <span className="text-white/60 text-xs font-light tabular-nums">{lb + 1}</span>
                <span className="text-white/20 text-xs">/</span>
                <span className="text-white/25 text-xs tabular-nums">{pool.length}</span>
                <span className="w-px h-3 bg-white/10 mx-1" />
                {collectionFor(pool[lb].src) && (
                  <span className="flex items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        viewCollection(collectionFor(pool[lb].src)!);
                      }}
                      aria-label={`${t.galeria.viewWedding} — ${collectionFor(pool[lb].src)}`}
                      title={t.galeria.viewWedding}
                      className="text-white/70 text-xs hover:text-white underline decoration-white/25 hover:decoration-white/70 underline-offset-4 transition-colors"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {collectionFor(pool[lb].src)}
                    </button>
                    <span className="text-white/20 mx-1.5">·</span>
                  </span>
                )}
                <span className="text-white/30 text-[10px] tracking-[0.15em] uppercase">
                  {labelText(pool[lb].label)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? t.galeria.lbPause : t.galeria.lbPlay}
                  aria-pressed={playing}
                  className={`p-2 transition-colors rounded-full hover:bg-white/8 ${playing ? "text-moss-light" : "text-white/40 hover:text-white"}`}
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
                  aria-label={t.galeria.lbClose}
                  className="p-2 text-white/40 hover:text-white transition-colors rounded-full hover:bg-white/8"
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
                  key={lb}
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
                aria-label={t.galeria.lbPrev}
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
                className="lb-photo-layer absolute inset-0 mx-14 md:mx-20 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <VTWrap key={lb} name={vtId(pool[lb].src)} exit="vt-lb">
                  <Image
                    key={lb}
                    src={pool[lb].src}
                    alt={altText(pool[lb].label)}
                    fill
                    sizes="90vw"
                    className={`object-contain ${
                      playing ? "lb-kenburns" : justOpened && ViewTransition ? "" : "lb-photo-in"
                    }`}
                    placeholder="blur"
                    blurDataURL={pool[lb].blurDataURL}
                  />
                </VTWrap>
              </div>

              {/* Pré-carrega os vizinhos (anterior/seguinte) para que ← → seja
                  instantâneo — fetch na mesma resolução do visor, fora de ecrã. */}
              <div
                aria-hidden
                className="absolute h-px w-px overflow-hidden opacity-0 pointer-events-none"
              >
                {Array.from(new Set([(lb - 1 + pool.length) % pool.length, (lb + 1) % pool.length]))
                  .filter((i) => i !== lb)
                  .map((i) => (
                    <Image key={i} src={pool[i].src} alt="" fill sizes="90vw" loading="eager" />
                  ))}
              </div>

              {/* Botão próxima */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                aria-label={t.galeria.lbNext}
                className="absolute right-3 md:right-6 z-10 grid place-items-center w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/8 backdrop-blur-md text-white/75 ring-1 ring-white/10 hover:bg-white/15 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5l7 7-7 7"
                  />
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
                  aria-label={`${t.galeria.lbPhoto} ${idx + 1} ${t.galeria.lbOf} ${pool.length}`}
                  aria-current={idx === lb ? "true" : undefined}
                  className={`relative flex-shrink-0 overflow-hidden transition-all duration-200 ${FOCUS_RING} ${
                    idx === lb
                      ? "w-[72px] h-[52px] ring-1 ring-white/60 opacity-100"
                      : "w-[60px] h-[44px] opacity-30 hover:opacity-60 hover:scale-105"
                  }`}
                >
                  <Image src={pool[idx].src} alt="" fill sizes="72px" className="object-cover" />
                </button>
              ))}
            </div>

            {/* Dicas teclado */}
            <p className="text-center text-white/15 text-[10px] tracking-widest pb-2 flex-shrink-0 hidden md:block">
              ← → navegar · esc fechar · deslize no telemóvel
            </p>
          </div>,
          document.body,
        )}

      {/* ── Voltar ao topo ── Empilhado por cima do botão de WhatsApp (canto
          inferior direito); o canto esquerdo já tem o CTA "Pedir orçamento"
          (StickyCTA). Escondido enquanto o lightbox está aberto. */}
      <button
        onClick={scrollTop}
        aria-label={t.galeria.backToTop}
        title={t.galeria.backToTop}
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
