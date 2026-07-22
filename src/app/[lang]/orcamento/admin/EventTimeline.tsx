"use client";

import { useState } from "react";
import { randomId } from "./util";
import { useToast } from "./Toast";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";
import { Button, Field, EmptyState } from "./ui";

interface Props {
  quote: Quote;
  onChange: (items: TimelineItem[]) => void;
}

// Sensible starting run sheet for a typical event day.
const TEMPLATE: Omit<TimelineItem, "id">[] = [
  { time: "09:00", title: "Montagem e decoração do espaço" },
  { time: "12:00", title: "Chegada de fornecedores (catering, som)" },
  { time: "16:00", title: "Receção dos convidados" },
  { time: "17:00", title: "Cerimónia" },
  { time: "18:30", title: "Cocktail de boas-vindas" },
  { time: "20:00", title: "Jantar" },
  { time: "23:00", title: "Festa / momento de dança" },
  { time: "02:00", title: "Encerramento e desmontagem" },
];

function sortByTime(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => a.time.localeCompare(b.time));
}

export default function EventTimeline({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<TimelineItem[]>(quote.timeline ?? []);
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");

  function persist(next: TimelineItem[]) {
    const sorted = sortByTime(next);
    // Otimista com reversão: falha do servidor repõe o estado e avisa.
    const snapshot = items;
    setItems(sorted);
    onChange(sorted);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeline: sorted }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setItems(snapshot);
        onChange(snapshot);
        toast("Não foi possível guardar o guião. Tente novamente.", "error");
      });
  }

  function seed() {
    persist(TEMPLATE.map((t) => ({ ...t, id: randomId() })));
  }
  function add() {
    const t = title.trim();
    if (!t || !time) return;
    persist([...items, { id: randomId(), time, title: t, owner: owner.trim() || undefined }]);
    setTime("");
    setTitle("");
    setOwner("");
  }
  function remove(id: string) {
    persist(items.filter((i) => i.id !== id));
  }

  return (
    <section className="border-t border-foreground/10 pt-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Cronograma do Dia</p>
        {items.length > 0 && (
          <span className="shrink-0 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] tabular-nums text-foreground/55">
            {items.length} {items.length === 1 ? "momento" : "momentos"}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          className="px-4 py-10"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
          title="Guião do dia por preencher"
          description="Gere um cronograma-base para um dia de evento típico e adapte os momentos a este evento."
          action={{ label: "Gerar cronograma-base", onClick: seed }}
        />
      ) : (
        <div className="relative mb-5 pl-1">
          {/* vertical line */}
          <div className="absolute left-[3.25rem] top-3 bottom-3 w-px bg-foreground/10" />
          <ul className="flex flex-col">
            {items.map((i) => (
              <li
                key={i.id}
                className="group relative flex items-start gap-3 rounded-xl py-2.5 pr-1 hover:bg-foreground/[0.02]"
              >
                <span className="w-12 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-[#4d6350]">
                  {i.time}
                </span>
                <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#4d6350] ring-4 ring-white" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-foreground/80">{i.title}</p>
                  {i.owner && <p className="mt-0.5 text-xs text-foreground/45">{i.owner}</p>}
                </div>
                <button
                  onClick={() => remove(i.id)}
                  className="shrink-0 rounded-md p-1 text-foreground/25 opacity-0 hover:text-[#8a2a22] focus-visible:opacity-100 motion-safe:transition-all group-hover:opacity-100"
                  aria-label={`Remover ${i.time} ${i.title}`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add row */}
      <div className="flex flex-wrap items-end gap-2">
        <Field
          as="input"
          type="time"
          label="Hora"
          hideLabel
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="px-2.5"
          containerClassName="w-[104px]"
        />
        <Field
          as="input"
          label="Momento"
          hideLabel
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Momento…"
          containerClassName="min-w-[8rem] flex-1"
        />
        <Field
          as="input"
          label="Responsável"
          hideLabel
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Resp."
          containerClassName="w-24"
        />
        <Button variant="primary" onClick={add} disabled={!title.trim() || !time}>
          Adicionar
        </Button>
      </div>
    </section>
  );
}
