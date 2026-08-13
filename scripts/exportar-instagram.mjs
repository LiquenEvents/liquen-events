#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PASTA QUE VAI PARA O INSTAGRAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Eu queria colocar tudo numa pasta das que vou colocar no insta."
 *
 * As peças já existiam em meta-ads/criativos/, mas com nomes escritos para o
 * gerador — `alentejo-b-916.jpg` — e sem o texto que acompanha cada uma. Uma
 * pasta de imagens soltas não chega para publicar: falta a legenda, falta o
 * link, e falta saber qual é o par A/B de cada peça.
 *
 *     node scripts/exportar-instagram.mjs
 *
 * Escreve `instagram-export/` com:
 *
 *     stories/     as peças 1080x1920, numeradas
 *     feed/        as peças 1080x1350, numeradas
 *     conferir/    as duas versões com as zonas tapadas a vermelho
 *     LEIA-ME.html abre-se num duplo clique: cada peça com a legenda e o link
 *     legendas.txt as legendas em texto, para copiar do telemóvel
 *
 * As legendas e os links NÃO são escritos aqui: saem de meta-ads/criativos.md
 * e do catálogo de variantes. Duplicá-los era garantir que um dia ficavam
 * diferentes do que está publicado.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PECAS = path.join(RAIZ, "meta-ads", "criativos");
const SAIDA = path.join(RAIZ, "instagram-export");
const SITIO = "https://liquen-events.com";

/** Nome bonito de cada zona, para os títulos da folha. */
const ZONAS = {
  comporta: "Comporta",
  alentejo: "Alentejo",
  lisboa: "Lisboa, Cascais e Sintra",
  algarve: "Algarve",
  portugal: "Portugal (público internacional, em inglês)",
};

/**
 * Os conceitos, lidos de meta-ads/criativos.md.
 *
 * A estrutura do documento é regular — cada conceito é um `## Cxx — "título"`
 * seguido de linhas `- **Campo:** valor` — e é isso que se aproveita. Ler o
 * documento em vez de repetir os textos aqui significa que corrigir uma
 * legenda é corrigi-la num sítio só.
 */
