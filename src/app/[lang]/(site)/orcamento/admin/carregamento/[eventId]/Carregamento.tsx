"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { idUnico } from "@/lib/id-unico";
import type { EventMaterialItem } from "@/lib/event-material-types";
import { progresso } from "@/lib/event-material-types";
import {
  aplicarFila,
  juntarAFila,
  lerFila,
  escreverFila,
  chaveEvento,
  type MarcacaoPendente,
} from "@/lib/material-offline";

/**
 * A VISTA DE CARREGAMENTO — telemóvel, uma mão, sem rede.
 *
 * Desenhada para 375 px primeiro. Quem usa isto está de pé, com as mãos
 * ocupadas, a carregar uma carrinha numa quinta onde a rede vai e vem.
 *
 * ── As regras que este ecrã segue ─────────────────────────────────────────
 *  • A LINHA INTEIRA é o alvo de toque, 56 px de altura. A caixa é um desenho,
 *    não o alvo: acertar num quadrado de 24 px com a carrinha a abanar é o que
 *    faz desistir e marcar tudo no fim, de memória.
 *  • Marcar escreve PRIMEIRO no armazenamento local. O dedo nunca espera pela
 *    rede.
 *  • Os CRÍTICOS por marcar travam o "carrinha carregada" com um aviso que diz
 *    QUAIS. Não bloqueia — às vezes há razão — mas obriga a confirmar.
 */

interface Props {
  quoteId: string;
  eventId: string;
  titulo: string;
  actor: string;
}

const idMarca = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : idUnico();

