#!/usr/bin/env node
/**
 * Gera `src/lib/nomes-genero.ts` — os primeiros nomes que, em Portugal, são
 * SÓ de mulher ou SÓ de homem. É o que deixa o email «Pedido de proposta»
 * começar por «Estimada Diana,» ou «Estimado João,»; um nome que não esteja
 * aqui recebe «Olá …,», que não arrisca nada.
 *
 * ── DE ONDE VEM ─────────────────────────────────────────────────────────────
 * Duas fontes, juntas como está explicado mais abaixo:
 *   · a lista de nomes registados em Portugal que ela mandou, guardada tal
 *     como chegou em `docs/nomes-registados-por-genero.txt` — a principal;
 *   · o dicionário de nomes do `gender.c`, de Jörg Michael (o `nam_dict.txt`),
 *     tal como vem no pacote `gender-guesser` 0.4.0 do PyPI — cada linha tem o
 *     nome, o género («M», «F», «1M», «1F», «?M», «?F», «?») e uma frequência
 *     por país. Serve para desempatar e para apanhar contradições.
 *
 *   curl -O https://files.pythonhosted.org/packages/a8/dc/69939b7af56b7adf3aa2736771b7c3e7191f7cd36fbc80b0727570c275fa/gender-guesser-0.4.0.tar.gz
 *   tar -xzf gender-guesser-0.4.0.tar.gz
 *   node scripts/gen-nomes-genero.mjs gender-guesser-0.4.0/gender_guesser/data/nam_dict.txt
 *
 * ── O CRITÉRIO DO DICIONÁRIO, QUE É ESTRITO DE PROPÓSITO ───────────────────
 * Errar o género na primeira palavra de uma carta é pior do que não o dizer.
 * Pelo dicionário, um nome só tem género se:
 *   · tem frequência na coluna de PORTUGAL;
 *   · em Portugal, é de um género só («M»/«1M», ou «F»/«1F») — os unissexo e
 *     os «quase sempre» («?», «?M», «?F») ficam de fora;
 *   · e em mais nenhum país é, sem dúvida, do outro género (é o que tira
 *     «Andrea», que em Itália é nome de homem).
 * Compara-se sem acentos e em minúsculas: «Inês», «Ines» e «INÊS» são o mesmo.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const origem = process.argv[2];
const registados = process.argv[3] ?? "docs/nomes-registados-por-genero.txt";
if (!origem) {
  console.error(
    "uso: node scripts/gen-nomes-genero.mjs <caminho para nam_dict.txt> [docs/nomes-registados-por-genero.txt]",
  );
  process.exit(1);
}

// A coluna 30 é a Grã-Bretanha; Portugal é o sexto país.
const COLUNA_PT = 30 + 5;
const MASC = new Set(["M", "1M"]);
const FEM = new Set(["F", "1F"]);

const chave = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const emPortugal = new Map();
const laFora = new Map();
/** Todas as etiquetas do nome, em qualquer país — para apanhar contradições. */
const emTodoOLado = new Map();
const juntar = (mapa, k, tag) => {
  if (!mapa.has(k)) mapa.set(k, new Set());
  mapa.get(k).add(tag);
};

for (const crua of readFileSync(origem, "utf8").split(/\r?\n/)) {
  if (!crua || crua[0] === "#" || crua[0] === "=") continue;
  const [tag, nome] = crua.split(/\s+/);
  // Nomes compostos («Jun+Wei»): o email só usa o primeiro nome.
  if (!nome || nome.includes("+")) continue;
  const k = chave(nome);
  const valores = crua.slice(30);
  const temPt = (crua[COLUNA_PT] ?? " ").trim() !== "" && crua[COLUNA_PT] !== "$";
  const outros = (valores.slice(0, 5) + valores.slice(6)).replace("$", "").trim();
  if (temPt) juntar(emPortugal, k, tag);
  if (outros) juntar(laFora, k, tag);
  juntar(emTodoOLado, k, tag);
}

/**
 * Correcções às fontes, revistas à mão. Não se inverte nada: saem, e quem os
 * tiver recebe «Olá …,».
 *   · o dicionário marca «Alfeu» e «Altair» como nomes de mulher;
 *   · a lista de registos traz «Harshit» e «Zayed» (nomes de homem) do lado
 *     feminino;
 *   · e há os que servem aos dois e que nenhuma das fontes apanha como tal:
 *     Kendall, Skylar, Lou, Noor/Nour/Nur/Nor, Or, Nicola (de homem em Itália,
 *     de mulher em Inglaterra) e Alex (Alexandre ou Alexandra).
 */
const EXCLUIR = new Set([
  "alfeu",
  "altair",
  "harshit",
  "zayed",
  "kendall",
  "skylar",
  "lou",
  "noor",
  "nour",
  "nur",
  "nor",
  "or",
  "nicola",
  "alex",
]);

