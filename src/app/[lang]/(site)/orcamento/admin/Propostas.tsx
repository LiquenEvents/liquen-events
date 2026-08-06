"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Proposal, ProposalStatus, Quote } from "@/lib/orcamento/types";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { MenuDeAccoes, TabelaOuCartoes, type AccaoDeItem } from "./ui";
import { Button, Card, EmptyState, Segmented } from "./ui";
import type { SegmentedOption } from "./ui";
import { randomId } from "./util";
import { useCachedList } from "./useCachedList";
import { metaFor } from "./status-meta";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const STATUS_META: Record<ProposalStatus, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "#8a8a82" },
  enviada: { label: "Enviada", color: "#9aa36a" },
  em_negociacao: { label: "Em negociação", color: "#7d8a55" },
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

/**
 * Uma linha da lista, memoizada.
 *
 * Sem isto, marcar UMA proposta como aceite (que muda `actionBusy`) voltava a
 * desenhar as 202 linhas — e mudar de filtro custava, medido, um evento de
 * 104 ms (uma tarefa longa de 89 ms). A linha só depende da proposta, do pedido
 * ligado e de estar ocupada.
 */
/** O estado da proposta. Partilhado pela tabela e pelo cartão de propósito: as
 *  duas formas têm de dizer exactamente a mesma coisa. */
