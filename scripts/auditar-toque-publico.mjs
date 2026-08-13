/**
 * VARRIMENTO DE ERGONOMIA TÁCTIL DO SÍTIO PÚBLICO — o gémeo do do back office.
 *
 * Uso: node scripts/auditar-toque-publico.mjs [url]   (por omissão http://localhost:3510)
 *      --json toque-publico.json   escreve o relatório em bruto
 *      --capturas ./pasta          uma captura por página
 *
 * ── Porque é que isto existe ao lado do `auditar-toque-admin.mjs` ─────────
 * O `TOUCH-AUDIT.md` mediu o BACK OFFICE — onze vistas atrás de um login — e
 * levou os 95 alvos pequenos a zero. O sítio PÚBLICO nunca foi medido, e é o
 * que os visitantes tocam: as páginas onde se pede um orçamento, se liga o
 * telefone, se muda de idioma. As regras são as mesmas, portanto os limiares
 * são os mesmos e vêm do mesmo sítio (`e2e/ergonomia-tactil.mjs`); o que muda
 * é a lista de ecrãs e o facto de não haver login nenhum pelo caminho.
 *
 * ── A ARMADILHA QUE ESTE GUIÃO EXISTE PARA NÃO SE VOLTAR A PISAR ──────────
 * `hasTouch: true` e `isMobile: true` NÃO SÃO OPCIONAIS aqui, e não é
 * cosmética de user-agent.
 *
 * A classe `.alvo-toque` do `globals.css` — que é o mecanismo que este
 * repositório usa para crescer alvos — vive INTEIRA dentro de
 * `@media (pointer: coarse)`. Uma medição feita com uma janela estreita mas
 * sem aparelho de toque emulado avalia `(pointer: coarse)` como FALSO, e por
 * isso mede um ecrã onde a correcção está desligada:
 *
 *   · antes de corrigir  — acusa alvos pequenos que existem mesmo;
 *   · depois de corrigir — acusa OS MESMOS alvos, todos, na mesma medida,
 *     porque a classe que os cura não chegou a aplicar-se.
 *
 * Ou seja: sem toque emulado o varrimento não distingue código corrigido de
 * código por corrigir. Uma medição assim não é uma medição rigorosa a menos —
 * é uma medição que dá sempre a mesma resposta. Por isso o contexto é criado
 * aqui, num sítio só, e não passado por argumento.
 *
 * ── Mede-se DUAS VEZES por página, e a segunda não é zelo a mais ──────────
 * No topo e outra vez com a página descida. Os dois botões flutuantes deste
 * sítio — o "Pedir orçamento" e o WhatsApp — só existem depois de se rolar
 * 75 % de um ecrã (ver `StickyCTA.tsx`), e uma medição feita só no topo
 * devolvia zero achados sobre eles com toda a confiança do mundo. Foi assim
 * que o chip de 162×38 px do "Pedir orçamento" sobreviveu à primeira
 * passagem inteira: estava correcto que não aparecia, e estava errado
 * concluir daí que não havia nada para ver.
 *
 * ── E mais duas superfícies que não são "uma página" ──────────────────────
 * O MENU do telemóvel, aberto, porque é a única navegação que existe abaixo
 * de `lg` e não está pintado em ecrã nenhum enquanto fechado. E a barra a
 * 1440 px COM TOQUE: os quatro links, o "Contacto" e a CTA do cabeçalho de
 * computador vivem em `display: none` até aos 1024 px, portanto uma medição
 * a 375 px prova exactamente nada sobre eles — e há aparelhos de toque
 * dessas larguras (um iPad deitado, um portátil de ecrã táctil). Os dois
 * conjuntos tinham achados que nenhuma medição a 375 px podia ver.
 *
 * ── O que se mede, e o que não ────────────────────────────────────────────
 * Mede-se o que está PINTADO. Fora do menu não se abre mais nada — nem
 * modais, nem carrosséis, nem a galeria em lightbox (isso é o trabalho do
 * `auditar-percursos-movel.mjs`, do lado do back office) —, e o que vive
 * atrás de um toque fica por medir: está dito aqui em vez de preenchido com
 * suposições.
 */

