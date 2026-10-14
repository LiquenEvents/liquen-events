"use client";

import { useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { ResumoDeGuiao } from "@/lib/orcamento/guioes";
import { diaPorExtenso } from "@/lib/data-curta";
import { Button, EmptyState, Segmented } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { SkeletonList } from "./Skeleton";
import { useCachedList } from "./useCachedList";
import EditorDoMapa from "./mesas/EditorDoMapa";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MAPA DE MESAS — O ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (14/10), com a captura de um «Mapa de Mesas». As decisões dela e
 * o que está feito estão em `docs/MAPA-DE-MESAS.md`; as regras, em
 * `lib/orcamento/mapa-de-mesas.ts`.
 *
 * Escolher o evento é o mesmo gesto das Timelines, e a lista é a MESMA
 * (`/api/guioes`: os pedidos com data, por mês, «Fechados» por omissão) — dois
 * ecrãs do dia do evento não podem ter duas ideias do que é um evento. O
 * pedido abre-se inteiro (`carregarPedido`, que é o `comPedidoInteiro` do
 * `AdminClient`): o mapa e os convidados vivem no pedido, e a lista só traz
 * resumos.
 */

interface Props {
  carregarPedido: (
    id: string,
  ) => Promise<{ ok: true; quote: Quote } | { ok: false; porque: string }>;
  onQuoteAtualizado?: (quote: Quote) => void;
}

type Ambito = "fechados" | "todos";

function IconeDeMesa() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="3.5" r="1.6" />
      <circle cx="12" cy="20.5" r="1.6" />
      <circle cx="3.5" cy="12" r="1.6" />
      <circle cx="20.5" cy="12" r="1.6" />
    </svg>
  );
}

export default function MapaDeMesas({ carregarPedido, onQuoteAtualizado }: Props) {
  const lista = useCachedList<{ guioes: ResumoDeGuiao[] }>("guioes", "/api/guioes");
  const [ambito, setAmbito] = useState<Ambito>("fechados");
  const [pedido, setPedido] = useState<Quote | null>(null);
  const [aAbrir, setAAbrir] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const abertaRef = useRef<string | null>(null);

  const eventos = useMemo(() => {
    const todos = [...(lista.data?.guioes ?? [])].sort((a, b) => a.data.localeCompare(b.data));
    return ambito === "todos" ? todos : todos.filter((g) => g.aceite);
  }, [lista.data, ambito]);
  const contagens = useMemo(
    () => ({
      fechados: (lista.data?.guioes ?? []).filter((g) => g.aceite).length,
      todos: (lista.data?.guioes ?? []).length,
    }),
    [lista.data],
  );

  const porMes = useMemo(() => {
    const anoActual = new Date().getFullYear();
    const grupos: { mes: string; eventos: ResumoDeGuiao[] }[] = [];
    for (const g of eventos) {
      const d = new Date(`${g.data}T12:00:00`);
      const nome = d.toLocaleDateString("pt-PT", { month: "long" });
      const cap = nome.charAt(0).toUpperCase() + nome.slice(1);
      const mes = d.getFullYear() === anoActual ? cap : `${cap} ${d.getFullYear()}`;
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.mes === mes) ultimo.eventos.push(g);
      else grupos.push({ mes, eventos: [g] });
    }
    return grupos;
  }, [eventos]);

  async function abrir(id: string) {
    abertaRef.current = id;
    setFalha(null);
    setAAbrir(id);
    const r = await carregarPedido(id);
    // Abriu-se outro entretanto: esta resposta já não manda.
    if (abertaRef.current !== id) return;
    setAAbrir(null);
    if (r.ok) setPedido(r.quote);
    else setFalha(r.porque);
  }

  if (pedido) {
    const resumo = lista.data?.guioes.find((g) => g.id === pedido.id);
    return (
      <div className="flex flex-col gap-[var(--bo-gap-vista)]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              abertaRef.current = null;
              setPedido(null);
            }}
          >
            ← Eventos
          </Button>
          <h2 className="font-display text-xl text-[var(--bo-text)]">{pedido.name}</h2>
          {resumo && (
            <span className="text-sm text-[var(--bo-text-muted)]">
              {[resumo.evento, diaPorExtenso(resumo.data), resumo.local]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
        <EditorDoMapa
          key={pedido.id}
          pedido={pedido}
          onPedido={(q) => {
            setPedido(q);
            onQuoteAtualizado?.(q);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented<Ambito>
        ariaLabel="Que eventos mostrar"
        size="sm"
        value={ambito}
        onChange={setAmbito}
        options={[
          { value: "fechados", label: `Fechados · ${contagens.fechados}` },
          { value: "todos", label: `Todos os eventos · ${contagens.todos}` },
        ]}
      />
      {falha && (
        <p role="alert" className="text-sm text-[var(--bo-perigo)]">
          {falha}
        </p>
      )}
      {lista.loading && !lista.data ? (
        <SkeletonList rows={5} />
      ) : lista.error ? (
        <AvisoDeFalha
          titulo="Não foi possível ler os eventos"
          mensagem={lista.errorMessage}
          falha={lista.falha}
          aoTentarDeNovo={lista.refresh}
        />
      ) : contagens.todos === 0 ? (
        <EmptyState
          icon={<IconeDeMesa />}
          title="Ainda não há eventos com data"
          description="O mapa de mesas pertence a um evento marcado. Assim que um pedido tiver data, aparece aqui."
        />
      ) : eventos.length === 0 ? (
        <EmptyState
          icon={<IconeDeMesa />}
          title="Ainda nenhum evento fechado"
          description={`Os eventos entram aqui quando a proposta é aceite. Há ${contagens.todos} ${contagens.todos === 1 ? "evento" : "eventos"} com data noutros estados.`}
          action={{ label: "Ver todos os eventos", onClick: () => setAmbito("todos") }}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {porMes.map(({ mes, eventos: doMes }) => (
            <li key={mes}>
              <h2 className="bo-eyebrow px-1 py-1.5 text-[var(--bo-text-muted)]">{mes}</h2>
              <ul className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {doMes.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => void abrir(g.id)}
                      aria-busy={aAbrir === g.id}
                      className={`bo-card alvo-toque flex w-full flex-col items-start gap-0.5 p-3 text-left hover:bg-[var(--bo-tinta-6)] ${ESTADO} ${PRESSAO}`}
                    >
                      <span className="font-medium text-[var(--bo-text)]">{g.cliente}</span>
                      <span className="text-xs text-[var(--bo-text-muted)]">
                        {[g.evento, diaPorExtenso(g.data), g.local].filter(Boolean).join(" · ")}
                      </span>
                      {aAbrir === g.id && (
                        <span className="text-xs text-[var(--bo-text-muted)]">A abrir…</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
