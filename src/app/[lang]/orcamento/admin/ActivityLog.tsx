"use client";

import { useState } from "react";
import type { Quote, ActivityEntry, ActivityKind } from "@/lib/orcamento/types";
import { randomId } from "./util";

const KIND_META: Record<ActivityKind, { label: string; color: string; d: string }> = {
  created: {
    label: "Pedido recebido",
    color: "#4d6350",
    d: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 3h6v4H9z",
  },
  status_change: {
    label: "Estado alterado",
    color: "#7c854b",
    d: "M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  },
  price_set: {
    label: "Preço definido",
    color: "#4d6350",
    d: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  },
  note_added: {
    label: "Notas internas",
    color: "#8a8a82",
    d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z",
  },
  message_sent: {
    label: "Mensagem enviada",
    color: "#4d6350",
    d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  },
  proposal_sent: {
    label: "Proposta enviada",
    color: "#7c854b",
    d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4",
  },
  follow_up_set: {
    label: "Seguimento agendado",
    color: "#b5894a",
    d: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  },
  tags_updated: {
    label: "Etiquetas",
    color: "#8a8a82",
    d: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01",
  },
  payment_added: {
    label: "Pagamento",
    color: "#4d6350",
    d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
  },
  supplier_added: {
    label: "Fornecedor",
    color: "#7c854b",
    d: "M3 9l1-5h16l1 5M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9zM9 9v11M15 9v11",
  },
  manual_note: {
    label: "Nota manual",
    color: "#8a8a82",
    d: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  },
  call_logged: {
    label: "Chamada registada",
    color: "#b5894a",
    d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.07 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  },
  assigned: {
    label: "Atribuído",
    color: "#4d6350",
    d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  },
};

function timeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    ...(days > 365 ? { year: "numeric" } : {}),
  });
}

interface Props {
  quote: Quote;
  onAddEntry?: (entry: ActivityEntry) => Promise<void>;
  actor?: string;
}

export default function ActivityLog({ quote, onAddEntry, actor }: Props) {
  const [mode, setMode] = useState<null | "note" | "call">(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const synthetic: ActivityEntry = {
    id: "__created__",
    at: quote.submittedAt,
    kind: "created",
    summary: "Pedido de orçamento submetido",
  };

  const entries = [synthetic, ...(quote.activityLog ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  async function submitEntry() {
    if (!text.trim() || !onAddEntry || saving) return;
    setSaving(true);
    try {
      await onAddEntry({
        id: randomId(),
        at: new Date().toISOString(),
        kind: mode === "call" ? "call_logged" : "manual_note",
        actor,
        summary: text.trim(),
      });
      setText("");
      setMode(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="bo-eyebrow">Histórico de Atividade</p>
        {onAddEntry && mode === null && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("call")}
              className="flex items-center gap-1 text-[#b5894a] text-[10px] tracking-[0.1em] uppercase font-medium hover:opacity-70 transition-opacity"
              title="Registar chamada telefónica"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={KIND_META.call_logged.d} />
              </svg>
              Chamada
            </button>
            <span className="text-foreground/15">|</span>
            <button
              onClick={() => setMode("note")}
              className="text-foreground/40 text-[10px] tracking-[0.1em] uppercase font-medium hover:text-[#4d6350] transition-colors"
            >
              + Nota
            </button>
          </div>
        )}
      </div>

      {mode !== null && (
        <div className="mb-4 p-3 rounded-xl border border-dashed border-foreground/15 bg-foreground/[0.02]">
          <p className="text-[10px] tracking-[0.15em] uppercase text-foreground/35 mb-2">
            {mode === "call" ? "Registar chamada" : "Adicionar nota"}
          </p>
          <textarea
            autoFocus
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setMode(null);
                setText("");
              }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitEntry();
            }}
            placeholder={
              mode === "call"
                ? "Ex.: Ligação às 14h — cliente pediu proposta com DJ incluído, orçamento até €3k..."
                : "Ex.: Email de acompanhamento enviado. Cliente viaja até dia 15..."
            }
            className="w-full bo-input px-3 py-2 text-sm text-foreground/70 resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-foreground/22 text-[10px]">
              Ctrl+Enter para guardar · Esc para cancelar
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMode(null);
                  setText("");
                }}
                className="text-foreground/35 text-[10px] uppercase tracking-[0.1em] hover:text-foreground/60 transition-colors px-1"
              >
                Cancelar
              </button>
              <button
                onClick={submitEntry}
                disabled={!text.trim() || saving}
                className="px-3 py-1 bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase rounded-lg hover:bg-[#2a3227] transition-colors disabled:opacity-40"
              >
                {saving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {entries.length > 1 && (
          <div className="absolute left-3 top-3 bottom-3 w-px bg-foreground/[0.07]" />
        )}
        <div className="flex flex-col">
          {entries.map((entry, i) => {
            const m = KIND_META[entry.kind];
            return (
              <div key={entry.id} className={`flex gap-3 ${i < entries.length - 1 ? "pb-4" : ""}`}>
                <div
                  className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-0.5 z-10"
                  style={{ background: `${m.color}14`, border: `1.5px solid ${m.color}38` }}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={m.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={m.d} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-foreground/65 text-xs font-medium leading-snug whitespace-pre-line">
                      {entry.summary}
                    </p>
                    <span className="text-foreground/22 text-[10px] shrink-0 whitespace-nowrap">
                      {timeLabel(entry.at)}
                    </span>
                  </div>
                  <p className="text-foreground/28 text-[10px] mt-0.5">
                    {m.label}
                    {entry.actor ? ` · ${entry.actor}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
