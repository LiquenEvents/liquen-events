"use client";

import { useState } from "react";
import ImagemComPlanoB from "./ImagemComPlanoB";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA A GANHAR FORMA, ENQUANTO SE ESCOLHE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «deixa de se escolher às cegas e passa a compor-se: vê-se a
 * página a ganhar forma, e percebe-se imediatamente quando há fotos a mais ou
 * uma que não encaixa».
 *
 * O que se escolhe neste painel não vai para uma lista — vai para uma PÁGINA,
 * que tem um número de fotos que cabe e uma composição que ou funciona ou não.
 * Até aqui isso só se via depois de fechar o painel; muitas vezes só no PDF.
 *
 * ── O QUE ESTA MINIATURA MOSTRA, E O QUE NÃO MOSTRA ───────────────────────
 *
 * Mostra QUANTAS e QUAIS, na ordem em que vão ficar — e não a composição
 * exacta. A página do PDF dá às caixas a forma das fotografias (ver
 * `ordemDasFotos` no estúdio), e reproduzir isso aqui num quadrado de 100 px
 * seria uma promessa que este canto não pode cumprir. O que este canto responde
 * é a pergunta que se faz a meio de escolher: «quantas é que já tenho, e ainda
 * cabem?».
 *
 * ── E PORQUE É QUE SE PODE ESCONDER ───────────────────────────────────────
 *
 * Palavras dela: «não pode roubar espaço às fotos. Pequena, num canto, e
 * dispensável». É por isso que flutua por cima da grelha em vez de lhe tirar
 * uma linha, e que fechá-la a deixa reduzida a uma pastilha com a contagem —
 * quem não a quer não fica sem saber quantas leva.
 */

/** Onde fica a preferência de a ver ou não. */
const CHAVE = "liquen-pagina-em-construcao";

/**
 * Abaixo disto o canto começa fechado. MEDIDO no telemóvel dela: a 390 px a
 * grelha tem DUAS colunas de 171 px, e um cartão de 120 px pousado no canto
 * tapa uma fotografia inteira. Palavras dela: «não pode roubar espaço às
 * fotos» — e tapar uma foto é pior do que lhe roubar espaço, porque a foto
 * ainda lá está e não se vê.
 *
 * Fechado é uma pastilha com a contagem e o aviso, que é o que se quer saber
 * de relance; abre-se com um toque quando se quer ver o conjunto, e o toque
 * seguinte fecha-a outra vez. No computador, onde a grelha tem cinco colunas e
 * o canto não tapa nada, continua aberto.
 */
const LARGURA_PARA_ABRIR = 640;

function guardada(): boolean {
  try {
    const escolha = localStorage.getItem(CHAVE);
    // Uma escolha dela manda sempre, em qualquer largura.
    if (escolha !== null) return escolha !== "0";
  } catch {
    /* sem localStorage decide-se pela largura, como abaixo */
  }
  if (typeof window === "undefined") return true;
  return window.innerWidth >= LARGURA_PARA_ABRIR;
}

export interface FotoDaPagina {
  path: string;
  url?: string;
  /** O ORIGINAL, para quando a miniatura não existir. Ver `assetOriginais` no
   *  estúdio — nem todas as fotos têm derivadas, e assinar um caminho no
   *  Supabase não verifica que o ficheiro lá está. */
  planoB?: string;
}

