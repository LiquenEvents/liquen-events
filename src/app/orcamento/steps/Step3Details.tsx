"use client";

import { useState } from "react";
import type { QuoteFormData, LocationType } from "../types";
import type { Action } from "../OrcamentoWizard";
import { LOCATION_LABELS } from "../data";
import { EVENT_TYPES_BY_CATEGORY } from "../data";

interface Props {
  form: QuoteFormData;
  dispatch: React.Dispatch<Action>;
}

const DURATION_PRESETS = [2, 4, 6, 8, 10, 12];
const LOCATION_OPTIONS: LocationType[] = [
  "lisboa",
  "porto",
  "grande_cidade",
  "pequena_cidade",
  "internacional",
];

export default function Step3Details({ form, dispatch }: Props) {
  const [guestInput, setGuestInput] = useState(String(form.guests || ""));

  const et =
    form.category && form.eventType
      ? EVENT_TYPES_BY_CATEGORY[form.category]?.find((e) => e.id === form.eventType)
      : null;

  const minGuests = et?.minGuests ?? 1;
  const maxGuests = et?.maxGuests ?? 5000;

  function handleGuests(val: string) {
    setGuestInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) {
      dispatch({ type: "SET", field: "guests", value: n });
    }
  }

  const inputClass =
    "w-full bg-transparent border-b border-foreground/15 pb-3 text-sm text-foreground placeholder-foreground/18 focus:outline-none focus:border-moss/55 transition-colors duration-300";
  const labelClass = "block text-[10px] text-foreground/28 tracking-[0.45em] uppercase mb-3";

  return (
    <div>
      <h2
        className="text-foreground font-bold leading-[0.92] mb-3"
        style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 44px)" }}
      >
        Detalhes
        <br />
        do evento
      </h2>
      <p className="text-foreground/35 text-sm leading-relaxed mb-10 max-w-md">
        Quanto mais detalhe partilhar, mais personalizada será a nossa proposta.
      </p>

      <div className="flex flex-col gap-9">
        {/* Nome do evento */}
        <div>
          <label className={labelClass}>Nome do Evento</label>
          <input
            type="text"
            placeholder="Ex: Conferência Anual XYZ 2026"
            value={form.eventName}
            onChange={(e) => dispatch({ type: "SET", field: "eventName", value: e.target.value })}
            className={inputClass}
          />
        </div>

        {/* Data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div>
            <label className={labelClass}>Data do Evento *</label>
            <input
              type="date"
              value={form.date}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => dispatch({ type: "SET", field: "date", value: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] text-foreground/28 tracking-[0.45em] uppercase">
                Evento Multi-dia?
              </label>
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "SET", field: "isMultiDay", value: !form.isMultiDay })
                }
                className={`w-9 h-5 rounded-full transition-colors duration-250 relative ${
                  form.isMultiDay ? "bg-moss" : "bg-foreground/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-250 ${
                    form.isMultiDay ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            {form.isMultiDay && (
              <input
                type="date"
                value={form.endDate}
                min={form.date || new Date().toISOString().split("T")[0]}
                onChange={(e) => dispatch({ type: "SET", field: "endDate", value: e.target.value })}
                className={inputClass}
                placeholder="Data de fim"
              />
            )}
          </div>
        </div>

        {/* Localização */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div>
            <label className={labelClass}>Cidade / Local</label>
            <input
              type="text"
              placeholder="Ex: Lisboa, Sintra, Comporta…"
              value={form.location}
              onChange={(e) => dispatch({ type: "SET", field: "location", value: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Região *</label>
            <select
              value={form.locationType}
              onChange={(e) =>
                dispatch({
                  type: "SET",
                  field: "locationType",
                  value: e.target.value as LocationType,
                })
              }
              className="w-full bg-transparent border-b border-foreground/15 pb-3 text-sm text-foreground focus:outline-none focus:border-moss/55 transition-colors duration-300 appearance-none cursor-pointer"
            >
              {LOCATION_OPTIONS.map((loc) => (
                <option key={loc} value={loc} className="bg-surface text-foreground">
                  {LOCATION_LABELS[loc]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Convidados */}
        <div>
          <label className={labelClass}>
            Número de Convidados *
            {et && (
              <span className="ml-2 text-foreground/22 normal-case tracking-normal">
                (min {et.minGuests} · max {et.maxGuests})
              </span>
            )}
          </label>
          <input
            type="number"
            min={minGuests}
            max={maxGuests}
            value={guestInput}
            onChange={(e) => handleGuests(e.target.value)}
            onBlur={() => {
              const n = parseInt(guestInput, 10);
              if (isNaN(n) || n < minGuests) {
                setGuestInput(String(minGuests));
                dispatch({ type: "SET", field: "guests", value: minGuests });
              }
            }}
            className={inputClass}
            placeholder={String(minGuests)}
          />
          {et && (
            <div className="mt-4">
              <input
                type="range"
                min={minGuests}
                max={Math.min(maxGuests, 500)}
                value={Math.min(form.guests || minGuests, 500)}
                onChange={(e) => {
                  setGuestInput(e.target.value);
                  dispatch({ type: "SET", field: "guests", value: parseInt(e.target.value, 10) });
                }}
                className="w-full accent-moss h-px"
              />
              <div className="flex justify-between text-foreground/22 text-[10px] mt-1.5">
                <span>{minGuests}</span>
                <span>{Math.min(maxGuests, 500)}+</span>
              </div>
            </div>
          )}
        </div>

        {/* Duração */}
        <div>
          <label className={labelClass}>Duração Estimada *</label>
          <div className="flex flex-wrap gap-2.5 mb-3">
            {DURATION_PRESETS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => dispatch({ type: "SET", field: "duration", value: h })}
                className={`px-4 py-2 rounded-sm text-xs tracking-[0.15em] uppercase border transition-all duration-200 ${
                  form.duration === h
                    ? "bg-moss border-moss text-cream"
                    : "border-foreground/15 text-foreground/40 hover:border-foreground/35 hover:text-foreground/70"
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={72}
              value={form.duration}
              onChange={(e) =>
                dispatch({
                  type: "SET",
                  field: "duration",
                  value: parseInt(e.target.value, 10) || 1,
                })
              }
              className="w-20 bg-transparent border-b border-foreground/15 pb-2 text-sm text-foreground focus:outline-none focus:border-moss/55 text-center"
            />
            <span className="text-foreground/35 text-sm">horas personalizadas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
