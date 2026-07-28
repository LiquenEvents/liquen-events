"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import {
  MAX_THEME_NAME,
  MAX_THEME_NOTES,
  THEME_PAGE_SIZE,
  normalizedThemeName,
} from "@/lib/theme-types";
import { useToast } from "./Toast";
import { prepareImageWithThumb } from "./image-prep";
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
 *
 * ESTE ECRÃ É DIMENSIONADO PARA MILHARES DE FOTOS. As três regras que o mantêm
 * utilizável com 8 temas e 4000 fotos:
 *
 *  1. A grelha mostra MINIATURAS (~400 px, ~40 KB), nunca os originais de
 *     3000 px — e nunca mais do que uma página de cada vez.
 *  2. Só se pede ao servidor a página que está à vista: assinar URLs é o passo
 *     caro, e assinar 4000 para mostrar 60 era o que fazia um tema demorar.
 *  3. Nada acontece em silêncio: há sempre uma contagem verdadeira à vista
 *     ("47 de 312"), e o que falha fica no ecrã com forma de voltar a tentar.
 */

/**
 * Quantos carregamentos em voo ao mesmo tempo.
 *
 * Quatro, e não mais: cada pedido leva um JPEG de ~3 MB, por isso o gargalo é
 * o canal de SUBIDA (uma ligação doméstica sobe ~10–20 Mbit/s). Mais ligações
 * não somam largura de banda — repartem a mesma —, e cada uma paga o seu pico
 * de memória (a bitmap descodificada + os canvas). Quatro, e não menos:
 * preparar a foto seguinte (descodificar + redimensionar + codificar) é
 * trabalho de CPU no fio principal, e é durante essa preparação que as outras
 * três mantêm o canal cheio. O browser abre ~6 ligações por servidor em
 * HTTP/1.1; deixar duas de fora mantém a grelha e as miniaturas a responder
 * enquanto um lote de 300 fotos sobe.
 */
const UPLOAD_CONCURRENCY = 4;

/** Remoções em voo ao mesmo tempo (pedidos vazios: mais folga do que a subida). */
const DELETE_CONCURRENCY = 6;

/** Teto de ficheiros aceites de uma pasta largada — trava um engano
 *  ("larguei a pasta Fotos toda") antes de ele encher a memória do browser. */
const MAX_DROP_FILES = 5000;

/** Teto de entradas percorridas ao expandir pastas largadas (anel de segurança
 *  contra árvores patológicas / atalhos circulares). */
const MAX_DROP_ENTRIES = 20_000;

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

const SearchIcon = (
  <svg
    className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);

/** "1 foto" / "7 fotos" — o plural aparece em meia dúzia de frases. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Quantas fotos tem o tema, em português e sem mentir:
 * `null` = a pasta NÃO pôde ser lida (dizer "0 fotos" leria-se como "as minhas
 * fotos desapareceram"); `truncated` = a contagem bateu no teto do servidor,
 * portanto é um MÍNIMO ("500+ fotos").
 */
function photoCountLabel(count: number | null, truncated?: boolean): string {
  if (count === null) return "Fotos indisponíveis";
  if (truncated) return `${count}+ fotos`;
  return plural(count, "foto", "fotos");
}

/**
 * Corre `worker` sobre `items` com no máximo `limit` em voo, pela ordem em que
 * vêm. `worker` NUNCA deve lançar — quem chama trata cada falha dentro dele e
 * guarda-a, para que um ficheiro mau não deite fora os 299 que faltam.
 * `stop` é consultado antes de cada item: é assim que sair da pasta trava o
 * que ainda não começou, sem cortar o que já vai a caminho.
 */
async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length || stop()) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

/**
 * Repõe fotos numa lista, cada uma no índice onde estava (puro — testado).
 *
 * É o que uma remoção falhada precisa: repor a lista inteira (o "snapshot" de
 * antes) deitava fora as fotos que um lote a decorrer tivesse entretanto
 * acrescentado. Insere-se de trás para a frente para que os índices guardados
 * continuem a valer à medida que a lista cresce.
 */
export function reinsertAt(
  list: ThemeImage[],
  items: ThemeImage[],
  positions: Map<string, number>,
): ThemeImage[] {
  const next = [...list];
  const ordered = [...items].sort(
    (a, b) => (positions.get(b.path) ?? 0) - (positions.get(a.path) ?? 0),
  );
  for (const im of ordered) {
    if (next.some((x) => x.path === im.path)) continue;
    next.splice(Math.min(positions.get(im.path) ?? next.length, next.length), 0, im);
  }
  return next;
}

