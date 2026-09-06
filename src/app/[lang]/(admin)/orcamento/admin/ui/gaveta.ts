"use client";

import {
  useCallback,
  useState,
  type CSSProperties,
  type MouseEvent,
  type SyntheticEvent,
} from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A GAVETA — o corpo de um `<details>`, escrito UMA vez
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O CENSO. Sete `<details>` NATIVOS nestes sete ficheiros — «Mais do painel»
 * na Visão Geral, cada secção das Estatísticas, os detalhes opcionais de uma
 * tarefa nova, os atalhos de teclado do editor de serviços, o «ver como o
 * cliente o recebe» do email, o «o que ficou de fora» dos fechos da Meta e o
 * «mudaste de telemóvel?» da entrada. Nos sete, o corpo aparecia e desaparecia
 * a corte seco. (No back office inteiro são dez: faltam dois no
 * `AdminClient.tsx` e um no `ProposalStudio.tsx`, que não se mexem daqui — a
 * palavra fica escrita para eles.)
 *
 * ── O ELEMENTO NÃO SE TROCA POR ESTADO DO REACT ────────────────────────────
 *
 * A casa escolheu o `<details>` nativo por duas razões que estão escritas no
 * `globals.css` e no `Overview.tsx`, e as duas continuam a valer:
 *
 *   · **abre sem uma linha de JavaScript** — responde ao teclado sem ninguém
 *     escrever um `onKeyDown`, e é anunciado pelo leitor de ecrã por omissão;
 *   · **o «localizar na página» do browser encontra o conteúdo mesmo FECHADO**
 *     e abre a gaveta sozinho. Um `{aberto && …}` apagava-o do DOM, e quem
 *     procurasse um nome concluía, com razão, que ele não estava no ecrã.
 *
 * Animar não é razão para desfazer nada disto. O que faltava era só uma
 * palavra para o CORPO — e é esta. Sem ela, sete sítios decidiam cada um por
 * si e voltavam a divergir: já aconteceu nesta casa com a leitura da
 * preferência de movimento, que chegou a ter duas cópias diferentes uma da
 * outra.
 *
 * ── PORQUE É QUE A ANIMAÇÃO É ARMADA PELO GESTO, E NÃO PELO `open` ─────────
 *
 * O caminho óbvio era pôr a classe no corpo e deixar o browser tratar do
 * resto: o conteúdo de um `<details>` fechado não é pintado, portanto a
 * animação correria quando ele fosse mostrado. Não serve, por duas razões, e a
 * segunda é a que decide:
 *
 *  1. **Não é verdade.** MEDIDO num Chromium a sério, com a classe deixada
 *     pendurada no corpo e a gaveta a fechar e a reabrir: aos 30 ms da
 *     reabertura o corpo estava a `opacity: 1` e a animação não voltou a
 *     correr. Ser mostrado outra vez NÃO rearranca uma animação que já
 *     terminou — só a REPOSIÇÃO da classe o faz, e é ela que o `aoAlternar`
 *     aqui em baixo garante ao fechar. A ideia de deixar isto ao browser
 *     dava uma entrada na primeira abertura e nenhuma nas seguintes, que é
 *     pior do que não ter nenhuma: parece uma avaria intermitente.
 *
 *  2. **Uma gaveta que já nasce aberta não pode animar à chegada.** As secções
 *     das Estatísticas têm `open={defaultOpen}`, e a vista onde vivem JÁ traz
 *     a sua própria cascata (`.bo-cena`, três degraus). Uma entrada à
 *     montagem batia de frente com ela: dois movimentos diferentes, ao mesmo
 *     tempo, no mesmo ecrã. O mesmo na Visão Geral, onde a gaveta é reaberta
 *     por um efeito que lê o `localStorage` — quem a deixou aberta apanhava,
 *     todas as manhãs, nove blocos a entrar por cima dos quatro da vista.
 *
 * Por isso a regra é uma só, e vale nos sete sítios: **só anima o que ELA
 * abriu, com o gesto, agora.** Restaurar de um armazenamento, chegar com
 * `open` escrito, ou ser aberta pelo ⌘F do browser não anima nada — e é o
 * comportamento certo nos três casos, porque em nenhum deles houve um gesto a
 * que o movimento pudesse responder.
 *
 * A marca entra no `onClick` do `<summary>` e não no `onToggle`: o gesto
 * anuncia-se ANTES de o browser abrir (o comportamento por omissão de um
 * clique corre depois dos ouvintes), portanto a classe já lá está quando o
 * corpo é mostrado. Pelo `onToggle` a ordem invertia-se e abria-se a fresta
 * de um fotograma pintado no sítio final antes de a animação começar — que é
 * o piscar que isto existe para não ter.
 *
 * ── AS DUAS PALAVRAS, E QUANDO É CADA UMA ─────────────────────────────────
 *
 *   · **{@link CORPO_DA_GAVETA}** (`.bo-entrada`, 240 ms, −4 px) — o corpo é
 *     UM bloco. É o caso de seis dos sete. A distância é a de um rótulo e não
 *     a de um aviso, porque o corpo não vem de fora da página: sai de debaixo
 *     do resumo que está mesmo por cima dele.
 *   · **{@link Gaveta.bloco}** (`.bo-cena`, 600 ms, 12 px, escada de 20 ms com
 *     tecto ao sexto degrau) — o corpo são VÁRIOS blocos. É o caso de um só, o
 *     «Mais do painel», e é literalmente aquilo para que a `.bo-cena` foi
 *     escrita.
 *
 * MEDIDO num Chromium a sério, com o mesmo esqueleto e a mesma ordem de
 * eventos destes sete sítios:
 *
 *     corpo, 50 ms depois do gesto     animationName      bo-entrada
 *                                      animationDuration  0.24s
 *                                      timingFunction     cubic-bezier(0, 0, 0.2, 1)
 *                                      transform          translateY(-1.53px)
 *                                      opacity            0.616
 *                                      altura             a final, desde o 1º fotograma
 *     no fim                           transform: none, opacity: 1
 *     cascata de seis blocos           0 · 20 · 40 · 60 · 80 · 100 ms
 *
 * Os quatro primeiros números são, letra por letra, os que o censo da
 * `.bo-entrada` mediu na paleta de comandos — o que confirma que isto não é
 * uma segunda entrada com ar de primeira: é a mesma.
 *
 * E a última linha é o tecto a funcionar: seis blocos gastam cem
 * milissegundos do primeiro ao último arranque. Sem o `min()`, os nove desta
 * gaveta gastavam 630.
 *
 * A escada é POR BLOCO e nunca por linha: uma cascata que anima os filhos de
 * um bloco não é uma cascata, é um tremor — está contado no
 * `Overview.entrada.test.tsx`, que já apanhou esse defeito uma vez. E uma
 * coluna de números entra num degrau só, inteira.
 *
 * O `--cena` TEM de ser escrito por bloco: é ele que o `min()` do `globals.css`
 * limita. Uma `.bo-cena` sem `--cena` lê `0` e a escada desaparece — nove
 * blocos a entrar todos ao mesmo tempo, que é o estado de que se vem.
 *
 * ── SÓ `transform` E `opacity`. NUNCA `height` ────────────────────────────
 *
 * Um `<details>` a abrir puxa para lá — a altura do corpo é a coisa que muda.
 * Não se vai: animar altura é remedir a página a cada fotograma, e a regra da
 * casa são 60 fps num telemóvel em 4G. O corpo aparece no seu tamanho final e
 * o que se move são quatro (ou doze) píxeis de deslocação e a opacidade. O
 * conteúdo está no sítio e clicável desde o primeiro fotograma: nenhuma
 * animação atrasa uma tarefa.
 *
 * ── E QUEM PEDIU MENOS MOVIMENTO ──────────────────────────────────────────
 *
 * Não há guarda em JavaScript aqui, ao contrário do `ui/saida.ts` — e a
 * diferença é real, não é descuido. Lá o que muda é o CICLO DE VIDA (um nó fica
 * montado 200 ms à espera), e um `prefers-reduced-motion` que só desligasse a
 * pintura deixava uma caixa morta por cima do que está por baixo dela. Aqui só
 * muda a PINTURA: a `.bo-entrada` e a `.bo-cena` já se desligam sozinhas dentro
 * de `@media (prefers-reduced-motion: reduce)`, no `globals.css`, e o corpo
 * abre na mesma, à mesma velocidade, sem nada a mexer.
 */

