/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LÊ OS EXPORTS DO GOOGLE ADS E DIZ, EM PORTUGUÊS, O QUE MUDAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/ads-semanal.mjs [pasta]        (por omissão: ./ads-data)
 *
 * Não faz relatórios bonitos. Faz uma lista de acções, cada uma com o número
 * que a justifica, porque é isso que serve numa segunda-feira de manhã.
 *
 * ── O QUE ESTE SCRIPT SE RECUSA A FAZER ────────────────────────────────────
 * Recusa-se a recomendar seja o que for com dados a menos. Uma keyword com três
 * cliques e zero conversões NÃO é uma keyword má: é uma keyword sobre a qual
 * não se sabe nada, e pausá-la é deitar fora tráfego às cegas. Com o orçamento
 * desta conta (~83 cliques/mês) isso acontece a toda a hora, por isso os
 * limiares são explícitos e estão à vista no topo do ficheiro.
 *
 * É a mesma disciplina do resto deste trabalho: abaixo do limiar a resposta é
 * "ainda não sei", nunca "não funciona".
 *
 * ── OS FICHEIROS QUE LÊ ────────────────────────────────────────────────────
 * Exporta do Google Ads → Relatórios → Descarregar → CSV, e guarda em
 * ./ads-data/ com estes nomes (os que faltarem são simplesmente saltados):
 *
 *   termos-de-pesquisa.csv · keywords.csv · campanhas.csv · anuncios.csv
 *
 * Os cabeçalhos da Google mudam com o idioma da conta e com a versão. O leitor
 * aqui aceita as variantes PT e EN mais comuns e, se não reconhecer uma coluna
 * de que precisa, DIZ QUAL É em vez de continuar com zeros — um relatório que
 * lê custo como 0 daria "tudo óptimo, nada a fazer".
 */

import { promises as fs } from "node:fs";
import path from "node:path";

// ── LIMIARES ───────────────────────────────────────────────────────────────
/** Abaixo disto não se conclui nada sobre uma keyword. */
const CLIQUES_PARA_JULGAR = 15;
/** Custo acumulado que, sozinho, justifica olhar para uma keyword. */
const CUSTO_PARA_JULGAR = 12;
/** CTR abaixo do qual o anúncio (ou a correspondência) está a falhar. */
const CTR_FRACO = 0.02;
/** Custo por lead acima do qual se acende o alarme. */
const CPL_ALARME = 60;

const PASTA = process.argv[2] || "ads-data";

// ── LEITURA DE CSV ─────────────────────────────────────────────────────────

/** Divide uma linha de CSV respeitando aspas. */
function dividir(linha) {
  const campos = [];
  let actual = "";
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentro && linha[i + 1] === '"') {
        actual += '"';
        i++;
      } else dentro = !dentro;
    } else if (c === "," && !dentro) {
      campos.push(actual);
      actual = "";
    } else actual += c;
  }
  campos.push(actual);
  return campos;
}

/**
 * Lê um CSV do Google Ads. Os exports trazem linhas de preâmbulo antes do
 * cabeçalho (nome do relatório, intervalo de datas), por isso procura-se a
 * primeira linha que pareça um cabeçalho a sério.
 */
async function lerCsv(ficheiro) {
  let texto;
  try {
    texto = await fs.readFile(ficheiro, "utf8");
  } catch {
    return null;
  }
  const linhas = texto
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  const iCab = linhas.findIndex((l) => dividir(l).length >= 3);
  if (iCab === -1) return null;
  const cab = dividir(linhas[iCab]).map((c) => c.trim());
  const linhasDados = [];
  for (const l of linhas.slice(iCab + 1)) {
    const campos = dividir(l);
    if (campos.length !== cab.length) continue; // linhas soltas
    // AS LINHAS DE TOTAL DO RODAPÉ. Têm o MESMO número de colunas que os dados,
    // portanto o filtro acima não as apanha, e somá-las duplica tudo: no teste
    // com dados falsos o gasto do período saiu 38 € quando era 19 €. Um
    // relatório que duplica o custo faz o custo por lead parecer o dobro do que
    // é, e leva a cortar uma campanha que estava a funcionar.
    const primeira = campos[0].trim().toLowerCase();
    if (primeira === "total" || primeira.startsWith("total ") || primeira.startsWith("total:")) {
      continue;
    }
    const obj = {};
    cab.forEach((c, i) => (obj[c] = campos[i].trim()));
    linhasDados.push(obj);
  }
  return { cab, linhas: linhasDados };
}

