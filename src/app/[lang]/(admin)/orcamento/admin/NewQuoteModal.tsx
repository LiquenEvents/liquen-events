"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import type { Quote, EventCategory } from "@/lib/orcamento/types";
import { useToast } from "./Toast";
import { Button, Field, FolhaOuDialogo } from "./ui";
import { porqueFalhou } from "@/lib/erro-do-servidor";

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
      // A mesma medição das Definições, feita aqui: com a ligação em baixo, o
      // aviso deste diálogo era «Failed to fetch». E vale para duas falhas, não
      // uma — o `res.json()` acima também lança quando o corpo não é JSON (um
      // 502 de um intermediário devolve HTML), e essa mensagem é igualmente do
      // browser e igualmente inglesa.
      toast(porqueFalhou(e, "Não foi possível criar o pedido. Verifica a ligação."), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FolhaOuDialogo
      aberto={open}
      onFechar={onClose}
      sobretitulo="Registo manual"
      titulo="Novo pedido"
      largura="md"
      // Era `z-[85]` à mão: acima dos avisos passageiros (80) e da gaveta do
      // pedido (50, e depois disto na árvore).
      nivel={85}
      accoes={
        <>
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
        </>
      }
    >
      {/* ── AS DUAS COLUNAS MEDEM A CAIXA, NÃO O ECRÃ ──────────────────────
          Eram `sm:grid-cols-2`/`sm:col-span-2`, e `sm:` pergunta pelo ECRÃ.
          Dentro de uma folha inferior o ecrã deixou de ser a pergunta certa:
          num tablet de 768 px o `sm:` disparava e punha dois campos lado a
          lado numa caixa que ali é a largura toda do aparelho, mas noutro
          sítio pode não ser. `@container` pergunta pela caixa — 26 rem é o
          mesmo limiar do `EventCosts` e do `PaymentsPanel`, para a casa não
          ficar com três números a dizer a mesma coisa.
          Os telemóveis todos ficam numa coluna: um iPhone Pro Max dá 388 px
          de caixa, abaixo dos 416 px do limiar. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-x-4 gap-y-5 @min-[26rem]:grid-cols-2">
          {duplicates.length > 0 && (
            <div className="@min-[26rem]:col-span-2 flex items-start gap-3 rounded-xl border border-[#b5894a]/25 bg-[#b5894a]/[0.06] p-3.5">
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
                  Podes continuar se for um evento diferente.
                </p>
              </div>
            </div>
          )}

          <Field
            variant="underline"
            containerClassName="@min-[26rem]:col-span-2"
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
            containerClassName="@min-[26rem]:col-span-2"
            label="Local"
            value={f.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Espaço / cidade"
          />
          <Field
            variant="underline"
            as="textarea"
            containerClassName="@min-[26rem]:col-span-2"
            label="Notas"
            rows={3}
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Detalhes da conversa, pedidos especiais…"
            className="resize-none"
          />
        </div>
      </div>
    </FolhaOuDialogo>
  );
}
