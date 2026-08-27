"use client";

import { useEffect, useRef, useState } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { MOOD_BOARD_MAX_IMAGES } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { ASPETO_POR_OMISSAO } from "@/lib/proposal-geometria";
import { layoutDoBoard, ordemDasFotos } from "@/lib/proposal-moodboard";
import { folhasAproximadas, paginasDaProposta } from "@/lib/proposal-paginas";
import FolhaDaProposta from "./FolhaDaProposta";
import PreviaDaPagina from "./PreviaDaPagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DOCUMENTO INTEIRO, PELA ORDEM EM QUE SAI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Não há forma de ver todos lado a lado para avaliar coerência
 * de paleta» — e, depois de isto existir, «"Todas" mostra 7 páginas quando o
 * PDF tem cerca de 14. Uma pré-visualização parcial dá falsa confiança.»
 *
 * As duas frases são a mesma peça em dois momentos. Esta vista nasceu para os
 * mood boards e chamava-se «Todas»: mostrava sete folhas de catorze, e as sete
 * que mostrava eram justamente aquelas onde os erros NÃO estavam. Os erros que
 * chegaram a clientes estavam na apresentação, no orçamento e nas condições —
 * as folhas que nunca se viam.
 *
 * Passa a mostrar o documento: a capa, a apresentação, o cronograma quando o
 * há, as páginas de inspiração pela `ordemDeSaida`, o orçamento, as condições,
 * as observações e a contracapa. A lista é a de `paginasDaProposta`, que é a
 * espinha do gerador — e não uma segunda opinião que um dia divergia.
 *
 * ── DUAS MANEIRAS DE DESENHAR UMA FOLHA, E PORQUÊ ─────────────────────────
 *
 * As páginas de inspiração são fotografias, e desenham-se à escala com a
 * geometria do gerador (`PreviaDaPagina`). As outras são texto, e uma folha de
 * texto não se pode paginar sem a desenhar: a `FolhaDaProposta` mostra as
 * PALAVRAS — as mesmas que vão sair — sem prometer onde a folha parte. É a
 * diferença entre uma pré-visualização e uma fotocópia, e está dita lá.
 *
 * ── CLICAR SALTA PARA ONDE O PROBLEMA NASCE ───────────────────────────────
 *
 * Palavras dela: «hoje vê-se um problema na página 5 e tem de se procurar onde
 * ele nasce». Cada página sabe que secção do formulário a produz (`seccao`), e
 * é essa que o clique abre. Uma página de inspiração salta mais fundo ainda —
 * para o cartão daquele board.
 *
 * ── AS SETAS SÓ EXISTEM ONDE HÁ ORDEM PARA MUDAR ──────────────────────────
 *
 * A capa não troca de sítio com o orçamento. Só as páginas de inspiração se
 * reordenam, e movem-se contra a inspiração VIZINHA — o que salta por cima da
 * apresentação e das folhas fixas, e deixa a lista trocada como a seta
 * prometeu. Nas pontas ficam desligadas, em vez de mexerem no que não se vê.
 */

/** Quanto tempo o rato tem de ficar quieto para a folha crescer. */
const INTENCAO_MS = 400;

