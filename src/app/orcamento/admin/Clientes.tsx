"use client";

import { useMemo, useState } from "react";
import type { Quote } from "../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "../data";
import { downloadCsv, dateStamp } from "./export";
import EmptyState from "./EmptyState";

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
  const [sort, setSort] = useState<"recent" | "value">("recent");

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
    let list = Array.from(map.values());
    list.sort(
      sort === "value"
        ? (a, b) => b.totalWon - a.totalWon || +new Date(b.lastAt) - +new Date(a.lastAt)
        : (a, b) => +new Date(b.lastAt) - +new Date(a.lastAt),
    );
    const s = search.trim().toLowerCase();
    if (s)
      list = list.filter((c) =>
        [c.name, c.email, c.phone, c.company]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(s)),
      );
    return list;
  }, [quotes, search, sort]);

  // A client is "VIP" once they've won 2+ events or €10k+ in accepted business.
  const isVip = (c: Client) =>
    c.totalWon >= 10000 || c.quotes.filter((q) => q.status === "aceite").length >= 2;

  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/28"
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
            className="bo-input pl-10 pr-3 py-2.5 text-sm text-foreground/70 placeholder-foreground/22"
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="bo-input px-3 py-2.5 text-xs text-foreground/55"
          >
            <option value="recent">Mais recentes</option>
            <option value="value">Maior valor</option>
          </select>
          <span className="hidden sm:inline text-foreground/30 text-xs">
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
            className="flex items-center gap-2 px-3 py-2.5 bg-white border border-foreground/[0.09] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm whitespace-nowrap"
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
            <div key={c.email || c.name} className="bo-card overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : c.email)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-foreground/[0.02] transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-[#4d6350] text-white flex items-center justify-center text-sm font-bold shrink-0 ring-2 ring-[#4d6350]/10">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/78 text-sm font-semibold truncate flex items-center gap-2">
                    <span className="truncate">{c.name}</span>
                    {isVip(c) && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#d6ab3a]/15 text-[#b88f28] text-[8px] tracking-[0.12em] uppercase font-bold">
                        ★ VIP
                      </span>
                    )}
                    {c.company && (
                      <span className="text-foreground/30 font-normal truncate hidden sm:inline">
                        · {c.company}
                      </span>
                    )}
                  </p>
                  <p className="text-foreground/30 text-xs truncate">{c.email}</p>
                </div>
                <div className="hidden sm:flex flex-col items-end shrink-0">
                  <span className="text-foreground/55 text-xs">
                    {c.quotes.length} pedido{c.quotes.length !== 1 ? "s" : ""}
                  </span>
                  {c.totalWon > 0 && (
                    <span className="text-[#4d6350] text-xs font-semibold">{eur(c.totalWon)}</span>
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
                <div className="border-t border-foreground/[0.07] divide-y divide-foreground/[0.06]">
                  <div className="px-5 py-3 flex flex-wrap gap-x-8 gap-y-1.5 text-xs bg-foreground/[0.015]">
                    <span className="text-foreground/35">
                      Tel:{" "}
                      <a
                        href={`tel:${c.phone}`}
                        className="text-foreground/55 hover:text-[#4d6350]"
                      >
                        {c.phone || "—"}
                      </a>
                    </span>
                    <span className="text-foreground/35">
                      Email:{" "}
                      <a
                        href={`mailto:${c.email}`}
                        className="text-[#4d6350]/80 hover:text-[#4d6350]"
                      >
                        {c.email}
                      </a>
                    </span>
                  </div>
                  {c.quotes.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => onOpen(q)}
                      className="w-full text-left px-5 py-3 hover:bg-foreground/[0.02] transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-foreground/60 text-xs truncate">
                          {eventTypeLabel(q)} · {q.guests} pax
                        </p>
                        <p className="text-foreground/25 text-[10px] font-mono">{q.id}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {q.quotedPrice ? (
                          <span className="text-[#4d6350] text-xs font-medium">
                            {eur(q.quotedPrice)}
                          </span>
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
          <EmptyState
            icon={
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <circle cx="9" cy="8" r="3" />
                <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
                <path d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.5-1.8-4.3-4-4.8" strokeLinecap="round" />
              </svg>
            }
            title={search.trim() ? "Nenhum cliente encontrado" : "Sem clientes ainda"}
            hint={
              search.trim()
                ? "Tente procurar por outro nome, email ou empresa."
                : "Os clientes formam-se automaticamente a partir dos pedidos recebidos."
            }
          />
        )}
      </div>
    </div>
  );
}
