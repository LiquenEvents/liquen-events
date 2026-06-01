"use client";

import { useMemo, useState } from "react";
import type { Quote } from "../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "../data";
import { downloadCsv, dateStamp } from "./export";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro";
}

interface Client {
  email: string;
  name: string;
  phone: string;
  company: string;
  quotes: Quote[];
  totalWon: number;
  lastAt: string;
}

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
}

export default function Clientes({ quotes, onOpen }: Props) {
  const [search, setSearch] = useState("");

  const clients = useMemo(() => {
    const map = new Map<string, Client>();
    for (const q of quotes) {
      const key = (q.email || q.phone || q.name).toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          email: q.email,
          name: q.name,
          phone: q.phone,
          company: q.company,
          quotes: [],
          totalWon: 0,
          lastAt: q.submittedAt,
        });
      }
      const c = map.get(key)!;
      c.quotes.push(q);
      if (q.status === "aceite" && q.quotedPrice) c.totalWon += q.quotedPrice;
      if (+new Date(q.submittedAt) > +new Date(c.lastAt)) {
        c.lastAt = q.submittedAt;
        c.name = q.name;
        c.phone = q.phone;
        c.company = q.company;
      }
    }
    let list = Array.from(map.values()).sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
    const s = search.trim().toLowerCase();
    if (s)
      list = list.filter((c) =>
        [c.name, c.email, c.phone, c.company]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(s)),
      );
    return list;
  }, [quotes, search]);

  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar cliente…"
            className="w-full bg-surface-raised/50 border border-foreground/12 rounded-md pl-9 pr-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45"
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-foreground/30 text-xs">
            {clients.length} cliente{clients.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => {
              const rows: (string | number)[][] = [
                [
                  "Nome",
                  "Empresa",
                  "Email",
                  "Telefone",
                  "Nº pedidos",
                  "Total ganho (€)",
                  "Último contacto",
                ],
                ...clients.map((c) => [
                  c.name,
                  c.company ?? "",
                  c.email,
                  c.phone ?? "",
                  c.quotes.length,
                  c.totalWon || "",
                  new Date(c.lastAt).toLocaleDateString("pt-PT"),
                ]),
              ];
              downloadCsv(`clientes-${dateStamp()}`, rows);
            }}
            className="flex items-center gap-2 px-3 py-2 border border-foreground/12 text-foreground/40 text-[10px] tracking-[0.18em] uppercase rounded-md hover:border-moss/40 hover:text-moss transition-colors whitespace-nowrap"
            title="Exportar clientes para CSV (Excel)"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Exportar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {clients.map((c) => {
          const isOpen = open === c.email;
          return (
            <div
              key={c.email || c.name}
              className="border border-foreground/10 rounded-md bg-surface-raised/30 overflow-hidden"
            >
              <button
                onClick={() => setOpen(isOpen ? null : c.email)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-moss/4 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-moss/15 text-moss flex items-center justify-center text-sm font-bold shrink-0">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/75 text-sm font-medium truncate">
                    {c.name}
                    {c.company && (
                      <span className="text-foreground/30 font-normal"> · {c.company}</span>
                    )}
                  </p>
                  <p className="text-foreground/30 text-xs truncate">{c.email}</p>
                </div>
                <div className="hidden sm:flex flex-col items-end shrink-0">
                  <span className="text-foreground/55 text-xs">
                    {c.quotes.length} pedido{c.quotes.length !== 1 ? "s" : ""}
                  </span>
                  {c.totalWon > 0 && (
                    <span className="text-moss text-xs font-medium">{eur(c.totalWon)}</span>
                  )}
                </div>
                <span
                  className={`text-foreground/25 transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-foreground/8 divide-y divide-foreground/6">
                  <div className="px-5 py-3 flex flex-wrap gap-x-8 gap-y-1.5 text-xs bg-surface/40">
                    <span className="text-foreground/35">
                      Tel:{" "}
                      <a href={`tel:${c.phone}`} className="text-foreground/55 hover:text-moss">
                        {c.phone || "—"}
                      </a>
                    </span>
                    <span className="text-foreground/35">
                      Email:{" "}
                      <a href={`mailto:${c.email}`} className="text-moss/80 hover:text-moss">
                        {c.email}
                      </a>
                    </span>
                  </div>
                  {c.quotes.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => onOpen(q)}
                      className="w-full text-left px-5 py-3 hover:bg-moss/5 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-foreground/60 text-xs truncate">
                          {eventTypeLabel(q)} · {q.guests} pax
                        </p>
                        <p className="text-foreground/25 text-[10px] font-mono">{q.id}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {q.quotedPrice ? (
                          <span className="text-moss text-xs">{eur(q.quotedPrice)}</span>
                        ) : null}
                        <p className="text-foreground/25 text-[10px]">
                          {new Date(q.submittedAt).toLocaleDateString("pt-PT", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {clients.length === 0 && (
          <p className="text-foreground/25 text-sm text-center py-16">Nenhum cliente encontrado.</p>
        )}
      </div>
    </div>
  );
}
