import { NOMES_FEMININOS, NOMES_MASCULINOS } from "./nomes-genero";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ESTIMADA DIANA,» — E QUANDO NÃO SE SABE, «OLÁ DIANA,»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A carta do «Pedido de proposta» abre com «Estimada Diana,». O formulário não
 * pergunta como a pessoa quer ser tratada, e ela escolheu adivinhar pelo nome:
 * «Estimado» a um nome que em Portugal é só de homem, «Estimada» a um que é só
 * de mulher.
 *
 * Tudo o que não é claro recebe «Olá …,», que é correcto para toda a gente:
 * nomes que servem aos dois (Ariel, Sasha, Alex), nomes estrangeiros que não
 * estão na lista, e nomes que noutro país são do outro género (Andrea). Errar
 * o género na primeira palavra de uma carta é pior do que não o dizer — por
 * isso a lista é estrita (ver `scripts/gen-nomes-genero.mjs`), e na dúvida
 * nunca se escolhe. A lista vem sobretudo dos nomes registados em Portugal que
 * ela mandou (`docs/nomes-registados-por-genero.txt`).
 *
 * Em inglês não há género na saudação: «Dear Diana,».
 */

const separar = (s: string) => new Set(s.trim().split(/\s+/));
const FEMININOS = separar(NOMES_FEMININOS);
const MASCULINOS = separar(NOMES_MASCULINOS);

/** Sem acentos e em minúsculas — é assim que a lista está escrita. */
function chave(nome: string): string {
  return nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * O género que o primeiro nome tem SEM AMBIGUIDADE em Portugal, ou `null`.
 * Só olha para a primeira palavra: «Maria João» é tratada por «Maria».
 */
export function generoDoNome(nome: string): "f" | "m" | null {
  const primeiro = chave(nome.trim().split(/\s+/)[0] ?? "");
  if (!primeiro) return null;
  if (FEMININOS.has(primeiro)) return "f";
  if (MASCULINOS.has(primeiro)) return "m";
  return null;
}

/** A primeira linha da carta, já com a vírgula. Sem nome, «Olá,» / «Hello,». */
export function saudacaoDaCarta(nome: string, locale: "pt" | "en"): string {
  const n = nome.trim();
  if (locale === "en") return n ? `Dear ${n},` : "Hello,";
  if (!n) return "Olá,";
  const genero = generoDoNome(n);
  if (genero === "f") return `Estimada ${n},`;
  if (genero === "m") return `Estimado ${n},`;
  return `Olá ${n},`;
}