/** Nomes que a Google usa para a mesma coluna, em PT e EN. */
const ALIASES = {
  termo: ["Termo de pesquisa", "Search term", "Search keyword"],
  keyword: ["Palavra-chave", "Keyword", "Palavra-chave de pesquisa"],
  campanha: ["Campanha", "Campaign"],
  grupo: ["Grupo de anúncios", "Ad group"],
  impressoes: ["Impr.", "Impressões", "Impressions"],
  cliques: ["Cliques", "Clicks"],
  custo: ["Custo", "Cost"],
  conversoes: ["Conversões", "Conversions"],
  valor: ["Valor de conv.", "Valor da conversão", "Conv. value", "Conversion value"],
};

/** Descobre o nome real de uma coluna neste ficheiro. */
function coluna(cab, chave) {
  for (const nome of ALIASES[chave]) {
    const achado = cab.find((c) => c.toLowerCase() === nome.toLowerCase());
    if (achado) return achado;
  }
  return null;
}

/** "1.234,56 €" ou "1,234.56" → número. Devolve NaN se não parecer um número. */
function numero(valor) {
  if (valor == null) return NaN;
  let s = String(valor).replace(/[^\d,.\-]/g, "");
  if (s === "" || s === "-") return NaN;
  // Se houver vírgula E ponto, o último dos dois é o separador decimal.
  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    if (ultimaVirgula > ultimoPonto) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (ultimaVirgula > -1) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// ── ANÁLISES ───────────────────────────────────────────────────────────────

const accoes = [];
const avisos = [];
const notas = [];

function exigirColunas(nomeFicheiro, cab, chaves) {
  const faltam = chaves.filter((k) => !coluna(cab, k));
  if (faltam.length) {
    avisos.push(
      `${nomeFicheiro}: não reconheci as colunas ${faltam.join(", ")}. ` +
        `Cabeçalhos encontrados: ${cab.join(" | ")}. Saltei este ficheiro em vez de ` +
        "continuar com zeros, que daria um relatório a dizer que está tudo bem.",
    );
    return false;
  }
  return true;
}

async function analisarTermos() {
  const d = await lerCsv(path.join(PASTA, "termos-de-pesquisa.csv"));
  if (!d) return notas.push("termos-de-pesquisa.csv: não encontrado.");
  if (!exigirColunas("termos-de-pesquisa.csv", d.cab, ["termo", "cliques", "custo"])) return;

  const cTermo = coluna(d.cab, "termo");
  const cCliques = coluna(d.cab, "cliques");
  const cCusto = coluna(d.cab, "custo");
  const cConv = coluna(d.cab, "conversoes");

  // Termos que gastaram e não converteram. É a lista de candidatos a negativa.
  const candidatos = d.linhas
    .map((l) => ({
      termo: l[cTermo],
      cliques: numero(l[cCliques]) || 0,
      custo: numero(l[cCusto]) || 0,
      conv: cConv ? numero(l[cConv]) || 0 : 0,
    }))
    .filter((t) => t.conv === 0 && (t.cliques >= 3 || t.custo >= 3))
    .sort((a, b) => b.custo - a.custo);

  const gastoTotal = d.linhas.reduce((s, l) => s + (numero(l[cCusto]) || 0), 0);
  notas.push(
    `termos de pesquisa: ${d.linhas.length} termos, ${gastoTotal.toFixed(2)} € no período.`,
  );

  if (candidatos.length === 0) {
    notas.push("  nenhum termo com gasto e zero conversões. Bom sinal.");
    return;
  }
  accoes.push(
    `ACRESCENTAR NEGATIVAS — ${candidatos.length} termos gastaram sem converter ` +
      `(${candidatos.reduce((s, t) => s + t.custo, 0).toFixed(2)} € ao todo). ` +
      "Lê a lista e marca os que não são o teu serviço:",
  );
  for (const t of candidatos.slice(0, 25)) {
    accoes.push(`    "${t.termo}"  ${t.cliques} cliques, ${t.custo.toFixed(2)} €`);
  }
  if (candidatos.length > 25) {
    accoes.push(`    (e mais ${candidatos.length - 25} — vê o ficheiro)`);
  }
}

async function analisarKeywords() {
  const d = await lerCsv(path.join(PASTA, "keywords.csv"));
  if (!d) return notas.push("keywords.csv: não encontrado.");
  if (!exigirColunas("keywords.csv", d.cab, ["keyword", "cliques", "custo"])) return;

  const cKw = coluna(d.cab, "keyword");
  const cCliques = coluna(d.cab, "cliques");
  const cCusto = coluna(d.cab, "custo");
  const cConv = coluna(d.cab, "conversoes");
  const cImpr = coluna(d.cab, "impressoes");

  const kws = d.linhas.map((l) => ({
    kw: l[cKw],
    cliques: numero(l[cCliques]) || 0,
    custo: numero(l[cCusto]) || 0,
    conv: cConv ? numero(l[cConv]) || 0 : 0,
    impr: cImpr ? numero(l[cImpr]) || 0 : 0,
  }));

  // 1. Pausar: dados suficientes E nada a mostrar.
  const pausar = kws
    .filter(
      (k) => k.conv === 0 && (k.cliques >= CLIQUES_PARA_JULGAR || k.custo >= CUSTO_PARA_JULGAR),
    )
    .sort((a, b) => b.custo - a.custo);
  if (pausar.length) {
    accoes.push(
      `PAUSAR KEYWORDS — ${pausar.length} com pelo menos ${CLIQUES_PARA_JULGAR} cliques ` +
        `ou ${CUSTO_PARA_JULGAR} € e zero conversões:`,
    );
    for (const k of pausar) {
      accoes.push(`    "${k.kw}"  ${k.cliques} cliques, ${k.custo.toFixed(2)} €, 0 conversões`);
    }
  }

  // 2. Ainda não sei. É a categoria que quase todas as ferramentas escondem, e
  //    com este orçamento é a maior de todas.
  const cedo = kws.filter(
    (k) =>
      k.conv === 0 &&
      k.cliques > 0 &&
      k.cliques < CLIQUES_PARA_JULGAR &&
      k.custo < CUSTO_PARA_JULGAR,
  );
  if (cedo.length) {
    notas.push(
      `${cedo.length} keywords com cliques mas ainda sem dados que cheguem ` +
        `(< ${CLIQUES_PARA_JULGAR} cliques). NÃO são keywords más — são keywords sobre as ` +
        "quais ainda não se sabe nada. Deixa-as correr.",
    );
  }

  // 3. CTR fraco: o anúncio não está a responder à pesquisa.
  if (cImpr) {
    const fracas = kws
      .filter((k) => k.impr >= 200 && k.cliques / k.impr < CTR_FRACO)
      .sort((a, b) => b.impr - a.impr);
    if (fracas.length) {
      accoes.push(
        `REESCREVER ANÚNCIO ou APERTAR CORRESPONDÊNCIA — ${fracas.length} keywords com ` +
          `mais de 200 impressões e CTR abaixo de ${(CTR_FRACO * 100).toFixed(0)}%. ` +
          "Ou o anúncio não fala do que a pessoa pesquisou, ou a correspondência é larga de mais:",
      );
      for (const k of fracas.slice(0, 10)) {
        accoes.push(
          `    "${k.kw}"  ${k.impr} impressões, ${k.cliques} cliques ` +
            `(${((k.cliques / k.impr) * 100).toFixed(1)}%)`,
        );
      }
    }
  }

  // 4. As que funcionam.
  const boas = kws.filter((k) => k.conv > 0).sort((a, b) => b.conv - a.conv);
  if (boas.length) {
    notas.push(`${boas.length} keywords COM conversões — não lhes toques:`);
    for (const k of boas.slice(0, 10)) {
      const cpl = k.conv > 0 ? k.custo / k.conv : 0;
      notas.push(`    "${k.kw}"  ${k.conv} conv., ${cpl.toFixed(2)} €/lead`);
    }
  }
}

async function analisarCampanhas() {
  const d = await lerCsv(path.join(PASTA, "campanhas.csv"));
  if (!d) return notas.push("campanhas.csv: não encontrado.");
  if (!exigirColunas("campanhas.csv", d.cab, ["campanha", "custo"])) return;

  const cNome = coluna(d.cab, "campanha");
  const cCusto = coluna(d.cab, "custo");
  const cConv = coluna(d.cab, "conversoes");
  const cValor = coluna(d.cab, "valor");
  const cCliques = coluna(d.cab, "cliques");

  const camps = d.linhas.map((l) => ({
    nome: l[cNome],
    custo: numero(l[cCusto]) || 0,
    conv: cConv ? numero(l[cConv]) || 0 : 0,
    valor: cValor ? numero(l[cValor]) || 0 : 0,
    cliques: cCliques ? numero(l[cCliques]) || 0 : 0,
  }));

  notas.push("");
  notas.push("POR CAMPANHA:");
  for (const c of camps.sort((a, b) => b.custo - a.custo)) {
    const cpc = c.cliques ? c.custo / c.cliques : 0;
    const cpl = c.conv ? c.custo / c.conv : 0;
    const roas = c.custo > 0 ? c.valor / c.custo : 0;
    const partes = [`${c.custo.toFixed(2)} €`];
    if (c.cliques) partes.push(`${c.cliques} cliques a ${cpc.toFixed(2)} €`);
    partes.push(c.conv ? `${c.conv} leads a ${cpl.toFixed(2)} €` : "0 leads");
    if (c.valor > 0) partes.push(`ROAS ${roas.toFixed(1)}x`);
    notas.push(`    ${c.nome}: ${partes.join(" · ")}`);

    if (c.conv > 0 && cpl > CPL_ALARME) {
      avisos.push(
        `ALARME — ${c.nome} está a ${cpl.toFixed(2)} € por lead (limite ${CPL_ALARME} €). ` +
          "Aperta as negativas e corta as keywords mais caras antes de subir orçamento.",
      );
    }
    if (c.conv === 0 && c.custo >= 40) {
      avisos.push(
        `ALARME — ${c.nome} gastou ${c.custo.toFixed(2)} € sem um único lead. ` +
          "Confirma que a conversão está a ser registada ANTES de concluir que a campanha não presta: " +
          "uma acção de conversão mal configurada parece exactamente isto.",
      );
    }
  }

  const semValor = camps.some((c) => c.conv > 0) && camps.every((c) => c.valor === 0);
  if (semValor) {
    avisos.push(
      "Há leads mas NENHUM valor de conversão. Ou as conversões offline nunca foram " +
        "carregadas, ou a acção 'Casamento fechado' não está a receber nada. Sem valor não há " +
        "ROAS, e a Google está a optimizar para formulários em vez de casamentos. " +
        "Ver ads-output/medicao.md.",
    );
  }
}

// ── SAÍDA ──────────────────────────────────────────────────────────────────

async function main() {
  try {
    await fs.access(PASTA);
  } catch {
    console.log(`A pasta "${PASTA}" não existe.`);
    console.log("");
    console.log("Exporta do Google Ads (Relatórios → Descarregar → CSV) para lá:");
    console.log("    termos-de-pesquisa.csv   keywords.csv   campanhas.csv   anuncios.csv");
    process.exit(1);
  }

  await analisarTermos();
  await analisarKeywords();
  await analisarCampanhas();

  console.log("═".repeat(76));
  console.log("REVISÃO SEMANAL DO GOOGLE ADS");
  console.log("═".repeat(76));

  if (avisos.length) {
    console.log("");
    console.log("── ALARMES ─────────────────────────────────────────────────────────────");
    for (const a of avisos) console.log(a);
  }

  console.log("");
  console.log("── O QUE FAZER ─────────────────────────────────────────────────────────");
  if (accoes.length === 0) console.log("Nada a mudar esta semana.");
  else for (const a of accoes) console.log(a);

  console.log("");
  console.log("── CONTEXTO ────────────────────────────────────────────────────────────");
  for (const n of notas) console.log(n);

  console.log("");
  console.log("─".repeat(76));
  console.log(
    `Limiares: julga-se uma keyword a partir de ${CLIQUES_PARA_JULGAR} cliques ou ` +
      `${CUSTO_PARA_JULGAR} €. Abaixo disso a resposta é "ainda não sei", nunca "não funciona".`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
