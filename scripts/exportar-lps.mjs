#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS LANDING PAGES NUMA PASTA, PARA GUARDAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fotografa cada landing page de cima a baixo, no telemóvel e no computador,
 * e escreve uma pasta que se abre num duplo clique — sem servidor, sem
 * internet, sem nada instalado. Serve para arquivar, para mostrar a alguém, e
 * para comparar daqui a seis meses com o que estiver no ar nessa altura.
 *
 *     node scripts/exportar-lps.mjs http://127.0.0.1:4610
 *
 * O que NÃO é: uma cópia funcional do sítio. São imagens. Os formulários não
 * escrevem, os botões não clicam. Uma cópia funcional obrigaria a arrastar o
 * JavaScript e as fontes atrás, e ao primeiro `npm run build` ficava
 * desactualizada sem dar sinal — uma fotografia, pelo menos, é honesta sobre
 * ser de um dia.
 *
 * A escolha aceita os cookies antes de fotografar. Não é para esconder o
 * banner: é que o banner tapa o rodapé em todas as páginas e as fotografias
 * ficariam todas com a mesma tarja por cima.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] || "http://127.0.0.1:3000";
const SAIDA = path.join(RAIZ, "lp-export");

/** O domínio a que estes caminhos correspondem depois de publicados. */
const PUBLICO = "https://liquen-events.com";

const ECRAS = [
  { id: "telemovel", largura: 390, altura: 844, rotulo: "telemóvel" },
  { id: "computador", largura: 1280, altura: 900, rotulo: "computador" },
];

/**
 * O caminho vira nome de ficheiro: `/casamentos/estilo/boho` ->
 * `casamentos-estilo-boho`. A barra inicial cai ANTES da substituição, senão
 * todos os nomes começavam por um hífen.
 */
function nomeDeFicheiro(caminho) {
  return caminho.replace(/^\//, "").replace(/\//g, "-");
}

/** Lê os caminhos das páginas de campanha do sitemap, que é a fonte de verdade. */
async function paginasDoGoogle(pagina) {
  const xml = await (await pagina.request.get(`${BASE}/sitemap.xml`)).text();
  const todos = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(/^https?:\/\/[^/]+/, ""),
  );
  return todos
    .filter((c) => c.startsWith("/casamentos/") && !c.startsWith("/en/"))
    .sort()
    .map((caminho) => ({ caminho, grupo: "google", nome: nomeDeFicheiro(caminho) }));
}

/**
 * As páginas sociais não estão no sitemap — são `noindex` de propósito — por
 * isso saem do catálogo, lido por expressão regular como os outros guiões.
 */
