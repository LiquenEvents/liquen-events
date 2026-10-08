import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAPA DO CARTÃO NO RESUMO — a cor do lugar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * T1 do `docs/PROPOSTAS-E-TEMAS-APPLE.md`: «nunca um cartão vazio». O cartão
 * pinta o lugar da capa com a cor dominante dela enquanto a fotografia não
 * chega — e a cor tem de vir NESTA resposta, como o borrão, para estar pintada
 * no primeiro fotograma.
 *
 * Ficheiro à parte do `route.test.ts` porque aqui a leitura das cores e dos
 * borrões é encenada; lá é a real (sem base de dados, devolve vazio).
 */
const st = vi.hoisted(() => ({
  themes: [] as ProposalTheme[],
  files: {} as Record<string, { names: string[]; ok: boolean; truncated: boolean }>,
  cores: new Map<string, string>(),
  lqips: new Map<string, string>(),
  falhaDaLeitura: false,
  sign: vi.fn(
    async (paths: string[]) => new Map(paths.map((p) => [p, `https://signed/${p}`] as const)),
  ),
  lerCores: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/themes-store", () => ({
  listThemes: vi.fn(async () => st.themes),
  createTheme: vi.fn(),
}));
vi.mock("@/lib/theme-storage", async () => {
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return {
    ...real,
    listThemeFiles: vi.fn(
      async (id: string) => st.files[id] ?? { names: [], ok: true, truncated: false },
    ),
    signThemePaths: st.sign,
  };
});
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  lqipsECoresDeCaminhos: st.lerCores,
}));
vi.mock("@/lib/invoices-store", () => ({ isUniqueViolation: () => false }));

import { GET } from "./route";

const req = () => new Request("https://liquen.test/api/temas") as unknown as NextRequest;