import { chromium } from "@playwright/test";
// As regras e os limiares vivem num sítio só — os mesmos do back office. Duas
// cópias afastavam-se, e o relatório passava a dizer uma coisa e o CI outra.
import { AUDITOR, ECRA_ESTREITO, ALVO_MIN } from "../e2e/ergonomia-tactil.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

/**
 * ── SEGUNDA PASSAGEM, MAIS EXIGENTE, SÓ PARA ALVOS PEQUENOS ───────────────
 *
 * O `AUDITOR` partilhado dispensa qualquer `<a>` cujo PAI tenha 20 letras a
 * mais do que ele, com a regra "um link dentro de um parágrafo de texto
 * corrido é palavra sublinhada, não alvo". A regra está certa na intenção e é
 * larga de mais na letra: o pai não é o parágrafo, é o elemento imediatamente
 * acima, e um `<a class="block">` sozinho dentro de um `<div>` que também tem
 * um rótulo e uma legenda é dispensado exactamente como se fosse uma palavra
 * a meio de uma frase.
 *
 * MEDIDO no sítio público: o email e o telefone de `/contacto` (dois dos três
 * actos de conversão da página, 342×20 px cada) NÃO apareciam na primeira
 * passagem por causa disto; nem o telefone do rodapé, nem o "Termos" da barra
 * de direitos de autor — enquanto o "Privacidade" ao lado, com uma letra a
 * mais, aparecia. Uma lista de defeitos que inclui um irmão e exclui o outro
 * pelo comprimento do texto não é uma lista.
 *
 * Aqui a pergunta é a que interessa: o link participa mesmo numa LINHA DE
 * TEXTO? Isso é `display: inline` (e nada mais) num pai que corre texto. Um
 * `block`, um `flex`, ou um filho de um `flex` — que o browser transforma em
 * bloco — é um alvo autónomo, e conta.
 *
 * Isto NÃO altera o auditor partilhado, de propósito: aquele é o contrato do
 * CI do back office e vale-lhe mais ser estável do que ser esperto. Esta
 * passagem vive aqui, ao lado, e o relatório mostra os dois números.
 */
const ALVOS_ESTRITOS = `(() => {
  const ALVO_MIN = ${ALVO_MIN};
  const SELECTOR = [
    "a[href]", "button", "input", "select", "textarea",
    "[role=button]", "[role=link]", "[role=tab]", "[role=checkbox]",
    "[role=switch]", "[role=menuitem]", "[role=option]", "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function visivel(el) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (r.right <= 0 || r.left >= innerWidth) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cp = getComputedStyle(p);
      if (cp.display === "none" || cp.visibility === "hidden") return false;
    }
    if (el.closest("[inert],[aria-hidden=true]")) return false;
    return true;
  }

  /** A caixa em que se toca — o rótulo, quando é ele que activa o controlo. */
  function caixaDeToque(el) {
    const r = el.getBoundingClientRect();
    const rot = el.closest("label");
    if (!rot || rot === el) return r;
    const rr = rot.getBoundingClientRect();
    if (rr.width > 400 || rr.height > 120) return r;
    return rr.width * rr.height > r.width * r.height ? rr : r;
  }

  /**
   * Palavra sublinhada a meio de uma frase — e só isso.
   *
   * As duas condições são as duas metades da mesma pergunta: o elemento tem de
   * correr DENTRO de uma linha (\`display: inline\`) e tem de haver mesmo texto
   * à volta dele no mesmo bloco. Um "Saber mais" no fim do parágrafo do aviso
   * de cookies passa nas duas; o email de \`/contacto\`, que é \`block\`, falha
   * logo na primeira.
   */
  function palavraNumaFrase(el) {
    if (el.tagName !== "A") return false;
    if (getComputedStyle(el).display !== "inline") return false;
    const bloco = el.closest("p, li, dd, blockquote, figcaption, td, h1, h2, h3, h4");
    if (!bloco || bloco === el) return false;
    const meu = (el.textContent || "").trim().length;
    return (bloco.textContent || "").trim().length > meu + 20;
  }

  const pequenos = [];
  for (const el of Array.from(document.querySelectorAll(SELECTOR)).filter(visivel)) {
    const r = caixaDeToque(el);
    const l = Math.round(r.width), a = Math.round(r.height);
    if (l >= ALVO_MIN && a >= ALVO_MIN) continue;
    if (palavraNumaFrase(el)) continue;
    const cls = typeof el.className === "string" ? el.className : "";
    pequenos.push({
      tag: el.tagName.toLowerCase(),
      rotulo: (el.getAttribute("aria-label") || "").slice(0, 80),
      texto: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60),
      classes: cls.slice(0, 200),
      largura: l, altura: a,
    });
  }
  return pequenos;
})()`;

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3510";
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : null;
};
const JSON_OUT = arg("--json");
const CAPTURAS = arg("--capturas");

