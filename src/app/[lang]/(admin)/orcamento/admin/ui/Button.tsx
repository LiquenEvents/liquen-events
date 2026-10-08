"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";

/**
 * The back-office button, redesigned for the calm "ChatGPT-app" direction while
 * staying on the Líquen palette (moss `#4c6752`, forest ink, cream). One button
 * so every screen shares the same radii, focus ring, motion and disabled feel.
 *
 * Design notes
 * - Colours come from the existing tokens only — no new palette. `primary` fills
 *   with moss-dark `#4c6752` (≈6:1 on white → WCAG AA); `secondary` is a grey
 *   fill (one ink step, `--bo-tinta-8`); `ghost` is quiet until hover; `subtle` is the soft moss tint used for
 *   in-context actions; `danger` is a dark red that also passes AA on white.
 * - Focus ring is inherited from the global `:focus-visible` rule in globals.css
 *   (a 2px surface gap + moss halo); we only round the corners so it hugs them.
 * - Motion is gated behind `motion-safe:` so reduced-motion users get no press
 *   scale or colour tween.
 * - State is never colour-only: `loading` swaps in a spinner and sets
 *   `aria-busy`; `disabled` also lowers opacity and blocks the pointer.
 *
 * @example
 * <Button variant="primary" onClick={save}>Guardar</Button>
 * <Button variant="secondary" size="sm" iconLeft={<PlusIcon />}>Novo pedido</Button>
 * <Button variant="danger" loading={deleting}>Eliminar</Button>
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight / intent. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Padding + type scale. Defaults to `md`. */
  size?: ButtonSize;
  /** Shows a spinner, sets `aria-busy` and blocks clicks. Keeps the label visible. */
  loading?: boolean;
  /** Icon rendered before the label (or replaced by the spinner while loading). */
  iconLeft?: ReactNode;
  /** Icon rendered after the label. */
  iconRight?: ReactNode;
  /** Stretch to the full width of the container. */
  fullWidth?: boolean;
}

/**
 * ── PORQUE É QUE O MOVIMENTO SAIU DAQUI ───────────────────────────────────
 *
 * Estas duas linhas eram, até agora, `motion-safe:duration-150` mais
 * `motion-safe:active:scale-[0.98]`. Duas avarias medidas no CSS compilado:
 *
 *  · os 150 ms não foram escolhidos por ninguém — são o
 *    `--default-transition-duration` do Tailwind, e apareciam iguais nos oito
 *    primitivos desta pasta porque nenhum pedia duração;
 *  · e o `scale-[0.98]` NÃO estava a transicionar. No Tailwind v4 essa classe
 *    emite a propriedade autónoma `scale: 0.98`, e a lista dizia
 *    `transition-[…,transform]` — que não cobre `scale`. O carregar era um
 *    corte seco.
 *
 * Ver `movimento.ts` para a escala e para os números. O que se ganha aqui é o
 * toque a 20 ms (o corte seco desaparece sem custar latência) e o estado nos
 * 120 ms do degrau `micro` da casa.
 */
/**
 * ── `rounded-full` E NÃO `rounded-xl`: A CURVA É DE QUEM SE CLICA ──────────
 *
 * A análise mediu os dois sites de referência e os dois dizem o mesmo com
 * números diferentes: a Apple põe `border-radius: 980px` em 33 elementos — «os
 * botões são TODOS pílulas» — e deixa os tiles e as imagens a raio zero; a
 * Pixelmatters põe 32 px (pílula) nos botões e na navegação e 8 px nos cartões
 * e nas imagens. «O raio máximo está reservado ao elemento clicável.»
 *
 * Aqui o conteúdo passou todo para 8 px de uma vez, colapsando a escala do
 * Tailwind no `globals.css`. Se este primitivo ficasse em `rounded-xl`, os 151
 * botões que passam por ele ficavam com o MESMO canto do cartão onde assentam
 * — e a distinção que este bloco inteiro serve para criar desaparecia no sítio
 * onde ela mais conta.
 *
 * Uma linha, 151 botões. Os 34 `<button>` em cru do back office ficam nos 8 px
 * de propósito: são separadores, linhas de lista e botões de ícone dentro de
 * barras — coisas que se clicam mas que SÃO a superfície, e não uma acção
 * assente nela. A pílula é para o que se destaca do que está por baixo.
 */
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.02em] " +
  "select-none whitespace-nowrap disabled:opacity-45 disabled:pointer-events-none " +
  `${ESTADO} ${PRESSAO}`;

