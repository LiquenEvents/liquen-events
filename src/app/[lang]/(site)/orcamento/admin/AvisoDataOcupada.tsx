"use client";

import { useMemo } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { choquesDeData, gravidade, type Choque } from "@/lib/orcamento/choque-de-datas";

/**
 * O QUE JÁ ESTÁ MARCADO NAQUELE DIA.
 *
 * Aparece ao escolher o cliente, antes de se escrever a primeira linha da
 * proposta — que é o único momento em que a informação ainda muda alguma coisa.
 * Depois de a proposta seguir, saber que havia outro evento no mesmo dia já só
 * serve para o arrependimento.
 *
 * NÃO BLOQUEIA NADA. Dois casamentos no mesmo dia a 20 km fazem-se; a 300 km
 * não se fazem. Quem sabe isso é ela, e o que lhe falta para decidir é o que
 * este cartão mostra: qual é o outro, onde é, e a que distância fica.
 */

const PROXIMIDADE: Record<Choque["proximidade"], string> = {
  "mesmo-dia": "no mesmo dia",
  vespera: "na véspera",
  "dia-seguinte": "no dia seguinte",
};

/** Porque é que a véspera e o dia seguinte contam — dito uma vez, no sítio. */
const PORQUE: Record<Choque["proximidade"], string> = {
  "mesmo-dia": "A equipa e a carrinha são as mesmas.",
  vespera: "A desmontagem de um cai na montagem do outro.",
  "dia-seguinte": "A montagem de um cai na desmontagem do outro.",
};

function dataCurta(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  /** O pedido que se está a preparar. */
  quote: Quote;
  /** Todos os pedidos, para procurar os que ocupam o mesmo dia. */
  quotes: Quote[];
  /** Abrir o outro pedido, para ver o que lá está sem perder este. */
  onAbrir?: (id: string) => void;
}

export default function AvisoDataOcupada({ quote, quotes, onAbrir }: Props) {
  const choques = useMemo(() => choquesDeData(quote, quotes), [quote, quotes]);
  if (choques.length === 0) return null;

  const haGrave = choques.some((c) => gravidade(c) === "grave");

  return (
    <section
      // `region` e não `alert`: isto aparece com o ecrã, não interrompe. Um
      // alerta que dispara ao escolher cada cliente ensina-se a ignorar.
      aria-labelledby="aviso-data-titulo"
      className={`rounded-2xl border p-4 ${
        haGrave
          ? "border-[#b5654a]/45 bg-[#b5654a]/[0.07]"
          : "border-[#c08a3e]/40 bg-[#c08a3e]/[0.06]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 text-base leading-none ${
            haGrave ? "text-[#b5654a]" : "text-[#c08a3e]"
          }`}
        >
          ▲
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="aviso-data-titulo"
            className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/70"
          >
            {choques.length === 1
              ? "Já há um evento nesta data"
              : `Já há ${choques.length} eventos à volta desta data`}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/55">
            Não impede nada — a decisão é tua. Fica aqui para a tomares antes de escrever a
            proposta.
          </p>

          <ul className="mt-3 flex flex-col gap-2.5">
            {choques.map((c) => {
              const grave = gravidade(c) === "grave";
              const linha = (
                <>
                  <span className="font-medium text-foreground/85">{c.outro.name}</span>
                  <span className="text-foreground/45">
                    {" · "}
                    {PROXIMIDADE[c.proximidade]}
                    {c.proximidade !== "mesmo-dia" && ` (${dataCurta(c.outro.date)})`}
                  </span>
                </>
              );
              return (
                <li
                  key={c.outro.id}
                  className="rounded-xl border border-foreground/[0.08] bg-[var(--bo-surface,#fff)]/70 p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 text-xs leading-relaxed">
                      {onAbrir ? (
                        <button
                          type="button"
                          onClick={() => onAbrir(c.outro.id)}
                          className="alvo-toque text-left underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground/60"
                        >
                          {linha}
                        </button>
                      ) : (
                        linha
                      )}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase ${
                        grave ? "bg-[#b5654a]/15 text-[#8a4632]" : "bg-[#c08a3e]/15 text-[#8a6420]"
                      }`}
                    >
                      {grave ? "difícil de conciliar" : "conciliável"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/50">
                    {c.outro.location || "Local por indicar"}
                    {c.km !== null ? (
                      <>
                        {" · "}
                        {/* Sempre "≈": a distância vem de coordenadas do centro
                            da localidade e de um factor de estrada, nunca de um
                            itinerário. Ver src/lib/geo/portugal.ts. */}
                        <span className="text-foreground/70">≈ {c.km} km daqui</span>
                        {c.aproximado && " (região, não morada)"}
                      </>
                    ) : (
                      " · distância desconhecida"
                    )}
                    {" · "}
                    {PORQUE[c.proximidade]}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
