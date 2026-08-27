// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ANALÍTICOS DE TERCEIROS NÃO ENTRAM NO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `analytics-token-leak.test.tsx` guarda a outra metade desta regra: o token
 * do cliente não sai da rota. Este guarda a metade que faltava.
 *
 * O que estava: os quatro analíticos montados no `[lang]/layout.tsx` — o
 * Plausible, o Google tag, a captura de origem do pedido e os Web Vitals — só
 * se calavam nas rotas com token. No back office disparavam todos. O banner de
 * consentimento, esse, JÁ SABIA o que era o back office: tinha a regra escrita
 * à mão, num `pathname.includes(...)`, e em mais lado nenhum. Uma peça do
 * layout sabia, quatro não.
 *
 * ── AS TRÊS RAZÕES, POR ORDEM DE GRAVIDADE ────────────────────────────────
 *
 * 1. O gtag reporta o `page_location` de cada ecrã interno para a propriedade
 *    GA4/Ads. Quem tenha acesso a essa conta lê os caminhos de trabalho dela.
 *    E o consentimento não trava isto: com o consentimento NEGADO o gtag manda
 *    pings sem cookies na mesma — é o argumento que já estava escrito no
 *    `GoogleTag.tsx` para as rotas com token.
 * 2. As horas dela a trabalhar contavam como tráfego do site. A taxa de
 *    conversão que o próprio painel mostra é calculada por cima disso.
 * 3. `gtag.js` mais `plausible.js` a competir com a hidratação do back office,
 *    no telemóvel dela, em 4G de quinta.
 *
 * ── A FRONTEIRA QUE NÃO PODE MOVER-SE ─────────────────────────────────────
 *
 * `/orcamento` SECO é o formulário público de pedido de orçamento — a página
 * de conversão do site. Se a guarda apanhasse `/orcamento`, apagava a medição
 * do funil inteiro sem ninguém dar por isso: o número não desaparece, encolhe.
 * Metade dos casos aqui em baixo são sobre isso e não sobre o back office.
 */

/**
 * Um segmento-token qualquer, e DE PROPÓSITO sem parecer um token a sério.
 *
 * A primeira versão deste ficheiro copiou o JWT falso do
 * `analytics-token-leak.test.tsx` e o `gitleaks` do CI reprovou-a: entropia
 * 5,34, regra `generic-api-key`. Tinha razão em reprovar — uma cadeia daquelas
 * num ficheiro novo é indistinguível de um segredo a sério, e o dia em que
 * alguém a puser na lista de excepções é o dia em que a rede deixa de servir.
 *
 * E não faz falta nenhuma: a regra é `/(portal|proposta)/[^/?#]+`, portanto
 * qualquer segmento não vazio serve. O que este ficheiro guarda é a fronteira
 * do BACK OFFICE; a forma do token é do ficheiro ao lado, que já a mede.
 */
const SEGMENTO_TOKEN = "token-de-teste";

/** Onde os analíticos NÃO podem existir. */
const CALADOS = [
  "/orcamento/admin",
  "/pt/orcamento/admin",
  "/en/orcamento/admin",
  "/pt/orcamento/admin/carregamento/LIQ-M1A2B3",
  "/pt/orcamento/admin?v=pedidos",
];

/** Onde TÊM de continuar a existir. O `/orcamento` seco é o mais importante. */
const MEDIDOS = [
  "/orcamento",
  "/pt/orcamento",
  "/pt/orcamento/confirmacao/LIQ-M1A2B3",
  "/pt/galeria",
  "/",
];

const pathname = vi.hoisted(() => ({ value: "/galeria" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => <script data-testid="next-script" {...props} />,
}));

import GoogleTag from "./GoogleTag";
import Analytics from "./Analytics";
import ConsentBanner from "./ConsentBanner";
import { isBackOfficeRoute, semAnaliticos, BACK_OFFICE_PATH_PATTERN } from "@/lib/safe-path";

