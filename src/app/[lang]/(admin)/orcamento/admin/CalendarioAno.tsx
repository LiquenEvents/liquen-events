"use client";

import { useMemo } from "react";
import type { CalendarEvent, Quote } from "@/lib/orcamento/types";
import {
  DIAS_DA_SEMANA,
  anoDoCalendario,
  nomeDoDia,
  resumoDoMes,
  type DiaDoAno,
  type MesDoAno,
} from "@/lib/orcamento/ano-do-calendario";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { cn } from "./ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISTA DE ANO — DOZE MINI-MESES, E UMA PERGUNTA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 07 do `docs/APPLE-CALENDARIO.md`. O documento descreve-a em sete
 * palavras — «doze mini-meses com pontos e dias fechados» — e diz para que
 * serve na frase seguinte, que é a que manda aqui: **é a vista que responde a
 * «temos livre em julho de 2027?»**. O critério de aceitação nº 7 põe-lhe um
 * relógio: menos de três segundos.
 *
 * O cenário real: chega um pedido de um casal para uma data e ela precisa de
 * saber, num relance, se esse mês já está tomado. Tudo o que está desenhado
 * aqui existe para esses três segundos, e o que não servisse para eles ficou
 * de fora.
 *
 * ── PORQUE É QUE A RESPOSTA NÃO ESTÁ NA GRELHA DE PONTOS ──────────────────
 *
 * Porque contar trinta pontos com o olho não se faz em três segundos — faz-se
 * em quinze, e mal. Doze grelhas de pontos são um mapa bonito e uma resposta
 * lenta.
 *
 * A resposta está na LINHA por baixo do nome do mês: «Livre», «1 dia fechado»,
 * «4 dias fechados · 2 com marcações». Doze linhas dessas lêem-se de cima a
 * baixo como uma lista, e a pergunta responde-se sem olhar para um único dia.
 * A grelha por baixo é a segunda pergunta — «quais?» —, e essa é que precisa
 * dos pontos.
 *
 * ── E É TAMBÉM ASSIM QUE ISTO CUMPRE A PARTE 10 ───────────────────────────
 *
 * A Parte 10 do documento proíbe duas coisas que uma vista de ano convida a
 * fazer: **uma só cor de acento**, e **nada de comunicar estado só por cor**.
 *
 * Cor: há uma, `--bo-accent`, e mais nenhuma. Os três estados de um dia
 * distinguem-se por FORMA — um dia fechado é um disco CHEIO, um dia com
 * marcações é um ponto por baixo do número, um dia livre é o número sozinho.
 * Em escala de cinzentos continuam a ser três coisas diferentes.
 *
 * Palavra: o estado de cada dia vai por extenso no nome acessível
 * (`nomeDoDia`), e o do mês vai à vista na tal linha do resumo. Quem não vê a
 * grelha tem a mesma informação, e pela frente.
 *
 * ── PORQUE É QUE NÃO HÁ LEGENDA ───────────────────────────────────────────
 *
 * Porque a Parte 10 proíbe «legenda que não filtra», e uma legenda aqui não
 * filtraria nada. O que a substitui é a própria linha do resumo: um mês que
 * diz «4 dias fechados» tem exactamente quatro discos cheios na grelha por
 * baixo, e um que diz «· 2 com marcações» tem exactamente dois pontos. A
 * correspondência ensina-se sozinha à primeira leitura, e não ocupa linha.
 *
 * ── E PORQUE É QUE OS DIAS NÃO SÃO BOTÕES ─────────────────────────────────
 *
 * Trezentos e sessenta e cinco alvos focáveis punham o ano inteiro na ordem de
 * tabulação: chegar ao painel seguinte com o teclado passava a ser 365 `Tab`.
 * O alvo desta vista é o MÊS — é a unidade da pergunta —, portanto há doze
 * botões e não mais. Quem quer o dia carrega no mês e cai na grelha do mês,
 * que é onde os dias já são alvos e onde se marca.
 */

/**
 * As iniciais dos dias, com a semana a começar à SEGUNDA (locale `pt-PT`,
 * Parte 9.6 do sistema de design).
 *
 * Uma inicial e não três: a três letras («Seg Ter Qua…») uma coluna precisa de
 * ~28 px e o mini-mês passava dos 200 px de largura — a 375 px caberia um por
 * ecrã. As iniciais repetem-se (S/T/Q/Q/S/S/D) e sozinhas não se leriam, por
 * isso o nome inteiro vai no `aria-label` de cada cabeçalho de coluna e o
 * visível fica `aria-hidden`.
 */
const INICIAIS: readonly { inicial: string; nome: string }[] = DIAS_DA_SEMANA.map((d) => ({
  // A inicial é DERIVADA do «Seg» e não escrita à mão ao lado dele: assim não
  // há maneira de as duas discordarem. A lista dos sete vive no
  // `lib/orcamento/ano-do-calendario` porque este ecrã tem agora quatro vistas
  // a nomear os mesmos dias — ver o comentário dela.
  inicial: d.curto[0],
  nome: d.nome,
}));

/** As semanas de um mês: linhas de sete, com `null` nas células vazias. */
function semanas(m: MesDoAno): (DiaDoAno | null)[][] {
  const celulas: (DiaDoAno | null)[] = [...Array<null>(m.desvio).fill(null), ...m.dias];
  while (celulas.length % 7 !== 0) celulas.push(null);
  const linhas: (DiaDoAno | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) linhas.push(celulas.slice(i, i + 7));
  return linhas;
}

export interface CalendarioAnoProps {
  ano: number;
  quotes: readonly Quote[];
  /** As marcações à mão — reuniões, datas fechadas, notas. */
  marcacoes: readonly CalendarEvent[];
  /** "yyyy-mm-dd" de hoje, para o dia de hoje se marcar. */
  hoje: string;
  /** Abrir a grelha do mês (0–11). É a única saída desta vista. */
  onAbrirMes: (mes: number) => void;
}

