"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarEventKind } from "@/lib/orcamento/types";
import { Button, Card, cn } from "./ui";
import { ESTADO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS QUATRO CALENDÁRIOS — A LEGENDA QUE PASSOU A LIGAR E A DESLIGAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 04 do `docs/APPLE-CALENDARIO.md`. O ponto 13 da auditoria dela:
 *
 *   «Uma legenda necessária para decifrar a grelha, colocada POR BAIXO da
 *    grelha. E é só legenda. […] Metadado accionável tem de ser filtrável.»
 *
 * Os quatro tipos passam a calendários com caixa de marcar na barra lateral —
 * como os calendários da app do Mac. Desligar «Data fechada» esconde as datas
 * fechadas, da grelha do mês e da vista de ano.
 *
 * ── O QUE ESTES QUATRO FILTRAM, E O QUE NÃO FILTRAM ───────────────────────
 *
 * Filtram as MARCAÇÕES (`CalendarEvent`) — que é exactamente o que a legenda
 * antiga legendava. Os PEDIDOS desenhados na grelha não são um destes quatro:
 * não estavam na legenda, têm cinco estados em vez de quatro tipos, e o
 * `Calendario.estado-nao-e-so-cor.test.tsx` guarda a palavra do estado como a
 * via que não é cor. Um quinto calendário «Pedidos» é uma decisão dela e não
 * uma consequência desta fase — fica dito aqui para quem vier a seguir não ter
 * de a adivinhar a partir do silêncio.
 *
 * ── PORQUE É QUE AS CORES SÃO TOKENS E NÃO OS QUATRO HEXADECIMAIS DE ANTES ─
 *
 * Estavam escritos à mão (`#7a8caa`, `#7c854b`, `#8a2a22`, `#a08a5a`) — quatro
 * literais fora dos tokens, que é a última proibição da Parte 10 do documento
 * dela e da Parte 18 do `docs/DESIGN-SYSTEM.md`. Os quatro semânticos da casa
 * dizem a mesma coisa e já estão medidos contra o branco e contra o chão
 * (`contraste-das-cores-escritas.test.ts`): informação, o verde da casa,
 * perigo e aviso. E acompanham o modo escuro, que os hexadecimais não faziam.
 *
 * A leitura também melhora: uma data FECHADA é a que custa dinheiro se se
 * marcar por cima — é o vermelho de perigo, e não um castanho qualquer.
 */

/** A ordem por que aparecem, na lista e em qualquer sítio que os percorra. */
export const TIPOS: readonly CalendarEventKind[] = ["reuniao", "evento", "bloqueio", "nota"];

export const TIPO_META: Record<CalendarEventKind, { label: string; cor: string }> = {
  reuniao: { label: "Reunião", cor: "var(--bo-info)" },
  evento: { label: "Evento", cor: "var(--bo-accent)" },
  bloqueio: { label: "Data fechada", cor: "var(--bo-perigo)" },
  nota: { label: "Nota", cor: "var(--bo-aviso)" },
};

/**
 * O GLIFO DE CADA TIPO — porque a cor não pode andar sozinha.
 *
 * A Parte 10 do documento dela proíbe «cor sem função», e o critério 4 da
 * Parte 9 exige que os quatro tipos se distingam «em cor E em texto». O texto
 * vai no nome acessível da etiqueta e na lista aqui ao lado; falta o que se vê
 * a 90 px de distância numa célula, e é isto.
 *
 * Quatro silhuetas e não quatro tons do mesmo desenho: círculo, losango, cruz
 * e duas linhas distinguem-se em ESCALA DE CINZENTOS (Parte 8) e a 10 px, que
 * é o tamanho que uma etiqueta de 20 px comporta. É também a razão de não
 * levarem detalhe nenhum — um ícone de «duas pessoas a conversar» a 10 px é
 * uma mancha.
 */
export function GlifoDoTipo({ kind, className }: { kind: CalendarEventKind; className?: string }) {
  const comuns = {
    width: 10,
    height: 10,
    viewBox: "0 0 12 12",
    "aria-hidden": true,
    className: cn("shrink-0", className),
    style: { color: TIPO_META[kind].cor },
  } as const;
  if (kind === "evento") {
    return (
      <svg {...comuns} fill="currentColor">
        <path d="M6 1.4 10.6 6 6 10.6 1.4 6Z" />
      </svg>
    );
  }
  if (kind === "reuniao") {
    return (
      <svg {...comuns} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="6" cy="6" r="3.6" />
      </svg>
    );
  }
  if (kind === "bloqueio") {
    return (
      <svg {...comuns} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M2.6 2.6 9.4 9.4M9.4 2.6 2.6 9.4" />
      </svg>
    );
  }
  return (
    <svg {...comuns} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2.4 3.8h7.2M2.4 8.2h4.4" />
    </svg>
  );
}

const CHAVE = "liquen-calendarios-ligados";

export interface Calendarios {
  ligados: ReadonlySet<CalendarEventKind>;
  todosLigados: boolean;
  alternar: (k: CalendarEventKind) => void;
  isolar: (k: CalendarEventKind) => void;
  mostrarTodos: () => void;
}

function ler(): CalendarEventKind[] | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return null;
    const validos = lista.filter((k): k is CalendarEventKind =>
      TIPOS.includes(k as CalendarEventKind),
    );
    // Uma lista vazia gravada é um calendário em branco à segunda visita. Vale
    // como «não há nada guardado» — quem desligou os quatro vê-os todos no dia
    // seguinte, e isso é melhor do que abrir um ecrã que parece avariado.
    return validos.length > 0 ? validos : null;
  } catch {
    return null;
  }
}

