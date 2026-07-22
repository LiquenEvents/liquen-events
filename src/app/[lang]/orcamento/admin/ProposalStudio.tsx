"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";
import {
  withProposalDefaults,
  resolveProposalMoney,
  detectVatMode,
  parseMoneyText,
  DEFAULT_VALID_DAYS,
  type VatMode,
} from "@/lib/proposal-doc";
import { eur, splitThirtySeventy } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";
import { prepareImageForUpload } from "./image-prep";
import { Button, Card, Field, Segmented } from "./ui";

/**
 * Visual editor for the studio's multi-page proposal PDF. Produces a
 * {@link ProposalDoc}-shaped payload (minus the fixed boilerplate, which the
 * server fills via {@link withProposalDefaults}) and previews / e-mails it.
 */
type StudioDoc = Parameters<typeof withProposalDefaults>[0];

// ── Shared styling (matches ProposalBuilder / PaymentsPanel) ──
const INPUT_SM = "bo-input min-w-0 px-3 py-2 text-xs text-foreground/85";
const ADD_BTN =
  "inline-flex items-center gap-1 text-xs font-medium text-[#4d6350] hover:text-[#415440] transition-colors";
const REMOVE_BTN =
  "text-foreground/30 hover:text-[#8a2a22] transition-colors text-base leading-none shrink-0";

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
    serviceGroups: [],
    moodBoards: [],
    cronograma: [],
    budgetItems: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    budgetRows: [],
    totalEstimatedText: "",
    budgetNote: "",
    coverImages: [],
  };
  base.ref = buildRef(base);
  return base;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

interface Props {
  quote: Quote;
  onSent?: () => void;
}

