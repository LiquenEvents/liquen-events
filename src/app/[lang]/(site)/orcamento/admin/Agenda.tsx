"use client";

import { useMemo } from "react";
import type { Quote, CalendarEvent, Task } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { eur0 as eur } from "@/lib/money";
import { todayKey } from "./util";
import { Card, EmptyState } from "./ui";
import { useCachedList } from "./useCachedList";

const DAYS_AHEAD = 14;

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

type ItemKind = "evento" | "agenda" | "tarefa" | "pagamento" | "seguimento";

interface AgendaItem {
  date: string;
  time?: string;
  title: string;
  sub?: string;
  kind: ItemKind;
  color: string;
  onClick?: () => void;
  /**
   * ── UM ATALHO PARA A CARGA, NA LINHA DO EVENTO ─────────────────────────
   *
   * Do registo do audit: «a checklist da carrinha — a única tarefa que É de
   * telemóvel — está a quatro toques e não tem entrada nenhuma na navegação».
   *
   * O caminho normal são quatro toques e quatro ecrãs de rolo: barra de baixo →
   * Pedidos → encontrar o pedido → «Produção» → «Abrir para carregar». A
   * Agenda já mostra o evento do dia; falta-lhe só levar lá.
   *
   * É um `<a href>` e não um `onClick`: assim o voltar do browser funciona de
   * borla, e a rota da carga — que o service worker guarda de propósito para
   * abrir sem rede — abre como abriria escrita à mão.
   */
  atalho?: { href: string; rotulo: string };
}

const KIND_LABEL: Record<ItemKind, string> = {
  evento: "Evento",
  agenda: "Agenda",
  tarefa: "Tarefa",
  pagamento: "Pagamento",
  seguimento: "Seguimento",
};

const KIND_COLOR: Record<ItemKind, string> = {
  evento: "#7c854b",
  agenda: "#7a8caa",
  tarefa: "#b5654a",
  pagamento: "#b5894a",
  seguimento: "#637a5f",
};

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
}

