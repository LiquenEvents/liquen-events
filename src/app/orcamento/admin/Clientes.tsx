"use client";

import { useMemo, useState } from "react";
import type { Quote, QuoteStatus } from "../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "../data";
import { downloadCsv, dateStamp } from "./export";
import EmptyState from "./EmptyState";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "#8a8a82" },
  em_revisao: { label: "Em Revisão", color: "#9aa36a" },
  cotado: { label: "Cotado", color: "#7c854b" },
  aceite: { label: "Aceite", color: "#525a2f" },
  rejeitado: { label: "Rejeitado", color: "#5a5a55" },
};

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro";
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days}d`;
  const months = Math.round(days / 30);
  return `há ${months} ${months === 1 ? "mês" : "meses"}`;
}

interface Client {
  email: string;
  name: string;
  phone: string;
  company: string;
  quotes: Quote[];
  totalWon: number;
  totalPipeline: number;
  wonCount: number;
  rejectedCount: number;
  lastAt: string;
}

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
}

export default function Clientes({ quotes, onOpen }: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "value" | "pipeline">("recent");
  const [vipOnly, setVipOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

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
          totalPipeline: 0,
          wonCount: 0,
          rejectedCount: 0,
          lastAt: q.submittedAt,
        });
      }
      const c = map.get(key)!;
      c.quotes.push(q);
      if (q.status === "aceite" && q.quotedPrice) {
        c.totalWon += q.quotedPrice;
        c.wonCount++;
      }
      if (q.status === "rejeitado") c.rejectedCount++;
      if (q.status === "cotado" && q.quotedPrice) c.totalPipeline += q.quotedPrice;
      const latestAt = q.lastUpdated ?? q.submittedAt;
      if (+new Date(latestAt) > +new Date(c.lastAt)) {
        c.lastAt = latestAt;
        c.name = q.name;
        c.phone = q.phone;
        c.company = q.company;
      }
    }
    let list = Array.from(map.values());

    if (vipOnly) list = list.filter((c) => c.totalWon >= 10000 || c.wonCount >= 2);

    const s = search.trim().toLowerCase();
    if (s)
      list = list.filter((c) =>
        [c.name, c.email, c.phone, c.company]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(s)),
      );

    list.sort(
      sort === "value"
        ? (a, b) => b.totalWon - a.totalWon || +new Date(b.lastAt) - +new Date(a.lastAt)
        : sort === "pipeline"
          ? (a, b) => b.totalPipeline - a.totalPipeline || +new Date(b.lastAt) - +new Date(a.lastAt)
          : (a, b) => +new Date(b.lastAt) - +new Date(a.lastAt),
    );
    return list;
  }, [quotes, search, sort, vipOnly]);

  const isVip = (c: Client) => c.totalWon >= 10000 || c.wonCount >= 2;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setVipOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all ${vipOnly ? "bg-[#d6ab3a]/15 text-[#b88f28] shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07]"}`}
          >
            ★ VIP
          </button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="bo-input px-3 py-2.5 text-xs text-foreground/55"
          >
            <option value="recent">Mais recentes</option>
            <option value="value">Maior valor ganho</option>
            <option value="pipeline">Maior pipeline</option>
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
                  "Pedidos",
                  "Ganho (€)",
                  "Pipeline (€)",
                  "Taxa conversão",
                  "Último contacto",
                ],
                ...clients.map((c) => {
                  const decided = c.wonCount + c.rejectedCount;
                  const rate = decided > 0 ? `${Math.round((c.wonCount / decided) * 100)}%` : "—";
                  return [
                    c.name,
                    c.company ?? "",
                    c.email,
                    c.phone ?? "",
                    c.quotes.length,
                    c.totalWon || "",
                    c.totalPipeline || "",
                    rate,
                    new Date(c.lastAt).toLocaleDateString("pt-PT"),
                  ];
                }),
              ];
              downloadCsv(`clientes-${dateStamp()}`, rows);
            }}
            className="flex items-center gap-2 px-3 py-2.5 bg-white border border-foreground/[0.09] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm whitespace-nowrap"
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

      {/* List */}
      <div className="flex flex-col gap-2">
        {clients.map((c) => {
          const isOpen = open === (c.email || c.name);
          const decided = c.wonCount + c.rejectedCount;
          const convRate = decided > 0 ? Math.round((c.wonCount / decided) * 100) : -1;
          const waPhone = c.phone?.replace(/[^\d+]/g, "");

          return (
            <div key={c.email || c.name} className="bo-card overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : c.email || c.name)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-foreground/[0.02] transition-colors"
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ring-2 ${isVip(c) ? "bg-[#d6ab3a]/20 text-[#b88f28] ring-[#d6ab3a]/20" : "bg-[#4d6350] text-white ring-[#4d6350]/10"}`}
                >
                  {c.name.slice(0, 1).toUpperCase()}
                </div>

                {/* Name + email */}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/78 text-sm font-semibold truncate flex items-center gap-2">
                    <span className="truncate">{c.name}</span>
                    {isVip(c) && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#d6ab3a]/15 text-[#b88f28] text-[8px] tracking-[0.12em] uppercase font-bold">
                        ★ VIP
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-foreground/30 text-xs truncate">{c.email}</p>
                    {c.company && (
                      <span className="text-foreground/22 text-[10px] hidden sm:inline truncate">
                        · {c.company}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 text-right">
                  <div className="flex items-center gap-3">
                    {c.totalWon > 0 && (
                      <span className="text-[#4d6350] text-xs font-semibold">
                        {eur(c.totalWon)}
                      </span>
                    )}
                    {c.totalPipeline > 0 && c.totalWon === 0 && (
                      <span className="text-foreground/40 text-xs">
                        {eur(c.totalPipeline)} pipeline
                      </span>
                    )}
                    {c.totalPipeline > 0 && c.totalWon > 0 && (
                      <span className="text-foreground/28 text-[10px]">
                        +{eur(c.totalPipeline)} pipeline
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/35 text-[10px]">
                      {c.quotes.length} pedido{c.quotes.length !== 1 ? "s" : ""}
                    </span>
                    {convRate >= 0 && (
                      <span
                        className={`text-[10px] font-medium ${convRate >= 50 ? "text-[#4d6350]" : convRate >= 25 ? "text-foreground/50" : "text-foreground/30"}`}
                      >
                        {convRate}% conv.
                      </span>
                    )}
                  </div>
                </div>

                {/* Last activity + chevron */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-foreground/22 text-[10px] hidden sm:inline">
                    {timeAgo(c.lastAt)}
                  </span>
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
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-foreground/[0.07]">
                  {/* Contact bar */}
                  <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs bg-foreground/[0.015] border-b border-foreground/[0.05]">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="text-foreground/45 hover:text-[#4d6350] transition-colors flex items-center gap-1"
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.07 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="text-[#4d6350]/80 hover:text-[#4d6350] transition-colors flex items-center gap-1"
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        {c.email}
                      </a>
                    )}
                    {waPhone && (
                      <a
                        href={`https://wa.me/${waPhone.replace("+", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#4d6350] text-[10px] tracking-[0.08em] uppercase hover:opacity-75 transition-opacity flex items-center gap-1"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
                        </svg>
                        WhatsApp
                      </a>
                    )}
                    {/* Mini stats */}
                    <div className="ml-auto flex items-center gap-3">
                      {convRate >= 0 && (
                        <span className="text-foreground/35">
                          {convRate}% taxa de conversão ({c.wonCount}/{decided} decididos)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quote rows */}
                  <div className="divide-y divide-foreground/[0.06]">
                    {c.quotes
                      .slice()
                      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
                      .map((q) => (
                        <button
                          key={q.id}
                          onClick={() => onOpen(q)}
                          className="w-full text-left px-5 py-3 hover:bg-foreground/[0.02] transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span
                                className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm"
                                style={{
                                  background: `${STATUS_META[q.status].color}18`,
                                  color: STATUS_META[q.status].color,
                                }}
                              >
                                {STATUS_META[q.status].label}
                              </span>
                              {q.assignedTo && (
                                <span className="text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded bg-[#4d6350]/10 text-[#4d6350] font-medium">
                                  {q.assignedTo}
                                </span>
                              )}
                            </div>
                            <p className="text-foreground/55 text-xs truncate">
                              {eventTypeLabel(q)} · {q.guests} pax
                              {q.date
                                ? ` · ${new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })}`
                                : ""}
                            </p>
                            {q.lostReason && (
                              <p className="text-foreground/28 text-[10px] truncate mt-0.5">
                                ↳ {q.lostReason}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            {q.quotedPrice ? (
                              <span className="text-[#4d6350] text-xs font-medium">
                                {eur(q.quotedPrice)}
                              </span>
                            ) : q.priceBreakdown?.total ? (
                              <span className="text-foreground/28 text-xs">
                                ≈{eur(q.priceBreakdown.total)}
                              </span>
                            ) : null}
                            <p className="text-foreground/22 text-[10px] font-mono">
                              {q.id.slice(-8)}
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
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
            title={search.trim() || vipOnly ? "Nenhum cliente encontrado" : "Sem clientes ainda"}
            hint={
              search.trim()
                ? "Tente procurar por outro nome, email ou empresa."
                : vipOnly
                  ? "Ainda não há clientes VIP."
                  : "Os clientes formam-se automaticamente a partir dos pedidos recebidos."
            }
          />
        )}
      </div>
    </div>
  );
}