export default function VistaDeConjunto({
  doc,
  ordem,
  idioma = "pt",
  urls,
  originais = {},
  aspetos,
  onMover,
  onSaltar,
  onIrParaSeccao,
  onFechar,
}: {
  doc: ProposalDoc;
  /** Índices reais dos boards, pela ordem em que as páginas saem. */
  ordem: readonly number[];
  idioma?: IdiomaDaProposta;
  urls: Record<string, string>;
  /** O original de cada foto, para quando a miniatura não existir. */
  originais?: Record<string, string>;
  /** A forma medida de cada foto, por caminho. */
  aspetos: Record<string, number>;
  /** Mover a página que está NA POSIÇÃO `de` para a posição `para`. */
  onMover: (de: number, para: number) => void;
  onSaltar: (bi: number) => void;
  /** Abrir a secção do formulário que produz uma página. */
  onIrParaSeccao: (seccao: string) => void;
  /** Fechar — só para quem a abre. Onde ela está sempre à vista (o fim do
   *  passo 1), não há nada para fechar e o botão não se desenha. */
  onFechar?: () => void;
}) {
  const paginas = paginasDaProposta(doc);
  const folhas = folhasAproximadas(doc);
  const aumentada = useIntencaoDeAmpliar();

  // As posições das páginas de inspiração DENTRO desta lista — é contra elas
  // que as setas se movem.
  const deInspiracao = paginas.flatMap((p, i) => (p.especie === "moodboard" ? [i] : []));

  return (
    <div className="mb-4 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="bo-eyebrow">Vista de conjunto</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/50">
            {/* O número que ela vê aqui é o MESMO que o botão de gerar mostra —
                sai os dois de `paginasDaProposta`. Duas contagens sobre o mesmo
                documento foi o defeito que isto veio fechar. */}
            {paginas.length} páginas, pela ordem em que saem — o PDF sai com cerca de {folhas}{" "}
            folhas. Clica numa para ir onde ela se escreve.
          </p>
        </div>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            className="alvo-toque text-[11px] font-medium text-[var(--bo-text-faint)] transition-colors hover:text-[var(--bo-text)]"
          >
            Fechar
          </button>
        )}
      </div>

      {/* Duas miniaturas, três a partir de 640, quatro a partir de 1024. O
          último degrau era `xl:` (1280): entre 1024 e 1280 lia-se um documento
          de treze folhas a três por linha — cinco linhas onde cabiam quatro —,
          e o corte não era nenhum dos três da casa. `lg:` é o mesmo sítio onde
          a barra lateral deixa de ser gaveta, portanto os três degraus desta
          fila são agora os mesmos três de todo o back office. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {paginas.map((pagina, i) => {
          const bi = pagina.bi;
          const b = bi === undefined ? undefined : doc.moodBoards[bi];
          const vi = deInspiracao.indexOf(i);
          // Para onde a página vai: o lugar da inspiração VIZINHA, na ordem
          // real dos boards. `-1` = não há vizinha desse lado.
          const anterior = vi > 0 ? paginas[deInspiracao[vi - 1]]?.bi : undefined;
          const seguinte =
            vi >= 0 && vi < deInspiracao.length - 1 ? paginas[deInspiracao[vi + 1]]?.bi : undefined;
          const pos = bi === undefined ? -1 : ordem.indexOf(bi);
          const paraTras = anterior === undefined ? -1 : ordem.indexOf(anterior);
          const paraAFrente = seguinte === undefined ? -1 : ordem.indexOf(seguinte);

          return (
            <li key={`${pagina.especie}-${bi ?? i}`} className="min-w-0">
              <button
                type="button"
                {...aumentada.pega(i, () =>
                  bi === undefined ? onIrParaSeccao(pagina.seccao) : onSaltar(bi),
                )}
                className="block w-full text-left"
                aria-label={`Ir para onde se escreve a página ${i + 1}, ${pagina.titulo}`}
              >
                {/* A folha cresce COM `transform`: não empurra nada, não abre
                    barra de deslocamento nenhuma, e é a única propriedade que o
                    telemóvel dela anima sem perder fotogramas. O ponto de
                    ancoragem sai de onde a folha está no ecrã — a da ponta
                    direita cresce para dentro em vez de sair pela margem. */}
                <div
                  className="motion-safe:transition-transform motion-safe:duration-vista motion-safe:ease-out"
                  style={
                    aumentada.qual === i
                      ? {
                          transform: "scale(1.85)",
                          transformOrigin: aumentada.ancora,
                          zIndex: 20,
                          position: "relative",
                        }
                      : undefined
                  }
                >
                  {b ? (
                    <Inspiracao b={b} urls={urls} originais={originais} aspetos={aspetos} />
                  ) : (
                    <FolhaDaProposta
                      doc={doc}
                      pagina={pagina}
                      idioma={idioma}
                      capas={(doc.coverImages ?? []).map((c) => urls[c])}
                      originaisDasCapas={(doc.coverImages ?? []).map((c) => originais[c])}
                    />
                  )}
                </div>
              </button>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="min-w-0 text-[11px] leading-tight text-[var(--bo-text-muted)]">
                  {/* «Página 4 de 7», sempre à vista: é assim que se fala de uma
                      folha ao telefone com um casal, e era o que faltava para
                      um problema visto aqui se conseguir nomear. */}
                  <span className="block tabular-nums text-foreground/45">
                    Página {i + 1} de {paginas.length}
                  </span>
                  <span className="block truncate">{pagina.titulo}</span>
                </p>
                {vi >= 0 && (
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => onMover(pos, paraTras)}
                      disabled={paraTras < 0}
                      aria-label={`Mover a página ${i + 1} para trás`}
                      className="alvo-toque flex h-6 w-6 items-center justify-center rounded-md text-foreground/45 transition-colors hover:bg-[var(--bo-tinta-6)] disabled:opacity-30"
                    >
                      <span aria-hidden="true">←</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onMover(pos, paraAFrente)}
                      disabled={paraAFrente < 0}
                      aria-label={`Mover a página ${i + 1} para a frente`}
                      className="alvo-toque flex h-6 w-6 items-center justify-center rounded-md text-foreground/45 transition-colors hover:bg-[var(--bo-tinta-6)] disabled:opacity-30"
                    >
                      <span aria-hidden="true">→</span>
                    </button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Uma página de inspiração, desenhada à escala com a geometria do gerador. */