/** Junta uma página nova ao que já está, sem duplicar (puro — testado).
 *  A ordem do servidor desloca-se enquanto se carregam fotos; a defesa é a
 *  chave estável (`path`), não a aritmética de offsets. */
export function mergePage(prev: ThemeImage[], page: ThemeImage[]): ThemeImage[] {
  const seen = new Set(prev.map((i) => i.path));
  return [...prev, ...page.filter((i) => i.path && !seen.has(i.path))];
}

/** Um ficheiro largado que é (ou parece ser) uma imagem. HEIC e ficheiros de
 *  câmara chegam por vezes com `type` vazio — aceitar também por extensão em
 *  vez de os descartar em silêncio. */
function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name);
}

/**
 * As "entries" de um arrasto — TÊM de ser lidas de forma SÍNCRONA dentro do
 * handler do drop: o `DataTransfer` é esvaziado assim que ele retorna, e um
 * único `await` antes disto deixava a lista vazia. Devolve [] em ambientes
 * sem a API (é o caso do jsdom, e de browsers antigos): aí usa-se
 * `dataTransfer.files`, que só traz ficheiros soltos.
 */
function readDropEntries(dt: DataTransfer | null): FileSystemEntry[] {
  const items = dt?.items;
  if (!items || typeof items.length !== "number") return [];
  const out: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item?.webkitGetAsEntry !== "function") continue;
    try {
      const entry = item.webkitGetAsEntry();
      if (entry) out.push(entry);
    } catch {
      // Um item que não é ficheiro (texto arrastado, por ex.) — ignora-se.
    }
  }
  return out;
}

/**
 * Expande pastas largadas até aos ficheiros, em largura.
 *
 * Vale a complexidade: a Catarina tem as fotos organizadas em pastas no
 * computador, e a alternativa é abrir a pasta, marcar tudo e arrastar — ou,
 * pior, largar a pasta e não perceber porque não aconteceu nada.
 *
 * O detalhe que costuma passar despercebido: `readEntries` devolve no máximo
 * ~100 entradas por chamada e tem de ser repetido até vir vazio — uma pasta de
 * 300 fotos largada assim carregava só as primeiras 100.
 */
async function expandDropEntries(entries: FileSystemEntry[]): Promise<{
  files: File[];
  capped: boolean;
}> {
  const files: File[] = [];
  const queue = [...entries];
  let seen = 0;
  while (queue.length > 0 && files.length < MAX_DROP_FILES && seen < MAX_DROP_ENTRIES) {
    const entry = queue.shift();
    if (!entry) break;
    seen += 1;
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        try {
          (entry as FileSystemFileEntry).file(
            (f) => resolve(f),
            () => resolve(null),
          );
        } catch {
          resolve(null);
        }
      });
      if (file) files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          try {
            reader.readEntries(
              (e) => resolve(e),
              () => resolve([]),
            );
          } catch {
            resolve([]);
          }
        });
        if (batch.length === 0) break;
        queue.push(...batch);
        if (queue.length + files.length > MAX_DROP_ENTRIES) break;
      }
    }
  }
  return { files, capped: files.length >= MAX_DROP_FILES || queue.length > 0 };
}

