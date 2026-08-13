/**
 * Ferramentas partilhadas da rede de segurança das imagens (ver imagens.spec.ts).
 *
 * Este ficheiro NÃO é um teste (não casa com o `testMatch` do Playwright,
 * `**\/*.spec.ts`), é só a mecânica: descobrir as páginas, varrer uma página até
 * ao fim e dizer, com nomes, quais as imagens que não pintaram.
 */
import type { Page } from "@playwright/test";
import sitemap from "@/app/sitemap";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Descobrir as páginas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As páginas públicas do sítio, tiradas do PRÓPRIO sitemap (src/app/sitemap.ts).
 *
 * PORQUÊ O SITEMAP E NÃO UMA LISTA À MÃO. Uma lista à mão foi exactamente como
 * isto escapou: escreve-se uma vez, acrescenta-se uma página e ninguém se lembra
 * de a acrescentar também ao teste. O sitemap é gerado a partir das mesmas
 * fontes que geram as páginas (SERVICES em src/lib/services-data.ts, mais as
 * rotas fixas) e já está obrigado a ficar completo por outra razão — se lá
 * faltar uma página, o Google também não a vê. Uma página nova entra no teste
 * sem ninguém tocar no teste; é a propriedade que aqui interessa.
 *
 * PORQUÊ NÃO RASTREAR AS LIGAÇÕES. O rastreio encontraria o mesmo conjunto mais
 * devagar (é preciso carregar cada página para descobrir a seguinte, em série),
 * e encontraria conjuntos DIFERENTES conforme o que estivesse ligado nesse dia —
 * a galeria, por exemplo, muda de arrumação a cada build. Um teste que não sabe
 * de antemão quantos casos vai correr não dá para paralelizar nem dá um
 * relatório estável no CI. O sitemap é síncrono, determinista e completo.
 *
 * Importa-se o módulo em vez de se pedir /sitemap.xml ao servidor porque a lista
 * tem de existir no momento em que o Playwright RECOLHE os testes (que é
 * síncrono) — é o que permite um caso de teste por página em vez de um único
 * caso gigante que pára na primeira falha.
 */
