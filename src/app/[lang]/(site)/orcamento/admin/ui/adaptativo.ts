"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FUNDAÇÕES ADAPTATIVAS DO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Responsivo ≠ adaptativo. Um layout que encolhe é responsivo; um ecrã que muda
 * de FORMA porque a tarefa é outra é adaptativo. Este módulo é o que permite o
 * segundo sem duplicar uma única regra de negócio: dá a informação, e cada ecrã
 * escolhe a apresentação.
 *
 * ── OS DOIS EIXOS, QUE NÃO SÃO O MESMO ──────────────────────────────────────
 * Esta é a decisão que mais engano evita, e por isso são duas funções e não uma:
 *
 *   LARGURA  decide o LAYOUT  — cabem duas colunas? uma tabela? uma barra ao lado?
 *   PONTEIRO decide os ALVOS  — há hover? é dedo ou rato? um menu revelado ao
 *                               passar por cima existe, ou é invisível?
 *
 * Um iPad com teclado é largo E de toque. Um portátil com ecrã táctil é largo E
 * de toque. Um telemóvel ao alto ligado a um monitor é... outra coisa. Tratar
 * "estreito" e "dedo" como sinónimos é o que faz um tablet receber a interface
 * de um telemóvel — que foi um dos quatro achados Críticos do MOBILE-AUDIT.
 *
 * ── PORQUE É QUE HÁ UM `montado` ────────────────────────────────────────────
 * O servidor não tem `window`. Se o primeiro desenho do browser já usasse a
 * largura real, o HTML do servidor e o do cliente seriam diferentes e o React
 * queixava-se (hydration mismatch) — ou pior, calava-se e deixava o ecrã num
 * estado a meio. Por isso a primeira leitura é sempre a mesma dos dois lados, e
 * `montado` diz a quem chama se o que está a ler já é a verdade.
 *
 * REGRA PRÁTICA, e está aqui para não se perder:
 *   · Diferença só de ESTILO (colunas, espaçamento, tamanhos)? Faz-se em CSS,
 *     com as variantes do Tailwind. Não custa JavaScript e não pisca.
 *   · Diferença ESTRUTURAL (uma tabela vira cartões; um diálogo vira folha
 *     inferior; um arrasto vira menu)? Aí sim usa-se este módulo — mas cuidado
 *     com o primeiro desenho.
 */

/**
 * Os pontos de corte, em píxeis.
 *
 * São os que a Catarina definiu, e coincidem de propósito com apenas TRÊS dos
 * do Tailwind: `sm` (640) e `lg` (1024) — mais um `wide` (1440) que o Tailwind
 * não tem e que aqui se acrescenta.
 *
 * `md` (768) e `xl` (1280) NÃO se usam no back office. Não é gosto: dois
 * sistemas de pontos de corte a competir é como um ecrã acaba com uma tabela a
 * três colunas a 800 px e a duas a 900 px, sem ninguém perceber porquê.
 */
export const CORTES = {
  /** Abaixo disto é telemóvel. */
  telemovel: 640,
  /** A partir daqui é desktop (e é onde a barra lateral deixa de ser gaveta). */
  desktop: 1024,
  /** Ecrã largo: há espaço para um painel lateral SEM tirar nada ao conteúdo. */
  largo: 1440,
} as const;

/** A classe de largura em que o ecrã está. */
export type Largura = "telemovel" | "tablet" | "desktop" | "largo";

/**
 * As capacidades do aparelho — o que ele SABE FAZER, não o tamanho que tem.
 */
export interface Capacidade {
  /** `(hover: hover)` — o aparelho consegue mesmo pairar? Num ecrã táctil não:
   *  tudo o que só apareça no hover é, ali, invisível. */
  hover: boolean;
  /** `(pointer: coarse)` — o apontador principal é grosso (um dedo). É isto, e
   *  não a largura, que decide se os alvos têm de ter 44 px. */
  toque: boolean;
}

/** O que o `matchMedia` diria no servidor: nada. Uma leitura só do cliente. */
const consulta = (mq: string): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(mq).matches
    : false;

