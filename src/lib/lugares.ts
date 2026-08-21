/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ARTIGO DE UM ESPAÇO — «na Torre de Palma», «no Convento do Espinheiro»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num email real enviado a uma cliente:
 *
 *     «…enviamos a nossa proposta de decoração e respetivo orçamento para o
 *      ␣no Torre de Palma, a 27 de setembro de 2027.»
 *
 * Duas coisas erradas na mesma linha, e são defeitos diferentes. O buraco antes
 * do «no» é o tipo de evento vazio; o «no Torre de Palma» é o assunto DESTE
 * ficheiro: a contracção estava escrita à mão dentro do modelo, colada a um
 * nome cujo género ninguém conhecia.
 *
 * Varridos os espaços que a casa usa, a preposição fixa acertava em UM:
 *
 *     na Torre de Palma            ✗ dizia «no»
 *     na Herdade da Malhadinha     ✗ dizia «no»
 *     na Quinta do Lago            ✗ dizia «no»
 *     na Adega Mayor               ✗ dizia «no»
 *     na Casa do Alentejo          ✗ dizia «no»
 *     no Convento do Espinheiro    ✓
 *
 * ── PORQUE É QUE ISTO NÃO PODE SER UMA TABELA DE NOMES E MAIS NADA ────────
 *
 * Ela escreve o local à mão, no formulário público ou no back office. Amanhã há
 * um espaço que ninguém previu. Uma tabela sozinha resolve o passado; a regra
 * abaixo resolve o futuro; e quando nem uma nem outra sabem, escreve-se a frase
 * de uma maneira que nunca está errada.
 *
 * Três degraus, por esta ordem:
 *
 *   1. A TABELA. Os espaços conhecidos, com o artigo escrito por uma pessoa. É
 *      o único degrau que pode dar uma resposta a um nome irregular.
 *   2. O SUBSTANTIVO INICIAL. «Quinta», «Herdade», «Casa», «Adega», «Torre» são
 *      femininos; «Convento», «Monte», «Palácio», «Solar», «Hotel» masculinos.
 *      É a estrutura real dos nomes de espaços em Portugal, e acerta na grande
 *      maioria dos que ainda não estão na tabela.
 *   3. O SILÊNCIO. Sem tabela e sem substantivo reconhecido, NÃO se adivinha:
 *      devolve-se `null`, e quem compõe a frase usa «em», que é neutro e está
 *      certo com qualquer nome («em Torre de Palma» é correcto, apenas menos
 *      natural do que «na»). Escolher entre «no» e «na» à sorte tem 50% de
 *      hipóteses de pôr um erro de português num email comercial; «em» tem 0%.
 *
 * O ficheiro não sabe nada sobre emails nem sobre propostas de propósito: é uma
 * regra de língua, e é usada pelo motor de variáveis e por quem mais precise.
 */

/** O género de um nome de espaço, quando se sabe. */
export type GeneroDoLugar = "f" | "m";

/**
 * OS ESPAÇOS DA CASA, com o artigo escrito à mão.
 *
 * A chave compara-se sem acentos e sem maiúsculas (ver {@link chaveDoLugar}),
 * portanto «TORRE DE PALMA» e «Torre de Palma» são a mesma entrada.
 *
 * Para acrescentar um espaço: escreve o nome como ele aparece e o género. Não é
 * preciso mais nada — e não é preciso que esteja aqui para a frase sair certa,
 * porque há o degrau 2 e o degrau 3.
 */
export const GENERO_DOS_ESPACOS: Readonly<Record<string, GeneroDoLugar>> = {
  "torre de palma": "f",
  "herdade da malhadinha nova": "f",
  "herdade da malhadinha": "f",
  "quinta do lago": "f",
  "adega mayor": "f",
  "casa do alentejo": "f",
  "convento do espinheiro": "m",
  "monte da oliveirinha": "m",
};

/**
 * Os substantivos com que os nomes de espaços começam, e o género de cada um.
 *
 * É o degrau 2, e é o que faz um espaço novo sair certo sem ninguém tocar na
 * tabela. Só a PRIMEIRA palavra conta: «Quinta da Boa Vista» é feminina pela
 * quinta, não pela vista.
 */
const GENERO_DO_SUBSTANTIVO: Readonly<Record<string, GeneroDoLugar>> = {
  quinta: "f",
  herdade: "f",
  casa: "f",
  adega: "f",
  torre: "f",
  vila: "f",
  aldeia: "f",
  pousada: "f",
  fazenda: "f",
  tapada: "f",
  igreja: "f",
  capela: "f",
  convento: "m",
  monte: "m",
  palacio: "m",
  palácio: "m",
  solar: "m",
  hotel: "m",
  castelo: "m",
  paco: "m",
  paço: "m",
  moinho: "m",
  parque: "m",
  jardim: "m",
  espaco: "m",
  espaço: "m",
};

/** Como um nome de espaço se COMPARA: sem acentos, sem maiúsculas, sem espaços
 *  repetidos. «Herdade  da MALHADINHA» e «herdade da malhadinha» são a mesma. */
export function chaveDoLugar(nome: unknown): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O género de um espaço, ou `null` quando não se sabe.
 *
 * `null` não é uma falha: é a resposta honesta que faz a frase usar «em».
 */
export function generoDoLugar(nome: unknown): GeneroDoLugar | null {
  const chave = chaveDoLugar(nome);
  if (!chave) return null;

  // 1. A tabela, primeiro: é a única que sabe responder a um nome irregular.
  const daTabela = GENERO_DOS_ESPACOS[chave];
  if (daTabela) return daTabela;

  // 2. O substantivo inicial. Um artigo já escrito à frente («a Quinta…»)
  //    salta-se: o que interessa é a palavra que dá o género.
  const palavras = chave.split(" ").filter(Boolean);
  const primeira = palavras[0] === "a" || palavras[0] === "o" ? palavras[1] : palavras[0];
  return GENERO_DO_SUBSTANTIVO[primeira ?? ""] ?? null;
}

/**
 * «na Torre de Palma», «no Convento do Espinheiro», «em Sítio Desconhecido».
 *
 * Devolve a frase INTEIRA — preposição e nome — e não só a preposição, porque
 * uma preposição sozinha só serve para voltar a ser colada à mão, que é
 * exactamente o que produziu o «no Torre de Palma».
 *
 * Vazio quando não há local: uma frase composta com isto não fica com um «em»
 * pendurado no fim.
 */
export function noLugar(nome: unknown): string {
  const escrito = String(nome ?? "").trim();
  if (!escrito) return "";
  const genero = generoDoLugar(escrito);
  const preposicao = genero === "f" ? "na" : genero === "m" ? "no" : "em";
  return `${preposicao} ${escrito}`;
}

/** A mesma coisa em inglês, onde a preposição não tem género: sempre «at». */
export function atVenue(nome: unknown): string {
  const escrito = String(nome ?? "").trim();
  return escrito ? `at ${escrito}` : "";
}