function EstadoChip({ p }: { p: Proposal }) {
  const meta = metaFor(STATUS_META, p.status);
  return (
    <span
      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
      style={{ background: `${meta.color}1f`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

/** "Expira em 3 dias" / "Expirada". Nada quando não há validade definida. */
function ValidadeChip({ p }: { p: Proposal }) {
  const exp = expiryInfo(p.validUntil);
  if (!exp) return null;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
        exp.tone === "expired"
          ? "bg-[#8a2a22]/10 text-[#8a2a22]"
          : exp.tone === "soon"
            ? "bg-[#b5894a]/12 text-[#a9781f]"
            : "bg-foreground/[0.05] text-foreground/45"
      }`}
    >
      {exp.label}
    </span>
  );
}

interface Props {
  quotes?: Quote[];
  onOpenQuote?: (q: Quote) => void;
  /** Lets the parent sync its quote state when accepting a proposal also moves the pedido. */
  onQuoteUpdated?: (q: Quote) => void;
}

export default function Propostas({ quotes, onOpenQuote, onQuoteUpdated }: Props) {
  const { toast } = useToast();
  const {
    data: proposals = [],
    setData: setProposals,
    loading,
    error: loadError,
    refresh: retryLoad,
  } = useCachedList<Proposal[]>("propostas", "/api/propostas");
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");
  // O chip acende-se já; a lista (202 linhas) é reconstruída a seguir, em
  // prioridade baixa. Medido: sem isto, um clique no filtro era um evento de
  // 104 ms — acima do limiar em que um clique deixa de parecer instantâneo.
  const deferredFilter = useDeferredValue(filter);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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

  // A lista actual e o `onOpenQuote` do pai, numa ref: os manipuladores que
  // vão parar às 202 linhas memoizadas têm de manter a mesma identidade, senão
  // o `memo()` falha sempre e não poupa nada.
  const latest = useRef({ proposals, onOpenQuote });
  useEffect(() => {
    latest.current = { proposals, onOpenQuote };
  });

  const handleOpenQuote = useCallback((q: Quote) => latest.current.onOpenQuote?.(q), []);

  // Aceitar/recusar é uma ação de negócio consequente (aceitar é irreversível e
  // move o pedido). Pedimos confirmação antes de avançar.
  const confirmAndUpdate = useCallback(
    (id: string, status: ProposalStatus) => {
      const p = latest.current.proposals.find((x) => x.id === id);
      const name = p?.clientName ?? "este cliente";
      const message =
        status === "aceite"
          ? `Marcar a proposta de ${name} como ACEITE?\n\nO pedido associado passa também a "Aceite".`
          : `Marcar a proposta de ${name} como recusada?`;
      if (typeof window !== "undefined" && !window.confirm(message)) return;
      void updateStatus(id, status);
    },
    // updateStatus fecha sobre o estado actual via setters; a lista chega pela
    // ref, por isso este callback nunca muda de identidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Apagar uma proposta da lista. Pede confirmação (é irreversível) e repõe a
  // proposta se o servidor recusar, para nunca desaparecer sem ter sido guardado.
  const deleteProposal = useCallback(
    async (id: string) => {
      const snapshot = latest.current.proposals;
      const p = snapshot.find((x) => x.id === id);
      const name = p?.clientName ?? "esta proposta";
      if (
        typeof window !== "undefined" &&
        !window.confirm(`Apagar a proposta de ${name}?\n\nEsta ação não pode ser anulada.`)
      ) {
        return;
      }
      setActionBusy(id);
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
    },
    [setProposals, toast],
  );

  const filtered = useMemo(
    () =>
      (deferredFilter === "all" ? proposals : proposals.filter((p) => p.status === deferredFilter))
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
    [proposals, deferredFilter],
  );

  const stats = useMemo(() => {
    // Re-sending a proposal for the same couple creates a NEW row (a revision),
    // so a single deal can appear several times. Counting every row would
    // triple-count "valor enviado" and skew the accept-rate. Dedupe to the
    // latest proposal per quote before computing KPIs. (Rows without a quoteId
    // — e.g. legacy — fall back to their own id so they still count once.)
    const latestByQuote = new Map<string, (typeof proposals)[number]>();
    for (const p of proposals) {
      const key = p.quoteId || `id:${p.id}`;
      const cur = latestByQuote.get(key);
      if (!cur || +new Date(p.createdAt) > +new Date(cur.createdAt)) latestByQuote.set(key, p);
    }
    const unique = [...latestByQuote.values()];
    let totalSent = 0;
    let totalWon = 0;
    let won = 0;
    let pending = 0;
    for (const p of unique) {
      if (p.status === "enviada" || p.status === "aceite") totalSent += p.total;
      if (p.status === "aceite") {
        totalWon += p.total;
        won += 1;
      }
      if (p.status === "enviada") pending += 1;
    }
    const acceptRate = unique.length ? Math.round((won / unique.length) * 100) : 0;
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

  /**
   * As acções de uma proposta, como DADOS — a forma é do `MenuDeAccoes`, que
   * sabe se as pode esconder no hover ou se as tem de mostrar sempre.
   *
   * Antes eram quatro botões de texto soltos em cada linha: no computador
   * enchiam a linha de ruído e roubavam largura ao que interessa; no telemóvel
   * embrulhavam para a linha de baixo, com "Apagar" a acabar ao lado de
   * "Aceitar".
   */
  const accoesDa = (p: Proposal): AccaoDeItem[] => {
    const lista: AccaoDeItem[] = [];
    if (p.status === "enviada") {
      lista.push({
        id: "aceitar",
        rotulo: "Aceitar",
        desativada: actionBusy === p.id,
        onAccao: () => confirmAndUpdate(p.id, "aceite"),
      });
      lista.push({
        id: "recusar",
        rotulo: "Recusar",
        desativada: actionBusy === p.id,
        onAccao: () => confirmAndUpdate(p.id, "rejeitada"),
      });
    }
    const pedido = quotesById.get(p.quoteId);
    if (pedido && onOpenQuote) {
      lista.push({ id: "pedido", rotulo: "Ver pedido", onAccao: () => handleOpenQuote(pedido) });
    }
    lista.push({
      id: "apagar",
      rotulo: "Apagar",
      destrutiva: true,
      desativada: actionBusy === p.id,
      onAccao: () => deleteProposal(p.id),
    });
    return lista;
  };

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
            title={
              deferredFilter !== "all" ? "Nenhuma proposta neste estado" : "Sem propostas ainda"
            }
            description={
              deferredFilter !== "all"
                ? "Mude de filtro para ver as restantes."
                : "As propostas enviadas a partir de um pedido aparecem aqui."
            }
          />
        ) : (
          <div className="p-3 sm:p-4">
            <TabelaOuCartoes
              itens={filtered}
              chaveDe={(p) => p.id}
              legenda="Propostas"
              ordemInicial={{ chave: "cliente", ascendente: true }}
              colunas={[
                {
                  chave: "cliente",
                  cabecalho: "Cliente",
                  ordenar: (a, b) => a.clientName.localeCompare(b.clientName, "pt"),
                  celula: (p) => (
                    <span className="block">
                      <span className="block truncate text-foreground/90">{p.clientName}</span>
                      <span className="bo-text-muted block truncate text-xs">{p.clientEmail}</span>
                    </span>
                  ),
                },
                { chave: "estado", cabecalho: "Estado", celula: (p) => <EstadoChip p={p} /> },
                { chave: "validade", cabecalho: "Validade", celula: (p) => <ValidadeChip p={p} /> },
                {
                  // Contexto útil, mas não é por isto que se procura uma
                  // proposta: só aparece quando há mesmo espaço.
                  chave: "itens",
                  cabecalho: "Itens",
                  soLargo: true,
                  alinharADireita: true,
                  celula: (p) => <span className="tabular-nums">{p.lineItems.length}</span>,
                },
                {
                  chave: "valor",
                  cabecalho: "Valor",
                  alinharADireita: true,
                  ordenar: (a, b) => a.total - b.total,
                  celula: (p) => (
                    <span className="font-semibold tabular-nums text-foreground/90">
                      {eur(p.total)}
                    </span>
                  ),
                },
                {
                  chave: "accoes",
                  cabecalho: "",
                  largura: "w-12",
                  alinharADireita: true,
                  celula: (p) => (
                    <MenuDeAccoes
                      sobre={p.clientName}
                      accoes={accoesDa(p)}
                      soltasNoEcraGrande={0}
                    />
                  ),
                },
              ]}
              cartao={(p) => (
                // O cartão mostra QUATRO coisas — cliente, estado, validade e
                // valor. A tabela mostra seis; aqui as outras duas custavam a
                // legibilidade das que decidem.
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground/90">
                      {p.clientName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <EstadoChip p={p} />
                      <ValidadeChip p={p} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-sm font-semibold tabular-nums text-foreground/90">
                      {eur(p.total)}
                    </span>
                    <MenuDeAccoes sobre={p.clientName} accoes={accoesDa(p)} />
                  </div>
                </div>
              )}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