export default function ProposalStudio({ quote, onSent }: Props) {
  const { toast } = useToast();
  const DRAFT_KEY = `liquen-proposal-studio-${quote.id}`;
  const SIDE_KEY = `${DRAFT_KEY}:meta`;

  const [doc, setDoc] = useState<StudioDoc>(() => initialDoc(quote));
  // Free-typed mirror of the structured total, so pt-PT formatting ("3.000,00")
  // survives keystrokes. Parsed into `doc.totalAmount` (the money source of truth).
  const [totalInput, setTotalInput] = useState<string>("");
  // path → signed url, so freshly-uploaded images render as thumbnails.
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [refEdited, setRefEdited] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<null | "preview" | "send">(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const hydrated = useRef(false);

  // ── Restore draft on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setDoc((d) => ({ ...d, ...parsed }));
          if (typeof parsed.totalAmount === "number") setTotalInput(String(parsed.totalAmount));
        }
      }
      const rawMeta = localStorage.getItem(SIDE_KEY);
      if (rawMeta) {
        const meta = JSON.parse(rawMeta);
        if (meta?.urls && typeof meta.urls === "object") setAssetUrls(meta.urls);
        if (typeof meta?.refEdited === "boolean") setRefEdited(meta.refEdited);
      }
    } catch {
      /* ignore corrupt draft */
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-compose the reference until the user overrides it ──
  useEffect(() => {
    if (refEdited) return;
    setDoc((d) => {
      const next = buildRef(d);
      return d.ref === next ? d : { ...d, ref: next };
    });
  }, [doc.template, doc.eventType, doc.clientNames, doc.eventDate, refEdited]);

  // ── Debounced draft persistence ──
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
        localStorage.setItem(SIDE_KEY, JSON.stringify({ urls: assetUrls, refEdited }));
      } catch {
        /* quota / unavailable — non-fatal */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [doc, assetUrls, refEdited, DRAFT_KEY, SIDE_KEY]);

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

  function onTotalInput(raw: string) {
    setTotalInput(raw);
    const n = parseMoneyText(raw);
    writeTotal(raw.trim() === "" ? undefined : n, vatMode);
  }

  function setVatMode(mode: VatMode) {
    writeTotal(doc.totalAmount, mode);
  }

  // Split 30/70 sobre o BRUTO — o que o estúdio vê é o que será faturado.
  const money = resolveProposalMoney(doc);
  const split = splitThirtySeventy(money.gross);

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

  function clearDraft() {
    if (!window.confirm("Limpar todo o rascunho da proposta? Não pode ser anulado.")) return;
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(SIDE_KEY);
    } catch {
      /* ignore */
    }
    setDoc(initialDoc(quote));
    setTotalInput("");
    setAssetUrls({});
    setRefEdited(false);
    setConfirmSend(false);
    toast("Rascunho limpo", "info");
  }

  // ── Image upload ──
  // Uma imagem por pedido: um lote inteiro num só POST rebentava o limite de
  // corpo do alojamento (~4,5 MB) com fotos reais de telemóvel — o upload
  // "às vezes não funcionava". Cada ficheiro é comprimido no navegador
  // (image-prep) e enviado individualmente, com uma repetição automática em
  // falha de rede; um ficheiro mau nunca deita fora os restantes.
  async function uploadOne(file: File): Promise<{ path: string; url: string }> {
    const post = () => {
      const form = new FormData();
      form.append("files", file);
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
    const im: { path: string; url: string } | undefined = data?.images?.[0];
    if (!im) throw new Error("Falha ao carregar a imagem.");
    setAssetUrls((prev) => ({ ...prev, [im.path]: im.url }));
    return im;
  }

  async function handleUpload(key: string, files: File[], onPaths: (paths: string[]) => void) {
    if (files.length === 0) return;
    setUploading((u) => ({ ...u, [key]: true }));
    const paths: string[] = [];
    const errors: string[] = [];
    try {
      for (const f of files) {
        try {
          const prepared = await prepareImageForUpload(f);
          const im = await uploadOne(prepared);
          paths.push(im.path);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`);
        }
      }
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
  function setCoverAt(idx: number, path: string) {
    setDoc((d) => {
      const cover = [...(d.coverImages ?? [])];
      cover[idx] = path;
      return { ...d, coverImages: cover };
    });
  }
  function removeCoverAt(idx: number) {
    setDoc((d) => ({ ...d, coverImages: (d.coverImages ?? []).filter((_, i) => i !== idx) }));
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
  function addBudgetItem() {
    setDoc((d) => ({ ...d, budgetItems: [...d.budgetItems, ""] }));
  }
  function updateBudgetItem(i: number, value: string) {
    setDoc((d) => ({ ...d, budgetItems: d.budgetItems.map((v, j) => (j === i ? value : v)) }));
  }
  function removeBudgetItem(i: number) {
    setDoc((d) => ({ ...d, budgetItems: d.budgetItems.filter((_, j) => j !== i) }));
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
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
      toast(
        data?.emailed ? "Proposta enviada" : "Proposta gerada (e-mail não configurado)",
        data?.emailed ? "success" : "info",
      );
      onSent?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao enviar a proposta.", "error");
    } finally {
      setBusy(null);
    }
  }

  const isDeco = doc.template !== "organizacao";
  const canSend = !!doc.ref.trim() && !!doc.clientNames.trim();

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
        <Button variant="ghost" size="sm" onClick={clearDraft} className="shrink-0">
          Limpar rascunho
        </Button>
      </div>

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
      <Section title="Evento">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Clientes"
            value={doc.clientNames}
            onChange={(e) => patch({ clientNames: e.target.value })}
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
            onChange={(e) => patch({ eventDate: e.target.value })}
            placeholder="12 de setembro de 2026"
          />
          <Field
            label="Local"
            value={doc.location}
            onChange={(e) => patch({ location: e.target.value })}
            placeholder="Monte da Oliveirinha, Évora"
          />
          <Field
            label="Convidados"
            value={doc.guests}
            onChange={(e) => patch({ guests: e.target.value })}
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
            </>
          )}
        </div>

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
      <Section title="Imagens de capa (2)">
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
                  <UploadArea
                    label={`Capa ${idx + 1}`}
                    busy={!!uploading[`cover-${idx}`]}
                    multiple={false}
                    onFiles={(files) =>
                      handleUpload(`cover-${idx}`, files.slice(0, 1), (paths) =>
                        setCoverAt(idx, paths[0]),
                      )
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Service groups */}
      <Section title="Serviços">
        <div className="flex flex-col gap-3">
          {doc.serviceGroups.map((g, gi) => (
            <div
              key={gi}
              className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  className="bo-input w-12 px-2 py-2 text-xs text-foreground/70 text-center"
                  value={g.letter ?? ""}
                  onChange={(e) => updateGroup(gi, { letter: e.target.value })}
                  placeholder="a)"
                  aria-label="Letra do grupo (a, b, c…)"
                />
                <input
                  className="bo-input flex-1 min-w-0 px-2.5 py-2 text-xs text-foreground/75"
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
        <button type="button" className={`${ADD_BTN} mt-3`} onClick={addGroup}>
          + Adicionar grupo de serviços
        </button>
      </Section>

      {/* Mood boards — decoracao only */}
      {isDeco && (
        <Section title="Mood boards">
          <p className="-mt-2 mb-4 text-sm leading-relaxed text-foreground/55">
            grupos de imagens de inspiração para o cliente
          </p>
          <div className="flex flex-col gap-3">
            {doc.moodBoards.map((b, bi) => (
              <div
                key={bi}
                className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    className="bo-input flex-1 min-w-0 px-2.5 py-2 text-xs text-foreground/75"
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
                <input
                  className={`${INPUT_SM} mb-2`}
                  value={b.annotation ?? ""}
                  onChange={(e) => updateBoard(bi, { annotation: e.target.value })}
                  placeholder="Anotação (opcional)"
                  aria-label="Anotação"
                />
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {b.images.map((path) => (
                    <Thumb
                      key={path}
                      url={assetUrls[path]}
                      onRemove={() => removeBoardImage(bi, path)}
                      className="aspect-square"
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
              </div>
            ))}
          </div>
          <button type="button" className={`${ADD_BTN} mt-3`} onClick={addBoard}>
            + Adicionar mood board
          </button>
        </Section>
      )}

      {/* Cronograma — organizacao only */}
      {!isDeco && (
        <Section title="Cronograma de Organização">
          <div className="flex flex-col gap-3">
            {(doc.cronograma ?? []).map((ph, pi) => (
              <div
                key={pi}
                className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    className="bo-input flex-1 min-w-0 px-2.5 py-2 text-xs text-foreground/75"
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
      <Section title="Orçamento Proposto">
        {isDeco ? (
          <>
            <div className="flex flex-col gap-2 mb-3">
              {doc.budgetItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={INPUT_SM}
                    value={it}
                    onChange={(e) => updateBudgetItem(i, e.target.value)}
                    placeholder="Decor Cerimónia"
                    aria-label="Item de orçamento"
                  />
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
              <button type="button" className={ADD_BTN} onClick={addBudgetItem}>
                + Adicionar item
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Rótulo do total"
                value={doc.totalLabel}
                onChange={(e) => patch({ totalLabel: e.target.value })}
                placeholder="Valor Total Decoração"
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
                <span className="flex-1">Item</span>
                <span className="w-28">Valor</span>
                <span className="w-5" />
              </div>
              {(doc.budgetRows ?? []).map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="bo-input flex-1 min-w-0 px-2.5 py-2 text-xs text-foreground/75"
                    value={r.item}
                    onChange={(e) => updateBudgetRow(i, { item: e.target.value })}
                    placeholder="Coordenação do dia"
                    aria-label="Item"
                  />
                  <input
                    className="bo-input w-28 px-2.5 py-2 text-xs text-foreground/75 text-right"
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
      <Section title="Total, IVA e validade">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label={vatMode === "acrescer" ? "Valor (base, sem IVA)" : "Valor total (com IVA)"}
            inputMode="decimal"
            value={totalInput}
            onChange={(e) => onTotalInput(e.target.value)}
            placeholder="3000"
            aria-label="Valor total"
          />
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
              «+ IVA» soma o IVA ao valor; «incluído» já o contém.
            </p>
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
          />
        </div>
        {/* Prévia do desdobramento — o que será efetivamente faturado. */}
        {money.gross > 0 && (
          <p className="mt-4 text-xs leading-relaxed text-foreground/55">
            Base {eur(money.base)} · IVA ({Math.round(money.vatRate * 100)}%) {eur(money.vat)} ·{" "}
            <span className="text-foreground/80">Total {eur(money.gross)}</span>
            <br />
            Sinal 30%: {eur(split.sinal)} · Saldo 70%: {eur(split.saldo)}
          </p>
        )}
      </Section>

      {/* Actions */}
      <div className="sticky bottom-0 -mx-1 mt-2 flex flex-wrap items-center gap-2 border-t border-foreground/10 bg-background/85 px-1 py-3 backdrop-blur">
        <Button
          variant="secondary"
          onClick={preview}
          disabled={busy !== null}
          loading={busy === "preview"}
        >
          {busy === "preview" ? "A gerar…" : "Pré-visualizar"}
        </Button>

        {confirmSend ? (
          <div className="flex flex-wrap items-center gap-2">
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
            title={canSend ? undefined : "Preencha clientes e referência."}
            iconRight={<span aria-hidden="true">→</span>}
          >
            Gerar e enviar ao cliente
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Small presentational helpers ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-4">
      <h3 className="font-display text-base leading-tight text-foreground/90 mb-4">{title}</h3>
      {children}
    </Card>
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
    "w-6 h-6 rounded-md text-foreground/35 hover:text-foreground/65 hover:bg-foreground/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs leading-none";
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
}: {
  url?: string;
  onRemove: () => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-foreground/[0.1] bg-foreground/[0.04] ${className}`}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
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
  onFiles,
}: {
  label: string;
  busy: boolean;
  multiple: boolean;
  compact?: boolean;
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
        compact ? "aspect-square p-2" : "aspect-[4/3] p-3"
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
