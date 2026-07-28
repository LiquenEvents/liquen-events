"use client";

import { useEffect, useRef, useState } from "react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import { MAX_THEME_NAME, MAX_THEME_NOTES } from "@/lib/theme-types";
import { useToast } from "./Toast";
import { prepareImageForUpload } from "./image-prep";
import { Button, Card, EmptyState, Field, Toolbar } from "./ui";

/**
 * Biblioteca de Temas — o sítio onde o estúdio guarda, uma vez, as fotos de
 * inspiração que usa em quase todos os casamentos ("Itália", "Terracotta",
 * "Branco & Verde"…).
 *
 * Depois, ao montar uma proposta, o estúdio abre "Da biblioteca" no mood board,
 * escolhe o tema e as fotos entram na proposta — sem ir ao Pinterest nem
 * procurar pastas no computador.
 *
 * Ecrã em dois níveis: a lista de temas (cartões com capa + nº de fotos) e,
 * ao abrir um, a pasta desse tema com carregamento e remoção de fotos.
 */

const PlusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const FolderIcon = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
  >
    <path
      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      strokeLinejoin="round"
    />
    <circle cx="9.5" cy="12.5" r="1.5" />
    <path d="m6 17 3.5-3 3 2.5L16 13l3 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Temas() {
  const { toast } = useToast();
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/temas", { cache: "no-store" });
        if (res.ok) setThemes(await res.json());
        else toast("Não foi possível carregar os temas.", "error");
      } catch {
        toast("Erro de ligação ao carregar os temas.", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/temas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, notes: newNotes.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Não foi possível criar o tema.", "error");
        return;
      }
      const created: ThemeSummary = data;
      setThemes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "pt")));
      setNewName("");
      setNewNotes("");
      setAdding(false);
      setOpenId(created.id);
      toast(`Tema "${created.name}" criado. Agora carregue as fotos.`, "success");
    } catch {
      toast("Erro de ligação ao criar o tema.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeTheme(t: ThemeSummary) {
    if (
      !confirm(
        `Eliminar o tema "${t.name}"${t.imageCount ? ` e as suas ${t.imageCount} fotos` : ""}? ` +
          "As propostas já feitas com estas fotos não são afetadas. Esta ação não pode ser anulada.",
      )
    )
      return;
    const snapshot = themes;
    setThemes((prev) => prev.filter((x) => x.id !== t.id));
    if (openId === t.id) setOpenId(null);
    try {
      const res = await fetch(`/api/temas/${t.id}`, { method: "DELETE" });
      if (res.ok) toast("Tema eliminado.", "success");
      else {
        setThemes(snapshot);
        toast("Não foi possível eliminar o tema.", "error");
      }
    } catch {
      setThemes(snapshot);
      toast("Erro de ligação ao eliminar.", "error");
    }
  }

  /** Mantém a contagem/capa do cartão certas depois de mexer nas fotos. */
  function syncCounts(id: string, images: ThemeImage[]) {
    setThemes((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, imageCount: images.length, coverUrl: images[0]?.url } : t,
      ),
    );
  }

  const open = themes.find((t) => t.id === openId) ?? null;

  if (open) {
    return (
      <ThemeFolder
        theme={open}
        onBack={() => setOpenId(null)}
        onImagesChange={(images) => syncCounts(open.id, images)}
        onRename={(name) =>
          setThemes((prev) =>
            prev
              .map((t) => (t.id === open.id ? { ...t, name } : t))
              .sort((a, b) => a.name.localeCompare(b.name, "pt")),
          )
        }
        onDelete={() => removeTheme(open)}
      />
    );
  }

  return (
    <div>
      <Toolbar
        className="mb-6"
        start={
          <p className="max-w-xl text-sm leading-relaxed text-foreground/55">
            Guarde aqui as fotos por tema. Depois, no estúdio de propostas, é só escolher o tema e
            as fotos entram no mood board.
          </p>
        }
        end={
          <Button
            variant={adding ? "secondary" : "primary"}
            size="sm"
            iconLeft={adding ? undefined : PlusIcon}
            onClick={() => setAdding(!adding)}
          >
            {adding ? "Cancelar" : "Novo tema"}
          </Button>
        }
      />

      {adding && (
        <Card padding="sm" className="mb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nome do tema"
              required
              maxLength={MAX_THEME_NAME}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex.: Terracotta, Itália, Branco & Verde"
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
            <Field
              label="Nota (opcional)"
              maxLength={MAX_THEME_NOTES}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Ex.: tons quentes, para espaços de pedra"
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={create} loading={saving} disabled={!newName.trim() || saving}>
              Criar tema
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bo-skeleton aspect-[4/3] rounded-2xl" aria-hidden />
          ))}
          <p className="sr-only">A carregar temas…</p>
        </div>
      ) : themes.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={FolderIcon}
            title="Ainda não há temas"
            description="Crie um tema por estilo que usa nos casamentos — Itália, Terracotta, Branco & Verde — e carregue lá as fotos de inspiração. Depois é só escolher na proposta."
            action={{ label: "Criar tema", onClick: () => setAdding(true) }}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenId(t.id)}
              className="group overflow-hidden rounded-2xl border border-foreground/[0.08] bg-white text-left shadow-[0_1px_2px_rgba(42,38,32,0.04)] motion-safe:transition-colors hover:border-[#4d6350]/40"
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-foreground/[0.04]">
                {t.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.coverUrl}
                    alt=""
                    className="h-full w-full object-cover motion-safe:transition-transform group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground/25">
                    {FolderIcon}
                  </div>
                )}
              </div>
              <div className="px-4 py-3">
                <p className="font-display text-[15px] text-foreground/85">{t.name}</p>
                <p className="mt-0.5 text-xs text-foreground/40">
                  {t.imageCount} {t.imageCount === 1 ? "foto" : "fotos"}
                  {t.notes ? ` · ${t.notes}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A pasta de UM tema: renomear, carregar fotos, remover fotos, eliminar. */
function ThemeFolder({
  theme,
  onBack,
  onImagesChange,
  onRename,
  onDelete,
}: {
  theme: ThemeSummary;
  onBack: () => void;
  onImagesChange: (images: ThemeImage[]) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [images, setImages] = useState<ThemeImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [name, setName] = useState(theme.name);
  const [renaming, setRenaming] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/temas/${theme.id}/imagens`, { cache: "no-store" });
        if (!res.ok) throw new Error("falhou");
        const data = await res.json();
        if (!alive) return;
        const list: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
        setImages(list);
        onImagesChange(list);
      } catch {
        if (alive) toast("Não foi possível carregar as fotos do tema.", "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // onImagesChange é recriada a cada render do pai; só o tema importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.id, toast]);

  /** Um ficheiro por pedido: o limite de corpo do alojamento (~4,5 MB) rebenta
   *  com um lote inteiro de fotos de telemóvel, e um ficheiro mau nunca deve
   *  deitar fora os restantes. */
  async function upload(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const added: ThemeImage[] = [];
    const errors: string[] = [];
    try {
      for (const f of files) {
        try {
          const prepared = await prepareImageForUpload(f, "board");
          const form = new FormData();
          form.append("files", prepared);
          const res = await fetch(`/api/temas/${theme.id}/imagens`, {
            method: "POST",
            body: form,
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error || `Falha ao carregar "${f.name}".`);
          const im: ThemeImage | undefined = data?.images?.[0];
          if (!im) throw new Error(`Falha ao carregar "${f.name}".`);
          added.push(im);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`);
        } finally {
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      }
      if (added.length > 0) {
        const next = [...added, ...images];
        setImages(next);
        onImagesChange(next);
      }
      if (errors.length > 0) {
        toast(
          errors.length === files.length
            ? errors[0]
            : `${added.length} de ${files.length} carregadas. ${errors[0]}`,
          "error",
        );
      } else {
        toast(
          `${added.length} ${added.length === 1 ? "foto adicionada" : "fotos adicionadas"} a "${theme.name}".`,
          "success",
        );
      }
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  function pick(list: FileList | null) {
    if (!list) return;
    // HEIC e ficheiros de câmara chegam por vezes com `type` vazio — aceitar
    // também por extensão em vez de os descartar em silêncio.
    const files = Array.from(list).filter(
      (f) =>
        f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name),
    );
    if (files.length) upload(files);
  }

  async function removeImage(path: string) {
    const snapshot = images;
    const next = images.filter((i) => i.path !== path);
    setImages(next);
    onImagesChange(next);
    try {
      const res = await fetch(`/api/temas/${theme.id}/imagens?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("falhou");
    } catch {
      setImages(snapshot);
      onImagesChange(snapshot);
      toast("Não foi possível remover a foto.", "error");
    }
  }

  async function rename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === theme.name) {
      setName(theme.name);
      setRenaming(false);
      return;
    }
    try {
      const res = await fetch(`/api/temas/${theme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setName(theme.name);
        toast(data?.error || "Não foi possível renomear o tema.", "error");
        return;
      }
      onRename(trimmed);
      toast("Tema renomeado.", "success");
    } catch {
      setName(theme.name);
      toast("Erro de ligação ao renomear.", "error");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Temas
          </Button>
          {renaming ? (
            <input
              autoFocus
              value={name}
              maxLength={MAX_THEME_NAME}
              onChange={(e) => setName(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === "Enter") rename();
                if (e.key === "Escape") {
                  setName(theme.name);
                  setRenaming(false);
                }
              }}
              aria-label="Nome do tema"
              className="bo-input px-3 py-1.5 text-sm text-foreground/85"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="font-display text-xl text-foreground/85 hover:text-[#4d6350]"
              title="Renomear tema"
            >
              {theme.name}
            </button>
          )}
          <span className="text-xs text-foreground/40">
            {images.length} {images.length === 1 ? "foto" : "fotos"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            iconLeft={PlusIcon}
            loading={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {progress ? `A carregar ${progress.done}/${progress.total}…` : "Adicionar fotos"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Eliminar tema
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
        className={`rounded-2xl border border-dashed p-4 motion-safe:transition-colors ${
          drag ? "border-[#4d6350]/60 bg-[#4d6350]/[0.06]" : "border-foreground/[0.14]"
        }`}
      >
        {loading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bo-skeleton aspect-square rounded-lg" aria-hidden />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-foreground/55">
              Arraste para aqui as fotos deste tema, ou use “Adicionar fotos”.
            </p>
            <p className="mt-1 text-xs text-foreground/35">
              JPG, PNG ou WEBP · também HEIC do iPhone
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {images.map((im) => (
              <div
                key={im.path}
                className="group relative aspect-square overflow-hidden rounded-lg border border-foreground/[0.1] bg-foreground/[0.04]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(im.path)}
                  aria-label="Remover foto"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-xs leading-none text-white opacity-0 motion-safe:transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
