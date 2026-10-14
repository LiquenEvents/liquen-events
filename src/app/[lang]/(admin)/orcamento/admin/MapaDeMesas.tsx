"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { ResumoDeGuiao } from "@/lib/orcamento/guioes";
import { diaPorExtenso } from "@/lib/data-curta";
import { EmptyState, Segmented } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { SkeletonList } from "./Skeleton";
import { useCachedList } from "./useCachedList";
import { useCamadaDeHistoria } from "./useCamadaDeHistoria";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import {
  CartaoDoEvento,
  GrelhaDeEventos,
  filtrarPorProcura,
  useEventosArrumados,
} from "./ListaDeEventos";
import EditorDoMapa from "./mesas/EditorDoMapa";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MAPA DE MESAS — A LISTA DOS EVENTOS, E A PORTA PARA O ECRÃ DE TRABALHO
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
 * resumos — mais o estado do mapa de cada um (`mesas`), que a rota conta.
 *
 * ── A LISTA (a segunda captura dela: «melhora isto aqui também») ──────────
 * Eram cartões brancos largos com o nome e a data e mais nada. Cada cartão
 * passou a dizer o que se precisa para escolher sem abrir: o dia em grande
 * (como na Agenda), quanto falta, e em que pé está o mapa — «Sem mapa» ou
 * «8 mesas · 64/74 sentados», com a barra. O próximo evento vem à cabeça, e
 * há uma procura.
 *
 * ── O ECRÃ INTEIRO ────────────────────────────────────────────────────────
 * Abrir um evento põe o editor por cima de tudo (`EditorDoMapa`). O gesto de
 * voltar do telemóvel e o Escape fecham-no (`useCamadaDeHistoria`), e o fundo
 * não rola por baixo (`useTrincoDeScroll`).
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

/** Em que pé está o mapa deste evento. */
function EstadoDoMapa({ mesas }: { mesas: ResumoDeGuiao["mesas"] }) {
  if (!mesas || mesas.mesas === 0) {
    return <span className="text-xs text-[var(--bo-text-muted)]">Sem mapa ainda</span>;
  }
  const parte = mesas.pessoas > 0 ? Math.min(1, mesas.sentados / mesas.pessoas) : 0;
  const completo = mesas.pessoas > 0 && mesas.sentados >= mesas.pessoas;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span
        className={`min-w-0 truncate text-xs tabular-nums ${completo ? "text-[var(--bo-accent)]" : "text-[var(--bo-text-muted)]"}`}
      >
        {mesas.mesas} {mesas.mesas === 1 ? "mesa" : "mesas"} · {mesas.sentados}/{mesas.pessoas}{" "}
        sentados
      </span>
      <span
        aria-hidden="true"
        className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--bo-tinta-8)]"
      >
        <span
          className="block h-full rounded-full bg-[var(--bo-accent)]"
          style={{ width: `${Math.round(parte * 100)}%` }}
        />
      </span>
    </span>
  );
}

export default function MapaDeMesas({ carregarPedido, onQuoteAtualizado }: Props) {
  const lista = useCachedList<{ guioes: ResumoDeGuiao[] }>("guioes", "/api/guioes");
  const [ambito, setAmbito] = useState<Ambito>("fechados");
  const [procura, setProcura] = useState("");
  const procuraAdiada = useDeferredValue(procura);
  const [pedido, setPedido] = useState<Quote | null>(null);
  const [aAbrir, setAAbrir] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const abertaRef = useRef<string | null>(null);

  function fechar() {
    abertaRef.current = null;
    setPedido(null);
    // A lista volta a ler: o mapa que se acabou de fazer muda o cartão.
    lista.refresh();
  }
  useTrincoDeScroll(!!pedido);
  useCamadaDeHistoria(!!pedido, fechar);

  const eventos = useMemo(() => {
    const todos = [...(lista.data?.guioes ?? [])].sort((a, b) => a.data.localeCompare(b.data));
    const doAmbito = ambito === "todos" ? todos : todos.filter((g) => g.aceite);
    return filtrarPorProcura(doAmbito, procuraAdiada);
  }, [lista.data, ambito, procuraAdiada]);
  const contagens = useMemo(
    () => ({
      fechados: (lista.data?.guioes ?? []).filter((g) => g.aceite).length,
      todos: (lista.data?.guioes ?? []).length,
    }),
    [lista.data],
  );

  const { proximo, porMes } = useEventosArrumados(eventos);

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

  const resumo = pedido ? lista.data?.guioes.find((g) => g.id === pedido.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {pedido && (
        <EditorDoMapa
          key={pedido.id}
          pedido={pedido}
          resumo={{
            evento: resumo?.evento,
            quando: resumo ? diaPorExtenso(resumo.data) : undefined,
            local: resumo?.local,
          }}
          onSair={fechar}
          onPedido={(q) => {
            setPedido(q);
            onQuoteAtualizado?.(q);
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
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
        {contagens.todos > 0 && (
          <input
            type="search"
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
            placeholder="Procurar por nome ou local…"
            aria-label="Procurar eventos"
            className="bo-input h-10 min-w-0 flex-1 basis-56 rounded-full px-4 text-sm"
          />
        )}
      </div>
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
        procura.trim() ? (
          <EmptyState
            icon={<IconeDeMesa />}
            title="Nenhum evento com esse nome"
            description="Procura pelo nome do cliente, pelo tipo de evento ou pelo local."
            action={{ label: "Limpar a procura", onClick: () => setProcura("") }}
          />
        ) : (
          <EmptyState
            icon={<IconeDeMesa />}
            title="Ainda nenhum evento fechado"
            description={`Os eventos entram aqui quando a proposta é aceite. Há ${contagens.todos} ${contagens.todos === 1 ? "evento" : "eventos"} com data noutros estados.`}
            action={{ label: "Ver todos os eventos", onClick: () => setAmbito("todos") }}
          />
        )
      ) : (
        <GrelhaDeEventos
          proximo={proximo}
          porMes={porMes}
          cartao={(g, destaque) => (
            <CartaoDoEvento
              g={g}
              destaque={destaque}
              aAbrir={aAbrir === g.id}
              onAbrir={() => void abrir(g.id)}
              estado={<EstadoDoMapa mesas={g.mesas} />}
            />
          )}
        />
      )}
    </div>
  );
}
