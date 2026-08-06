"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import PhotoLightbox from "./PhotoLightbox";
import ThemeCopyDialog, { type ThemeCopyOutcome } from "./ThemeCopyDialog";
import { downloadMany, downloadName, downloadOne } from "./photo-download";
import {
  CHECK_CHUNK,
  MAX_PHOTO_ORDER,
  MAX_THEME_NAME,
  MAX_THEME_NOTES,
  THEME_PAGE_SIZE,
  normalizedThemeName,
  type SkipReason,
  type ThemeDuplicate,
} from "@/lib/theme-types";
import { fingerprintBlob } from "@/lib/theme-fingerprint";
import { useToast } from "./Toast";
import { prepareImageWithThumb } from "./image-prep";
import { Button, Card, EmptyState, Field, Toolbar } from "./ui";
import { esquecerBiblioteca } from "./theme-picker-cache";
import BibliotecaRevisao from "./BibliotecaRevisao";

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

/**
 * Quantos ficheiros são lidos ao mesmo tempo para lhes calcular a impressão
 * digital.
 *
 * O `crypto.subtle.digest` não bloqueia o fio principal (o browser resolve-o
 * fora dele) e é barato ao lado do resto — MEDIDO em Chromium nesta caixa:
 * 42,9 ms numa foto de 8,1 MB (181 MB/s), contra 337 ms para PREPARAR a mesma
 * foto. O que aqui se limita não é o CPU, é a MEMÓRIA: cada ficheiro tem de
 * estar inteiro em `ArrayBuffer` para ser resumido, e um arrasto de 300 fotos
 * de 8 MB lidas de uma vez seriam 2,4 GB. Quatro em voo são ~32 MB de pico — o
 * mesmo teto de quatro que os carregamentos já usam, pela mesma razão.
 */
const FINGERPRINT_CONCURRENCY = 4;

/** Quantas fotos saltadas mostram miniatura no relatório. As restantes
 *  aparecem só pelo nome: desenhar 150 pré-visualizações de fotos que NÃO
 *  foram adicionadas custaria mais do que a informação vale. */
const SKIPPED_PREVIEWS = 12;

/**
 * QUANTOS ORIGINAIS A GRELHA DESCARREGA AO MESMO TEMPO — o número que decide
 * se a primeira foto aparece a 1 segundo ou aos 26.
 *
 * Isto só se aplica às fotos SEM miniatura (a biblioteca anterior às
 * miniaturas). Uma célula dessas puxa o original: ~2,6 MB para desenhar 150 px.
 *
 * Medido em Chromium, HTTP/2 (é o que o Storage fala), 60 fotos, 50 Mbit/s
 * partilhados, TTFB de 60 ms — mediana de 2 corridas:
 *
 *   como estava (60 pedidos ao mesmo tempo) → 1ª foto aos 26 351 ms
 *   tecto de 6 em voo                       → 1ª foto aos  2 634 ms
 *   tecto de 3 em voo                       → 1ª foto aos  1 405 ms
 *   tecto de 2 em voo                       → 1ª foto aos    928 ms
 *
 * A última foto chega ao mesmo tempo em todos (~26 s): o canal está cheio de
 * qualquer maneira. O que muda é a ORDEM — sem tecto, os 60 downloads
 * repartem o canal e acabam todos no fim, ou seja, a foto que está no ecrã
 * espera pelas 59 que não estão.
 *
 * Três e não dois: a mesma medição a 300 Mbit/s (fibra) mostra que um tecto de
 * 2 deixa de encher o canal — a última foto passa de 5316 ms (como estava)
 * para 5389 ms, enquanto com 3 fica em 4936 ms. Com 3, a primeira foto aparece
 * aos 297 ms a 300 Mbit/s e aos 1405 ms a 50 Mbit/s, e a última NUNCA chega
 * depois do que chegava.
 *
 * As fotos COM miniatura não passam por aqui: são ~25 KB e medir mostrou que
 * pôr-lhes um tecto PIORA (60 × 25 KB em ondas de 6 = 1019 ms contra 350 ms
 * sem tecto). O que é caro é o byte, não o pedido.
 */
const HEAVY_IMAGE_CONCURRENCY = 3;

/** Quantas células entram na primeira dobra — carregam já, e com prioridade.
 *  Doze cobre duas linhas em ecrã largo (a grelha faz 6 colunas). */
const ABOVE_FOLD = 12;

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
/** Por que ordem os temas aparecem. */
export type Ordem = "alfabetica" | "recentes" | "fotos";

export const ORDENS: readonly { valor: Ordem; rotulo: string }[] = [
  { valor: "alfabetica", rotulo: "A–Z" },
  { valor: "recentes", rotulo: "Recentes" },
  { valor: "fotos", rotulo: "Com mais fotos" },
];

const ORDEM_KEY = "liquen-temas-ordem";

export function lerOrdem(): Ordem | null {
  try {
    const v = window.localStorage.getItem(ORDEM_KEY);
    return ORDENS.some((o) => o.valor === v) ? (v as Ordem) : null;
  } catch {
    return null;
  }
}

export function guardarOrdem(o: Ordem): void {
  try {
    window.localStorage.setItem(ORDEM_KEY, o);
  } catch {
    // Ver `guardarDensidade`.
  }
}

/**
 * Ordena os temas — puro, para se poder testar sem desenhar nada.
 *
 * OS FAVORITOS VÊM SEMPRE À FRENTE, seja qual for a ordem escolhida. É o que
 * fixar significa: um tema que se usa em quase todas as propostas não pode
 * andar a mudar de sítio porque se ordenou por data. Dentro de cada grupo é
 * que a ordem escolhida manda.
 *
 * Uma pasta ilegível (`imageCount: null`) fica no fim de "com mais fotos", em
 * vez de valer zero e passar à frente de um tema com uma foto — não sabemos
 * quantas tem, e adivinhar para baixo seria esconder o tema.
 */
export function ordenarTemas(temas: readonly ThemeSummary[], ordem: Ordem): ThemeSummary[] {
  const porOrdem = (a: ThemeSummary, b: ThemeSummary): number => {
    if (ordem === "recentes") return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    if (ordem === "fotos") {
      const na = a.imageCount ?? -1;
      const nb = b.imageCount ?? -1;
      if (na !== nb) return nb - na;
    }
    return a.name.localeCompare(b.name, "pt");
  };
  return [...temas].sort((a, b) => Number(!!b.favorito) - Number(!!a.favorito) || porOrdem(a, b));
}

/** Quão apertada é a grelha de temas. */
export type Densidade = "confortavel" | "compacto";

const DENSIDADE_KEY = "liquen-temas-densidade";

/** Lê a preferência guardada. Nunca lança — um `localStorage` indisponível
 *  (janela privada, política do browser) vale como "não há preferência". */
export function lerDensidade(): Densidade | null {
  try {
    const v = window.localStorage.getItem(DENSIDADE_KEY);
    return v === "confortavel" || v === "compacto" ? v : null;
  } catch {
    return null;
  }
}

export function guardarDensidade(d: Densidade): void {
  try {
    window.localStorage.setItem(DENSIDADE_KEY, d);
  } catch {
    // Perder a preferência é um incómodo; deitar o ecrã abaixo por causa dela
    // não tem desculpa nenhuma.
  }
}

/**
 * As colunas de cada densidade.
 *
 * DUAS no telemóvel nas duas: uma coluna com cartões enormes obrigava a
 * percorrer a biblioteca inteira de baixo para cima.
 *
 * "Compacto" chega a seis colunas porque é exactamente o número de temas de
 * hoje — o pedido era vê-los todos de uma vez, sem scroll.
 */
export const COLUNAS: Record<Densidade, string> = {
  confortavel: "grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4",
  compacto: "grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6",
};

/**
 * "há 3 dias", "hoje" — a data como se fala, para o cartão poder dizer o que
 * está vivo e o que está parado sem gastar uma linha inteira com um formato
 * completo. Datas futuras (relógios trocados) contam como hoje, em vez de
 * dizerem "há -2 dias".
 */