function Inspiracao({
  b,
  urls,
  originais,
  aspetos,
}: {
  b: ProposalDoc["moodBoards"][number];
  urls: Record<string, string>;
  originais: Record<string, string>;
  aspetos: Record<string, number>;
}) {
  const desenho = ordemDasFotos(b).slice(0, MOOD_BOARD_MAX_IMAGES);
  return (
    <PreviaDaPagina
      layout={layoutDoBoard(b)}
      aspectos={desenho.map((i) => aspetos[b.images[i]] ?? ASPETO_POR_OMISSAO)}
      urls={desenho.map((i) => urls[b.images[i]])}
      originais={desenho.map((i) => originais[b.images[i]])}
      semRecorte={b.enquadramento === "forma-da-foto"}
      titulo={b.title}
      subtitulo={b.subtitulo}
      legenda={b.annotation}
    />
  );
}

/**
 * ── APROXIMAR-SE DE UMA FOLHA, SEM SAIR DA GRELHA ─────────────────────────
 *
 * Numa grelha de quatro colunas cada folha tem 170 px: dá para ver a FORMA da
 * página — cheia, vazia, desequilibrada — e não dá para ler uma palavra. Abrir
 * um diálogo para cada uma era transformar «percorrer catorze folhas» em
 * catorze aberturas e catorze fechos.
 *
 * ── PORQUE É QUE ESPERA ───────────────────────────────────────────────────
 *
 * Porque o rato atravessa a grelha para chegar às setas, e uma folha que cresce
 * de cada vez que o cursor lhe passa por cima é a grelha inteira a saltar. Os
 * 400 ms são o que separa «passei por aqui» de «estou a olhar para esta» — o
 * mesmo número que a casa já usa para as intenções e o tecto do vocabulário de
 * movimento.
 *
 * ── E PORQUE É QUE NÃO EXISTE NO TELEMÓVEL ────────────────────────────────
 *
 * Porque num telemóvel não há «passar por cima»: há tocar, e tocar já faz outra
 * coisa — salta para onde a página se escreve. Uma ampliação presa ao toque
 * roubava o gesto ao salto. `(hover: hover)` pergunta ao aparelho em vez de
 * adivinhar pela largura.
 */
function useIntencaoDeAmpliar() {
  const [qual, setQual] = useState<number | null>(null);
  const [ancora, setAncora] = useState("center");
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parar = () => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = null;
  };
  useEffect(() => parar, []);

  const podeAmpliar = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return {
    qual,
    ancora,
    pega(i: number, aoCarregar: () => void) {
      return {
        onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
          if (!podeAmpliar()) return;
          const caixa = e.currentTarget.getBoundingClientRect();
          // O ponto por onde a folha fica presa: a da ponta esquerda cresce
          // para a direita, a da direita para a esquerda. Sem isto, as folhas
          // das pontas cresciam para fora da janela — e num iPhone uma coisa
          // desenhada fora da margem é a página inteira a arrastar-se para o
          // lado, que é um defeito que esta casa já pagou uma vez.
          const meio = caixa.left + caixa.width / 2;
          const largura = window.innerWidth;
          const x = meio < largura / 3 ? "left" : meio > (largura * 2) / 3 ? "right" : "center";
          const y =
            caixa.top < window.innerHeight / 3
              ? "top"
              : caixa.bottom > (window.innerHeight * 2) / 3
                ? "bottom"
                : "center";
          setAncora(`${x} ${y}`);
          parar();
          relogio.current = setTimeout(() => setQual(i), INTENCAO_MS);
        },
        onPointerLeave: () => {
          parar();
          setQual((antes) => (antes === i ? null : antes));
        },
        // Sair da folha com o teclado, ou carregar nela, desfaz a ampliação: o
        // que vem a seguir é um salto para outro sítio da página, e a folha
        // ficaria grande por cima do que ela foi ver.
        onBlur: () => {
          parar();
          setQual((antes) => (antes === i ? null : antes));
        },
        onClick: () => {
          parar();
          setQual(null);
          aoCarregar();
        },
      };
    },
  };
}
