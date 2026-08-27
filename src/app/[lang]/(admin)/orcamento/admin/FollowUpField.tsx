"use client";

import { useId, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { useToast } from "./Toast";
import { todayKey } from "./util";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";

interface Props {
  quote: Quote;
  onChange: (followUpAt: string | undefined) => void;
}

// Dias a partir do dia LOCAL de hoje (não UTC — perto da meia-noite a data
// saltava um dia para quem está a leste/oeste de UTC; ver util.todayKey).
function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A data como ela a lê no ecrã — "12 de junho". Uma data em ISO no meio de
 *  um aviso obriga a decifrá-la, e o aviso é para ser lido de relance. */
function porExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "long" });
}

/**
 * A per-lead follow-up date. Persists immediately. Quick presets cover the
 * common "chase in a few days / next week" cadence; due follow-ups then surface
 * in Reminders + Agenda so no proposal goes cold.
 */
export default function FollowUpField({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [value, setValue] = useState<string>(quote.followUpAt ?? "");
  const id = useId();
  const hintId = `${id}-hint`;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A DATA QUE RECUA SOZINHA — E O AVISO QUE NÃO FALAVA DISSO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A gravação é optimista: o campo muda já e, se o servidor recusar, volta ao
   * que estava. O aviso dizia «Não foi possível guardar o seguimento. Tenta
   * novamente.» — a mesma frase para a rede em baixo, para a sessão expirada e
   * para o pedido apagado por outra pessoa, e sem dizer que a data que ela
   * acabou de escolher já lá não está.
   *
   * Um seguimento é o que a faz pegar no telefone daqui a uma semana: um que
   * ela julga marcado e não está é uma proposta que arrefece sem ninguém dar
   * por isso. Por isso a frase nomeia a data, diz porquê, e diz para onde é que
   * o campo recuou.
   */
  async function persist(next: string | undefined) {
    // Otimista com reversão: falha do servidor repõe o estado e avisa.
    const snapshot = quote.followUpAt;
    const oQue = next
      ? `marcar o seguimento de «${quote.name}» para ${porExtenso(next)}`
      : `retirar o seguimento de «${quote.name}»`;
    const reverter = (falha: Falha) => {
      setValue(snapshot ?? "");
      onChange(snapshot);
      toast(
        `${falha.mensagem} ${
          snapshot
            ? `O campo voltou para ${porExtenso(snapshot)}.`
            : "O campo voltou a ficar vazio."
        }`,
        "error",
      );
    };
    setValue(next ?? "");
    onChange(next);
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUpAt: next ?? null }),
      });
    } catch {
      reverter(porqueRebentou(oQue));
      return;
    }
    if (!res.ok) reverter(porqueFalhou(oQue, res, await res.json().catch(() => null)));
  }

  const overdue = value && value < todayKey();
  const isToday = value === todayKey();

  return (
    <div>
      <label htmlFor={id} className="bo-eyebrow mb-2 block">
        Seguimento
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => void persist(e.target.value || undefined)}
          aria-describedby={value ? hintId : undefined}
          className="bo-input flex-1 px-3 py-2 text-sm text-foreground/70"
        />
        {value && (
          <button
            onClick={() => void persist(undefined)}
            className="alvo-toque px-3 py-2 text-foreground/40 text-[10px] tracking-[0.15em] uppercase hover:text-foreground/65 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {[
          { label: "+3 dias", days: 3 },
          { label: "+1 semana", days: 7 },
          { label: "+2 semanas", days: 14 },
        ].map((p) => (
          <button
            key={p.label}
            onClick={() => void persist(plusDays(p.days))}
            className="alvo-toque px-2.5 py-1 rounded-full bg-[var(--bo-tinta-6)] text-foreground/45 text-[11px] hover:bg-[var(--bo-tinta-10)] hover:text-foreground/70 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      {value && (
        <p
          id={hintId}
          className={`text-[10px] mt-2 ${overdue ? "text-[#8a2a22]" : isToday ? "text-[#4d6350]" : "text-foreground/35"}`}
        >
          {overdue
            ? "Seguimento em atraso"
            : isToday
              ? "Seguimento hoje"
              : `Seguimento a ${new Date(value + "T12:00:00").toLocaleDateString("pt-PT", {
                  day: "numeric",
                  month: "long",
                })}`}
        </p>
      )}
    </div>
  );
}
