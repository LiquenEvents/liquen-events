"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_IMPORT_BATCH, type ThemeImage, type ThemeSummary } from "@/lib/theme-types";
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
 */

/** Último tema usado, para abrir já no sítio certo na proposta seguinte. */
const LAST_THEME_KEY = "liquen-tema-recente";

/** A partir de quantas fotos o rodapé passa a contar "X de 40": a meio do
 *  caminho, cedo o suficiente para o teto não aparecer de surpresa. */
const COUNTDOWN_FROM = MAX_IMPORT_BATCH / 2;

/** O que a pastilha de um tema mostra a seguir ao nome. `imageCount` a `null` =
 *  a pasta não pôde ser lida — dizer "0" faria a equipa pensar que as fotos
 *  desapareceram; `truncated` = a contagem é um MÍNIMO ("500+"). */
function themeCountLabel(theme: ThemeSummary): string {
  if (theme.imageCount === null) return "Fotos indisponíveis";
  return theme.truncated ? `${theme.imageCount}+` : `${theme.imageCount}`;
}

interface Props {
  quoteId: string;
  /** `false` para as capas (uma imagem por espaço). */
  multiple: boolean;
  onClose: () => void;
  onPicked: (images: ThemeImage[]) => void;
}

export default function ThemePicker({ quoteId, multiple, onClose, onPicked }: Props) {
  const { toast } = useToast();
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [images, setImages] = useState<ThemeImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // ── Temas disponíveis ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/temas", { cache: "no-store" });
        if (!res.ok) throw new Error("falhou");
        const list: ThemeSummary[] = await res.json();
        if (!alive) return;
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
        if (alive) toast("Não foi possível carregar os temas.", "error");
      } finally {
        if (alive) setLoadingThemes(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  // ── Fotos do tema selecionado ──
  useEffect(() => {
    // `themeId` só passa de null para um tema (nunca de volta), por isso não há
    // nada a limpar quando ainda não há seleção.
    if (!themeId) return;
    let alive = true;
    (async () => {
      setLoadingImages(true);
      setImages([]);
      try {
        const res = await fetch(`/api/temas/${themeId}/imagens`, { cache: "no-store" });
        if (!res.ok) throw new Error("falhou");
        const data = await res.json();
        if (alive) setImages(Array.isArray(data?.images) ? data.images : []);
      } catch {
        if (alive) toast("Não foi possível carregar as fotos deste tema.", "error");
      } finally {
        if (alive) setLoadingImages(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [themeId, toast]);

  // `dismiss`/`importSelected` e não `close`/`confirm`: os nomes curtos
  // escondiam o `window.close`/`window.confirm` — e o `window.confirm()` é o
  // idioma de confirmação desta ferramenta, não se pode ficar ambíguo.
  const dismiss = useCallback(() => {
    if (!importing) onClose();
  }, [importing, onClose]);

  // Escape fecha (o foco fica preso dentro do diálogo pelo useFocusTrap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dismiss]);

  function pickTheme(id: string) {
    setThemeId(id);
    setSelected([]);
    try {
      localStorage.setItem(LAST_THEME_KEY, id);
    } catch {
      /* não essencial */
    }
  }

  function toggle(path: string) {
    setSelected((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      if (!multiple) return [path];
      // No teto, tocar numa foto por selecionar não faz nada — o rodapé já diz
      // porquê desde que o limite foi atingido. A validação do servidor
      // mantém-se: isto só evita que a equipa escolha 60 fotos e só depois
      // descubra que não cabiam.
      if (prev.length >= MAX_IMPORT_BATCH) return prev;
      return [...prev, path];
    });
  }

  async function importSelected() {
    if (selected.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/orcamento/${quoteId}/assets/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: selected }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao adicionar as imagens.");
      const picked: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
      if (picked.length === 0) throw new Error("Falha ao adicionar as imagens.");
      onPicked(picked);
      toast(
        picked.length < selected.length
          ? `${picked.length} de ${selected.length} imagens adicionadas.`
          : `${picked.length} ${picked.length === 1 ? "imagem adicionada" : "imagens adicionadas"}.`,
        picked.length < selected.length ? "info" : "success",
      );
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao adicionar as imagens.", "error");
    } finally {
      setImporting(false);
    }
  }

  const activeTheme = themes.find((t) => t.id === themeId) ?? null;
  /** Chegou-se ao teto: só se pode tirar fotos da seleção, não juntar mais. */
  const atLimit = multiple && selected.length >= MAX_IMPORT_BATCH;

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
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
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

        {/* Fotos */}
        <div className="min-h-[10rem] flex-1 overflow-y-auto px-5 py-4">
          {loadingImages ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bo-skeleton aspect-square rounded-lg" aria-hidden />
              ))}
            </div>
          ) : !themeId ? null : images.length === 0 ? (
            <p className="bo-text-muted py-8 text-center text-sm">
              Este tema ainda não tem fotos. Adicione-as em <strong>Temas</strong>.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((im, i) => {
                const on = selected.includes(im.path);
                // No teto, as fotos por escolher ficam apagadas e anunciadas
                // como indisponíveis (aria-disabled, não `disabled`: o botão
                // continua alcançável pelo teclado).
                const blocked = atLimit && !on;
                return (
                  <button
                    key={im.path}
                    type="button"
                    aria-pressed={on}
                    aria-disabled={blocked || undefined}
                    // Nome ESTÁVEL: quem diz se está escolhida é o aria-pressed.
                    aria-label={`Foto ${i + 1} de ${images.length}`}
                    onClick={() => toggle(im.path)}
                    className={`relative aspect-square overflow-hidden rounded-lg border motion-safe:transition-all ${
                      on
                        ? "border-[#4d6350] ring-2 ring-[#4d6350]/35"
                        : "border-foreground/[0.1] hover:border-[#4d6350]/45"
                    } ${blocked ? "opacity-50" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={im.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
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
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
            <Button variant="ghost" size="sm" onClick={dismiss} disabled={importing}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={importSelected}
              loading={importing}
              disabled={selected.length === 0 || importing}
            >
              {importing ? "A adicionar…" : "Adicionar à proposta"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
