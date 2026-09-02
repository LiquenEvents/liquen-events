"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdaptativo } from "./adaptativo";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";

/**
 * A MESMA LISTA EM DUAS FORMAS — tabela densa no computador, cartões no
 * telemóvel.
 *
 * ── Porque é que uma tabela encolhida não serve ─────────────────────────────
 * Uma tabela de seis colunas a 375 px ou ganha scroll horizontal (e metade da
 * informação fica escondida atrás de um gesto que ninguém descobre) ou aperta as
 * colunas até o texto partir em três linhas. Nos dois casos deixa de se poder
 * varrer a lista com os olhos, que é a única coisa que uma tabela faz bem.
 *
 * Um cartão por linha resolve-o, mas só se escolher o que mostrar. Por isso o
 * cartão NÃO é gerado a partir das colunas: é escrito à mão por quem conhece o
 * ecrã, e mostra as quatro coisas que interessam em vez das dez que a tabela
 * mostra. É a diferença entre adaptar e converter.
 *
 * ── O que é partilhado ──────────────────────────────────────────────────────
 * Os DADOS e a ORDEM. A ordenação, a selecção e o que está filtrado vivem aqui,
 * uma vez, e as duas formas leem o mesmo. Nenhuma regra de negócio entra neste
 * ficheiro.
 */

export interface Coluna<T> {
  /** Identificador estável — é por ele que a ordenação se lembra da escolha. */
  chave: string;
  cabecalho: string;
  celula: (item: T) => ReactNode;
  /** Comparador. Sem ele, a coluna não é ordenável (e não finge que é). */
  ordenar?: (a: T, b: T) => number;
  /** Colunas de contexto que só aparecem quando há mesmo espaço (≥1440). É
   *  assim que se ganha densidade no ecrã grande sem apertar o médio. */
  soLargo?: boolean;
  alinharADireita?: boolean;
  /** Largura fixa (classe do Tailwind), para colunas de números ou de ícones. */
  largura?: string;
}

export interface TabelaOuCartoesProps<T> {
  itens: readonly T[];
  chaveDe: (item: T) => string;
  colunas: readonly Coluna<T>[];
  /** O cartão do telemóvel. Escrito à mão de propósito — ver acima. */
  cartao: (item: T) => ReactNode;
  /** Abrir a linha/cartão. Quando existe, a linha inteira é tocável. */
  aoAbrir?: (item: T) => void;
  /** O que mostrar quando não há nada. */
  vazio?: ReactNode;
  /** Ordenação inicial. */
  ordemInicial?: { chave: string; ascendente: boolean };
  /** Rótulo acessível da tabela. */
  legenda: string;
  /**
   * O cartão já traz a sua própria moldura e o seu próprio botão.
   *
   * Existe para os ecrãs cujo cartão de telemóvel já foi desenhado e auditado —
   * envolvê-lo noutra caixa daria duas bordas e, pior, um botão dentro de outro
   * botão. Nesses casos o `aoAbrir` é ignorado no telemóvel: quem abre é o
   * próprio cartão.
   */
  semMoldura?: boolean;
}

