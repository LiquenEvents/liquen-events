"use client";

import { useEffect, useState } from "react";
import type { FollowUp } from "@/lib/followups";
import { useToast } from "./Toast";

interface Props {
  /** Optional: open the originating quote/pedido when a row's action is clicked. */
  onOpenQuote?: (quoteId: string) => void;
}

const SEVERITY_ORDER: FollowUp["severity"][] = ["urgente", "aviso", "info"];

const SEVERITY_COLOR: Record<FollowUp["severity"], string> = {
  urgente: "#b5654a",
  aviso: "#b5894a",
  info: "#7a8caa",
};

const SEVERITY_LABEL: Record<FollowUp["severity"], string> = {
  urgente: "Urgente",
  aviso: "A avisar",
  info: "Informativo",
};

const KIND_LABEL: Record<FollowUp["kind"], string> = {
  proposta_sem_resposta: "Proposta sem resposta",
  pagamento_em_atraso: "Pagamento em atraso",
  lead_sem_contacto: "Lead por contactar",
  semana_evento: "Semana do evento",
};

/** How long the item has been due, phrased per kind. */
function duenessLabel(f: FollowUp): string {
  if (f.kind === "semana_evento") {
    if (f.duenessDays === 0) return "hoje";
    if (f.duenessDays === 1) return "amanhã";
    return `daqui a ${f.duenessDays} dias`;
  }
  if (f.duenessDays === 0) return "hoje";
  if (f.duenessDays === 1) return "há 1 dia";
  return `há ${f.duenessDays} dias`;
}

/** Prioritised, rule-based follow-up list grouped by severity. */
export default function FollowUps({ onOpenQuote }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/followups", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as FollowUp[];
        if (alive) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (alive) toast("Não foi possível carregar os seguimentos.", "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  const groups = SEVERITY_ORDER.map((sev) => ({
    sev,
    rows: items.filter((i) => i.severity === sev),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="bo-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/[0.07]">
        <p className="bo-eyebrow">Seguimentos automáticos</p>
        <span className="text-[10px] tabular-nums bg-[#1b2119] text-white/80 rounded-full px-2 py-0.5">
          {items.length}
        </span>
      </div>

      {loading ? (
        <div className="px-5 py-10">
          <div className="bo-skeleton h-2.5 w-40 mb-4" aria-hidden />
          <div className="bo-skeleton h-9 w-full" aria-hidden />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-foreground/25 text-sm text-center py-12">
          Sem seguimentos pendentes. Tudo em dia.
        </p>
      ) : (
        <div className="max-h-[460px] overflow-y-auto">
          {groups.map(({ sev, rows }) => (
            <div key={sev} className="border-b border-foreground/[0.06] last:border-0">
              <div className="flex items-center gap-2 px-5 pt-3 pb-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: SEVERITY_COLOR[sev] }}
                />
                <p className="text-[10px] tracking-[0.2em] uppercase font-medium text-foreground/35">
                  {SEVERITY_LABEL[sev]}
                </p>
                <span className="text-[10px] tabular-nums text-foreground/25">{rows.length}</span>
              </div>
              <div className="pb-2 divide-y divide-foreground/[0.05]">
                {rows.map((f) => {
                  const color = SEVERITY_COLOR[f.severity];
                  return (
                    <div key={f.id} className="px-5 py-3 flex items-center gap-3">
                      <span
                        className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm shrink-0"
                        style={{ background: `${color}1f`, color }}
                      >
                        {KIND_LABEL[f.kind]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground/70 text-sm truncate">{f.clientName}</p>
                        <p className="text-foreground/35 text-[11px] truncate">
                          {f.summary} · {duenessLabel(f)}
                        </p>
                      </div>
                      <button
                        onClick={() => onOpenQuote?.(f.quoteId)}
                        className="text-[11px] text-foreground/50 hover:text-foreground/80 transition-colors shrink-0 underline decoration-foreground/20 underline-offset-2"
                      >
                        Abrir pedido
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