export default function Carregamento({ quoteId, eventId, titulo, actor }: Props) {
  const [itens, setItens] = useState<EventMaterialItem[]>([]);
  const [fila, setFila] = useState<MarcacaoPendente[]>([]);
  const [online, setOnline] = useState(true);
  const [aSincronizar, setASincronizar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [veiculo, setVeiculo] = useState<string>("todos");

  // ── Arranque: o que está guardado localmente aparece JÁ ────────────────────
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(chaveEvento(eventId));
      if (bruto) setItens(JSON.parse(bruto));
    } catch {
      /* sem armazenamento: vai-se à rede como sempre */
    }
    setFila(lerFila(localStorage));
    setOnline(navigator.onLine);
  }, [eventId]);

  const guardarLocal = useCallback(
    (lista: EventMaterialItem[]) => {
      try {
        localStorage.setItem(chaveEvento(eventId), JSON.stringify(lista));
      } catch {
        /* quota: o ecrã continua certo, só não sobrevive a fechar */
      }
    },
    [eventId],
  );

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/orcamento/${quoteId}/material`).then((x) => x.json());
      if (Array.isArray(r?.itens)) {
        // A fila por cima: uma marcação feita enquanto este pedido ia a
        // caminho não pode ser apagada pela resposta dele.
        const juntos = aplicarFila<EventMaterialItem>(r.itens, lerFila(localStorage), eventId);
        setItens(juntos);
        guardarLocal(juntos);
      }
    } catch {
      /* offline: fica o que está guardado */
    }
  }, [quoteId, eventId, guardarLocal]);

  /** Descarrega a fila. Só remove o que o servidor confirmou. */
  const sincronizar = useCallback(async () => {
    const pendentes = lerFila(localStorage).filter((m) => m.eventId === eventId);
    if (pendentes.length === 0) return;
    setASincronizar(true);
    try {
      const res = await fetch(`/api/orcamento/${quoteId}/material/marcar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcacoes: pendentes }),
      });
      if (!res.ok) throw new Error();
      const r = await res.json();
      // Só se limpa o que FOI enviado: marcações feitas durante o envio ficam
      // na fila em vez de desaparecerem com ela.
      const enviados = new Set(pendentes.map((m) => m.id));
      const resto = lerFila(localStorage).filter((m) => !enviados.has(m.id));
      escreverFila(localStorage, resto);
      setFila(resto);
      if (Array.isArray(r?.itens)) {
        const juntos = aplicarFila<EventMaterialItem>(r.itens, resto, eventId);
        setItens(juntos);
        guardarLocal(juntos);
      }
    } catch {
      /* continua na fila; tenta-se outra vez à próxima */
    } finally {
      setASincronizar(false);
    }
  }, [quoteId, eventId, guardarLocal]);

  useEffect(() => {
    void buscar();
    void sincronizar();
    const volta = () => {
      setOnline(true);
      void sincronizar();
    };
    const cai = () => setOnline(false);
    window.addEventListener("online", volta);
    window.addEventListener("offline", cai);
    return () => {
      window.removeEventListener("online", volta);
      window.removeEventListener("offline", cai);
    };
  }, [buscar, sincronizar]);

  function marcar(item: EventMaterialItem) {
    const carregado = Boolean(item.loadedAt);
    const agora = new Date().toISOString();
    const marca: MarcacaoPendente = {
      id: idMarca(),
      eventId,
      itemId: item.id,
      accao: carregado ? "unloaded" : "loaded",
      markedAt: agora,
      actor,
    };

    // 1) O ecrã muda JÁ. 2) Guarda-se. 3) Só depois a rede.
    const proximos = itens.map((i) =>
      i.id === item.id
        ? { ...i, loadedAt: carregado ? undefined : agora, loadedBy: carregado ? undefined : actor }
        : i,
    );
    setItens(proximos);
    guardarLocal(proximos);

    const novaFila = juntarAFila(lerFila(localStorage), marca);
    escreverFila(localStorage, novaFila);
    setFila(novaFila);

    if (navigator.onLine) void sincronizar();
  }

  const visiveis = useMemo(
    () => (veiculo === "todos" ? itens : itens.filter((i) => (i.vehicleId ?? "") === veiculo)),
    [itens, veiculo],
  );

  const p = useMemo(() => progresso(visiveis), [visiveis]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, EventMaterialItem[]>();
    for (const i of visiveis) {
      const lista = mapa.get(i.category) ?? [];
      lista.push(i);
      mapa.set(i.category, lista);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visiveis]);

  const veiculos = useMemo(() => {
    const ids = new Set(itens.map((i) => i.vehicleId).filter(Boolean) as string[]);
    return [...ids];
  }, [itens]);

  const pendentesDeste = fila.filter((m) => m.eventId === eventId).length;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[640px] bg-background pb-28">
      {/* Cabeçalho fixo: o contador é a única coisa que se olha a meio do
          carregamento, por isso nunca sai do ecrã. */}
      <header className="sticky top-0 z-10 border-b border-foreground/10 bg-background/95 px-4 py-3 backdrop-blur">
        <p className="truncate text-sm text-foreground/70">{titulo}</p>
        <p className="text-2xl font-medium tabular-nums">
          {p.carregados} <span className="text-foreground/45">de {p.total}</span>{" "}
          <span className="text-base text-foreground/60">carregados</span>
        </p>
        <div
          role="progressbar"
          aria-label="Progresso do carregamento"
          aria-valuemin={0}
          aria-valuemax={p.total}
          aria-valuenow={p.carregados}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
        >
          <div
            className="h-full rounded-full bg-[#4d6350] transition-[width] duration-300"
            style={{ width: p.total ? `${(p.carregados / p.total) * 100}%` : "0%" }}
          />
        </div>
        {(!online || pendentesDeste > 0) && (
          <p className="mt-2 text-xs text-foreground/60">
            {!online && "Sem rede. "}
            {pendentesDeste > 0 &&
              `${pendentesDeste} ${pendentesDeste === 1 ? "marcação guardada" : "marcações guardadas"} para enviar.`}
            {aSincronizar && " A enviar…"}
          </p>
        )}
        {veiculos.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setVeiculo("todos")}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                veiculo === "todos" ? "bg-foreground/[0.10]" : "bg-foreground/[0.04]"
              }`}
            >
              Todas
            </button>
            {veiculos.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVeiculo(v)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                  veiculo === v ? "bg-foreground/[0.10]" : "bg-foreground/[0.04]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </header>

      {itens.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-foreground/60">
          Sem checklist. Gera-a primeiro no pedido, no computador.
        </p>
      ) : (
        // A lista tem nome próprio: um leitor de ecrã anuncia onde entrou, em
        // vez de despejar trinta botões sem contexto.
        <div role="group" aria-label="Material a carregar">
          {porCategoria.map(([categoria, linhas]) => (
            <section key={categoria}>
              <h2 className="sticky top-[132px] bg-background/95 px-4 py-2 text-[11px] tracking-[0.14em] text-foreground/55 uppercase backdrop-blur">
                {categoria}
              </h2>
              <ul>
                {linhas.map((i) => {
                  const carregado = Boolean(i.loadedAt);
                  return (
                    <li key={i.id}>
                      {/* A LINHA INTEIRA é o botão. 56 px de altura: acertar num
                        quadrado pequeno com a carrinha a abanar é o que faz
                        marcar tudo no fim, de memória. */}
                      <button
                        type="button"
                        onClick={() => marcar(i)}
                        aria-pressed={carregado}
                        className="flex min-h-[56px] w-full items-center gap-3 border-b border-foreground/[0.06] px-4 text-left active:bg-foreground/[0.04]"
                      >
                        <span
                          aria-hidden
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                            carregado
                              ? "border-[#4d6350] bg-[#4d6350] text-white"
                              : "border-foreground/25"
                          }`}
                        >
                          {carregado ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate ${carregado ? "text-foreground/45 line-through" : ""}`}
                          >
                            {i.critical && <span className="text-[#a03a1a]">▲ </span>}
                            {i.name}
                          </span>
                          {i.note && (
                            <span className="block truncate text-xs text-foreground/55">
                              {i.note}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-foreground/70">
                          {i.qty}
                          {i.unit ? ` ${i.unit}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Barra fixa: o gesto que fecha o carregamento fica sempre ao alcance do
          polegar, sem ter de rolar até ao fim de 41 linhas. */}
      {itens.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[640px] border-t border-foreground/10 bg-background/95 p-4 backdrop-blur">
          {confirmar && p.criticosPorCarregar.length > 0 ? (
            <div>
              <p className="text-sm">
                Faltam {p.criticosPorCarregar.length} itens críticos:{" "}
                <strong>{p.criticosPorCarregar.map((i) => i.name).join(", ")}</strong>.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmar(false)}
                  className="min-h-[48px] flex-1 rounded-xl bg-foreground/[0.06] px-4"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmar(false)}
                  className="min-h-[48px] flex-1 rounded-xl bg-[#4d6350] px-4 text-white"
                >
                  Seguir assim
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (p.criticosPorCarregar.length > 0) setConfirmar(true);
              }}
              className="min-h-[52px] w-full rounded-xl bg-[#4d6350] px-4 text-white disabled:opacity-45"
              disabled={p.carregados === 0}
            >
              {p.carregados === p.total
                ? "Carrinha carregada"
                : `Dar por carregada (${p.carregados}/${p.total})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
