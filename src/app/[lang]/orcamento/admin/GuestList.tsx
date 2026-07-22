"use client";

import { useMemo, useState } from "react";
import { randomId } from "./util";
import { useToast } from "./Toast";
import { downloadCsv, guestsToCsvRows, printGuestList, dateStamp } from "./export";
import type { Quote, Guest, RsvpStatus } from "@/lib/orcamento/types";
import { Button, Field } from "./ui";

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
  const { toast } = useToast();
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
    // Otimista com reversão: falha do servidor repõe o estado e avisa.
    const snapshot = guests;
    setGuests(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestList: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setGuests(snapshot);
        onChange(snapshot);
        toast("Não foi possível guardar a lista de convidados. Tente novamente.", "error");
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
    <section className="border-t border-foreground/10 pt-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Lista de Convidados</p>
        {guests.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadCsv(`convidados-${quote.id}-${dateStamp()}`, guestsToCsvRows(quote))
              }
              title="Exportar convidados para CSV"
              aria-label="Exportar CSV"
              iconLeft={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              className="px-2"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => printGuestList(quote)}
              title="Imprimir lista de convidados"
              aria-label="Imprimir"
              iconLeft={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="6" y="14" width="12" height="7" rx="1" />
                </svg>
              }
              className="px-2"
            />
            <span className="ml-1 shrink-0 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] tabular-nums text-foreground/55">
              {guests.length} {guests.length === 1 ? "grupo" : "grupos"}
            </span>
          </div>
        )}
      </div>

      {/* Headcount summary */}
      <div className="mb-5 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-foreground/[0.04] p-3 text-center">
          <p className="text-base font-semibold text-[#4d6350]">{totals.confirmed}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Confirm.
          </p>
        </div>
        <div className="rounded-xl bg-foreground/[0.04] p-3 text-center">
          <p className="text-base font-semibold text-foreground/65">{totals.pending}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Pendente
          </p>
        </div>
        <div className="rounded-xl bg-foreground/[0.04] p-3 text-center">
          <p className="text-base font-semibold text-foreground/65">
            {totals.confirmed}
            <span className="font-normal text-foreground/40">/{estimate || "—"}</span>
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Estimativa
          </p>
        </div>
      </div>

      {/* Guests */}
      {guests.length > 0 ? (
        <ul className="mb-5 flex flex-col gap-1.5">
          {guests.map((g) => (
            <li
              key={g.id}
              className="group flex items-center gap-2.5 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground/80">{g.name}</p>
              </div>
              <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-foreground/45">
                <input
                  type="number"
                  min={1}
                  value={g.party}
                  onChange={(e) => setPartyOf(g.id, e.target.value)}
                  className="bo-input w-14 px-1.5 py-1 text-center text-xs text-foreground/75"
                  aria-label={`Convidados no grupo ${g.name}`}
                />
                convidados
              </label>
              <button
                onClick={() => cycle(g)}
                className="w-[86px] shrink-0 rounded-lg px-2 py-1 text-center text-[10px] uppercase tracking-[0.1em] motion-safe:transition-opacity hover:opacity-80"
                style={{
                  background: `${RSVP_META[g.rsvp].color}18`,
                  color: RSVP_META[g.rsvp].color,
                }}
                title="Clique para mudar o estado do RSVP"
              >
                {RSVP_META[g.rsvp].label}
              </button>
              <button
                onClick={() => remove(g.id)}
                className="shrink-0 rounded-md p-1 text-foreground/25 opacity-0 hover:text-[#8a2a22] focus-visible:opacity-100 motion-safe:transition-all group-hover:opacity-100"
                aria-label={`Remover ${g.name}`}
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
      ) : (
        <p className="mb-5 rounded-xl bg-foreground/[0.02] px-4 py-6 text-center text-sm leading-relaxed text-foreground/50">
          Ainda sem convidados. Adicione a primeira pessoa ou família abaixo — o número de
          confirmados atualiza-se sozinho.
        </p>
      )}

      {/* Add guest */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field
          as="input"
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nome (convidado ou família)"
          containerClassName="flex-1"
        />
        <Field
          as="input"
          type="number"
          min={1}
          label="Convidados"
          value={party}
          onChange={(e) => setParty(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="text-center"
          containerClassName="w-full sm:w-24"
        />
        <Button variant="primary" onClick={add} disabled={!name.trim()}>
          Adicionar
        </Button>
      </div>
    </section>
  );
}