export default function CalendarioAno({
  ano,
  quotes,
  marcacoes,
  hoje,
  onAbrirMes,
}: CalendarioAnoProps) {
  const meses = useMemo(() => anoDoCalendario(ano, quotes, marcacoes), [ano, quotes, marcacoes]);

  return (
    /* `@container` e não `sm:`/`lg:`: esta grelha vive dentro do cartão do
       calendário, que num ecrã largo perde 320 px para a coluna dos próximos
       eventos. A pergunta é sobre a largura da CAIXA e não sobre a da janela —
       é o critério do `Cortes.contrato.test.ts` para escolher a régua. */
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @[26rem]:grid-cols-2 @[42rem]:grid-cols-3 @[58rem]:grid-cols-4">
        {meses.map((m) => {
          const resumo = resumoDoMes(m);
          const tomado = m.fechados > 0;
          return (
            <div
              key={m.mes}
              className="rounded-lg border border-[var(--bo-hairline)] bg-[var(--bo-surface)] p-3"
            >
              {/* O mês é o alvo, e o alvo é a linha inteira: nome e resumo
                  entram no mesmo botão para não haver um sítio morto entre os
                  dois (Parte 12.1 — nunca espaço morto entre alvos).

                  ── E O NOME ACESSÍVEL É ESCRITO, NÃO HERDADO ──────────────
                  Herdado do conteúdo dava «JulhoLivre», tudo pegado: os dois
                  `<span>` são irmãos sem um espaço de texto entre eles (o JSX
                  come-o), e o nome de um botão é a concatenação do que lá está
                  dentro. Doze botões a anunciarem-se «JulhoLivre»,
                  «Agosto2 dias fechados». Escrito à mão é uma frase, e é a
                  mesma que a grelha por baixo repete.

                  Sem `title`: o botão tem texto, e a Parte 9.1 do sistema de
                  design é explícita — «botões com texto não levam tooltip». */}
              <button
                type="button"
                onClick={() => onAbrirMes(m.mes)}
                aria-label={`${m.nome} de ${ano} — ${resumo}`}
                /* `min-h-10` com rato e 44 px com dedo — o alvo mínimo da
                   Parte 16, e a mesma régua que o `Button` da casa usa. Uma
                   linha de texto de 13 px dava 26 px, e são doze destes numa
                   grelha apertada: falhar um abre o mês do lado. */
                className={cn(
                  "mb-1 flex min-h-10 w-full items-center justify-between gap-2 pointer-coarse:min-h-11",
                  "rounded-md px-1 text-left",
                  "hover:bg-[var(--bo-tinta-3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--bo-accent)]",
                  ESTADO,
                  PRESSAO,
                )}
              >
                <span aria-hidden="true" className="text-[13px] font-medium text-[var(--bo-text)]">
                  {m.nome}
                </span>
                {/* A resposta à pergunta, em palavras. Um mês tomado escreve-a
                    na tinta do texto normal e um mês livre na esbatida: a
                    hierarquia acompanha o que interessa ler, e a informação
                    continua a estar na PALAVRA e não no tom. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 text-[10px] tabular-nums",
                    tomado
                      ? "font-medium text-[var(--bo-text-muted)]"
                      : "text-[var(--bo-text-faint)]",
                  )}
                >
                  {resumo}
                </span>
              </button>

              <div role="grid" aria-label={`${m.nome} de ${ano} — ${resumo}`}>
                <div role="row" className="grid grid-cols-7">
                  {INICIAIS.map((d, i) => (
                    <span
                      key={i}
                      role="columnheader"
                      aria-label={d.nome}
                      className="py-1 text-center text-[10px] text-[var(--bo-text-faint)]"
                    >
                      <span aria-hidden="true">{d.inicial}</span>
                    </span>
                  ))}
                </div>

                {semanas(m).map((linha, i) => (
                  <div key={i} role="row" className="grid grid-cols-7">
                    {linha.map((d, j) =>
                      d === null ? (
                        // Uma célula vazia continua a ser célula: tirá-la
                        // deixava a linha com menos de sete e a grelha
                        // desalinhava para quem a percorre com as setas.
                        <span key={j} role="gridcell" className="h-6" />
                      ) : (
                        <span
                          key={j}
                          role="gridcell"
                          aria-label={nomeDoDia(d, m.nome, ano)}
                          aria-current={d.data === hoje ? "date" : undefined}
                          className={cn(
                            "relative flex h-6 items-center justify-center rounded-md",
                            d.data === hoje && "ring-1 ring-[var(--bo-accent)]",
                          )}
                        >
                          {/* O DISCO CHEIO é o dia fechado, e a forma é que o
                              diz — não o tom. Um dia livre é o número sozinho.
                              Ver o cabeçalho: a cor é uma só. */}
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-5 items-center justify-center rounded-full text-[10px] tabular-nums",
                              d.estado === "fechado"
                                ? "bg-[var(--bo-accent)] font-semibold text-[var(--bo-sobre-acento)]"
                                : d.estado === "marcado"
                                  ? "text-[var(--bo-text)]"
                                  : "text-[var(--bo-text-faint)]",
                            )}
                          >
                            {d.dia}
                          </span>
                          {/* E O PONTO é o dia com marcações que NÃO o fecham —
                              um pedido por responder, uma reunião, uma nota.
                              Fica por baixo do número, dentro dos 24 px da
                              célula, para não empurrar a linha. */}
                          {d.estado === "marcado" && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-0 size-1 rounded-full bg-[var(--bo-accent)]"
                            />
                          )}
                        </span>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
