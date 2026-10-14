"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { ResumoDeGuiao } from "@/lib/orcamento/guioes";
import { diaPorExtenso } from "@/lib/data-curta";
import { casaComAProcura } from "@/lib/procura";
import { EmptyState, Segmented } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { SkeletonList } from "./Skeleton";
import { useCachedList } from "./useCachedList";
import { useCamadaDeHistoria } from "./useCamadaDeHistoria";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { eventCountdown } from "./util";
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

/** O dia em grande, como na Agenda: o número, o mês, e o ano quando não é este. */
function SeloDoDia({ data, grande = false }: { data: string; grande?: boolean }) {
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

function CartaoDoEvento({
  g,
  aAbrir,
  onAbrir,
  destaque = false,
}: {
  g: ResumoDeGuiao;
  aAbrir: boolean;
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
      aria-label={`${g.cliente}, ${diaPorExtenso(g.data)}${detalhe ? `, ${detalhe}` : ""}`}
      className={`bo-card alvo-toque group flex h-full w-full min-w-0 items-center gap-4 text-left hover:border-[var(--bo-hairline-strong)] hover:shadow-[var(--bo-sombra-erguida)] ${
        destaque ? "p-5" : "p-4"
      } ${ESTADO} ${PRESSAO}`}
    >
      <SeloDoDia data={g.data} grande={destaque} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {destaque && <span className="bo-eyebrow text-[var(--bo-accent)]">Próximo evento</span>}
        <span
          className={`truncate font-medium text-[var(--bo-text)] ${destaque ? "text-lg" : "text-base"}`}
        >
          {g.cliente}
        </span>
        <span className="truncate text-xs text-[var(--bo-text-muted)]">
          {[diaPorExtenso(g.data), detalhe].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-3">
          {falta && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                falta.tone === "today" || falta.tone === "soon"
                  ? "bg-[var(--bo-aviso-lavagem)] text-[var(--bo-aviso)]"
                  : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
              }`}
            >
              {falta.label}
            </span>
          )}
          {aAbrir ? (
            <span className="text-xs text-[var(--bo-text-muted)]">A abrir…</span>
          ) : (
            <EstadoDoMapa mesas={g.mesas} />
          )}
        </span>
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
    const t = procuraAdiada.trim().toLowerCase();
    return t
      ? doAmbito.filter((g) => casaComAProcura(t, [g.cliente, g.local, g.evento]))
      : doAmbito;
  }, [lista.data, ambito, procuraAdiada]);
  const contagens = useMemo(
    () => ({
      fechados: (lista.data?.guioes ?? []).filter((g) => g.aceite).length,
      todos: (lista.data?.guioes ?? []).length,
    }),
    [lista.data],
  );

  /** O próximo evento (hoje ou depois), que vai à cabeça num cartão maior. */
  const proximo = useMemo(() => {
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return eventos.find((g) => g.data >= hoje) ?? null;
  }, [eventos]);

  const porMes = useMemo(() => {
    const anoActual = new Date().getFullYear();
    const grupos: { mes: string; eventos: ResumoDeGuiao[] }[] = [];
    for (const g of eventos) {
      if (g.id === proximo?.id) continue;
      const d = new Date(`${g.data}T12:00:00`);
      const nome = d.toLocaleDateString("pt-PT", { month: "long" });
      const cap = nome.charAt(0).toUpperCase() + nome.slice(1);
      const mes = d.getFullYear() === anoActual ? cap : `${cap} ${d.getFullYear()}`;
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.mes === mes) ultimo.eventos.push(g);
      else grupos.push({ mes, eventos: [g] });
    }
    return grupos;
  }, [eventos, proximo]);

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
        <div className="flex flex-col gap-5">
          {proximo && (
            <div className="max-w-2xl">
              <CartaoDoEvento
                g={proximo}
                destaque
                aAbrir={aAbrir === proximo.id}
                onAbrir={() => void abrir(proximo.id)}
              />
            </div>
          )}
          <ul className="flex flex-col gap-5">
            {porMes.map(({ mes, eventos: doMes }) => (
              <li key={mes}>
                <h2 className="bo-eyebrow px-1 pb-2 text-[var(--bo-text-muted)]">{mes}</h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {doMes.map((g) => (
                    <li key={g.id} className="min-w-0">
                      <CartaoDoEvento
                        g={g}
                        aAbrir={aAbrir === g.id}
                        onAbrir={() => void abrir(g.id)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
