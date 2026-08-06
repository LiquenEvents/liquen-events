import { expect, type Locator, type Page, type Request, type TestInfo } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O HARNESS DA CAÇA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os testes desta pasta não verificam funcionalidades: usam o back office como
 * uma pessoa o usaria e tentam parti-lo. O que os torna úteis não é a asserção
 * final — é o que este ficheiro recolhe pelo caminho e as guardas que qualquer
 * percurso pode aplicar a qualquer ecrã.
 *
 * ── UM ERRO DE CONSOLA É UM BUG ────────────────────────────────────────────
 * Mesmo quando nada partiu no ecrã. Um `key` em falta hoje é uma linha que
 * salta amanhã; um `setState` num componente desmontado é uma gravação que se
 * perde. Por isso a recolha é ligada em TODOS os percursos e verificada no fim.
 *
 * ── O QUE SE IGNORA, E PORQUÊ ──────────────────────────────────────────────
 * Só ruído do AMBIENTE: o proxy da rede onde isto corre, os avisos de
 * desenvolvimento do React DevTools, e o 404 do favicon. Nada da aplicação.
 * A lista é curta de propósito — cada entrada é um sítio onde um defeito real
 * se pode esconder.
 */

const RUIDO_DE_AMBIENTE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  // A rede desta máquina passa por um proxy; recursos de terceiros não
  // resolvem. É condição do ambiente, não defeito da aplicação.
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_|BLOCKED_BY_CLIENT)/i,
  /Failed to load resource: net::ERR_/i,
];

const ehRuido = (t: string) => RUIDO_DE_AMBIENTE.some((re) => re.test(t));

export interface Recolha {
  /** Erros de consola e excepções não apanhadas. */
  erros: string[];
  /** Avisos do React que denunciam defeitos (keys, hydration, unmounted). */
  avisos: string[];
  /** Pedidos que falharam ou responderam 5xx/4xx inesperado. */
  pedidosFalhados: string[];
  /** Todos os pedidos à API, para detectar duplicados e cascatas. */
  pedidosApi: { url: string; metodo: string; em: number }[];
}

/**
 * Liga as escutas. Chamar SEMPRE antes do primeiro `goto`, senão perdem-se os
 * erros do arranque — que são precisamente os piores.
 */
export function escutar(page: Page): Recolha {
  const r: Recolha = { erros: [], avisos: [], pedidosFalhados: [], pedidosApi: [] };

  page.on("console", (msg) => {
    const texto = msg.text();
    if (ehRuido(texto)) return;
    if (msg.type() === "error") r.erros.push(`console.error: ${texto}`);
    // Os avisos do React que interessam têm nome próprio. Um aviso genérico do
    // browser não entra: encheria a lista e ensinava a ignorá-la.
    else if (
      msg.type() === "warning" &&
      /unique "key"|hydrat|not wrapped in act|unmounted component|Maximum update depth|validateDOMNesting|controlled|uncontrolled/i.test(
        texto,
      )
    ) {
      r.avisos.push(`console.warn: ${texto}`);
    }
  });

  page.on("pageerror", (err) => {
    if (!ehRuido(err.message)) r.erros.push(`pageerror: ${err.message}`);
  });

  page.on("requestfailed", (req: Request) => {
    const motivo = req.failure()?.errorText ?? "";
    // `net::ERR_ABORTED` é o que um pedido cancelado dá — e cancelar é o que os
    // nossos efeitos fazem de propósito ao desmontar. Não é falha.
    if (ehRuido(motivo) || /ERR_ABORTED/i.test(motivo)) return;
    r.pedidosFalhados.push(`${req.method()} ${req.url()} — ${motivo}`);
  });

  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    if (res.status() >= 500)
      r.pedidosFalhados.push(`${res.status()} ${res.request().method()} ${url}`);
  });

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/")) r.pedidosApi.push({ url, metodo: req.method(), em: Date.now() });
  });

  return r;
}

/** Falha o teste com tudo o que a recolha juntou. Uma linha por achado. */
export function exigirSilencio(r: Recolha, onde: string) {
  const tudo = [...r.erros, ...r.avisos, ...r.pedidosFalhados];
  expect(tudo, `Ruído de runtime em ${onde}:\n${tudo.join("\n")}`).toEqual([]);
}

/**
 * Entra no back office com as credenciais de desenvolvimento.
 *
 * Devolve `false` — em vez de falhar — quando o login não existe neste
 * ambiente (build de produção sem ADMIN_PASSWORD_HASH). Quem chama decide se
 * salta ou se falha; um percurso que precisa de sessão deve saltar, para o
 * relatório não encher de falsos positivos do ambiente.
 */
