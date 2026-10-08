"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA AGRUPADA — «como as Definições do macOS»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do `docs/PROPOSTAS-E-TEMAS-APPLE.md` (E7): um cartão com linhas de 44 px,
 * rótulo à esquerda, valor à direita, um fio entre elas e um `›` quando a
 * linha leva a algum lado. É a forma das Definições do Mac e das folhas de
 * detalhe do iPhone, e serve para ler muitos pares «nome · valor» de relance.
 * Fica pronta na Fase 1; quem a usa são as Fases 3 (o estúdio) e 5 (os Temas).
 *
 * ── O QUE ELA É, E PORQUÊ ────────────────────────────────────────────────
 *
 *  · `<ul>`/`<li>` a sério. Um leitor de ecrã diz «lista, 4 itens» antes de
 *    começar, que é a informação que um olho tira da forma do cartão.
 *  · CONTEÚDO, portanto sem sombra (`sombras-do-back-office.test.ts`) e sem
 *    vidro (`docs/LIQUID-GLASS.md`, Parte 5): branco sobre o chão, com o fio.
 *  · O fio entre as linhas é o `divide-y` do `TabelaOuCartoes` — o `divide`
 *    só pinta ENTRE irmãos, portanto a última linha não leva risco por baixo.
 *  · O título por cima e a nota por baixo ficam FORA do cartão, como no Mac:
 *    são legenda do grupo, não uma linha dele. A lista é nomeada pelo título
 *    (`aria-labelledby`) e descrita pela nota (`aria-describedby`).
 *
 * @example
 * <ListaAgrupada titulo="Evento" nota="A data vem do pedido.">
 *   <LinhaAgrupada rotulo="Data" valor="10 jun 2028" />
 *   <LinhaAgrupada rotulo="Convidados" valor={148} onClick={editar} />
 * </ListaAgrupada>
 */
export interface ListaAgrupadaProps {
  /** A legenda do grupo, por cima do cartão. Dá nome à lista. */
  titulo?: ReactNode;
  /** A nota por baixo do cartão: o que é preciso saber sobre o grupo todo. */
  nota?: ReactNode;
  /** Nome acessível quando não há `titulo` visível. */
  "aria-label"?: string;
  className?: string;
  /** As `LinhaAgrupada`. */
  children: ReactNode;
}

export function ListaAgrupada({
  titulo,
  nota,
  "aria-label": ariaLabel,
  className,
  children,
}: ListaAgrupadaProps) {
  const id = useId();
  const idTitulo = `${id}-titulo`;
  const idNota = `${id}-nota`;
  return (
    <div className={className}>
      {titulo && (
        <p id={idTitulo} className="text-caption mb-1.5 px-4 text-[var(--bo-text-muted)]">
          {titulo}
        </p>
      )}
      <ul
        aria-labelledby={titulo ? idTitulo : undefined}
        aria-label={titulo ? undefined : ariaLabel}
        aria-describedby={nota ? idNota : undefined}
        /* ── SEM `overflow-hidden`, E ISSO É DE PROPÓSITO ─────────────────
           Era a forma óbvia de arredondar as linhas de dentro, e cortava o
           anel de foco: o `:focus-visible` da casa desenha-se 2 px POR FORA
           do botão, e uma linha da largura toda tem os lados encostados à
           moldura. Em vez de cortar, a primeira e a última linha herdam o
           canto do cartão (ver `LinhaAgrupada`). */
        className="rounded-card divide-y divide-[var(--bo-hairline)] border border-[var(--bo-hairline)] bg-[var(--bo-surface)]"
      >
        {children}
      </ul>
      {nota && (
        <p id={idNota} className="text-caption mt-1.5 px-4 text-[var(--bo-text-muted)]">
          {nota}
        </p>
      )}
    </div>
  );
}

export interface LinhaAgrupadaProps {
  /** O nome da coisa, à esquerda. */
  rotulo: ReactNode;
  /** O valor, à direita, em algarismos de largura fixa. */
  valor?: ReactNode;
  /**
   * Torna a linha inteira num botão, e acrescenta o `›`. Sem isto a linha só
   * se lê — e não leva chevron, que prometeria um destino que não existe.
   */
  onClick?: () => void;
  /** Só com `onClick`: a linha fica visível mas não responde. */
  disabled?: boolean;
}

/**
 * Uma linha do grupo: 44 px no mínimo (`min-h-11`), que é o alvo de toque da
 * casa e a altura de uma linha de lista do iOS. Quando é botão, é a LINHA
 * INTEIRA — o alvo não é o `›`, é a faixa toda.
 */
export function LinhaAgrupada({ rotulo, valor, onClick, disabled }: LinhaAgrupadaProps) {
  const conteudo = (
    <>
      <span className="min-w-0 flex-1 truncate text-[var(--bo-text)]">{rotulo}</span>
      {/* O espaço não se vê (entre itens de um `flex` não conta), mas entra
          no nome do botão: sem ele o leitor de ecrã dizia «Data10 jun». */}{" "}
      {valor !== undefined && valor !== null && (
        <span className="min-w-0 shrink truncate text-right tabular-nums text-[var(--bo-text-muted)]">
          {valor}
        </span>
      )}
      {onClick && (
        <span aria-hidden="true" className="shrink-0 text-[var(--bo-text-muted)]">
          ›
        </span>
      )}
    </>
  );
  const FAIXA = "flex min-h-11 w-full items-center gap-3 px-4 text-callout";
  return (
    /* O canto do cartão passa à primeira e à última linha, e daí ao botão
       (`rounded-[inherit]`): é o que deixa a cor do rato e do carregar
       assentar dentro da curva sem um `overflow-hidden` a cortar o foco. */
    <li className="first:rounded-t-card last:rounded-b-card">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          /* O rato pinta a faixa (um degrau de tinta) e nunca a escala — a
             Parte 9.10 do sistema de design proíbe `scale` no hover de uma
             linha. O CARREGAR afunda, como em todo o comando da casa
             (`resposta-ao-toque.test.ts`) e como as linhas do
             `TabelaOuCartoes`: são 80 ms, com o dedo em cima, e a tinta desce
             mais um degrau ao mesmo tempo. */
          className={cn(
            FAIXA,
            "rounded-[inherit] text-left hover:bg-[var(--bo-tinta-3)] active:bg-[var(--bo-tinta-6)] disabled:opacity-45",
            ESTADO,
            PRESSAO,
          )}
        >
          {conteudo}
        </button>
      ) : (
        <div className={FAIXA}>{conteudo}</div>
      )}
    </li>
  );
}
