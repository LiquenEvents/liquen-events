"use client";

import { useRef, useState } from "react";
import type { MoodBoard } from "@/lib/proposal-doc";
import { MOOD_BOARD_MAX_IMAGES } from "@/lib/proposal-doc";
import { ASPETO_POR_OMISSAO, type LayoutDeMoodboard } from "@/lib/proposal-geometria";
import { layoutDoBoard as layoutEfectivo, ordemDasFotos } from "@/lib/proposal-moodboard";
import PreviaDaPagina from "./PreviaDaPagina";
import { CORTES } from "./ui/adaptativo";
import { ESTADO, MARCA, PRESSAO } from "./ui/movimento";
import { useMarcaQueAnda } from "./ui/useMarcaQueAnda";
import { useMedida } from "./useMedida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TERCEIRA ZONA — o painel que acompanha o que está a ser editado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «hoje há uma miniatura "A página, como vai sair" por baixo de
 * cada mood board — minúscula e repetida sete vezes. Quero uma
 * pré-visualização grande e fixa à direita, no espaço hoje vazio».
 *
 * O estúdio era uma coluna de trabalho com um índice à esquerda e vazio dos
 * dois lados, enquanto o formulário se estendia por dez mil píxeis na vertical.
 * Passa a haver três zonas: onde estou (o índice), o que estou a escrever, e o
 * que vai sair.
 *
 * ── PORQUE É QUE É UM PAINEL SÓ, COM SEPARADORES ────────────────────────
 *
 * Porque a pré-visualização e a biblioteca de fotografias nunca são precisas
 * ao mesmo tempo: ou se está a montar uma página e o que faz falta são
 * fotografias à mão, ou se está a rever e o que faz falta é ver a folha. Dois
 * painéis lado a lado deixavam a coluna do meio com metade da largura — que é
 * exactamente o problema que isto existe para resolver.
 *
 * ── E PORQUE É QUE SÓ APARECE MUITO LARGO ───────────────────────────────
 *
 * Porque abaixo disso ele rouba ao trabalho. A regra da casa vale aqui como no
 * índice lateral: o editor de desktop ganha zonas, o telemóvel continua a ser o
 * formulário simples, e nada do que aqui está é a única maneira de fazer alguma
 * coisa.
 */

