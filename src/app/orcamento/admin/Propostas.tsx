"use client";

import { useEffect, useState } from "react";
import type { Proposal, ProposalStatus, Quote } from "../types";
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

function expiryInfo(
  validUntil?: string,
): { label: string; tone: "ok" | "soon" | "expired" } | null {
  if (!validUntil) return null;
  const days = Math.round((new Date(validUntil + "T12:00:00").getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Expirada", tone: "expired" };
  if (days === 0) return { label: "Expira hoje", tone: "soon" };
  if (days <= 5) return { label: `Expira em ${days}d`, tone: "soon" };
  return { label: `Válida ${days}d`, tone: "ok" };
}

interface Props {
  quotes?: Quote[];
  onOpenQuote?: (q: Quote) => void;
}

export default function Propostas({ quotes, onOpenQuote }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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

  async function updateStatus(id: string, status: ProposalStatus) {
    setActionBusy(id);
    try {
      const res = await fetch(`/api/propostas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, respondedAt: new Date().toISOString() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProposals((prev) => prev.map((p) => (p.id === id ? updated : p)));
      }
    } finally {
      setActionBusy(null);
    }
  }

  const filtered = (filter === "all" ? proposals : proposals.filter((p) => p.status === filter))
    .slice()
    .sort((a, b) => {
      // Enviadas com expiração iminente first
      const aExp = a.validUntil ? new Date(a.validUntil + "T12:00:00").getTime() : Infinity;
      const bExp = b.validUntil ? new Date(b.validUntil + "T12:00:00").getTime() : Infinity;
      if (a.status === "enviada" && b.status !== "enviada") return -1;
      if (a.status !== "enviada" && b.status === "enviada") return 1;
      if (a.status === "enviada" && b.status === "enviada") return aExp - bExp;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });

  const totalSent = proposals
    .filter((p) => p.status === "enviada" || p.status === "aceite")
    .reduce((s, p) => s + p.total, 0);
  const totalWon = proposals.filter((p) => p.status === "aceite").reduce((s, p) => s + p.total, 0);
  const acceptRate = proposals.length
    ? Math.round((proposals.filter((p) => p.status === "aceite").length / proposals.length) * 100)
    : 0;
  const pending = proposals.filter((p) => p.status === "enviada").length;

  if (loading) return <SkeletonList rows={5} />;

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { v: String(proposals.length), l: "Propostas", accent: true },
          { v: eur(totalSent), l: "Valor proposto" },
          { v: eur(totalWon), l: "Valor ganho", accent: true },
          { v: `${acceptRate}%`, l: "Taxa aceitação" },
        ].map((k) => (
          <div
            key={k.l}
            className={`relative overflow-hidden rounded-xl p-4 border ${k.accent ? "bg-[#1b2119] border-[#2d3829]" : "bg-white border-foreground/[0.08] shadow-sm"}`}
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

      {/* Pending alert */}
      {pending > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] mb-5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#b5894a"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-[#b5894a] text-xs">
            <strong>
              {pending} proposta{pending !== 1 ? "s" : ""} enviada{pending !== 1 ? "s" : ""}
            </strong>{" "}
            aguardam resposta do cliente.
          </p>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setFilter("all")}
          className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all ${filter === "all" ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07]"}`}
        >
          Todas · {proposals.length}
        </button>
        {(Object.keys(STATUS_META) as ProposalStatus[]).map((s) => {
          const count = proposals.filter((p) => p.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all ${filter === s ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07]"}`}
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
                ? "Mude de filtro para ver outras."
                : "As propostas enviadas a partir de um pedido aparecem aqui."
            }
          />
        ) : (
          <div className="divide-y divide-foreground/[0.06]">
            {filtered.map((p) => {
              const exp = expiryInfo(p.validUntil);
              const linkedQuote = quotes?.find((q) => q.id === p.quoteId);
              const busy = actionBusy === p.id;

              return (
                <div
                  key={p.id}
                  className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-foreground/[0.02] transition-colors ${p.status === "enviada" && exp?.tone === "expired" ? "opacity-60" : ""}`}
                >
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-foreground/75 text-sm font-semibold truncate">
                        {p.clientName}
                      </p>
                      <span
                        className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-md shrink-0"
                        style={{
                          background: `${STATUS_META[p.status].color}18`,
                          color: STATUS_META[p.status].color,
                        }}
                      >
                        {STATUS_META[p.status].label}
                      </span>
                      {exp && (
                        <span
                          className={`text-[9px] tracking-[0.08em] uppercase px-2 py-0.5 rounded-md shrink-0 font-medium ${
                            exp.tone === "expired"
                              ? "bg-red-500/10 text-red-500"
                              : exp.tone === "soon"
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-foreground/[0.04] text-foreground/35"
                          }`}
                        >
                          {exp.label}
                        </span>
                      )}
                    </div>
                    <p className="text-foreground/28 text-xs">
                      {p.clientEmail} · {p.lineItems.length} linha
                      {p.lineItems.length !== 1 ? "s" : ""}
                      {p.sentAt &&
                        ` · enviada ${new Date(p.sentAt).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>

                  {/* Value */}
                  <p className="text-foreground/75 text-sm font-semibold shrink-0 tabular-nums">
                    {eur(p.total)}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {p.status === "enviada" && (
                      <>
                        <button
                          onClick={() => updateStatus(p.id, "aceite")}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium bg-[#4d6350]/12 text-[#4d6350] hover:bg-[#4d6350]/20 transition-colors disabled:opacity-40"
                        >
                          ✓ Aceite
                        </button>
                        <button
                          onClick={() => updateStatus(p.id, "rejeitada")}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium bg-foreground/[0.05] text-foreground/40 hover:bg-foreground/[0.09] transition-colors disabled:opacity-40"
                        >
                          ✕ Recusada
                        </button>
                      </>
                    )}
                    {linkedQuote && onOpenQuote && (
                      <button
                        onClick={() => onOpenQuote(linkedQuote)}
                        className="px-3 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium bg-foreground/[0.04] text-foreground/38 hover:text-[#4d6350] hover:bg-[#4d6350]/[0.07] transition-colors"
                        title="Abrir pedido associado"
                      >
                        Pedido →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