export function paginasPublicas(): string[] {
  const caminhos = new Set<string>();
  for (const entrada of sitemap()) {
    const { pathname } = new URL(entrada.url);
    caminhos.add(pathname === "" ? "/" : pathname);
  }
  return [...caminhos].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Colher as imagens partidas
// ─────────────────────────────────────────────────────────────────────────────

/** Uma imagem que não chegou a pintar, com o suficiente para se ir lá ver. */
export interface ImagemEmFalta {
  /** O URL que o browser pediu mesmo (currentSrc) — o candidato do srcset. */
  url: string;
  alt: string;
  /** Onde vive no DOM (marco mais próximo), para se encontrar depressa. */
  onde: string;
  estado: "não pintou" | "não terminou de carregar" | "sem src";
}

interface ArgColheita {
  /** Até que Y do documento é que já se passou (o resto ainda não foi visto). */
  alcance: number;
  /** Selector da raiz a inspecionar; null = a página toda. */
  raiz: string | null;
}

/**
 * Corre DENTRO do browser. Devolve as imagens que ainda não estão pintadas.
 *
 * `naturalWidth > 0` é a única prova de que uma imagem pintou: um <img> com o
 * src partido fica com `complete === true` e `naturalWidth === 0`, e é
 * indistinguível de uma imagem boa por qualquer outro atributo do DOM (o `src`
 * continua lá, o elemento continua "visível", o Playwright continua a dizer
 * `toBeVisible`). É por isso que os testes que este repositório já tinha
 * deixavam passar imagens partidas.
 *
 * As que ainda não terminaram vêm na lista com o estado "não terminou de
 * carregar" — assim quem chama continua a esperar (a lista só fica vazia quando
 * está tudo pintado) e, se nunca terminarem, aparecem no relatório em vez de
 * desaparecerem em silêncio.
 */
function colher({ alcance, raiz }: ArgColheita): ImagemEmFalta[] {
  const raizEl: Document | Element | null = raiz ? document.querySelector(raiz) : document;
  if (!raizEl) {
    return [{ url: raiz ?? "?", alt: "", onde: "—", estado: "sem src" }];
  }

  // O marco mais próximo (secção, diálogo, cabeçalho, …) mais o seu rótulo, que
  // é o que permite dizer "a miniatura do menu" em vez de "uma imagem qualquer".
  const ondeFica = (img: HTMLImageElement): string => {
    const marco = img.closest(
      '[role="dialog"],header,nav,footer,main,section,article,[aria-label],[id]',
    );
    if (!marco) return "documento";
    const rotulo =
      marco.getAttribute("aria-label") ||
      marco.getAttribute("id") ||
      marco.getAttribute("role") ||
      "";
    return rotulo ? `${marco.tagName.toLowerCase()}[${rotulo}]` : marco.tagName.toLowerCase();
  };

  const emFalta: ImagemEmFalta[] = [];
  const scrollY = window.scrollY;

  for (const img of Array.from(raizEl.querySelectorAll("img"))) {
    // NÃO RENDERIZADA = NÃO JULGADA. Uma imagem dentro de um antepassado com
    // `display:none` não tem caixa nenhuma, e o `loading="lazy"` do browser
    // nunca a chega a pedir — fica eternamente `complete === false`. Não é uma
    // imagem partida: é uma imagem que ninguém vê (o rodapé escondido na página
    // de orçamento, a coluna `hidden lg:block` em telemóvel). Julgá-la seria
    // inventar falhas que nenhum visitante tem, e um teste que grita sem razão
    // é um teste que se desliga.
    if (img.getClientRects().length === 0) continue;

    // Sem raiz explícita, só se julgam as imagens que já estiveram no ecrã: o
    // que está para lá do alcance ainda não foi pedido por decisão do browser
    // (loading="lazy"), não por estar partido.
    if (raiz === null) {
      const caixa = img.getBoundingClientRect();
      if (caixa.top + scrollY > alcance) continue;
    }

    if (img.naturalWidth > 0) continue;

    // O BROWSER NUNCA A PEDIU. `currentSrc` só é preenchido quando o pedido
    // arranca; vazio + por terminar significa que o `loading="lazy"` decidiu não
    // a ir buscar, tipicamente por ela viver fora do ecrã na horizontal (as
    // cópias do carrossel de logótipos dos clientes chegam a x=4826 num ecrã de
    // 1280). Uma imagem que ninguém pediu não é uma imagem partida.
    if (!img.complete && img.currentSrc === "") continue;

    const url = (img.currentSrc || img.getAttribute("src") || "").replace(location.origin, "");
    const comum = { url: url || "(sem src)", alt: img.alt, onde: ondeFica(img) };

    if (!img.complete) {
      emFalta.push({ ...comum, estado: "não terminou de carregar" });
    } else if (!url) {
      emFalta.push({ ...comum, estado: "sem src" });
    } else {
      emFalta.push({ ...comum, estado: "não pintou" });
    }
  }
  return emFalta;
}

/** Quantas imagens há e quantas já terminaram — o "estado" por que se espera. */
function contar() {
  const imgs = Array.from(document.images);
  return { total: imgs.length, terminadas: imgs.filter((i) => i.complete).length };
}

/**
 * Espera até ALGUMA COISA mudar no conjunto das imagens: mais uma terminada
 * (load ou error), ou uma a entrar/sair do DOM (é o que o <GalleryImage> faz
 * quando re-tenta — desmonta e volta a montar).
 *
 * É esta a espera por ESTADO que substitui qualquer `waitForTimeout`. Devolve
 * assim que há progresso; se nada mudar dentro do orçamento, devolve na mesma e
 * quem chamou decide (é aí que a imagem partida deixa de ser "ainda a carregar"
 * e passa a ser uma falha).
 */
async function esperarProgresso(page: Page, orcamentoMs: number): Promise<void> {
  const antes = await page.evaluate(contar);
  await page
    .waitForFunction(
      (a) => {
        const imgs = Array.from(document.images);
        return imgs.length !== a.total || imgs.filter((i) => i.complete).length !== a.terminadas;
      },
      antes,
      { timeout: Math.max(250, orcamentoMs), polling: "raf" },
    )
    .catch(() => {});
}

/**
 * Espera que as imagens assentem e devolve as que ficaram por pintar.
 *
 * Sem tempos fixos: alterna entre colher e esperar por progresso, e só desiste
 * quando o orçamento acaba — devolvendo então a lista final, que é o relatório.
 */
export async function imagensEmFalta(
  page: Page,
  {
    alcance,
    raiz = null,
    orcamentoMs = 30_000,
  }: { alcance: number; raiz?: string | null; orcamentoMs?: number },
): Promise<ImagemEmFalta[]> {
  const limite = Date.now() + orcamentoMs;
  for (;;) {
    const falhas = await page.evaluate(colher, { alcance, raiz });
    if (falhas.length === 0) return [];
    const resta = limite - Date.now();
    if (resta <= 0) return falhas;
    await esperarProgresso(page, resta);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Varrer a página
// ─────────────────────────────────────────────────────────────────────────────

export interface Varrimento {
  /** Y do documento até onde se passou — o que é justo julgar. */
  alcance: number;
  /** Passos dados. */
  passos: number;
  /** Parou por ter batido no tecto (páginas longas, ex. a galeria). */
  cortado: boolean;
}

/**
 * Espera que a página PARE DE MEXER antes de a percorrer.
 *
 * Medido nesta galeria: no `domcontentloaded` o documento tem 14 972 px (o HTML
 * do servidor) e ~500 ms depois, já hidratado, passa a 4 139 px. Começar a
 * descer no meio dessa mudança fazia o varrimento perder-se — os passos eram
 * calculados sobre uma altura que deixou de existir. Espera-se pelo ESTADO
 * (altura igual durante uma dúzia de frames), não por um tempo fixo.
 */
async function esperarLayoutEstavel(page: Page, orcamentoMs = 15_000): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as { __alturaAnterior?: number; __framesQuietos?: number };
        const altura = document.documentElement.scrollHeight;
        if (w.__alturaAnterior === altura) w.__framesQuietos = (w.__framesQuietos ?? 0) + 1;
        else {
          w.__alturaAnterior = altura;
          w.__framesQuietos = 0;
        }
        return (w.__framesQuietos ?? 0) >= 12;
      },
      undefined,
      { timeout: orcamentoMs, polling: "raf" },
    )
    .catch(() => {});
}