export interface PaginaParaOPainel {
  /** O índice REAL no documento — é por ele que o salto encontra a página. */
  bi: number;
  board: MoodBoard;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL SÓ CUSTA ONDE APARECE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um `hidden 2xl:block` esconde-o com CSS — e o React desenha-o na mesma.
 * Medido: numa proposta no tecto do gerador, desenhar as páginas aqui dentro
 * num ecrã onde elas nem se veem foi o suficiente para o estúdio deixar de
 * responder em cinco segundos num teste que antes corria à vontade.
 *
 * Quem trabalha num portátil não pode pagar o painel que não tem. Isto pergunta
 * ao navegador se ele CABE, e só aí é que há alguma coisa para desenhar.
 *
 * `useSyncExternalStore` e não um `useEffect` com estado: a resposta é uma
 * subscrição a uma coisa de fora do React, é exactamente para isso que ele
 * existe, e assim não há um fotograma desenhado com a resposta errada. No
 * servidor devolve `false` — o HTML sai sem painel e ele aparece na hidratação,
 * que é o mesmo que já acontece com o índice lateral.
 *
 * ── UM NÚMERO SÓ, E É O DA CASA ─────────────────────────────────────────
 *
 * Havia DOIS, e discordavam: esta medida dizia 1536 e o `<aside>` trazia
 * `hidden 2xl:block`, que também é 1536 — mas nenhum dos dois é um corte desta
 * casa. Os cortes são três (`ui/adaptativo.ts`), e o que quer dizer «há espaço
 * para um painel lateral SEM tirar nada ao conteúdo» é o `CORTES.largo`, 1440.
 * Entre 1440 e 1536 o painel cabia e não aparecia.
 *
 * E o `hidden … 2xl:block` sai por inteiro, não muda de número. Ele é a
 * segunda resposta à mesma pergunta, e é a resposta errada: esconder por CSS
 * é precisamente o que este ficheiro existe para NÃO fazer. Com a montagem
 * condicional, quando o `<aside>` é desenhado é porque cabe.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DECISÃO DEIXOU DE SER DAQUI — E A RAZÃO É QUE ESTE FICHEIRO NÃO A SABE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era `useMedida("(min-width: 1440px)")`: uma pergunta à JANELA. E o
 * comentário acima prometia, em letra de lei, «quando o `<aside>` é desenhado é
 * porque cabe».
 *
 * A promessa era falsa, e MEDIDA num Chromium: no painel que abre a partir do
 * cartão de um cliente — que é por onde ela chega ao estúdio — a fila das três
 * colunas tem 712 px, por mais largo que seja o ecrã. Este `<aside>` de 21rem
 * mais o índice de 12rem pedem 576 sem negociar, e a coluna onde ela escreve
 * ficava com 136 px. A 1440, com 82.
 *
 * A janela tinha 2000. A caixa onde este painel aterra tinha 712. Este ficheiro
 * não tem como saber isso — só quem desenha a fila sabe. Por isso a resposta
 * passa a vir de fora, já medida onde importa (ver `LARGURA_MINIMA_DA_FILA`, no
 * `ProposalStudio.tsx`).
 *
 * O que NÃO mudou: continua a ser montagem condicional e não `hidden`. Esconder
 * por CSS deixa dois painéis montados, cada um com o seu estado — é isso que
 * este ficheiro existe para não fazer, e continua a não fazer.
 */

export default function PainelDoEstudio({
  cabe,
  paginas,
  activa,
  urls,
  originais,
  aspetos,
  layoutPorOmissao,
  enquadramentoPorOmissao,
  onSaltar,
  onEscolherFotos,
}: {
  /** As páginas com fotografias, pela ordem em que saem. */
  paginas: readonly PaginaParaOPainel[];
  /** O `bi` da página que está a ser editada, quando se sabe. */
  activa?: number;
  urls: Record<string, string>;
  originais: Record<string, string>;
  aspetos: Record<string, number>;
  layoutPorOmissao?: LayoutDeMoodboard;
  enquadramentoPorOmissao?: "forma-da-foto";
  onSaltar: (bi: number) => void;
  /**
   * Abrir a biblioteca de temas já apontada a esta página.
   *
   * ── O QUE ISTO É, E O QUE AINDA NÃO É ───────────────────────────────────
   *
   * Ela pediu a biblioteca ABERTA no painel, para arrastar fotografias direto
   * para as páginas. Isto ainda não é isso: é o caminho mais curto para o
   * seletor que já existe, a partir do sítio onde ela está a olhar para a
   * página, sem ter de a ir procurar no meio do formulário.
   *
   * Está escrito para não se confundir com o que falta. O seletor de hoje é um
   * ecrã inteiro — com pesquisa, filtros e a marca das fotos já usadas — e
   * pô-lo dentro de uma coluna de vinte e uma polegadas é reescrevê-lo, não
   * mudá-lo de sítio.
   */
  onEscolherFotos?: (bi: number) => void;
  /**
   * Se há espaço para este painel — decidido por quem desenha a fila, que é o
   * único que sabe quanto ela mede. Sem isto, este ficheiro perguntava à janela
   * e aterrava numa caixa três vezes mais pequena.
   */
  cabe: boolean;
}) {
  const [vista, setVista] = useState<"pagina" | "documento">("pagina");

  /**
   * ── E ESTA BARRA TAMBÉM TEM UMA MARCA QUE ANDA ──────────────────────────
   *
   * Esta é a única barra de separadores do estúdio escrita à mão, fora do
   * `ui/Segmented.tsx` — e por isso a única que ficou sem o gesto que ele já
   * tem: o botão activo acendia num sítio e apagava-se no outro no mesmo
   * fotograma, com os 120 ms do `ESTADO` a mudar-lhe só a cor.
   *
   * `useMarcaQueAnda` é a mesma medida do `NavEstudio` — a zona é a barra
   * (`relative`), o marcado reconhece-se pelo `aria-selected` que estes botões
   * já tinham, e a `chave` é a vista escolhida. O desenho fica aqui, porque é
   * aqui que ele difere: a pílula do `Segmented` é `rounded-full` e branca
   * numa calha de 1 px; esta é o `rounded-[6px]` que os botões já usavam.
   *
   * O tempo é o `MARCA` da casa (250 ms, o degrau «elemento»), e a assimetria
   * é a que o `Segmented` explica: o texto acende nos 120 ms do `ESTADO` e a
   * marca chega aos 250. Não se escreve aqui um segundo número.
   */
  const separadoresRef = useRef<HTMLDivElement>(null);
  const { marca, podeAndar } = useMarcaQueAnda(separadoresRef, '[aria-selected="true"]', vista);

  const daPagina = (p: PaginaParaOPainel) => {
    const caminhos = (p.board.images ?? []).slice(0, MOOD_BOARD_MAX_IMAGES);
    const formas = caminhos.map((c) => aspetos[c] ?? ASPETO_POR_OMISSAO);
    /*
     * A preferência da proposta entra AQUI, e não dentro do `layoutDoBoard`.
     *
     * Aquela função responde «o que este board diz, ou o que o número de fotos
     * sugere» — é a mesma que o gerador usa, e ela não conhece o documento. Dar
     * -lhe o board já com o layout da proposta preenchido é o que faz o painel
     * desenhar o que o PDF vai desenhar, sem duas regras a decidir o mesmo.
     */
    const comOLayoutDaProposta = { ...p.board, layout: p.board.layout ?? layoutPorOmissao };
    const ordem = ordemDasFotos(comOLayoutDaProposta);
    return {
      layout: layoutEfectivo(comOLayoutDaProposta),
      semRecorte: (p.board.enquadramento ?? enquadramentoPorOmissao) === "forma-da-foto",
      aspectos: ordem.map((i) => formas[i] ?? ASPETO_POR_OMISSAO),
      urls: ordem.map((i) => urls[caminhos[i]]),
      originais: ordem.map((i) => originais[caminhos[i]]),
    };
  };

  /**
   * A página a mostrar em «Página».
   *
   * A que está a ser editada quando se sabe qual é, e a primeira quando não se
   * sabe — abrir o estúdio e ver o painel vazio até tocar num board era um
   * painel que parece avariado.
   */
  const aVer = paginas.find((p) => p.bi === activa) ?? paginas[0];

  // Não cabe: não há painel nenhum, nem o custo de o desenhar. Ver
  // `useLarguraQueChega`.
  if (!cabe) return null;

  return (
    <aside className="w-[21rem] shrink-0" aria-label="O que vai sair">
      {/* `sticky` e não fixo: acompanha o scroll da coluna do meio sem sair da
          página, e por isso continua a poder ser percorrido no fim do
          formulário como qualquer outra coisa. */}
      <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="bo-eyebrow">O que vai sair</p>
          {/*
           * A conta de páginas, ao vivo — E COM O NOME DO QUE CONTA.
           *
           * São as páginas de mood board: as que mudam com o que ela faz aqui.
           * As folhas fixas do documento (capa, apresentação, serviços,
           * orçamento, condições) não mudam com um clique nesta secção, e
           * contá-las aqui dava um número que nunca se mexia.
           *
           * O que mudou foi a PALAVRA. Dizia «7 páginas», e a vista de conjunto
           * ao lado diz «Página 4 de 13» sobre o mesmo documento — dois números
           * com o mesmo nome a falar de coisas diferentes, que é literalmente a
           * queixa dela: «a contagem tem de bater certo». Contam coisas
           * diferentes de propósito; o que não podiam era chamar-lhes o mesmo.
           */}
          <p className="text-[11px] text-foreground/45 tabular-nums">
            {paginas.length === 1 ? "1 inspiração" : `${paginas.length} inspirações`}
          </p>
        </div>

        {paginas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--bo-hairline-strong)] px-3 py-6 text-center text-[12px] leading-relaxed text-foreground/45">
            Ainda não há páginas de inspiração.
            <br />
            Aparecem aqui à medida que as fizeres.
          </p>
        ) : (
          <>
            <div
              ref={separadoresRef}
              role="tablist"
              aria-label="O que mostrar"
              /* `relative` porque é ESTA barra o `offsetParent` da marca: as
                 medidas que o `useMarcaQueAnda` devolve são relativas a ela. */
              className="relative mb-3 flex gap-1 rounded-lg bg-[var(--bo-tinta-6)] p-0.5"
            >
              {/* A marca que anda. `aria-hidden` porque não diz nada que o
                  `aria-selected` de cada separador não diga melhor — é
                  desenho, não informação. Fica ATRÁS dos botões (eles são
                  `relative`), para o texto continuar por cima do branco.

                  `MARCA` traz `motion-safe:` nas duas classes: quem pediu para
                  não animar vê-a mudar de sítio de um fotograma para o outro. */}
              {marca && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-0 top-0 rounded-[6px] bg-white ${
                    podeAndar ? MARCA : ""
                  }`}
                  style={{
                    translate: `${marca.x}px ${marca.y}px`,
                    width: marca.largura,
                    height: marca.altura,
                  }}
                />
              )}
              {(
                [
                  ["pagina", "Esta página"],
                  ["documento", "Todas"],
                ] as const
              ).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={vista === id}
                  onClick={() => setVista(id)}
                  className={`relative flex-1 rounded-[6px] px-2 py-1.5 text-[11px] ${ESTADO} ${PRESSAO} ${
                    vista === id
                      ? /* O fundo próprio é a rede de antes de a marca existir
                           — no servidor, e no fotograma antes da primeira
                           medida. Sai no instante em que ela está no sítio:
                           nunca há dois fundos, e nunca há nenhum. É a mesma
                           regra que o `Segmented` explica por extenso. */
                        `text-[var(--bo-text)] ${marca ? "" : "bg-white"}`
                      : "text-[var(--bo-text-muted)] hover:text-[var(--bo-text)]"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {/* ── E O PAINEL QUE CHEGA APRESENTA-SE ────────────────────────
                  O separador movia-se e o conteúdo trocava de golpe. É o mesmo
                  gesto que os separadores do painel do pedido já têm — a
                  `.view-in` da casa, 240 ms, a curva de quem apresenta.

                  ── PORQUE É QUE AQUI O `key` PODE REMONTAR ─────────────────
                  Lá os dois painéis ficam montados (só `hidden`) e a classe
                  entra e sai com eles, porque o painel que sai guarda um
                  rascunho escrito à mão. Aqui não guarda nada: o que estas
                  duas vistas mostram é derivado do documento, e o cabeçalho
                  deste ficheiro explica porque é que a vista escondida NÃO
                  pode ficar montada — desenhar todas as páginas num ecrã onde
                  não se veem foi o suficiente para o estúdio deixar de
                  responder. As duas já se desmontavam uma à outra; o `key` só
                  garante que a classe recomeça em vez de o React reaproveitar
                  o nó e a animação nunca correr. */}
              <div key={vista} className="view-in">
                {vista === "pagina" && aVer ? (
                  <>
                    <PreviaDaPagina
                      {...daPagina(aVer)}
                      titulo={aVer.board.title}
                      subtitulo={aVer.board.subtitulo}
                      legenda={aVer.board.annotation}
                    />
                    <p className="mt-2 text-center text-[11px] text-foreground/45">
                      Inspiração {paginas.findIndex((p) => p.bi === aVer.bi) + 1} de{" "}
                      {paginas.length}
                    </p>
                    {onEscolherFotos && (
                      <button
                        type="button"
                        onClick={() => onEscolherFotos(aVer.bi)}
                        className={`mt-3 w-full rounded-lg border border-[var(--bo-hairline-strong)] px-3 py-2 text-[12px] text-[var(--bo-text-muted)] hover:border-sage-600/40 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
                      >
                        Escolher fotografias para esta página
                      </button>
                    )}
                  </>
                ) : (
                  /*
                   * ── DUAS A DUAS, COMO NO PAPEL ──────────────────────────
                   *
                   * «Ver duas páginas lado a lado, como no PDF impresso.» Uma
                   * proposta lê-se em par: quem a abre num leitor de PDF vê a
                   * folha esquerda e a direita ao mesmo tempo, e a pergunta que
                   * só se faz assim é se as duas combinam.
                   */
                  <div className="grid grid-cols-2 gap-2">
                    {paginas.map((p, i) => (
                      <button
                        key={p.board.id ?? p.bi}
                        type="button"
                        onClick={() => onSaltar(p.bi)}
                        className={`rounded-[3px] text-left hover:opacity-100 ${ESTADO} ${PRESSAO} ${
                          p.bi === activa ? "opacity-100" : "opacity-75"
                        }`}
                        aria-label={`Ir para a página ${i + 1}${p.board.title ? `: ${p.board.title}` : ""}`}
                      >
                        <PreviaDaPagina
                          {...daPagina(p)}
                          titulo={p.board.title}
                          subtitulo={p.board.subtitulo}
                          legenda={p.board.annotation}
                        />
                        <span className="mt-1 block truncate text-[10px] text-foreground/45 tabular-nums">
                          {i + 1}. {p.board.title || "sem título"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