/**
 * O corpo de UM bloco: a `.bo-entrada` do `globals.css`.
 *
 * 240 ms, quatro píxeis, `cubic-bezier(0, 0, 0.2, 1)` — a curva de quem
 * APRESENTA, que só desacelera. Os números vivem lá e são guardados pelo
 * `entrada-do-que-aparece.test.ts`; aqui fica só o nome.
 */
export const CORPO_DA_GAVETA = "bo-entrada";

/**
 * Um bloco de um corpo com VÁRIOS: a `.bo-cena` do `globals.css`.
 *
 * Não se usa à mão — usa-se pelo {@link Gaveta.bloco}, que escreve o `--cena`
 * junto. Uma `.bo-cena` sem `--cena` é uma escada sem degraus.
 */
export const BLOCO_DA_GAVETA = "bo-cena";

/**
 * A SETA DO RESUMO — 200 ms, e a propriedade certa PELO NOME.
 *
 * ── OS 200 MS ────────────────────────────────────────────────────────────
 *
 * É o número que a `.bo-mais-seta` do `globals.css` já tinha escolhido para
 * esta mesma seta a rodar, com esta mesma curva. Uma transição sem duração cai
 * nos 150 ms de omissão do Tailwind — que ninguém escolheu, e que é
 * exactamente como oito ficheiros de primitivos «concordaram» durante meses
 * (ver o censo no `ui/movimento.ts`).
 *
 * ── E A PROPRIEDADE ──────────────────────────────────────────────────────
 *
 * No Tailwind v4 as classes `rotate-*`, `scale-*` e `translate-*` emitem
 * propriedades AUTÓNOMAS — `rotate-180` sai `rotate: 180deg`, e não um
 * `transform`. Um `transition-[transform]` escrito à mão não lhe toca, e foi
 * assim que o toque do `Button` esteve meses sem transição nenhuma.
 *
 * MEDIDO no Tailwind desta casa (v4.3.0, compilado): a classe utilitária
 * `transition-transform` NÃO tem esse defeito — expande para
 * `transition-property: transform, translate, scale, rotate`, ou seja cobre a
 * rotação. Fica dito porque a armadilha é verdadeira mas não é aqui: quem
 * vier «corrigir» os sítios que usam `transition-transform` não vai encontrar
 * avaria nenhuma. O que esses sítios tinham de errado era outra coisa e menor
 * — uns escreviam a duração e outros não, e quem não escrevia caía nos 150 ms.
 *
 * MEDIDO num Chromium a sério, com esta classe: aos 100 ms de uma rotação de
 * 180°, `rotate: 151.077deg` (a curva a desacelerar), a terminar nos 180. Com
 * `prefers-reduced-motion: reduce`, `transition: all 0s` e a seta salta — que
 * é o que o `motion-safe:` existe para fazer.
 *
 * Escreve-se `transition-[rotate]` na mesma, pela mesma razão por que o
 * `ESTADO` e a `MARCA` do `ui/movimento.ts` listam as suas propriedades uma a
 * uma: é a única que muda, e uma lista fechada diz o que se quis. Transicionar
 * quatro propriedades para animar uma é barato, mas lê-se como descuido.
 */