export async function entrar(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  const titulo = page.getByRole("heading", { name: /Painel de Gestão/i });
  if (!(await titulo.isVisible().catch(() => false))) {
    // Já autenticado (sessão reaproveitada) — o painel abre directo.
    return await page
      .getByRole("navigation", { name: /Navegação do back office/i })
      .isVisible()
      .catch(() => false);
  }
  await page.getByLabel(/O teu nome/i).fill("Catarina");
  await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  return await page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .isVisible({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Vai para uma vista do back office.
 *
 * Em desktop a barra lateral está sempre lá. Em telemóvel ela EXISTE no DOM mas
 * vive fora do ecrã até alguém abrir a gaveta — e clicar num botão fora do
 * viewport é exactamente o que o Playwright recusa fazer. Por isso este
 * ajudante abre a gaveta primeiro quando o ecrã é estreito.
 *
 * (Que os botões da gaveta fechada continuem alcançáveis por teclado é, esse
 * sim, um achado — está registado no percurso do foco, não aqui.)
 */
export async function irPara(page: Page, rotulo: RegExp) {
  const largura = page.viewportSize()?.width ?? 1440;
  const nav = page.getByRole("navigation", { name: /Navegação do back office/i });

  // Em telemóvel os três destinos do núcleo também vivem na barra de baixo, que
  // está sempre à vista. É o caminho mais curto e o que uma pessoa usaria.
  if (largura < 1024) {
    // A barra de baixo é a `nav` que tem o "Mais destinos". Procura-se pelo
    // CONTEÚDO e não pelas classes do Tailwind: um selector de classes
    // parte-se na próxima vez que alguém lhes mexer.
    const barra = page
      .getByRole("navigation")
      .filter({ has: page.getByRole("button", { name: /^Mais destinos$/i }) })
      .first();
    const atalho = barra.getByRole("button", { name: rotulo });
    if (
      (await atalho.count()) > 0 &&
      (await atalho
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await atalho.first().click({ timeout: 4000 });
      await page.waitForTimeout(300);
      return;
    }
  }

  /**
   * Espera até o botão estar DENTRO do ecrã, abrindo a gaveta entre tentativas.
   *
   * Duas armadilhas, ambas pagas em tempo perdido:
   *  · `isVisible()` devolve TRUE com a gaveta fechada — a barra lateral está
   *    lá, apenas deslocada por `translate`. Quem decide é a POSIÇÃO.
   *  · a gaveta e o botão que a abre montam em alturas diferentes, por isso
   *    uma tentativa única falha conforme o dia. Daí o ciclo.
   */
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const alvo = nav.getByRole("button", { name: rotulo }).first();
    if ((await alvo.count()) > 0) {
      const dentro = await alvo
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.right > 0 && r.left < window.innerWidth && r.width > 0;
        })
        .catch(() => false);
      if (dentro) {
        await alvo.click();
        if (largura < 1024) await page.waitForTimeout(350);
        return;
      }
    }

    if (largura < 1024) {
      const abrir = page.getByRole("button", { name: /^Abrir menu$/i }).first();
      if ((await abrir.count()) > 0 && (await abrir.isVisible().catch(() => false))) {
        await abrir.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
    }
    // Os destinos fora do núcleo vivem debaixo de "Mais".
    const mais = nav.getByRole("button", { name: /^Mais$/i }).first();
    if ((await mais.count()) > 0) {
      await mais.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(250);
  }

  throw new Error(`Não consegui chegar à vista ${rotulo} em ${largura}px`);
}

// ── As guardas ────────────────────────────────────────────────────────────
// Cada uma responde a uma pergunta que se faz em TODOS os ecrãs, e devolve os
// casos em vez de falhar: assim um percurso pode juntá-los todos e reportar de
// uma vez, em vez de parar no primeiro.

/**
 * A página faz scroll na horizontal?
 *
 * A 375px é o defeito mais frequente e o mais irritante: a página abana ao
 * scroll vertical e o conteúdo da direita fica inalcançável. Mede-se no
 * documento, não numa caixa, porque o culpado costuma ser um filho qualquer.
 */
export async function overflowHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.documentElement;
    return Math.max(0, d.scrollWidth - d.clientWidth);
  });
}

/** Quem é o culpado do overflow — para o relatório poder dizer ficheiro:linha. */
export async function culpadosDoOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    const fora: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > largura + 1) {
        const cls = (el.className || "").toString().slice(0, 120);
        fora.push(
          `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} .${cls} → right=${Math.round(r.right)} > ${largura}`,
        );
      }
      if (fora.length >= 8) break;
    }
    return fora;
  });
}

export interface AlvoPequeno {
  descricao: string;
  largura: number;
  altura: number;
}

/**
 * Botões e links abaixo de 44×44, que é o mínimo para um dedo.
 *
 * Só conta o que está VISÍVEL e dentro do ecrã: um elemento escondido atrás de
 * uma gaveta fechada mede zero e não é um alvo de nada. E ignora-se o que
 * estiver dentro de um `[hidden]` — o estúdio mantém os passos montados.
 */
