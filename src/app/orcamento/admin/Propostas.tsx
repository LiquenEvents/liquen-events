"use client";

import { useEffect, useState } from "react";
import type { Proposal, ProposalStatus } from "../types";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const STATUS_META: Record<ProposalStatus, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "#8a8a82" },
  enviada: { label: "Enviada", color: "#9aa36a" },
  aceite: { label: "Aceite", color: "#525a2f" },
  rejeitada: { label: "Rejeitada", color: "#5a5a55" },
};

export default function Propostas() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/propostas", { cache: "no-store" });
        if (res.ok) setProposals(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = filter === "all" ? proposals : proposals.filter((p) => p.status === filter);
  const totalSent = proposals
    .filter((p) => p.status === "enviada" || p.status === "aceite")
    .reduce((s, p) => s + p.total, 0);
  const totalWon = proposals.filter((p) => p.status === "aceite").reduce((s, p) => s + p.total, 0);

  if (loading) return <p className="text-foreground/25 text-sm py-16 text-center">A carregar…</p>;

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { v: String(proposals.length), l: "Propostas", accent: true },
          { v: eur(totalSent), l: "Valor proposto" },
          { v: eur(totalWon), l: "Valor ganho", accent: true },
          {
            v: `${proposals.length ? Math.round((proposals.filter((p) => p.status === "aceite").length / proposals.length) * 100) : 0}%`,
            l: "Taxa aceitação",
          },
        ].map((k) => (
          <div
            key={k.l}
            className="border border-foreground/10 rounded-md p-4 bg-surface-raised/40"
          >
            <p
              className={`font-bold leading-none mb-1.5 ${k.accent ? "text-moss" : "text-foreground/80"}`}
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(18px, 2.2vw, 26px)" }}
            >
              {k.v}
            </p>
            <p className="text-foreground/30 text-[9px] tracking-[0.25em] uppercase">{k.l}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilter("all")}
          className={`px-3.5 py-1.5 rounded-sm text-[10px] tracking-[0.15em] uppercase border transition-colors ${filter === "all" ? "bg-moss border-moss text-cream" : "border-foreground/15 text-foreground/35 hover:border-foreground/30"}`}
        >
          Todas ({proposals.length})
        </button>
        {(Object.keys(STATUS_META) as ProposalStatus[]).map((s) => {
          const count = proposals.filter((p) => p.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3.5 py-1.5 rounded-sm text-[10px] tracking-[0.15em] uppercase border transition-colors ${filter === s ? "bg-moss border-moss text-cream" : "border-foreground/15 text-foreground/35 hover:border-foreground/30"}`}
            >
              {STATUS_META[s].label} ({count})
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="border border-foreground/10 rounded-md bg-surface-raised/30 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-foreground/25 text-sm text-center py-16">
            Nenhuma proposta {filter !== "all" ? "neste estado" : "criada ainda"}.
          </p>
        ) : (
          <div className="divide-y divide-foreground/6">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="px-5 py-4 flex items-center gap-4 hover:bg-moss/4 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/70 text-sm font-medium truncate">{p.clientName}</p>
                  <p className="text-foreground/28 text-xs truncate">
                    {p.clientEmail} · {p.lineItems.length} linha
                    {p.lineItems.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="hidden sm:block text-right shrink-0">
                  <p className="text-foreground/22 text-[10px]">
                    {new Date(p.createdAt).toLocaleDateString("pt-PT")}
                  </p>
                  {p.validUntil && (
                    <p className="text-foreground/22 text-[10px]">
                      Válida até {new Date(p.validUntil + "T12:00:00").toLocaleDateString("pt-PT")}
                    </p>
                  )}
                </div>
                <span className="text-foreground/70 text-sm font-medium w-24 text-right shrink-0">
                  {eur(p.total)}
                </span>
                <span
                  className="text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm shrink-0 w-20 text-center"
                  style={{
                    background: `${STATUS_META[p.status].color}22`,
                    color: STATUS_META[p.status].color,
                  }}
                >
                  {STATUS_META[p.status].label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