/**
 * ── A TINTA DE PRESSÃO, E ONDE ELA NÃO EXISTE ─────────────────────────────
 *
 * Onde a variante já tem uma tinta translúcida no vocabulário (`secondary`,
 * `ghost`, `subtle`), o carregar aprofunda-a um degrau — mesma cor, opacidade
 * seguinte —, e os 20 ms do `PRESSAO` cobrem-na.
 *
 * As duas variantes CHEIAS (`primary`, `danger`) ficam só com o gesto de
 * escala, e isto é uma falta assumida e não um esquecimento: escurecer um
 * `#4c6752` cheio obriga a um sexto verde e a um terceiro vermelho, e o
 * `DESIGN.md` desta pasta é explícito — «no new palette», «resist inventing a
 * parallel palette». Dois tokens de pressão resolvem-no no dia em que
 * existirem; até lá o corte seco desapareceu na mesma, porque o que o tirou
 * foi a transição, não a cor.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  // Moss-dark solid — the affirmative primary action.
  primary: "bg-sage-600 text-white hover:bg-[var(--bo-accent-hover)]",
  // ── O SECUNDÁRIO É CINZENTO CHEIO, E NÃO CONTORNO ────────────────────────
  //
  // Pedido do `docs/PROPOSTAS-E-TEMAS-APPLE.md` §6: «primário verde,
  // secundário cinza». Era um contorno branco (`bg-[var(--bo-surface)]` com
  // `border-foreground/28`); passa a preenchimento, sem borda.
  //
  // ── PORQUE É QUE O CINZENTO É UM DEGRAU DA TINTA E NÃO O `--bo-surface-sunken` ─
  //
  // O plano pedia o `--bo-surface-sunken`, e no claro ele é #f7f7f8 — contra o
  // chão do painel (#f7f8f7) mede 1,01:1. Um botão da cor do chão onde assenta
  // não se vê. No escuro é o MESMO valor do `--bo-elevado` (#1e241e), e
  // desaparecia dentro de qualquer diálogo.
  //
  // A tinta-8 é translúcida: é sempre um degrau mais escura do que o que está
  // por baixo, seja o cartão, o chão, o diálogo ou o vidro (o `systemFill` da
  // Apple faz o mesmo). Medido, com as contas do `contraste-do-texto.test.ts`:
  //
  //                         fundo do botão    texto (--bo-text) sobre ele
  //   claro, sobre cartão       1,19:1             10,34:1
  //   claro, sobre o chão       1,18:1              9,90:1
  //   escuro, sobre cartão      1,24:1              9,12:1
  //   escuro, sobre o chão      1,21:1              9,88:1
  //   escuro, sobre elevado-2   1,26:1              7,44:1
  //
  // ── E CONTINUA A NÃO PARECER DESACTIVADO ─────────────────────────────────
  //
  // Foi o defeito do contorno a 13%: o desactivado é o mesmo desenho com
  // `opacity-45` por cima. Aqui o texto do desactivado desce para 2,3:1 no
  // claro e 2,8–3,1:1 no escuro, contra ≥ 7,4:1 do activo — a etiqueta é que
  // diz «posso» ou «não posso», e a diferença é de mais de duas vezes e meia.
  //
  // O passar do rato e o carregar descem um degrau de tinta cada (8 → 10 → 13);
  // a tinta-6 fica para o `ghost`, que é o hover dele — assim um fantasma
  // debaixo do rato nunca se confunde com um secundário em repouso.
  secondary:
    "bg-[var(--bo-tinta-8)] text-[var(--bo-text)] hover:bg-[var(--bo-tinta-10)] hover:text-foreground " +
    "active:bg-[var(--bo-tinta-13)]",
  // Quiet until hovered — for toolbars and low-emphasis rows.
  ghost:
    "bg-transparent text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text)] " +
    "active:bg-[var(--bo-tinta-10)]",
  // Soft moss tint — an in-context "yes, this one" without full weight.
  subtle: "bg-sage-600/10 text-sage-600 hover:bg-sage-600/[0.16] active:bg-sage-600/[0.24]",
  // Dark red solid (~5:1 on white) — destructive actions.
  danger: "bg-[var(--bo-perigo)] text-white hover:bg-[var(--bo-perigo)]",
};

/**
 * Alturas por tamanho, com um mínimo de 44 px onde se toca com o dedo.
 *
 * ── Porquê 44, e porquê só no dedo ────────────────────────────────────────
 * 44×44 px é o mínimo das Human Interface Guidelines da Apple (o Material
 * Design pede 48 dp). Não é gosto: a polpa do dedo cobre ~10 mm e o ecrã não
 * sabe onde está o centro dela, portanto abaixo disto a taxa de toques errados
 * sobe depressa. Com rato é outra história — o ponteiro tem um pixel de
 * precisão, e alturas de 32/40 px são o que dá a densidade calma que este back
 * office quer no portátil.
 *
 * `pointer-coarse:` resolve para `@media (pointer: coarse)`, que é verdade num
 * telemóvel ou tablet e falso com rato. Portanto: o portátil fica EXACTAMENTE
 * como estava, e o telemóvel — onde a dona trabalha a sério — passa a ter
 * alvos em que se acerta.
 *
 * `lg` já tem 48 px e não precisa de nada.
 *
 * Isto sozinho trata de 175 botões espalhados pelo back office: era a razão
 * pela qual quase todos os alvos medidos a 375 px davam 32 ou 40 px de altura.
 */