/**
 * As páginas públicas, pelo CAMINHO.
 *
 * O português vive sem prefixo (`/contacto`) e o inglês em `/en/*` — é o que
 * `lib/i18n/config.ts` faz e o que os links do sítio produzem. Mede-se o
 * português em toda a largura do sítio e uma página em inglês, porque o
 * cabeçalho e o rodapé (onde estão quase todos os alvos partilhados) são os
 * mesmos nos dois e não vale a pena medir tudo a dobrar.
 */
const PAGINAS = [
  ["Início", "/"],
  ["Serviços", "/servicos"],
  ["Serviço — casamentos", "/servicos/casamentos"],
  ["Galeria", "/galeria"],
  ["Sobre", "/sobre"],
  ["Clientes", "/clientes"],
  ["Contacto", "/contacto"],
  ["Privacidade", "/privacidade"],
  ["Termos", "/termos"],
  ["Casamentos — destination", "/casamentos/destination"],
  ["Início (EN)", "/en"],
];

async function main() {
  // `CHROMIUM_BIN` para as máquinas onde o Chromium do Playwright não pode ser
  // descarregado (CI fechado, contentor sem rede para o CDN) mas há um binário
  // instalado. Sem a variável usa-se o do Playwright, como em todo o resto.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined });
  const ctx = await browser.newContext({
    viewport: ECRA_ESTREITO,
    deviceScaleFactor: 2,
    // ── AS DUAS LINHAS QUE FAZEM ISTO VALER ALGUMA COISA ──────────────────
    // Sem `hasTouch` o Chromium responde `(pointer: coarse)` = falso, e todo
    // o `globals.css` que cresce alvos fica desligado. Ver o cabeçalho.
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });

  // Uma verificação do próprio instrumento, antes de acreditar num só número:
  // se `(pointer: coarse)` não for verdade, tudo o que se segue mede o ecrã
  // errado e é melhor parar do que publicar uma tabela.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const grosso = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  if (!grosso) throw new Error("`(pointer: coarse)` é falso — o toque não está emulado");

  const relatorio = [];
  for (const [nome, caminho] of PAGINAS) {
    try {
      await page.goto(`${BASE}${caminho}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      // Deixar assentar o que entra por cliente (o banner de consentimento, os
      // botões flutuantes, as animações de entrada). Medir antes disto dava
      // números de uma página que ninguém chega a ver.
      await page.waitForTimeout(2500);
    } catch (e) {
      relatorio.push({ pagina: nome, caminho, erro: e.message.split("\n")[0] });
      continue;
    }
    const r = await page.evaluate(AUDITOR);
    const estritos = await page.evaluate(ALVOS_ESTRITOS);
    if (CAPTURAS) {
      const ficheiro = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await page.screenshot({ path: `${CAPTURAS}/${ficheiro}.png`, fullPage: true });
    }

    // Segunda passagem, com a página descida: é aqui que os flutuantes nascem.
    // Um ecrã e meio chega — o limiar é 0,75 e a barra fixa esconde-se outra
    // vez em cima do rodapé, por isso não se vai ao fundo da página.
    await page.evaluate(() => scrollTo(0, innerHeight * 1.6));
    await page.waitForTimeout(900);
    const descida = await page.evaluate(ALVOS_ESTRITOS);
    // Deduplicar: quase tudo o que se vê descido já se via no topo.
    //
    // A chave NÃO leva as classes, e isso custou um número errado antes de se
    // ver porquê: a barra de topo troca de classes ao passar dos 30 px de
    // scroll (fundo sólido em vez de transparente), portanto o MESMO botão
    // PT/EN aparecia com duas assinaturas e era contado duas vezes. O total
    // "antes" vinha inflacionado em oito. O rótulo e o texto chegam para
    // identificar um alvo; as classes são o que muda por baixo dele.
    const chave = (p) => `${p.tag}|${p.rotulo}|${p.texto}|${p.largura}x${p.altura}`;
    const vistos = new Set(estritos.map(chave));
    for (const p of descida) {
      const k = chave(p);
      if (vistos.has(k)) continue;
      vistos.add(k);
      estritos.push({ ...p, soAoRolar: true });
    }

    relatorio.push({ pagina: nome, caminho, ...r, estritos });
    process.stderr.write(
      `${nome} (${caminho}): ${r.examinados} interactivos, ${estritos.length} pequenos ` +
        `(${r.pequenos.length} pela regra partilhada), ${r.camposPequenos.length} campos, ` +
        `${r.overflow.culpados.length} a passar da margem\n`,
    );
    for (const p of estritos) {
      process.stderr.write(
        `    ${p.largura}x${p.altura}  "${(p.rotulo || p.texto || `<${p.tag}>`).slice(0, 44)}"` +
          `  (mínimo ${ALVO_MIN})${p.soAoRolar ? "  [só ao rolar]" : ""}\n`,
      );
    }
  }

  // ── O MENU DO TELEMÓVEL, ABERTO ─────────────────────────────────────────
  // Não está pintado em página nenhuma enquanto fechado, e é a única navegação
  // que existe abaixo de `lg`. Mede-se uma vez: é o mesmo menu em toda a parte.
  //
  // Limpar os cookies primeiro: a visita a `/en` acima deixou a escolha de
  // idioma guardada, e sem isto media-se o menu em inglês sem se dar por isso.
  // Os números seriam os mesmos e o relatório mentiria na mesma.
  await ctx.clearCookies();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /menu/i }).first().click();
  await page.waitForTimeout(900);
  const menu = await page.evaluate(ALVOS_ESTRITOS);
  relatorio.push({ pagina: "Menu do telemóvel (aberto)", caminho: "/", estritos: menu });
  process.stderr.write(`Menu do telemóvel (aberto): ${menu.length} pequenos\n`);
  for (const p of menu) {
    process.stderr.write(`    ${p.largura}x${p.altura}  "${(p.rotulo || p.texto).slice(0, 44)}"\n`);
  }

  // ── A BARRA DE COMPUTADOR, NUM APARELHO DE TOQUE ────────────────────────
  // Os links do cabeçalho de `lg` para cima estão em `display: none` a 375 px:
  // nada do que foi medido acima diz uma palavra sobre eles. E 1440 px com
  // toque não é hipótese de laboratório — é um iPad Pro deitado.
  const ctxLargo = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const paginaLarga = await ctxLargo.newPage();
  await paginaLarga.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await paginaLarga.waitForTimeout(2500);
  const largo = await paginaLarga.evaluate(ALVOS_ESTRITOS);
  relatorio.push({ pagina: "Início a 1440 px, com toque", caminho: "/", estritos: largo });
  process.stderr.write(`Início a 1440 px, com toque: ${largo.length} pequenos\n`);
  for (const p of largo) {
    process.stderr.write(`    ${p.largura}x${p.altura}  "${(p.rotulo || p.texto).slice(0, 44)}"\n`);
  }
  await ctxLargo.close();

  await browser.close();
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(relatorio, null, 2));

  // Um total, para não ter de se somar a tabela à mão de cada vez.
  const total = relatorio.reduce((n, v) => n + (v.estritos?.length ?? 0), 0);
  const partilhado = relatorio.reduce((n, v) => n + (v.pequenos?.length ?? 0), 0);
  process.stderr.write(
    `\nTOTAL: ${total} alvos abaixo de ${ALVO_MIN}x${ALVO_MIN} px ` +
      `(${partilhado} pela regra do auditor partilhado)\n`,
  );
  return relatorio;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
