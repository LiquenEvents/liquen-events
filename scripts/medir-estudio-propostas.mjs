/**
 * MEDIÇÃO DA PÁGINA "FAZER PROPOSTA" — o antes e o depois, com números.
 *
 * Uso (com `npm run dev` a correr noutro terminal):
 *   node scripts/medir-estudio-propostas.mjs
 *   node scripts/medir-estudio-propostas.mjs --json
 *   node scripts/medir-estudio-propostas.mjs --capturas
 *
 * ── Porque é que isto é um guião e não uma folha de cálculo ────────────────
 * A missão pede para reduzir campos, cliques e scroll — e para o PROVAR no
 * fim. Uma medição feita à mão hoje e outra feita à mão daqui a três dias não
 * se comparam: mudou o ecrã, mudou a paciência de quem contou. Este guião
 * mede sempre da mesma maneira, e por isso o «antes» e o «depois» são a mesma
 * régua.
 *
 * ── O que conta como «campo» ──────────────────────────────────────────────
 * Um sítio onde ela escreve ou escolhe: input, textarea, select. Botões não
 * contam como campos (contam como cliques). Campos escondidos dentro de
 * secções fechadas CONTAM — fechados continuam a ter de ser preenchidos.
 *
 * ── O que conta como «scroll» ─────────────────────────────────────────────
 * A altura total da página a dividir pela altura da janela: quantos ecrãs de
 * conteúdo existem. É a medida que corresponde à queixa («dois metros de
 * scroll») e não depende da velocidade da roda do rato.
 */

