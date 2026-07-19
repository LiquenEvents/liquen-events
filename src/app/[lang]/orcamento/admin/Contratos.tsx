"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
// `import type` é totalmente apagado no build, por isso puxar a forma do store
// server-only nunca arrasta o guard `server-only` (→ repository → fs) para o
// bundle cliente. O tipo vive no módulo client-safe `contract-types`.
import type { Contract, ContractStatus } from "@/lib/contract-types";
import { TERMS_VERSION } from "@/lib/contract-terms";
import { SkeletonList } from "./Skeleton";
import EmptyState from "./EmptyState";
import { useToast } from "./Toast";
import { downloadCsv, dateStamp } from "./export";

// Estado do contrato → rótulo + paleta. Aceite usa o musgo (positivo); pendente
// fica esbatido, à espera da assinatura do cliente. Mesma linguagem cromática
// das chips de Faturas/Inventário.
const STATUS_META: Record<ContractStatus, { label: string; bg: string; text: string }> = {
  aceite: { label: "Aceite", bg: "#e7efe4", text: "#3a5c39" },
  pendente: { label: "Pendente", bg: "#00000008", text: "#8a8378" },
};

const STATUSES = Object.keys(STATUS_META) as ContractStatus[];

// Data + hora (a aceitação é um evento pontual, ao minuto — importa a hora).
const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// Só a data (para a coluna de criação, mais compacta).
const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

