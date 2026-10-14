"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Guest, Quote } from "@/lib/orcamento/types";
import {
  acrescentarLugares,
  apagarElemento,
  apagarMesa,
  chaveDoLugar,
  contas,
  ELEMENTOS,
  gruposPartidos,
  lerChave,
  lerMapa,
  levantar,
  livresDaMesa,
  maisProximaComLugar,
  mudarElemento,
  mudarMesa,
  nomeDoLugar,
  nomearLugar,
  novaMesa,
  novoElemento,
  porSentar,
  quemEstaNaMesa,
  reconciliar,
  ROTULO_DA_FORMA,
  sentar,
  sentarAutomaticamente,
  sentarGrupo,
  sentarResto,
  TECTOS,
  type FormaDaMesa,
  type MapaDeMesas,
  type Pessoa,
  type TipoDeElemento,
} from "@/lib/orcamento/mapa-de-mesas";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { Button, Field, FolhaOuDialogo, Inspector, Segmented, useAdaptativo } from "../ui";
import { useAnular } from "../ui/anular";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { useToast } from "../Toast";
import Sala, { type Seleccao } from "./Sala";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EDITOR DO MAPA DE MESAS DE UM EVENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As regras estão em `lib/orcamento/mapa-de-mesas.ts`; aqui vivem o estado, a
 * gravação e os painéis. Cada gesto é uma função pura sobre o mapa
 * (`mexer(gesto)`), e é isso que torna três coisas simples:
 *
 *   · GRAVAR — o mapa grava-se 600 ms depois do último gesto, com a `base`
 *     (o que o servidor tinha), como as listas da gaveta;
 *   · A COLISÃO — se outra pessoa gravou entretanto (409), os gestos que
 *     ainda não chegaram ao servidor aplicam-se POR CIMA do mapa dela, em vez
 *     de o apagar ou de deitar fora o trabalho de quem está aqui;
 *   · ANULAR — o estado de antes de um gesto grande guarda-se e repõe-se.
 */

type Gesto = (m: MapaDeMesas) => MapaDeMesas;
type Vista = "visual" | "lista";

const GRAVAR_DEPOIS_MS = 600;

function novoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

interface Props {
  pedido: Quote;
  onPedido: (q: Quote) => void;
}

/** Os grupos por sentar, pela ordem da lista. */
function agrupar(
  pessoas: Pessoa[],
): { convidadoId: string; grupo: string; faltam: number; de: number; rsvp: Pessoa["rsvp"] }[] {
  const por = new Map<
    string,
    { convidadoId: string; grupo: string; faltam: number; de: number; rsvp: Pessoa["rsvp"] }
  >();
  for (const p of pessoas) {
    const g = por.get(p.convidadoId) ?? {
      convidadoId: p.convidadoId,
      grupo: p.grupo,
      faltam: 0,
      de: p.de,
      rsvp: p.rsvp,
    };
    g.faltam += 1;
    por.set(p.convidadoId, g);
  }
  return [...por.values()];
}