/**
 * Percorre a página de cima a baixo, em passos de 80% do ecrã, esperando em cada
 * passo que as imagens da banda visível terminem. É isto que acorda o
 * `loading="lazy"`, os IntersectionObserver dos mosaicos e o scroll infinito da
 * galeria — sem isso, um teste só veria a primeira dobra.
 *
 * Devolve ao topo no fim, para que as imagens de posição fixa (o logótipo da
 * barra) fiquem dentro do alcance e para a colheita final ser feita sempre do
 * mesmo sítio.
 */
export async function varrerPagina(
  page: Page,
  {
    maxPassos = 40,
    orcamentoBandaMs = 2_500,
  }: { maxPassos?: number; orcamentoBandaMs?: number } = {},
): Promise<Varrimento> {
  let alcance = 0;
  let passos = 0;
  let cortado = false;

  await esperarLayoutEstavel(page);

  for (;;) {
    const medida = await page.evaluate(() => ({
      y: window.scrollY,
      altura: document.documentElement.scrollHeight,
      ecra: window.innerHeight,
    }));
    alcance = Math.max(alcance, medida.y + medida.ecra);

    const noFundo = medida.y + medida.ecra >= medida.altura - 2;
    if (noFundo) {
      // Scroll infinito: o fundo pode não ser o fim. Espera-se pelo ESTADO (o
      // documento a crescer ou mais imagens a entrar), não por um tempo fixo;
      // se nada crescer, chegou-se mesmo ao fim.
      const antes = {
        altura: medida.altura,
        imgs: await page.evaluate(() => document.images.length),
      };
      const cresceu = await page
        .waitForFunction(
          (a) =>
            document.documentElement.scrollHeight > a.altura || document.images.length > a.imgs,
          antes,
          { timeout: 1_500, polling: "raf" },
        )
        .then(() => true)
        .catch(() => false);
      if (!cresceu) break;
    }

    if (passos >= maxPassos) {
      cortado = true;
      break;
    }
    passos++;

    // `scrollTo` com destino ABSOLUTO e `behavior:"instant"`, nunca `scrollBy`.
    // O sítio declara `html { scroll-behavior: smooth }` (globals.css), portanto
    // cada scroll é uma ANIMAÇÃO: com `scrollBy` os 14 passos disparavam todos
    // uns milissegundos depois uns dos outros, cada um relativo a uma página que
    // ainda mal se tinha mexido, e o varrimento inteiro andava ~345 px em vez de
    // ~8 000 (medido: alcance 1065 px na galeria, ou seja quase nada). Com
    // destino absoluto + "instant" o salto é imediato e verificável.
    const alvo = medida.y + Math.round(medida.ecra * 0.8);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), alvo);
    await esperarChegadaAoAlvo(page, alvo);

    // Espera que a banda acabada de revelar assente antes de continuar a descer:
    // é o que impede um scroll rápido de saltar por cima de imagens sem as pedir.
    await esperarBandaAssente(page, orcamentoBandaMs);
  }

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page
    .waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5_000, polling: "raf" })
    .catch(() => {});
  return { alcance, passos, cortado };
}