/**
 * Subscreve uma media query. Feito com `useSyncExternalStore` de propósito:
 * é a API que o React 18+ tem para ler algo de fora do React sem correr o risco
 * de mostrar um valor rasgado (metade do ecrã a achar que é telemóvel e a outra
 * metade que não) quando o desenho é interrompido.
 *
 * No SERVIDOR devolve sempre `false` — que é o mesmo que o cliente devolve no
 * primeiro desenho. É essa igualdade que impede o desencontro de hidratação.
 */
function useMedia(mq: string): boolean {
  const subscrever = (avisar: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const m = window.matchMedia(mq);
    // `addEventListener` é o moderno; o Safari antigo só tem `addListener`.
    // Falhar aqui deixava o ecrã congelado na primeira leitura — o que se nota
    // exactamente quando se roda o telemóvel.
    if (typeof m.addEventListener === "function") {
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    }
    m.addListener(avisar);
    return () => m.removeListener(avisar);
  };
  return useSyncExternalStore(
    subscrever,
    () => consulta(mq),
    () => false, // servidor
  );
}

/**
 * Já estamos no browser e as leituras abaixo são a verdade?
 *
 * Enquanto for `false`, quem lê está a ver o valor do SERVIDOR. Um ecrã que
 * troque de estrutura tem de usar isto para não desenhar a versão errada e
 * saltar para a certa à frente de quem está a olhar.
 */
export function useMontado(): boolean {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  return montado;
}

/**
 * A classe de largura actual.
 *
 * NOTA sobre o valor no servidor: sem `window`, as três consultas dão `false` e
 * isto devolve `"telemovel"`. É a escolha deliberada — o layout de telemóvel é
 * o mais simples e o que menos estraga quando aparece por um instante num ecrã
 * grande. O contrário (desenhar uma tabela de desktop e trocá-la por cartões)
 * é muito mais visível.
 */
export function useLargura(): Largura {
  const acimaDeTelemovel = useMedia(`(min-width: ${CORTES.telemovel}px)`);
  const acimaDeDesktop = useMedia(`(min-width: ${CORTES.desktop}px)`);
  const acimaDeLargo = useMedia(`(min-width: ${CORTES.largo}px)`);
  if (acimaDeLargo) return "largo";
  if (acimaDeDesktop) return "desktop";
  if (acimaDeTelemovel) return "tablet";
  return "telemovel";
}

/** As capacidades do aparelho (ver `Capacidade`). */
export function useCapacidade(): Capacidade {
  const hover = useMedia("(hover: hover)");
  const toque = useMedia("(pointer: coarse)");
  return { hover, toque };
}

/** O que um ecrã precisa de saber para escolher a sua forma. */
export interface Adaptativo extends Capacidade {
  largura: Largura;
  /** Atalhos legíveis — `largura === "telemovel"` lê-se mal em JSX. */
  telemovel: boolean;
  tablet: boolean;
  /** Desktop OU largo: "há espaço para densidade". */
  desktop: boolean;
  /** Há espaço para um painel lateral sem apertar o conteúdo. */
  largo: boolean;
  /** As leituras acima já são as do browser (ver `useMontado`). */
  montado: boolean;
}

/**
 * O hook que os ecrãs usam.
 *
 * Contém APENAS informação sobre o aparelho — nenhuma regra de negócio, nenhum
 * estado de dados. É essa separação que permite ter dois layouts sem ter duas
 * versões da lógica: o hook de dados é o mesmo, e só a apresentação diverge.
 */
export function useAdaptativo(): Adaptativo {
  const largura = useLargura();
  const capacidade = useCapacidade();
  const montado = useMontado();
  return {
    ...capacidade,
    largura,
    telemovel: largura === "telemovel",
    tablet: largura === "tablet",
    desktop: largura === "desktop" || largura === "largo",
    largo: largura === "largo",
    montado,
  };
}

/**
 * Uma acção só existe se se puder descobrir.
 *
 * Devolve `true` quando revelar algo ao passar o rato por cima é aceitável — ou
 * seja, quando há hover E o apontador é fino. Em qualquer outro caso a acção
 * tem de estar visível, porque num ecrã táctil "aparece no hover" quer dizer
 * "não existe".
 *
 * É a mesma regra que já estava espalhada por `pointer-coarse:opacity-100` em
 * meia dúzia de sítios; aqui fica com nome e com a razão escrita.
 */
export function usePodeEsconderNoHover(): boolean {
  const { hover, toque } = useCapacidade();
  return hover && !toque;
}