export function desdeQuando(iso: string | undefined, agora = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const dias = Math.floor((agora - t) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}

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

/**
 * Move um item de `from` para `to` (puro — testado).
 *
 * É a operação por trás do arrasto e das setas: tirar a foto de onde está e
 * enfiá-la onde deve ficar, sem perder nem duplicar nada. Índices fora da
 * lista devolvem-na intacta.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
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
  // Sair da Biblioteca esquece o que o SELETOR de temas tinha guardado.
  //
  // Este ecrã é o único sítio onde a biblioteca muda — carregar, apagar,
  // reordenar, gerar miniaturas. Em vez de pendurar uma invalidação em cada um
  // desses nove sítios (e no décimo que alguém acrescenta daqui a um mês sem
  // saber que isto existe), esquece-se UMA vez, à saída. Não há como falhar:
  // se ela mexeu em alguma coisa, mexeu aqui, e passou por esta linha.
  //
  // A cache tem revalidação própria e portanto isto não é o que a mantém
  // correcta — é o que faz o que ela acabou de carregar aparecer JÁ na
  // proposta seguinte, em vez de daqui a meio minuto.
  useEffect(() => esquecerBiblioteca, []);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Guardada entre sessões: quem trabalha com a biblioteca todos os dias escolhe
  // uma vez e não quer voltar a escolher. Começa em "compacto" porque com seis
  // temas é o que os põe todos no ecrã sem scroll — que é o pedido de origem.
  const [densidade, setDensidade] = useState<Densidade>("compacto");
  const [ordem, setOrdem] = useState<Ordem>("alfabetica");
  const [verArquivados, setVerArquivados] = useState(false);
  const [revendo, setRevendo] = useState(false);
  // Lidas depois do primeiro desenho, e não durante: o servidor não tem
  // `localStorage`, e ler ali daria um HTML diferente do que o browser desenha.
  useEffect(() => {
    const d = lerDensidade();
    if (d) setDensidade(d);
    const o = lerOrdem();
    if (o) setOrdem(o);
  }, []);

  /** Fixar/desafixar e arquivar/desarquivar. Guarda-se PRIMEIRO no ecrã e
   *  desfaz-se se o servidor recusar: é uma preferência de arrumação, e esperar
   *  por uma ida à rede para ver uma estrela acender não serve ninguém. */
  const alternarMarca = useCallback(
    async (t: ThemeSummary, campo: "favorito" | "arquivado") => {
      const novo = !t[campo];
      setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, [campo]: novo } : x)));
      try {
        const res = await fetch(`/api/temas/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [campo]: novo }),
        });
        if (!res.ok) throw new Error(String(res.status));
        if (campo === "arquivado") {
          toast(novo ? `"${t.name}" arquivado` : `"${t.name}" de volta à lista`, "success");
        }
      } catch {
        setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, [campo]: !novo } : x)));
        toast("Não foi possível guardar. Verifique a ligação.", "error");
      }
    },
    [toast],
  );
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

  /** Quantos temas estão arquivados — o que autoriza (ou não) mostrar o
   *  interruptor do arquivo. Sem nada lá dentro, seria um controlo a explicar
   *  uma funcionalidade que ninguém ainda usou. */
  const arquivados = useMemo(() => themes.filter((t) => t.arquivado).length, [themes]);

  const visible = useMemo(() => {
    const needle = normalizedThemeName(deferredSearch);
    // O arquivo é uma VISTA, não um filtro que se soma: ou se está a ver o que
    // se usa, ou se está a ver o que se pôs de lado. Misturar os dois era
    // devolver ao ecrã exactamente o que arquivar veio tirar de lá.
    const base = themes.filter((t) => (verArquivados ? t.arquivado : !t.arquivado));
    const filtrados = needle
      ? // Procurar por nome E por nota: a nota ("tons quentes, para espaços de
        // pedra") é muitas vezes como a Catarina se lembra do tema.
        base.filter((t) => normalizedThemeName(`${t.name} ${t.notes ?? ""}`).includes(needle))
      : base;
    return ordenarTemas(filtrados, ordem);
  }, [themes, deferredSearch, ordem, verArquivados]);

  // A revisão em lote trabalha sobre a biblioteca TODA, não sobre um tema — é
  // um ecrã irmão da lista, não um separador dentro dela.
  if (revendo) return <BibliotecaRevisao onBack={() => setRevendo(false)} />;

  if (open) {
    return (
      <ThemeFolder
        key={open.id}
        theme={open}
        // A pasta precisa da lista toda para poder oferecer "Copiar para…" — e
        // o cartão do destino tem de somar as fotos que lá chegaram, senão a
        // contagem só se corrige no próximo carregamento da página.
        themes={themes}
        onCopiedTo={(destId, added) =>
          setThemes((prev) =>
            prev.map((t) =>
              t.id === destId && t.imageCount !== null
                ? { ...t, imageCount: t.imageCount + added }
                : t,
            ),
          )
        }
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
          <div className="flex items-center gap-2">
            {themes.length > 2 && (
              <label className="flex items-center gap-1.5">
                <span className="sr-only">Ordenar os temas</span>
                <select
                  value={ordem}
                  onChange={(e) => {
                    const o = e.target.value as Ordem;
                    setOrdem(o);
                    guardarOrdem(o);
                  }}
                  className="bo-input w-auto py-2 pl-3 pr-8 text-xs text-foreground/70"
                >
                  {ORDENS.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button variant="secondary" size="sm" onClick={() => setRevendo(true)}>
              Rever etiquetas
            </Button>
            {/* Só aparece quando há mesmo alguma coisa arquivada — senão seria
                um interruptor a explicar uma funcionalidade que ninguém usou. */}
            {arquivados > 0 && (
              <button
                type="button"
                aria-pressed={verArquivados}
                onClick={() => setVerArquivados((v) => !v)}
                className={`alvo-toque rounded-lg border px-3 py-2 text-[10px] uppercase tracking-[0.12em] transition-colors ${
                  verArquivados
                    ? "border-foreground/20 bg-foreground/[0.06] text-foreground/70"
                    : "border-foreground/[0.1] text-foreground/40 hover:text-foreground/60"
                }`}
              >
                Arquivados ({arquivados})
              </button>
            )}
            {themes.length > 2 && (
              <div
                role="group"
                aria-label="Tamanho dos cartões"
                className="flex overflow-hidden rounded-lg border border-foreground/[0.1]"
              >
                {(
                  [
                    ["compacto", "Compacto"],
                    ["confortavel", "Confortável"],
                  ] as const
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={densidade === valor}
                    onClick={() => {
                      setDensidade(valor);
                      guardarDensidade(valor);
                    }}
                    className={`alvo-toque px-3 py-2 text-[10px] uppercase tracking-[0.12em] transition-colors ${
                      densidade === valor
                        ? "bg-foreground/[0.06] text-foreground/70"
                        : "text-foreground/40 hover:text-foreground/60"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            )}
            <Button
              variant={adding ? "secondary" : "primary"}
              size="sm"
              iconLeft={adding ? undefined : PlusIcon}
              onClick={() => setAdding(!adding)}
            >
              {adding ? "Cancelar" : "Novo tema"}
            </Button>
          </div>
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
        <div className={`grid ${COLUNAS[densidade]}`}>
          {Array.from({ length: 6 }).map((_, i) => (
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
          {/* Sem procura escrita, dizer "nenhum tema com '' no nome" seria uma
              frase sem sentido — o que está a acontecer é que todos os temas
              foram arquivados. */}
          <p className="bo-text-muted text-sm">
            {search.trim()
              ? `Nenhum tema com “${search.trim()}” no nome ou na nota.`
              : verArquivados
                ? "Não há temas arquivados."
                : "Todos os temas estão arquivados. Abra “Arquivados” para os repor."}
          </p>
        </Card>
      ) : (
        <div className={`grid ${COLUNAS[densidade]}`}>
          {visible.map((t) => (
            /* As acções são IRMÃS do botão do cartão, não filhas: um botão
               dentro de outro botão é HTML inválido, e o resultado prático é
               que fixar um tema abria-o a seguir. */
            <div key={t.id} role="group" aria-label={t.name} className="group relative">
              <div className="absolute right-2 top-2 z-10 flex gap-1">
                <button
                  type="button"
                  /* Sem o nome do tema no rótulo: o cartão está dentro de um
                     grupo com esse nome, portanto quem usa leitor de ecrã já o
                     ouviu — e repeti-lo aqui faria "Terracotta" identificar
                     três botões diferentes no mesmo sítio. */
                  aria-label={t.favorito ? "Desafixar" : "Fixar no topo"}
                  aria-pressed={!!t.favorito}
                  title={t.favorito ? "Desafixar" : "Fixar no topo"}
                  onClick={() => alternarMarca(t, "favorito")}
                  /* Um favorito JÁ FIXADO vê-se sempre; os outros só aparecem
                     com o rato em cima — mas em ecrã táctil não há rato, e aí
                     estão sempre visíveis (`pointer-coarse`), senão a
                     funcionalidade não existia no telemóvel. */
                  className={`alvo-toque flex h-8 w-8 items-center justify-center rounded-lg bg-white/85 backdrop-blur-sm transition-opacity pointer-coarse:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 ${
                    t.favorito ? "opacity-100 text-[#8a6d2f]" : "opacity-0 text-foreground/45"
                  }`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill={t.favorito ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <path
                      d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8Z"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={t.arquivado ? "Repor na lista" : "Arquivar"}
                  title={t.arquivado ? "Repor na lista" : "Arquivar (não apaga nada)"}
                  onClick={() => alternarMarca(t, "arquivado")}
                  className="alvo-toque flex h-8 w-8 items-center justify-center rounded-lg bg-white/85 text-foreground/45 opacity-0 backdrop-blur-sm transition-opacity pointer-coarse:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    {t.arquivado ? (
                      <path d="M12 19V7m0 0-4 4m4-4 4 4M4 4h16" strokeLinecap="round" />
                    ) : (
                      <>
                        <path d="M4 8h16v11H4z" strokeLinejoin="round" />
                        <path d="M3 4h18v4H3zM10 12h4" strokeLinecap="round" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className="block w-full overflow-hidden rounded-2xl border border-foreground/[0.08] bg-white text-left shadow-[0_1px_2px_rgba(42,38,32,0.04)] motion-safe:transition-colors hover:border-[#4d6350]/40"
              >
                {/* A moldura é 4:3 SEMPRE, aconteça o que acontecer lá dentro: é
                  ela que mantém a primeira linha alinhada quando as fotos têm
                  proporções diferentes umas das outras. */}
                <div className="flex aspect-[4/3] w-full gap-px overflow-hidden bg-foreground/[0.04]">
                  {t.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.coverUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full min-w-0 flex-1 object-cover motion-safe:transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-foreground/40">
                      {FolderIcon}
                    </div>
                  )}
                  {/* Uma capa só diz o que é a foto de capa; três fotos dizem o que
                    é o TEMA. Só aparecem quando existem mesmo — um tema com uma
                    foto continua a ser uma imagem inteira, e não uma tira com
                    dois buracos. */}
                  {t.coverUrl && t.previewUrls && t.previewUrls.length > 0 && (
                    <div className="flex w-1/4 shrink-0 flex-col gap-px">
                      {t.previewUrls.slice(0, 3).map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={u}
                          src={u}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="min-h-0 w-full flex-1 object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="font-display truncate text-[14px] text-foreground/85">{t.name}</p>
                  <p className="bo-text-muted mt-0.5 truncate text-xs">
                    {photoCountLabel(t.imageCount, t.truncated)}
                    {/* Quando foi mexido pela última vez: é o que separa um tema
                      vivo de um que ficou para trás, e cabe onde já havia
                      espaço.
                      NÃO aparece quando a pasta não pôde ser lida — "Fotos
                      indisponíveis · há 2 meses" mistura um aviso com uma
                      informação de rotina, e é o aviso que tem de se ler. */}
                    {t.imageCount !== null && desdeQuando(t.updatedAt)
                      ? ` · ${desdeQuando(t.updatedAt)}`
                      : ""}
                  </p>
                  {t.notes ? (
                    <p className="bo-text-muted mt-0.5 truncate text-xs opacity-70">{t.notes}</p>
                  ) : null}
                </div>
              </button>
            </div>
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
 * Uma foto do arrasto que NÃO foi adicionada por já lá estar.
 *
 * Guarda o `File` em memória (como o `Failure` acima) para o "Adicionar mesmo
 * assim" não obrigar a voltar a escolher nada — e para a miniatura do
 * relatório sair de graça, do ficheiro que já está no computador dela.
 *
 * ISTO NÃO É UM ERRO e não pode aparecer a vermelho: é o comportamento que ela
 * pediu, a acontecer.
 */
interface Skipped {
  file: File;
  reason: SkipReason;
  /** O resumo, para o "Adicionar mesmo assim" não ter de o recalcular. */
  hash?: string;
}

/** O que a fase de verificação decidiu sobre um arrasto. */
interface Screening {
  /** As que devem mesmo subir, pela ordem em que ela as largou. */
  keep: File[];
  skipped: Skipped[];
  /** `ficheiro → resumo`, para viajar no formulário do carregamento. */
  hashOf: Map<File, string>;
  /** A pasta foi mesmo lida e percorrida até ao fim. `false` = não se pode
   *  anunciar poupança nenhuma (ver o painel de repetidas). */
  verified: boolean;
  /** O tema tem fotos sem impressão digital (a biblioteca anterior a isto). */
  legacy: boolean;
}

/**
 * Uma foto que ela largou e que ainda vai a caminho do servidor.
 *
 * Existe para uma coisa só: a foto aparecer na grelha NO MOMENTO em que ela a
 * larga, a partir do ficheiro que já está no computador — em vez de o ecrã
 * ficar com um espaço vazio durante os segundos que a subida demora.
 */
interface Pending {
  /** Chave local da célula (a foto ainda não tem caminho no servidor). */
  id: string;
  name: string;
  /** URL de objeto da foto local. `undefined` = ainda não há (ou o navegador
   *  não sabe fazer URLs de objeto) e a célula fica um retângulo à espera. */
  src?: string;
}

/** A página seguinte, pedida antes de ela a pedir. */
interface Ahead {
  /** O offset com que foi pedida: se a grelha entretanto mudou de tamanho
   *  (subiu ou saiu uma foto), esta página deixou de encaixar e deita-se fora. */
  offset: number;
  images: ThemeImage[];
  total: number | null;
  truncated: boolean;
  full: boolean;
}

/** O andamento da geração de miniaturas em falta. */
interface ThumbJob {
  running: boolean;
  /** Por onde vai a passagem pela pasta (é o que a torna retomável). */
  cursor: number;
  scanned: number;
  generated: number;
  failed: number;
  /** Fotos do tema, segundo o servidor. `null` = ainda não se sabe. */
  total: number | null;
  /** Acabou de percorrer a pasta toda. */
  complete: boolean;
}

/**
 * Quanto tempo se espera antes de ir buscar a página seguinte.
 *
 * A primeira página tem de chegar primeiro — pedir as duas ao mesmo tempo era
 * fazer exatamente o que este trabalho todo veio corrigir. Medido, uma página
 * de miniaturas fica no ecrã em ~350 ms; um segundo e meio é depois disso com
 * folga, e continua a ser muito antes de ela chegar ao fundo da grelha.
 */
const PREFETCH_DELAY_MS = 1500;

/** Quantas fotos do lote entram na grelha já com a imagem local à vista.
 *  Mostrar as 300 de uma vez obrigava o navegador a descodificar 300 fotos de
 *  12 MP para desenhar quadrados de 150 px; as restantes ganham a
 *  pré-visualização quando a sua miniatura é gerada (que é logo a seguir). */
const PREVIEW_EAGER = 12;

/** Teto de lotes de uma passagem de miniaturas (8 fotos por lote): trava um
 *  ciclo infinito se o servidor devolver sempre o mesmo cursor. */
const MAX_THUMB_BATCHES = 2000;

/** Lotes seguidos sem gerar nada (e com falhas) antes de desistir: a esta
 *  altura o problema é o Storage, não as fotos. */
const MAX_BAD_BATCHES = 3;

/** Quantas páginas já mostradas se voltam a pedir no fim da geração de
 *  miniaturas, para a grelha passar a mostrar as novas. */
const MAX_REFRESH_PAGES = 5;

/** Um URL de objeto para a foto local, ou `undefined` onde o navegador não
 *  saiba fazê-los (é o caso do jsdom, nos testes). */
function objectUrl(file: File): string | undefined {
  try {
    return typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : undefined;
  } catch {
    return undefined;
  }
}

function revokeUrl(url?: string) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* nada a fazer — o URL já não existe */
  }
}

/**
 * A FILA DOS ORIGINAIS.
 *
 * Uma célula que não tem miniatura puxa o original (~2,6 MB). Deixar o browser
 * pedir os 60 ao mesmo tempo — que é o que ele faz, e o `loading="lazy"` não
 * trava: medido, pediu os 60 na mesma — reparte o canal por todos e faz com
 * que TODOS acabem no fim. Esta fila deixa passar `HEAVY_IMAGE_CONCURRENCY` de
 * cada vez, pela ordem da grelha, que é a ordem por que ela olha.
 *
 * Vive fora do componente porque o canal também é um só: duas grelhas abertas
 * não têm o dobro da linha. É deliberadamente simples — sem estado partilhado
 * a manter, sem React: uma foto pede vez, e larga-a quando acaba (ou quando a
 * célula sai do ecrã).
 */
interface HeavySlot {
  start: () => void;
  started: boolean;
  released: boolean;
}
const heavyWaiting: HeavySlot[] = [];
let heavyLive = 0;

/** Se um download ficar pendurado (nem carrega nem falha), a vez volta ao fim
 *  deste tempo: uma foto encravada não pode fechar a grelha toda. */
const HEAVY_SLOT_TIMEOUT_MS = 30_000;

function pumpHeavy() {
  while (heavyLive < HEAVY_IMAGE_CONCURRENCY && heavyWaiting.length > 0) {
    const slot = heavyWaiting.shift();
    if (!slot || slot.released) continue;
    slot.started = true;
    heavyLive += 1;
    slot.start();
  }
}

/** Pede vez para descarregar um original. Devolve a função de largar a vez —
 *  serve para os dois casos (acabou / desistiu) e é idempotente. */
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

/**
 * A miniatura de uma foto na grelha.
 *
 * Mostra, por esta ordem: a foto LOCAL (quando acabou de ser carregada nesta
 * sessão — já está no computador dela, não se vai buscar nada), a miniatura, e
 * só depois o original. As fotos carregadas ANTES de as miniaturas existirem
 * não têm nenhuma, e é o original que aparece — é para essas que existe o
 * botão "Gerar miniaturas em falta".
 *
 * O `onError` é a segunda rede: um URL assinado para um objeto que já lá não
 * está falha no browser, e sem isto ficava uma célula partida numa grelha
 * inteira que funciona.
 */
function Photo({
  image,
  alt,
  priority,
  localSrc,
}: {
  image: ThemeImage;
  alt: string;
  /** Está na primeira dobra: não espera por nada. */
  priority?: boolean;
  /** URL de objeto da foto que está no disco dela (carregada agora). */
  localSrc?: string;
}) {
  /** A imagem BARATA desta célula: a cópia local ou a miniatura (~25 KB). */
  const light = localSrc || image.thumbUrl;
  /** A barata falhou — miniatura apagada do bucket, ou cópia local já
   *  libertada. Fica só o original, e esse entra na fila como qualquer outro. */
  const [lightBroken, setLightBroken] = useState(false);
  /** A fila deu a vez a esta célula. */
  const [turn, setTurn] = useState(false);
  /** A fotografia já chegou — é o que dispara o fade por cima do LQIP. */
  const [pintada, setPintada] = useState(false);
  /** Sem imagem barata, esta célula vai puxar ~2,6 MB: espera pela vez. */
  const heavy = !light || lightBroken;
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!heavy) return;
    let timer = 0;
    const free = queueHeavyImage(() => {
      setTurn(true);
      // Rede de segurança: um pedido que nunca termina não pode ficar com a
      // vez para sempre.
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
    // `image.url` entra nas dependências para uma foto reassinada voltar a
    // pedir vez em vez de ficar com um URL expirado.
  }, [heavy, image.url]);

  // Uma célula à espera de vez fica SEM `src` (e não com `src=""`, que é um
  // pedido à própria página). É a única forma de a fila valer alguma coisa: um
  // `src` posto é um download começado.
  const src = heavy ? (turn ? image.url : undefined) : light;

  const finished = () => {
    release.current?.();
    release.current = null;
  };

  return (
    /* O LQIP É O FUNDO DA CÉLULA — mesma regra do seletor de temas, e pela
       mesma razão: um `background-image` com um `data:` URI não é um pedido,
       não entra na fila de descarregamentos, e está pintado no instante em que
       este elemento existe.
       Aqui há uma diferença: a célula pode já ter `localSrc` — a miniatura que
       acabou de ser feita no browser, ainda em memória, de uma foto carregada
       há segundos. Essa aparece na hora e não precisa de placeholder nenhum. */
    <div
      className="h-full w-full bg-foreground/[0.04] bg-cover bg-center"
      style={image.lqip && !localSrc ? { backgroundImage: `url("${image.lqip}")` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        // As pesadas são geridas pela fila — pô-las também em `lazy` fazia uma
        // célula fora do ecrã ficar com a vez sem chegar a pedir nada.
        loading={heavy || priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onLoad={() => {
          finished();
          setPintada(true);
        }}
        onError={() => {
          finished();
          if (!heavy) setLightBroken(true);
        }}
        className={`h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-200 ${
          pintada || localSrc || !image.lqip ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/**
 * A miniatura de uma foto SALTADA, desenhada do ficheiro que está no
 * computador dela.
 *
 * Custo zero de rede: o `File` já está em memória (é o mesmo que o "Adicionar
 * mesmo assim" vai usar). O URL de objeto é criado uma vez e registado para
 * ser libertado à saída da pasta, como todos os outros deste ecrã.
 */
function SkippedThumb({ file, track }: { file: File; track: (file: File) => string | undefined }) {
  const [src] = useState(() => track(file));
  if (!src) return <div className="bo-skeleton h-full w-full" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" decoding="async" className="h-full w-full object-cover" />;
}

/** A pasta de UM tema: renomear, carregar fotos, remover fotos, eliminar. */
function ThemeFolder({
  theme,
  themes,
  onBack,
  onFolderState,
  onRename,
  onCover,
  onCopiedTo,
  onDelete,
}: {
  theme: ThemeSummary;
  /** Todos os temas — para o "Copiar para…" saber para onde pode levar. */
  themes: ThemeSummary[];
  onBack: () => void;
  onFolderState: (state: FolderState) => void;
  onRename: (name: string) => void;
  onCover: (coverPath: string, coverUrl?: string) => void;
  /** Chegaram `added` fotos ao tema `destId` — o cartão dele tem de somar. */
  onCopiedTo: (destId: string, added: number) => void;
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
  /** As fotos deste arrasto que já estavam no tema. Ao lado do `failed` e com
   *  a mesma forma, mas NEUTRA: não é uma avaria, é o que ela pediu. */
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  /** O tema tem fotos anteriores a esta funcionalidade — dito uma vez, sem
   *  drama, porque explica a única repetida que pode escapar. */
  const [legacyPhotos, setLegacyPhotos] = useState(false);
  /** A pasta não pôde ser lida toda na última verificação. As repetidas que se
   *  encontraram são reais, mas pode ter escapado alguma — e prometer o
   *  contrário seria anunciar uma verificação que não aconteceu. */
  const [partialCheck, setPartialCheck] = useState(false);
  /** A fase de impressão digital, antes de qualquer preparação ou upload. */
  const [verifying, setVerifying] = useState<{ done: number; total: number } | null>(null);
  /** O diálogo "Copiar para…" está aberto. */
  const [copyOpen, setCopyOpen] = useState(false);
  /** O que aconteceu à última cópia/mudança — fica no ecrã enquanto houver
   *  fotos por levar (um número em que ela tem de agir não pode desaparecer). */
  const [copyReport, setCopyReport] = useState<ThemeCopyOutcome | null>(null);
  /** As fotos deste lote que ainda não voltaram do servidor, já à vista com a
   *  imagem que está no disco dela — ver `Pending`. */
  const [pending, setPending] = useState<Pending[]>([]);
  /** `caminho → URL de objeto` das fotos carregadas NESTA sessão: a grelha
   *  mostra a cópia local em vez de ir buscar ao Storage o que já cá está. */
  const [localSrc, setLocalSrc] = useState<Map<string, string>>(new Map());
  /** A página seguinte, já pedida e guardada — ver `prefetch`. */
  const [ahead, setAhead] = useState<Ahead | null>(null);
  /** A geração de miniaturas em falta, quando está a decorrer ou acabou. */
  const [thumbJob, setThumbJob] = useState<ThumbJob | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Índice da foto que está a ser arrastada (null = arrasto parado). */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** Onde ela cairia se a largasse agora — é o que desenha o espaço aberto. */
  const [dragOver, setDragOver] = useState<number | null>(null);
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

  /** Todos os URLs de objeto criados nesta pasta. Sair da pasta liberta-os
   *  todos de uma vez — é a única forma de garantir que nenhum fica pendurado,
   *  seja qual for o caminho por onde o lote acabou. */
  const objectUrls = useRef<Set<string>>(new Set());
  /** Pedido para parar a geração de miniaturas (o botão "Parar"). */
  const stopThumbs = useRef(false);

  useEffect(() => {
    alive.current = true;
    const urls = objectUrls.current;
    return () => {
      alive.current = false;
      for (const url of urls) revokeUrl(url);
      urls.clear();
    };
  }, []);

  /** Um URL de objeto para esta foto, já registado para ser libertado à saída. */
  const trackUrl = useCallback((file: File): string | undefined => {
    const url = objectUrl(file);
    if (url) objectUrls.current.add(url);
    return url;
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
   * FASE 1 a 3 — quais destas fotos JÁ estão no tema.
   *
   * A ordem é o que faz a diferença de tempo, e é deliberada: o resumo é
   * calculado ANTES de preparar a imagem. MEDIDO em Chromium nesta caixa, numa
   * foto 4032×3024 de 8,1 MB: 42,9 ms para resumir contra 337 ms para
   * preparar. Nesta ordem, cada repetida apanhada poupa a preparação E o
   * upload; ao contrário, poupava só o upload.
   *
   * Num arrasto de 300 com metade repetidas: ~4,3 s de resumos (4 em voo) e
   * ~0,5 s a construir o índice do lado do servidor, contra ~16,9 s de CPU
   * poupados e ~160 MB que deixam de subir (≈67 s a 20 Mbit/s).
   *
   * NUNCA falha o carregamento. Sem `crypto.subtle` (contexto inseguro), com a
   * pasta ilegível ou com a rota em baixo, isto devolve "sobe tudo" e o
   * `upsert: false` do servidor continua a ser o guarda que não falha.
   */
  async function screenBatch(files: File[]): Promise<Screening> {
    const nothingKnown: Screening = {
      keep: files,
      skipped: [],
      hashOf: new Map(),
      verified: false,
      legacy: false,
    };
    setVerifying({ done: 0, total: files.length });
    try {
      // ── 1) Impressão digital do ficheiro que está no disco dela ──────────
      const hashes = new Array<string | null>(files.length).fill(null);
      await pool(
        files.map((file, i) => ({ file, i })),
        FINGERPRINT_CONCURRENCY,
        async ({ file, i }) => {
          hashes[i] = await fingerprintBlob(file);
          if (alive.current) setVerifying((v) => (v ? { ...v, done: v.done + 1 } : v));
        },
        () => !alive.current,
      );
      if (!alive.current) return nothingKnown;
      // Nenhum resumo: este ambiente não sabe fazê-los (sem contexto seguro) e
      // a funcionalidade DESLIGA-SE — não parte, não avisa, não muda nada.
      if (hashes.every((h) => h === null)) return nothingKnown;

      const hashOf = new Map<File, string>();
      files.forEach((f, i) => {
        const h = hashes[i];
        if (h) hashOf.set(f, h);
      });

      // ── 2) Pré-verificação contra a pasta, em pedaços ────────────────────
      // Em pedaços de CHECK_CHUNK e não o lote todo: assim a primeira foto
      // começa a subir ao fim de ~0,3 s em vez de ~2 s num arrasto de 300. Do
      // segundo pedaço em diante o índice do servidor já está em memória.
      const known = new Set<string>();
      let verified = true;
      let legacy = false;
      for (let i = 0; i < files.length && alive.current; i += CHECK_CHUNK) {
        const chunk = [...new Set(hashes.slice(i, i + CHECK_CHUNK).filter((h) => h !== null))];
        if (chunk.length === 0) continue;
        try {
          const res = await fetch(`/api/temas/${theme.id}/repetidas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashes: chunk }),
          });
          if (!res.ok) throw new Error("falhou");
          const data = await res.json();
          for (const h of Array.isArray(data?.known) ? data.known : []) {
            if (typeof h === "string") known.add(h);
          }
          // `read: false` = a pasta não pôde ser lida; `complete: false` = a
          // pasta é maior do que o teto. Nos dois casos não se anuncia
          // poupança nenhuma, mesmo que alguma repetida tenha sido apanhada.
          if (data?.read === false || data?.complete === false) verified = false;
          if (data?.legacy) legacy = true;
        } catch {
          // Falhar a VERIFICAR nunca pode travar o carregamento: sobe tudo, e
          // o guarda da escrita apanha o que houver.
          verified = false;
        }
      }
      if (!alive.current) return nothingKnown;

      // ── 3) Repetidas dentro do PRÓPRIO arrasto ───────────────────────────
      // A pré-verificação nunca as apanharia: ainda não estão na pasta. Sem
      // isto, largar a mesma pasta duas vezes de seguida num só gesto entrava
      // a dobrar.
      const seen = new Set<string>();
      const keep: File[] = [];
      const out: Skipped[] = [];
      files.forEach((file, i) => {
        const hash = hashes[i];
        if (hash && known.has(hash)) {
          out.push({ file, reason: "no-tema", hash });
          return;
        }
        if (hash && seen.has(hash)) {
          out.push({ file, reason: "no-lote", hash });
          return;
        }
        if (hash) seen.add(hash);
        keep.push(file);
      });

      return { keep, skipped: out, hashOf, verified, legacy };
    } finally {
      if (alive.current) setVerifying(null);
    }
  }

  /**
   * Carrega um lote de fotos, SALTANDO as que já estão no tema.
   *
   * `force` é o "Adicionar mesmo assim": salta a verificação toda e manda o
   * servidor guardar com um sufixo. É a marcha-atrás de um clique — e a
   * recuperação de todos os modos de falha do índice (memo velho noutra
   * instância do servidor, resumo errado, colisão).
   */
  async function upload(files: File[], force?: { hashOf: Map<File, string> }) {
    if (files.length === 0) return;
    // O contador entra JÁ: a fase de verificação também é trabalho em curso, e
    // fechar o separador a meio dela perde o arrasto todo.
    setUploadingCount((n) => n + 1);
    try {
      const screened: Screening = force
        ? // A FORÇAR, os resumos já são conhecidos e VÃO na mesma: sem eles o
          // servidor cunharia um UUID e a foto forçada deixava de contar como
          // "está no tema" — um buraco permanente no índice, por cada clique
          // em "Adicionar mesmo assim".
          { keep: files, skipped: [], hashOf: force.hashOf, verified: false, legacy: false }
        : await screenBatch(files);
      if (!alive.current) return;
      if (screened.legacy) setLegacyPhotos(true);
      if (!force) setPartialCheck(!screened.verified);
      if (screened.skipped.length > 0) setSkipped((prev) => [...prev, ...screened.skipped]);
      if (screened.keep.length === 0) {
        // SEM ISTO ela vê uma barra a andar e nada a acontecer, e conclui que
        // o site está avariado.
        toast(
          `Estas ${files.length} fotos já estavam todas em "${theme.name}". Não foi adicionada nenhuma.`,
          "info",
        );
        return;
      }
      await sendBatch(screened.keep, screened.hashOf, Boolean(force), screened.skipped.length);
    } finally {
      if (alive.current) setUploadingCount((n) => Math.max(0, n - 1));
    }
  }

  /**
   * Envia o lote com até `UPLOAD_CONCURRENCY` em voo.
   *
   * Um ficheiro por pedido: o limite de corpo do alojamento (~4,5 MB) rebenta
   * com um lote inteiro de fotos de telemóvel. Cada pedido leva o original
   * preparado, a sua miniatura (`thumbs`, na mesma ordem) e o `hashes` — como
   * vai um só ficheiro de cada vez, "a mesma ordem" é trivialmente respeitada.
   *
   * Nada aqui deita fora o lote: cada falha é apanhada, guardada COM o
   * ficheiro (para se poder repetir sem voltar a escolher nada) e o lote
   * continua.
   */
  async function sendBatch(
    files: File[],
    hashOf: Map<File, string>,
    force: boolean,
    /** Quantas já foram saltadas antes de chegar aqui — entra na mensagem. */
    preSkipped: number,
  ) {
    // Os totais somam-se: dois lotes a decorrer mostram um só "47 de 312".
    setProgress((p) => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + files.length }));
    let added = 0;
    const errors: Failure[] = [];
    /** As que o SERVIDOR recusou por já lá estarem — a corrida apanhada pelo
     *  `upsert: false`, e a foto antiga apanhada pelo eTag. Contam-se aqui, e
     *  não na previsão, para o relatório dizer o que ACONTECEU. */
    const serverSkipped: Skipped[] = [];

    // AS FOTOS ENTRAM NA GRELHA AGORA, do ficheiro que está no computador —
    // não daqui a três segundos, quando o servidor responder. As primeiras
    // levam já o URL de objeto; as outras recebem-no quando lhes chegar a vez
    // de serem preparadas (aí já é a MINIATURA, que é barata de desenhar).
    const batch = files.map((file, i) => ({
      file,
      item: {
        id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        src: i < PREVIEW_EAGER ? trackUrl(file) : undefined,
      } as Pending,
    }));
    setPending((prev) => [...batch.map((b) => b.item), ...prev]);

    /** Tira a célula provisória da grelha. `keepUrl` fica com o URL de objeto
     *  (passou a ser a imagem da foto verdadeira); senão é revogado aqui. */
    const dropPending = (item: Pending, keepUrl: boolean) => {
      setPending((prev) => prev.filter((p) => p.id !== item.id));
      if (!keepUrl) revokeUrl(item.src);
    };

    try {
      await pool(
        batch,
        UPLOAD_CONCURRENCY,
        async ({ file: f, item }) => {
          try {
            // Preset "cover" e não "board": uma foto da biblioteca tem DOIS
            // destinos possíveis — uma célula de mood board ou uma imagem de
            // CAPA, impressa em grande. Guardá-la com 1600 px degradava-a para
            // sempre (o original nunca mais existe). A miniatura sai da MESMA
            // descodificação, para um lote de 300 fotos não custar o dobro.
            const { file, thumb, micro, lqip } = await prepareImageWithThumb(f, "cover");
            // A miniatura acabada de fazer é a melhor pré-visualização que há:
            // 400 px, ~25 KB, e já está em memória. As células que ainda não
            // tinham imagem ganham-na aqui; as que já tinham ficam com a que
            // têm (trocar era piscar por nada).
            if (!item.src) {
              const preview = trackUrl(thumb ?? file);
              if (preview) {
                item.src = preview;
                if (alive.current) {
                  setPending((prev) =>
                    prev.map((p) => (p.id === item.id ? { ...p, src: preview } : p)),
                  );
                }
              }
            }
            const form = new FormData();
            form.append("files", file);
            if (thumb) form.append("thumbs", thumb);
            // A micro de 96 px, para as tiras do cartão de tema. Vai no mesmo
            // pedido — já está feita, do mesmo canvas.
            if (micro) form.append("micros", micro);
            // O LQIP viaja no MESMO pedido que a foto — é trabalho do
            // carregamento, e o carregamento já está a falar com o servidor.
            // Emparelhado pela ORDEM, como o `thumbs` e o `hashes`.
            if (lqip) form.append("lqips", lqip);
            // O resumo do ficheiro ORIGINAL (não do preparado): é ele que vira
            // o nome no Storage e torna a garantia de "não repetir" atómica.
            const hash = hashOf.get(f);
            if (hash) form.append("hashes", hash);
            if (force) form.append("force", "1");
            const res = await fetch(`/api/temas/${theme.id}/imagens`, {
              method: "POST",
              body: form,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `Falha ao carregar "${f.name}".`);
            // O servidor recusou-a por já lá estar. NÃO é um erro: sai da
            // grelha em silêncio e entra no painel neutro das repetidas.
            const dup: ThemeDuplicate | undefined = data?.duplicates?.[0];
            if (dup) {
              dropPending(item, false);
              serverSkipped.push({ file: f, reason: "no-tema", ...(hash ? { hash } : {}) });
              return;
            }
            const im: ThemeImage | undefined = data?.images?.[0];
            if (!im?.path) throw new Error(`Falha ao carregar "${f.name}".`);
            if (!alive.current) return;
            // A célula provisória dá lugar à foto verdadeira SEM piscar: o URL
            // de objeto passa a ser a imagem desta foto na grelha, por isso não
            // se vai buscar ao Storage uma miniatura que já cá está.
            if (item.src) setLocalSrc((prev) => new Map(prev).set(im.path, item.src as string));
            dropPending(item, Boolean(item.src));
            // Cada foto entra na grelha assim que chega. Juntar o lote todo e no
            // fim fazer `[...lote, ...images]` lia um `images` velho: dois lotes
            // em paralelo perdiam fotos e uma foto removida entretanto voltava.
            setImages((prev) => (prev.some((x) => x.path === im.path) ? prev : [im, ...prev]));
            setTotal((t) => (t === null ? null : t + 1));
            added += 1;
          } catch (e) {
            // A foto não subiu: a célula provisória sai (a caixa vermelha do
            // "tentar novamente" é que passa a contar a história) e o URL de
            // objeto é libertado.
            dropPending(item, false);
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
      // O RELATÓRIO É CONSTRUÍDO DO QUE ACONTECEU, não do que a verificação
      // previu: assim uma corrida apanhada pelo 409, uma repetida antiga
      // apanhada pelo eTag e uma repetida prevista contam todas da mesma
      // maneira, e o número que ela lê é sempre verdadeiro.
      if (serverSkipped.length > 0) setSkipped((prev) => [...prev, ...serverSkipped]);
      const jaLaEstavam = preSkipped + serverSkipped.length;
      const cauda =
        jaLaEstavam > 0
          ? ` ${jaLaEstavam} já ${jaLaEstavam === 1 ? "estava" : "estavam"} no tema.`
          : "";
      if (errors.length > 0) {
        setFailed((prev) => [...prev, ...errors]);
        toast(
          errors.length === files.length
            ? `Nenhuma foto subiu. ${errors[0].message}`
            : `${added} de ${files.length} carregadas — ${plural(errors.length, "falhou", "falharam")}.`,
          "error",
        );
      } else if (added === 0 && jaLaEstavam > 0) {
        toast(`Nada a adicionar —${cauda}`, "info");
      } else {
        toast(
          `${plural(added, "foto adicionada", "fotos adicionadas")} a "${theme.name}".${cauda}`,
          "success",
        );
      }
    } finally {
      if (alive.current) {
        // Só o último lote apaga o contador: `done === total` só acontece
        // quando já não falta nenhum ficheiro de nenhum dos lotes.
        setProgress((p) => (p && p.done >= p.total ? null : p));
      }
    }
  }

  /**
   * Volta a pedir as páginas que estão à vista, para a grelha passar a mostrar
   * as miniaturas acabadas de gerar em vez dos originais.
   *
   * Substitui cada foto pela mesma foto (a chave é o `path`), por isso não
   * mexe na ordem, na seleção, nem no que subiu entretanto. Só as primeiras
   * `MAX_REFRESH_PAGES`: quem tiver aberto mais do que 300 fotos vê o resto
   * aliviado no próximo carregamento da página — e voltar a assinar 4000 URLs
   * para isso seria trocar um problema por outro.
   */
  async function refreshVisibleThumbs(count: number) {
    const pages = Math.min(Math.ceil(count / THEME_PAGE_SIZE), MAX_REFRESH_PAGES);
    const fresh = new Map<string, ThemeImage>();
    for (let p = 0; p < pages; p++) {
      try {
        const res = await fetch(
          `/api/temas/${theme.id}/imagens?offset=${p * THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const im of (Array.isArray(data?.images) ? data.images : []) as ThemeImage[]) {
          if (im?.path) fresh.set(im.path, im);
        }
      } catch {
        return;
      }
    }
    if (!alive.current || fresh.size === 0) return;
    setImages((prev) => prev.map((im) => fresh.get(im.path) ?? im));
    // A cópia local deixa de ser precisa para as que passaram a ter miniatura:
    // a partir daqui a grelha mostra a miniatura do servidor, como qualquer
    // outra foto. (Os URLs de objeto são libertados à saída da pasta.)
  }

  /**
   * GERAR AS MINIATURAS QUE FALTAM.
   *
   * Um pedido por lote, com o cursor que o servidor devolve. Parece
   * complicado e é o que torna isto usável: cada pedido é curto (o ecrã nunca
   * congela), fechar o separador não perde nada (recomeça-se do princípio e o
   * que já está feito é saltado), e o que falha é contado à vista em vez de
   * desaparecer.
   */
  async function runThumbJob() {
    if (thumbJob?.running) return;
    stopThumbs.current = false;
    let cursor = 0;
    let scanned = 0;
    let generated = 0;
    let failedCount = 0;
    let badBatches = 0;
    let complete = false;
    setThumbJob({
      running: true,
      cursor,
      scanned,
      generated,
      failed: failedCount,
      total,
      complete: false,
    });
    try {
      for (let batch = 0; batch < MAX_THUMB_BATCHES; batch++) {
        if (!alive.current || stopThumbs.current) break;
        let data: {
          scanned?: number;
          generated?: number;
          failed?: number;
          nextCursor?: number | null;
          total?: number | null;
        } | null = null;
        try {
          const res = await fetch(`/api/temas/${theme.id}/miniaturas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cursor }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            toast(
              body?.error ||
                "Não foi possível gerar as miniaturas agora. O que já foi feito fica guardado.",
              "error",
            );
            break;
          }
          data = body;
        } catch {
          toast("Erro de ligação ao gerar as miniaturas. Pode continuar mais tarde.", "error");
          break;
        }
        scanned += data?.scanned ?? 0;
        generated += data?.generated ?? 0;
        failedCount += data?.failed ?? 0;
        // Lotes seguidos em que NADA se gerou e tudo falhou = o problema não é
        // a foto, é o Storage. Continuar seria percorrer 4000 fotos a falhar
        // em silêncio, com a barra a andar como se estivesse a fazer algo.
        badBatches = (data?.generated ?? 0) === 0 && (data?.failed ?? 0) > 0 ? badBatches + 1 : 0;
        if (badBatches >= MAX_BAD_BATCHES) {
          toast(
            "As miniaturas não estão a ser criadas. Pare por agora e tente mais tarde — as fotos não foram tocadas.",
            "error",
          );
          break;
        }
        const next = data?.nextCursor;
        cursor = typeof next === "number" ? next : cursor;
        if (!alive.current) return;
        setThumbJob({
          running: true,
          cursor,
          scanned,
          generated,
          failed: failedCount,
          total: typeof data?.total === "number" ? data.total : total,
          complete: false,
        });
        if (next === null || next === undefined) {
          complete = true;
          break;
        }
      }
    } finally {
      if (alive.current) {
        setThumbJob((j) =>
          j ? { ...j, running: false, scanned, generated, failed: failedCount, complete } : j,
        );
      }
    }
    if (!alive.current) return;
    if (generated > 0) {
      toast(
        `${plural(generated, "miniatura criada", "miniaturas criadas")}. O tema passa a abrir muito mais depressa.`,
        "success",
      );
      await refreshVisibleThumbs(images.length);
    } else if (complete) {
      toast("Já não faltavam miniaturas neste tema.", "info");
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

  /**
   * "ADICIONAR MESMO ASSIM" — a marcha-atrás de um clique.
   *
   * Sobe as saltadas com `force`, e o servidor guarda-as com `<resumo>-<4 hex>`.
   * O sufixo é a razão pela qual o analisador de nomes o descarta: uma cópia
   * forçada CONTINUA a contar como "esta foto está no tema" para o arrasto
   * seguinte, em vez de abrir um buraco permanente no índice.
   *
   * É por LOTE, no relatório — nunca uma pergunta por foto. E é a recuperação
   * de todos os modos de falha do índice, que é por isso que o relatório tem de
   * ser accionável e não decorativo.
   */
  function addSkippedAnyway() {
    if (skipped.length === 0) return;
    // Os resumos já foram calculados na verificação — não se voltam a ler os
    // ficheiros, e vão com as fotos para o nome forçado os preservar.
    const hashOf = new Map<File, string>();
    for (const s of skipped) if (s.hash) hashOf.set(s.file, s.hash);
    const again = skipped.map((s) => s.file);
    setSkipped([]);
    upload(again, { hashOf });
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

  /** Junta ao ecrã uma página que já veio do servidor (pedida agora ou de
   *  antemão). Um só sítio a mexer nestes quatro estados. */
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
    if (loadingMore) return;
    // A página seguinte já cá está: entra sem esperar por nada. É este o
    // caminho normal — o pedido foi feito 1,5 s depois de a pasta abrir.
    if (ahead && ahead.offset === images.length) {
      const next = ahead;
      setAhead(null);
      absorb(next.images, next.total, next.truncated, next.full);
      return;
    }
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
   * Só depois de a primeira estar no ecrã (`PREFETCH_DELAY_MS`), e só UMA: o
   * objetivo é que o "Mostrar mais" seja instantâneo, não descarregar o tema
   * todo às escondidas — um tema tem 4000 fotos e assinar URLs custa ao
   * servidor. A página guardada trava-se a um `offset`: se entretanto entrar
   * ou sair uma foto, deixa de encaixar e é deitada fora (o efeito volta a
   * correr e pede a certa).
   */
  // Uma página guardada só serve no sítio para onde foi pedida: se entretanto
  // entrou (ou saiu) uma foto, ela deixa de encaixar e volta a pedir-se a
  // certa. Isto lê-se, não se apaga — deitar fora o estado dentro do efeito
  // seria uma renderização a mais para dizer o que já se sabe daqui.
  const aheadFits = ahead !== null && ahead.offset === images.length;
  useEffect(() => {
    if (loading || loadingMore || !hasMore || aheadFits) return;
    let cancelled = false;
    const offset = images.length;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const res = await fetch(
            `/api/temas/${theme.id}/imagens?offset=${offset}&limit=${THEME_PAGE_SIZE}`,
            { cache: "no-store" },
          );
          if (!res.ok) return;
          const data = await res.json();
          if (cancelled || !alive.current) return;
          const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
          if (page.length === 0) return;
          setAhead({
            offset,
            images: page,
            total: typeof data?.total === "number" ? data.total : null,
            truncated: Boolean(data?.truncated),
            full: page.length >= THEME_PAGE_SIZE,
          });
        } catch {
          // Falhar a adivinhar não é um erro que se mostre: o botão "Mostrar
          // mais" continua a fazer o pedido à mão, com a sua própria mensagem.
        }
      })();
    }, PREFETCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [theme.id, loading, loadingMore, hasMore, aheadFits, images.length]);

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

  /**
   * O que fazer com a grelha depois de levar fotos para outro tema.
   *
   * SEM REMOÇÃO OTIMISTA, ao contrário do `removeImages`: aqui já houve barra
   * de progresso a explicar a espera, por isso a grelha só perde as fotos que o
   * servidor CONFIRMOU — e assim não é preciso código de reversão nenhum (o
   * `reinsertAt` não entra nisto).
   *
   * As que falharam e as que já lá estavam ficam SELECIONADAS: é o padrão que o
   * `ThemePicker` já usa ("o que falhou volta a ser a seleção"), e evita que
   * repetir a operação obrigue a escolher tudo de novo.
   */
  function applyCopyOutcome(r: ThemeCopyOutcome) {
    setCopyOpen(false);
    if (r.copied.length > 0) onCopiedTo(r.destId, r.copied.length);
    if (r.mode === "mover" && r.copied.length > 0) {
      const gone = new Set(r.copied);
      setImages((prev) => prev.filter((im) => !gone.has(im.path)));
      setTotal((t) => (t === null ? null : Math.max(0, t - r.copied.length)));
      // A capa que saiu deixa de o ser: o servidor já a limpou na origem.
      setCoverPath((c) => (c && gone.has(c) ? undefined : c));
      anchor.current = null;
    }
    const stuck = new Set([...r.failed, ...r.existing]);
    setSelected((prev) => new Set([...prev].filter((p) => stuck.has(p))));

    // O cartão vermelho fica no ecrã enquanto houver fotos por levar; um
    // número em que ela precisa de agir não pode desaparecer como um aviso.
    setCopyReport(r.failed.length > 0 || r.stopped ? r : null);
    if (r.failed.length > 0 || r.stopped) return;

    const verbo = r.mode === "copiar" ? "copiadas" : "movidas";
    const cauda = r.existing.length > 0 ? ` — ${r.existing.length} já lá estavam.` : ".";
    toast(
      r.copied.length === 0
        ? `Estas fotos já estavam todas em "${r.destName}".`
        : `${plural(r.copied.length, `foto ${verbo.slice(0, -1)}`, `fotos ${verbo}`)} para "${r.destName}"${cauda}`,
      "success",
    );
    // Sem miniatura, o tema de destino passa a puxar ORIGINAIS (medido: 164 MB
    // por página de 60, contra 1,78 MB). Se acontecer em massa ela tem de saber
    // porquê — senão vê o tema a arrastar-se e não faz ideia da razão.
    if (r.thumbsMissing > 0) {
      toast(
        `${plural(r.thumbsMissing, "foto chegou", "fotos chegaram")} a "${r.destName}" sem miniatura. Abra esse tema e use "Gerar miniaturas em falta".`,
        "info",
      );
    }
  }

  /**
   * Fixa a ordem que está à vista.
   *
   * Guarda-se o que ESTÁ carregado (cortado no teto do servidor): essas fotos
   * passam a ser o prefixo arrumado do tema e tudo o resto continua a vir por
   * data, atrás delas. É o que faz "pôr as boas à frente" custar meia dúzia de
   * caminhos em vez de uma cópia do catálogo.
   */
  async function persistOrder(next: ThemeImage[], previous: ThemeImage[]) {
    try {
      const res = await fetch(`/api/temas/${theme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoOrder: next.slice(0, MAX_PHOTO_ORDER).map((im) => im.path) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "falhou");
      }
    } catch (e) {
      // A ordem volta ao que estava: mostrar uma arrumação que o servidor não
      // guardou seria mentir-lhe até ao próximo recarregamento.
      if (!alive.current) return;
      setImages(previous);
      toast(
        e instanceof Error && /db\/schema\.sql|base de dados/i.test(e.message)
          ? e.message
          : "Não foi possível guardar a nova ordem das fotos.",
        "error",
      );
    }
  }

  /** Move uma foto para outra posição da grelha (arrasto, setas ou "para o início"). */
  function moveTo(from: number, to: number) {
    if (from === to) return;
    setImages((prev) => {
      const next = moveItem(prev, from, to);
      if (next === prev) return prev;
      void persistOrder(next, prev);
      return next;
    });
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
  /** Há para onde levar fotos? Sem outro tema, "Copiar para…" seria um botão
   *  que só sabe abrir um diálogo vazio. */
  const otherThemes = useMemo(() => themes.filter((t) => t.id !== theme.id), [themes, theme.id]);
  // Ver uma foto em grande. `null` = fechado. Guarda-se também o elemento que
  // estava focado, para o foco voltar ao mosaico de onde se abriu.
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  const zoomOpener = useRef<HTMLElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  const openZoom = useCallback((i: number) => {
    zoomOpener.current = document.activeElement as HTMLElement | null;
    setZoomAt(i);
  }, []);
  const closeZoom = useCallback(() => {
    setZoomAt(null);
    // O foco volta de onde veio; sem isto ficava no <body> e o teclado perdia-se.
    zoomOpener.current?.focus?.();
  }, []);

  /** Transfere uma foto (a do visualizador ou a de um mosaico). */
  const downloadImage = useCallback(
    async (im: ThemeImage, i: number) => {
      setDownloading(true);
      const ok = await downloadOne(im.url, downloadName(im, theme.name, i));
      setDownloading(false);
      if (!ok) toast("Não foi possível transferir a foto.", "error");
    },
    [theme.name, toast],
  );

  /** Transfere as fotos selecionadas, uma de cada vez (ver photo-download.ts). */
  const downloadSelected = useCallback(async () => {
    const chosen = images.map((im, i) => ({ im, i })).filter(({ im }) => selected.has(im.path));
    if (chosen.length === 0) return;
    setDownloading(true);
    const res = await downloadMany(
      chosen.map(({ im, i }) => ({ url: im.url, filename: downloadName(im, theme.name, i) })),
      () => {},
    );
    setDownloading(false);
    if (res.failed > 0) {
      toast(
        res.failed === res.total
          ? "Não foi possível transferir as fotos."
          : `${res.total - res.failed} de ${res.total} transferidas.`,
        "error",
      );
    } else {
      toast(plural(res.done, "foto transferida", "fotos transferidas"), "success");
    }
  }, [images, selected, theme.name, toast]);
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  /**
   * Há fotos a ser mostradas a partir do ORIGINAL — é o que acontece a tudo o
   * que foi carregado antes de as miniaturas existirem. Não é uma suposição: é
   * lido das fotos que estão à vista (as que subiram agora contam-se como
   * feitas, porque a miniatura foi com elas).
   */
  const missingThumbs = images.some((im) => !im.thumbUrl && !localSrc.has(im.path));
  const thumbPct =
    thumbJob && thumbJob.total && thumbJob.total > 0
      ? Math.min(100, Math.round((thumbJob.cursor / thumbJob.total) * 100))
      : 0;

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

      {/* A VERIFICAR — a fase que acontece ANTES de preparar seja o que for.
          Curta (medido: ~16 ms por foto, quatro em voo) mas não pode ser
          silenciosa: sem isto, um arrasto de 300 fotos ficava um segundo e
          meio aparentemente parado antes de a primeira entrar na grelha. */}
      {verifying && (
        <Card padding="sm" className="mb-4">
          <p className="text-sm text-foreground/80">
            A verificar {plural(verifying.total, "foto", "fotos")} — {verifying.done} de{" "}
            {verifying.total}…
          </p>
          <p className="bo-text-muted mt-1 text-xs">
            A ver quais já estão neste tema, para não as carregar outra vez.
          </p>
        </Card>
      )}

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

      {/* MINIATURAS EM FALTA — só aparece quando há mesmo fotos a ser
          mostradas a partir do original, e desaparece quando deixa de haver. */}
      {(missingThumbs || thumbJob) && !unreadable && (
        <Card padding="sm" className="mb-4">
          {thumbJob?.running ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-foreground/80">
                  A gerar miniaturas —{" "}
                  <strong className="font-medium">
                    {plural(thumbJob.generated, "criada", "criadas")}
                  </strong>{" "}
                  em {thumbJob.scanned} fotos vistas
                  {thumbJob.total ? ` de ${thumbJob.total}` : ""}…
                </p>
                <span className="bo-text-muted text-xs">{thumbPct}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Progresso da geração de miniaturas"
                aria-valuemin={0}
                aria-valuemax={thumbJob.total ?? undefined}
                aria-valuenow={thumbJob.cursor}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
              >
                <div
                  className="h-full rounded-full bg-[#4d6350] motion-safe:transition-[width] motion-safe:duration-300"
                  style={{ width: `${thumbPct}%` }}
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    stopThumbs.current = true;
                  }}
                >
                  Parar
                </Button>
                <span className="bo-text-muted text-xs">
                  Pode continuar a trabalhar — e parar a meio não perde nada: da próxima vez
                  continua de onde ficou.
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground/80">
                {missingThumbs
                  ? "Há fotos antigas sem miniatura — a grelha está a mostrar as fotos em tamanho real (uns 2,6 MB cada), e é por isso que este tema demora a abrir."
                  : "As miniaturas deste tema estão feitas."}
              </p>
              {thumbJob && (
                <p className="bo-text-muted mt-1 text-xs">
                  {plural(thumbJob.generated, "miniatura criada", "miniaturas criadas")} ·{" "}
                  {thumbJob.scanned} fotos vistas
                  {thumbJob.failed > 0
                    ? ` · ${plural(thumbJob.failed, "foto sem miniatura", "fotos sem miniatura")}`
                    : ""}
                  {thumbJob.complete ? " · concluído" : " · parado a meio"}
                </p>
              )}
              {missingThumbs && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" onClick={() => void runThumbJob()}>
                    {thumbJob ? "Continuar a gerar miniaturas" : "Gerar miniaturas em falta"}
                  </Button>
                  <span className="bo-text-muted text-xs">
                    As fotos originais não são alteradas.
                  </span>
                </div>
              )}
            </>
          )}
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

      {/* JÁ ESTAVAM NO TEMA — a caixa tem a forma da do "tentar novamente", mas
          NEUTRA: isto não é uma avaria, é o que ela pediu a acontecer. Um só
          botão, e por LOTE: nunca uma pergunta foto a foto. */}
      {skipped.length > 0 && (
        <Card padding="sm" className="mb-4">
          <p className="text-sm text-foreground/80">
            {plural(skipped.length, "foto não foi adicionada", "fotos não foram adicionadas")} —{" "}
            {skipped.some((s) => s.reason === "no-tema") &&
            skipped.some((s) => s.reason === "no-lote")
              ? "já estavam neste tema ou vinham repetidas no mesmo arrasto"
              : skipped[0].reason === "no-lote"
                ? "vinham repetidas dentro do mesmo arrasto"
                : `já ${skipped.length === 1 ? "estava" : "estavam"} em “${theme.name}”`}
            .
          </p>
          {legacyPhotos && (
            <p className="bo-text-muted mt-1 text-xs">
              As fotos carregadas antes desta funcionalidade nem sempre podem ser reconhecidas.
            </p>
          )}
          {partialCheck && (
            <p className="bo-text-muted mt-1 text-xs">
              Não foi possível ver a pasta toda desta vez — pode ter escapado alguma repetida.
            </p>
          )}
          <ul className="mt-3 flex flex-wrap gap-2">
            {skipped.slice(0, SKIPPED_PREVIEWS).map((s, i) => (
              <li
                key={`${s.file.name}-${i}`}
                title={`${s.file.name} — ${
                  s.reason === "no-lote" ? "repetida neste arrasto" : "já estava no tema"
                }`}
                className="h-14 w-14 overflow-hidden rounded-lg border border-foreground/[0.1] bg-foreground/[0.04]"
              >
                <SkippedThumb file={s.file} track={trackUrl} />
              </li>
            ))}
          </ul>
          {skipped.length > SKIPPED_PREVIEWS && (
            <p className="bo-text-muted mt-2 text-xs">
              …e mais {skipped.length - SKIPPED_PREVIEWS}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={addSkippedAnyway}>
              Adicionar mesmo assim
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSkipped([])}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      {/* O QUE NÃO FOI LEVADO para outro tema. Vermelho e persistente: é um
          número em que ela tem de agir, e as fotos continuam aqui. */}
      {copyReport && (
        <Card padding="sm" className="mb-4 border-[#8a2a22]/25 bg-[#f6e6df]/40">
          <p className="text-sm text-foreground/80">
            {copyReport.failed.length > 0
              ? `${copyReport.failed.length} de ${
                  copyReport.copied.length + copyReport.existing.length + copyReport.failed.length
                } ${
                  copyReport.failed.length === 1
                    ? copyReport.mode === "copiar"
                      ? "não foi copiada"
                      : "não foi movida"
                    : copyReport.mode === "copiar"
                      ? "não foram copiadas"
                      : "não foram movidas"
                } para “${copyReport.destName}”.`
              : `Parou a meio — ${plural(copyReport.copied.length, "foto foi", "fotos foram")} para “${copyReport.destName}”.`}
          </p>
          <p className="bo-text-muted mt-1 text-xs">
            {copyReport.failed.length > 0
              ? "Continuam neste tema e ficaram selecionadas — pode tentar outra vez sem as escolher de novo."
              : "As que faltavam continuam neste tema."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {selectedCount > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setCopyOpen(true)}>
                Tentar novamente
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setCopyReport(null)}>
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
            {/* ⚠️ "Transferir", aqui ao lado, já significa DESCARREGAR. Esta
                ação chama-se "Copiar para…" — a palavra transferir está
                proibida para ela, senão passam a existir dois significados no
                mesmo sítio. Só aparece havendo outro tema para onde levar. */}
            {otherThemes.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setCopyOpen(true)}>
                Copiar para…
              </Button>
            )}
            <Button size="sm" variant="secondary" loading={downloading} onClick={downloadSelected}>
              Transferir
            </Button>
            <Button size="sm" variant="secondary" onClick={clearSelection}>
              Limpar seleção
            </Button>
            <Button size="sm" variant="danger" loading={bulkBusy} onClick={removeSelected}>
              Remover
            </Button>
          </div>
        </div>
      )}

      {copyOpen && (
        <ThemeCopyDialog
          sourceTheme={theme}
          themes={themes}
          // Pela ordem da GRELHA, não pela ordem por que ela clicou: é assim
          // que a lista do relatório se lê como a grelha se vê.
          paths={images.filter((im) => selected.has(im.path)).map((im) => im.path)}
          onClose={() => setCopyOpen(false)}
          onDone={applyCopyOutcome}
        />
      )}

      {zoomAt !== null && images[zoomAt] && (
        <PhotoLightbox
          images={images}
          index={zoomAt}
          onIndexChange={setZoomAt}
          onClose={closeZoom}
          onDownload={downloadImage}
          downloading={downloading}
        />
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
        ) : images.length === 0 && pending.length === 0 ? (
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
              {/* AS FOTOS QUE ELA ACABOU DE LARGAR, já à vista, ainda a
                  caminho do servidor. Não são selecionáveis nem removíveis
                  (ainda não existem lá), e o leitor de ecrã segue a barra de
                  progresso — não 300 células a anunciarem-se. */}
              {pending.map((p) => (
                <div
                  key={p.id}
                  aria-hidden
                  title={`${p.name} — a carregar`}
                  className="relative aspect-square overflow-hidden rounded-lg border border-foreground/[0.1] bg-foreground/[0.04]"
                >
                  {p.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.src}
                      alt=""
                      decoding="async"
                      className="h-full w-full object-cover opacity-60"
                    />
                  ) : (
                    <div className="bo-skeleton h-full w-full" />
                  )}
                  <span className="absolute inset-x-1 bottom-1 rounded-md bg-black/55 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-[0.06em] text-white">
                    A carregar
                  </span>
                </div>
              ))}
              {images.map((im, i) => {
                const isSelected = selected.has(im.path);
                const isCover = im.path === coverPath;
                return (
                  <div
                    key={im.path}
                    draggable
                    onDragStart={(e) => {
                      setDragFrom(i);
                      e.dataTransfer.effectAllowed = "move";
                      // Alguns navegadores só iniciam o arrasto com dados lá
                      // dentro; o valor não é usado por ninguém.
                      e.dataTransfer.setData("text/plain", String(i));
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onDragOver={(e) => {
                      if (dragFrom === null) return;
                      // Sem isto o browser recusa a largada.
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOver !== i) setDragOver(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom !== null) moveTo(dragFrom, i);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    className={`group relative aspect-square overflow-hidden rounded-lg border bg-foreground/[0.04] motion-safe:transition-[opacity,box-shadow] ${
                      isSelected
                        ? "border-[#4d6350] ring-2 ring-[#4d6350]/40"
                        : "border-foreground/[0.1]"
                    } ${dragFrom === i ? "opacity-40" : ""} ${
                      dragOver === i && dragFrom !== null && dragFrom !== i
                        ? "ring-2 ring-[#4d6350]"
                        : ""
                    }`}
                  >
                    {/* A célula já tem `aspect-square`, por isso adiar a foto
                        não salta nada. E o que se mostra é a MINIATURA: com o
                        original, uma página de 60 fotos puxava ~150 MB. As da
                        primeira dobra não esperam pela vez de ninguém. */}
                    <Photo
                      image={im}
                      alt=""
                      priority={i < ABOVE_FOLD}
                      localSrc={localSrc.get(im.path)}
                    />
                    {/* A célula inteira é o alvo da seleção — um alvo pequeno
                        numa grelha de 60 fotos seria um exercício de pontaria. */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Selecionar foto ${i + 1} de ${images.length}`}
                      onClick={(e) => toggleAt(i, e.shiftKey)}
                      onKeyDown={(e) => {
                        // Alt + setas move a foto. Sem o Alt, as setas continuam
                        // a andar entre células, que é o que o teclado espera.
                        if (!e.altKey) return;
                        const to =
                          e.key === "ArrowLeft" || e.key === "ArrowUp"
                            ? i - 1
                            : e.key === "ArrowRight" || e.key === "ArrowDown"
                              ? i + 1
                              : e.key === "Home"
                                ? 0
                                : null;
                        if (to === null) return;
                        e.preventDefault();
                        moveTo(i, Math.max(0, Math.min(images.length - 1, to)));
                      }}
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
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => moveTo(i, 0)}
                        aria-label={`Mover a foto ${i + 1} para o início`}
                        title="Mover para o início"
                        className="absolute bottom-1 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-sm leading-none text-white opacity-0 motion-safe:transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        ↑
                      </button>
                    )}
                    {/* Ampliar. A célula inteira já é o alvo da seleção, por
                        isso o zoom precisa do seu próprio botão — como o ↑ e o
                        ×. `stopPropagation` para não selecionar ao ampliar. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openZoom(i);
                      }}
                      aria-label={`Ver a foto ${i + 1} em grande`}
                      title="Ver em grande"
                      className="absolute left-1 bottom-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-xs leading-none text-white opacity-0 motion-safe:transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      ⤢
                    </button>
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