export default function EditorDoMapa({ pedido, onPedido }: Props) {
  const { toast } = useToast();
  const anular = useAnular();
  const { telemovel } = useAdaptativo();

  const [lista, setLista] = useState<Guest[]>(pedido.guestList ?? []);
  const listaGravada = useRef<Guest[]>(pedido.guestList ?? []);
  const [mapa, setMapa] = useState<MapaDeMesas>(() =>
    reconciliar(lerMapa(pedido.mapaDeMesas), pedido.guestList),
  );
  const mapaRef = useRef(mapa);
  const gravado = useRef<MapaDeMesas | undefined>(pedido.mapaDeMesas);
  const pendentes = useRef<Gesto[]>([]);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [estado, setEstado] = useState<"gravado" | "a-gravar" | "por-gravar">("gravado");

  const [vista, setVista] = useState<Vista>("visual");
  const [seleccao, setSeleccao] = useState<Seleccao>(null);
  const [aSentar, setASentar] = useState<string | null>(null);
  const [naoCoube, setNaoCoube] = useState<{
    convidadoId: string;
    mesaId: string;
    ficaram: number;
  } | null>(null);
  const [esperaAberta, setEsperaAberta] = useState(false);
  const [elementosAbertos, setElementosAbertos] = useState(false);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  // ── GRAVAR ────────────────────────────────────────────────────────────────
  async function gravar() {
    temporizador.current = null;
    const aEnviar = mapaRef.current;
    const quantos = pendentes.current.length;
    if (quantos === 0) return;
    setEstado("a-gravar");
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapaDeMesas: aEnviar, base: { mapaDeMesas: gravado.current } }),
      });
    } catch {
      setEstado("por-gravar");
      toast(porqueRebentou("guardar o mapa de mesas").mensagem, "error");
      return;
    }
    const corpo = (await res.json().catch(() => null)) as
      | (Quote & { current?: Partial<Quote> })
      | null;
    if (res.status === 409) {
      // Outra pessoa gravou: os gestos daqui vão por cima do mapa dela.
      const doServidor = lerMapa(corpo?.current?.mapaDeMesas);
      gravado.current = corpo?.current?.mapaDeMesas;
      const junto = reconciliar(
        pendentes.current.reduce((m, g) => g(m), doServidor),
        lista,
      );
      mapaRef.current = junto;
      setMapa(junto);
      toast(
        "O mapa foi mudado noutro sítio entretanto. Juntei o que fizeste ao que lá estava.",
        "info",
      );
      void gravar();
      return;
    }
    if (!res.ok) {
      setEstado("por-gravar");
      toast(porqueFalhou("guardar o mapa de mesas", res, corpo).mensagem, "error");
      return;
    }
    pendentes.current = pendentes.current.slice(quantos);
    gravado.current = corpo?.mapaDeMesas ?? aEnviar;
    if (corpo?.id) onPedido(corpo);
    if (pendentes.current.length > 0) agendar();
    else setEstado("gravado");
  }

  function agendar() {
    if (temporizador.current) clearTimeout(temporizador.current);
    setEstado("por-gravar");
    temporizador.current = setTimeout(() => void gravar(), GRAVAR_DEPOIS_MS);
  }

  /** Aplica um gesto, mostra-o já, e grava daqui a pouco. Devolve o mapa novo. */
  function mexer(gesto: Gesto): MapaDeMesas {
    const novo = gesto(mapaRef.current);
    if (novo === mapaRef.current) return novo;
    mapaRef.current = novo;
    setMapa(novo);
    pendentes.current.push(gesto);
    agendar();
    return novo;
  }

  /** Um gesto grande, com «Anular» que repõe o mapa de antes. */
  function mexerComAnular(mensagem: string, gesto: Gesto) {
    const antes = mapaRef.current;
    mexer(gesto);
    anular(mensagem, () => {
      mexer(() => antes);
    });
  }

  // ── A LISTA DE CONVIDADOS (só acrescentar daqui) ────────────────────────
  async function acrescentarConvidado(nome: string, quantos: number) {
    const novo: Guest = {
      id: novoId(),
      name: nome.trim().slice(0, 200),
      party: Math.max(1, Math.min(1000, Math.floor(quantos) || 1)),
      rsvp: "pendente",
    };
    const seguinte = [...lista, novo];
    setLista(seguinte);
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestList: seguinte, base: { guestList: listaGravada.current } }),
      });
    } catch {
      setLista(listaGravada.current);
      toast(porqueRebentou("acrescentar o convidado").mensagem, "error");
      return;
    }
    const corpo = (await res.json().catch(() => null)) as
      | (Quote & { current?: Partial<Quote> })
      | null;
    if (res.status === 409) {
      const doServidor = corpo?.current?.guestList ?? [];
      listaGravada.current = doServidor;
      setLista(doServidor);
      toast(
        "A lista de convidados foi alterada noutro sítio. Está aqui a versão guardada — acrescenta outra vez.",
        "error",
      );
      return;
    }
    if (!res.ok) {
      setLista(listaGravada.current);
      toast(porqueFalhou("acrescentar o convidado", res, corpo).mensagem, "error");
      return;
    }
    const gravada = corpo?.guestList ?? seguinte;
    listaGravada.current = gravada;
    setLista(gravada);
    if (corpo?.id) onPedido(corpo);
  }

  // ── O QUE SE MOSTRA ───────────────────────────────────────────────────────
  const numeros = useMemo(() => contas(mapa, lista), [mapa, lista]);
  const espera = useMemo(() => agrupar(porSentar(mapa, lista)), [mapa, lista]);
  const partidos = useMemo(() => gruposPartidos(mapa), [mapa]);
  const mesaEscolhida =
    seleccao?.tipo === "mesa" ? (mapa.mesas.find((m) => m.id === seleccao.id) ?? null) : null;
  const elementoEscolhido =
    seleccao?.tipo === "elemento"
      ? (mapa.elementos.find((e) => e.id === seleccao.id) ?? null)
      : null;
  const nomeDoGrupo = (id: string) => lista.find((g) => g.id === id)?.name ?? "Convidado";

  // ── GESTOS ────────────────────────────────────────────────────────────────
  function acrescentarMesa(forma: FormaDaMesa) {
    const id = novoId();
    const novo = mexer((m) => novaMesa(m, forma, id).mapa);
    if (novo.mesas.some((m) => m.id === id)) setSeleccao({ tipo: "mesa", id });
    else toast(`O mapa já tem ${TECTOS.mesas} mesas — é o máximo.`, "error");
  }

  function acrescentarElemento(tipo: TipoDeElemento) {
    const id = novoId();
    const novo = mexer((m) => novoElemento(m, tipo, id).mapa);
    setElementosAbertos(false);
    if (novo.elementos.some((e) => e.id === id)) setSeleccao({ tipo: "elemento", id });
    else toast(`O mapa já tem ${TECTOS.elementos} elementos — é o máximo.`, "error");
  }

  function sentarGrupoEm(convidadoId: string, mesaId: string, lugar?: number) {
    const r = sentarGrupo(mapaRef.current, lista, convidadoId, mesaId, lugar);
    mexer(() => r.mapa);
    setASentar(null);
    setNaoCoube(r.ficaram > 0 ? { convidadoId, mesaId, ficaram: r.ficaram } : null);
  }

  function tocarLugar(chave: string) {
    const { mesaId, lugar } = lerChave(chave);
    if (aSentar) {
      sentarGrupoEm(aSentar, mesaId, lugar);
      return;
    }
    setSeleccao({ tipo: "mesa", id: mesaId });
  }

  function apagar(s: NonNullable<Seleccao>) {
    if (s.tipo === "mesa") {
      const m = mapaRef.current.mesas.find((x) => x.id === s.id);
      if (!m) return;
      setSeleccao(null);
      mexerComAnular(`${m.nome} apagada. Quem lá estava voltou à lista de espera.`, (x) =>
        apagarMesa(x, s.id),
      );
    } else {
      const e = mapaRef.current.elementos.find((x) => x.id === s.id);
      if (!e) return;
      setSeleccao(null);
      mexerComAnular(`«${e.nome}» apagado.`, (x) => apagarElemento(x, s.id));
    }
  }

  function mudarLugares(mesaId: string, lugares: number) {
    const m = mapaRef.current.mesas.find((x) => x.id === mesaId);
    if (!m) return;
    const saem = quemEstaNaMesa(mapaRef.current, m).filter(
      (l) => l.lugar >= lugares && l.ocupante,
    ).length;
    if (saem > 0) {
      mexerComAnular(
        saem === 1
          ? "1 pessoa voltou à lista de espera — a mesa ficou com menos lugares."
          : `${saem} pessoas voltaram à lista de espera — a mesa ficou com menos lugares.`,
        (x) => mudarMesa(x, mesaId, { lugares }),
      );
    } else mexer((x) => mudarMesa(x, mesaId, { lugares }));
  }

  function sentarTodos() {
    const r = sentarAutomaticamente(mapaRef.current, lista);
    if (r.sentados === 0) {
      toast(
        espera.length === 0
          ? "Já está toda a gente sentada."
          : "Não há lugares livres. Acrescenta mesas ou lugares.",
        "info",
      );
      return;
    }
    mexerComAnular(
      r.sentados === 1
        ? "Sentei 1 pessoa."
        : `Sentei ${r.sentados} pessoas, sem partir grupos sempre que deu.`,
      () => r.mapa,
    );
  }

  const ondeSentar = (convidadoId: string) => (
    <select
      aria-label={`Sentar ${nomeDoGrupo(convidadoId)} em…`}
      className="h-9 min-w-0 rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] px-2 text-xs"
      value=""
      onChange={(e) => e.target.value && sentarGrupoEm(convidadoId, e.target.value)}
    >
      <option value="">Sentar em…</option>
      {mapa.mesas.map((m) => (
        <option key={m.id} value={m.id} disabled={livresDaMesa(mapa, m).length === 0}>
          {m.nome} · {livresDaMesa(mapa, m).length} livres
        </option>
      ))}
    </select>
  );

  const listaDeEspera = (
    <div className="flex flex-col gap-3">
      {aSentar && (
        <p
          role="status"
          className="rounded-lg bg-[var(--bo-accent-lavagem)] px-3 py-2 text-xs text-[var(--bo-text)]"
        >
          Toca num lugar livre para sentar <strong>{nomeDoGrupo(aSentar)}</strong>.{" "}
          <button
            type="button"
            className={`underline ${ESTADO} ${PRESSAO}`}
            onClick={() => setASentar(null)}
          >
            Cancelar
          </button>
        </p>
      )}
      {espera.length === 0 ? (
        <p className="text-xs text-[var(--bo-text-muted)]">
          {lista.length === 0
            ? "Este evento ainda não tem convidados. Acrescenta-os aqui em baixo."
            : "Toda a gente está sentada."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {espera.map((g) => {
            const escolhido = aSentar === g.convidadoId;
            return (
              <li key={g.convidadoId} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={escolhido}
                  onClick={() => {
                    setASentar(escolhido ? null : g.convidadoId);
                    if (!escolhido && telemovel) setEsperaAberta(false);
                  }}
                  className={`alvo-toque flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${ESTADO} ${PRESSAO} ${
                    escolhido
                      ? "border-[var(--bo-accent)] bg-[var(--bo-accent-lavagem)]"
                      : "border-[var(--bo-hairline)] bg-[var(--bo-surface)] hover:bg-[var(--bo-tinta-6)]"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {g.grupo}
                    {g.rsvp === "pendente" && (
                      <span className="ml-1.5 text-[11px] text-[var(--bo-text-muted)]">
                        · por confirmar
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-[var(--bo-text-muted)]">
                    {g.faltam < g.de ? `${g.faltam} de ${g.de}` : g.de}
                  </span>
                </button>
                {vista === "lista" && mapa.mesas.length > 0 && ondeSentar(g.convidadoId)}
              </li>
            );
          })}
        </ul>
      )}
      <NovoConvidado onAcrescentar={acrescentarConvidado} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ── O TOPO: as contas, a vista e o estado da gravação ───────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-[var(--bo-text)]">
          <span className="bo-eyebrow mr-1.5 text-[var(--bo-text-muted)]">Sentados</span>
          <strong className="tabular-nums">
            {numeros.sentados}/{numeros.total}
          </strong>
          <span className="ml-2 text-xs text-[var(--bo-text-muted)] tabular-nums">
            {numeros.lugares} lugares · {numeros.livres} livres
          </span>
        </p>
        <Segmented<Vista>
          size="sm"
          ariaLabel="Ver o mapa"
          value={vista}
          onChange={setVista}
          options={[
            { value: "visual", label: "Visual" },
            { value: "lista", label: "Lista" },
          ]}
        />
        <span role="status" className="ml-auto text-xs text-[var(--bo-text-muted)]">
          {estado === "a-gravar"
            ? "A guardar…"
            : estado === "por-gravar"
              ? "Por guardar"
              : "Guardado"}
        </span>
      </div>

      {/* ── AS PEÇAS ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {(["redonda", "comprida", "quadrada"] as const).map((f) => (
          <Button key={f} size="sm" variant="secondary" onClick={() => acrescentarMesa(f)}>
            + {ROTULO_DA_FORMA[f]}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setElementosAbertos(true)}>
          + Elemento da sala
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={sentarTodos}
          disabled={mapa.mesas.length === 0}
        >
          Sentar automaticamente
        </Button>
        {telemovel && (
          <Button size="sm" variant="ghost" onClick={() => setEsperaAberta(true)}>
            Lista de espera · {espera.reduce((s, g) => s + g.faltam, 0)}
          </Button>
        )}
      </div>

      {/* ── O GRUPO QUE NÃO COUBE: as duas saídas, ditas ─────────────────── */}
      {naoCoube && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1">
            {naoCoube.ficaram === 1 ? "Ficou 1 pessoa" : `Ficaram ${naoCoube.ficaram} pessoas`} de{" "}
            <strong>{nomeDoGrupo(naoCoube.convidadoId)}</strong> sem lugar nesta mesa.
          </span>
          {(() => {
            const mesa = mapa.mesas.find((m) => m.id === naoCoube.mesaId);
            const cabem = mesa ? TECTOS.lugaresPorMesa - mesa.lugares : 0;
            return mesa && cabem > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const r = acrescentarLugares(mapaRef.current, mesa.id, naoCoube.ficaram);
                  mexer(() => r.mapa);
                  sentarGrupoEm(naoCoube.convidadoId, mesa.id);
                }}
              >
                Acrescentar {Math.min(cabem, naoCoube.ficaram)}{" "}
                {Math.min(cabem, naoCoube.ficaram) === 1 ? "lugar" : "lugares"} à {mesa.nome}
              </Button>
            ) : null;
          })()}
          {maisProximaComLugar(mapa, naoCoube.mesaId) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const r = sentarResto(
                  mapaRef.current,
                  lista,
                  naoCoube.convidadoId,
                  naoCoube.mesaId,
                );
                mexer(() => r.mapa);
                setNaoCoube(r.ficaram > 0 ? { ...naoCoube, ficaram: r.ficaram } : null);
              }}
            >
              Sentar o resto na mesa mais próxima
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setNaoCoube(null)}>
            Deixar assim
          </Button>
        </div>
      )}

      {partidos.length > 0 && !naoCoube && (
        <p className="text-xs text-[var(--bo-aviso)]">
          {partidos.length === 1 ? "1 grupo está" : `${partidos.length} grupos estão`} em mais do
          que uma mesa: {partidos.map(nomeDoGrupo).join(", ")}.
        </p>
      )}

      <div className="flex gap-4">
        <div className="grid min-w-0 flex-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          {!telemovel && (
            <section aria-labelledby="titulo-espera" className="flex flex-col gap-2">
              <h2 id="titulo-espera" className="bo-eyebrow text-[var(--bo-text-muted)]">
                Lista de espera · {espera.reduce((s, g) => s + g.faltam, 0)}
              </h2>
              {listaDeEspera}
            </section>
          )}

          {vista === "visual" ? (
            <div className="min-w-0">
              {mapa.mesas.length === 0 && mapa.elementos.length === 0 && (
                <p className="mb-2 text-sm text-[var(--bo-text-muted)]">
                  Começa por acrescentar mesas. Arrasta-as para o sítio; arrasta o vazio para andar
                  pela sala, e usa dois dedos (ou Ctrl e a roda) para aproximar.
                </p>
              )}
              <Sala
                mapa={mapa}
                lista={lista}
                seleccao={seleccao}
                aSentar={aSentar !== null}
                onSeleccionar={setSeleccao}
                onMoverMesa={(id, x, y) => mexer((m) => mudarMesa(m, id, { x, y }))}
                onMoverElemento={(id, x, y) => mexer((m) => mudarElemento(m, id, { x, y }))}
                onApagar={apagar}
                onTocarLugar={tocarLugar}
                onLevarPessoa={(de, para) => {
                  const oc = mapaRef.current.lugares[de];
                  if (oc) mexer((m) => sentar(m, para, oc));
                }}
              />
            </div>
          ) : (
            <VistaEmLista
              mapa={mapa}
              lista={lista}
              onMudar={(chave, destino) => {
                const oc = mapaRef.current.lugares[chave];
                if (!oc) return;
                if (destino === "") mexer((m) => levantar(m, chave));
                else {
                  const mesa = mapaRef.current.mesas.find((x) => x.id === destino);
                  const livre = mesa ? livresDaMesa(mapaRef.current, mesa)[0] : undefined;
                  if (mesa && livre !== undefined)
                    mexer((m) => sentar(m, chaveDoLugar(mesa.id, livre), oc));
                }
              }}
              onEscolherMesa={(id) => setSeleccao({ tipo: "mesa", id })}
            />
          )}
        </div>

        <Inspector
          aberto={!!(mesaEscolhida || elementoEscolhido)}
          onFechar={() => setSeleccao(null)}
          titulo={mesaEscolhida?.nome ?? elementoEscolhido?.nome ?? ""}
        >
          {mesaEscolhida && (
            <div className="flex flex-col gap-4 p-4">
              <Field
                as="input"
                label="Nome da mesa"
                value={mesaEscolhida.nome}
                onChange={(e) =>
                  mexer((m) => mudarMesa(m, mesaEscolhida.id, { nome: e.target.value }))
                }
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--bo-text-muted)]">Forma</span>
                <Segmented<FormaDaMesa>
                  size="sm"
                  ariaLabel="Forma da mesa"
                  value={mesaEscolhida.forma}
                  onChange={(forma) => mexer((m) => mudarMesa(m, mesaEscolhida.id, { forma }))}
                  options={(["redonda", "comprida", "quadrada"] as const).map((f) => ({
                    value: f,
                    label: ROTULO_DA_FORMA[f],
                  }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--bo-text-muted)]">Lugares</span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label="Menos um lugar"
                  disabled={mesaEscolhida.lugares <= 1}
                  onClick={() => mudarLugares(mesaEscolhida.id, mesaEscolhida.lugares - 1)}
                >
                  −
                </Button>
                <span className="min-w-8 text-center tabular-nums" aria-live="polite">
                  {mesaEscolhida.lugares}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label="Mais um lugar"
                  disabled={mesaEscolhida.lugares >= TECTOS.lugaresPorMesa}
                  onClick={() => mudarLugares(mesaEscolhida.id, mesaEscolhida.lugares + 1)}
                >
                  +
                </Button>
                {mesaEscolhida.forma !== "redonda" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      mexer((m) =>
                        mudarMesa(m, mesaEscolhida.id, { rodada: !mesaEscolhida.rodada }),
                      )
                    }
                  >
                    Rodar
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--bo-text-muted)]">Quem está sentado</span>
                <ol className="flex flex-col gap-1.5">
                  {quemEstaNaMesa(mapa, mesaEscolhida).map(({ lugar, chave, ocupante }) => {
                    const grupo = ocupante
                      ? lista.find((g) => g.id === ocupante.convidadoId)
                      : undefined;
                    return (
                      <li key={chave} className="flex items-center gap-2 text-sm">
                        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--bo-text-muted)]">
                          {lugar + 1}
                        </span>
                        {ocupante ? (
                          <>
                            {grupo && grupo.party > 1 ? (
                              <input
                                aria-label={`Nome da pessoa no lugar ${lugar + 1}`}
                                className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] px-2 text-sm"
                                placeholder={nomeDoLugar({ ...ocupante, nome: undefined }, lista)}
                                defaultValue={ocupante.nome ?? ""}
                                onBlur={(e) => mexer((m) => nomearLugar(m, chave, e.target.value))}
                              />
                            ) : (
                              <span className="min-w-0 flex-1 truncate">
                                {nomeDoLugar(ocupante, lista)}
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => mexer((m) => levantar(m, chave))}
                            >
                              Levantar
                            </Button>
                          </>
                        ) : (
                          <span className="flex-1 text-xs text-[var(--bo-text-muted)]">livre</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => apagar({ tipo: "mesa", id: mesaEscolhida.id })}
              >
                Apagar mesa
              </Button>
            </div>
          )}
          {elementoEscolhido && (
            <div className="flex flex-col gap-4 p-4">
              <Field
                as="input"
                label="Nome"
                value={elementoEscolhido.nome}
                onChange={(e) =>
                  mexer((m) => mudarElemento(m, elementoEscolhido.id, { nome: e.target.value }))
                }
              />
              {(["largura", "altura"] as const).map((lado) => (
                <div key={lado} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-[var(--bo-text-muted)]">
                    {lado === "largura" ? "Largura" : "Altura"}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Menos ${lado}`}
                    onClick={() =>
                      mexer((m) =>
                        mudarElemento(m, elementoEscolhido.id, {
                          [lado]: elementoEscolhido[lado] - 50,
                        }),
                      )
                    }
                  >
                    −
                  </Button>
                  <span className="min-w-14 text-center text-sm tabular-nums">
                    {elementoEscolhido[lado]} cm
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Mais ${lado}`}
                    onClick={() =>
                      mexer((m) =>
                        mudarElemento(m, elementoEscolhido.id, {
                          [lado]: elementoEscolhido[lado] + 50,
                        }),
                      )
                    }
                  >
                    +
                  </Button>
                </div>
              ))}
              <Button
                variant="danger"
                size="sm"
                onClick={() => apagar({ tipo: "elemento", id: elementoEscolhido.id })}
              >
                Apagar
              </Button>
            </div>
          )}
        </Inspector>
      </div>

      <FolhaOuDialogo
        aberto={telemovel && esperaAberta}
        onFechar={() => setEsperaAberta(false)}
        titulo="Lista de espera"
        descricao="Toca num convidado e depois num lugar livre."
      >
        {listaDeEspera}
      </FolhaOuDialogo>

      <FolhaOuDialogo
        aberto={elementosAbertos}
        onFechar={() => setElementosAbertos(false)}
        titulo="Elementos da sala"
        descricao="Para o desenho fazer sentido na sala."
        largura="sm"
      >
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ELEMENTOS) as TipoDeElemento[]).map((t) => (
            <Button key={t} variant="secondary" onClick={() => acrescentarElemento(t)}>
              {ELEMENTOS[t].nome}
            </Button>
          ))}
        </div>
      </FolhaOuDialogo>
    </div>
  );
}

/**
 * A vista «Lista»: cada mesa com quem lá está, e um «Mudar para…» em cada
 * pessoa. É a alternativa inteira ao arrasto — para o teclado, para o leitor
 * de ecrã, e para quem prefere ler a ver.
 */
function VistaEmLista({
  mapa,
  lista,
  onMudar,
  onEscolherMesa,
}: {
  mapa: MapaDeMesas;
  lista: readonly Guest[];
  onMudar: (chave: string, destino: string) => void;
  onEscolherMesa: (id: string) => void;
}) {
  if (mapa.mesas.length === 0) {
    return <p className="text-sm text-[var(--bo-text-muted)]">Ainda não há mesas.</p>;
  }
  return (
    <div className="grid min-w-0 gap-3 @container sm:grid-cols-2">
      {mapa.mesas.map((mesa) => {
        const sentados = quemEstaNaMesa(mapa, mesa).filter((l) => l.ocupante);
        return (
          <section key={mesa.id} className="bo-card p-3" aria-label={mesa.nome}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <button
                type="button"
                className={`text-base font-medium underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                onClick={() => onEscolherMesa(mesa.id)}
              >
                {mesa.nome}
              </button>
              <span className="text-xs tabular-nums text-[var(--bo-text-muted)]">
                {sentados.length}/{mesa.lugares} · {ROTULO_DA_FORMA[mesa.forma]}
              </span>
            </div>
            {sentados.length === 0 ? (
              <p className="text-xs text-[var(--bo-text-muted)]">Ninguém sentado.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {sentados.map(({ chave, ocupante }) => {
                  const nome = nomeDoLugar(ocupante!, lista);
                  return (
                    <li key={chave} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{nome}</span>
                      <select
                        aria-label={`Mudar ${nome} para…`}
                        className="h-9 min-w-0 max-w-[10rem] rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] px-2 text-xs"
                        value={mesa.id}
                        onChange={(e) => onMudar(chave, e.target.value)}
                      >
                        <option value={mesa.id}>{mesa.nome}</option>
                        {mapa.mesas
                          .filter((m) => m.id !== mesa.id)
                          .map((m) => (
                            <option
                              key={m.id}
                              value={m.id}
                              disabled={livresDaMesa(mapa, m).length === 0}
                            >
                              {m.nome} · {livresDaMesa(mapa, m).length} livres
                            </option>
                          ))}
                        <option value="">Lista de espera</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function NovoConvidado({
  onAcrescentar,
}: {
  onAcrescentar: (nome: string, quantos: number) => void;
}) {
  const [nome, setNome] = useState("");
  const [quantos, setQuantos] = useState("1");
  function acrescentar() {
    if (!nome.trim()) return;
    onAcrescentar(nome, Number(quantos) || 1);
    setNome("");
    setQuantos("1");
  }
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-[var(--bo-hairline)] pt-3">
      <Field
        as="input"
        label="Novo convidado"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && acrescentar()}
        placeholder="Nome (pessoa ou família)"
        containerClassName="min-w-[8rem] flex-1"
      />
      <Field
        as="input"
        type="number"
        min={1}
        max={1000}
        label="Pessoas"
        value={quantos}
        onChange={(e) => setQuantos(e.target.value)}
        containerClassName="w-20"
      />
      <Button size="sm" variant="secondary" onClick={acrescentar} disabled={!nome.trim()}>
        Acrescentar
      </Button>
    </div>
  );
}
