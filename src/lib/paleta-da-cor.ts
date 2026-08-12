import { hsl } from "./cor-dominante";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DA COR DOMINANTE PARA O EIXO «PALETA» — a etiqueta que não custa nada
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A biblioteca já sabe fazer a pergunta que interessa
 * (`?etiquetas=tipo:seating-plan,paleta:terracotta`). O que lhe falta são as
 * etiquetas: sem elas a pergunta existe e não devolve nada.
 *
 * Das quatro famílias de etiquetas, a PALETA é a única que já se pode escrever
 * sozinha — porque a cor dominante de cada fotografia já é calculada no
 * carregamento, no `image-worker.ts`, e guardada na linha da foto. Isto só
 * traduz esse `#rrggbb` para o vocabulário que a biblioteca usa.
 *
 * Sem modelo, sem API, sem um cêntimo. O trabalho já foi feito; faltava ler.
 *
 * ── O QUE ISTO NÃO É ──────────────────────────────────────────────────────
 * Não é uma classificação de estilo nem de conteúdo. Uma fotografia de um ramo
 * branco sobre uma mesa de madeira é «branco» aqui, e isso é verdade sobre a
 * COR — não sobre o que a fotografia mostra. Os eixos tipo, estilo e contexto
 * continuam a precisar de quem os diga.
 *
 * E é uma SUGESTÃO. A regra do produto é a mesma de sempre: ela corrige, não
 * classifica de raiz. Uma paleta proposta que esteja errada é um clique a
 * mudar, não um erro a viver na base de dados.
 */

/** Os valores do eixo, tal como a biblioteca os conhece (sem o prefixo). */
export type Paleta =
  | "branco"
  | "verde"
  | "amarelo"
  | "terracotta"
  | "laranja"
  | "rosa"
  | "azul"
  | "neutro";

/** O identificador completo da etiqueta, como vai no `?etiquetas=`. */
export const idDaPaleta = (p: Paleta): string => `paleta:${p}`;

/**
 * ── ONDE ESTÃO OS CORTES, E PORQUÊ ────────────────────────────────────────
 *
 * Primeiro decide-se se há COR de todo, e só depois qual é. É esta ordem que
 * evita o erro mais comum destas funções: um cinzento com um resto de azul ser
 * classificado como «azul» só porque o matiz existe matematicamente.
 *
 *   · muito claro e pouco saturado → BRANCO. É a paleta mais comum de um
 *     casamento e tem de ser sua, não do «neutro»;
 *   · pouco saturado, ou muito escuro → NEUTRO. Cinzentos, pretos, madeiras
 *     apagadas, fotografias nocturnas;
 *   · o resto vai pelo matiz.
 *
 * ── E A FRONTEIRA TERRACOTTA / LARANJA ────────────────────────────────────
 * É a única que não se resolve só com o matiz, e é a que mais interessa a esta
 * casa (a missão diz «pouco terracotta» como um dado do catálogo). Partilham a
 * mesma zona do círculo; o que as separa é a LUZ e a força:
 *
 *   um laranja é claro e forte  (L alto, S alto)
 *   um terracotta é queimado    (mais escuro ou mais apagado — barro, telha)
 *
 * O corte está em L < 0,55 ou S < 0,55. Foi escolhido contra cores reais de
 * referência (#c96f4a, #b5643c e #a0522d são terracotta; #ff8c42 e #f59a3e são
 * laranja) e os testes fixam-no — se alguém o mexer, dizem qual delas mudou de
 * lado.
 */
export function paletaDaCor(cor: string): Paleta | null {
  const c = hsl(cor);
  if (!c) return null;
  const { h, s, l } = c;

  // ── O BRANCO DECIDE-SE PELA LUZ, NÃO PELA SATURAÇÃO ──────────────────
  //
  // A saturação em HSL mente no cimo da escala: um creme (#f0ec e4) mede
  // s = 0,29 — mais do que o verde da marca — e não tem cor nenhuma para o
  // olho. Com um corte por saturação, os cremes caíam na zona quente e saíam
  // classificados como TERRACOTTA. Numa casa que quer contar quanto terracotta
  // tem no catálogo, isso não é um arredondamento: é a resposta ao contrário.
  //
  // Acima de L = 0,88 nada lê como cor: é branco, creme, marfim. Abaixo disso
  // e até 0,82, exige-se também pouca saturação.
  if (l >= 0.88) return "branco";
  if (l >= 0.82 && s < 0.45) return "branco";
  // O piso da saturação é 0,10 e não 0,16, e a razão tem nome: o VERDE DA
  // MARCA (#4d6350) mede 0,13. Com o corte a 0,16 a cor da casa era
  // classificada como «neutro» — e com ela metade das fotografias de folhagem,
  // que são apagadas por natureza. Um cinzento a sério (#6e7276) mede 0,04 e
  // continua a cair aqui.
  if (s < 0.1 || l < 0.12) return "neutro";

  if (h >= 75 && h < 170) return "verde";
  if (h >= 170 && h < 255) return "azul";
  if (h >= 255 && h < 290) return "azul"; // o violeta cai para o lado frio
  if (h >= 290 && h < 345) return "rosa";
  if (h >= 45 && h < 75) return "amarelo";

  // Zona quente (345–360 e 0–45): vermelhos, terracotta, laranja, rosas.
  if (h >= 345 || h < 12) return l >= 0.62 ? "rosa" : "terracotta";
  return l < 0.55 || s < 0.55 ? "terracotta" : "laranja";
}

/**
 * A paleta de um conjunto de fotos, contada — a base da «vista por paleta» e
 * do mapa de cobertura.
 *
 * Devolve TODAS as famílias, incluindo as que estão a zero: o valor desta vista
 * está precisamente nas células vazias («muito branco e verde, pouco
 * terracotta»), e uma lista que só mostra o que existe esconde o que falta.
 */
export function contarPorPaleta(
  cores: readonly (string | null | undefined)[],
): Record<Paleta | "desconhecida", number> {
  const conta: Record<string, number> = {
    branco: 0,
    verde: 0,
    amarelo: 0,
    terracotta: 0,
    laranja: 0,
    rosa: 0,
    azul: 0,
    neutro: 0,
    desconhecida: 0,
  };
  for (const cor of cores) {
    const p = cor ? paletaDaCor(cor) : null;
    conta[p ?? "desconhecida"] += 1;
  }
  return conta as Record<Paleta | "desconhecida", number>;
}
