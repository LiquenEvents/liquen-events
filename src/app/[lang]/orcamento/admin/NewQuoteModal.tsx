"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import type { Quote, EventCategory } from "@/lib/orcamento/types";
import { useToast } from "./Toast";
import { useFocusTrap } from "./useFocusTrap";
import { Button, Field } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (q: Quote) => void;
  existingQuotes?: Quote[];
}

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  company: "",
  category: "" as EventCategory | "",
  eventType: "",
  date: "",
  guests: "",
  location: "",
  notes: "",
  referralSource: "Contacto direto",
};

export default function NewQuoteModal({ open, onClose, onCreated, existingQuotes }: Props) {
  const { toast } = useToast();
  const [f, setF] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  // Trap Tab within the dialog + restore focus to the trigger on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const set = (k: keyof typeof EMPTY, v: string) => setF((p) => ({ ...p, [k]: v }));
  const eventTypes = f.category ? (EVENT_TYPES_BY_CATEGORY[f.category as EventCategory] ?? []) : [];

  // Match the typed e-mail against existing quotes once per change, not per render.
  const email = f.email.trim().toLowerCase();
  const duplicates = useMemo(
    () => (email ? (existingQuotes ?? []).filter((q) => q.email.toLowerCase() === email) : []),
    [email, existingQuotes],
  );

  async function submit() {
    if (!f.name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/orcamento/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          category: f.category || null,
          eventType: f.eventType || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      toast("Pedido criado", "success");
      onCreated(data.quote);
      setF({ ...EMPTY });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao criar", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-7 pt-7 pb-5 sm:px-9">
          <div>
            <p className="bo-eyebrow text-foreground/40 mb-2">Registo manual</p>
            <h2
              id={titleId}
              className="text-foreground/90 text-xl leading-tight font-semibold"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Novo pedido
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="-mt-3 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/35 motion-safe:transition-colors hover:text-foreground/70"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-4 gap-y-5 overflow-y-auto px-7 pb-7 sm:grid-cols-2 sm:px-9">
          {duplicates.length > 0 && (
            <div className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-[#b5894a]/25 bg-[#b5894a]/[0.06] p-3.5">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a9781f"
                strokeWidth="1.9"
                strokeLinecap="round"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
              <div className="min-w-0">
                <p className="text-[#a9781f] text-xs font-semibold mb-0.5">
                  Este e-mail já tem {duplicates.length} pedido{duplicates.length !== 1 ? "s" : ""}{" "}
                  registado{duplicates.length !== 1 ? "s" : ""}
                </p>
                <p className="text-foreground/50 text-[11px] leading-relaxed">
                  Pode continuar se for um evento diferente.
                </p>
              </div>
            </div>
          )}

          <Field
            variant="underline"
            containerClassName="sm:col-span-2"
            label="Nome"
            required
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Nome do cliente"
            autoFocus
          />
          <Field
            variant="underline"
            label="E-mail"
            type="email"
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="email@exemplo.com"
          />
          <Field
            variant="underline"
            label="Telefone"
            type="tel"
            value={f.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+351 …"
          />
          <Field
            variant="underline"
            label="Empresa"
            value={f.company}
            onChange={(e) => set("company", e.target.value)}
          />
          <Field
            variant="underline"
            label="Como nos conheceu"
            value={f.referralSource}
            onChange={(e) => set("referralSource", e.target.value)}
          />
          <Field
            variant="underline"
            as="select"
            label="Categoria"
            value={f.category}
            onChange={(e) => {
              set("category", e.target.value);
              set("eventType", "");
            }}
          >
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Field>
          <Field
            variant="underline"
            as="select"
            label="Tipo de evento"
            value={f.eventType}
            onChange={(e) => set("eventType", e.target.value)}
            disabled={!eventTypes.length}
          >
            <option value="">—</option>
            {eventTypes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Field>
          <Field
            variant="underline"
            label="Data do evento"
            type="date"
            value={f.date}
            onChange={(e) => set("date", e.target.value)}
          />
          <Field
            variant="underline"
            label="Nº de convidados"
            type="number"
            min={0}
            value={f.guests}
            onChange={(e) => set("guests", e.target.value)}
          />
          <Field
            variant="underline"
            containerClassName="sm:col-span-2"
            label="Local"
            value={f.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Espaço / cidade"
          />
          <Field
            variant="underline"
            as="textarea"
            containerClassName="sm:col-span-2"
            label="Notas"
            rows={3}
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Detalhes da conversa, pedidos especiais…"
            className="resize-none"
          />
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-end gap-2 px-7 py-5 sm:px-9">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={saving}
            disabled={!f.name.trim()}
            iconRight={<span aria-hidden="true">→</span>}
          >
            {saving ? "A criar…" : "Criar pedido"}
          </Button>
        </div>
      </div>
    </div>
  );
}
