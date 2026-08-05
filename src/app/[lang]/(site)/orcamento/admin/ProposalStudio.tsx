"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./Toast";
import {
  withProposalDefaults,
  resolveProposalMoney,
  detectVatMode,
  parseMoneyText,
  normaliseCoverImages,
  DEFAULT_VALID_DAYS,
  DEFAULT_VAT_RATE,
  MOOD_BOARD_MAX_IMAGES,
  type VatMode,
} from "@/lib/proposal-doc";
import { linhasDeOrcamento } from "@/lib/orcamento/decoracao";
import CriarAPartirDe, { type Escolha } from "./CriarAPartirDe";
import ModelosParciais from "./ModelosParciais";
import NavEstudio from "./NavEstudio";
import { estadoDasSeccoes, oQueFaltaParaEnviar, podeEnviar } from "@/lib/proposal-progress";
import { depositPercentOf } from "@/lib/proposal-doc";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { CampoAMudar } from "@/lib/proposal-copy";
import {
  adicionarLinha,
  definirItem,
  definirPreco,
  desalinhamento,
  linhasDe,
  normalizarValor,
  removerLinha,
  somaDosItens,
  asDuasFormas,
} from "@/lib/proposal-budget";
import { eur, splitSinal } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";
import { prepareImageWithThumb, type ImageKind } from "./image-prep";
import ThemePicker, { type ImportedImage } from "./ThemePicker";
import { aquecerBiblioteca } from "./theme-picker-cache";
import { Button, Card, Field, Segmented } from "./ui";

/**
 * Visual editor for the studio's multi-page proposal PDF. Produces a
 * {@link ProposalDoc}-shaped payload (minus the fixed boilerplate, which the
 * server fills via {@link withProposalDefaults}) and previews / e-mails it.
 */
type StudioDoc = Parameters<typeof withProposalDefaults>[0];

// ── Shared styling (matches ProposalBuilder / PaymentsPanel) ──
/**
 * Fotos a preparar/enviar ao mesmo tempo num carregamento. Quatro é o mesmo
 * número que a Biblioteca de Temas usa: chega para a rede nunca ficar parada à
 * espera do processador (nem o contrário) sem encher a ligação da Catarina, que
 * é a mesma por onde ela está a trabalhar.
 */
const UPLOAD_CONCURRENCY = 4;

const INPUT_SM = "bo-input min-w-0 px-3 py-2 text-xs text-foreground/85";
const ADD_BTN =
  "alvo-toque !justify-start gap-1 text-xs font-medium text-[#4d6350] hover:text-[#415440] transition-colors inline-flex items-center";
const REMOVE_BTN =
  "alvo-toque text-foreground/30 hover:text-[#8a2a22] transition-colors text-base leading-none shrink-0";

const PT_MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  casamentos: "Casamento",
  batizados: "Batizado",
  aniversarios: "Aniversário",
  jantares_gala: "Jantar de Gala",
  conferencias: "Conferência",
  teambuilding: "Teambuilding",
  lancamentos: "Lançamento de Produto",
  jantares_empresa: "Jantar de Empresa",
};

function eventTypeLabel(q: Quote): string {
  if (q.eventType && EVENT_TYPE_LABELS[q.eventType]) return EVENT_TYPE_LABELS[q.eventType];
  if (q.category === "empresas") return "Evento Corporativo";
  return "Casamento";
}

/** yyyy-mm-dd → "12 de setembro de 2026"; passes through anything else. */
function formatEventDate(d?: string): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return d;
  return `${Number(m[3])} de ${PT_MONTHS[month - 1]} de ${m[1]}`;
}

function buildRef(d: StudioDoc): string {
  const tpl = d.template === "organizacao" ? "Organização" : "Decoração";
  return `${tpl} ${d.eventType} ${d.clientNames} · ${d.eventDate}`.replace(/\s+/g, " ").trim();
}

function initialDoc(quote: Quote): StudioDoc {
  const base: StudioDoc = {
    template: "decoracao",
    ref: "",
    clientNames: quote.name ?? "",
    eventType: eventTypeLabel(quote),
    eventDate: formatEventDate(quote.date),
    location: quote.location ?? "",
    guests: quote.guests ? `${quote.guests} pax` : "",
    ceremony: "",
    time: "",
    weddingPlanners: "",
    serviceGroups: [],
    moodBoards: [],
    cronograma: [],
    budgetItems: [],
    budgetExtras: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    budgetRows: [],
    totalEstimatedText: "",
    budgetNote: "",
    coverImages: normaliseCoverImages(),
  };
  base.ref = buildRef(base);
  return base;
}

/** Passos do fluxo guiado do estúdio. */
type Step = "conteudo" | "prever" | "enviar";
const STEPS: { id: Step; n: string; label: string }[] = [
  { id: "conteudo", n: "1", label: "Conteúdo" },
  { id: "prever", n: "2", label: "Pré-visualizar" },
  { id: "enviar", n: "3", label: "Enviar" },
];

/** Numa proposta nova/vazia, semeia um grupo de serviços com um item — para que
 *  o estúdio não abra como uma parede de botões "+ Adicionar" vazios. Nunca
 *  toca num rascunho que já tenha conteúdo. */
/**
 * Põe a BASE (o "Preço final (sem IVA)" do pedido) no documento, respeitando o
 * modo de IVA em vigor.
 *
 * `resolveProposalMoney` lê `totalAmount` como a base em "acrescer" e como o
 * BRUTO em "incluído" — por isso o valor guardado tem de ser derivado, para a
 * base ser sempre o número do pedido nos dois modos.
 */
