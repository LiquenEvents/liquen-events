"use client";

import { useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { useToast } from "./Toast";
import { todayKey } from "./util";

interface Props {
  quote: Quote;
  onChange: (followUpAt: string | undefined) => void;
}

// Dias a partir do dia LOCAL de hoje (não UTC — perto da meia-noite a data
// saltava um dia para quem está a leste/oeste de UTC; ver util.todayKey).
function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A per-lead follow-up date. Persists immediately. Quick presets cover the
 * common "chase in a few days / next week" cadence; due follow-ups then surface
 * in Reminders + Agenda so no proposal goes cold.
 */
export default function FollowUpField({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [value, setValue] = useState<string>(quote.followUpAt ?? "");

  function persist(next: string | undefined) {
    // Otimista com reversão: falha do servidor repõe o estado e avisa.
    const snapshot = quote.followUpAt;
    setValue(next ?? "");
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpAt: next ?? null }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setValue(snapshot ?? "");
        onChange(snapshot);
        toast("Não foi possível guardar o seguimento. Tente novamente.", "error");
      });
  }

  const overdue = value && value < todayKey();
  const isToday = value === todayKey();

  return (
    <div>
      <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">
        Seguimento
      </label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value}
          onChange={(e) => persist(e.target.value || undefined)}
          className="bo-input flex-1 px-3 py-2 text-sm text-foreground/70"
        />
        {value && (
          <button
            onClick={() => persist(undefined)}
            className="px-3 py-2 text-foreground/40 text-[10px] tracking-[0.15em] uppercase hover:text-foreground/65 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {[
          { label: "+3 dias", days: 3 },
          { label: "+1 semana", days: 7 },
          { label: "+2 semanas", days: 14 },
        ].map((p) => (
          <button
            key={p.label}
            onClick={() => persist(plusDays(p.days))}
            className="px-2.5 py-1 rounded-full bg-foreground/[0.05] text-foreground/45 text-[10px] hover:bg-foreground/[0.09] hover:text-foreground/70 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      {value && (
        <p
          className={`text-[10px] mt-2 ${overdue ? "text-[#b5654a]" : isToday ? "text-[#4d6350]" : "text-foreground/35"}`}
        >
          {overdue
            ? "Seguimento em atraso"
            : isToday
              ? "Seguimento hoje"
              : `Seguimento a ${new Date(value + "T12:00:00").toLocaleDateString("pt-PT", {
                  day: "numeric",
                  month: "long",
                })}`}
        </p>
      )}
    </div>
  );
}