function paginasSociais() {
  const src = readFileSync(path.join(RAIZ, "src/lib/meta/variantes.ts"), "utf8");
  const blocos = src.split(/^\s{4}slug:\s*"/m).slice(1);
  const out = [];
  for (const bloco of blocos) {
    const slug = /^([a-z0-9-]+)"/.exec(bloco)?.[1];
    if (!slug) continue;
    const soEm = /^\s{4}soEm:\s*"(pt|en)"/m.exec(bloco)?.[1];
    const prefixo = soEm === "en" ? "/en" : "";
    for (const sufixo of ["", "-b"]) {
      const caminho = `${prefixo}/s/${slug}${sufixo}`;
      out.push({ caminho, grupo: "meta", nome: nomeDeFicheiro(caminho) });
    }
  }
  return out;
}

async function fotografar(contexto, pagina, ecra, destino) {
  const p = await contexto.newPage();
  await p.setViewportSize({ width: ecra.largura, height: ecra.altura });
  const r = await p.goto(`${BASE}${pagina.caminho}`, { waitUntil: "load", timeout: 60000 });
  if (!r || !r.ok()) throw new Error(`${pagina.caminho} respondeu ${r ? r.status() : "nada"}`);

  // Descer a página inteira antes de fotografar: as fotografias entram com
  // `loading="lazy"` e as secções têm `content-visibility`, portanto sem isto
  // metade da página saía em branco.
  await p.evaluate(async () => {
    const passo = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += passo) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(
    () =>
      new Promise((resolve) => {
        const imgs = [...document.images].filter((i) => !i.complete);
        if (!imgs.length) return resolve();
        let faltam = imgs.length;
        const fim = () => --faltam || resolve();
        imgs.forEach((i) => {
          i.addEventListener("load", fim, { once: true });
          i.addEventListener("error", fim, { once: true });
        });
        setTimeout(resolve, 5000);
      }),
  );

  await p.screenshot({ path: destino, fullPage: true, type: "jpeg", quality: 72 });
  const altura = await p.evaluate(() => document.body.scrollHeight);
  await p.close();
  return altura;
}

function indice(linhas) {
  const grupo = (g) => linhas.filter((l) => l.grupo === g);
  const tabela = (ls) =>
    ls
      .map(
        (l) => `      <tr>
        <td><code>${l.caminho}</code></td>
        <td><a href="${PUBLICO}${l.caminho}">abrir no sítio</a></td>
        <td><a href="telemovel/${l.nome}.jpg">telemóvel</a></td>
        <td><a href="computador/${l.nome}.jpg">computador</a></td>
      </tr>`,
      )
      .join("\n");

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Landing pages da Líquen Events</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 60rem; padding: 3rem 1.5rem; color: #23261f; }
  h1 { font-size: 1.6rem; letter-spacing: -0.01em; }
  h2 { font-size: 1.1rem; margin-top: 2.5rem; }
  p { line-height: 1.6; color: #4a4f43; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  td, th { border-bottom: 1px solid #e3e1d9; padding: 0.5rem 0.4rem; text-align: left; }
  code { background: #f3f2ec; padding: 0.1rem 0.3rem; }
  a { color: #5f7c66; }
</style>
</head>
<body>
  <h1>Landing pages da Líquen Events</h1>
  <p>Fotografias de cada página, de cima a baixo, no telemóvel (390 px) e no
     computador (1280 px). São imagens: servem para arquivo e para mostrar, não
     funcionam como o sítio. A coluna "abrir no sítio" leva à página a sério.</p>
  <p><strong>Duas coisas que se veem nas fotografias e não são defeitos.</strong>
     O campo da data aparece como <code>mm/dd/yyyy</code>: o formato de um campo
     de data vem do idioma do browser, e o browser que tirou as fotografias está
     em inglês. Em Portugal aparece <code>dd/mm/aaaa</code>. E o banner de
     cookies não aparece em lado nenhum porque foi aceite antes de fotografar —
     senão tapava o rodapé das ${grupo("google").length + grupo("meta").length} páginas.</p>

  <h2>Páginas de Google Ads — ${grupo("google").length}</h2>
  <p>Tráfego de pesquisa. Quem chega já procurou, e lê texto.</p>
  <table>
    <tr><th>caminho</th><th>ao vivo</th><th colspan="2">fotografias</th></tr>
${tabela(grupo("google"))}
  </table>

  <h2>Páginas de Instagram e Facebook — ${grupo("meta").length}</h2>
  <p>Tráfego de interrupção. Uma frase, uma fotografia, um botão, e a barra do
     WhatsApp sempre à vista. Cada variante tem duas versões, A e B, com ganchos
     diferentes, para se poder medir qual converte melhor. Estas páginas são
     <code>noindex</code>: existem só para quem clica num anúncio.</p>
  <table>
    <tr><th>caminho</th><th>ao vivo</th><th colspan="2">fotografias</th></tr>
${tabela(grupo("meta"))}
  </table>
</body>
</html>
`;
}

async function main() {
  for (const e of ECRAS) mkdirSync(path.join(SAIDA, e.id), { recursive: true });

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const contexto = await browser.newContext({ deviceScaleFactor: 1 });
  // O consentimento antes de qualquer navegação, senão o banner tapa o rodapé
  // de todas as fotografias.
  await contexto.addInitScript(() => {
    try {
      localStorage.setItem("liquen-consent", "granted");
    } catch {
      /* sem armazenamento não há banner para esconder */
    }
  });
  const sonda = await contexto.newPage();
  const paginas = [...(await paginasDoGoogle(sonda)), ...paginasSociais()];
  await sonda.close();

  const linhas = [];
  for (const pagina of paginas) {
    const alturas = [];
    for (const ecra of ECRAS) {
      const destino = path.join(SAIDA, ecra.id, `${pagina.nome}.jpg`);
      alturas.push(await fotografar(contexto, pagina, ecra, destino));
    }
    linhas.push(pagina);
    console.log(`${pagina.caminho.padEnd(34)} ${alturas.map((a) => `${a}px`).join("  ")}`);
  }

  writeFileSync(path.join(SAIDA, "index.html"), indice(linhas));
  console.log(`\n${linhas.length} páginas x ${ECRAS.length} ecrãs em ${SAIDA}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