function aplicarBase(d: StudioDoc, base: number): StudioDoc {
  const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
  const rate = d.vatRate ?? DEFAULT_VAT_RATE;
  const amount = mode === "acrescer" ? base : Math.round(base * (1 + rate) * 100) / 100;
  const text = mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
  return d.template === "organizacao"
    ? { ...d, totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
    : { ...d, totalAmount: amount, totalVatMode: mode, totalText: text };
}

/**
 * A BASE (sem IVA) de um documento, seja qual for o modo.
 *
 * O campo do estúdio mostra SEMPRE a base — é o número que o pedido guarda e o
 * que o rótulo "(sem IVA)" promete. Mas `totalAmount` só é a base em modo
 * "acrescer"; em "incluído" é o BRUTO. Encher o campo com o valor cru mostrava
 * 9963 onde o pedido dizia 8100. Medido.
 */
function baseDoDoc(d: Partial<StudioDoc>): number | undefined {
  const m = resolveProposalMoney(d as StudioDoc);
  return m.base > 0 ? m.base : undefined;
}

function seedDefaults(d: StudioDoc, quote: Quote): StudioDoc {
  const quotedPrice = quote.quotedPrice;
  // O que o casal marcou no pedido de orçamento. É a razão de ser desta
  // funcionalidade: a proposta da Catarina Martins saiu com cinco pontos, ela
  // pediu para refazer com três, e o trabalho teve de ser todo repetido. Se o
  // casal já disse o que quer, a proposta abre com esses pontos e mais nenhum.
  const linhas = linhasDeOrcamento(quote.decorPoints ?? []);
  let next = d;
  if (next.serviceGroups.length === 0) {
    next = {
      ...next,
      serviceGroups: [
        linhas.length > 0
          ? {
              letter: "a)",
              title: "Decoração Floral e Decoração",
              items: linhas.map((label) => ({ label, desc: "" })),
            }
          : { letter: "a)", title: "", items: [{ label: "", desc: "" }] },
      ],
    };
  }
  // O quadro "3. Orçamento Proposto" com as mesmas linhas. Sem preços: o valor
  // continua a ser um só, no total, tal como nas propostas dela.
  if (next.budgetItems.length === 0 && linhas.length > 0) {
    next = { ...next, budgetItems: [...linhas] };
  }
  // O valor vem do "Preço final (sem IVA)" do pedido, e é o mesmo número —
  // não há aqui um segundo. A condição `== null` que aqui estava era a origem
  // do defeito: uma vez semeado, o estúdio deixava de acompanhar o pedido e os
  // dois números separavam-se em silêncio. Agora semeia-se SEMPRE, e o efeito
  // de sincronização trata das alterações posteriores.
  if (typeof quotedPrice === "number" && quotedPrice > 0) {
    next = { ...next, totalAmount: quotedPrice, totalVatMode: next.totalVatMode ?? "acrescer" };
  }
  return next;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * Quantos passos atrás o Cmd+Z consegue ir.
 *
 * Cada passo é um documento inteiro em memória. Cinquenta chegam de sobra
 * para desfazer um engano — ninguém carrega em Cmd+Z cinquenta vezes seguidas
 * — e mantêm a conta de memória modesta mesmo numa proposta com muitos mood
 * boards (os documentos guardam caminhos de fotos, não bytes).
 */
const MAX_HISTORICO = 50;

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

// ── O que o PDF não leva ──
//
// Há duas maneiras de uma proposta seguir para o cliente incompleta, e a
// Catarina tem de ver as DUAS antes de a enviar:
//
//  1. a foto não chegou — o servidor não a conseguiu ir buscar (`missingImages`);
//  2. o conteúdo chegou e NÃO COUBE — a sétima foto de um mood board, a
//     terceira linha do "Local", uma descrição comprida de mais (`truncations`).
//
// O caso 2 era completamente mudo: as fotos eram carregadas, descarregadas com
// sucesso, e simplesmente nunca desenhadas. Vem agora do gerador já com o sítio
// e a quantidade; aqui só se escreve a frase.

/** Uma perda por composição, tal como o gerador a relata (o tipo vive em
 *  `proposal-doc-pdf`, que é `server-only` e por isso não se importa aqui). */
interface Corte {
  where: string;
  dropped: number;
  unit: "fotos" | "linhas";
}

/** Aceita só o que tem forma de corte — o resto é ignorado em vez de rebentar
 *  a mensagem (uma resposta estranha nunca pode tapar o aviso). */
function normalizaCortes(raw: unknown): Corte[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is Corte =>
      !!c &&
      typeof c === "object" &&
      typeof (c as Corte).where === "string" &&
      typeof (c as Corte).dropped === "number" &&
      (c as Corte).dropped > 0 &&
      ((c as Corte).unit === "fotos" || (c as Corte).unit === "linhas"),
  );
}

/** Lê o cabeçalho `X-Conteudo-Cortado` da pré-visualização (JSON em base64 —
 *  o corpo da resposta é o PDF e os nomes dos campos trazem acentos). */
export function cortesDoCabecalho(header: string | null): Corte[] {
  if (!header) return [];
  try {
    const bytes = Uint8Array.from(atob(header), (ch) => ch.charCodeAt(0));
    return normalizaCortes(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return [];
  }
}

/** "Mood board «Cerimónia»: 3 fotos não entram no PDF". */
function fraseDeCorte(c: Corte): string {
  if (c.unit === "fotos") {
    return `${c.where}: ${c.dropped === 1 ? "1 foto não entra" : `${c.dropped} fotos não entram`} no PDF`;
  }
  return `${c.where}: ${c.dropped === 1 ? "1 linha cortada" : `${c.dropped} linhas cortadas`}`;
}

/**
 * A frase única do aviso, ou `null` quando o documento vai completo.
 *
 * As duas perdas aparecem JUNTAS porque, para quem vai carregar em "Enviar", o
 * problema é o mesmo — o documento vai incompleto — mas ficam DISTINTAS na
 * frase, porque a correcção não é a mesma: uma foto que não chegou tenta-se de
 * novo, um mood board com fotos a mais tem de perder fotos.
 */
export function avisoDeConteudoIncompleto(emFalta: number, cortes: Corte[]): string | null {
  const partes: string[] = [];
  if (emFalta > 0) {
    partes.push(
      emFalta === 1
        ? "1 foto não entrou (não foi possível ir buscá-la)"
        : `${emFalta} fotos não entraram (não foi possível ir buscá-las)`,
    );
  }
  for (const c of cortes) partes.push(fraseDeCorte(c));
  return partes.length ? partes.join("; ") : null;
}

interface Props {
  quote: Quote;
  onSent?: () => void;
  /**
   * O valor mudou aqui. O pai actualiza a sua cópia do pedido para o "Preço
   * final" da Gestão do pedido mostrar o mesmo número — porque é o MESMO
   * número: o estúdio grava-o no pedido, não guarda um segundo.
   */
  onQuoteUpdated?: (quote: Quote) => void;
}

export default function ProposalStudio({ quote, onSent, onQuoteUpdated }: Props) {
  const { toast } = useToast();
  const DRAFT_KEY = `liquen-proposal-studio-${quote.id}`;
  const SIDE_KEY = `${DRAFT_KEY}:meta`;

  const [doc, setDoc] = useState<StudioDoc>(() => initialDoc(quote));
  const [copiarAberto, setCopiarAberto] = useState(false);
  /**
   * Os campos que vieram de OUTRA proposta e ainda não foram confirmados.
   *
   * Depois de copiar, estes cinco são os únicos que mudam de casamento para
   * casamento — e são exactamente aqueles cujo erro só se descobre com o PDF
   * já enviado. Ficam marcados até ela lhes tocar.
   */
  const [porConfirmar, setPorConfirmar] = useState<Set<CampoAMudar>>(() => new Set());
  /** Caixa do nome, aberta pelo "Guardar como modelo" do cabeçalho. */
  const [nomeModelo, setNomeModelo] = useState<string | null>(null);
  /** Quando foi gravado — para o indicador discreto "Guardado às 14:32". */
  const [gravadoEm, setGravadoEm] = useState<Date | null>(null);
  /** Há alterações à espera do debounce? É o que o aviso de saída lê. */
  const [porGravar, setPorGravar] = useState(false);
  /**
   * O rascunho que o "Limpar" deitou fora, à espera de ser resgatado.
   *
   * Dez segundos e um botão, em vez de uma caixa de confirmação. A caixa
   * pergunta ANTES, quando ela ainda não viu o que ia perder, e a resposta
   * certa é quase sempre "sim" — por isso carrega-se sem ler. A anulação
   * pergunta DEPOIS, quando o ecrã já mostra o estrago.
   */
  const [limpo, setLimpo] = useState<{ doc: StudioDoc; total: string; segundos: number } | null>(
    null,
  );
  /**
   * Histórico para o Cmd+Z. Guardado num `ref` e não em estado: crescer o
   * histórico não pode redesenhar a página, ou escrever numa caixa de texto
   * passava a redesenhar o formulário inteiro a cada tecla.
   */
  const historico = useRef<StudioDoc[]>([]);
  /**
   * O que ela já escreveu antes, para não voltar a escrever.
   *
   * Sai das propostas anteriores em vez de um catálogo à parte: um catálogo
   * precisava de ser mantido, e um catálogo que ninguém mantém fica pior do
   * que não existir. O que ela usou é, por definição, o que ela usa.
   */
  const [sugestoes, setSugestoes] = useState<{ locais: string[]; planners: string[] }>({
    locais: [],
    planners: [],
  });
  // Free-typed mirror of the structured total, so pt-PT formatting ("3.000,00")
  // survives keystrokes. Parsed into `doc.totalAmount` (the money source of truth).
  const [totalInput, setTotalInput] = useState<string>("");
  // path → signed url, so freshly-uploaded images render as thumbnails.
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  // Foto NESTA proposta → foto da BIBLIOTECA de onde foi copiada.
  //
  // A importação copia os bytes para um uuid novo, por isso o caminho de
  // destino não guarda memória nenhuma da origem — e sem essa memória o
  // seletor não consegue dizer "esta já está nesta proposta", que é
  // exatamente o que evita o mesmo ramo de eucalipto duas vezes no mesmo mood
  // board. Vive no lado ("meta") do rascunho e não no documento: é auxiliar,
  // não vai para o PDF, e um rascunho antigo — que não o tem — abre na mesma,
  // apenas sem as marcas.
  const [themeOrigins, setThemeOrigins] = useState<Record<string, string>>({});
  const [refEdited, setRefEdited] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<null | "preview" | "send">(null);
  const [confirmSend, setConfirmSend] = useState(false);
  // Depois de um envio bem-sucedido, o formulário NÃO fica pronto a re-disparar:
  // mostra um estado de confirmação e exige uma escolha consciente para reenviar.
  const [sent, setSent] = useState(false);
  // Fluxo guiado: Conteúdo → Pré-visualizar → Enviar.
  const [step, setStep] = useState<Step>("conteudo");
  // Qual o destino das fotos escolhidas na biblioteca de temas (null = fechado).
  const [picker, setPicker] = useState<
    { kind: "board"; bi: number } | { kind: "cover"; idx: number } | null
  >(null);
  const hydrated = useRef(false);
  /** `updatedAt` do rascunho do servidor tal como o lemos — é com isto que o
   *  servidor deteta que alguém gravou por cima entretanto. */
  const serverStamp = useRef<string | null>(null);
  /** Já avisámos desta gravação cruzada? (uma vez chega; não a cada gravação) */
  const warnedOverwrite = useRef(false);

  // ── Restore draft on mount ──
  useEffect(() => {
    let hadDraft = false;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          hadDraft = true;
          // Rascunhos antigos guardaram a capa esparsa (`[null, "foto"]`) ou
          // curta (`["foto"]`) — normalizar já aqui mantém a foto da direita
          // na posição da direita.
          setDoc((d) => {
            const merged = { ...d, ...parsed };
            return { ...merged, coverImages: normaliseCoverImages(merged.coverImages) };
          });
          // A BASE, não o `totalAmount` cru — ver `baseDoDoc`.
          const base = baseDoDoc(parsed);
          if (base != null) setTotalInput(String(base));
        }
      }
      const rawMeta = localStorage.getItem(SIDE_KEY);
      if (rawMeta) {
        const meta = JSON.parse(rawMeta);
        if (meta?.urls && typeof meta.urls === "object") setAssetUrls(meta.urls);
        // Rascunhos guardados antes de isto existir não têm `themeOrigins` —
        // abrem na mesma, só sem as marcas de "já nesta proposta".
        if (meta?.themeOrigins && typeof meta.themeOrigins === "object") {
          setThemeOrigins(meta.themeOrigins);
        }
        if (typeof meta?.refEdited === "boolean") setRefEdited(meta.refEdited);
      }
    } catch {
      /* ignore corrupt draft */
    }
    // Só semeia defaults quando NÃO havia rascunho guardado — um rascunho
    // existente (mesmo sem grupos) nunca é sobrescrito.
    if (!hadDraft) {
      setDoc((d) => seedDefaults(d, quote));
    }

    // O VALOR é a excepção, e de propósito: vem SEMPRE do pedido, haja rascunho
    // ou não. Era aqui que os dois números se separavam — com rascunho, o
    // estúdio nunca mais olhava para o "Preço final", e uma alteração feita na
    // Gestão do pedido não chegava ao PDF.
    const doPedido = quote.quotedPrice;
    if (typeof doPedido === "number" && doPedido > 0) {
      precoEnviado.current = doPedido;
      setTotalInput(String(doPedido));
      setDoc((d) => aplicarBase(d, doPedido));
    } else if (hadDraft) {
      // O pedido ainda não tem preço mas o rascunho tem um valor escrito antes
      // de isto existir. Não se deita fora: adopta-se, e GRAVA-SE no pedido —
      // é o que faz os dois convergirem numa verdade só, em vez de escolher
      // uma e perder a outra.
      const daProposta = parseMoneyText(totalInput) || undefined;
      if (daProposta && daProposta > 0) persistirPreco(daProposta);
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── O rascunho que está no SERVIDOR ──
  // A cópia local abre primeiro (é instantânea e funciona sem rede); logo a
  // seguir vai-se buscar a do servidor e, se for mais recente, é essa que
  // vale. É isto que faz começar no portátil e continuar no tablet — e que
  // impede limpar o histórico de apagar trabalho.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const draft = data?.draft;
        if (!active || !draft?.doc || typeof draft.doc !== "object") return;
        serverStamp.current = typeof draft.updatedAt === "string" ? draft.updatedAt : null;

        let localStamp = 0;
        try {
          localStamp = Number(localStorage.getItem(`${DRAFT_KEY}:at`) ?? 0);
        } catch {
          /* localStorage indisponível — fica a valer a do servidor */
        }
        // A local só ganha se for MESMO mais recente; em empate vale a do
        // servidor, que é a que os outros dispositivos veem.
        if (localStamp > Date.parse(draft.updatedAt ?? 0)) return;
        setDoc((d) => {
          const merged = { ...d, ...(draft.doc as Partial<StudioDoc>) };
          return { ...merged, coverImages: normaliseCoverImages(merged.coverImages) };
        });
        const base = baseDoDoc(draft.doc as Partial<StudioDoc>);
        if (base != null) setTotalInput(String(base));
      } catch {
        /* sem rede: continua-se com a cópia local, como antes */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);

  // ── Hydrate signed URLs for images already in this draft ──
  // Fills in signed URLs for any image already used in the draft (covers / mood
  // boards) so thumbnails render even on a fresh device or after the cached URL
  // expired. Uploaded images are NOT offered back as a re-pickable gallery.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/orcamento/${quote.id}/assets`);
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const imgs: { path: string; url: string; thumbUrl?: string }[] = Array.isArray(data?.images)
          ? data.images
          : [];
        if (!alive || imgs.length === 0) return;
        setAssetUrls((prev) => {
          const next = { ...prev };
          // A miniatura ganha ao original: é este o caminho que corre quando se
          // REABRE uma proposta, que é onde a grelha mais pesa.
          for (const im of imgs)
            if (im.path && im.url && !next[im.path]) next[im.path] = im.thumbUrl || im.url;
          return next;
        });
      } catch {
        /* offline / storage unavailable — the studio still works with uploads */
      }
    })();
    return () => {
      alive = false;
    };
  }, [quote.id]);

  // ── Auto-compose the reference until the user overrides it ──
  useEffect(() => {
    if (refEdited) return;
    setDoc((d) => {
      const next = buildRef(d);
      return d.ref === next ? d : { ...d, ref: next };
    });
  }, [doc.template, doc.eventType, doc.clientNames, doc.eventDate, refEdited]);

  // ── Debounced draft persistence ──
  // Assim que o documento muda há trabalho por gravar. Volta a false quando a
  // gravação local acontece, oitocentos milissegundos depois.
  useEffect(() => {
    if (!hydrated.current) return;
    setPorGravar(true);
  }, [doc, assetUrls, themeOrigins, refEdited]);

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      // Uma fotografia para o Cmd+Z, tirada quando ela pára de escrever. Se
      // fosse a cada tecla, desfazer andava letra a letra e não servia para
      // nada; se fosse só nas remoções, não desfazia um texto trocado.
      const ultimo = historico.current[historico.current.length - 1];
      if (!ultimo || JSON.stringify(ultimo) !== JSON.stringify(doc)) {
        historico.current = [...historico.current, doc].slice(-MAX_HISTORICO);
      }
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
        localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
        localStorage.setItem(
          SIDE_KEY,
          JSON.stringify({ urls: assetUrls, themeOrigins, refEdited }),
        );
        setGravadoEm(new Date());
        setPorGravar(false);
      } catch {
        /* quota / unavailable — non-fatal */
      }
      // E no servidor, que é o que sobrevive à mudança de dispositivo. Falhar
      // aqui não interrompe o trabalho: a cópia local continua a valer e a
      // gravação seguinte tenta de novo.
      void (async () => {
        try {
          const res = await fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doc, baseUpdatedAt: serverStamp.current }),
          });
          if (!res.ok) return;
          const data = await res.json().catch(() => null);
          if (typeof data?.updatedAt === "string") serverStamp.current = data.updatedAt;
          // Alguém gravou entre a nossa leitura e esta escrita. A nossa versão
          // fica (a última vence), mas dizê-lo é o mínimo — desaparecer com o
          // trabalho de outra pessoa em silêncio, não.
          if (data?.overwrote && !warnedOverwrite.current) {
            warnedOverwrite.current = true;
            toast(
              data.previousBy
                ? `Este rascunho tinha sido alterado por ${data.previousBy} noutro sítio. Ficou a sua versão.`
                : "Este rascunho tinha sido alterado noutro sítio. Ficou a sua versão.",
              "info",
            );
          }
        } catch {
          /* offline — a cópia local guarda o trabalho até haver rede */
        }
      })();
    }, 800);
    return () => clearTimeout(t);
  }, [doc, assetUrls, themeOrigins, refEdited, DRAFT_KEY, SIDE_KEY, quote.id, toast]);

  const patch = (p: Partial<StudioDoc>) => setDoc((d) => ({ ...d, ...p }));

  // ── Total estruturado + IVA ──
  // O modo efetivo: explícito no doc, senão detetado a partir do texto livre
  // (retrocompatibilidade com propostas antigas só com "3.000,00 € + IVA").
  const vatMode: VatMode =
    doc.totalVatMode ?? detectVatMode(doc.totalText || doc.totalEstimatedText);

  /** Compõe o texto de DISPLAY do PDF a partir do valor + modo estruturados,
   *  no formato do estúdio ("3.000,00 € + IVA" ou "3.000,00 €"). */
  function composeTotalText(amount: number | undefined, mode: VatMode): string {
    if (amount == null || !(amount > 0)) return "";
    return mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
  }

  /** Escreve o valor + modo estruturados e sincroniza o texto de display do
   *  template ativo (totalText p/ Decoração, totalEstimatedText p/ Organização). */
  function writeTotal(amount: number | undefined, mode: VatMode) {
    const text = composeTotalText(amount, mode);
    patch(
      doc.template === "organizacao"
        ? { totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
        : { totalAmount: amount, totalVatMode: mode, totalText: text },
    );
  }

  /**
   * O VALOR É UM SÓ, e é o "Preço final (sem IVA)" do pedido.
   *
   * ── O que estava errado ─────────────────────────────────────────────────
   * Havia duas caixas com o mesmo número: aqui e na Gestão do pedido. Pior do
   * que duplicado — podiam DISCORDAR. O estúdio só copiava o preço do pedido
   * quando ainda não havia rascunho (ver `seedDefaults`), e a partir daí
   * alterar o preço na Gestão do pedido não mexia aqui. O PDF seguia para o
   * cliente com o valor antigo, e nada no ecrã o dizia.
   *
   * Agora escrever aqui GRAVA no pedido, e uma alteração feita na Gestão do
   * pedido aparece aqui. É o mesmo número, visto de dois sítios.
   *
   * ── E o IVA ─────────────────────────────────────────────────────────────
   * O número partilhado é sempre a BASE, sem IVA — é o que o pedido diz que é.
   * O modo de IVA muda o que o PDF MOSTRA (e portanto o que o cliente paga),
   * e o `totalAmount` do documento é derivado da base: em "acrescer" é a
   * própria base, em "incluído" é a base já com o IVA somado, porque é assim
   * que `resolveProposalMoney` o lê. Em qualquer dos modos a base continua a
   * ser o número do pedido, que é o que o rótulo "(sem IVA)" promete.
   */
  function amountParaBase(base: number, mode: VatMode): number {
    return mode === "acrescer" ? base : Math.round(base * (1 + money.vatRate) * 100) / 100;
  }

  /** O que se grava no pedido, com a mão travada: escrever "3000" são quatro
   *  teclas e não podem ser quatro gravações. */
  const gravarPreco = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O último valor que ESTE ecrã mandou gravar — para a resposta que volta do
   *  servidor não disparar outra vez a sincronização e entrar em ciclo. */
  const precoEnviado = useRef<number | undefined>(quote.quotedPrice);

  function persistirPreco(base: number | undefined) {
    precoEnviado.current = base;
    if (gravarPreco.current) clearTimeout(gravarPreco.current);
    gravarPreco.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orcamento/${quote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // `null` e não `undefined`: apagar o preço tem de chegar ao servidor,
          // e `undefined` desaparece no JSON (o merge parcial mantinha o
          // valor antigo). É a mesma razão que está escrita na Gestão do pedido.
          body: JSON.stringify({ quotedPrice: base ?? null }),
        });
        if (!res.ok) throw new Error("falhou");
        const atualizado: Quote = await res.json();
        onQuoteUpdated?.(atualizado);
      } catch {
        // Não interrompe a escrita da proposta: o valor fica no ecrã e no
        // rascunho, e a gravação seguinte volta a tentar. Avisar a cada tecla
        // seria pior do que o problema.
      }
    }, 600);
  }

  function onTotalInput(raw: string) {
    setTotalInput(raw);
    const base = raw.trim() === "" ? undefined : parseMoneyText(raw);
    writeTotal(base == null ? undefined : amountParaBase(base, vatMode), vatMode);
    persistirPreco(base);
  }

  function setVatMode(mode: VatMode) {
    // A base não muda ao trocar de modo — muda o que o cliente vê. O valor do
    // documento é recalculado a partir da mesma base.
    const base = parseMoneyText(totalInput);
    writeTotal(base > 0 ? amountParaBase(base, mode) : undefined, mode);
  }

  // Split 30/70 sobre o BRUTO — o que o estúdio vê é o que será faturado.
  const money = resolveProposalMoney(doc);
  // A percentagem do sinal é do DOCUMENTO, e é a mesma que as rotas de
  // facturação leem quando emitem o sinal e o saldo (ver `depositPercentOf`).
  // Sem isso, a proposta dizia 40% e a factura saía a 30% — que é pior do que
  // não a poder mudar de todo.
  const pctSinal = depositPercentOf(doc as ProposalDoc);
  const split = splitSinal(money.gross, pctSinal);
  // A soma das linhas e o desvio do total escrito à mão. Os dois vivem aqui em
  // cima porque são lidos em três sítios: ao lado das linhas, no aviso junto ao
  // total, e na barra fixa do fundo.
  const soma = somaDosItens(doc);
  const desvio = desalinhamento(doc, money.base);
  const duasFormas = asDuasFormas(money.base, doc.vatRate ?? DEFAULT_VAT_RATE);

  // ── O preço mudou na Gestão do pedido: aparece aqui ─────────────────────
  // O outro sentido do mesmo número. Sem isto voltava a haver duas verdades:
  // alterar o "Preço final" no pedido não mexia no estúdio, e o PDF saía com o
  // valor antigo.
  //
  // `precoEnviado` evita o ciclo: quando a mudança veio DAQUI, o valor que
  // volta é o que acabámos de mandar e não há nada a fazer.
  useEffect(() => {
    if (!hydrated.current) return;
    const doPedido = quote.quotedPrice;
    if (doPedido === precoEnviado.current) return;
    precoEnviado.current = doPedido;
    setTotalInput(typeof doPedido === "number" && doPedido > 0 ? String(doPedido) : "");
    setDoc((d) => {
      const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
      const amount =
        typeof doPedido === "number" && doPedido > 0
          ? mode === "acrescer"
            ? doPedido
            : Math.round(doPedido * (1 + (d.vatRate ?? DEFAULT_VAT_RATE)) * 100) / 100
          : undefined;
      const text = amount == null ? "" : mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
      return d.template === "organizacao"
        ? { ...d, totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
        : { ...d, totalAmount: amount, totalVatMode: mode, totalText: text };
    });
  }, [quote.quotedPrice]);

  function setTemplate(t: "decoracao" | "organizacao") {
    setDoc((d) => {
      // Recompõe o texto de display do total para o campo do template ativo, para
      // que o PDF nunca fique com o total em branco após uma troca de template.
      const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
      const text = composeTotalText(d.totalAmount, mode);
      return {
        ...d,
        template: t,
        headerTitle:
          t === "organizacao" ? "Proposta de orçamento para Organização de Casamento" : undefined,
        ...(t === "organizacao" ? { totalEstimatedText: text } : { totalText: text }),
      };
    });
  }

  /**
   * Cmd/Ctrl+Z — volta ao documento anterior.
   *
   * O último elemento do histórico É o documento actual (foi lá posto pela
   * gravação); por isso desfazer tira DOIS e usa o penúltimo.
   */
  function desfazer(): boolean {
    if (historico.current.length < 2) return false;
    const anterior = historico.current[historico.current.length - 2];
    historico.current = historico.current.slice(0, -1);
    setDoc(anterior);
    // O campo do total é estado à parte (aceita texto a meio de ser escrito),
    // por isso tem de acompanhar — senão desfazer devolvia o documento antigo
    // e deixava o valor novo na caixa.
    const base = baseDoDoc(anterior);
    setTotalInput(base === undefined ? "" : String(base));
    return true;
  }

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      // Dentro de uma caixa de texto, o Cmd+Z do browser desfaz a escrita —
      // que é o que ela espera. Só se assume o comando fora dos campos, ou
      // quando o browser já não tem nada para desfazer nesse campo.
      const alvo = e.target as HTMLElement | null;
      const aEscrever =
        alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (aEscrever) return;
      if (desfazer()) {
        e.preventDefault();
        toast("Desfeito.", "info");
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  // ── Aviso ao sair com trabalho por gravar ─────────────────────────────
  // A janela é estreita (a gravação é a 800ms), mas existe: fechar o
  // separador logo a seguir a escrever perdia essas últimas palavras.
  useEffect(() => {
    if (!porGravar) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [porGravar]);

  // ── A contagem dos dez segundos para anular a limpeza ─────────────────
  useEffect(() => {
    if (!limpo) return;
    if (limpo.segundos <= 0) {
      setLimpo(null);
      return;
    }
    const t = setTimeout(
      () => setLimpo((l) => (l ? { ...l, segundos: l.segundos - 1 } : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [limpo]);

  /** Devolve o rascunho que o "Limpar" deitou fora. */
  function anularLimpeza() {
    if (!limpo) return;
    setDoc(limpo.doc);
    setTotalInput(limpo.total);
    setLimpo(null);
    toast("Rascunho reposto.", "success");
  }

  function clearDraft() {
    // Sem caixa de confirmação: guarda-se o que estava e dá-se dez segundos
    // para o trazer de volta. Ver a razão em `limpo`, mais acima.
    setLimpo({ doc, total: totalInput, segundos: 10 });
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(`${DRAFT_KEY}:at`);
      localStorage.removeItem(SIDE_KEY);
    } catch {
      /* ignore */
    }
    // E no servidor — senão o rascunho limpo aqui reaparecia no dispositivo
    // seguinte, que é precisamente o que guardá-lo lá veio resolver.
    serverStamp.current = null;
    warnedOverwrite.current = false;
    void fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, { method: "DELETE" }).catch(() => {
      /* sem rede: fica para a próxima limpeza; nada se perde por isso */
    });
    setDoc(seedDefaults(initialDoc(quote), quote));
    setTotalInput(
      typeof quote.quotedPrice === "number" && quote.quotedPrice > 0
        ? String(quote.quotedPrice)
        : "",
    );
    setAssetUrls({});
    setThemeOrigins({});
    setRefEdited(false);
    setConfirmSend(false);
    setSent(false);
    setStep("conteudo");
    toast("Rascunho limpo", "info");
  }

  // ── Image upload ──
  // Uma imagem por pedido: um lote inteiro num só POST rebentava o limite de
  // corpo do alojamento (~4,5 MB) com fotos reais de telemóvel — o upload
  // "às vezes não funcionava". Cada ficheiro é comprimido no navegador
  // (image-prep) e enviado individualmente, com uma repetição automática em
  // falha de rede; um ficheiro mau nunca deita fora os restantes.
  async function uploadOne(
    file: File,
    thumb: File | null,
  ): Promise<{ path: string; url: string; thumbUrl?: string }> {
    const post = () => {
      const form = new FormData();
      form.append("files", file);
      // A miniatura viaja ao lado do original, no mesmo pedido: sai da MESMA
      // descodificação que já se fez para encolher a foto, portanto não custa
      // tempo nenhum, e ~30–60 KB não se notam ao lado de uma foto de 2 MB.
      // Sem ela, a grelha voltava a puxar 1130 KB por célula para desenhar
      // 174 px (medido em IMAGES-BEFORE.md).
      if (thumb) form.append("thumbs", thumb);
      return fetch(`/api/orcamento/${quote.id}/assets`, { method: "POST", body: form });
    };
    let res: Response;
    try {
      res = await post();
    } catch {
      // Soluço de rede — tenta uma segunda vez antes de desistir.
      res = await post();
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        data?.error ||
          (res.status === 413
            ? "Imagem demasiado grande para envio."
            : "Falha ao carregar a imagem."),
      );
    }
    const im: { path: string; url: string; thumbUrl?: string } | undefined = data?.images?.[0];
    if (!im) throw new Error("Falha ao carregar a imagem.");
    // A grelha desenha pela miniatura quando existe; o original fica para o
    // detalhe e para o PDF.
    setAssetUrls((prev) => ({ ...prev, [im.path]: im.thumbUrl || im.url }));
    return im;
  }

  async function handleUpload(key: string, files: File[], onPaths: (paths: string[]) => void) {
    if (files.length === 0) return;
    setUploading((u) => ({ ...u, [key]: true }));
    // Cover photos print large (the document's hero) so they keep more pixels and
    // a higher JPEG quality; mood-board photos render as small collage cells and
    // use a tighter cap. The upload key encodes which is which ("cover-…"/"board-…").
    const kind: ImageKind = key.startsWith("board-") ? "board" : "cover";
    // Preparar e enviar em VIAS PARALELAS. Em sequência, o processador ficava
    // parado à espera da rede e a rede parada à espera do processador; assim a
    // foto N+1 é preparada enquanto a N sobe. A preparação em si já corre fora
    // do fio principal (image-prep → image-worker), por isso a interface
    // continua a responder durante o lote.
    const results: ({ path: string } | null)[] = new Array(files.length).fill(null);
    const errors: string[] = [];
    let next = 0;
    async function lane() {
      for (;;) {
        const i = next++;
        if (i >= files.length) return;
        const f = files[i];
        try {
          const prepared = await prepareImageWithThumb(f, kind);
          const im = await uploadOne(prepared.file, prepared.thumb);
          // Guardado pelo ÍNDICE: as vias acabam fora de ordem e a ordem das
          // fotos escolhidas é a que a Catarina vê no documento.
          results[i] = { path: im.path };
        } catch (e) {
          errors.push(e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`);
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, lane));
      const paths = results.filter((r): r is { path: string } => r !== null).map((r) => r.path);
      if (paths.length > 0) onPaths(paths);
      if (errors.length > 0) {
        toast(
          errors.length === files.length
            ? errors[0]
            : `${paths.length} de ${files.length} carregadas. ${errors[0]}`,
          "error",
        );
      } else if (paths.length > 1) {
        toast(`${paths.length} imagens carregadas`, "success");
      }
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  }

  // ── Biblioteca de temas ──
  //
  /** As fotos da biblioteca que já estão nesta proposta, para o seletor as
   *  marcar. Sai do DOCUMENTO (capas + mood boards) e não do mapa de origens:
   *  uma foto removida do rascunho deixa de contar no instante em que é
   *  removida, mesmo que a origem fique lá guardada. */
  const usedThemePaths = useMemo(() => {
    if (!picker) return [];
    const inDoc = new Set<string>();
    for (const p of doc.coverImages ?? []) if (p) inDoc.add(p);
    for (const b of doc.moodBoards) for (const p of b.images) inDoc.add(p);
    const sources: string[] = [];
    for (const p of inDoc) {
      const from = themeOrigins[p];
      if (from) sources.push(from);
    }
    return sources;
  }, [picker, doc.coverImages, doc.moodBoards, themeOrigins]);

  // As fotos escolhidas já vêm COPIADAS para a pasta desta proposta pela rota
  // /assets/importar, com os mesmos `path` que um carregamento manual daria —
  // por isso entram no rascunho exatamente pelo mesmo caminho.
  //
  // O seletor entrega as fotos LOTE A LOTE (é assim que a barra de progresso
  // pode ser verdadeira), por isso isto corre várias vezes por importação —
  // tudo o que faz é acrescentar, nunca substituir.
  function onPickedFromLibrary(images: ImportedImage[]) {
    if (images.length === 0) return;
    setAssetUrls((prev) => {
      const next = { ...prev };
      // A miniatura do TEMA viaja com a foto na cópia (ver
      // `copiarMiniaturaParaProposta`), portanto uma foto escolhida da
      // Biblioteca chega à grelha já leve.
      for (const im of images) if (im.path && im.url) next[im.path] = im.thumbUrl || im.url;
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const im of images) if (im.path && im.sourcePath) next[im.path] = im.sourcePath;
      return next;
    });
    if (picker?.kind === "board") {
      addBoardImages(
        picker.bi,
        images.map((im) => im.path),
      );
    } else if (picker?.kind === "cover") {
      setCoverAt(picker.idx, images[0].path);
    }
  }

  // ── Service groups ──
  function addGroup() {
    setDoc((d) => ({
      ...d,
      serviceGroups: [
        ...d.serviceGroups,
        { letter: `${LETTERS[d.serviceGroups.length] ?? ""})`, title: "", items: [] },
      ],
    }));
  }
  function updateGroup(gi: number, p: Partial<StudioDoc["serviceGroups"][number]>) {
    setDoc((d) => ({
      ...d,
      serviceGroups: d.serviceGroups.map((g, i) => (i === gi ? { ...g, ...p } : g)),
    }));
  }
  function removeGroup(gi: number) {
    setDoc((d) => ({ ...d, serviceGroups: d.serviceGroups.filter((_, i) => i !== gi) }));
  }
  function moveGroup(gi: number, dir: -1 | 1) {
    setDoc((d) => ({ ...d, serviceGroups: move(d.serviceGroups, gi, dir) }));
  }
  function addServiceItem(gi: number) {
    setDoc((d) => ({
      ...d,
      serviceGroups: d.serviceGroups.map((g, i) =>
        i === gi ? { ...g, items: [...g.items, { label: "", desc: "" }] } : g,
      ),
    }));
  }
  function updateServiceItem(gi: number, ii: number, p: Partial<{ label: string; desc: string }>) {
    setDoc((d) => ({
      ...d,
      serviceGroups: d.serviceGroups.map((g, i) =>
        i === gi ? { ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...p } : it)) } : g,
      ),
    }));
  }
  function removeServiceItem(gi: number, ii: number) {
    setDoc((d) => ({
      ...d,
      serviceGroups: d.serviceGroups.map((g, i) =>
        i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g,
      ),
    }));
  }

  // ── Mood boards (decoracao) ──
  function addBoard() {
    setDoc((d) => ({
      ...d,
      moodBoards: [...d.moodBoards, { title: "", annotation: "", images: [] }],
    }));
  }
  function updateBoard(bi: number, p: Partial<StudioDoc["moodBoards"][number]>) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => (i === bi ? { ...b, ...p } : b)),
    }));
  }
  function removeBoard(bi: number) {
    setDoc((d) => ({ ...d, moodBoards: d.moodBoards.filter((_, i) => i !== bi) }));
  }
  function moveBoard(bi: number, dir: -1 | 1) {
    setDoc((d) => ({ ...d, moodBoards: move(d.moodBoards, bi, dir) }));
  }
  function addBoardImages(bi: number, paths: string[]) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, images: [...b.images, ...paths] } : b,
      ),
    }));
    // AVISAR AQUI, e não só depois de gerar o PDF. Quem põe a sétima foto num
    // mood board fica a saber nesse instante — e não quando o documento já
    // seguiu (ou nem isso, que era o que acontecia). O cartão do mood board
    // fica também com a marca permanente, para o aviso não se perder com o
    // toast: ver `MOOD_BOARD_MAX_IMAGES` mais abaixo, na grelha de fotos.
    const total = (doc.moodBoards[bi]?.images.length ?? 0) + paths.length;
    if (total > MOOD_BOARD_MAX_IMAGES) {
      const sobra = total - MOOD_BOARD_MAX_IMAGES;
      toast(
        `Este mood board fica com ${total} fotos e a página do PDF mostra ${MOOD_BOARD_MAX_IMAGES}: ` +
          `${sobra === 1 ? "a última não entra" : `as últimas ${sobra} não entram`}. ` +
          "Remova fotos ou crie outro mood board.",
        "error",
      );
    }
  }
  function removeBoardImage(bi: number, path: string) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, images: b.images.filter((p) => p !== path) } : b,
      ),
    }));
  }

  // ── Cover images (two slots) ──
  // A capa tem DUAS posições fixas: a 0 imprime à esquerda do painel do
  // logótipo, a 1 à direita. Escrever na posição (em vez de compactar a lista)
  // é o que garante que a foto escolhida para a direita sai à direita.
  function setCoverAt(idx: number, path: string) {
    setDoc((d) => {
      const cover = normaliseCoverImages(d.coverImages);
      cover[idx] = path;
      return { ...d, coverImages: cover };
    });
  }
  function removeCoverAt(idx: number) {
    setCoverAt(idx, "");
  }

  // ── Cronograma (organizacao) ──
  function addPhase() {
    setDoc((d) => ({ ...d, cronograma: [...(d.cronograma ?? []), { title: "", items: [] }] }));
  }
  function updatePhase(pi: number, p: Partial<{ title: string; items: string[] }>) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) => (i === pi ? { ...ph, ...p } : ph)),
    }));
  }
  function removePhase(pi: number) {
    setDoc((d) => ({ ...d, cronograma: (d.cronograma ?? []).filter((_, i) => i !== pi) }));
  }
  function movePhase(pi: number, dir: -1 | 1) {
    setDoc((d) => ({ ...d, cronograma: move(d.cronograma ?? [], pi, dir) }));
  }
  function addPhaseItem(pi: number) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: [...ph.items, ""] } : ph,
      ),
    }));
  }
  function updatePhaseItem(pi: number, ii: number, value: string) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: ph.items.map((it, j) => (j === ii ? value : it)) } : ph,
      ),
    }));
  }
  function removePhaseItem(pi: number, ii: number) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: ph.items.filter((_, j) => j !== ii) } : ph,
      ),
    }));
  }

  // ── Budget: decoracao (grouped) ──
  // Tudo passa pelos ajudantes de `proposal-budget`: os nomes e os preços são
  // dois arrays paralelos, e mexer num sem mexer no outro faz os preços
  // deslizarem uma posição — o preço da cerimónia acabaria no ramo da noiva,
  // sem nada a assinalar.
  function addBudgetItem() {
    setDoc((d) => adicionarLinha(d));
  }
  function updateBudgetItem(i: number, value: string) {
    setDoc((d) => definirItem(d, i, value));
  }
  function removeBudgetItem(i: number) {
    setDoc((d) => removerLinha(d, i));
  }
  function updateBudgetPrice(i: number, texto: string) {
    setDoc((d) => definirPreco(d, i, normalizarValor(texto)));
  }

  // ── Budget extras: linhas adicionais (Deslocação, Coordenação, Tecidos…) ──
  function addBudgetExtra() {
    setDoc((d) => ({
      ...d,
      budgetExtras: [...(d.budgetExtras ?? []), { label: "", valueText: "" }],
    }));
  }
  function updateBudgetExtra(i: number, p: Partial<{ label: string; valueText: string }>) {
    setDoc((d) => ({
      ...d,
      budgetExtras: (d.budgetExtras ?? []).map((r, j) => (j === i ? { ...r, ...p } : r)),
    }));
  }
  function removeBudgetExtra(i: number) {
    setDoc((d) => ({ ...d, budgetExtras: (d.budgetExtras ?? []).filter((_, j) => j !== i) }));
  }

  // ── Budget: organizacao (per-item rows) ──
  function addBudgetRow() {
    setDoc((d) => ({ ...d, budgetRows: [...(d.budgetRows ?? []), { item: "", price: "" }] }));
  }
  function updateBudgetRow(i: number, p: Partial<{ item: string; price: string }>) {
    setDoc((d) => ({
      ...d,
      budgetRows: (d.budgetRows ?? []).map((r, j) => (j === i ? { ...r, ...p } : r)),
    }));
  }
  function removeBudgetRow(i: number) {
    setDoc((d) => ({ ...d, budgetRows: (d.budgetRows ?? []).filter((_, j) => j !== i) }));
  }

  // ── Actions ──
  async function preview() {
    if (busy) return;
    setBusy("preview");
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/proposta-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", doc }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Não foi possível gerar a pré-visualização.");
      }
      const blob = await res.blob();
      // Descarregar o PDF (anexo) em vez de abrir numa aba nova: a CSP do site
      // (object-src 'none', sem frame-src) bloqueia mostrar um blob:PDF numa aba
      // ou iframe, o que fazia "não acontecer nada". Um download nunca é
      // bloqueado e abre no leitor de PDF do dispositivo.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposta-${quote.name || quote.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      // O gerador SALTA a foto que não consegue ir buscar E CORTA o que não
      // cabe no desenho, por isso um PDF incompleto sai na mesma, com ar de
      // estar bem. Sem este aviso, a primeira pessoa a dar pela falta era o
      // cliente. O servidor conta as duas coisas e devolve-as nos cabeçalhos.
      const emFalta = Number(res.headers.get("X-Fotos-Em-Falta") ?? "0");
      const cortes = cortesDoCabecalho(res.headers.get("X-Conteudo-Cortado"));
      const aviso = avisoDeConteudoIncompleto(emFalta, cortes);
      if (aviso) {
        toast(`PDF gerado, mas ${aviso}. Verifique antes de enviar.`, "error");
      } else {
        toast("Pré-visualização gerada (PDF descarregado)", "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro na pré-visualização.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (busy) return;
    setBusy("send");
    setConfirmSend(false);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/proposta-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "send", doc }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Não foi possível enviar a proposta.");
      // A proposta ficou guardada em qualquer caso; a mensagem distingue enviada
      // por email vs guardada-mas-sem-email, para a equipa saber o que fazer.
      // O DOCUMENTO INCOMPLETO É O AVISO MAIS IMPORTANTE DOS TRÊS, por isso é o
      // que fica no ecrã. Uma proposta que seguiu para o noivo com fotos a
      // menos é o problema que originou esta contagem; saber que o email saiu
      // é secundário quando o documento que ele leva está incompleto.
      const emFalta = Number(data?.missingImages ?? 0);
      const aviso = avisoDeConteudoIncompleto(emFalta, normalizaCortes(data?.truncations));
      if (aviso) {
        toast(`No PDF que seguiu, ${aviso}. Verifique a proposta e reenvie.`, "error");
      } else if (data?.emailed) {
        toast("Proposta enviada ao cliente", "success");
      } else {
        toast(data?.emailError || "Proposta gerada (email não enviado)", "info");
      }
      // Trava contra reenvio acidental: o passo Enviar passa a mostrar a
      // confirmação "Proposta enviada ✓" em vez do botão pronto a disparar.
      setSent(true);
      onSent?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao enviar a proposta.", "error");
    } finally {
      setBusy(null);
    }
  }

  // Sugestões e a validade por omissão. Uma leitura só, ao abrir; se falhar,
  // o estúdio funciona como antes — nenhuma destas coisas é indispensável.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch("/api/propostas?resumo=1").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/propostas/preferencias").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([lista, prefs]) => {
        if (!vivo) return;
        const unicos = (vals: unknown[]) =>
          [...new Set(vals.map((v) => String(v ?? "").trim()).filter(Boolean))].sort();
        if (Array.isArray(lista)) {
          setSugestoes({
            locais: unicos(lista.map((p: { location?: string }) => p.location)),
            planners: unicos(lista.map((p: { weddingPlanners?: string }) => p.weddingPlanners)),
          });
        }
        // A validade só se aplica a um documento que ainda NÃO tem uma: mexer
        // numa proposta já escrita porque a política mudou seria alterar-lhe
        // as condições nas costas de quem a escreveu.
        const dias = Number(prefs?.validUntilDays);
        if (Number.isFinite(dias) && dias > 0) {
          setDoc((d) => (d.validUntilDays ? d : { ...d, validUntilDays: dias }));
        }
      })
      .catch(() => {
        /* sem sugestões e com a validade de sempre */
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** O documento copiado passa a ser este, com os campos a confirmar marcados. */
  function aplicarCopia(e: Escolha) {
    setDoc(e.doc as StudioDoc);
    setPorConfirmar(new Set(e.camposAMudar));
    // O título interno volta a gerar-se sozinho: a cópia esvaziou-o de
    // propósito para não ficar com o nome do casal anterior no cabeçalho.
    setRefEdited(false);
    const partilha =
      e.fotosPartilhadas > 0
        ? ` ${e.fotosPartilhadas} foto(s) ficaram na pasta da proposta antiga.`
        : "";
    toast(
      `Copiado de ${e.nomeDaOrigem}. Confirme o que está marcado.${partilha}`,
      e.fotosPartilhadas > 0 ? "error" : "success",
    );
  }

  /**
   * O realce de um campo por confirmar, e a forma de o desmarcar.
   *
   * Laranja e não verde: é um AVISO de coisa por rever, não uma acção. O
   * `DESIGN-TOKENS.md` fixa esta regra para a página toda.
   */
  const realce = (campo: CampoAMudar) =>
    porConfirmar.has(campo)
      ? "rounded-lg ring-2 ring-[#c98a2e]/45 ring-offset-2 ring-offset-background"
      : undefined;
  const confirmado = (campo: CampoAMudar) => {
    // Tocar-lhe É a confirmação. Um botão "confirmar" ao lado de cada campo
    // seria mais um clique para dizer o que o gesto já disse.
    setPorConfirmar((atual) => {
      if (!atual.has(campo)) return atual;
      const proximo = new Set(atual);
      proximo.delete(campo);
      return proximo;
    });
  };

  /**
   * A validade desta proposta passa a ser a de todas as novas.
   *
   * A missão pede um valor por omissão «configurável», e a forma mais barata
   * de o configurar é a partir do sítio onde ela já está a decidir o número —
   * em vez de um ecrã de definições que é preciso ir procurar.
   */
  async function guardarValidadePadrao(dias: number) {
    try {
      const r = await fetch("/api/propostas/preferencias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validUntilDays: dias }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar.");
      toast(`As propostas novas passam a valer ${dias} dias.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para guardar.", "error");
    }
  }

  /** Guarda ESTA proposta como modelo reutilizável, com o nome que ela der. */
  async function guardarComoModelo(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      const r = await fetch("/api/propostas/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O documento vai TAL COMO ESTÁ, com o nome e a data deste casal lá
        // dentro. Não faz mal: quem o usar passa pelo `copiarParaPedido`, que
        // é o mesmo caminho de qualquer proposta anterior e substitui tudo o
        // que é de outra pessoa. Limpar aqui seria uma segunda regra a poder
        // discordar da primeira.
        body: JSON.stringify({ nome: limpo, tipo: "completo", doc, origem: doc.clientNames }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar o modelo.");
      setNomeModelo(null);
      toast(`Modelo «${limpo}» guardado.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para guardar o modelo.", "error");
    }
  }

  const isDeco = doc.template !== "organizacao";
  // O botão e o aviso lateral leem a MESMA lista, de propósito: escritos cada
  // um à sua maneira, mais cedo ou mais tarde discordavam — o aviso dizia que
  // faltava o valor e o botão deixava enviar na mesma. A regra (e a razão de
  // cada exigência) está em `proposal-progress.ts`.
  const seccoes = estadoDasSeccoes(doc as ProposalDoc);
  const faltas = oQueFaltaParaEnviar(doc as ProposalDoc, money.gross);
  const canSend = podeEnviar(doc as ProposalDoc, money.gross);

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="bo-eyebrow">Estúdio de propostas (PDF)</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/55">
            Monte aqui a proposta em PDF para o cliente. Preencha de cima para baixo; pode
            pré-visualizar antes de enviar.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* A acção principal desta secção: quase todas as propostas são uma
              variação de uma anterior. É a única aqui a verde. */}
          <Button size="sm" onClick={() => setCopiarAberto(true)}>
            Criar a partir de…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNomeModelo(doc.eventType || "")}>
            Guardar como modelo
          </Button>
          <Button variant="ghost" size="sm" onClick={clearDraft}>
            Limpar rascunho
          </Button>
        </div>
      </div>

      {limpo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2">
          <span className="text-xs text-foreground/70">
            Rascunho limpo. Pode anular durante {limpo.segundos}s.
          </span>
          <button
            type="button"
            className="text-xs font-medium text-[#4d6350] underline-offset-2 hover:underline"
            onClick={anularLimpeza}
          >
            Anular
          </button>
        </div>
      )}

      {nomeModelo !== null && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
          <label className="flex-1 min-w-[14rem]">
            <span className="bo-eyebrow">Nome do modelo</span>
            <input
              autoFocus
              value={nomeModelo}
              onChange={(e) => setNomeModelo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardarComoModelo(nomeModelo);
                if (e.key === "Escape") setNomeModelo(null);
              }}
              placeholder="Casamento standard"
              className="bo-input mt-1 w-full px-3 py-2 text-sm"
            />
          </label>
          <Button
            size="sm"
            disabled={!nomeModelo.trim()}
            onClick={() => void guardarComoModelo(nomeModelo)}
          >
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNomeModelo(null)}>
            Cancelar
          </Button>
        </div>
      )}

      <CriarAPartirDe
        open={copiarAberto}
        onClose={() => setCopiarAberto(false)}
        quoteId={quote.id}
        clienteAtual={quote.name ?? ""}
        onEscolhido={aplicarCopia}
        toast={toast}
      />

      {/* Passos do fluxo — sempre visível, dá o sentido de "onde estou / o que
          fazer a seguir". Clicável para saltar entre passos. */}
      <StepNav step={step} onSelect={setStep} sent={sent} />

      {/* ══════════ PASSO 1 · Conteúdo ══════════ */}
      {/* `pb-20`: a barra do fundo é `sticky`, e sem folga por baixo do
          conteúdo ela desenha-se POR CIMA do último campo. Estava a tapar o
          "Título interno" antes desta missão (ficou anotado na Fase 0) e, com
          o total lá dentro, passou a tapar o "Valor (sem IVA)" — logo o campo
          que a barra existe para acompanhar. */}
      <div hidden={step !== "conteudo"} className="flex gap-6 pb-20">
        <NavEstudio seccoes={seccoes} faltas={faltas} />
        <div className="min-w-0 flex-1">
          {/* Template selector */}
          <div className="mb-4">
            <Segmented
              ariaLabel="Modelo da proposta"
              value={isDeco ? "decoracao" : "organizacao"}
              onChange={setTemplate}
              options={[
                { value: "decoracao", label: "Decoração" },
                { value: "organizacao", label: "Organização" },
              ]}
            />
          </div>

          {/* Event fields */}
          <Section title="Evento" id="evento">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Clientes"
                value={doc.clientNames}
                onChange={(e) => {
                  confirmado("clientNames");
                  patch({ clientNames: e.target.value });
                }}
                containerClassName={realce("clientNames")}
                placeholder="Maria & Zé"
              />
              <Field
                label="Tipo de evento"
                value={doc.eventType}
                onChange={(e) => patch({ eventType: e.target.value })}
                placeholder="Casamento"
              />
              <Field
                label="Data"
                value={doc.eventDate}
                onChange={(e) => {
                  confirmado("eventDate");
                  patch({ eventDate: e.target.value });
                }}
                containerClassName={realce("eventDate")}
                placeholder="12 de setembro de 2026"
              />
              <Field
                label="Local"
                list="sug-locais"
                value={doc.location}
                onChange={(e) => {
                  confirmado("location");
                  patch({ location: e.target.value });
                }}
                containerClassName={realce("location")}
                placeholder="Monte da Oliveirinha, Évora"
              />
              <Field
                label="Convidados"
                value={doc.guests}
                onChange={(e) => {
                  confirmado("guests");
                  patch({ guests: e.target.value });
                }}
                containerClassName={realce("guests")}
                placeholder="150 pax"
              />
              {isDeco && (
                <>
                  <Field
                    label="Cerimónia"
                    value={doc.ceremony ?? ""}
                    onChange={(e) => patch({ ceremony: e.target.value })}
                    placeholder="Civil, simbólica"
                  />
                  <Field
                    label="Hora"
                    value={doc.time ?? ""}
                    onChange={(e) => patch({ time: e.target.value })}
                    placeholder="A definir"
                  />
                  <Field
                    label="Wedding Planners (opcional)"
                    list="sug-planners"
                    value={doc.weddingPlanners ?? ""}
                    onChange={(e) => patch({ weddingPlanners: e.target.value })}
                    placeholder="Equipa AMARA"
                  />
                </>
              )}
            </div>

            {/* As sugestões. `datalist` e não um `select`: ela TEM de poder
                escrever um espaço novo — a lista ajuda, não fecha a porta. */}
            <datalist id="sug-locais">
              {sugestoes.locais.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <datalist id="sug-planners">
              {sugestoes.planners.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>

            {/* Reference (advanced) */}
            <div className="mt-4">
              {refEdited && (
                <div className="mb-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setRefEdited(false);
                      setDoc((d) => ({ ...d, ref: buildRef(d) }));
                    }}
                    className={ADD_BTN}
                  >
                    ↺ Automática
                  </button>
                </div>
              )}
              <Field
                label="Título interno (opcional)"
                value={doc.ref}
                onChange={(e) => {
                  setRefEdited(true);
                  patch({ ref: e.target.value });
                }}
                hint="sobretudo para uso interno; aparece apenas em letra pequena no topo de cada página da proposta."
              />
            </div>
          </Section>

          {/* Cover images */}
          <Section title="Imagens de capa (2)" id="capas">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((idx) => {
                const path = doc.coverImages?.[idx];
                return (
                  <div key={idx}>
                    {path ? (
                      <Thumb
                        url={assetUrls[path]}
                        onRemove={() => removeCoverAt(idx)}
                        className="aspect-[4/3]"
                      />
                    ) : (
                      <>
                        <UploadArea
                          // O lado é fixo: a posição 0 imprime à esquerda do
                          // painel do logótipo, a 1 à direita.
                          label={idx === 0 ? "Capa esquerda" : "Capa direita"}
                          busy={!!uploading[`cover-${idx}`]}
                          multiple={false}
                          curto
                          onFiles={(files) =>
                            handleUpload(`cover-${idx}`, files.slice(0, 1), (paths) =>
                              setCoverAt(idx, paths[0]),
                            )
                          }
                        />
                        <button
                          type="button"
                          className={`${ADD_BTN} mt-1.5`}
                          onClick={() => setPicker({ kind: "cover", idx })}
                          // Ao passar o rato já se vai buscar o que o diálogo
                          // precisa. Quando ela carrega, está lá. `focus` para
                          // quem navega por teclado, e `touchstart` para o
                          // telemóvel, onde não há hover nenhum — é o instante
                          // entre pousar o dedo e o levantar.
                          onPointerEnter={aquecerBiblioteca}
                          onFocus={aquecerBiblioteca}
                          onTouchStart={aquecerBiblioteca}
                        >
                          Da biblioteca de temas
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Service groups */}
          <Section title="Serviços" id="servicos">
            <div className="flex flex-col gap-3">
              {doc.serviceGroups.map((g, gi) => (
                <div
                  key={gi}
                  className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <input
                      className="bo-input w-12 shrink-0 px-2 py-2 text-xs text-foreground/70 text-center"
                      value={g.letter ?? ""}
                      onChange={(e) => updateGroup(gi, { letter: e.target.value })}
                      placeholder="a)"
                      aria-label="Letra do grupo (a, b, c…)"
                    />
                    <input
                      className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-foreground/75"
                      value={g.title}
                      onChange={(e) => updateGroup(gi, { title: e.target.value })}
                      placeholder="Decoração Floral de Casamento"
                      aria-label="Título do grupo"
                    />
                    <MoveBtns
                      onUp={() => moveGroup(gi, -1)}
                      onDown={() => moveGroup(gi, 1)}
                      disUp={gi === 0}
                      disDown={gi === doc.serviceGroups.length - 1}
                    />
                    <button
                      type="button"
                      className={REMOVE_BTN}
                      onClick={() => removeGroup(gi)}
                      aria-label="Remover grupo"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 pl-1">
                    {g.items.map((it, ii) => (
                      <div key={ii} className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                        <input
                          className={INPUT_SM}
                          value={it.label}
                          onChange={(e) => updateServiceItem(gi, ii, { label: e.target.value })}
                          placeholder="Reunião inicial"
                          aria-label="Item"
                        />
                        {!isDeco && (
                          <input
                            className={INPUT_SM}
                            value={it.desc ?? ""}
                            onChange={(e) => updateServiceItem(gi, ii, { desc: e.target.value })}
                            placeholder="Descrição"
                            aria-label="Descrição do item"
                          />
                        )}
                        <button
                          type="button"
                          className={`${REMOVE_BTN} sm:mt-2`}
                          onClick={() => removeServiceItem(gi, ii)}
                          aria-label="Remover item"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button type="button" className={ADD_BTN} onClick={() => addServiceItem(gi)}>
                      + Adicionar item
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button type="button" className={ADD_BTN} onClick={addGroup}>
                + Adicionar grupo de serviços
              </button>
              <ModelosParciais
                tipo="grupo"
                toast={toast}
                onInserir={(g) =>
                  setDoc((d) => ({
                    ...d,
                    serviceGroups: [
                      ...d.serviceGroups,
                      // A letra é a POSIÇÃO na lista, não uma propriedade do
                      // modelo: inserir um bloco guardado como "b)" no fim de uma
                      // proposta que já tem três grupos daria dois "b)".
                      {
                        ...(g as StudioDoc["serviceGroups"][number]),
                        letter: `${LETTERS[d.serviceGroups.length] ?? ""})`,
                      },
                    ],
                  }))
                }
                paraGuardar={doc.serviceGroups.find((g) => (g.title ?? "").trim())}
                nomeSugerido={doc.serviceGroups.find((g) => (g.title ?? "").trim())?.title}
              />
            </div>
          </Section>

          {/* Mood boards — decoracao only */}
          {isDeco && (
            <Section title="Mood boards" id="moodboards">
              <p className="-mt-2 mb-4 text-sm leading-relaxed text-foreground/55">
                grupos de imagens de inspiração para o cliente
              </p>
              <div className="flex flex-col gap-3">
                {doc.moodBoards.map((b, bi) => (
                  <div
                    key={bi}
                    className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <input
                        className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-foreground/75"
                        value={b.title}
                        onChange={(e) => updateBoard(bi, { title: e.target.value })}
                        placeholder="Decoração Cerimónia"
                        aria-label="Título do mood board"
                      />
                      <MoveBtns
                        onUp={() => moveBoard(bi, -1)}
                        onDown={() => moveBoard(bi, 1)}
                        disUp={bi === 0}
                        disDown={bi === doc.moodBoards.length - 1}
                      />
                      <button
                        type="button"
                        className={REMOVE_BTN}
                        onClick={() => removeBoard(bi)}
                        aria-label="Remover mood board"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      className={`${INPUT_SM} mb-2 w-full resize-none leading-relaxed`}
                      rows={2}
                      value={b.annotation ?? ""}
                      onChange={(e) => updateBoard(bi, { annotation: e.target.value })}
                      placeholder="Descrição (opcional) — ex.: runner floral com hortênsias verdes, cravo verde, lisianthus branco…"
                      aria-label="Descrição do mood board"
                    />
                    {/* A página deste mood board desenha MOOD_BOARD_MAX_IMAGES
                      fotos. As que passam disso ficam marcadas — e ditas por
                      extenso a seguir — em vez de desaparecerem caladas no PDF. */}
                    {b.images.length > MOOD_BOARD_MAX_IMAGES && (
                      <p className="mb-2 text-xs leading-relaxed text-[#8a2a22]">
                        A página deste mood board mostra {MOOD_BOARD_MAX_IMAGES} fotos:{" "}
                        {b.images.length - MOOD_BOARD_MAX_IMAGES === 1
                          ? "a última, marcada «fora do PDF», não é impressa"
                          : `as ${b.images.length - MOOD_BOARD_MAX_IMAGES} últimas, marcadas «fora do PDF», não são impressas`}
                        . Remova fotos ou crie outro mood board.
                      </p>
                    )}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {b.images.map((path, ii) => (
                        <Thumb
                          key={`${path}-${ii}`}
                          url={assetUrls[path]}
                          onRemove={() => removeBoardImage(bi, path)}
                          className="aspect-square"
                          foraDoPdf={ii >= MOOD_BOARD_MAX_IMAGES}
                        />
                      ))}
                      <UploadArea
                        label="+ Imagens"
                        busy={!!uploading[`board-${bi}`]}
                        multiple
                        compact
                        onFiles={(files) =>
                          handleUpload(`board-${bi}`, files, (paths) => addBoardImages(bi, paths))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className={`${ADD_BTN} mt-2`}
                      onClick={() => setPicker({ kind: "board", bi })}
                      onPointerEnter={aquecerBiblioteca}
                      onFocus={aquecerBiblioteca}
                      onTouchStart={aquecerBiblioteca}
                    >
                      Escolher da biblioteca de temas
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <button type="button" className={ADD_BTN} onClick={addBoard}>
                  + Adicionar mood board
                </button>
                <ModelosParciais
                  tipo="moodboard"
                  toast={toast}
                  onInserir={(b) =>
                    setDoc((d) => ({
                      ...d,
                      moodBoards: [...d.moodBoards, b as StudioDoc["moodBoards"][number]],
                    }))
                  }
                  paraGuardar={doc.moodBoards.find((b) => (b.title ?? "").trim())}
                  nomeSugerido={doc.moodBoards.find((b) => (b.title ?? "").trim())?.title}
                />
              </div>
            </Section>
          )}

          {/* Cronograma — organizacao only */}
          {!isDeco && (
            <Section title="Cronograma de Organização" id="cronograma">
              <div className="flex flex-col gap-3">
                {(doc.cronograma ?? []).map((ph, pi) => (
                  <div
                    key={pi}
                    className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <input
                        className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-foreground/75"
                        value={ph.title}
                        onChange={(e) => updatePhase(pi, { title: e.target.value })}
                        placeholder="6-12 meses antes do casamento"
                        aria-label="Título da fase"
                      />
                      <MoveBtns
                        onUp={() => movePhase(pi, -1)}
                        onDown={() => movePhase(pi, 1)}
                        disUp={pi === 0}
                        disDown={pi === (doc.cronograma?.length ?? 0) - 1}
                      />
                      <button
                        type="button"
                        className={REMOVE_BTN}
                        onClick={() => removePhase(pi)}
                        aria-label="Remover fase"
                      >
                        ×
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 pl-1">
                      {ph.items.map((it, ii) => (
                        <div key={ii} className="flex items-center gap-2">
                          <input
                            className={INPUT_SM}
                            value={it}
                            onChange={(e) => updatePhaseItem(pi, ii, e.target.value)}
                            placeholder="Definição do conceito"
                            aria-label="Tarefa"
                          />
                          <button
                            type="button"
                            className={REMOVE_BTN}
                            onClick={() => removePhaseItem(pi, ii)}
                            aria-label="Remover tarefa"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button type="button" className={ADD_BTN} onClick={() => addPhaseItem(pi)}>
                        + Adicionar tarefa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className={`${ADD_BTN} mt-3`} onClick={addPhase}>
                + Adicionar fase
              </button>
            </Section>
          )}

          {/* Budget */}
          <Section title="Orçamento Proposto" id="orcamento">
            {isDeco ? (
              <>
                <div className="flex flex-col gap-2 mb-3">
                  <p className="text-xs leading-relaxed text-foreground/50">
                    Os preços por linha são <strong className="font-semibold">só para si</strong>:
                    servem para somar e para avisar quando o total já não bate certo. O PDF continua
                    a mostrar as linhas sem preço e um «{doc.totalLabel || "Valor Total"}» único,
                    como nas suas propostas.
                  </p>
                  {linhasDe(doc).map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className={`${INPUT_SM} flex-1`}
                        value={l.item}
                        onChange={(e) => updateBudgetItem(i, e.target.value)}
                        placeholder="Decor Cerimónia"
                        aria-label="Item de orçamento"
                      />
                      {/* A largura vai no invólucro e não no campo: `.bo-input`
                        tem `width: 100%` escrito em CSS, que ganha a um
                        `w-28` do Tailwind. Sem isto o preço comia a linha
                        toda e o nome ficava numa caixa de trinta pixels — foi
                        o que a captura de ecrã mostrou. */}
                      <span className="w-28 shrink-0">
                        <input
                          className="bo-input px-2.5 py-2 text-right text-xs text-foreground/75"
                          defaultValue={l.preco === null ? "" : String(l.preco)}
                          // `onBlur` e não `onChange`: normalizar a cada tecla
                          // apagava o que ela estava a escrever a meio ("1." vira
                          // 1, e o "500" seguinte já não tinha onde entrar).
                          onBlur={(e) => updateBudgetPrice(i, e.target.value)}
                          placeholder="900"
                          inputMode="decimal"
                          aria-label={`Preço de ${l.item || "linha sem nome"}`}
                        />
                      </span>
                      <button
                        type="button"
                        className={REMOVE_BTN}
                        onClick={() => removeBudgetItem(i)}
                        aria-label="Remover item"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" className={ADD_BTN} onClick={addBudgetItem}>
                      + Adicionar item
                    </button>
                    {soma !== null && (
                      <span className="text-xs text-foreground/55">
                        Soma das linhas: <strong className="font-semibold">{eur(soma)}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Rótulo do total"
                    value={doc.totalLabel}
                    onChange={(e) => patch({ totalLabel: e.target.value })}
                    placeholder="Valor Total Decoração"
                  />
                </div>

                {/* Valores adicionais — linhas mostradas por baixo do total (Deslocação,
                  Wedding Coordinator, Tecidos, Mobiliário opção A/B, …). Só aparecem no
                  PDF; o valor faturado e o sinal 30/70 continuam a partir do «Total» abaixo. */}
                <div className="mt-5">
                  <span className="bo-eyebrow">Valores adicionais</span>
                  <p className="mt-1.5 mb-3 text-xs leading-relaxed text-foreground/45">
                    Linhas mostradas por baixo do total na proposta (ex.: deslocação, coordenação,
                    tecidos). Só para o PDF — o total faturado e o sinal continuam a partir do
                    «Total».
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
                      <span>Descrição</span>
                      <span className="text-right">Valor (texto)</span>
                      <span className="w-5" />
                    </div>
                    {(doc.budgetExtras ?? []).map((ex, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[minmax(0,1fr)_10rem_auto] items-center gap-2"
                      >
                        <input
                          className="bo-input px-2.5 py-2 text-xs text-foreground/75"
                          value={ex.label}
                          onChange={(e) => updateBudgetExtra(i, { label: e.target.value })}
                          placeholder="Deslocação da equipa Líquen"
                          aria-label="Descrição da linha adicional"
                        />
                        <input
                          className="bo-input px-2.5 py-2 text-xs text-foreground/75 text-right"
                          value={ex.valueText}
                          onChange={(e) => updateBudgetExtra(i, { valueText: e.target.value })}
                          placeholder="896,00 €"
                          aria-label="Valor da linha adicional"
                        />
                        <button
                          type="button"
                          className={REMOVE_BTN}
                          onClick={() => removeBudgetExtra(i)}
                          aria-label="Remover linha adicional"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button type="button" className={ADD_BTN} onClick={addBudgetExtra}>
                      + Adicionar valor adicional
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
                    <span>Item</span>
                    <span className="text-right">Valor</span>
                    <span className="w-5" />
                  </div>
                  {(doc.budgetRows ?? []).map((r, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1fr)_10rem_auto] items-center gap-2"
                    >
                      <input
                        className="bo-input px-2.5 py-2 text-xs text-foreground/75"
                        value={r.item}
                        onChange={(e) => updateBudgetRow(i, { item: e.target.value })}
                        placeholder="Coordenação do dia"
                        aria-label="Item"
                      />
                      <input
                        className="bo-input px-2.5 py-2 text-xs text-foreground/75 text-right"
                        value={r.price}
                        onChange={(e) => updateBudgetRow(i, { price: e.target.value })}
                        placeholder="1.500,00 €"
                        aria-label="Valor"
                      />
                      <button
                        type="button"
                        className={REMOVE_BTN}
                        onClick={() => removeBudgetRow(i)}
                        aria-label="Remover linha"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className={ADD_BTN} onClick={addBudgetRow}>
                    + Adicionar linha
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <Field
                    as="textarea"
                    label="Nota do orçamento"
                    rows={2}
                    className="resize-none"
                    value={doc.budgetNote ?? ""}
                    onChange={(e) => patch({ budgetNote: e.target.value })}
                    placeholder="Os valores são estimativas e podem ser ajustados…"
                  />
                </div>
              </>
            )}
          </Section>

          {/* Total, IVA e validade — fonte de verdade do dinheiro. O valor + o modo
          de IVA eliminam a ambiguidade "3.000,00 €" (com IVA?) vs "+ IVA"; o
          texto do PDF é composto a partir daqui. */}
          <Section title="Total, IVA e validade" id="total">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <p className="text-xs leading-relaxed text-foreground/50 sm:col-span-2">
                É o mesmo valor do <strong className="font-semibold">Preço final</strong> do pedido
                — escrever aqui altera-o lá, e alterá-lo lá aparece aqui. Há um número só.
              </p>
              <Field
                // Sempre a base: é o que o pedido guarda, e é o que o rótulo
                // "(sem IVA)" da Gestão do pedido promete. O modo de IVA muda o
                // que o cliente vê, não o significado deste campo.
                label="Valor (sem IVA)"
                inputMode="decimal"
                value={totalInput}
                onChange={(e) => {
                  confirmado("totalAmount");
                  onTotalInput(e.target.value);
                }}
                placeholder="3000"
                containerClassName={realce("totalAmount")}
                hint={
                  desvio
                    ? `Total manual — a soma das linhas é ${eur(desvio.soma)}`
                    : soma !== null
                      ? "Bate certo com a soma das linhas."
                      : undefined
                }
              />
              {/* O aviso e o atalho para o corrigir andam juntos: dizer que está
                errado sem dar o gesto que o arruma é meio trabalho. */}
              {desvio && (
                <div className="sm:col-span-2 -mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2">
                  <span className="text-xs text-foreground/70">
                    O total está escrito à mão e difere da soma das linhas em{" "}
                    <strong className="font-semibold">{eur(Math.abs(desvio.diferenca))}</strong>.
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-[#4d6350] underline-offset-2 hover:underline"
                    onClick={() => {
                      confirmado("totalAmount");
                      onTotalInput(String(desvio.soma));
                    }}
                  >
                    Usar {eur(desvio.soma)}
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <span className="bo-eyebrow">IVA</span>
                <Segmented
                  ariaLabel="Modo de IVA"
                  value={vatMode}
                  onChange={setVatMode}
                  options={[
                    { value: "incluido", label: "IVA incluído" },
                    { value: "acrescer", label: "+ IVA (acresce)" },
                  ]}
                />
                <p className="text-xs leading-relaxed text-foreground/45">
                  Muda o que o cliente vê no PDF: «+ IVA» mostra o valor e soma o IVA por cima;
                  «incluído» mostra já a soma. O valor acima é sempre sem IVA.
                </p>
                {/* As duas leituras lado a lado, para ela ver o que o cliente vai
                  ver antes de decidir. A escolhida fica marcada; a outra está
                  lá para comparar, não para confundir. */}
                {money.base > 0 && (
                  <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                    {(["acrescer", "incluido"] as const).map((modo) => {
                      const v = duasFormas[modo];
                      const ativa = vatMode === modo;
                      return (
                        <div
                          key={modo}
                          className={`rounded-lg border px-2.5 py-2 ${
                            ativa
                              ? "border-[#4d6350]/40 bg-[#4d6350]/[0.06]"
                              : "border-foreground/10 text-foreground/45"
                          }`}
                        >
                          <span className="block font-medium">
                            {modo === "acrescer" ? "+ IVA" : "IVA incluído"}
                            {ativa && " · escolhido"}
                          </span>
                          <span className="mt-0.5 block">
                            base {eur(v.base)} · IVA {eur(v.iva)}
                          </span>
                          <span className="block">
                            o cliente paga <strong className="font-semibold">{eur(v.total)}</strong>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <Field
                label="Validade (dias)"
                type="number"
                min={1}
                value={doc.validUntilDays ?? ""}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  patch({ validUntilDays: Number.isFinite(n) && n > 0 ? n : undefined });
                }}
                placeholder={String(DEFAULT_VALID_DAYS)}
                aria-label="Dias de validade"
                hint={
                  doc.validUntilDays ? (
                    <button
                      type="button"
                      className="text-[11px] text-[#4d6350] underline-offset-2 hover:underline"
                      onClick={() => void guardarValidadePadrao(doc.validUntilDays!)}
                    >
                      Passar a usar {doc.validUntilDays} dias em todas as propostas novas
                    </button>
                  ) : undefined
                }
              />
            </div>
            {/* Prévia do desdobramento — o que será efetivamente faturado. */}
            {money.gross > 0 && (
              <p className="mt-4 text-xs leading-relaxed text-foreground/55">
                Base {eur(money.base)} · IVA ({Math.round(money.vatRate * 100)}%) {eur(money.vat)} ·{" "}
                <span className="text-foreground/80">Total {eur(money.gross)}</span>
                <br />
                Sinal{" "}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={pctSinal}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    patch({ depositPercent: Number.isFinite(n) ? n : undefined });
                  }}
                  aria-label="Percentagem do sinal"
                  className="bo-input mx-0.5 w-14 px-1.5 py-0.5 text-center text-xs"
                />
                %: {eur(split.sinal)} · Saldo {100 - pctSinal}%: {eur(split.saldo)}
              </p>
            )}
          </Section>
        </div>
      </div>
      {/* ══════════ /PASSO 1 ══════════ */}

      {/* ══════════ PASSO 2 · Pré-visualizar ══════════ */}
      {/* Only mount the preview while it's the active step. It was previously
          kept mounted (just `hidden`), so its filter/map over every service
          group + budget line re-ran on EVERY keystroke in the content step —
          the main source of typing lag on large proposals. */}
      {step === "prever" && (
        <div>
          <PreviewSummary doc={doc} assetUrls={assetUrls} money={money} split={split} />
        </div>
      )}

      {/* ══════════ PASSO 3 · Enviar ══════════ */}
      <div hidden={step !== "enviar"}>
        <Section title="Enviar ao cliente">
          {sent ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#4d6350]/25 bg-[#4d6350]/[0.06] p-5">
              <p className="flex items-center gap-2 font-display text-base text-[#4d6350]">
                <span aria-hidden="true">✓</span> Proposta enviada
              </p>
              <p className="text-sm leading-relaxed text-foreground/60">
                A proposta foi gerada e enviada para {quote.email || "o cliente"}. Não precisa de
                fazer mais nada.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSent(false);
                  setConfirmSend(false);
                }}
              >
                Enviar de novo / nova revisão
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-foreground/60">
                Confirme os dados abaixo. Ao enviar, o cliente recebe a proposta em PDF por email.
              </p>
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <SummaryRow label="Para" value={quote.email || "—"} />
                <SummaryRow label="Clientes" value={doc.clientNames || "—"} />
                <SummaryRow
                  label="Total (com IVA)"
                  value={money.gross > 0 ? eur(money.gross) : "—"}
                />
                <SummaryRow label="Sinal 30%" value={money.gross > 0 ? eur(split.sinal) : "—"} />
              </dl>
              {!canSend && (
                <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-[#b5654a]">
                  <span aria-hidden="true">⚠</span>
                  <span>
                    Preencha clientes, referência e um total maior que 0 (no passo «Conteúdo») antes
                    de enviar.
                  </span>
                </p>
              )}
            </>
          )}
        </Section>
      </div>

      {/* Ação principal — muda conforme o passo, para haver sempre UMA próxima
          ação óbvia. */}
      <div // `z-20` não é enfeite: sem ele os cartões das secções — que criam o seu
        // próprio contexto de empilhamento — desenham-se POR CIMA desta barra, e o
        // texto do total aparecia misturado com o do campo por baixo. Vê-se na
        // captura de ecrã antes desta linha existir; nenhum teste apanhava.
        className="sticky bottom-0 z-20 -mx-1 mt-2 flex flex-wrap items-center gap-2 border-t border-foreground/10 bg-[var(--bo-surface,#ffffff)] px-1 py-3 shadow-[0_-8px_16px_-12px_rgba(42,38,32,0.25)]"
      >
        {step === "conteudo" && (
          <>
            {/* O TOTAL SEMPRE À VISTA.
                Palavras dela: «não quero fazer scroll para saber quanto vai a
                proposta». O valor vive cinco ecrãs abaixo do sítio onde ela
                está a escrever os serviços; aqui acompanha-a por toda a
                página, e muda enquanto ela escreve. */}
            <p className="mr-auto text-xs text-foreground/55">
              {money.base > 0 ? (
                <>
                  <span className="text-foreground/45">Total</span>{" "}
                  <strong className="font-semibold text-foreground/85">{eur(money.base)}</strong>{" "}
                  <span className="text-foreground/45">
                    sem IVA · o cliente paga {eur(money.gross)}
                  </span>
                  {desvio && (
                    <span className="ml-2 rounded-full bg-[#c98a2e]/15 px-2 py-0.5 text-[10px] text-[#8a5d13]">
                      soma das linhas: {eur(desvio.soma)}
                    </span>
                  )}
                </>
              ) : (
                "Preencha o conteúdo e avance para pré-visualizar."
              )}
              {/* Discreto de propósito: é uma confirmação, não um aviso. Quem
                  precisa dela procura-a; quem não precisa não tem de a ler. */}
              {(gravadoEm || porGravar) && (
                <span className="ml-2 text-[11px] text-foreground/35">
                  {porGravar
                    ? "a guardar…"
                    : `guardado às ${gravadoEm!.toLocaleTimeString("pt-PT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`}
                </span>
              )}
            </p>
            <Button
              variant="primary"
              onClick={() => setStep("prever")}
              iconRight={<span aria-hidden="true">→</span>}
            >
              Pré-visualizar
            </Button>
          </>
        )}

        {step === "prever" && (
          <>
            <Button variant="ghost" onClick={() => setStep("conteudo")}>
              ← Conteúdo
            </Button>
            <Button
              variant="secondary"
              onClick={preview}
              disabled={busy !== null}
              loading={busy === "preview"}
              className="ml-auto"
            >
              {busy === "preview" ? "A gerar…" : "Descarregar PDF"}
            </Button>
            <Button
              variant="primary"
              onClick={() => setStep("enviar")}
              iconRight={<span aria-hidden="true">→</span>}
            >
              Rever e enviar
            </Button>
          </>
        )}

        {step === "enviar" && !sent && (
          <>
            <Button variant="ghost" onClick={() => setStep("prever")}>
              ← Pré-visualizar
            </Button>
            {confirmSend ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground/60">
                  Enviar para {quote.email || "o cliente"}?
                </span>
                <Button
                  variant="primary"
                  onClick={send}
                  disabled={busy !== null}
                  loading={busy === "send"}
                >
                  {busy === "send" ? "A enviar…" : "Confirmar"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmSend(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                onClick={() => setConfirmSend(true)}
                disabled={busy !== null || !canSend}
                title={
                  canSend
                    ? undefined
                    : "Preencha clientes, referência e um total maior que 0 antes de enviar."
                }
                iconRight={<span aria-hidden="true">→</span>}
                className="ml-auto"
              >
                Gerar e enviar ao cliente
              </Button>
            )}
          </>
        )}

        {step === "enviar" && sent && (
          <Button variant="ghost" onClick={() => setStep("conteudo")}>
            ← Voltar ao conteúdo
          </Button>
        )}
      </div>

      {picker && (
        <ThemePicker
          quoteId={quote.id}
          multiple={picker.kind === "board"}
          usedThemePaths={usedThemePaths}
          onClose={() => setPicker(null)}
          onPicked={onPickedFromLibrary}
        />
      )}
    </div>
  );
}

// ── Small presentational helpers ──

/**
 * Onde ficam guardadas as secções fechadas.
 *
 * Por DISPOSITIVO e não no documento: fechar o «Cronograma» é uma preferência
 * de quem está a trabalhar, não uma propriedade da proposta. Guardá-la no
 * documento fazia com que abrir a proposta noutro computador herdasse as
 * dobras de outra pessoa — e, pior, fazia uma alteração de disposição contar
 * como alteração por gravar.
 */
const SECOES_KEY = "liquen-estudio-secoes";

function lerFechadas(): Record<string, boolean> {
  try {
    const cru = localStorage.getItem(SECOES_KEY);
    const v = cru ? JSON.parse(cru) : null;
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function Section({
  title,
  children,
  /** Chave estável para lembrar a dobra. Sem ela a secção não colapsa. */
  id,
  /** Marca à direita do título — "3 linhas", "por preencher". */
  nota,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
  nota?: string;
}) {
  const [fechada, setFechada] = useState(false);
  // Ler no efeito e não no `useState` inicial: o servidor não tem
  // `localStorage`, e uma diferença entre o que o servidor desenha e o que o
  // browser desenha dá um erro de hidratação.
  useEffect(() => {
    if (id) setFechada(!!lerFechadas()[id]);
  }, [id]);

  function alternar() {
    if (!id) return;
    const proxima = !fechada;
    setFechada(proxima);
    try {
      localStorage.setItem(SECOES_KEY, JSON.stringify({ ...lerFechadas(), [id]: proxima }));
    } catch {
      /* sem localStorage a dobra não sobrevive à sessão; o resto funciona */
    }
  }

  const corpoId = id ? `sec-${id}` : undefined;
  return (
    <Card className="mb-4" id={id ? `seccao-${id}` : undefined}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        {id ? (
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!fechada}
            aria-controls={corpoId}
            className="group flex items-baseline gap-2 text-left"
          >
            <span
              aria-hidden
              className={`text-[10px] text-foreground/35 transition-transform ${fechada ? "" : "rotate-90"}`}
            >
              ▶
            </span>
            <h3 className="font-display text-base leading-tight text-foreground/90 group-hover:text-foreground">
              {title}
            </h3>
          </button>
        ) : (
          <h3 className="font-display text-base leading-tight text-foreground/90">{title}</h3>
        )}
        {nota && <span className="shrink-0 text-xs text-foreground/45">{nota}</span>}
      </div>
      {/* `hidden` e não desmontar: uma secção fechada continua a ter os campos
          no formulário, e fechá-la não pode apagar o que lá está escrito. */}
      <div id={corpoId} hidden={fechada}>
        {children}
      </div>
    </Card>
  );
}

/** Indicador de passos "1 · Conteúdo → 2 · Pré-visualizar → 3 · Enviar". */
function StepNav({
  step,
  onSelect,
  sent,
}: {
  step: Step;
  onSelect: (s: Step) => void;
  sent: boolean;
}) {
  return (
    <nav aria-label="Passos da proposta" className="mb-5 flex flex-wrap items-center gap-1.5">
      {STEPS.map((s, i) => {
        const active = s.id === step;
        return (
          <Fragment key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={active ? "step" : undefined}
              className={`alvo-toque gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-xs font-medium motion-safe:transition-colors inline-flex items-center ${
                active
                  ? "bg-[#4d6350] text-white"
                  : "text-foreground/50 hover:bg-foreground/[0.05] hover:text-foreground/80"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  active ? "bg-white/25 text-white" : "bg-foreground/[0.08] text-foreground/50"
                }`}
              >
                {sent && s.id === "enviar" ? "✓" : s.n}
              </span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="text-foreground/20">
                →
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Linha "rótulo → valor" para os resumos (pré-visualização e envio). */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-foreground/[0.06] pb-1.5">
      <dt className="text-foreground/45">{label}</dt>
      <dd className="text-right text-foreground/85">{value}</dd>
    </div>
  );
}

/** Miniatura só de leitura (sem botão de remover) para o resumo. */
function PreviewThumb({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="aspect-[4/3] overflow-hidden rounded-lg border border-foreground/[0.1] bg-foreground/[0.04]">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          // Cada célula puxa o ORIGINAL — medido, 1130 KB por foto para uma
          // caixa de 174 px (ver IMAGES-BEFORE.md). Enquanto as propostas não
          // tiverem miniaturas próprias, `lazy` é o que impede as células fora
          // do ecrã de disputarem a ligação com as que estão à vista: sem isto
          // a primeira imagem só terminava aos 35 s em 4G, porque esperava
          // pelas outras vinte e três.
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.15em] text-foreground/30">
          Imagem
        </div>
      )}
    </div>
  );
}

/** Resumo em página: a "forma" da proposta (capa, serviços, total sem IVA/IVA/
 *  com IVA, sinal/saldo) sem ter de descarregar o PDF. */
function PreviewSummary({
  doc,
  assetUrls,
  money,
  split,
}: {
  doc: StudioDoc;
  assetUrls: Record<string, string>;
  money: ReturnType<typeof resolveProposalMoney>;
  split: ReturnType<typeof splitSinal>;
}) {
  const covers = (doc.coverImages ?? []).filter(Boolean) as string[];
  const groups = doc.serviceGroups.filter((g) => (g.title ?? "").trim() || g.items.length > 0);
  const extras = (doc.budgetExtras ?? []).filter(
    (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
  );
  return (
    <Section title="Resumo da proposta">
      <p className="-mt-2 mb-4 text-sm leading-relaxed text-foreground/55">
        Esta é a forma da proposta que o cliente vai receber. Para o documento completo, use
        «Descarregar PDF».
      </p>

      {covers.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          {covers.map((path, i) => (
            <PreviewThumb key={`${path}-${i}`} url={assetUrls[path]} />
          ))}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <SummaryRow label="Clientes" value={doc.clientNames || "—"} />
        <SummaryRow label="Tipo de evento" value={doc.eventType || "—"} />
        <SummaryRow label="Data" value={doc.eventDate || "—"} />
        <SummaryRow label="Local" value={doc.location || "—"} />
        {doc.guests ? <SummaryRow label="Convidados" value={doc.guests} /> : null}
      </dl>

      {groups.length > 0 && (
        <div className="mt-5">
          <p className="bo-eyebrow mb-2">Serviços</p>
          <ul className="flex flex-col gap-1 text-sm text-foreground/75">
            {groups.map((g, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-foreground/40">{g.letter || `${i + 1}.`}</span>
                <span>
                  {g.title || "(sem título)"}
                  {g.items.length > 0 && (
                    <span className="text-foreground/40">
                      {" "}
                      · {g.items.length} {g.items.length === 1 ? "item" : "itens"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-5">
          <p className="bo-eyebrow mb-2">Valores adicionais</p>
          <ul className="flex flex-col gap-1 text-sm text-foreground/75">
            {extras.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span>{e.label || "—"}</span>
                <span className="text-foreground/55">{e.valueText || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4">
        {money.gross > 0 ? (
          <dl className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/50">Sem IVA</dt>
              <dd className="text-foreground/80">{eur(money.base)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/50">IVA ({Math.round(money.vatRate * 100)}%)</dt>
              <dd className="text-foreground/80">{eur(money.vat)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-foreground/[0.08] pt-1.5">
              <dt className="font-medium text-foreground/70">Com IVA</dt>
              <dd className="font-display text-base text-foreground/90">{eur(money.gross)}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-xs text-foreground/50">
              <dt>Sinal 30%</dt>
              <dd>{eur(split.sinal)}</dd>
            </div>
            <div className="flex items-baseline justify-between text-xs text-foreground/50">
              <dt>Saldo 70%</dt>
              <dd>{eur(split.saldo)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-foreground/50">
            Ainda sem total. Defina o valor no passo «Conteúdo» → «Total, IVA e validade».
          </p>
        )}
      </div>
    </Section>
  );
}

function MoveBtns({
  onUp,
  onDown,
  disUp,
  disDown,
}: {
  onUp: () => void;
  onDown: () => void;
  disUp: boolean;
  disDown: boolean;
}) {
  const base =
    "alvo-toque w-6 h-6 rounded-md text-foreground/35 hover:text-foreground/65 hover:bg-foreground/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs leading-none";
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        className={base}
        onClick={onUp}
        disabled={disUp}
        aria-label="Mover para cima"
      >
        ↑
      </button>
      <button
        type="button"
        className={base}
        onClick={onDown}
        disabled={disDown}
        aria-label="Mover para baixo"
      >
        ↓
      </button>
    </div>
  );
}

function Thumb({
  url,
  onRemove,
  className = "",
  foraDoPdf = false,
}: {
  url?: string;
  onRemove: () => void;
  className?: string;
  /** Esta foto está no rascunho mas a página do PDF já não a desenha. */
  foraDoPdf?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-foreground/[0.04] ${
        foraDoPdf ? "border-[#8a2a22]/60 opacity-60" : "border-foreground/[0.1]"
      } ${className}`}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          // Cada célula puxa o ORIGINAL — medido, 1130 KB por foto para uma
          // caixa de 174 px (ver IMAGES-BEFORE.md). Enquanto as propostas não
          // tiverem miniaturas próprias, `lazy` é o que impede as células fora
          // do ecrã de disputarem a ligação com as que estão à vista: sem isto
          // a primeira imagem só terminava aos 35 s em 4G, porque esperava
          // pelas outras vinte e três.
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[9px] leading-relaxed text-foreground/40">
          {failed ? (
            <>
              <span className="font-medium text-foreground/55">Imagem carregada</span>
              <span>Guardada, mas não foi possível pré-visualizar aqui.</span>
            </>
          ) : (
            <span className="tracking-[0.15em] uppercase text-foreground/30">Imagem</span>
          )}
        </div>
      )}
      {foraDoPdf && (
        <span className="absolute inset-x-0 bottom-0 bg-[#8a2a22]/85 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          fora do PDF
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover imagem"
        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white text-xs leading-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        ×
      </button>
    </div>
  );
}

function UploadArea({
  label,
  busy,
  multiple,
  compact = false,
  curto = false,
  onFiles,
}: {
  label: string;
  busy: boolean;
  multiple: boolean;
  compact?: boolean;
  /**
   * Caixa BAIXA em vez de proporcional.
   *
   * Uma zona de largar com `aspect-[4/3]` numa coluna de 520px fica com 391px
   * de altura — medido. Duas dessas, lado a lado, são metade da janela de
   * trabalho gasta a não mostrar nada. Vazia é uma faixa; ao ganhar uma foto,
   * a miniatura é que traz a proporção de volta.
   */
  curto?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function pick(list: FileList | null) {
    if (!list) return;
    // Alguns sistemas entregam HEIC/ficheiros de câmara com `type` vazio —
    // aceitar também por extensão, em vez de os descartar em silêncio.
    const files = Array.from(list).filter(
      (f) =>
        f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name),
    );
    if (files.length) onFiles(files);
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
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
      className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 ${
        curto ? "h-24 p-2" : compact ? "aspect-square p-2" : "aspect-[4/3] p-3"
      } ${
        drag
          ? "border-[#4d6350]/60 bg-[#4d6350]/[0.06]"
          : "border-foreground/[0.18] bg-foreground/[0.02] hover:border-[#4d6350]/45"
      }`}
    >
      <span className="text-[9px] tracking-[0.15em] uppercase text-foreground/35">
        {busy ? "A carregar…" : label}
      </span>
      {!busy && !compact && (
        <span className="text-[9px] text-foreground/25">arraste ou clique</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
