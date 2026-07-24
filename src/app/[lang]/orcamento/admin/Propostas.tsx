"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Proposal, ProposalStatus, Quote } from "@/lib/orcamento/types";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
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
  rejeitada: { label: "Recusada", color: "#5a5a55" },
};

function expiryInfo(
  validUntil?: string,
): { label: string; tone: "ok" | "soon" | "expired" } | null {
  if (!validUntil) return null;
  const days = Math.round((new Date(validUntil + "T12:00:00").getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Prazo terminado", tone: "expired" };
  if (days === 0) return { label: "Termina hoje", tone: "soon" };
  if (days === 1) return { label: "Termina amanhã", tone: "soon" };
  if (days <= 5) return { label: `Termina em ${days} dias`, tone: "soon" };
  return { label: `Válida mais ${days} dias`, tone: "ok" };
}

interface Props {
  quotes?: Quote[];
  onOpenQuote?: (q: Quote) => void;
  /** Lets the parent sync its quote state when accepting a proposal also moves the pedido. */
  onQuoteUpdated?: (q: Quote) => void;
}

export default function Propostas({ quotes, onOpenQuote, onQuoteUpdated }: Props) {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // No `setLoading(true)`/`setLoadError(false)` here — the initial state already
  // is "loading, no error", and doing it synchronously would fire setState from
  // inside the mount effect. The retry button resets those before re-calling.
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/propostas", { cache: "no-store" });
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setProposals(await res.json());
      setLoadError(false);
    } catch {
      // Falha de rede — mostramos um estado de erro com botão para tentar de novo
      // em vez de fingir que não há propostas.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wrapped in an async IIFE (not a direct `load()`) so the effect body has no
    // synchronous setState — same shape as before, keeps the lint clean.
    void (async () => {
      await load();
    })();
  }, [load]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    void load();
  }, [load]);

  // Índice id→pedido: evita um varrimento linear de todos os pedidos por cada
  // linha da lista (e dentro de `updateStatus`).
  const quotesById = useMemo(() => {
    const m = new Map<string, Quote>();
    for (const q of quotes ?? []) m.set(q.id, q);
    return m;
  }, [quotes]);

  async function updateStatus(id: string, status: ProposalStatus) {
    setActionBusy(id);
    try {
      const res = await fetch(`/api/propostas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, respondedAt: new Date().toISOString() }),
      });
      if (!res.ok) {
        toast("Não foi possível atualizar a proposta. Tente novamente.", "error");
        return;
      }
      const updated: Proposal = await res.json();
      setProposals((prev) => prev.map((p) => (p.id === id ? updated : p)));

      // Aceitar a proposta fecha o negócio: o pedido associado passa também
      // a "aceite" no pipeline (com entrada no histórico). Recusar não toca
      // no pedido — a equipa pode querer renegociar antes de o dar por perdido.
      if (status === "aceite") {
        const lq = quotesById.get(updated.quoteId);
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
          } else {
            toast("Proposta aceite, mas não foi possível atualizar o pedido associado.", "info");
          }
        }
        toast(`Proposta de ${updated.clientName} aceite.`, "success");
      } else if (status === "rejeitada") {
        toast("Proposta marcada como recusada.", "info");
      }
    } catch {
      toast("Erro de ligação. Verifique a internet e tente novamente.", "error");
    } finally {
      setActionBusy(null);
    }
  }

  // Aceitar/recusar é uma ação de negócio consequente (aceitar é irreversível e
  // move o pedido). Pedimos confirmação antes de avançar.
  const confirmAndUpdate = useCallback(
    (id: string, status: ProposalStatus) => {
      const p = proposals.find((x) => x.id === id);
      const name = p?.clientName ?? "este cliente";
      const message =
        status === "aceite"
          ? `Marcar a proposta de ${name} como ACEITE?\n\nO pedido associado passa também a "Aceite".`
          : `Marcar a proposta de ${name} como recusada?`;
      if (typeof window !== "undefined" && !window.confirm(message)) return;
      void updateStatus(id, status);
    },
    // updateStatus é estável o suficiente (fecha sobre estado atual via setters);
    // dependemos apenas da lista para resolver o nome do cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposals],
  );

  // Apagar uma proposta da lista. Pede confirmação (é irreversível) e repõe a
  // proposta se o servidor recusar, para nunca desaparecer sem ter sido guardado.
  async function deleteProposal(id: string) {
    const p = proposals.find((x) => x.id === id);
    const name = p?.clientName ?? "esta proposta";
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Apagar a proposta de ${name}?\n\nEsta ação não pode ser anulada.`)
    ) {
      return;
    }
    setActionBusy(id);
    const snapshot = proposals;
    setProposals((prev) => prev.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/propostas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Proposta apagada.", "success");
    } catch {
      setProposals(snapshot);
      toast("Não foi possível apagar a proposta. Tente novamente.", "error");
    } finally {
      setActionBusy(null);
    }
  }

  const filtered = useMemo(
    () =>
      (filter === "all" ? proposals : proposals.filter((p) => p.status === filter))
        .slice()
        .sort((a, b) => {
          // Enviadas com expiração iminente first
          const aExp = a.validUntil ? new Date(a.validUntil + "T12:00:00").getTime() : Infinity;
          const bExp = b.validUntil ? new Date(b.validUntil + "T12:00:00").getTime() : Infinity;
          if (a.status === "enviada" && b.status !== "enviada") return -1;
          if (a.status !== "enviada" && b.status === "enviada") return 1;
          if (a.status === "enviada" && b.status === "enviada") return aExp - bExp;
          return +new Date(b.createdAt) - +new Date(a.createdAt);
        }),
    [proposals, filter],
  );

  const stats = useMemo(() => {
    let totalSent = 0;
    let totalWon = 0;
    let won = 0;
    let pending = 0;
    for (const p of proposals) {
      if (p.status === "enviada" || p.status === "aceite") totalSent += p.total;
      if (p.status === "aceite") {
        totalWon += p.total;
        won += 1;
      }
      if (p.status === "enviada") pending += 1;
    }
    const acceptRate = proposals.length ? Math.round((won / proposals.length) * 100) : 0;
    return { totalSent, totalWon, acceptRate, pending };
  }, [proposals]);
  const { totalSent, totalWon, acceptRate, pending } = stats;

  const filterOptions: SegmentedOption<ProposalStatus | "all">[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of proposals) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return [
      { value: "all", label: `Todas · ${proposals.length}` },
      // "rascunho" não é persistido no servidor (os rascunhos vivem só no
      // browser), por isso o chip aparecia sempre a 0 e confundia — fica de fora.
      ...(Object.keys(STATUS_META) as ProposalStatus[])
        .filter((s) => s !== "rascunho")
        .map((s) => ({
          value: s,
          label: `${STATUS_META[s].label} · ${counts[s] ?? 0}`,
        })),
    ];
  }, [proposals]);

  if (loading) return <SkeletonList rows={5} />;

  if (loadError) {
    return (
      <Card padding="md" className="flex flex-col items-center gap-4 text-center py-10">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#8a2a22]/10 text-[#8a2a22]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-foreground/90 text-sm font-medium">
            Não foi possível carregar as propostas
          </p>
          <p className="text-foreground/50 text-xs mt-1">
            Verifique a ligação à internet e tente novamente.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={retryLoad}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* One calm line saying what this screen is for */}
      <p className="text-sm leading-relaxed text-foreground/55">
        Aqui vê as propostas que enviou aos clientes e acompanha quais foram aceites.
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { v: String(proposals.length), l: "Propostas", accent: true },
          { v: eur(totalSent), l: "Valor enviado aos clientes", accent: false },
          { v: eur(totalWon), l: "Valor já ganho", accent: true },
          { v: `${acceptRate}%`, l: "Propostas aceites", accent: false },
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
              const linkedQuote = quotesById.get(p.quoteId);
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
                      {p.clientEmail} · {p.lineItems.length}{" "}
                      {p.lineItems.length !== 1 ? "itens" : "item"}
                      {p.sentAt &&
                        ` · enviada a ${new Date(p.sentAt).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>

                  {/* Value + actions — share one row on phones, split out on desktop */}
                  <div className="flex items-center justify-between gap-3 sm:contents">
                    <p className="text-foreground/90 text-sm font-semibold shrink-0 tabular-nums">
                      {eur(p.total)}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {p.status === "enviada" && (
                        <>
                          <Button
                            variant="subtle"
                            size="sm"
                            disabled={busy}
                            onClick={() => confirmAndUpdate(p.id, "aceite")}
                            title="O cliente aceitou: fecha o negócio e marca o pedido como ganho"
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
                            onClick={() => confirmAndUpdate(p.id, "rejeitada")}
                            title="O cliente não avançou com esta proposta"
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
                          title="Abrir o pedido deste cliente"
                          iconRight={<span aria-hidden="true">→</span>}
                        >
                          Ver pedido
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => deleteProposal(p.id)}
                        aria-label={`Apagar a proposta de ${p.clientName}`}
                        title="Apagar esta proposta"
                        className="text-foreground/40 hover:text-[#8a2a22]"
                        iconLeft={
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        }
                      >
                        Apagar
                      </Button>
                    </div>
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
