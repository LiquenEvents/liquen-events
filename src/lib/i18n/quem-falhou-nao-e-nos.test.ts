import { describe, it, expect } from "vitest";
import { pt } from "./pt";
import { en } from "./en";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO ALGUMA COISA FALHA, O SUJEITO NÃO É «NÓS»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Regra 2 do capítulo «Escrita» — evitar «nós»: nada de «Estamos com problemas
 * a guardar». Uma frase assim põe quem lê a assistir ao esforço da casa em vez
 * de lhe dizer o que aconteceu e o que fazer a seguir. E é sempre mais longa:
 * «Não conseguimos encontrar esta proposta» são cinco palavras para dizer o
 * que «Esta ligação não abre nenhuma proposta» diz com informação a mais (qual
 * é a coisa que não serve — a ligação).
 *
 * Duas destas escaparam, as duas na porta de entrada de um cliente:
 *
 *   · `pt.confirmacao.notFoundTitle` → «Não encontrámos este pedido»
 *   · `pt.proposta.notFoundBody`     → «Não conseguimos encontrar esta proposta.»
 *
 * ── PORQUE É QUE ISTO SÓ OLHA PARA AS CHAVES DE FALHA ─────────────────────
 *
 * Porque «nós» não é proibido — é proibido no relato de uma AVARIA. O mesmo
 * dicionário diz «Estamos felizes por fazer parte deste momento» e «estamos
 * aqui para ajudar», e essas são a voz da casa a falar de si própria, que é
 * exactamente onde a primeira pessoa do plural pertence. Um teste que as
 * apanhasse a todas nascia com uma lista de excepções, e uma lista de
 * excepções é o sítio onde um defeito se esconde à vista de toda a gente.
 *
 * O filtro é o CAMINHO da chave: `error…`, `notFound…`, `linkInvalid…`,
 * `falha…`. São as chaves cujo texto só aparece quando alguma coisa correu
 * mal, e é lá que a regra manda.
 *
 * A OFERTA DE AJUDA CONTINUA EM «NÓS», de propósito: «fale connosco e
 * enviamos-lhe a certa» é o passo seguinte (regra 3), não o relato da avaria.
 * O que se proíbe aqui é o VERBO DA FALHA na primeira pessoa do plural.
 */

/** Todos os textos de um dicionário, com o caminho até cada um. */
function textos(valor: unknown, caminho: string, fora: { caminho: string; texto: string }[]): void {
  if (typeof valor === "string") {
    fora.push({ caminho, texto: valor });
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => textos(v, `${caminho}[${i}]`, fora));
    return;
  }
  if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) textos(v, caminho ? `${caminho}.${k}` : k, fora);
  }
}

/** As chaves cujo texto só se lê quando alguma coisa correu mal. */
const CHAVE_DE_FALHA = /(^|\.)(err|error|notFound|linkInvalid|falha|invalid)/i;

/** O verbo da avaria na primeira pessoa do plural. */
const NOS_A_FALHAR: Record<"pt" | "en", RegExp> = {
  pt: /\b(não|nao)\s+(conseguimos|encontrámos|encontramos|conseguiríamos|pudemos|podemos)\b|\bestamos\s+(com|a ter|sem conseguir)\b|\btivemos\s+(um|uma|problemas)\b/i,
  en: /\bwe\s+(couldn't|could not|can't|cannot|weren't able|were unable|had (a )?(problem|trouble)|are having)\b/i,
};

describe("o relato de uma falha não se escreve em «nós»", () => {
  for (const [nome, dicionario] of [
    ["pt", pt],
    ["en", en],
  ] as const) {
    const todos: { caminho: string; texto: string }[] = [];
    textos(dicionario, "", todos);
    const deFalha = todos.filter((t) => CHAVE_DE_FALHA.test(t.caminho));

    it(`${nome}: encontra as chaves de falha para analisar`, () => {
      // Sem isto, uma mudança de nomes nas chaves esvaziava o teste em
      // silêncio e ele continuava verde a não olhar para nada.
      expect(deFalha.length).toBeGreaterThan(5);
    });

    it(`${nome}: nenhuma chave de falha põe a casa como sujeito`, () => {
      const culpadas = deFalha
        .filter((t) => NOS_A_FALHAR[nome].test(t.texto))
        .map((t) => `${nome}.${t.caminho}: ${t.texto}`);
      expect(culpadas).toEqual([]);
    });
  }

  it("o filtro apanha mesmo a frase que deixou passar", () => {
    // O teste que nunca vimos falhar não prova nada: aqui está a frase que
    // estava no dicionário, à mão, para o padrão não se poder esvaziar.
    expect(NOS_A_FALHAR.pt.test("Não conseguimos encontrar esta proposta.")).toBe(true);
    expect(NOS_A_FALHAR.pt.test("Não encontrámos este pedido")).toBe(true);
    expect(NOS_A_FALHAR.en.test("We couldn't find this proposal.")).toBe(true);
    // E deixa em paz a voz da casa a falar de si própria.
    expect(NOS_A_FALHAR.pt.test("Estamos felizes por fazer parte deste momento.")).toBe(false);
    expect(NOS_A_FALHAR.pt.test("estamos aqui para ajudar")).toBe(false);
    expect(NOS_A_FALHAR.en.test("We're so happy to be part of this moment.")).toBe(false);
  });
});