function StatusChip({ status }: { status: ContractStatus }) {
  const s = STATUS_META[status];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-[10px] tracking-[0.08em] uppercase font-medium"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

export default function Contratos() {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ContractStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/contratos", { cache: "no-store" });
        if (res.ok) setContracts(await res.json());
        else toast("Não foi possível carregar os contratos.", "error");
      } catch {
        toast("Erro de ligação ao carregar os contratos.", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (
        q &&
        ![c.clientName, c.clientEmail, c.acceptedName, c.quoteId, c.proposalId]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [contracts, search, status]);

  const aceites = useMemo(() => contracts.filter((c) => c.status === "aceite").length, [contracts]);

  function exportCsv() {
    const rows: (string | number)[][] = [
      [
        "Cliente",
        "E-mail",
        "Ref. pedido",
        "Ref. proposta",
        "Estado",
        "Criado em",
        "Aceite em",
        "Assinado por",
        "Versão dos termos",
      ],
      ...filtered.map((c) => [
        c.clientName,
        c.clientEmail,
        c.quoteId,
        c.proposalId,
        STATUS_META[c.status].label,
        fmtDate(c.createdAt),
        c.acceptedAt ? fmtDateTime(c.acceptedAt) : "",
        c.acceptedName ?? "",
        c.termsVersion,
      ]),
    ];
    downloadCsv(`contratos-${dateStamp()}`, rows);
  }

  if (loading) return <SkeletonList rows={5} />;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
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
            placeholder="Procurar por cliente ou referência…"
            className="bo-input pl-10 pr-3 py-2.5 text-sm text-foreground/70 placeholder-foreground/22"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | ContractStatus)}
          className="bo-input px-3 py-2.5 text-sm text-foreground/60 sm:w-44"
        >
          <option value="all">Todos os estados</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        {contracts.length > 0 && (
          <button
            onClick={exportCsv}
            className="px-3 py-2.5 bg-white border border-foreground/[0.09] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm shrink-0"
            title="Exportar contratos para CSV"
          >
            Exportar CSV
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setStatus("all")}
          className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all ${
            status === "all"
              ? "bg-[#1b2119] text-white shadow-sm"
              : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07]"
          }`}
        >
          Todos · {contracts.length}
        </button>
        {STATUSES.map((s) => {
          const count = contracts.filter((c) => c.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all ${
                status === s
                  ? "bg-[#1b2119] text-white shadow-sm"
                  : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07]"
              }`}
            >
              {STATUS_META[s].label} · {count}
            </button>
          );
        })}
        {aceites > 0 && (
          <span className="ml-auto self-center text-foreground/30 text-[11px]">
            {aceites} {aceites === 1 ? "aceitação" : "aceitações"} · termos v{TERMS_VERSION} atual
          </span>
        )}
      </div>

      {/* Ledger */}
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
                <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m9 14 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title={contracts.length === 0 ? "Sem contratos ainda" : "Nenhum contrato encontrado"}
            hint={
              contracts.length === 0
                ? "Os contratos surgem aqui quando um cliente aceita a proposta pelo link público."
                : "Tente outra pesquisa ou estado."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase border-b border-foreground/[0.08]">
                  <th className="text-left font-medium px-4 py-3">Cliente</th>
                  <th className="text-left font-medium px-4 py-3">Ref. pedido</th>
                  <th className="text-left font-medium px-4 py-3">Estado</th>
                  <th className="text-left font-medium px-4 py-3">Aceite em</th>
                  <th className="text-left font-medium px-4 py-3">Assinado por</th>
                  <th className="text-left font-medium px-4 py-3">Termos</th>
                  <th className="text-right font-medium px-4 py-3">Contrato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/[0.06]">
                {filtered.map((c) => {
                  const isOpen = expanded === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        className={`hover:bg-foreground/[0.02] transition-colors ${
                          c.status === "pendente" ? "opacity-70" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-foreground/78 font-medium max-w-[200px] truncate">
                            {c.clientName || "—"}
                          </p>
                          {c.clientEmail && (
                            <p className="text-foreground/35 text-[11px] mt-0.5 max-w-[200px] truncate">
                              {c.clientEmail}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground/45 whitespace-nowrap font-mono text-[11px]">
                          {c.quoteId || "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusChip status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-foreground/45 whitespace-nowrap">
                          {c.status === "aceite" ? fmtDateTime(c.acceptedAt) : "—"}
                        </td>
                        <td
                          className="px-4 py-3 text-foreground/60 max-w-[160px] truncate"
                          title={c.acceptedName ?? undefined}
                        >
                          {c.acceptedName || "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground/40 whitespace-nowrap tabular-nums">
                          v{c.termsVersion}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-3">
                            <button
                              onClick={() => setExpanded(isOpen ? null : c.id)}
                              className="text-[10px] tracking-[0.08em] uppercase font-medium text-[#4d6350] hover:text-[#3a5c39] transition-colors"
                              aria-expanded={isOpen}
                            >
                              {isOpen ? "Fechar" : "Ver termos"}
                            </button>
                            {/* Prova em papel do contrato — abre o PDF numa nova aba. */}
                            <a
                              href={`/api/contratos/${c.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] tracking-[0.08em] uppercase font-medium text-foreground/40 hover:text-foreground/70 transition-colors"
                              title="Descarregar contrato em PDF"
                            >
                              PDF
                            </a>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-foreground/[0.015]">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mb-4">
                              <div>
                                <p className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase mb-0.5">
                                  Ref. proposta
                                </p>
                                <p className="text-foreground/60 font-mono text-[11px] break-all">
                                  {c.proposalId || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase mb-0.5">
                                  Criado em
                                </p>
                                <p className="text-foreground/60">{fmtDateTime(c.createdAt)}</p>
                              </div>
                              <div>
                                <p className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase mb-0.5">
                                  Versão dos termos
                                </p>
                                <p className="text-foreground/60">v{c.termsVersion}</p>
                              </div>
                              {/* IP é dado de auditoria — discreto, não em destaque. */}
                              <div>
                                <p className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase mb-0.5">
                                  IP (auditoria)
                                </p>
                                <p className="text-foreground/45 font-mono text-[11px] break-all">
                                  {c.acceptedIp || "—"}
                                </p>
                              </div>
                            </div>
                            <p className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase mb-1.5">
                              Termos aceites (cópia guardada)
                            </p>
                            <div className="max-h-72 overflow-y-auto rounded-lg border border-foreground/10 bg-white p-4">
                              <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/60">
                                {c.termsSnapshot || "Sem cópia dos termos guardada."}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
