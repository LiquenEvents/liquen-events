"use client";

import { useMemo, type ReactNode } from "react";
import { diaPorExtenso } from "@/lib/data-curta";
import { casaComAProcura } from "@/lib/procura";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { eventCountdown } from "./util";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA DOS EVENTOS — O MESMO DESENHO NO MAPA DE MESAS E NAS TIMELINES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nasceu no mapa de mesas (14/10, «melhora isto aqui também»): cartões com o
 * dia em grande, quanto falta, e o próximo evento à cabeça. No mesmo dia ela
 * pediu o mesmo para as Timelines — «aquilo que fizeste em termos de design no
 * mapa de mesas faz a mesma coisa para o timelines».
 *
 * Os dois ecrãs escolhem um evento da MESMA lista (`/api/guioes`), portanto o
 * desenho vive aqui, uma vez. Duas listas de eventos escritas duas vezes
 * acabam a discordar — é o defeito que a Parte −1 do sistema de design manda
 * evitar. O que muda de um ecrã para o outro é só o que o cartão diz do
 * evento (`estado`, `rodape`) e como se ouve (`nome`).
 */

/** O que um evento precisa de ter para entrar nesta lista. */
export interface EventoNaLista {
  id: string;
  cliente: string;
  /** «aaaa-mm-dd». */
  data: string;
  evento?: string;
  local?: string;
}

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function hojeEmTexto(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Os eventos cujo nome, local ou tipo casam com a procura. */
export function filtrarPorProcura<T extends EventoNaLista>(eventos: T[], procura: string): T[] {
  const t = procura.trim().toLowerCase();
  return t ? eventos.filter((g) => casaComAProcura(t, [g.cliente, g.local, g.evento])) : eventos;
}

/**
 * O próximo evento (hoje ou depois), que vai à cabeça num cartão maior, e os
 * outros partidos por MÊS, pela ordem em que vieram.
 *
 * O ano só se escreve quando não é este — «Setembro», «Maio 2027». Escrever
 * «2026» em todos os títulos de uma agenda de 2026 é ruído que se aprende a
 * saltar (a lição da lista dos próximos eventos do Calendário).
 */
export function arrumarEventos<T extends EventoNaLista>(
  eventos: T[],
  hoje: string = hojeEmTexto(),
): { proximo: T | null; porMes: { mes: string; eventos: T[] }[] } {
  const proximo = eventos.find((g) => g.data >= hoje) ?? null;
  const anoActual = Number(hoje.slice(0, 4));
  const porMes: { mes: string; eventos: T[] }[] = [];
  for (const g of eventos) {
    if (g.id === proximo?.id) continue;
    const d = new Date(`${g.data}T12:00:00`);
    const nome = d.toLocaleDateString("pt-PT", { month: "long" });
    const cap = nome.charAt(0).toUpperCase() + nome.slice(1);
    const mes = d.getFullYear() === anoActual ? cap : `${cap} ${d.getFullYear()}`;
    const ultimo = porMes[porMes.length - 1];
    if (ultimo && ultimo.mes === mes) ultimo.eventos.push(g);
    else porMes.push({ mes, eventos: [g] });
  }
  return { proximo, porMes };
}

export function useEventosArrumados<T extends EventoNaLista>(eventos: T[]) {
  return useMemo(() => arrumarEventos(eventos), [eventos]);
}

/** O dia em grande, como na Agenda: o número, o mês, e o ano quando não é este. */
export function SeloDoDia({ data, grande = false }: { data: string; grande?: boolean }) {
  const d = new Date(`${data}T12:00:00`);
  const outroAno = d.getFullYear() !== new Date().getFullYear();
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--bo-accent-lavagem)] text-[var(--bo-accent)] ${
        grande ? "h-20 w-20" : "h-16 w-14"
      }`}
    >
      <span className={`font-light leading-none tabular-nums ${grande ? "text-4xl" : "text-2xl"}`}>
        {d.getDate()}
      </span>
      <span className="mt-1 text-[11px] uppercase tracking-wide">
        {MESES_CURTOS[d.getMonth()]}
        {outroAno && <span className="ml-0.5">’{String(d.getFullYear()).slice(2)}</span>}
      </span>
    </div>
  );
}

export function CartaoDoEvento({
  g,
  estado,
  rodape,
  nome,
  aAbrir = false,
  activo = false,
  onAbrir,
  destaque = false,
}: {
  g: EventoNaLista;
  /** O que este ecrã diz do evento, ao lado de «faltam N meses». */
  estado: ReactNode;
  /** Uma linha a mais por baixo (as pastilhas dos avisos das Timelines). */
  rodape?: ReactNode;
  /** O nome acessível; por omissão, o cliente, o dia e o resto. */
  nome?: string;
  aAbrir?: boolean;
  /** O evento que está aberto (as Timelines voltam à lista com ele marcado). */
  activo?: boolean;
  onAbrir: () => void;
  destaque?: boolean;
}) {
  const falta = eventCountdown(g.data);
  const detalhe = [g.evento, g.local].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-busy={aAbrir}
      aria-current={activo ? "true" : undefined}
      data-evento={g.id}
      aria-label={nome ?? `${g.cliente}, ${diaPorExtenso(g.data)}${detalhe ? `, ${detalhe}` : ""}`}
      className={`bo-card alvo-toque group flex h-full w-full min-w-0 items-center gap-4 text-left hover:border-[var(--bo-hairline-strong)] hover:shadow-[var(--bo-sombra-erguida)] ${
        destaque ? "p-5" : "p-4"
      } ${activo ? "border-[var(--bo-accent)]" : ""} ${ESTADO} ${PRESSAO}`}
    >
      <SeloDoDia data={g.data} grande={destaque} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {destaque && <span className="bo-eyebrow text-[var(--bo-accent)]">Próximo evento</span>}
        <span
          className={`truncate font-medium text-[var(--bo-text)] ${destaque ? "text-lg" : "text-base"}`}
        >
          {g.cliente || "Sem nome"}
        </span>
        <span className="truncate text-xs text-[var(--bo-text-muted)]">
          {[diaPorExtenso(g.data), detalhe].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-3">
          {falta && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                falta.tone === "today"
                  ? "bg-[var(--bo-accent-lavagem)] font-semibold text-[var(--bo-accent)]"
                  : falta.tone === "soon"
                    ? "bg-[var(--bo-aviso-lavagem)] text-[var(--bo-aviso)]"
                    : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
              }`}
            >
              {falta.label}
            </span>
          )}
          {aAbrir ? <span className="text-xs text-[var(--bo-text-muted)]">A abrir…</span> : estado}
        </span>
        {rodape}
      </span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
        className="shrink-0 text-[var(--bo-text-faint)] group-hover:text-[var(--bo-text-muted)]"
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/**
 * O próximo à cabeça, os meses como títulos e a grelha: uma coluna no
 * telemóvel, duas a partir do `sm:`, três no `lg:` (os degraus da casa).
 */
export function GrelhaDeEventos<T extends EventoNaLista>({
  proximo,
  porMes,
  cartao,
}: {
  proximo: T | null;
  porMes: { mes: string; eventos: T[] }[];
  cartao: (g: T, destaque: boolean) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      {proximo && <div className="max-w-2xl">{cartao(proximo, true)}</div>}
      <ul className="flex flex-col gap-5">
        {porMes.map(({ mes, eventos }) => (
          <li key={mes}>
            <h2 className="bo-eyebrow px-1 pb-2 text-[var(--bo-text-muted)]">{mes}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {eventos.map((g) => (
                <li key={g.id} className="min-w-0">
                  {cartao(g, false)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
