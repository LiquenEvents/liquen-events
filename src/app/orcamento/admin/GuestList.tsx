"use client";

import { useMemo, useState } from "react";
import { randomId } from "./util";
import { downloadCsv, guestsToCsvRows, printGuestList, dateStamp } from "./export";
import type { Quote, Guest, RsvpStatus } from "../types";

const RSVP_META: Record<RsvpStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "#8a8a82" },
  confirmado: { label: "Confirmado", color: "#4d6350" },
  recusado: { label: "Recusado", color: "#b5654a" },
};

interface Props {
  quote: Quote;
  onChange: (guestList: Guest[]) => void;
}

/**
 * Event RSVP / guest list. Each entry is a person or party (`party` = headcount
 * for that entry), so the confirmed headcount is the sum of confirmed parties —
 * shown against the estimate the client gave (quote.guests) so the team can see
 * at a glance how the numbers are firming up.
 */
export default function GuestList({ quote, onChange }: Props) {
  const [guests, setGuests] = useState<Guest[]>(quote.guestList ?? []);
  const [name, setName] = useState("");
  const [party, setParty] = useState("1");

  const totals = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    let declined = 0;
    for (const g of guests) {
      const n = g.party || 1;
      if (g.rsvp === "confirmado") confirmed += n;
      else if (g.rsvp === "pendente") pending += n;
      else declined += n;
    }
    return { confirmed, pending, declined };
  }, [guests]);

  function persist(next: Guest[]) {
    setGuests(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestList: next }),
    });
  }

  function add() {
    const n = name.trim();
    if (!n) return;
    persist([
      ...guests,
      { id: randomId(), name: n, party: Math.max(1, parseInt(party) || 1), rsvp: "pendente" },
    ]);
    setName("");
    setParty("1");
  }
  function remove(id: string) {
    persist(guests.filter((g) => g.id !== id));
  }
  // Tap the badge to cycle the RSVP state.
  function cycle(g: Guest) {
    const order: RsvpStatus[] = ["pendente", "confirmado", "recusado"];
    const next = order[(order.indexOf(g.rsvp) + 1) % order.length];
    persist(guests.map((x) => (x.id === g.id ? { ...x, rsvp: next } : x)));
  }
  function setPartyOf(id: string, value: string) {
    const n = Math.max(1, parseInt(value) || 1);
    persist(guests.map((x) => (x.id === id ? { ...x, party: n } : x)));
  }

  const estimate = quote.guests || 0;

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between mb-4">
        <p className="bo-eyebrow">Lista de Convidados</p>
        <div className="flex items-center gap-1.5">
          {guests.length > 0 && (
            <>
              <button
                onClick={() =>
                  downloadCsv(`convidados-${quote.id}-${dateStamp()}`, guestsToCsvRows(quote))
                }
                className="text-foreground/35 hover:text-[#4d6350] transition-colors p-1"
                title="Exportar convidados para CSV"
                aria-label="Exportar CSV"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                onClick={() => printGuestList(quote)}
                className="text-foreground/35 hover:text-[#4d6350] transition-colors p-1"
                title="Imprimir lista de convidados"
                aria-label="Imprimir"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path
                    d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="6" y="14" width="12" height="7" rx="1" />
                </svg>
              </button>
              <span className="text-foreground/35 text-[10px] tabular-nums bg-foreground/[0.05] rounded-full px-2 py-0.5 ml-0.5">
                {guests.length} {guests.length === 1 ? "grupo" : "grupos"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Headcount summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-foreground/[0.04] rounded-lg p-2.5 text-center">
          <p className="text-sm font-semibold text-[#4d6350]">{totals.confirmed}</p>
          <p className="text-foreground/25 text-[9px] tracking-[0.2em] uppercase mt-0.5">
            Confirm.
          </p>
        </div>
        <div className="bg-foreground/[0.04] rounded-lg p-2.5 text-center">
          <p className="text-sm font-semibold text-foreground/60">{totals.pending}</p>
          <p className="text-foreground/25 text-[9px] tracking-[0.2em] uppercase mt-0.5">
            Pendente
          </p>
        </div>
        <div className="bg-foreground/[0.04] rounded-lg p-2.5 text-center">
          <p className="text-sm font-semibold text-foreground/60">
            {totals.confirmed}
            <span className="text-foreground/30 font-normal">/{estimate || "—"}</span>
          </p>
          <p className="text-foreground/25 text-[9px] tracking-[0.2em] uppercase mt-0.5">
            Estimativa
          </p>
        </div>
      </div>

      {/* Guests */}
      {guests.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-4">
          {guests.map((g) => (
            <div
              key={g.id}
              className="group flex items-center gap-2.5 bg-foreground/[0.02] border border-foreground/[0.07] rounded-lg px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-foreground/72 text-xs font-medium truncate">{g.name}</p>
              </div>
              <label className="flex items-center gap-1 text-[10px] text-foreground/35 shrink-0">
                <input
                  type="number"
                  min={1}
                  value={g.party}
                  onChange={(e) => setPartyOf(g.id, e.target.value)}
                  className="bo-input w-12 px-1.5 py-1 text-xs text-foreground/70 text-center"
                  aria-label={`Pessoas no grupo ${g.name}`}
                />
                pax
              </label>
              <button
                onClick={() => cycle(g)}
                className="text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-md shrink-0 transition-opacity hover:opacity-80 w-[78px] text-center"
                style={{
                  background: `${RSVP_META[g.rsvp].color}18`,
                  color: RSVP_META[g.rsvp].color,
                }}
                title="Clique para mudar o estado"
              >
                {RSVP_META[g.rsvp].label}
              </button>
              <button
                onClick={() => remove(g.id)}
                className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all shrink-0 text-sm leading-none"
                aria-label="Remover"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add guest */}
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nome (convidado ou família)"
          className="bo-input flex-1 px-2.5 py-1.5 text-xs text-foreground/70 placeholder-foreground/25"
        />
        <input
          type="number"
          min={1}
          value={party}
          onChange={(e) => setParty(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="pax"
          className="bo-input w-14 px-2 py-1.5 text-xs text-foreground/70 text-center"
          aria-label="Número de pessoas"
        />
        <button
          onClick={add}
          disabled={!name.trim()}
          className="px-3.5 py-1.5 rounded-lg bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