export async function alvosPequenos(page: Page, minimo = 44): Promise<AlvoPequeno[]> {
  // A regra dos 44px é de TOQUE. Num ecrã com rato, um botão de 30px acerta-se
  // ao pixel e exigir 44 encheria o relatório de queixas que não correspondem a
  // dificuldade nenhuma — e um relatório assim deixa de se ler. Mede-se onde a
  // regra vale: nos aparelhos com dedo.
  const temToque = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  if (!temToque) return [];

  return page.evaluate((min) => {
    const out: { descricao: string; largura: number; altura: number }[] = [];
    const seletor = 'button, a[href], [role="button"], input[type="checkbox"], input[type="radio"]';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(seletor))) {
      if (el.closest("[hidden]")) continue;
      const estilo = getComputedStyle(el);
      if (estilo.display === "none" || estilo.visibility === "hidden") continue;
      // Um link de saltar para o conteúdo é 1×1 DE PROPÓSITO: só ganha corpo
      // quando recebe foco, e nunca é tocado com o dedo. Contá-lo era ensinar
      // a ignorar a lista.
      if (estilo.clipPath === "inset(50%)" || estilo.clip === "rect(0px, 0px, 0px, 0px)") continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      // O alvo real pode ser maior do que a caixa por causa de padding do pai
      // (um ícone de 12px dentro de um botão de 44px está bem). Mede-se o
      // elemento clicável em si, que é o que recebe o toque.
      if (r.width < min || r.height < min) {
        const nome =
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          (el.textContent || "").trim().slice(0, 40) ||
          el.className.toString().slice(0, 40);
        out.push({
          descricao: `${el.tagName.toLowerCase()} «${nome}»`,
          largura: Math.round(r.width),
          altura: Math.round(r.height),
        });
      }
    }
    return out;
  }, minimo);
}

/**
 * Campos com letra abaixo de 16px.
 *
 * No iOS, focar um input com font-size < 16px faz o Safari dar zoom — e o zoom
 * não se desfaz sozinho. A pessoa fica com o ecrã ampliado a meio de preencher
 * uma proposta, e a única saída é fazer pinch para trás.
 */
export async function inputsComLetraPequena(page: Page): Promise<string[]> {
  // Só onde o zoom existe. O `globals.css` já força 16px dentro de
  // `@media (pointer: coarse)`; medir com rato acusava 12–14px em ecrãs onde
  // nenhum browser amplia nada — trinta queixas por relatório, todas falsas.
  const temToque = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  if (!temToque) return [];

  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("input, select, textarea"),
    )) {
      if (el.closest("[hidden]")) continue;
      const estilo = getComputedStyle(el);
      if (estilo.display === "none" || estilo.visibility === "hidden") continue;
      if ((el as HTMLInputElement).type === "hidden") continue;
      const px = parseFloat(estilo.fontSize);
      if (px && px < 16) {
        const nome =
          el.getAttribute("aria-label") ||
          el.getAttribute("placeholder") ||
          el.getAttribute("name") ||
          el.className.toString().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} «${nome}» → ${px}px`);
      }
    }
    return out;
  });
}

/** Guarda-chuva: corre as guardas todas e devolve um relatório legível. */
export async function auditar(page: Page, onde: string) {
  const [overflow, culpados, alvos, inputs] = await Promise.all([
    overflowHorizontal(page),
    culpadosDoOverflow(page),
    alvosPequenos(page),
    inputsComLetraPequena(page),
  ]);
  return { onde, overflow, culpados, alvos, inputs };
}

/** Anexa uma captura ao relatório, com nome estável para o BUGS.md a citar. */
export async function provar(page: Page, info: TestInfo, nome: string) {
  const buf = await page.screenshot({ fullPage: false });
  await info.attach(nome, { body: buf, contentType: "image/png" });
}

/** Espera que a lista de pedidos assente — melhor do que um sleep arbitrário. */
export async function assentar(page: Page, ms = 400) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** Conta quantas vezes um caminho de API foi pedido — para achar duplicados. */
export function vezesPedido(r: Recolha, fragmento: string, metodo?: string): number {
  return r.pedidosApi.filter((p) => p.url.includes(fragmento) && (!metodo || p.metodo === metodo))
    .length;
}

/** Clica duas vezes seguidas, sem esperar pela primeira — o teste da duplicação. */
export async function cliqueDuplo(alvo: Locator) {
  await Promise.all([alvo.click({ force: true }), alvo.click({ force: true })]).catch(() => {
    // Um dos dois pode falhar se o botão desaparecer entre eles — e isso é o
    // comportamento CORRECTO. O que interessa é o efeito, medido a seguir.
  });
}