/**
 * Espera que o scroll chegue onde foi mandado (ou ao fundo, se o destino ficar
 * para lá do fim do documento). Sem isto, um passo podia medir a banda errada.
 */
async function esperarChegadaAoAlvo(page: Page, alvo: number): Promise<void> {
  await page
    .waitForFunction(
      (y) =>
        Math.abs(window.scrollY - y) <= 2 ||
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
      alvo,
      { timeout: 5_000, polling: "raf" },
    )
    .catch(() => {});
}

/**
 * Espera que as imagens perto do ecrã (uma janela de ±1 ecrã) terminem. Não
 * falha por si: uma imagem que nunca termine é apanhada na colheita final, com
 * nome e URL — aqui só se evita descer por cima dela.
 */
async function esperarBandaAssente(page: Page, orcamentoMs: number): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const ecra = window.innerHeight;
        return Array.from(document.images).every((img) => {
          // Mesma regra da colheita: o que não tem caixa, ou está fora do ecrã
          // na horizontal (as cópias do carrossel de logótipos), nunca é pedido
          // pelo browser — esperar por ele seria esperar para sempre.
          if (img.getClientRects().length === 0) return true;
          const c = img.getBoundingClientRect();
          const pertoNaVertical = c.bottom > -ecra && c.top < ecra * 2;
          const dentroNaHorizontal = c.right > 0 && c.left < window.innerWidth;
          return !pertoNaVertical || !dentroNaHorizontal || img.complete;
        });
      },
      undefined,
      { timeout: orcamentoMs, polling: "raf" },
    )
    .catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Relatório
// ─────────────────────────────────────────────────────────────────────────────

/** Uma linha por imagem partida — é isto que se lê no CI quando fica vermelho. */
export function relatorio(falhas: ImagemEmFalta[]): string[] {
  return falhas.map((f) => `${f.estado} · ${f.url} · em ${f.onde} · alt="${f.alt}"`);
}