import { chromium } from "@playwright/test";
import { mkdirSync, existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const JSON_OUT = process.argv.includes("--json");
const CAPTURAS = process.argv.includes("--capturas");
// Medir o estúdio VAZIO diz pouco: ninguém envia uma proposta vazia. Com
// --completa, o guião constrói a proposta real da Catarina Martins pela
// interface, contando cada clique e cada campo escrito à mão, e mede o
// resultado. É este o número que a missão quer reduzir.
const COMPLETA = process.argv.includes("--completa");
// Lê as cores computadas e assinala o que sai das regras do DESIGN-TOKENS.md.
const CORES = process.argv.includes("--cores");
/**
 * De quem é o pedido a medir.
 *
 * O padrão é "Ana Antes" — um pedido SEM pontos de decoração escolhidos. Não
 * é um detalhe: os pontos de decoração que acabei de acrescentar ao
 * formulário fazem o estúdio abrir já com o grupo de serviços e as linhas de
 * orçamento preenchidas. Medir a linha de partida num pedido desses seria
 * medir o depois e chamar-lhe antes.
 */
const CLIENTE = process.env.CLIENTE ?? "Ana Antes";
const PASTA = "/tmp/medicao-estudio";

// O ecrã de trabalho dela é um portátil; o tablet vai à parte porque a missão
// diz que é onde isto é usado em reuniões.
const ECRAS = [
  { nome: "portátil", width: 1440, height: 900 },
  { nome: "tablet", width: 1024, height: 768 },
];

/**
 * A sessão fica guardada em ficheiro e é reutilizada.
 *
 * NÃO é uma optimização: a entrada tem um limite de 8 tentativas por minuto
 * por IP. Medir dois ecrãs são duas entradas, e repetir a medição meia dúzia
 * de vezes (que é o que se faz enquanto se afina um guião destes) esgota o
 * limite. O sintoma é cruel — o servidor devolve o ecrã de entrada outra vez,
 * o Playwright espera pela navegação que nunca aparece, e o erro que sai é um
 * "timeout" que não diz nada sobre a verdadeira causa. Já me custou uma sessão
 * inteira a perceber isto uma vez.
 */
const SESSAO = `${PASTA}/sessao.json`;

async function entrar(page) {
  await page.goto(`${BASE}/orcamento/admin`, { waitUntil: "domcontentloaded" });
  const nome = page.getByLabel(/O teu nome/i);
  if (await nome.isVisible().catch(() => false)) {
    await nome.fill("Catarina");
    await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    // Dizer o que se passou, em vez de deixar rebentar como "timeout".
    const travado = page.getByText(/Demasiadas tentativas/i);
    if (await travado.isVisible({ timeout: 2500 }).catch(() => false)) {
      throw new Error(
        "o servidor travou a entrada (limite de tentativas). Espere um minuto e repita — " +
          `ou apague ${SESSAO} se a sessão guardada tiver expirado.`,
      );
    }
  }
  await page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .waitFor({ timeout: 15000 });
}

/**
 * O que o ESTÚDIO tem, contado no DOM em vez de à vista.
 *
 * ── Duas armadilhas que estragaram a primeira versão disto ────────────────
 *
 * 1. CONTAR O BACK OFFICE INTEIRO. `document.querySelectorAll` apanha a
 *    navegação lateral, a barra de topo, e a vista "Pedidos" que fica montada
 *    por baixo. A primeira contagem deu 53 campos num sítio onde o estúdio
 *    nem sequer tem tantos. Aqui a contagem é feita a partir da RAIZ do
 *    estúdio — o antepassado comum mais baixo das secções dele.
 *
 * 2. MEDIR O SCROLL NA PÁGINA ERRADA. `documentElement.scrollHeight` deu
 *    exactamente a altura da janela, o que se leria como "não há scroll
 *    nenhum" numa página de que ela se queixa por ter dois metros dele. O
 *    back office não faz a página crescer: põe o conteúdo num contentor com
 *    `overflow-y`. É esse que tem de ser medido.
 */
const CENSO = `() => {
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && (r.width > 0 || r.height > 0);
  };

  // ── A raiz do estúdio ────────────────────────────────────────────────
  // As secções do documento, pelos títulos que ela vê. Se um dia mudarem de
  // nome, isto tem de rebentar em vez de medir a página errada em silêncio.
  const NOMES = ["Evento", "Imagens de capa", "Serviços", "Mood boards", "Orçamento Proposto", "Total, IVA e validade"];
  const titulos = [...document.querySelectorAll("h2, h3")]
    .filter(visivel)
    .filter((el) => NOMES.some((n) => (el.textContent ?? "").trim().startsWith(n)));
  if (titulos.length < 4) {
    return { erro: "não encontrei as secções do estúdio — a página mudou de nomes?", achei: titulos.map((t) => t.textContent.trim()) };
  }
  let raiz = titulos[0];
  while (raiz && !titulos.every((t) => raiz.contains(t))) raiz = raiz.parentElement;
  if (!raiz) return { erro: "as secções do estúdio não têm antepassado comum" };

  // ── O contentor que faz scroll ───────────────────────────────────────
  let scroller = raiz;
  while (scroller && scroller !== document.body) {
    const ov = getComputedStyle(scroller).overflowY;
    if ((ov === "auto" || ov === "scroll") && scroller.scrollHeight > scroller.clientHeight + 4) break;
    scroller = scroller.parentElement;
  }
  const janela = scroller && scroller !== document.body ? scroller.clientHeight : window.innerHeight;
  const conteudo = Math.max(raiz.scrollHeight, Math.round(raiz.getBoundingClientRect().height));

  const campos = [...raiz.querySelectorAll("input, textarea, select")].filter(
    (el) => el.type !== "hidden" && el.type !== "file",
  );
  const botoes = [...raiz.querySelectorAll("button")].filter(visivel);

  // ── As caixas de capa vazias ─────────────────────────────────────────
  // A queixa concreta: "quase um ecrã inteiro para não mostrarem nada". Só
  // interessa a caixa de largar em si, não os invólucros que a contêm — daí
  // ficar com o elemento MAIS PEQUENO que ainda diz "Capa esquerda".
  const zonasCapa = ["Capa esquerda", "Capa direita"].map((rotulo) => {
    const cands = [...raiz.querySelectorAll("label, div, button")]
      .filter((el) => visivel(el) && (el.textContent ?? "").trim().startsWith(rotulo))
      .filter((el) => el.getBoundingClientRect().height > 40)
      .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
    const el = cands[0];
    if (!el) return { rotulo, altura: 0 };
    const r = el.getBoundingClientRect();
    return { rotulo, altura: Math.round(r.height), topo: Math.round(r.top), esquerda: Math.round(r.left) };
  });

  // ── O que já vem preenchido e o que ela tem de escrever ──────────────
  // É a pergunta central da Fase 0. Um campo que chega preenchido do pedido
  // não é trabalho; um campo vazio é. Distinguir os dois evita prometer
  // poupanças em sítios onde já não há nada a poupar.
  const comValor = campos.filter((el) => {
    if (el.type === "checkbox" || el.type === "radio") return el.checked;
    return String(el.value ?? "").trim() !== "";
  });
  const rotuloDe = (el) =>
    el.getAttribute("aria-label") ||
    el.getAttribute("placeholder") ||
    (el.labels && el.labels[0] ? el.labels[0].textContent.trim() : "") ||
    el.name ||
    "(sem rótulo)";
  const preenchidos = comValor.map((el) => ({ campo: rotuloDe(el), valor: String(el.value).slice(0, 40) }));
  const vazios = campos.filter((el) => !comValor.includes(el)).map(rotuloDe);

  return {
    campos: campos.length,
    camposPorTipo: campos.reduce((acc, el) => {
      const k = el.tagName === "INPUT" ? el.type || "text" : el.tagName.toLowerCase();
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    botoes: botoes.length,
    alturaConteudo: conteudo,
    alturaJanelaUtil: janela,
    ecras: Number((conteudo / janela).toFixed(2)),
    scrollerEhPagina: !scroller || scroller === document.body,
    zonasCapa,
    preenchidos,
    vazios,
    seccoes: titulos.map((t) => (t.textContent ?? "").trim()),
    // O nome do cliente aparece no cabeçalho da página E outra vez no campo
    // "Clientes"? A missão diz que sim; isto verifica-o em vez de acreditar.
    nomeRepetido: (() => {
      const campoClientes = campos.find((el) => rotuloDe(el).match(/Clientes|Maria & Zé/i));
      const nome = campoClientes ? String(campoClientes.value).trim() : "";
      if (!nome) return null;
      const cabecalhos = [...document.querySelectorAll("h1, h2, h3")]
        .filter(visivel)
        .map((el) => (el.textContent ?? "").trim())
        .filter((t) => t.includes(nome));
      return { nome, tambemEm: cabecalhos };
    })(),
    alturaMediaCampo: (() => {
      const alturas = campos.map((el) => Math.round(el.getBoundingClientRect().height)).filter((h) => h > 0);
      return alturas.length ? Math.round(alturas.reduce((a, b) => a + b, 0) / alturas.length) : 0;
    })(),
  };
}`;

/**
 * A PROPOSTA DA CATARINA MARTINS, construída pela interface.
 *
 * O conteúdo é o do PDF real (`PO Decoração Casamento Catarina Martins
 * 18.09.2027`): dois grupos de serviços com seis itens ao todo, cinco mood
 * boards, cinco linhas de orçamento e o total. É a proposta MÉDIA dela — não
 * um caso extremo inventado para o número parecer mau.
 *
 * Conta-se tudo o que a mão dela faz: cada clique num botão e cada campo
 * escrito. As FOTOS ficam de fora e isso está dito no relatório — a biblioteca
 * precisa do Supabase, que esta máquina não alcança. O número de cliques que
 * sai daqui é portanto o PISO: na vida real ainda há as fotos por cima.
 */
async function construirPropostaReal(page) {
  // COMEÇAR DE FACTO DO ZERO.
  //
  // Sem isto, a segunda passagem (o tablet) constrói por cima do rascunho que
  // a primeira deixou, e o resultado é o dobro das linhas com ar de medição.
  // Deu 59 campos e 8,4 ecrãs num sítio onde a proposta tem 42 e 5,12 — e o
  // número saía com toda a confiança do mundo.
  const limpar = page.getByRole("button", { name: /Limpar rascunho/ });
  if (await limpar.isVisible().catch(() => false)) {
    await limpar.click();
    await page.waitForTimeout(1200);
    await page.getByPlaceholder("Maria & Zé").waitFor({ timeout: 15000 });
  }

  let cliques = 0;
  let escritos = 0;
  const clicar = async (loc) => {
    await loc.click();
    cliques++;
    await page.waitForTimeout(60);
  };
  const escrever = async (loc, texto) => {
    await loc.fill(texto);
    escritos++;
  };

  // ── Evento ───────────────────────────────────────────────────────────
  // Alguns destes chegam já preenchidos do pedido; o guião reescreve-os na
  // mesma para saber quantos ela TERIA de escrever se não viessem — a conta
  // do que se poupa faz-se no relatório, comparando com o censo de campos já
  // preenchidos que está mais abaixo.
  await escrever(page.getByPlaceholder("Maria & Zé"), "Catarina & ");
  await escrever(page.getByPlaceholder("12 de setembro de 2026"), "18 de setembro de 2027");
  await escrever(page.getByPlaceholder("Monte da Oliveirinha, Évora"), "Évora");
  await escrever(page.getByPlaceholder("150 pax"), "250 pax");

  // ── Serviços: a) quatro itens, b) dois itens ─────────────────────────
  const grupos = [
    {
      titulo: "Decoração Floral e Decoração",
      itens: ["Igreja", "Cocktail", "Decor Seatting Plann", "Decoração e design Floral Jantar"],
    },
    { titulo: "Complementos dos Noivos", itens: ["Ramo da Noiva", "Lapelas"] },
  ];
  // Selectores por `aria-label`: os `placeholder` mudam com o texto de exemplo
  // e não são contrato nenhum. Os rótulos de acessibilidade são.
  const itens = () => page.getByLabel("Item", { exact: true });
  for (const [gi, g] of grupos.entries()) {
    if (gi > 0) await clicar(page.getByRole("button", { name: /Adicionar grupo de serviços/ }));
    await escrever(page.getByLabel("Título do grupo").nth(gi), g.titulo);
    for (const [ii, item] of g.itens.entries()) {
      // O primeiro grupo já nasce com um item; um grupo acrescentado nasce sem
      // nenhum. É por isso que a conta de cliques não é a mesma nos dois.
      const jaTem = gi === 0 ? 1 : 0;
      if (ii >= jaTem) {
        await clicar(page.getByRole("button", { name: /Adicionar item/ }).nth(gi));
      }
      await escrever(itens().nth(gi === 0 ? ii : 4 + ii), item);
    }
  }

  // ── Mood boards: cinco ───────────────────────────────────────────────
  const boards = ["Cerimónia", "Cocktail", "Dinner", "Seatting Plan", "Ramo da Noiva"];
  for (const b of boards) {
    await clicar(page.getByRole("button", { name: /Adicionar mood board/ }));
    await escrever(page.getByLabel("Título do mood board").last(), b);
  }

  // ── Orçamento: cinco linhas ──────────────────────────────────────────
  const linhas = [
    "Decoração Cerimónia",
    "Decoração Cocktail",
    "Seatting Plan e Decor Floral Seatting Plann",
    "Design Floral e Decoração Mesas",
    "Complementos dos Noivos",
  ];
  for (const l of linhas) {
    await clicar(page.getByRole("button", { name: /Adicionar item/ }).last());
    await escrever(page.getByLabel("Item de orçamento").last(), l);
  }

  // ── Total ────────────────────────────────────────────────────────────
  await escrever(page.getByPlaceholder("3000"), "6875");

  await page.waitForTimeout(600);
  return { cliques, escritos };
}

/**
 * As cores, contra as regras do DESIGN-TOKENS.md.
 *
 * Não é um teste — é uma leitura. Um teste de cores exactas parte-se a cada
 * ajuste de opacidade e ensina as pessoas a ignorá-lo; esta lista lê-se antes
 * e depois de uma alteração e diz o que MUDOU.
 */
const AUDITOR_CORES = `() => {
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && r.height > 0;
  };
  const cor = (el) => getComputedStyle(el).color;
  const fonte = (el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "");

  // Um cinzento neutro tem os três canais iguais (ou quase). Um castanho
  // quente não — é assim que se distingue sem depender de valores exactos.
  // SEM EXPRESSÕES REGULARES. Este auditor viaja dentro de um template
  // literal, e ali dentro "\\d" não é um dígito — é a letra d. A primeira
  // versão disto media com um regex partido e dizia "0 etiquetas não
  // neutras" sobre uma etiqueta castanha que estava mesmo à frente.
  const neutra = (c) => {
    const dentro = c.split("(")[1];
    if (!dentro) return true; // oklab/color-mix: não se avalia, não se acusa
    const [r, g, b] = dentro.split(")")[0].split(",").map((n) => Number(n.trim()));
    if (![r, g, b].every((n) => Number.isFinite(n))) return true;
    return Math.max(r, g, b) - Math.min(r, g, b) <= 6;
  };

  const etiquetas = [...document.querySelectorAll(".bo-eyebrow")].filter(visivel);
  const titulos = [...document.querySelectorAll("h2, h3")].filter(visivel);

  return {
    etiquetasNaoNeutras: etiquetas
      .filter((el) => !neutra(cor(el)))
      .map((el) => ({ texto: el.textContent.trim().slice(0, 24), cor: cor(el) })),
    etiquetasEmSerifa: etiquetas
      .filter((el) => /Playfair|serif/i.test(fonte(el)))
      .map((el) => el.textContent.trim().slice(0, 24)),
    titulosSemSerifa: titulos
      .filter((el) => !/Playfair|serif/i.test(fonte(el)))
      .map((el) => el.textContent.trim().slice(0, 24)),
    // Quantos botões de acção afirmativa (verde cheio) existem à vista. A
    // regra é «uma por secção»; mais do que isso obriga a escolher.
    botoesVerdes: [...document.querySelectorAll("button")]
      .filter(visivel)
      .filter((el) => {
        const f = getComputedStyle(el).backgroundColor.replace(/ /g, "");
        return f.includes("77,99,80") || f.includes("76,99,80");
      })
      .map((el) => el.textContent.trim().slice(0, 24)),
    amostraEtiqueta: etiquetas[0] ? cor(etiquetas[0]) : null,
    amostraTitulo: titulos[0] ? fonte(titulos[0]) : null,
  };
}`;

async function medir() {
  const browser = await chromium.launch();
  const resultados = [];
  if (CAPTURAS) mkdirSync(PASTA, { recursive: true });

  mkdirSync(PASTA, { recursive: true });
  for (const ecra of ECRAS) {
    const context = await browser.newContext({
      viewport: { width: ecra.width, height: ecra.height },
      ...(existsSync(SESSAO) ? { storageState: SESSAO } : {}),
    });
    const page = await context.newPage();
    // Escolher a vista ANTES de a página abrir.
    //
    // O back office restaura a última vista num `useEffect`, e um clique na
    // navegação feito logo a seguir ao carregamento é desfeito por esse efeito
    // — a vista salta para trás sozinha. É um defeito verdadeiro da página (um
    // clique rápido perde-se), aqui contornado para a medição ser determinista.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("liquen-admin-view", "fazer-proposta");
      } catch {
        /* sem localStorage — a navegação por clique trata do resto */
      }
    });
    await entrar(page);
    await context.storageState({ path: SESSAO });

    // Ir a "Fazer proposta" e abrir o estúdio no primeiro pedido da lista. Os
    // itens da navegação são <button>, não <a> — o back office não muda de
    // rota, muda de vista.
    await page
      .getByRole("navigation", { name: /Navegação do back office/i })
      .getByRole("button", { name: /Fazer proposta/i })
      .click();
    // Confirmar QUE VISTA se está a medir, em vez de assumir.
    //
    // O back office guarda a última vista aberta, e a sessão reutilizada
    // trazia "Pedidos". Sem esta verificação, o guião mediu o estúdio embutido
    // no dossier do pedido — os mesmos componentes, outro sítio — e eu só dei
    // por isso ao olhar para a captura de ecrã. Números certos sobre a página
    // errada são piores do que nenhuns.
    await page.getByRole("heading", { name: /^Fazer proposta$/ }).waitFor({ timeout: 10000 });
    // A lista de pedidos: o cartão abre o estúdio.
    //
    // `:visible` não é cosmético. A vista "Pedidos" continua montada por baixo
    // com um cartão para o MESMO pedido, e o seletor apanhava esse — que existe
    // no DOM, tem classes, e nunca fica clicável. O erro dizia "element is not
    // visible" durante quinze segundos sobre um botão que estava mesmo à
    // frente dos olhos na captura de ecrã.
    await page
      .locator("main button:visible")
      .filter({ hasText: new RegExp(CLIENTE) })
      .first()
      .click({ timeout: 15000 });
    // O estúdio monta em duas fases (documento + rascunho local); esperar por
    // um campo dele é mais fiável do que esperar um tempo fixo.
    await page.getByPlaceholder("Maria & Zé").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);

    const trabalho = COMPLETA ? await construirPropostaReal(page) : null;

    const titulo = (await page.locator("h1").first().textContent())?.trim();
    if (titulo !== "Fazer proposta") {
      throw new Error(`estava a medir a vista "${titulo}", não "Fazer proposta"`);
    }
    const censo = await page.evaluate(eval(`(${CENSO})`));
    const cores = CORES ? await page.evaluate(eval(`(${AUDITOR_CORES})`)) : null;
    resultados.push({ ecra: ecra.nome, ...ecra, ...censo, trabalho, cores });

    if (CAPTURAS) {
      await page.screenshot({
        path: `${PASTA}/estudio-${ecra.nome}.png`,
        fullPage: true,
      });
    }
    await context.close();
  }

  await browser.close();
  return resultados;
}

