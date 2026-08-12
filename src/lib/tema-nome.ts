import { PALAVRAS_CERTAS } from "./proposal-ortografia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A HIGIENE DOS NOMES DOS TEMAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A biblioteca tem 18 temas escritos ao longo de meses, e nota-se: há
 * «bouquets campestres» e «lapelas» em minúsculas ao lado de «Bouquets Branco e
 * Amarelo», há «Cerimonia Simbólica» sem acento no primeiro e com acento no
 * segundo, e há «Seatings Plans», que põe o plural na palavra errada.
 *
 * Isto não é cosmética. Os nomes dos temas são o índice pelo qual ela procura,
 * e a pesquisa de hoje é por NOME: um tema escrito de forma diferente do que se
 * escreve na caixa é um tema que não aparece.
 *
 * ── O QUE ISTO FAZ, E O QUE NÃO FAZ ───────────────────────────────────────
 * Faz três coisas, todas reversíveis e nenhuma automática: propõe. Quem decide
 * é quem está a escrever — um nome próprio, uma sigla ou uma escolha
 * deliberada não podem ser corrigidos por um dicionário.
 *
 *   1. os ACENTOS, do mesmo dicionário que já corrige os campos impressos da
 *      proposta (`proposal-ortografia.ts`). Uma palavra só entra nesse
 *      dicionário quando a forma sem acentos não é, ela própria, uma palavra
 *      portuguesa — é isso que impede «e» de virar «é»;
 *   2. as MAIÚSCULAS, em caixa de título com as preposições em minúsculas
 *      («Bouquets Branco e Amarelo», não «Bouquets Branco E Amarelo»);
 *   3. os erros CONHECIDOS, que são poucos e nomeados um a um.
 *
 * Não inventa nada fora disto. Não traduz, não encurta, não «melhora» o nome —
 * um corrector que reescreve o que a dona escreveu deixa de ser usado à
 * segunda vez que o faz.
 */

/** `cerimonia` → `cerimónia`. A mesma chave e o mesmo dicionário da proposta. */
const semAcentos = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const POR_CHAVE: ReadonlyMap<string, string> = new Map(
  PALAVRAS_CERTAS.map((p) => [semAcentos(p), p]),
);

/**
 * As palavras que ficam em minúsculas no meio de um título.
 *
 * Nunca na PRIMEIRA posição: «De Manhã» é um nome, «de Manhã» é um engano.
 */
const MINUSCULAS_NO_MEIO = new Set([
  "a",
  "as",
  "o",
  "os",
  "e",
  "de",
  "da",
  "das",
  "do",
  "dos",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "com",
  "sem",
  "para",
  "por",
  "ao",
  "aos",
  "à",
  "às",
]);

/**
 * Erros conhecidos, nomeados um a um.
 *
 * Uma lista curta e explícita, e não uma regra esperta: «Seatings Plans» é o
 * plural na palavra errada (em inglês o plural vai no substantivo, não no
 * adjectivo), e não há regra geral que o apanhe sem apanhar mais coisas.
 * Comparados sem acentos e sem maiúsculas, para «SEATINGS PLANS» também entrar.
 */
const ERROS_CONHECIDOS: ReadonlyArray<readonly [errado: string, certo: string]> = [
  ["seatings plans", "Seating Plans"],
  ["seatings plan", "Seating Plan"],
];

/** As palavras que vão em CAPITULARES e não devem ser tocadas. */
const SIGLAS = new Set(["dj", "led", "pdf", "iva"]);

function comMaiusculaInicial(palavra: string): string {
  return palavra.charAt(0).toUpperCase() + palavra.slice(1);
}

/**
 * O nome arrumado. Puro e total: qualquer entrada devolve uma cadeia.
 *
 * Colapsa também os espaços a mais — «Bouquets  Campestres » é o mesmo tema, e
 * um espaço invisível no fim é dos erros mais difíceis de ver e de procurar.
 */
export function arrumarNomeDeTema(bruto: string): string {
  const limpo = String(bruto ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo) return "";

  const conhecido = ERROS_CONHECIDOS.find(([errado]) => semAcentos(limpo) === errado);
  if (conhecido) return conhecido[1];

  return limpo
    .split(" ")
    .map((palavra, i) => {
      const chave = semAcentos(palavra);
      if (SIGLAS.has(chave)) return palavra.toUpperCase();

      // O acento primeiro: a forma certa do dicionário traz a sua própria
      // grafia, e é sobre ela que a caixa de título decide.
      const comAcento = POR_CHAVE.get(chave) ?? palavra;
      if (i > 0 && MINUSCULAS_NO_MEIO.has(chave)) return comAcento.toLowerCase();
      return comMaiusculaInicial(comAcento.toLowerCase());
    })
    .join(" ");
}

/** O nome precisa de ser arrumado? (para só se propor quando há o que propor) */
export function nomePrecisaDeArrumo(bruto: string): boolean {
  const arrumado = arrumarNomeDeTema(bruto);
  return arrumado.length > 0 && arrumado !== String(bruto ?? "").trim();
}

/**
 * O que mudaria numa lista inteira — para a revisão em lote poder mostrar a
 * proposta antes de lhe tocar, e para quem lê o relatório ver o antes e o
 * depois lado a lado.
 */
export function arrumosDeNomes(nomes: readonly string[]): Array<{ antes: string; depois: string }> {
  return nomes
    .map((antes) => ({ antes, depois: arrumarNomeDeTema(antes) }))
    .filter((x) => x.depois !== x.antes.trim() && x.depois.length > 0);
}
