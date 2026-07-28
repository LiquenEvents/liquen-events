"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_IMPORT_BATCH,
  THEME_PAGE_SIZE,
  type ThemeImage,
  type ThemeSummary,
} from "@/lib/theme-types";
import { useToast } from "./Toast";
import { useFocusTrap } from "./useFocusTrap";
import { Button } from "./ui";

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
 *   · a importação corre em lotes com barra de progresso, em vez de um pedido
 *     único de dez segundos com o diálogo congelado.
 */

/** Último tema usado, para abrir já no sítio certo na proposta seguinte. */
const LAST_THEME_KEY = "liquen-tema-recente";

/** A partir de quantas fotos o rodapé passa a contar "X de 40": a meio do
 *  caminho, cedo o suficiente para o teto não aparecer de surpresa. */
const COUNTDOWN_FROM = MAX_IMPORT_BATCH / 2;

/** Fotos por pedido de importação.
 *
 *  A rota aceita as 40 de uma assentada, mas isso são ~10 s com a barra
 *  parada e um "falhou" que não diz quais. Em lotes de 8 a barra mexe-se cinco
 *  vezes, o que falha fica circunscrito ao lote (as outras já entraram) e a
 *  ordem por que a Catarina tocou nas fotos mantém-se — os lotes são enviados
 *  em sequência e cada um preserva a ordem que lhe deram. */
const IMPORT_CHUNK = 8;

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
}

interface Props {
  quoteId: string;
  /** `false` para as capas (uma imagem por espaço). */
  multiple: boolean;
  /** Caminhos da BIBLIOTECA (`<tema>/<ficheiro>`) que já foram importados para
   *  esta proposta. Só serve para marcar a grelha — escolher outra vez é
   *  permitido (a mesma foto pode estar na capa e num mood board). */
  usedThemePaths?: readonly string[];
  onClose: () => void;
  onPicked: (images: ImportedImage[]) => void;
}