const resultados = await medir();

if (JSON_OUT) {
  console.log(JSON.stringify(resultados, null, 2));
} else {
  for (const r of resultados) {
    console.log(`\n── ${r.ecra} (${r.width}×${r.height}) ────────────────────`);
    if (r.erro) {
      console.log(`  ERRO: ${r.erro}`);
      if (r.achei) console.log(`  achei: ${JSON.stringify(r.achei)}`);
      continue;
    }
    console.log(`campos:              ${r.campos}   ${JSON.stringify(r.camposPorTipo)}`);
    console.log(`botões no estúdio:   ${r.botoes}`);
    console.log(`altura do conteúdo:  ${r.alturaConteudo}px`);
    console.log(
      `janela útil:         ${r.alturaJanelaUtil}px${r.scrollerEhPagina ? " (a página inteira)" : " (contentor interior)"}`,
    );
    console.log(`ecrãs de scroll:     ${r.ecras}`);
    console.log(`altura média campo:  ${r.alturaMediaCampo}px`);
    console.log(`secções:             ${r.seccoes.length} — ${r.seccoes.join(" · ")}`);
    for (const c of r.zonasCapa) {
      console.log(`  ${c.rotulo} vazia: ${c.altura}px (topo ${c.topo}, esquerda ${c.esquerda})`);
    }
    console.log(
      `  já preenchidos:    ${r.preenchidos.length} — ${r.preenchidos.map((x) => x.campo).join(", ")}`,
    );
    console.log(`  por preencher:     ${r.vazios.length} — ${r.vazios.join(", ")}`);
    if (r.nomeRepetido) {
      console.log(
        `  nome "${r.nomeRepetido.nome}" também em: ${JSON.stringify(r.nomeRepetido.tambemEm)}`,
      );
    }
    if (r.cores) {
      const c = r.cores;
      console.log(`\n  CORES (regras em DESIGN-TOKENS.md):`);
      console.log(`  etiqueta:            ${c.amostraEtiqueta}`);
      console.log(`  título de secção:    ${c.amostraTitulo}`);
      console.log(`  etiquetas não neutras: ${c.etiquetasNaoNeutras.length}`);
      for (const e of c.etiquetasNaoNeutras.slice(0, 5)) console.log(`    · "${e.texto}" ${e.cor}`);
      console.log(`  etiquetas em serifa:   ${c.etiquetasEmSerifa.length}`);
      console.log(`  títulos sem serifa:    ${c.titulosSemSerifa.length}`);
      console.log(
        `  botões verdes à vista: ${c.botoesVerdes.length} — ${c.botoesVerdes.join(" · ")}`,
      );
    }
    if (r.trabalho) {
      console.log(`\n  PROPOSTA COMPLETA (a da Catarina Martins):`);
      console.log(`  cliques em botões:  ${r.trabalho.cliques}`);
      console.log(`  campos escritos:    ${r.trabalho.escritos}   (sem contar as fotos)`);
    }
  }
  if (CAPTURAS) console.log(`\ncapturas em ${PASTA}`);
}