const SIZES: Record<ButtonSize, string> = {
  /* ── AS ALTURAS, E A REGRA QUE ELAS PARECEM QUEBRAR ────────────────────
     Do sistema de design: 32 · 40 · 52 px, com folgas de 12 · 16 · 24. As
     duas primeiras alturas e as três folgas já estavam certas; o grande media
     48 e o tamanho da letra estava escrito à mão.

     Os 52 não constam da lista de espaçamentos da grelha de 4 (4, 8, 12, 16,
     20, 24, 32, 40, 48, 64) — mas essa lista é de ESPAÇO, e isto é altura. 52
     é múltiplo de 4 e é o número que o documento dá para este degrau; a
     mesma distinção que a linha de tabela de 44 px obrigou a fazer.

     O `pointer-coarse:h-11` é o alvo de 44 px no dedo. O degrau grande não
     precisa dele: 52 já está acima. */
  sm: "h-8 pointer-coarse:h-11 px-3 text-caption",
  md: "h-10 pointer-coarse:h-11 px-4 text-callout",
  lg: "h-13 px-6 text-body",
};

function Spinner() {
  return (
    <svg
      className="motion-safe:animate-spin shrink-0"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    disabled,
    type,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // Default to type="button" so a primitive dropped inside a <form> never
      // submits it by accident — callers opt into submit explicitly.
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {/* ── O RODOPIO ENTRA A SECO, E FICA ASSIM DE PROPÓSITO ──────────────
          Está aqui escrito porque parece um esquecimento e não é. A troca
          `iconLeft` → `<Spinner/>` acontece num fotograma, sem transição
          nenhuma, e foi considerada três vezes.

          1. `loading` QUER DIZER QUE A PESSOA ESTÁ À ESPERA DA REDE. É o
             único sítio deste vocabulário onde a regra da casa («nenhuma
             animação pode atrasar uma tarefa») deixa de ser sobre o
             movimento e passa a ser sobre a resposta: o rodopio é o
             ACUSAR-DE-RECEBIDO do toque. Uma entrada de 120 ms atrasa em
             120 ms o único sinal de que o pedido partiu — e é exactamente
             nos primeiros décimos de segundo que alguém decide se carrega
             outra vez. Pagar latência percebida para suavizar o sinal de que
             não há latência é a troca ao contrário.

          2. O RODOPIO JÁ É MOVIMENTO. Tem `motion-safe:animate-spin`. Uma
             coisa que roda a desvanecer-se ao mesmo tempo são dois
             movimentos sobrepostos no mesmo objecto de 16 px, e lê-se como
             borrão, não como entrada.

          3. E A SAÍDA DA ETIQUETA TAMBÉM NÃO. A alternativa séria era animar
             o que SAI (o ícone) em vez do que entra, nos 120 ms do `ESTADO`.
             Mas para o ícone sair enquanto o rodopio entra, os dois têm de
             estar montados ao mesmo tempo — e aí o botão fica 120 ms mais
             largo e volta a encolher. Um botão a mudar de largura debaixo do
             dedo, no instante a seguir ao toque, é pior do que o corte seco
             que se queria tirar. (O salto de largura quando não há `iconLeft`
             nenhum é real e continua por resolver; resolve-se com espaço
             reservado, que é layout e não animação — não se remenda com uma
             transição.)

          Ou seja: o certo aqui é NÃO MEXER. Quem vier a seguir com vontade de
          «acabar o trabalho» neste sítio tem estas três razões para ler
          primeiro. */}
      {loading ? <Spinner /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});