export default function ThemePicker({
  quoteId,
  multiple,
  usedThemePaths,
  onClose,
  onPicked,
}: Props) {
  const { toast } = useToast();
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [themeId, setThemeId] = useState<string | null>(null);

  /** As fotos JÁ CARREGADAS, mais recentes primeiro — sempre um PREFIXO da
   *  lista do servidor, que é o que faz do `images.length` um offset válido. */
  const [images, setImages] = useState<ThemeImage[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** A última página veio cheia → é provável que haja mais. */
  const [pageFull, setPageFull] = useState(false);
  /** A pasta não pôde ser LIDA. Não é o mesmo que "tema sem fotos". */
  const [unreadable, setUnreadable] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  /** Qual a célula que responde ao Tab (roving tabindex). */
  const [focusIndex, setFocusIndex] = useState(0);
  /** Foto aberta em grande, por índice na grelha. */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** O que não entrou na última tentativa — continua selecionado. */
  const [failedPaths, setFailedPaths] = useState<string[]>([]);

  /** Onde começou o intervalo do Shift (clique ou seta). */
  const anchor = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const stopRequested = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const usedSet = useMemo(() => new Set(usedThemePaths ?? []), [usedThemePaths]);

  // ── Temas disponíveis ──
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/temas", { cache: "no-store" });
        if (!res.ok) throw new Error("falhou");
        const list: ThemeSummary[] = await res.json();
        if (!active) return;
        setThemes(list);
        // Abre no último tema usado, se ainda existir; senão no primeiro.
        let preferred: string | null = null;
        try {
          preferred = localStorage.getItem(LAST_THEME_KEY);
        } catch {
          /* localStorage indisponível — segue com o primeiro tema */
        }
        setThemeId(list.some((t) => t.id === preferred) ? preferred : (list[0]?.id ?? null));
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
    // `themeId` só passa de null para um tema (nunca de volta), por isso não há
    // nada a limpar quando ainda não há seleção.
    if (!themeId) return;
    let active = true;
    (async () => {
      setLoadingImages(true);
      setImages([]);
      setTotal(null);
      setTruncated(false);
      setPageFull(false);
      setUnreadable(false);
      setFocusIndex(0);
      anchor.current = null;
      try {
        const res = await fetch(`/api/temas/${themeId}/imagens?offset=0&limit=${THEME_PAGE_SIZE}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("falhou");
        const data = await res.json();
        if (!active) return;
        const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
        setImages(page);
        setTotal(typeof data?.total === "number" ? data.total : page.length);
        setTruncated(Boolean(data?.truncated));
        setPageFull(page.length >= THEME_PAGE_SIZE);
        // `ok: false` (com 200) é "a pasta não pôde ser lida agora".
        setUnreadable(data?.ok === false);
      } catch {
        if (active) toast("Não foi possível carregar as fotos deste tema.", "error");
      } finally {
        if (active) setLoadingImages(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [themeId, toast]);

  /** O offset seguinte é sempre quantas fotos já temos: `images` é um prefixo
   *  exato da lista do servidor (ver `mergePage`). */
  const nextOffset = images.length;
  const remaining = total === null ? null : Math.max(0, total - images.length);
  const hasMore = pageFull || (remaining !== null && remaining > 0);

  async function loadMore() {
    if (loadingMore || !themeId) return;
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
      setImages((prev) => mergePage(prev, page));
      if (typeof data?.total === "number") setTotal(data.total);
      setTruncated(Boolean(data?.truncated));
      setPageFull(page.length >= THEME_PAGE_SIZE);
    } catch {
      toast("Não foi possível carregar mais fotos.", "error");
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }

  // `dismiss`/`importSelected` e não `close`/`confirm`: os nomes curtos
  // escondiam o `window.close`/`window.confirm` — e o `window.confirm()` é o
  // idioma de confirmação desta ferramenta, não se pode ficar ambíguo.
  const dismiss = useCallback(() => {
    if (!importing) onClose();
  }, [importing, onClose]);

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

  function pickTheme(id: string) {
    if (id === themeId) return;
    setThemeId(id);
    setSelected([]);
    setFailedPaths([]);
    setPreviewIndex(null);
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
    if (importing) return;
    const im = images[index];
    if (!im) return;
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
    if (e.shiftKey && multiple && !importing) {
      if (anchor.current === null) anchor.current = current;
      selectRange(anchor.current, moved, true);
    } else if (!e.shiftKey) {
      anchor.current = moved;
    }
  }

  // ── Importação ────────────────────────────────────────────────────────────

  /**
   * Copia `paths` para a proposta, em lotes, com progresso real.
   *
   * Cada lote que chega é entregue já ao estúdio (`onPicked`) em vez de se
   * esperar pelo fim: se a ligação cair a meio, o que entrou fica. O que
   * falhou volta a ser a seleção, para o "Tentar outra vez" não obrigar a
   * escolher tudo de novo.
   */
  async function runImport(paths: string[]) {
    if (paths.length === 0 || importing) return;
    stopRequested.current = false;
    setImporting(true);
    setFailedPaths([]);
    setProgress({ done: 0, total: paths.length });

    const stillFailed: string[] = [];
    let added = 0;
    let firstError: string | null = null;
    let stopped = false;

    for (let i = 0; i < paths.length; i += IMPORT_CHUNK) {
      if (stopRequested.current) {
        stopped = true;
        stillFailed.push(...paths.slice(i));
        break;
      }
      const chunk = paths.slice(i, i + IMPORT_CHUNK);
      try {
        const res = await fetch(`/api/orcamento/${quoteId}/assets/importar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: chunk }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Falha ao adicionar as imagens.");
        const copied: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
        const failedHere: string[] = Array.isArray(data?.failed) ? data.failed : [];
        // A rota devolve as cópias pela ordem pedida, saltando as que
        // falharam — é isso que deixa emparelhar cada cópia com a foto da
        // biblioteca de onde veio. Se as contas não baterem certo, prefere-se
        // ficar sem a marca "já nesta proposta" a inventar uma origem errada.
        const sources = chunk.filter((p) => !failedHere.includes(p));
        const aligned = sources.length === copied.length;
        const picked: ImportedImage[] = copied.map((im, k) =>
          aligned ? { ...im, sourcePath: sources[k] } : { ...im },
        );
        if (picked.length > 0) {
          added += picked.length;
          onPicked(picked);
        }
        stillFailed.push(...failedHere);
      } catch (err) {
        if (!firstError) {
          firstError = err instanceof Error ? err.message : "Falha ao adicionar as imagens.";
        }
        stillFailed.push(...chunk);
      }
      if (!alive.current) return;
      setProgress({ done: Math.min(i + IMPORT_CHUNK, paths.length), total: paths.length });
    }

    if (!alive.current) return;
    setImporting(false);
    setProgress(null);
    stopRequested.current = false;
    setSelected(stillFailed);
    setFailedPaths(stillFailed);

    if (stillFailed.length === 0) {
      toast(plural(added, "imagem adicionada", "imagens adicionadas") + ".", "success");
      onClose();
      return;
    }
    if (added === 0 && !stopped) {
      toast(firstError ?? "Falha ao adicionar as imagens.", "error");
      return;
    }
    toast(`${added} de ${paths.length} imagens adicionadas.`, stopped ? "info" : "error");
  }

  const activeTheme = themes.find((t) => t.id === themeId) ?? null;
  /** Chegou-se ao teto: só se pode tirar fotos da seleção, não juntar mais. */
  const atLimit = multiple && selected.length >= MAX_IMPORT_BATCH;
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
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
              Ainda não há temas. Crie o primeiro em <strong>Temas</strong>, no menu lateral, e
              carregue lá as fotos de inspiração.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Temas">
              {themes.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={t.id === themeId ? "subtle" : "ghost"}
                  aria-pressed={t.id === themeId}
                  onClick={() => pickTheme(t.id)}
                >
                  {t.name}
                  <span className="bo-text-muted">{themeCountLabel(t)}</span>
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Barra de seleção — só faz sentido com várias fotos a escolher */}
        {multiple && images.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-foreground/[0.06] px-5 py-2.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={selectAllVisible}
              disabled={importing || atLimit}
            >
              Selecionar todas as visíveis
            </Button>
            {selected.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected([])}
                disabled={importing}
              >
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
        <div className="min-h-[10rem] flex-1 overflow-y-auto px-5 py-4">
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
                É uma falha temporária — as fotos não desapareceram. Tente daqui a pouco.
              </p>
            </div>
          ) : images.length === 0 ? (
            <p className="bo-text-muted py-8 text-center text-sm">
              Este tema ainda não tem fotos. Adicione-as em <strong>Temas</strong>.
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
                  const used = usedSet.has(im.path);
                  // No teto, as fotos por escolher ficam apagadas e anunciadas
                  // como indisponíveis (aria-disabled, não `disabled`: o botão
                  // continua alcançável pelo teclado).
                  const blocked = (atLimit && !on) || importing;
                  return (
                    <div key={im.path} className="group relative">
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
                          used ? " (já nesta proposta)" : ""
                        }`}
                        onClick={(e) => toggleAt(i, e.shiftKey)}
                        onFocus={() => setFocusIndex(i)}
                        className={`relative block aspect-square w-full overflow-hidden rounded-lg border bg-foreground/[0.04] motion-safe:transition-all ${
                          on
                            ? "border-[#4d6350] ring-2 ring-[#4d6350]/35"
                            : "border-foreground/[0.1] hover:border-[#4d6350]/45"
                        } ${blocked ? "opacity-50" : ""}`}
                      >
                        <Photo image={im} />
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
                        {used && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-black/65 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-[0.06em] text-white"
                          >
                            Já nesta proposta
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

        {/* Progresso da importação */}
        {progress && (
          <div className="border-t border-foreground/[0.06] px-5 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-foreground/80">
                A adicionar <strong className="font-medium">{progress.done}</strong> de{" "}
                {plural(progress.total, "foto", "fotos")}…
              </p>
              <span className="bo-text-muted text-xs">{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Progresso da importação"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
            >
              <div
                className="h-full rounded-full bg-[#4d6350] motion-safe:transition-[width] motion-safe:duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* O que não entrou — os caminhos ficam guardados, não se volta a escolher */}
        {failedPaths.length > 0 && !importing && (
          <div className="border-t border-[#8a2a22]/20 bg-[#f6e6df]/40 px-5 py-3">
            <p className="text-sm text-foreground/80">
              {plural(failedPaths.length, "foto não entrou", "fotos não entraram")} na proposta.
            </p>
            <p className="bo-text-muted mt-0.5 text-xs">
              Continuam selecionadas — pode tentar outra vez sem as escolher de novo.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void runImport(failedPaths)}>
                Tentar outra vez
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFailedPaths([])}>
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
                  ? "Toque nas fotos que quer usar."
                  : "Escolha uma foto."
                : multiple && selected.length >= COUNTDOWN_FROM
                  ? `${selected.length} de ${MAX_IMPORT_BATCH} selecionadas`
                  : `${selected.length} ${selected.length === 1 ? "selecionada" : "selecionadas"}`}
            </p>
            {atLimit && (
              <p className="bo-text-muted mt-0.5 text-xs">
                Pode adicionar até {MAX_IMPORT_BATCH} fotos de cada vez.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Durante a importação este botão passa a "Parar": um lote de 40
                demora segundos e ficar com o diálogo refém não é opção. O que
                já entrou fica; o resto vai para a caixa do "Tentar outra vez". */}
            <Button
              variant="ghost"
              size="sm"
              onClick={
                importing
                  ? () => {
                      stopRequested.current = true;
                    }
                  : dismiss
              }
            >
              {importing ? "Parar" : "Cancelar"}
            </Button>
            <Button
              size="sm"
              onClick={() => void runImport(selected)}
              loading={importing}
              disabled={selected.length === 0 || importing}
            >
              {importing ? "A adicionar…" : "Adicionar à proposta"}
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
            canSelect={!importing && (!atLimit || selectedSet.has(preview.path))}
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
function Photo({ image }: { image: ThemeImage }) {
  const [src, setSrc] = useState(image.thumbUrl || image.url);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => {
        if (src !== image.url) setSrc(image.url);
      }}
      className="h-full w-full object-cover"
    />
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