const theme = (id: string, over: Partial<ProposalTheme> = {}): ProposalTheme => ({
  id,
  name: id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const folder = (names: string[]) => ({ names, ok: true, truncated: false });

beforeEach(() => {
  st.themes = [];
  st.files = {};
  st.cores = new Map();
  st.lqips = new Map();
  st.falhaDaLeitura = false;
  vi.clearAllMocks();
  // O `clearAllMocks` não repõe implementações: um teste que ensine o
  // Storage a recusar um caminho não pode deixar isso para o seguinte.
  st.sign.mockImplementation(
    async (paths: string[]) => new Map(paths.map((p) => [p, `https://signed/${p}`] as const)),
  );
  st.lerCores.mockImplementation(async (paths: readonly string[]) => {
    if (st.falhaDaLeitura) throw new Error("base de dados em baixo");
    const pick = (m: Map<string, string>) =>
      new Map([...m].filter(([p]) => paths.includes(p)));
    return { lqips: pick(st.lqips), cores: pick(st.cores) };
  });
});

describe("GET /api/temas — a cor da capa", () => {
  it("traz a cor dominante da capa no resumo, ao lado do borrão", async () => {
    st.themes = [theme("t-1")];
    st.files = { "t-1": folder(["a.jpg", "b.jpg"]) };
    st.cores = new Map([
      ["t-1/a.jpg", "#a07850"],
      ["t-1/b.jpg", "#203040"],
    ]);
    st.lqips = new Map([["t-1/a.jpg", "data:image/webp;base64,AAAA"]]);

    const [t] = await (await GET(req())).json();
    // A capa por omissão é a mais recente (`a.jpg`) — e a cor é a DELA.
    expect(t).toMatchObject({
      coverUrl: "https://signed/t-1/a.jpg",
      coverLqip: "data:image/webp;base64,AAAA",
      coverCor: "#a07850",
    });
  });

  it("a cor e o borrão saem da MESMA leitura, e só dos caminhos de capa", async () => {
    st.themes = [theme("t-1"), theme("t-2")];
    st.files = { "t-1": folder(["a.jpg", "b.jpg"]), "t-2": folder(["c.jpg"]) };
    await GET(req());
    expect(st.lerCores).toHaveBeenCalledTimes(1);
    expect(st.lerCores).toHaveBeenCalledWith(["t-1/a.jpg", "t-2/c.jpg"]);
  });

  it("a cor da capa ESCOLHIDA, e não a da mais recente", async () => {
    st.themes = [theme("t-1", { coverPath: "t-1/b.jpg" })];
    st.files = { "t-1": folder(["a.jpg", "b.jpg"]) };
    st.cores = new Map([
      ["t-1/a.jpg", "#a07850"],
      ["t-1/b.jpg", "#203040"],
    ]);
    const [t] = await (await GET(req())).json();
    expect(t.coverCor).toBe("#203040");
  });

  it("sem cor gravada, o campo nem aparece", async () => {
    st.themes = [theme("t-1")];
    st.files = { "t-1": folder(["a.jpg"]) };
    const [t] = await (await GET(req())).json();
    expect(t).not.toHaveProperty("coverCor");
  });

  it("uma leitura que falha deixa a lista sair na mesma — sem cor, nunca um erro", async () => {
    st.themes = [theme("t-1")];
    st.files = { "t-1": folder(["a.jpg"]) };
    st.falhaDaLeitura = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const [t] = await res.json();
    expect(t).toMatchObject({ id: "t-1", imageCount: 1 });
    expect(t).not.toHaveProperty("coverCor");
  });
});

/**
 * «Por defeito a primeira» (T1): sem capa escolhida, o cartão mostra a
 * primeira da GRELHA — e num tema arrumado à mão essa é a primeira da ordem,
 * não a mais recente. Sem isto o cartão trocava de capa ao abrir a pasta.
 */
describe("GET /api/temas — a capa por omissão segue a ordem manual", () => {
  it("sem capa escolhida, é a primeira da ordem manual", async () => {
    st.themes = [theme("t-1", { photoOrder: ["t-1/c.jpg", "t-1/a.jpg"] })];
    st.files = { "t-1": folder(["a.jpg", "b.jpg", "c.jpg"]) };
    st.cores = new Map([["t-1/c.jpg", "#112233"]]);
    const [t] = await (await GET(req())).json();
    expect(t.coverUrl).toBe("https://signed/t-1/c.jpg");
    expect(t.coverCor).toBe("#112233");
    // E custa ZERO idas a mais: a candidata vai na mesma assinatura.
    expect(st.sign).toHaveBeenCalledTimes(1);
  });

  it("a capa escolhida continua a ganhar à ordem", async () => {
    st.themes = [
      theme("t-1", { coverPath: "t-1/b.jpg", photoOrder: ["t-1/c.jpg", "t-1/a.jpg"] }),
    ];
    st.files = { "t-1": folder(["a.jpg", "b.jpg", "c.jpg"]) };
    const [t] = await (await GET(req())).json();
    expect(t.coverUrl).toBe("https://signed/t-1/b.jpg");
  });

  it("uma arrumada que já não existe salta para a seguinte, como na pasta", async () => {
    st.themes = [theme("t-1", { photoOrder: ["t-1/apagada.jpg", "t-1/b.jpg"] })];
    st.files = { "t-1": folder(["a.jpg", "b.jpg"]) };
    // O Storage não assina o que não está lá.
    st.sign.mockImplementation(
      async (paths: string[]) =>
        new Map(
          paths.filter((p) => !p.includes("apagada")).map((p) => [p, `https://signed/${p}`]),
        ),
    );
    const [t] = await (await GET(req())).json();
    expect(t.coverUrl).toBe("https://signed/t-1/b.jpg");
  });

  it("um caminho de OUTRA pasta na ordem não serve de capa", async () => {
    st.themes = [theme("t-1", { photoOrder: ["t-2/intrusa.jpg"] })];
    st.files = { "t-1": folder(["a.jpg"]) };
    const [t] = await (await GET(req())).json();
    expect(t.coverUrl).toBe("https://signed/t-1/a.jpg");
  });
});
