"use client";

import { useEffect, useState } from "react";
import type { Proposal, ProposalStatus } from "../types";
import { SkeletonList } from "./Skeleton";
import EmptyState from "./EmptyState";

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

  if (loading) return <SkeletonList rows={5} />;

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
            className={`relative overflow-hidden rounded-xl p-4 border ${
              k.accent
                ? "bg-[#1b2119] border-[#2d3829]"
                : "bg-white border-foreground/[0.08] shadow-sm"
            }`}
          >
            {k.accent && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 85% 15%, rgba(99,122,95,0.25) 0%, transparent 60%)",
                }}
              />
            )}
            <p
              className={`font-bold leading-none mb-1.5 relative ${k.accent ? "text-[#8aad85]" : "text-foreground/82"}`}
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(18px, 2.2vw, 26px)" }}
            >
              {k.v}
            </p>
            <p
              className={`text-[9px] tracking-[0.25em] uppercase relative ${k.accent ? "text-white/30" : "text-foreground/30"}`}
            >
              {k.l}
            </p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setFilter("all")}
          className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${filter === "all" ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07] hover:text-foreground/65"}`}
        >
          Todas · {proposals.length}
        </button>
        {(Object.keys(STATUS_META) as ProposalStatus[]).map((s) => {
          const count = proposals.filter((p) => p.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${filter === s ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07] hover:text-foreground/65"}`}
            >
              {STATUS_META[s].label} · {count}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="bo-card overflow-hidden">
        {filtered.length === 0 ? (
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title={filter !== "all" ? "Nenhuma proposta neste estado" : "Sem propostas ainda"}
            hint={
              filter !== "all"
                ? "Mude de filtro para ver outras propostas."
                : "As propostas que enviar a partir de um pedido aparecem aqui."
            }
          />
        ) : (
          <div className="divide-y divide-foreground/[0.06]">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="px-5 py-4 flex items-center gap-4 hover:bg-foreground/[0.02] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/75 text-sm font-semibold truncate">
                    {p.clientName}
                  </p>
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
                <span className="text-foreground/72 text-sm font-semibold w-24 text-right shrink-0">
                  {eur(p.total)}
                </span>
                <span
                  className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-md shrink-0 w-20 text-center"
                  style={{
                    background: `${STATUS_META[p.status].color}18`,
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