export const SETA_DA_GAVETA =
  "motion-safe:transition-[rotate] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0,0,0.2,1)]";

export interface Gaveta {
  /** Verdadeiro entre o gesto que abre e o gesto que fecha. */
  aAbrir: boolean;
  /**
   * No `<summary>`. Marca a abertura ANTES de o browser abrir a gaveta — é daí
   * que vem a garantia de que o corpo nunca chega a ser pintado no sítio final
   * sem a classe.
   */
  aoTocarNoResumo: (e: MouseEvent<HTMLElement>) => void;
  /**
   * No `<details>`. Apaga a marca quando ela fecha, para a próxima abertura
   * voltar a animar — uma classe que ficasse pendurada só animava uma vez.
   */
  aoAlternar: (e: SyntheticEvent<HTMLDetailsElement>) => void;
  /** A classe do corpo de UM bloco. Vazia enquanto não houver gesto. */
  corpo: string;
  /**
   * As propriedades de UM bloco de um corpo com vários — a classe e o degrau.
   * Vazias enquanto não houver gesto, e é por isso que a gaveta restaurada
   * aberta não escreve `--cena` nenhum.
   */
  bloco: (ordem: number) => { className: string; style?: CSSProperties };
}

export function useGaveta(): Gaveta {
  const [aAbrir, setAAbrir] = useState(false);

  const aoTocarNoResumo = useCallback((e: MouseEvent<HTMLElement>) => {
    // O `open` ainda é o de ANTES: o comportamento por omissão do clique só
    // corre depois dos ouvintes. Se está fechado, este gesto abre-o.
    const detalhe = (e.currentTarget as HTMLElement).closest("details");
    setAAbrir(!!detalhe && !detalhe.open);
  }, []);

  const aoAlternar = useCallback((e: SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open) setAAbrir(false);
  }, []);

  const bloco = useCallback(
    (ordem: number) =>
      aAbrir
        ? { className: BLOCO_DA_GAVETA, style: { "--cena": ordem } as CSSProperties }
        : { className: "" },
    [aAbrir],
  );

  return {
    aAbrir,
    aoTocarNoResumo,
    aoAlternar,
    corpo: aAbrir ? CORPO_DA_GAVETA : "",
    bloco,
  };
}