describe("a fronteira do back office", () => {
  it("apanha o back office e tudo por baixo dele", () => {
    for (const p of CALADOS) {
      expect(isBackOfficeRoute(p), `${p} devia contar como back office`).toBe(true);
    }
  });

  it("NÃO apanha o formulário público de orçamento — a página de conversão", () => {
    for (const p of MEDIDOS) {
      expect(isBackOfficeRoute(p), `${p} não é back office`).toBe(false);
    }
  });

  it("NÃO apanha um caminho que só COMECE por «admin»", () => {
    // Sem o limite `(?:[/?#]|$)`, uma rota futura chamada
    // `/orcamento/administrativo` calava-se calada.
    expect(isBackOfficeRoute("/pt/orcamento/administrativo")).toBe(false);
    expect(isBackOfficeRoute("/pt/orcamento/admin-publico")).toBe(false);
  });

  it("`semAnaliticos` continua a cobrir as rotas com token", () => {
    // A regra antiga não pode partir-se ao acrescentar a nova.
    expect(semAnaliticos(`/portal/${SEGMENTO_TOKEN}`)).toBe(true);
    expect(semAnaliticos(`/en/proposta/${SEGMENTO_TOKEN}`)).toBe(true);
    expect(semAnaliticos("/pt/orcamento/admin")).toBe(true);
    expect(semAnaliticos("/pt/orcamento")).toBe(false);
  });

  it("o padrão é interpolável numa string de JS, como o dos tokens", () => {
    expect(BACK_OFFICE_PATH_PATTERN).not.toMatch(/['"\\]/);
  });
});

describe("GoogleTag — nada de gtag dentro do back office", () => {
  beforeEach(() => {
    pathname.value = "/galeria";
  });

  it("não renderiza NADA em nenhuma rota do back office", () => {
    for (const p of CALADOS) {
      pathname.value = p;
      const { container } = render(<GoogleTag />);
      expect(container.innerHTML, `o gtag montou em ${p}`).toBe("");
    }
  });

  it("continua montado no formulário público de orçamento", () => {
    // O controlo positivo que impede este ficheiro de passar por o gtag não
    // montar em lado nenhum — e a fronteira que interessa mesmo.
    for (const p of MEDIDOS) {
      pathname.value = p;
      const { container } = render(<GoogleTag />);
      expect(container.innerHTML, `o gtag deixou de medir ${p}`).toContain(
        "googletagmanager.com/gtag/js",
      );
    }
  });
});

describe("Analytics (Plausible) — nada de plausible dentro do back office", () => {
  const OLD = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = "liquen-events.com";
    pathname.value = "/galeria";
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
    else process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = OLD;
  });

  it("não renderiza NADA em nenhuma rota do back office", () => {
    for (const p of CALADOS) {
      pathname.value = p;
      const { container } = render(<Analytics />);
      expect(container.innerHTML, `o Plausible montou em ${p}`).toBe("");
    }
  });

  it("continua montado no formulário público de orçamento", () => {
    for (const p of MEDIDOS) {
      pathname.value = p;
      const { container } = render(<Analytics />);
      expect(container.innerHTML, `o Plausible deixou de medir ${p}`).toContain("plausible");
    }
  });
});

describe("LeadSourceCapture — a origem do pedido não é contaminada por ela", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  /**
   * Corre o componente num dado caminho e devolve o que ficou guardado.
   *
   * O caminho vai aos DOIS sítios: o `usePathname` fingido é o que a guarda lê,
   * e o `location.search`/`location.pathname` é o que a captura escreve. A
   * lição está escrita no ficheiro ao lado — mexer só num deixa a guarda a ver
   * o caminho do teste anterior.
   */
  async function guardado(path: string): Promise<string[]> {
    pathname.value = path;
    window.history.replaceState({}, "", `${path}${path.includes("?") ? "&" : "?"}utm_source=meta`);
    const { default: LeadSourceCapture } = await import("./LeadSourceCapture");
    render(<LeadSourceCapture />);
    await new Promise((r) => setTimeout(r, 0));
    return [
      ...Object.keys(window.sessionStorage).map((k) => window.sessionStorage.getItem(k) || ""),
      ...Object.keys(window.localStorage).map((k) => window.localStorage.getItem(k) || ""),
    ];
  }

  it("não grava primeiro-toque nenhum a partir do back office", async () => {
    // Sem isto, ela abrir a sua própria ferramenta gravava
    // «/pt/orcamento/admin» como origem da sessão — e a pergunta «de onde vêm
    // os pedidos» passava a ter, na resposta, um caminho interno.
    const escrito = await guardado("/pt/orcamento/admin");
    expect(escrito, "escreveu-se atribuição a partir do back office").toEqual([]);
  });

  it("continua a capturar no formulário público de orçamento", async () => {
    const escrito = await guardado("/pt/orcamento");
    expect(escrito.join(" "), "deixou de capturar a origem do pedido").toContain("meta");
  });
});

describe("WebVitals — o desempenho do site não se mede com as horas dela", () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function balizas(path: string): Promise<string[]> {
    pathname.value = path;
    window.history.replaceState({}, "", path);
    vi.doMock("web-vitals", () => {
      const fire = (cb: (m: { name: string; value: number; rating: string }) => void) =>
        cb({ name: "LCP", value: 1234, rating: "good" });
      return { onLCP: fire, onCLS: fire, onINP: fire, onTTFB: fire, onFCP: fire };
    });
    const { default: WebVitals } = await import("./WebVitals");
    render(<WebVitals />);
    await new Promise((r) => setTimeout(r, 0));
    return beacon.mock.calls.map((c) => String(c[1]));
  }

  it("não manda baliza nenhuma a partir do back office", async () => {
    // Aqui a telemetria não sai de casa — vai para o nosso `/api` —, portanto
    // não é fuga; é ruído. As médias de desempenho servem para vigiar o site
    // público, e um ecrã de administração não corresponde a visita nenhuma.
    expect(await balizas("/pt/orcamento/admin/carregamento/LIQ-M1A2B3")).toEqual([]);
  });

  it("continua a medir o formulário público de orçamento", async () => {
    const corpos = await balizas("/pt/orcamento");
    expect(corpos.length, "deixou de medir a página de conversão").toBeGreaterThan(0);
    expect(corpos[0]).toContain("/pt/orcamento");
  });
});

describe("ConsentBanner — a regra deixou de estar escrita à mão", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pathname.value = "/galeria";
  });

  it("continua fora do back office", () => {
    pathname.value = "/pt/orcamento/admin";
    const { container } = render(<ConsentBanner locale="pt" />);
    expect(container.innerHTML).toBe("");
  });

  it("continua a aparecer no site público", () => {
    const { container } = render(<ConsentBanner locale="pt" />);
    expect(container.innerHTML).not.toBe("");
  });
});