export function PaginaEmConstrucao({
  titulo,
  jaLa,
  aEntrar,
  maximo,
  ancorada = false,
}: {
  /** O título da página, como ela lhe chamou. */
  titulo?: string;
  /** As fotos que a página JÁ tem. */
  jaLa: readonly FotoDaPagina[];
  /** As que estão escolhidas e ainda não entraram. */
  aEntrar: readonly FotoDaPagina[];
  /** Quantas a página do PDF imprime. */
  maximo: number;
  /**
   * ── ANCORADA, E NÃO POR CIMA DAS FOTOS ────────────────────────────────
   *
   * Palavras dela: «o cartão "Decoração Cerimónia · 4 de 10" está por cima das
   * fotos, a tapar conteúdo. Deve estar ancorado no layout, não sobreposto».
   *
   * Tem razão, e a razão de ele flutuar deixou de valer. Quando nasceu, o
   * painel era uma coluna só: qualquer sítio que ele ocupasse era uma linha de
   * fotografias a menos, e por isso ficou a flutuar no canto, pequeno e
   * dispensável. Com os temas na lateral (Fase 4) passou a haver um sítio que
   * NÃO é das fotos — o fundo da coluna dos temas — e aí ele cabe com a largura
   * toda, sem tapar nada.
   *
   * Abaixo de `lg` não há coluna nenhuma, e aí continua a flutuar: é isso ou
   * roubar altura à grelha, que é o problema que a Fase 4 acabou de resolver.
   */
  ancorada?: boolean;
}) {
  const [aberta, setAberta] = useState(guardada);
  /** Onde o cartão se põe. Ancorado não flutua; a flutuar, no canto de sempre. */
  const flutuante = ancorada ? "" : "absolute bottom-3 right-3";

  const total = jaLa.length + aEntrar.length;
  if (total === 0) return null;

  const alternar = () => {
    setAberta((v) => {
      try {
        localStorage.setItem(CHAVE, v ? "0" : "1");
      } catch {
        /* não essencial */
      }
      return !v;
    });
  };

  /** Passou do que a página imprime. É a razão nº 1 de isto existir. */
  const aMais = Math.max(0, total - maximo);

  if (!aberta) {
    return (
      <button
        type="button"
        onClick={alternar}
        aria-expanded={false}
        className={`z-10 flex items-center gap-1.5 rounded-full border border-[var(--bo-hairline-strong)] bg-white/95 px-3 py-1.5 text-xs backdrop-blur ${flutuante}`}
      >
        <span className="tabular-nums text-[var(--bo-tinta-72)]">
          {total} {total === 1 ? "foto" : "fotos"}
        </span>
        {aMais > 0 && <span className="text-[#8a6420]">· {aMais} a mais</span>}
      </button>
    );
  }

  return (
    <div
      className={`z-10 rounded-xl border border-[var(--bo-hairline-strong)] bg-white/95 p-2 shadow-[var(--bo-sombra-suspensa)] backdrop-blur ${
        ancorada ? "w-full" : "w-[7.5rem]"
      } ${flutuante}`}
      aria-label="A página em construção"
    >
      <div className="flex items-start justify-between gap-1">
        {/* Duas linhas e não uma: com 90 px de largura, «Complementos de mesa»
            cortado ao fim da primeira sílaba não diz de que página se trata —
            que é a única coisa que este título tem para dizer. */}
        <p className="line-clamp-2 min-w-0 text-[10px] uppercase leading-tight tracking-[0.1em] text-foreground/45">
          {titulo?.trim() || "Esta página"}
        </p>
        <button
          type="button"
          onClick={alternar}
          aria-expanded
          aria-label="Esconder a página em construção"
          className="alvo-invisivel relative -mr-0.5 -mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-foreground/40 hover:text-[var(--bo-tinta-72)]"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* As fotos, na ordem em que vão ficar. As que já lá estão em cheio, as
          que vão entrar com a moldura verde — a diferença entre «a página tem»
          e «a página vai ter» é a única coisa que aqui precisa de cor. */}
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {[...jaLa, ...aEntrar].slice(0, 9).map((f, i) => {
          const entrando = i >= jaLa.length;
          const excedente = i >= maximo;
          return (
            <span
              key={`${f.path}:${i}`}
              className={`relative block aspect-square overflow-hidden rounded bg-[var(--bo-tinta-6)] ${
                entrando ? "ring-1 ring-[#4d6350]" : ""
              } ${excedente ? "opacity-40" : ""}`}
            >
              {f.url && (
                /* `ImagemComPlanoB` e não um `img`: uma miniatura que não
                   existe devolve um URL bem formado e um 404, e o que se via
                   eram nove ícones de imagem partida. O plano B é o original,
                   o único que veio da listagem da pasta. */
                <ImagemComPlanoB
                  src={f.url}
                  planoB={f.planoB}
                  className="h-full w-full object-cover"
                />
              )}
            </span>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-[var(--bo-text-muted)]">
        <span className="tabular-nums">{total}</span> de {maximo}
        {total > 9 && <span className="text-foreground/40"> · mostra 9</span>}
      </p>
      {aMais > 0 && (
        /* O aviso que faz esta miniatura valer a pena: a página do PDF imprime
           `maximo`, e o que passa disso não sai. Descobrir isto aqui é uma
           escolha a menos; descobri-lo no PDF é uma proposta a refazer. */
        <p className="mt-0.5 text-[10px] leading-snug text-[#8a6420]">
          {aMais === 1 ? "1 não entra na página" : `${aMais} não entram na página`}
        </p>
      )}
    </div>
  );
}

export default PaginaEmConstrucao;