function guardar(ligados: ReadonlySet<CalendarEventKind>): void {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify([...ligados]));
  } catch {
    // Janela privada, armazenamento cheio: perder a escolha é um incómodo;
    // deitar o calendário abaixo a meio de um mês é outra coisa.
  }
}

/**
 * O estado dos quatro, com memória.
 *
 * A leitura do `localStorage` é num efeito e não no arranque do `useState`, e
 * é de propósito: este ecrã é desenhado no servidor, e um valor que só existe
 * no browser lido no primeiro desenho é um desencontro de hidratação. Abre com
 * os quatro ligados — que é o que a grelha mostrava antes de haver filtros — e
 * a escolha guardada chega no fotograma seguinte.
 */
export function useCalendarios(): Calendarios {
  const [ligados, setLigados] = useState<ReadonlySet<CalendarEventKind>>(() => new Set(TIPOS));

  useEffect(() => {
    const guardados = ler();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (guardados) setLigados(new Set(guardados));
  }, []);

  const aplicar = useCallback((proximos: ReadonlySet<CalendarEventKind>) => {
    setLigados(proximos);
    guardar(proximos);
  }, []);

  const alternar = useCallback(
    (k: CalendarEventKind) =>
      setLigados((antes) => {
        const proximos = new Set(antes);
        if (proximos.has(k)) proximos.delete(k);
        else proximos.add(k);
        guardar(proximos);
        return proximos;
      }),
    [],
  );

  const isolar = useCallback((k: CalendarEventKind) => aplicar(new Set([k])), [aplicar]);
  const mostrarTodos = useCallback(() => aplicar(new Set(TIPOS)), [aplicar]);

  return useMemo(
    () => ({
      ligados,
      todosLigados: ligados.size === TIPOS.length,
      alternar,
      isolar,
      mostrarTodos,
    }),
    [ligados, alternar, isolar, mostrarTodos],
  );
}

export interface ListaDeCalendariosProps {
  calendarios: Calendarios;
  /** Quantas marcações de cada tipo tem a unidade à vista (o mês, ou o ano). */
  contagens: Record<CalendarEventKind, number>;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A lista, na barra lateral.
 *
 * ── PORQUE É QUE A CAIXA DE MARCAR É A DO SISTEMA ─────────────────────────
 *
 * Porque um `<input type="checkbox">` traz de graça o estado para o leitor de
 * ecrã, a barra de espaços, o `:focus-visible` e o alvo do dedo — e o
 * `accent-color` pinta-o da cor do tipo sem lhe tocar em mais nada. É o que a
 * Parte 9.2 do `docs/DESIGN-SYSTEM.md` pede (16 px, raio 4, rótulo à direita)
 * sem reimplementar um controlo que já existe. A regra dos `<select>` desta
 * casa — que a lista do sistema não se estiliza — não se aplica a uma caixa
 * que não abre lista nenhuma.
 */
export function ListaDeCalendarios({
  calendarios,
  contagens,
  className,
  style,
}: ListaDeCalendariosProps) {
  const { ligados, todosLigados, alternar, isolar, mostrarTodos } = calendarios;
  return (
    <Card padding="none" className={cn("overflow-hidden self-start", className)} style={style}>
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[var(--bo-hairline)]">
        <p className="bo-eyebrow">Calendários</p>
        {!todosLigados && (
          // A saída do isolamento, e a única maneira DESCOBRÍVEL de voltar
          // atrás: o `Alt+clique` que isola é um acelerador, e um acelerador
          // sem porta visível é uma armadilha.
          <Button variant="ghost" size="sm" onClick={mostrarTodos}>
            Mostrar todos
          </Button>
        )}
      </div>
      <ul>
        {TIPOS.map((k) => {
          const ligado = ligados.has(k);
          return (
            <li key={k}>
              <label
                className={cn(
                  "flex items-center gap-3 px-5 sm:px-6 py-2.5 cursor-default",
                  "hover:bg-[var(--bo-tinta-3)]",
                  // O `ESTADO` da casa: 150 ms e a mola interactiva, como
                  // qualquer outra linha em que se passa o rato.
                  ESTADO,
                )}
              >
                <input
                  type="checkbox"
                  checked={ligado}
                  onChange={() => alternar(k)}
                  /* `⌥+clique` isola só este calendário — é o gesto da app do
                     Mac, e a Parte 4 do documento dela nomeia-o. Vive no
                     `onClick` e não no `onChange` porque só o evento do rato
                     traz o `altKey`; o `preventDefault` impede a caixa de
                     alternar por cima do isolamento. */
                  onClick={(e) => {
                    if (!e.altKey) return;
                    e.preventDefault();
                    isolar(k);
                  }}
                  className="size-4 shrink-0 rounded-[var(--bo-raio-miudeza)]"
                  style={{ accentColor: TIPO_META[k].cor }}
                />
                <GlifoDoTipo kind={k} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12px]",
                    ligado ? "text-[var(--bo-text)]" : "text-[var(--bo-text-faint)]",
                  )}
                >
                  {TIPO_META[k].label}
                </span>
                <span className="shrink-0 tabular-nums text-[11px] text-[var(--bo-text-faint)]">
                  {contagens[k]}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
