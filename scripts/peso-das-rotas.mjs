#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE CADA ROTA MANDA PARA O TELEMÓVEL DELA — COM TECTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Eu quero mesmo que trabalhes de forma a ficarem ultra rápidas.»
 *
 * ── O BURACO QUE ISTO TAPA ────────────────────────────────────────────────
 *
 * Os orçamentos de desempenho da casa (`lighthouserc.json`) medem seis páginas,
 * todas do sítio público. O back office ganhou o seu tecto no browser
 * (`e2e/peso-do-back-office.spec.ts`). A PÁGINA DA PROPOSTA — a que o casal
 * abre, e a segunda das duas que ela diz serem lentas — nunca teve nenhum.
 *
 * E não podia ter, pela via do browser: para a medir é preciso uma proposta
 * pública gravada, e o servidor de produção RECUSA escritas sem Supabase, de
 * propósito (`assertWritableInProd` — gravar para um ficheiro efémero seria
 * perder dados em silêncio no próximo deploy). Sem escrita não há proposta; um
 * token inválido desenha outra árvore e mediria outra coisa.
 *
 * ── O QUE SE MEDE AQUI, E O QUE NÃO SE MEDE ───────────────────────────────
 *
 * Lê-se o manifesto que o próprio build escreve por rota
 * (`page_client-reference-manifest.js`) e somam-se os pacotes de JavaScript
 * que ele nomeia. Não precisa de servidor, nem de dados, nem de rede — e por
 * isso mede a proposta tão bem como mede o painel.
 *
 * São BYTES CRUS no disco, não bytes na linha. O browser mediu 274 KB
 * comprimidos no back office onde isto conta 429 KB — a diferença é o gzip, e
 * é por isso que os dois tectos são números diferentes e não se comparam um
 * com o outro.
 *
 * E é um tecto POR ROTA: conta os módulos de cliente que a rota nomeia, não
 * tudo o que o browser acaba por descarregar (o painel pede 18 ficheiros de JS
 * e aqui contam-se 9 — os outros são a moldura partilhada). Complementa o
 * passeio do browser; não o substitui. Para a proposta, é o único que há.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * As rotas com tecto, em kilobytes de JavaScript cru.
 *
 * Os números de partida, medidos contra `npm run build` nesta máquina:
 *
 *     proposta        5 pacotes    112 KB
 *     back office     9 pacotes    429 KB
 *
 * Os tectos têm folga sobre eles — o suficiente para uma funcionalidade nova
 * não os pôr vermelhos por dar, e apertado o bastante para uma biblioteca a
 * entrar sem querer não passar despercebida.
 */
const ROTAS = [
  {
    nome: "a proposta que o casal abre",
    dir: ".next/server/app/[lang]/(privado)/proposta/[token]",
    tecto: 160,
  },
  {
    nome: "o painel que ela abre todos os dias",
    dir: ".next/server/app/[lang]/(admin)/orcamento/admin",
    tecto: 520,
  },
];

/** Os pacotes de JS que uma rota nomeia, sem repetidos. */
function pacotesDaRota(dir) {
  const ficheiro = path.join(dir, "page_client-reference-manifest.js");
  if (!existsSync(ficheiro)) return null;
  const cru = readFileSync(ficheiro, "utf8");
  const corte = cru.indexOf("] = ");
  if (corte === -1) return null;
  const dados = JSON.parse(
    cru
      .slice(corte + 4)
      .trim()
      .replace(/;$/, ""),
  );
  const pacotes = new Set();
  for (const modulo of Object.values(dados.clientModules ?? {})) {
    for (const c of modulo.chunks ?? []) {
      if (typeof c === "string" && c.endsWith(".js")) pacotes.add(c);
    }
  }
  return pacotes;
}

function kilobytes(pacotes) {
  let bytes = 0;
  const perdidos = [];
  for (const p of pacotes) {
    const disco = path.join(".next", p.replace(/^\/_next\//, ""));
    if (existsSync(disco)) bytes += readFileSync(disco).byteLength;
    else perdidos.push(p);
  }
  return { kb: Math.round(bytes / 1024), perdidos };
}

let chumbou = false;
console.log("O que cada rota manda, em JavaScript cru:\n");

for (const { nome, dir, tecto } of ROTAS) {
  const pacotes = pacotesDaRota(dir);

  /**
   * Uma rota que desapareceu não é uma rota leve.
   *
   * Sem isto, mudar o caminho de uma pasta fazia este guião passar a verde para
   * sempre sem medir nada — que é a pior forma de uma rede falhar, porque
   * parece que está a funcionar.
   */
  if (!pacotes || pacotes.size === 0) {
    console.error(`  ✗ ${nome}\n      não encontrei pacotes em ${dir}`);
    console.error(
      "      Ou o build não correu, ou a rota mudou de sítio. Corrige o caminho aqui —\n" +
        "      um tecto que não encontra a rota deixa de ser um tecto.",
    );
    chumbou = true;
    continue;
  }

  const { kb, perdidos } = kilobytes(pacotes);
  if (perdidos.length > 0) {
    console.error(`  ✗ ${nome}: ${perdidos.length} pacotes nomeados mas ausentes do disco`);
    chumbou = true;
    continue;
  }

  const folga = tecto - kb;
  const marca = kb <= tecto ? "✓" : "✗";
  console.log(
    `  ${marca} ${nome}\n` +
      `      ${String(kb).padStart(4)} KB em ${pacotes.size} pacotes ` +
      `(tecto ${tecto} KB, folga ${folga} KB)`,
  );
  if (kb > tecto) {
    console.error(
      `      Passou o tecto em ${-folga} KB. Na linha dela, cada 100 KB são cerca de\n` +
        "      meio segundo. Vê o que entrou de novo antes de subir o número.",
    );
    chumbou = true;
  }
}

process.exit(chumbou ? 1 : 0);
