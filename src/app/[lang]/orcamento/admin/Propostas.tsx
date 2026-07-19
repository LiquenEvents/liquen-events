"use client";

import { useEffect, useState } from "react";
import type { Proposal, ProposalStatus, Quote } from "@/lib/orcamento/types";
import { SkeletonList } from "./Skeleton";
import { Button, Card, EmptyState, Segmented } from "./ui";
import type { SegmentedOption } from "./ui";
import { randomId } from "./util";

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
  /** Lets the parent sync its quote state when accepting a proposal also moves the pedido. */
  onQuoteUpdated?: (q: Quote) => void;
}

export default function Propostas({ quotes, onOpenQuote, onQuoteUpdated }: Props) {
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
        const updated: Proposal = await res.json();
        setProposals((prev) => prev.map((p) => (p.id === id ? updated : p)));

        // Aceitar a proposta fecha o negócio: o pedido associado passa também
        // a "aceite" no pipeline (com entrada no histórico). Recusar não toca
        // no pedido — a equipa pode querer renegociar antes de o dar por perdido.
        if (status === "aceite") {
          const lq = quotes?.find((q) => q.id === updated.quoteId);
          if (lq && lq.status !== "aceite") {
            const entry = {
              id: randomId(),
              at: new Date().toISOString(),
              kind: "status_change" as const,
              summary: `Proposta aceite — pedido movido para Aceite (${eur(updated.total)})`,
            };
            const qRes = await fetch(`/api/orcamento/${lq.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "aceite",
                activityLog: [...(lq.activityLog ?? []), entry],
              }),
            }).catch(() => null);
            if (qRes?.ok) {
              const updatedQuote: Quote = await qRes.json();
              onQuoteUpdated?.(updatedQuote);
            }
          }
        }
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

  const filterOptions: SegmentedOption<ProposalStatus | "all">[] = [
    { value: "all", label: `Todas · ${proposals.length}` },
    ...(Object.keys(STATUS_META) as ProposalStatus[]).map((s) => ({
      value: s,
      label: `${STATUS_META[s].label} · ${proposals.filter((p) => p.status === s).length}`,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { v: String(proposals.length), l: "Propostas", accent: true },
          { v: eur(totalSent), l: "Valor proposto", accent: false },
          { v: eur(totalWon), l: "Valor ganho", accent: true },
          { v: `${acceptRate}%`, l: "Taxa de aceitação", accent: false },
        ].map((k) => (
          <Card
            key={k.l}
            padding="sm"
            className={`flex flex-col gap-2 ${k.accent ? "bg-[#4d6350]/[0.05] ring-1 ring-inset ring-[#4d6350]/15" : ""}`}
          >
            <p
              className={`font-display font-semibold leading-none tabular-nums ${k.accent ? "text-[#4d6350]" : "text-foreground/90"}`}
              style={{ fontSize: "clamp(20px, 2.2vw, 28px)" }}
            >
              {k.v}
            </p>
            <p className="bo-eyebrow text-foreground/45">{k.l}</p>
          </Card>
        ))}
      </div>

      {/* Pending alert */}
      {pending > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#b5894a]/25 bg-[#b5894a]/[0.06] px-4 py-3">
          <svg
            className="shrink-0 text-[#a9781f]"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-[#a9781f] text-sm leading-snug">
            <strong className="font-semibold">
              {pending} proposta{pending !== 1 ? "s" : ""} enviada{pending !== 1 ? "s" : ""}
            </strong>{" "}
            {pending !== 1 ? "aguardam" : "aguarda"} resposta do cliente.
          </p>
        </div>
      )}

      {/* Filter */}
      <div className="max-w-full overflow-x-auto pb-1 -mb-1">
        <Segmented
          ariaLabel="Filtrar propostas por estado"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={filterOptions}
        />
      </div>

      {/* List */}
      <Card padding="none" className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title={filter !== "all" ? "Nenhuma proposta neste estado" : "Sem propostas ainda"}
            description={
              filter !== "all"
                ? "Mude de filtro para ver as restantes."
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
                  className={`px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 motion-safe:transition-colors hover:bg-foreground/[0.02] ${p.status === "enviada" && exp?.tone === "expired" ? "opacity-60" : ""}`}
                >
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-foreground/90 text-sm font-medium truncate">
                        {p.clientName}
                      </p>
                      <span
                        className="text-[10px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-md shrink-0 font-medium"
                        style={{
                          background: `${STATUS_META[p.status].color}1f`,
                          color: STATUS_META[p.status].color,
                        }}
                      >
                        {STATUS_META[p.status].label}
                      </span>
                      {exp && (
                        <span
                          className={`text-[10px] tracking-[0.08em] uppercase px-2 py-0.5 rounded-md shrink-0 font-medium ${
                            exp.tone === "expired"
                              ? "bg-[#8a2a22]/10 text-[#8a2a22]"
                              : exp.tone === "soon"
                                ? "bg-[#b5894a]/12 text-[#a9781f]"
                                : "bg-foreground/[0.05] text-foreground/45"
                          }`}
                        >
                          {exp.label}
                        </span>
                      )}
                    </div>
                    <p className="text-foreground/45 text-xs">
                      {p.clientEmail} · {p.lineItems.length} linha
                      {p.lineItems.length !== 1 ? "s" : ""}
                      {p.sentAt &&
                        ` · enviada ${new Date(p.sentAt).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>

                  {/* Value */}
                  <p className="text-foreground/90 text-sm font-semibold shrink-0 tabular-nums">
                    {eur(p.total)}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {p.status === "enviada" && (
                      <>
                        <Button
                          variant="subtle"
                          size="sm"
                          disabled={busy}
                          onClick={() => updateStatus(p.id, "aceite")}
                          iconLeft={
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 12 12"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M2 6l2.5 2.5L10 3"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          }
                        >
                          Aceitar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => updateStatus(p.id, "rejeitada")}
                        >
                          Recusar
                        </Button>
                      </>
                    )}
                    {linkedQuote && onOpenQuote && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenQuote(linkedQuote)}
                        title="Abrir pedido associado"
                        iconRight={<span aria-hidden="true">→</span>}
                      >
                        Pedido
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