function lerConceitos() {
  const md = readFileSync(path.join(RAIZ, "meta-ads", "criativos.md"), "utf8");
  const blocos = md.split(/^## (C\d\d) — /m).slice(1);
  const conceitos = [];
  for (let i = 0; i < blocos.length; i += 2) {
    const id = blocos[i];
    const corpo = blocos[i + 1];
    // `(?:\s*\(EN\))?` porque o conceito internacional escreve
    // "**Texto (EN):**" — a página dele só é servida em inglês. Sem isto o
    // campo saía vazio e a peça ia para a pasta sem legenda nenhuma, que é
    // precisamente o género de buraco que ninguém repara até estar a publicar.
    const campo = (nome) =>
      new RegExp(
        `\\*\\*${nome}(?:\\s*\\(EN\\))?:\\*\\*\\s*([^\\n]+(?:\\n(?!\\s*[-*]|\\s*\\n)[^\\n]+)*)`,
      )
        .exec(corpo)?.[1]
        ?.trim()
        .replace(/\s*\n\s*/g, " ") ?? "";
    const pagina = /\*\*Página:\*\*\s*`([^`]+)`/.exec(corpo)?.[1] ?? "";
    conceitos.push({
      id,
      precisaFilmar:
        /^\s*"[^"]*"\s*\[filmar\]/.test(corpo) || corpo.slice(0, 120).includes("[filmar]"),
      pagina,
      texto: campo("Texto"),
      titulo: campo("Título"),
      cta: campo("CTA"),
    });
  }
  if (conceitos.length < 5) {
    throw new Error(
      `Só li ${conceitos.length} conceitos em criativos.md. O documento mudou de forma — ` +
        "confirmar antes de exportar, senão as legendas saem vazias.",
    );
  }
  return conceitos;
}

/** A campanha de cada conceito, da tabela "Mapa rápido" do mesmo documento. */
function lerCampanhas() {
  const md = readFileSync(path.join(RAIZ, "meta-ads", "criativos.md"), "utf8");
  const mapa = {};
  for (const m of md.matchAll(
    /^\|\s*(C\d\d)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm,
  )) {
    mapa[m[1]] = { formato: m[2].trim(), pagina: m[3], campanha: m[4] };
  }
  return mapa;
}

/** As variantes e os seus dois ganchos, do catálogo. */
function lerVariantes() {
  const src = readFileSync(path.join(RAIZ, "src/lib/meta/variantes.ts"), "utf8");
  const blocos = src.split(/^\s{4}slug:\s*"/m).slice(1);
  const out = [];
  for (const bloco of blocos) {
    const slug = /^([a-z0-9-]+)"/.exec(bloco)?.[1];
    if (!slug) continue;
    const soEm = /^\s{4}soEm:\s*"(pt|en)"/m.exec(bloco)?.[1];
    const idioma = soEm === "en" ? "en" : "pt";
    const inicio = bloco.indexOf(`    ${idioma}: {`);
    const parte = bloco.slice(inicio, inicio + 2600);
    const titulos = [...parte.matchAll(/titulo:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    if (titulos.length < 2) continue;
    out.push({ slug, idioma, ganchos: { a: titulos[0], b: titulos[1] } });
  }
  return out;
}

/**
 * O link do anúncio, com as etiquetas de origem.
 *
 * Sem estas etiquetas, o relatório da Meta diz quantas pessoas clicaram mas
 * não diz qual das peças as trouxe — e sem isso não se pode desligar a que
 * não rende, que é a única forma de 50 €/mês chegarem para alguma coisa.
 * A convenção está em UTM-PLAN.md e é ela que manda.
 */
function linkDoAnuncio({ idioma, slug, gancho, formato, conceito, campanha }) {
  const prefixo = idioma === "en" ? "/en" : "";
  const caminho = `${prefixo}/s/${slug}${gancho === "b" ? "-b" : ""}`;
  const conteudo = `${conceito.toLowerCase()}-${formato}-${gancho}`;
  return (
    `${SITIO}${caminho}?utm_source=ig&utm_medium=paid_social` +
    `&utm_campaign=${campanha}&utm_content=${conteudo}`
  );
}

function main() {
  const conceitos = lerConceitos();
  const campanhas = lerCampanhas();
  const variantes = lerVariantes();

  for (const p of ["stories", "feed", "conferir"]) {
    mkdirSync(path.join(SAIDA, p), { recursive: true });
  }

  const FORMATOS = [
    { id: "916", pasta: "stories", rotulo: "Stories e Reels", medida: "1080 × 1920" },
    { id: "45", pasta: "feed", rotulo: "Feed", medida: "1080 × 1350" },
  ];

  const linhas = [];
  let n = 0;

  for (const v of variantes) {
    // O conceito desta zona: o primeiro que aponta para a página dela e que
    // não precisa de filmagem. Os que precisam ficam de fora — não há peça
    // para eles, e pô-los aqui seria prometer um ficheiro que não existe.
    const paginaBase = `${v.idioma === "en" ? "/en" : ""}/s/${v.slug}`;
    const conceito =
      conceitos.find((c) => c.pagina === paginaBase && !c.precisaFilmar) ??
      conceitos.find((c) => c.pagina === paginaBase);
    if (!conceito) continue;
    const campanha = campanhas[conceito.id]?.campanha ?? "frio-noivos-nacional";

    for (const gancho of ["a", "b"]) {
      for (const f of FORMATOS) {
        const origem = path.join(PECAS, `${v.slug}-${gancho}-${f.id}.jpg`);
        if (!existsSync(origem)) continue;
        n += 1;
        const nome = `${String(n).padStart(2, "0")}-${v.slug}-${gancho.toUpperCase()}.jpg`;
        copyFileSync(origem, path.join(SAIDA, f.pasta, nome));
        linhas.push({
          nome,
          pasta: f.pasta,
          zona: ZONAS[v.slug] ?? v.slug,
          idioma: v.idioma,
          gancho: gancho.toUpperCase(),
          fraseNaImagem: v.ganchos[gancho],
          formato: f.rotulo,
          medida: f.medida,
          legenda: conceito.texto,
          cta: conceito.cta,
          link: linkDoAnuncio({
            idioma: v.idioma,
            slug: v.slug,
            gancho,
            formato: f.id,
            conceito: conceito.id,
            campanha,
          }),
        });
      }
    }
  }

  // As versões com as zonas tapadas desenhadas por cima. Vão numa pasta à
  // parte e com o nome a dizer o que são, porque publicar uma delas por
  // engano seria publicar um anúncio com riscas vermelhas.
  for (const g of ["comporta-a-916-guia.jpg", "comporta-a-45-guia.jpg"]) {
    const origem = path.join(PECAS, g);
    if (existsSync(origem)) {
      copyFileSync(origem, path.join(SAIDA, "conferir", `NAO-PUBLICAR-${g}`));
    }
  }

  // Uma peça sem legenda ou sem botão é uma peça que ela não pode publicar, e
  // o modo de falhar seria silencioso: o ficheiro está lá, a folha desenha-se,
  // e o buraco só aparece à frente do telemóvel na hora de publicar.
  const incompletas = linhas.filter((l) => !l.legenda || !l.cta);
  if (incompletas.length) {
    throw new Error(
      "Peças sem legenda ou sem botão:\n" +
        incompletas.map((l) => `  ${l.pasta}/${l.nome} (${l.zona})`).join("\n") +
        "\nO conceito correspondente em meta-ads/criativos.md não tem os campos " +
        "**Texto:** e **CTA:**, ou mudou de forma.",
    );
  }

  writeFileSync(path.join(SAIDA, "LEIA-ME.html"), folha(linhas));
  writeFileSync(path.join(SAIDA, "legendas.txt"), legendas(linhas));
  console.log(`${linhas.length} peças em ${SAIDA}`);
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/**
 * As legendas em texto simples, uma entrada por PEÇA e não por zona.
 *
 * Por peça porque o link muda entre a versão A e a B — apontam para páginas
 * diferentes, que é o que faz o teste A/B existir. Uma lista por zona
 * convidava a usar o mesmo link nas duas e a deitar fora a comparação toda.
 */
function legendas(linhas) {
  const out = [
    "LEGENDAS DAS PEÇAS — Líquen Events",
    "",
    "Uma entrada por peça. O link da versão A e o da B são DIFERENTES de",
    "propósito: apontam para páginas diferentes, e é dessa diferença que se",
    "descobre qual das duas frases convence mais.",
    "",
  ];
  for (const l of linhas) {
    out.push(
      `── ${l.pasta}/${l.nome} · ${l.zona} · versão ${l.gancho} ──`,
      "",
      `Na imagem: ${l.fraseNaImagem}`,
      "",
      l.legenda,
      "",
      `Botão: ${l.cta}`,
      `Link: ${l.link}`,
      "",
      "",
    );
  }
  return out.join("\n");
}

function folha(linhas) {
  const cartao = (l) => `
    <article>
      <img src="${l.pasta}/${esc(l.nome)}" alt="${esc(l.zona)} — versão ${l.gancho}">
      <div>
        <h3>${esc(l.zona)} <span class="etq">versão ${l.gancho}</span>${l.idioma === "en" ? ' <span class="etq">inglês</span>' : ""}</h3>
        <p class="meta">${esc(l.formato)} · ${esc(l.medida)} · <code>${esc(l.pasta)}/${esc(l.nome)}</code></p>
        <p class="frase">Na imagem: ${esc(l.fraseNaImagem)}</p>
        <p class="rotulo">Legenda</p>
        <p class="legenda">${esc(l.legenda)}</p>
        <p class="rotulo">Botão</p>
        <p>${esc(l.cta)}</p>
        <p class="rotulo">Link do anúncio</p>
        <p class="link">${esc(l.link)}</p>
      </div>
    </article>`;

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peças para Instagram e Facebook — Líquen Events</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 62rem; padding: 3rem 1.5rem 6rem; color: #23261f; }
  h1 { font-size: 1.7rem; letter-spacing: -0.01em; margin-bottom: 0.4rem; }
  h2 { font-size: 1.05rem; margin-top: 3rem; border-top: 1px solid #e3e1d9; padding-top: 1.6rem; }
  .intro { line-height: 1.65; color: #4a4f43; max-width: 42rem; }
  article { display: grid; grid-template-columns: 200px 1fr; gap: 1.6rem; align-items: start;
            border-top: 1px solid #eceae2; padding: 1.6rem 0; }
  article img { width: 100%; height: auto; border-radius: 6px; background: #f3f2ec; }
  h3 { font-size: 1rem; margin: 0 0 0.3rem; }
  .etq { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
         background: #eef1ea; color: #4c6150; padding: 0.15rem 0.45rem; border-radius: 3px; vertical-align: middle; }
  .meta { color: #8b8f80; font-size: 0.82rem; margin: 0 0 0.7rem; }
  .frase { font-size: 0.9rem; color: #4a4f43; margin: 0 0 1rem; }
  .rotulo { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.12em;
            color: #6b7a63; font-weight: 600; margin: 0.9rem 0 0.25rem; }
  .legenda { background: #f7f6f1; border: 1px solid #eceae2; border-radius: 6px;
             padding: 0.7rem 0.85rem; line-height: 1.6; margin: 0; }
  .link { font-family: ui-monospace, monospace; font-size: 0.74rem; word-break: break-all;
          color: #4c6150; margin: 0; }
  code { background: #f3f2ec; padding: 0.05rem 0.3rem; font-size: 0.85em; }
  @media (max-width: 640px) { article { grid-template-columns: 1fr; } article img { max-width: 240px; } }
</style>
</head>
<body>
  <h1>Peças para Instagram e Facebook</h1>
  <p class="intro">Cada peça com a legenda, o botão e o link a usar. As peças de
    <strong>stories</strong> são 1080 × 1920 e servem para Stories e Reels; as de
    <strong>feed</strong> são 1080 × 1350 e servem para publicações. As duas
    versões de cada zona, A e B, têm frases diferentes de propósito: publicam-se
    as duas e ao fim de umas semanas vê-se qual traz mais pedidos.</p>
  <p class="intro"><strong>O link importa.</strong> É ele que diz de que peça veio
    cada pedido de orçamento. Copiado tal e qual, sem cortar nada a partir do
    <code>?</code>.</p>
  <p class="intro">A pasta <code>conferir/</code> tem duas imagens com riscas
    vermelhas por cima — mostram as zonas que a app do Instagram tapa. São para
    ver, <strong>não para publicar</strong>.</p>

  <h2>Stories e Reels — 1080 × 1920</h2>
  ${linhas
    .filter((l) => l.pasta === "stories")
    .map(cartao)
    .join("\n")}

  <h2>Feed — 1080 × 1350</h2>
  ${linhas
    .filter((l) => l.pasta === "feed")
    .map(cartao)
    .join("\n")}
</body>
</html>
`;
}

main();