export function TabelaOuCartoes<T>({
  itens,
  chaveDe,
  colunas,
  cartao,
  aoAbrir,
  vazio,
  ordemInicial,
  legenda,
  semMoldura = false,
}: TabelaOuCartoesProps<T>) {
  const { desktop, largo, montado } = useAdaptativo();
  const [ordem, setOrdem] = useState(ordemInicial ?? null);
  const caixa = useRef<HTMLDivElement>(null);
  const [rolavel, setRolavel] = useState(false);

  /**
   * A CAIXA RECEBE FOCO SÓ QUANDO HÁ MESMO PARA ONDE ROLAR.
   *
   * Uma zona que rola tem de ser operável sem rato (WCAG 2.1.1) — mas pôr um
   * `tabindex` permanente em TODAS as tabelas dava uma paragem de Tab antes de
   * cada uma, mesmo nas que cabem. Por isso mede-se: só quando o conteúdo pede
   * mais largura do que a caixa tem é que ela entra na ordem de tabulação e se
   * anuncia como região.
   *
   * Observa-se a caixa E a tabela lá dentro: a caixa muda de largura quando a
   * janela muda, e a tabela muda quando chega uma linha com um nome comprido —
   * é por isso que as dependências NÃO incluem `itens` nem `colunas`. O
   * `colunas` das listas é construído em cada desenho (`COLUNAS_DE_PEDIDOS(…)`
   * em `AdminClient`), portanto pô-lo aqui montava e desmontava um
   * `ResizeObserver` a cada tecla escrita no painel do pedido. Quem avisa que o
   * conteúdo mudou é o observador, não a lista de dependências.
   */
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ver = () => setRolavel(el.scrollWidth > el.clientWidth + 1);
    ver();
    const observador = new ResizeObserver(ver);
    observador.observe(el);
    const tabela = el.firstElementChild;
    if (tabela) observador.observe(tabela);
    return () => observador.disconnect();
  }, [montado, desktop, largo]);

  const ordenados = useMemo(() => {
    if (!ordem) return [...itens];
    const col = colunas.find((c) => c.chave === ordem.chave);
    if (!col?.ordenar) return [...itens];
    const cmp = col.ordenar;
    return [...itens].sort((a, b) => (ordem.ascendente ? cmp(a, b) : cmp(b, a)));
  }, [itens, colunas, ordem]);

  if (itens.length === 0 && vazio) return <>{vazio}</>;

  // Antes de montar desenha-se a forma de TELEMÓVEL: os cartões são um único
  // elemento por linha e cabem em qualquer largura, enquanto uma tabela a
  // aparecer e desaparecer num ecrã pequeno salta à vista.
  if (!montado || !desktop) {
    return (
      /**
       * ── UMA LISTA, E NÃO UMA PILHA DE CAIXAS ────────────────────────────
       *
       * Cada linha era um cartão com moldura própria, canto próprio e fundo
       * próprio, com 8 px de ar entre eles. Vinte pedidos eram vinte molduras
       * — e vinte molduras não são uma lista, são vinte coisas separadas que
       * por acaso estão em cima umas das outras.
       *
       * A moldura sobe para o GRUPO e sai de cada linha; o que separa passa a
       * ser um fio. É exactamente o mesmo movimento que os três números do
       * dinheiro da Visão Geral já tinham feito, com a razão escrita lá: «três
       * caixas com ar entre elas gastam três vezes a mesma margem».
       *
       * ── O QUE NÃO SE PERDE ──────────────────────────────────────────────
       *
       * A linha inteira continua a ser um alvo de toque, e continua a
       * responder: o `hover` e o `:active` passam a pintar a FAIXA em vez de
       * acender uma moldura. Num telemóvel isso lê-se melhor do que um
       * contorno de 1 px — a mão tapa metade do que está a tocar.
       *
       * O `p-3.5` em vez de `p-3`: sem moldura à volta, o respiro tem de vir
       * do interior. E a densidade não piora, porque desaparecem os 8 px de ar
       * entre cada duas linhas.
       */
      <ul
        className="flex flex-col divide-y divide-[var(--bo-hairline)] overflow-hidden rounded-xl border border-[var(--bo-hairline)] bg-white"
        aria-label={legenda}
      >
        {ordenados.map((item) => (
          <li key={chaveDe(item)}>
            {semMoldura ? (
              cartao(item)
            ) : aoAbrir ? (
              <button
                type="button"
                onClick={() => aoAbrir(item)}
                // Sem `motion-safe:` até aqui, e nos 150 ms por omissão. A linha
                // inteira é um alvo de toque no telemóvel — é dos sítios desta
                // pasta onde o carregar mais precisava de resposta.
                className={`alvo-toque group block w-full p-3.5 text-left hover:bg-[#4d6350]/[0.04] active:bg-[#4d6350]/[0.08] ${ESTADO} ${PRESSAO}`}
              >
                {cartao(item)}
              </button>
            ) : (
              <div className="group p-3.5">{cartao(item)}</div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const visiveis = colunas.filter((c) => !c.soLargo || largo);

  return (
    /**
     * ── A CAIXA ROLA; ANTES CORTAVA ───────────────────────────────────────
     *
     * Aqui estava `overflow-hidden` (posto para arredondar os cantos) e a
     * tabela é `w-full`: quando o conteúdo pede mais largura do que a caixa
     * tem, `w-full` não a impede de crescer — cresce, e o que passa do corte
     * fica desenhado do lado de lá, sem barra, sem gesto e sem sinal nenhum de
     * que existe. Num portátil de 1440×900 a tabela de Pedidos pedia 1537 px
     * numa caixa de 1104: «Pax» e «À espera» simplesmente não existiam para
     * quem trabalha nesse ecrã, e o `body` tem `overflow-x: clip`, portanto
     * nem a página rolava até lá.
     *
     * ── Porquê rolar, e não esconder colunas ──────────────────────────────
     * Esconder era esconder INFORMAÇÃO, e a largura de uma tabela é a do seu
     * conteúdo: um nome de casal por extenso ou uma quinta com morada completa
     * mudam a conta, portanto não há conjunto de colunas que caiba sempre. E
     * quem decide o que já não cabe é a CAIXA, não a janela — o `soLargo`
     * pergunta à janela (≥1440) e a coluna da navegação come 336 px dela, que
     * é exactamente como duas colunas foram parar ao lado de lá do corte. Uma
     * caixa que rola resolve os dois casos de uma vez, e resolve-os para todas
     * as tabelas do back office, que passam todas por aqui.
     *
     * `overflow-x-auto` e não `overflow-auto`: só a horizontal é que precisa
     * de sair do `hidden`; a vertical continua a crescer com a página, que é
     * como uma lista longa se lê.
     */
    <div
      ref={caixa}
      // Sem isto, chegar às colunas da direita exigia rato ou dedo (ver acima).
      tabIndex={rolavel ? 0 : undefined}
      role={rolavel ? "region" : undefined}
      aria-label={rolavel ? legenda : undefined}
      className="overflow-x-auto rounded-xl border border-[var(--bo-hairline)] bg-white"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-b border-[var(--bo-hairline)]">
            {visiveis.map((c) => (
              <th
                key={c.chave}
                scope="col"
                className={cn(
                  "bo-eyebrow px-3 py-2.5 text-left font-medium",
                  c.alinharADireita && "text-right",
                  c.largura,
                )}
                // `aria-sort` é o que diz a um leitor de ecrã por onde a tabela
                // está ordenada. Sem isto, a seta é decoração.
                aria-sort={
                  ordem?.chave === c.chave
                    ? ordem.ascendente
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {c.ordenar ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOrdem((prev) =>
                        prev?.chave === c.chave
                          ? { chave: c.chave, ascendente: !prev.ascendente }
                          : { chave: c.chave, ascendente: true },
                      )
                    }
                    className="inline-flex items-center gap-1 hover:text-foreground/70"
                  >
                    {c.cabecalho}
                    <span aria-hidden className="text-[9px]">
                      {ordem?.chave === c.chave ? (ordem.ascendente ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                ) : (
                  c.cabecalho
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenados.map((item) => (
            <tr
              key={chaveDe(item)}
              onClick={aoAbrir ? () => aoAbrir(item) : undefined}
              className={cn(
                // `group` para o `MenuDeAccoes` se poder revelar ao passar o
                // rato pela LINHA inteira — e não só por cima do próprio botão,
                // que obrigava a adivinhar onde ele está.
                "group border-b border-[var(--bo-hairline)] last:border-0",
                aoAbrir && "cursor-pointer hover:bg-[var(--bo-tinta-3)]",
              )}
            >
              {visiveis.map((c, i) => (
                <td
                  key={c.chave}
                  className={cn("px-3 py-2.5 align-middle", c.alinharADireita && "text-right")}
                >
                  {/* Clicar na LINHA é uma comodidade do rato. Quem navega por
                      teclado precisa de um controlo a sério, com nome — e ele
                      vai na PRIMEIRA célula, que é onde está a identificação da
                      linha (o nome do casal, o número da factura). Sem isto a
                      tabela era inutilizável sem rato, que é o defeito mais
                      fácil de introduzir aqui e o mais difícil de notar. */}
                  {aoAbrir && i === 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        aoAbrir(item);
                      }}
                      className="text-left hover:underline focus-visible:underline"
                    >
                      {c.celula(item)}
                    </button>
                  ) : (
                    c.celula(item)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