export default function Agenda({ quotes, onOpen }: Props) {
  /**
   * A MESMA leitura que o Calendário e as Tarefas fazem, e não uma segunda.
   *
   * Isto pedia `/api/calendario` e `/api/tarefas` por sua conta, ao lado do
   * Reminders (que pedia as tarefas outra vez) e do aquecimento ocioso do
   * AdminClient (que pedia as duas mais uma vez): abrir a Visão Geral eram
   * TRÊS pedidos de tarefas e DOIS de calendário, todos com a mesma resposta.
   *
   * O `useCachedList` já resolve isto com as chaves que as vistas grandes usam
   * ("calendario", "tarefas"): partilha a cache entre montagens e junta os
   * pedidos em voo numa só viagem, mesmo quando três sítios pedem ao mesmo
   * tempo — que é exactamente o que aqui acontecia. Uma falha continua a
   * dar-nos uma lista vazia e uma agenda com o que dá para mostrar, como antes.
   */
  const { data: calEvents = [] } = useCachedList<CalendarEvent[]>("calendario", "/api/calendario");
  const { data: tasks = [] } = useCachedList<Task[]>("tarefas", "/api/tarefas");

  const { byDay, days } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Local `YYYY-MM-DD` keys — deriving these from `toISOString()` (UTC) shifts
    // the window by a day in +offset zones (e.g. Portugal in summer, UTC+1), so
    // yesterday's items leak in and "Hoje" lands on the wrong header.
    const pad = (n: number) => String(n).padStart(2, "0");
    const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayKey = localKey(today);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + DAYS_AHEAD);
    const horizonKey = localKey(horizon);
    const inRange = (d?: string) => !!d && d >= todayKey && d <= horizonKey;

    const items: AgendaItem[] = [];

    for (const q of quotes) {
      if (inRange(q.date)) {
        items.push({
          date: q.date,
          title: q.name,
          sub: `${eventTypeLabel(q)} · ${q.guests} convidados`,
          kind: "evento",
          color: "#7c854b",
          onClick: () => onOpen(q),
          // Pelo id do PEDIDO: a rota da carga é indexada pelo id da checklist,
          // que a Agenda não conhece — e era essa a razão técnica de a única
          // ligação em todo o repositório estar escondida a quatro toques.
          atalho: {
            href: `/orcamento/admin/carregamento/pedido/${encodeURIComponent(q.id)}`,
            rotulo: "Carregar",
          },
        });
      }
      for (const p of q.payments ?? []) {
        if (!p.paid && inRange(p.date)) {
          items.push({
            date: p.date,
            title: `${eur(p.amount)} — ${q.name}`,
            sub: p.kind,
            kind: "pagamento",
            color: "#b5894a",
            onClick: () => onOpen(q),
          });
        }
      }
      // Lead follow-ups scheduled within the window (skip closed deals).
      if (inRange(q.followUpAt) && q.status !== "aceite" && q.status !== "rejeitado") {
        items.push({
          date: q.followUpAt!,
          title: `Seguir ${q.name}`,
          sub: eventTypeLabel(q),
          kind: "seguimento",
          color: KIND_COLOR.seguimento,
          onClick: () => onOpen(q),
        });
      }
    }
    for (const e of calEvents) {
      if (inRange(e.date)) {
        items.push({
          date: e.date,
          time: e.time,
          title: e.title,
          sub: e.note,
          kind: "agenda",
          color: "#7a8caa",
        });
      }
    }
    for (const t of tasks) {
      if (!t.done && inRange(t.dueDate)) {
        items.push({
          date: t.dueDate!,
          title: t.title,
          sub: t.assignee ? `Resp.: ${t.assignee}` : t.area,
          kind: "tarefa",
          color: "#b5654a",
        });
      }
    }

    items.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""),
    );

    const map = new Map<string, AgendaItem[]>();
    for (const it of items) {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date)!.push(it);
    }
    return { byDay: map, days: Array.from(map.keys()) };
  }, [quotes, calEvents, tasks, onOpen]);

  const todayStr = todayKey();
  function dayLabel(key: string): string {
    const d = new Date(key + "T12:00:00");
    const diff = Math.round(
      (+new Date(key + "T12:00:00") - +new Date(todayStr + "T12:00:00")) / 864e5,
    );
    const rel = diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : "";
    const full = d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    return rel ? `${rel} · ${full}` : full;
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-foreground/[0.07]">
        <p className="bo-eyebrow">Agenda · próximos {DAYS_AHEAD} dias</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/45">
          Eventos, tarefas e pagamentos que se aproximam. Cada linha indica o tipo.
        </p>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {days.length === 0 ? (
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
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
              </svg>
            }
            title="Agenda tranquila"
            description={`Nada agendado para os próximos ${DAYS_AHEAD} dias. Os eventos, tarefas e pagamentos aparecem aqui à medida que se aproximam.`}
          />
        ) : (
          days.map((key) => (
            <div key={key} className="border-b border-foreground/[0.06] last:border-0">
              <p
                className={`px-5 sm:px-6 pt-4 pb-1.5 text-[10px] tracking-[0.2em] uppercase capitalize font-medium ${key === todayStr ? "text-[#4d6350]" : "text-foreground/40"}`}
              >
                {dayLabel(key)}
              </p>
              <div className="pb-2">
                {byDay.get(key)!.map((it, i) => {
                  const Wrap = it.onClick ? "button" : "div";
                  return (
                    /* ── O ATALHO É IRMÃO DA LINHA, E NÃO FILHO ──────────────
                       A linha inteira já é um botão que abre o pedido, e um
                       link dentro de um botão é HTML inválido — o toque fica
                       entregue ao navegador e cada um decide o que quer. Fica
                       ao lado, sobreposto à direita: a linha mantém o realce
                       de ponta a ponta e o alvo do atalho é só dele. */
                    <div key={i} className="relative">
                      <Wrap
                        onClick={it.onClick}
                        className={`w-full text-left px-5 sm:px-6 py-2.5 flex items-center gap-3 ${it.atalho ? "pr-24 sm:pr-28" : ""} ${it.onClick ? "hover:bg-foreground/[0.02] motion-safe:transition-colors cursor-pointer" : ""}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: it.color }}
                        />
                        {it.time && (
                          <span className="text-foreground/45 text-[11px] tabular-nums shrink-0 w-10">
                            {it.time}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground/70 text-sm truncate">{it.title}</p>
                          {it.sub && (
                            <p className="text-foreground/40 text-[11px] truncate capitalize">
                              {it.sub}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm shrink-0"
                          style={{ background: `${it.color}1f`, color: it.color }}
                        >
                          {KIND_LABEL[it.kind]}
                        </span>
                      </Wrap>
                      {it.atalho && (
                        <a
                          href={it.atalho.href}
                          className="alvo-toque absolute inset-y-0 right-3 sm:right-4 my-auto inline-flex h-8 items-center rounded-lg border border-[#4d6350]/30 bg-white px-2.5 text-[11px] font-medium text-[#4d6350] transition-colors hover:bg-[#4d6350]/[0.06]"
                        >
                          {it.atalho.rotulo}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