export default function Temas() {
  const { toast } = useToast();
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Filtrar fora da tecla: com poucos temas é imperceptível, e mantém o campo
  // instantâneo quando a lista cresce (é o mesmo padrão do Inventário).
  const deferredSearch = useDeferredValue(search);
  // Impedimento que a equipa PODE resolver (tipicamente: o schema ainda não foi
  // corrido no Supabase). Fica no ecrã, com o passo a dar — um toast que
  // desaparece não serve para uma instrução.
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/temas", { cache: "no-store" });
        if (res.ok) {
          setThemes(await res.json());
          setBlocked(null);
        } else {
          const data = await res.json().catch(() => null);
          if (res.status === 503 && data?.error) setBlocked(data.error);
          else toast(data?.error || "Não foi possível carregar os temas.", "error");
        }
      } catch {
        toast("Erro de ligação ao carregar os temas.", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  async function create() {
    // O Enter no campo do nome não passa pelo botão (que já está desativado
    // enquanto grava): sem esta guarda, dois Enter seguidos criavam dois temas.
    if (saving) return;
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
        if (res.status === 503 && data?.error) setBlocked(data.error);
        else toast(data?.error || "Não foi possível criar o tema.", "error");
        return;
      }
      setBlocked(null);
      const created: ThemeSummary = data;
      setThemes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "pt")));
      setNewName("");
      setNewNotes("");
      setAdding(false);
      setSearch("");
      setOpenId(created.id);
      toast(`Tema "${created.name}" criado. Agora carregue as fotos.`, "success");
    } catch {
      toast("Erro de ligação ao criar o tema.", "error");
    } finally {
      setSaving(false);
    }
  }

  /** Repõe UM tema depois de um DELETE falhado. Repor a lista inteira (o
   *  "snapshot" de antes do pedido) fazia desaparecer os temas criados no
   *  entretanto — e ressuscitava os que tivessem sido eliminados. */
  function restoreTheme(t: ThemeSummary) {
    setThemes((prev) =>
      prev.some((x) => x.id === t.id)
        ? prev
        : [...prev, t].sort((a, b) => a.name.localeCompare(b.name, "pt")),
    );
  }

  async function removeTheme(t: ThemeSummary) {
    // Quantas fotos se perdem pode ser desconhecido (pasta ilegível) ou apenas
    // um mínimo (contagem truncada) — a frase tem de continuar a fazer sentido.
    const photos =
      t.imageCount === null
        ? " e as fotos que tiver lá dentro"
        : t.imageCount > 0
          ? ` e as suas ${t.imageCount}${t.truncated ? "+" : ""} fotos`
          : "";
    if (
      !window.confirm(
        `Eliminar o tema "${t.name}"${photos}? ` +
          "As propostas já feitas com estas fotos não são afetadas. Esta ação não pode ser anulada.",
      )
    )
      return;
    setThemes((prev) => prev.filter((x) => x.id !== t.id));
    if (openId === t.id) setOpenId(null);
    try {
      const res = await fetch(`/api/temas/${t.id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Tema eliminado.", "success");
        return;
      }
      restoreTheme(t);
      const data = await res.json().catch(() => null);
      toast(data?.error || "Não foi possível eliminar o tema.", "error");
    } catch {
      restoreTheme(t);
      toast("Erro de ligação ao eliminar.", "error");
    }
  }

  /** Mantém o cartão do tema a par do que a pasta diz. A pasta é a fonte de
   *  verdade: a contagem passa a ser a que o servidor devolveu (e `truncated`
   *  com ela), e um `imageCount` que estava a `null` fica finalmente conhecido.
   *  `coverUrl` a `undefined` quer dizer "não se sabe" — o cartão fica como
   *  está; a `null` quer dizer "a pasta está vazia". */
  const syncCard = useCallback((id: string, s: FolderState) => {
    setThemes((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              imageCount: s.total,
              truncated: s.truncated,
              coverUrl: s.coverUrl === undefined ? t.coverUrl : (s.coverUrl ?? undefined),
            }
          : t,
      ),
    );
  }, []);

  const open = themes.find((t) => t.id === openId) ?? null;

  const visible = useMemo(() => {
    const needle = normalizedThemeName(deferredSearch);
    if (!needle) return themes;
    // Procurar por nome E por nota: a nota ("tons quentes, para espaços de
    // pedra") é muitas vezes como a Catarina se lembra do tema.
    return themes.filter((t) => normalizedThemeName(`${t.name} ${t.notes ?? ""}`).includes(needle));
  }, [themes, deferredSearch]);

  if (open) {
    return (
      <ThemeFolder
        key={open.id}
        theme={open}
        onBack={() => setOpenId(null)}
        onFolderState={(s) => syncCard(open.id, s)}
        onRename={(name) =>
          setThemes((prev) =>
            prev
              .map((t) => (t.id === open.id ? { ...t, name } : t))
              .sort((a, b) => a.name.localeCompare(b.name, "pt")),
          )
        }
        onCover={(coverPath, coverUrl) =>
          setThemes((prev) =>
            prev.map((t) => (t.id === open.id ? { ...t, coverPath, coverUrl } : t)),
          )
        }
        onDelete={() => removeTheme(open)}
      />
    );
  }

  // O campo de procura só aparece quando há lista que chegue para justificar
  // um controlo a mais — com três temas, procurar é mais trabalho do que ler.
  const searchable = themes.length > 4;

  return (
    <div>
      {blocked && (
        <Card padding="sm" className="mb-6 border-[#8a6d2f]/30 bg-[#f6efe1]/60">
          <p className="bo-eyebrow mb-1.5 text-[#8a6d2f]">Falta um passo de instalação</p>
          <p className="text-sm leading-relaxed text-foreground/75">{blocked}</p>
        </Card>
      )}

      <Toolbar
        className="mb-6"
        start={
          searchable ? (
            <div className="relative w-full max-w-md sm:w-72">
              {SearchIcon}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar tema…"
                aria-label="Procurar tema por nome ou nota"
                className="bo-input py-2.5 pl-10 pr-3 text-sm text-foreground/80 placeholder-foreground/30"
              />
            </div>
          ) : (
            <p className="bo-text-muted max-w-xl text-sm leading-relaxed">
              Guarde aqui as fotos por tema. Depois, no estúdio de propostas, é só escolher o tema e
              as fotos entram no mood board.
            </p>
          )
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
              disabled={saving}
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
            // Com o formulário já aberto, este botão seria um segundo "Criar
            // tema" no mesmo ecrã — a apontar para o campo que está mesmo ali.
            action={adding ? undefined : { label: "Criar tema", onClick: () => setAdding(true) }}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card padding="sm">
          <p className="bo-text-muted text-sm">
            Nenhum tema com “{search.trim()}” no nome ou na nota.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((t) => (
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
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover motion-safe:transition-transform group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground/40">
                    {FolderIcon}
                  </div>
                )}
              </div>
              <div className="px-4 py-3">
                <p className="font-display text-[15px] text-foreground/85">{t.name}</p>
                <p className="bo-text-muted mt-0.5 text-xs">
                  {photoCountLabel(t.imageCount, t.truncated)}
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

/** O que a pasta sabe e o cartão do tema precisa de saber. */
interface FolderState {
  total: number | null;
  truncated: boolean;
  /** `undefined` = não se sabe (deixar o cartão como está); `null` = pasta vazia. */
  coverUrl?: string | null;
}

/** Uma foto que não subiu, com o ficheiro guardado para se poder repetir. */
interface Failure {
  file: File;
  message: string;
}

/**
 * A miniatura de uma foto na grelha.
 *
 * Mostra `thumbUrl` e cai no original quando ela não existe — é o caso das
 * fotos carregadas ANTES de as miniaturas existirem, e continua a ser o caso
 * se a miniatura tiver desaparecido do bucket (são derivadas e dispensáveis;
 * o original é que é o ativo). O `onError` é a segunda rede: um URL assinado
 * para um objeto que já lá não está falha no browser, e sem isto ficava uma
 * célula partida numa grelha inteira que funciona.
 */
function Photo({ image, alt }: { image: ThemeImage; alt: string }) {
  const [src, setSrc] = useState(image.thumbUrl || image.url);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (src !== image.url) setSrc(image.url);
      }}
      className="h-full w-full object-cover"
    />
  );
}

/** A pasta de UM tema: renomear, carregar fotos, remover fotos, eliminar. */
function ThemeFolder({
  theme,
  onBack,
  onFolderState,
  onRename,
  onCover,
  onDelete,
}: {
  theme: ThemeSummary;
  onBack: () => void;
  onFolderState: (state: FolderState) => void;
  onRename: (name: string) => void;
  onCover: (coverPath: string, coverUrl?: string) => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  /** As fotos JÁ CARREGADAS, mais recentes primeiro. É sempre um PREFIXO da
   *  lista do servidor — ver `nextOffset` abaixo. */
  const [images, setImages] = useState<ThemeImage[]>([]);
  /** Total na pasta segundo o servidor; `null` = ainda não se sabe. */
  const [total, setTotal] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** A última página veio cheia → é provável que haja mais. */
  const [pageFull, setPageFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Lotes a decorrer — não um booleano: com dois lotes ao mesmo tempo, o
   *  primeiro a acabar desligava o indicador do outro. */
  const [uploadingCount, setUploadingCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<Failure[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [coverPath, setCoverPath] = useState<string | undefined>(theme.coverPath);
  const [name, setName] = useState(theme.name);
  const [renaming, setRenaming] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Um PATCH de cada vez: confirmar o nome com o Enter dispara também o onBlur. */
  const renamingBusy = useRef(false);
  /** Passa a falso ao sair da pasta — um lote que só termine depois disso não
   *  pode voltar a escrever no estado deste ecrã. */
  const alive = useRef(true);
  /** Profundidade do arrasto: entrar numa foto dispara `dragleave` no
   *  contentor, e a moldura piscava a cada célula por baixo do ponteiro. */
  const dragDepth = useRef(0);
  /** Âncora do Shift+clique (índice na grelha à vista). */
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // `onFolderState` é recriada a cada render do pai; guardá-la numa ref deixa
  // o efeito de notificação depender só do que a pasta sabe.
  const notify = useRef(onFolderState);
  useEffect(() => {
    notify.current = onFolderState;
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/temas/${theme.id}/imagens?offset=0&limit=${THEME_PAGE_SIZE}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("falhou");
        const data = await res.json();
        if (!active) return;
        const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
        setImages(page);
        // `ok: false` é uma pasta que NÃO pôde ser lida — o servidor manda
        // `total: 0` porque não tem outro número para dar. Aceitá-lo como zero
        // faria a grelha dizer "arraste aqui as fotos" a um tema que pode ter
        // 3000 — e ela a carregá-las outra vez. `null` = não sabemos.
        setTotal(
          data?.ok === false ? null : typeof data?.total === "number" ? data.total : page.length,
        );
        setTruncated(Boolean(data?.truncated));
        setPageFull(page.length >= THEME_PAGE_SIZE);
      } catch {
        // Sem lista não se avisa o pai: o cartão guarda a contagem que veio do
        // servidor (que pode ser "Fotos indisponíveis") em vez de dizer "0".
        if (active) toast("Não foi possível carregar as fotos do tema.", "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [theme.id, toast]);

  /**
   * O offset da página seguinte é, sempre, quantas fotos já temos.
   *
   * Parece frágil e é o contrário: `images` é mantido como um PREFIXO exato da
   * lista do servidor (mais recentes primeiro). Uma foto nova entra à cabeça
   * das duas listas; uma foto removida sai das duas. Logo, o que o servidor
   * tem a seguir ao que já mostramos está exatamente em `offset =
   * images.length` — mesmo que subam 40 fotos entre uma página e a seguinte,
   * que é o caso em que uma contagem de páginas fixa saltava fotos. O
   * `mergePage` por `path` é a rede por baixo disto.
   */
  const nextOffset = images.length;
  const remaining = total === null ? null : Math.max(0, total - images.length);
  const hasMore = pageFull || (remaining !== null && remaining > 0);

  /** UM único sítio a avisar o pai (contagem + capa do cartão). Avisar também
   *  dentro do upload e da remoção punha o cartão a par de uma lista já
   *  ultrapassada — a contagem ficava a divergir da grelha. */
  const cover = coverPath ? images.find((i) => i.path === coverPath) : images[0];
  const coverUrl = cover?.thumbUrl || cover?.url;
  useEffect(() => {
    if (loading || total === null) return;
    notify.current({
      total,
      truncated,
      // Uma capa escolhida que ainda não foi carregada (está numa página
      // adiante) não se sabe resolver: melhor não mexer no cartão do que
      // trocar-lhe a capa pela foto mais recente.
      coverUrl: coverPath && !cover ? undefined : (coverUrl ?? null),
    });
  }, [loading, total, truncated, coverPath, cover, coverUrl]);

  // Enquanto sobem fotos, fechar o separador perde o que falta. O browser
  // mostra o seu próprio aviso — é o único que ele deixa aparecer aqui.
  useEffect(() => {
    if (uploadingCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadingCount]);

  /**
   * Carrega um lote de fotos com até `UPLOAD_CONCURRENCY` em voo.
   *
   * Um ficheiro por pedido: o limite de corpo do alojamento (~4,5 MB) rebenta
   * com um lote inteiro de fotos de telemóvel. Cada pedido leva o original
   * preparado E a sua miniatura (`thumbs`, na mesma ordem) — como vai um só
   * ficheiro de cada vez, "a mesma ordem" é trivialmente respeitada, e uma foto
   * que não gere miniatura simplesmente não acrescenta nada ao campo.
   *
   * Nada aqui deita fora o lote: cada falha é apanhada, guardada COM o
   * ficheiro (para se poder repetir sem voltar a escolher nada) e o lote
   * continua.
   */
  async function upload(files: File[]) {
    if (files.length === 0) return;
    setUploadingCount((n) => n + 1);
    // Os totais somam-se: dois lotes a decorrer mostram um só "47 de 312".
    setProgress((p) => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + files.length }));
    let added = 0;
    const errors: Failure[] = [];
    try {
      await pool(
        files,
        UPLOAD_CONCURRENCY,
        async (f) => {
          try {
            // Preset "cover" e não "board": uma foto da biblioteca tem DOIS
            // destinos possíveis — uma célula de mood board ou uma imagem de
            // CAPA, impressa em grande. Guardá-la com 1600 px degradava-a para
            // sempre (o original nunca mais existe). A miniatura sai da MESMA
            // descodificação, para um lote de 300 fotos não custar o dobro.
            const { file, thumb } = await prepareImageWithThumb(f, "cover");
            const form = new FormData();
            form.append("files", file);
            if (thumb) form.append("thumbs", thumb);
            const res = await fetch(`/api/temas/${theme.id}/imagens`, {
              method: "POST",
              body: form,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `Falha ao carregar "${f.name}".`);
            const im: ThemeImage | undefined = data?.images?.[0];
            if (!im?.path) throw new Error(`Falha ao carregar "${f.name}".`);
            if (!alive.current) return;
            // Cada foto entra na grelha assim que chega. Juntar o lote todo e no
            // fim fazer `[...lote, ...images]` lia um `images` velho: dois lotes
            // em paralelo perdiam fotos e uma foto removida entretanto voltava.
            setImages((prev) => (prev.some((x) => x.path === im.path) ? prev : [im, ...prev]));
            setTotal((t) => (t === null ? null : t + 1));
            added += 1;
          } catch (e) {
            errors.push({
              file: f,
              message: e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`,
            });
          } finally {
            if (alive.current) setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          }
        },
        () => !alive.current,
      );
      if (!alive.current) return;
      if (errors.length > 0) {
        setFailed((prev) => [...prev, ...errors]);
        toast(
          errors.length === files.length
            ? `Nenhuma foto subiu. ${errors[0].message}`
            : `${added} de ${files.length} carregadas — ${plural(errors.length, "falhou", "falharam")}.`,
          "error",
        );
      } else {
        toast(
          `${plural(added, "foto adicionada", "fotos adicionadas")} a "${theme.name}".`,
          "success",
        );
      }
    } finally {
      if (alive.current) {
        setUploadingCount((n) => Math.max(0, n - 1));
        // Só o último lote apaga o contador: `done === total` só acontece
        // quando já não falta nenhum ficheiro de nenhum dos lotes.
        setProgress((p) => (p && p.done >= p.total ? null : p));
      }
    }
  }

  /** Repete as que falharam. Os ficheiros ficaram guardados — não é preciso
   *  voltar a abrir a pasta no computador nem lembrar-se de quais foram. */
  function retryFailed() {
    const again = failed.map((f) => f.file);
    if (again.length === 0) return;
    setFailed([]);
    upload(again);
  }

  function pick(list: FileList | File[] | null) {
    if (!list) return;
    const all = Array.from(list);
    const files = all.filter(isImageFile);
    const skipped = all.length - files.length;
    if (files.length === 0) {
      if (skipped > 0) toast("Nenhum dos ficheiros é uma imagem.", "error");
      return;
    }
    if (skipped > 0) {
      toast(
        `${plural(skipped, "ficheiro ignorado", "ficheiros ignorados")} — não são imagens.`,
        "info",
      );
    }
    upload(files);
  }

  /** O drop já com as `entries` lidas de forma síncrona pelo handler. */
  async function handleDrop(entries: FileSystemEntry[], files: File[]) {
    // Sem pastas pelo meio, `dataTransfer.files` já traz tudo — e traz mais
    // depressa do que percorrer a árvore entrada a entrada.
    if (entries.length === 0 || !entries.some((e) => e.isDirectory)) {
      pick(files);
      return;
    }
    toast("A ler a pasta…", "info");
    const { files: found, capped } = await expandDropEntries(entries);
    if (!alive.current) return;
    if (capped) {
      toast(
        `Foram lidas as primeiras ${MAX_DROP_FILES} fotos da pasta. Carregue as restantes num segundo arrasto.`,
        "info",
      );
    }
    pick(found);
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/temas/${theme.id}/imagens?offset=${nextOffset}&limit=${THEME_PAGE_SIZE}`,
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

  function toggleAt(index: number, extend: boolean) {
    // A âncora é lida AGORA e só depois movida: o React corre o `setSelected`
    // preguiçosamente, já na renderização, e lá dentro `anchor.current` já
    // valeria `index` — o Shift+clique passava a ser um clique normal.
    const from = anchor.current;
    anchor.current = index;
    setSelected((prev) => {
      const next = new Set(prev);
      if (extend && from !== null && from !== index) {
        // Shift+clique estende a partir da última foto tocada, e o sentido
        // (marcar ou desmarcar) é o que a foto clicada vai passar a ser — é o
        // que qualquer gestor de ficheiros faz.
        const target = images[index];
        const turnOn = target ? !prev.has(target.path) : true;
        for (let i = Math.min(from, index); i <= Math.max(from, index); i++) {
          const p = images[i]?.path;
          if (!p) continue;
          if (turnOn) next.add(p);
          else next.delete(p);
        }
      } else {
        const p = images[index]?.path;
        if (p) {
          if (next.has(p)) next.delete(p);
          else next.add(p);
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    anchor.current = null;
  }

  /** Remove um conjunto de fotos. Uma só confirmação para o conjunto todo, e
   *  as que o servidor recusar voltam ao sítio onde estavam. */
  async function removeImages(targets: ThemeImage[]) {
    if (targets.length === 0) return;
    const positions = new Map(images.map((im, i) => [im.path, i]));
    const gone = new Set(targets.map((t) => t.path));
    setImages((prev) => prev.filter((i) => !gone.has(i.path)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of gone) next.delete(p);
      return next;
    });
    anchor.current = null;
    setTotal((t) => (t === null ? null : Math.max(0, t - targets.length)));

    const errors: ThemeImage[] = [];
    await pool(targets, DELETE_CONCURRENCY, async (im) => {
      try {
        const res = await fetch(
          `/api/temas/${theme.id}/imagens?path=${encodeURIComponent(im.path)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("falhou");
      } catch {
        errors.push(im);
      }
    });
    if (!alive.current) return;
    if (errors.length > 0) {
      // Repor SÓ as fotos cuja remoção falhou, no sítio onde estavam. Repor a
      // lista inteira deitava fora as que um lote a decorrer tivesse
      // entretanto acrescentado.
      setImages((prev) => reinsertAt(prev, errors, positions));
      setTotal((t) => (t === null ? null : t + errors.length));
      toast(
        targets.length === 1
          ? "Não foi possível remover a foto."
          : `Não foi possível remover ${plural(errors.length, "foto", "fotos")}.`,
        "error",
      );
    } else if (targets.length > 1) {
      toast(`${plural(targets.length, "foto removida", "fotos removidas")}.`, "success");
    }
  }

  async function removeOne(im: ThemeImage) {
    if (!window.confirm("Remover esta foto do tema? Esta ação não pode ser anulada.")) return;
    await removeImages([im]);
  }

  async function removeSelected() {
    const targets = images.filter((i) => selected.has(i.path));
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Remover ${plural(targets.length, "foto", "fotos")} de "${theme.name}"? ` +
          "As propostas já feitas com estas fotos não são afetadas. Esta ação não pode ser anulada.",
      )
    )
      return;
    setBulkBusy(true);
    try {
      await removeImages(targets);
    } finally {
      if (alive.current) setBulkBusy(false);
    }
  }

  /** Escolhe a foto que representa o tema na lista. */
  async function setAsCover(im: ThemeImage) {
    try {
      const res = await fetch(`/api/temas/${theme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPath: im.path }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Não foi possível definir a capa.", "error");
        return;
      }
      setCoverPath(im.path);
      onCover(im.path, im.thumbUrl || im.url);
      clearSelection();
      toast("Capa do tema definida.", "success");
    } catch {
      toast("Erro de ligação ao definir a capa.", "error");
    }
  }

  async function rename() {
    // O Enter fecha o campo e o onBlur dispara logo a seguir: sem esta guarda
    // saíam dois PATCH iguais para o servidor.
    if (renamingBusy.current) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === theme.name) {
      setName(theme.name);
      setRenaming(false);
      return;
    }
    renamingBusy.current = true;
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
      renamingBusy.current = false;
      setRenaming(false);
    }
  }

  /** Sair com um lote a meio abandona o que falta — é preciso dizê-lo. */
  function leave() {
    if (
      uploadingCount > 0 &&
      !window.confirm(
        "Ainda há fotos a subir. Se sair agora, as que faltam não são carregadas. Sair mesmo assim?",
      )
    )
      return;
    onBack();
  }

  // Uma leitura bem sucedida põe SEMPRE um número em `total` (nem que seja o
  // tamanho da página que veio), por isso `null` aqui só pode querer dizer uma
  // coisa: a pasta não pôde ser lida. Escrever "0 fotos" nesse caso leria-se
  // como "as minhas fotos desapareceram".
  const unreadable = !loading && total === null;
  const countLine = unreadable
    ? photoCountLabel(null)
    : images.length < (total ?? 0)
      ? `${images.length} de ${photoCountLabel(total, truncated)}`
      : photoCountLabel(total ?? 0, truncated);
  const selectedCount = selected.size;
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={leave}>
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
          <span className="bo-text-muted text-xs">{loading ? "A ler a pasta…" : countLine}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            iconLeft={PlusIcon}
            loading={uploadingCount > 0}
            onClick={() => inputRef.current?.click()}
          >
            Adicionar fotos
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

      {progress && (
        <Card padding="sm" className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-foreground/80">
              A carregar <strong className="font-medium">{progress.done}</strong> de{" "}
              {plural(progress.total, "foto", "fotos")}…
            </p>
            <span className="bo-text-muted text-xs">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso do carregamento"
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
          <p className="bo-text-muted mt-2 text-xs">
            Pode ir fazer outra coisa — enquanto este separador ficar aberto, as fotos continuam a
            subir e vão aparecendo aqui.
          </p>
        </Card>
      )}

      {failed.length > 0 && (
        <Card padding="sm" className="mb-4 border-[#8a2a22]/25 bg-[#f6e6df]/40">
          <p className="text-sm text-foreground/80">
            {plural(failed.length, "foto não subiu", "fotos não subiram")}. Os ficheiros ficaram
            guardados — não é preciso voltar a escolhê-los.
          </p>
          <p className="bo-text-muted mt-1 text-xs">{failed[0].message}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={retryFailed}>
              Tentar novamente
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFailed([])}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      {selectedCount > 0 && (
        <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[#4d6350]/25 bg-white/95 px-4 py-3 shadow-[0_1px_2px_rgba(42,38,32,0.04)] backdrop-blur">
          <p className="text-sm text-foreground/85">
            {plural(selectedCount, "foto selecionada", "fotos selecionadas")}
          </p>
          <span className="bo-text-muted hidden text-xs sm:inline">
            Shift + clique seleciona tudo o que está pelo meio.
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selectedCount === 1 && (
              <Button
                size="sm"
                variant="subtle"
                onClick={() => {
                  const one = images.find((i) => selected.has(i.path));
                  if (one) setAsCover(one);
                }}
              >
                Definir como capa
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={clearSelection}>
              Limpar seleção
            </Button>
            <Button size="sm" variant="danger" loading={bulkBusy} onClick={removeSelected}>
              Remover
            </Button>
          </div>
        </div>
      )}

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDrag(false);
          // As `entries` têm de sair do DataTransfer AGORA: ele é esvaziado
          // assim que este handler retorna, e o resto do trabalho é `async`.
          const entries = readDropEntries(e.dataTransfer);
          const files = Array.from(e.dataTransfer?.files ?? []);
          void handleDrop(entries, files);
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
        ) : unreadable ? (
          // Falha de leitura NÃO é "tema sem fotos": dizer-lhe para arrastar
          // fotos aqui seria convidá-la a duplicar o que já lá está.
          <div className="py-12 text-center">
            <p className="text-sm text-foreground/75">
              Não foi possível ler a pasta deste tema agora.
            </p>
            <p className="bo-text-muted mt-1 text-xs">
              É uma falha temporária — as fotos não desapareceram. Recarregue a página daqui a
              pouco.
            </p>
          </div>
        ) : images.length === 0 ? (
          <div className="py-12 text-center">
            <p className="bo-text-muted text-sm">
              Arraste para aqui as fotos deste tema — ou uma pasta inteira —, ou use “Adicionar
              fotos”.
            </p>
            <p className="bo-text-muted mt-1 text-xs">JPG, PNG ou WEBP · também HEIC do iPhone</p>
          </div>
        ) : (
          <>
            <div className="grid select-none grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {images.map((im, i) => {
                const isSelected = selected.has(im.path);
                const isCover = im.path === coverPath;
                return (
                  <div
                    key={im.path}
                    className={`group relative aspect-square overflow-hidden rounded-lg border bg-foreground/[0.04] ${
                      isSelected
                        ? "border-[#4d6350] ring-2 ring-[#4d6350]/40"
                        : "border-foreground/[0.1]"
                    }`}
                  >
                    {/* A célula já tem `aspect-square`, por isso adiar a foto
                        não salta nada. E o que se mostra é a MINIATURA: com o
                        original, uma página de 60 fotos puxava ~180 MB. */}
                    <Photo image={im} alt="" />
                    {/* A célula inteira é o alvo da seleção — um alvo pequeno
                        numa grelha de 60 fotos seria um exercício de pontaria. */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Selecionar foto ${i + 1} de ${images.length}`}
                      onClick={(e) => toggleAt(i, e.shiftKey)}
                      className="absolute inset-0 h-full w-full"
                    >
                      <span
                        aria-hidden
                        className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] leading-none motion-safe:transition-opacity ${
                          isSelected
                            ? "border-[#4d6350] bg-[#4d6350] text-white opacity-100"
                            : "border-white/70 bg-black/35 text-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                    {isCover && (
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-white">
                        Capa
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeOne(im)}
                      aria-label={`Remover foto ${i + 1} de ${images.length}`}
                      // Num ecrã tátil não há "passar o rato": aí o × está sempre
                      // visível, senão a foto não se conseguia remover de todo.
                      className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-sm leading-none text-white opacity-0 motion-safe:transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      ×
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
                  As mais recentes aparecem primeiro. A grelha mostra {THEME_PAGE_SIZE} de cada vez
                  para o tema abrir depressa.
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
    </div>
  );
}