const so = (tags, conjunto) => [...tags].every((t) => conjunto.has(t));
const algum = (tags, conjunto) => [...(tags ?? [])].some((t) => conjunto.has(t));

/** O que o dicionário diz, pelo critério estrito de Portugal: "f", "m" ou null. */
function peloDicionario(k) {
  const tags = emPortugal.get(k);
  if (!tags) return null;
  const resto = laFora.get(k);
  if (so(tags, FEM) && !algum(resto, MASC)) return "f";
  if (so(tags, MASC) && !algum(resto, FEM)) return "m";
  return null;
}

/**
 * ── A LISTA QUE ELA MANDOU ──────────────────────────────────────────────────
 * `docs/nomes-registados-por-genero.txt`: nomes registados em Portugal, num
 * bloco «=== FEMININOS (n) ===» e noutro «=== MASCULINOS (n) ===». É a fonte
 * principal — mas é uma lista de REGISTOS, e por isso traz nomes que
 * aparecem dos dois lados (Carlos, José, Luís, Raul também estão na feminina:
 * são segundos nomes de mulheres) e um ou outro caso isolado (Gavin, na
 * feminina). Juntam-se as duas fontes assim:
 *   · só numa das listas dela → esse género, A NÃO SER que o dicionário diga
 *     que o nome é, sem dúvida, do outro (é o que tira o Gavin);
 *   · nas duas listas dela → decide o dicionário, pelo critério de Portugal
 *     (Carlos → homem; Ariel, Noa, Sasha → nenhum);
 *   · em nenhuma → decide o dicionário.
 */
const doRegisto = new Map();
let bloco = null;
for (const linha of readFileSync(registados, "utf8").split(/\r?\n/)) {
  const cabecalho = /^=== (FEMININOS|MASCULINOS)/.exec(linha);
  if (cabecalho) {
    bloco = cabecalho[1] === "FEMININOS" ? "f" : "m";
    continue;
  }
  const nome = linha.trim();
  if (!nome || !bloco) continue;
  // Nomes compostos com hífen («Ana-Jane»): o email só usa o primeiro nome.
  if (nome.includes("-")) continue;
  const k = chave(nome);
  if (!doRegisto.has(k)) doRegisto.set(k, new Set());
  doRegisto.get(k).add(bloco);
}

/** O dicionário diz que o nome é SÓ do género `g`, em qualquer país? */
function soDoGenero(k, g) {
  const tags = emTodoOLado.get(k);
  if (!tags) return false;
  const deste = g === "f" ? FEM : MASC;
  const doOutro = g === "f" ? MASC : FEM;
  return algum(tags, deste) && !algum(tags, doOutro);
}

const femininos = [];
const masculinos = [];
const todas = new Set([...emPortugal.keys(), ...doRegisto.keys()]);
for (const k of [...todas].sort((a, b) => a.localeCompare(b))) {
  if (EXCLUIR.has(k)) continue;
  const reg = doRegisto.get(k);
  let g = null;
  if (reg && reg.size === 1) {
    const [unico] = reg;
    const contra = unico === "f" ? "m" : "f";
    g = peloDicionario(k) === contra || soDoGenero(k, contra) ? null : unico;
  } else {
    g = peloDicionario(k);
  }
  if (g === "f") femininos.push(k);
  else if (g === "m") masculinos.push(k);
}

/** Uma lista longa, em linhas de ~96 caracteres, como cadeia separada por espaços. */
function emLinhas(nomes) {
  const linhas = [];
  let atual = "";
  for (const n of nomes) {
    if (atual && atual.length + n.length + 1 > 96) {
      linhas.push(atual);
      atual = "";
    }
    atual += (atual ? " " : "") + n;
  }
  if (atual) linhas.push(atual);
  return linhas
    .map((l, i) => `  ${JSON.stringify(l + (i < linhas.length - 1 ? " " : ""))}`)
    .join(" +\n");
}

const ts = `/**
 * GERADO por \`scripts/gen-nomes-genero.mjs\` — não editar à mão.
 *
 * Primeiros nomes que, em Portugal, são só de mulher ou só de homem. Sem
 * acentos e em minúsculas. As origens (a lista de nomes registados que ela
 * mandou, em \`docs/nomes-registados-por-genero.txt\`, e o dicionário do
 * \`gender.c\`, de Jörg Michael) e o critério estão no gerador.
 *
 * ${femininos.length} femininos, ${masculinos.length} masculinos.
 */

export const NOMES_FEMININOS: string =
${emLinhas(femininos)};

export const NOMES_MASCULINOS: string =
${emLinhas(masculinos)};
`;

const destino = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "nomes-genero.ts",
);
writeFileSync(destino, ts);
console.log(`${femininos.length} femininos, ${masculinos.length} masculinos → ${destino}`);
