"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useAdaptativo } from "./adaptativo";
import { cn } from "./cn";

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
      <ul className="flex flex-col gap-2" aria-label={legenda}>
        {ordenados.map((item) => (
          <li key={chaveDe(item)}>
            {semMoldura ? (
              cartao(item)
            ) : aoAbrir ? (
              <button
                type="button"
                onClick={() => aoAbrir(item)}
                className="alvo-toque group block w-full rounded-xl border border-foreground/[0.08] bg-white p-3 text-left transition-colors hover:border-[#4d6350]/40"
              >
                {cartao(item)}
              </button>
            ) : (
              <div className="group rounded-xl border border-foreground/[0.08] bg-white p-3">
                {cartao(item)}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const visiveis = colunas.filter((c) => !c.soLargo || largo);

  return (
    <div className="overflow-hidden rounded-xl border border-foreground/[0.08] bg-white">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-b border-foreground/[0.08]">
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
                "group border-b border-foreground/[0.05] last:border-0",
                aoAbrir && "cursor-pointer hover:bg-foreground/[0.03]",
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
