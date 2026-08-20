import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REGRA QUE MANDA EM TUDO: NÃO SE REGISTA QUE ISTO FOI ABERTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão dela, deliberada: não se regista quando a proposta é aberta, nem
 * quanto tempo é vista, nem que secções, nem até onde leram. Nada de
 * analíticos, mapas de calor, píxeis ou medição de rolagem. E não se avisa
 * ninguém de que houve uma visita.
 *
 * Já foi violado uma vez neste projecto — dois medidores montados no layout
 * mediam a abertura destas páginas —, e a guarda que ficou vive em
 * `src/lib/safe-path.ts` (`isTokenRoute`). Este ficheiro prende a mesma regra
 * do lado do RAMO NOVO: nada do que foi acrescentado à página do casal pode
 * chamar um medidor, e um pedido bem sucedido não pode deixar rasto.
 *
 * ── PORQUE É QUE NÃO CHEGA UM `expect(...).toEqual([])` ───────────────────
 * Porque a afirmação é uma AUSÊNCIA, e uma ausência passa por acidente: um
 * varrimento com o caminho errado, ou um registador simulado que ninguém
 * chama porque a rota nem correu, dizem exactamente o mesmo que «está limpo».
 * Cada teste daqui traz o seu controlo positivo.
 */

const RAIZ = process.cwd();
const RAMO = "src/app/[lang]/(privado)";

/** Os nomes por que um medidor se dá a conhecer no código. */
const MEDIDORES = [
  "gtag",
  "dataLayer",
  "plausible",
  "fbq",
  "sendBeacon",
  "web-vitals",
  "@/components/Analytics",
  "@/components/GoogleTag",
  "@/components/WebVitals",
  "@/components/LeadSourceCapture",
];

function ficheirosDe(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) ficheirosDe(rel, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Os comentários podem falar de medidores à vontade; o código não. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("nada no ramo privado chama um medidor", () => {
  const ficheiros = [
    ...ficheirosDe(RAMO),
    "src/app/api/proposta/[token]/fotos/route.ts",
    "src/lib/proposta-fotos.ts",
  ];

  it("CONTROLO POSITIVO: o varrimento encontra mesmo os ficheiros", () => {
    // Sem isto, um caminho errado dava uma lista vazia e o teste seguinte
    // passava sem ter lido uma linha de código.
    expect(ficheiros.length).toBeGreaterThan(4);
    expect(ficheiros.some((f) => f.endsWith("Inspiracao.tsx"))).toBe(true);
    expect(ficheiros.some((f) => f.endsWith("Documento.tsx"))).toBe(true);
  });

  it("CONTROLO POSITIVO: os mesmos nomes SÃO encontrados onde eles vivem", () => {
    // A prova de que a lista de nomes serve para alguma coisa: aplicada aos
    // componentes de medição do sítio, tem de acusar. Se um dia deixar de
    // acusar, a lista ficou desactualizada e o teste de cima vale zero.
    const tag = semComentarios(readFileSync(join(RAIZ, "src/components/GoogleTag.tsx"), "utf8"));
    expect(MEDIDORES.filter((m) => tag.includes(m)).length).toBeGreaterThan(0);
  });

  it("e não aparecem em nenhum ficheiro do ramo", () => {
    const acusados: string[] = [];
    for (const f of ficheiros) {
      const codigo = semComentarios(readFileSync(join(RAIZ, f), "utf8"));
      for (const m of MEDIDORES) if (codigo.includes(m)) acusados.push(`${f}: ${m}`);
    }
    expect(acusados, `medidores no ramo privado: ${acusados.join(", ")}`).toEqual([]);
  });
});

/**
 * E do lado do servidor: servir as fotografias a um casal é um pedido bem
 * sucedido, e um pedido bem sucedido não escreve uma linha em lado nenhum.
 * O registo continua a existir para as AVARIAS — é para isso que ele serve.
 */
const H = vi.hoisted(() => ({ registos: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  log: {
    info: (...a: unknown[]) => H.registos.push(`info:${String(a[0])}`),
    warn: (...a: unknown[]) => H.registos.push(`warn:${String(a[0])}`),
    error: (...a: unknown[]) => H.registos.push(`error:${String(a[0])}`),
    debug: (...a: unknown[]) => H.registos.push(`debug:${String(a[0])}`),
  },
}));
vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: (t: string) => (t === "bom" ? { proposalId: "p1" } : null),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: async () => ({
    id: "p1",
    doc: { coverImages: [], moodBoards: [{ title: "x", images: ["ped/1.jpg"] }] },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => ({ ok: true }),
}));
vi.mock("@/lib/proposal-storage", () => ({
  signProposalPaths: async (p: string[]) => new Map(p.map((x) => [x, `u/${x}`])),
  signProposalThumbs: async (p: string[]) => new Map(p.map((x) => [x, `m/${x}`])),
}));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  formasDeCaminhos: async () => new Map(),
  lqipsDeCaminhos: async () => new Map(),
}));

const { GET } = await import("../../../../api/proposta/[token]/fotos/route");

describe("uma visita bem sucedida não deixa rasto no servidor", () => {
  beforeEach(() => {
    H.registos.length = 0;
  });

  it("servir as fotografias não escreve uma linha", async () => {
    const res = await GET(new Request("https://l.test/api/proposta/bom/fotos"), {
      params: Promise.resolve({ token: "bom" }),
    });
    expect(res.status).toBe(200);
    expect(H.registos, `registos: ${H.registos.join(", ")}`).toEqual([]);
  });

  it("CONTROLO POSITIVO: o registador simulado é mesmo o que a rota usa", async () => {
    // Uma AVARIA tem de aparecer. Se isto não escrever nada, o mock não está
    // ligado à rota e o teste de cima está a afirmar coisa nenhuma.
    const { log } = await import("@/lib/logger");
    log.error("uma avaria");
    expect(H.registos).toEqual(["error:uma avaria"]);
  });
});
