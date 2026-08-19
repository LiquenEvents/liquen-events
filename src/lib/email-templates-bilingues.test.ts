import { describe, it, expect, beforeEach, vi } from "vitest";

/** Repositório em memória: a mesma forma que o `createRepository` devolve. */
const linhas = new Map<string, Record<string, unknown>>();
vi.mock("./repository", () => ({
  createRepository: (mapper: { getId: (e: Record<string, unknown>) => string }) => ({
    list: async () => [...linhas.values()],
    get: async (id: string) => linhas.get(id) ?? null,
    create: async (e: Record<string, unknown>) => {
      linhas.set(mapper.getId(e), e);
    },
    update: async (id: string, e: Record<string, unknown>) => {
      linhas.set(id, e);
      return e;
    },
    remove: async (id: string) => {
      linhas.delete(id);
    },
  }),
}));

const store = await import("./email-templates-store");
const {
  idFisico,
  decomporId,
  ehLinhaDeVersao,
  listarModelos,
  guardarModelo,
  listarVersoes,
  reverterPara,
  MODELOS_DE_ORIGEM,
  MAX_VERSOES,
} = store;

beforeEach(() => linhas.clear());

describe("chaves compostas — bilingue sem migração", () => {
  it("o português guarda-se na chave nua; o inglês leva sufixo", () => {
    expect(idFisico("registo-formal", "pt")).toBe("registo-formal");
    expect(idFisico("registo-formal", "en")).toBe("registo-formal@en");
  });

  it("decompõe as duas formas, e a versão", () => {
    expect(decomporId("registo-formal")).toEqual({
      chave: "registo-formal",
      idioma: "pt",
      versaoEm: null,
    });
    expect(decomporId("registo-formal@en")).toEqual({
      chave: "registo-formal",
      idioma: "en",
      versaoEm: null,
    });
    expect(decomporId("registo-formal@en#v2026-01-02T03:04:05.000Z")).toEqual({
      chave: "registo-formal",
      idioma: "en",
      versaoEm: "2026-01-02T03:04:05.000Z",
    });
  });

  it("uma linha de versão reconhece-se e NUNCA é um modelo", () => {
    expect(ehLinhaDeVersao("registo-formal#v2026-01-02T03:04:05.000Z")).toBe(true);
    expect(ehLinhaDeVersao("registo-formal")).toBe(false);
  });
});

describe("os modelos de origem", () => {
  it("são três e trazem as duas línguas", () => {
    expect(MODELOS_DE_ORIGEM).toHaveLength(3);
    for (const m of MODELOS_DE_ORIGEM) {
      expect(m.pt.subject.trim()).not.toBe("");
      expect(m.pt.texto.trim()).not.toBe("");
      expect(m.en.subject.trim()).not.toBe("");
      expect(m.en.texto.trim()).not.toBe("");
    }
  });

  it("o «registo formal» trata o casal por «Vosso», com maiúscula — é a voz dela", () => {
    const formal = MODELOS_DE_ORIGEM.find((m) => m.chave === "registo-formal")!;
    expect(formal.pt.texto).toContain("Vosso dispor");
    expect(formal.pt.texto).toContain("Vosso feedback");
    expect(formal.pt.texto).not.toMatch(/vosso (dispor|feedback)/);
  });

  it("o «registo formal» usa blocos condicionais para a data em falta", () => {
    const formal = MODELOS_DE_ORIGEM.find((m) => m.chave === "registo-formal")!;
    expect(formal.pt.texto).toContain("{{#se evento_data}}");
    expect(formal.pt.texto).toContain("{{#se_nao evento_data}}");
  });

  it("nenhum modelo de origem assina com o nome do cliente", () => {
    for (const m of MODELOS_DE_ORIGEM) {
      for (const lado of [m.pt, m.en]) {
        // A última linha de um modelo é a despedida, nunca o nome de quem recebe.
        expect(lado.texto.trimEnd()).not.toMatch(/\{\{\s*cliente_nome[a-z_]*\s*\}\}$/);
      }
    }
  });
});

describe("listar e guardar", () => {
  it("sem nada guardado, os modelos de origem aparecem à mesma", async () => {
    const lista = await listarModelos();
    for (const m of MODELOS_DE_ORIGEM) {
      expect(lista.find((x) => x.chave === m.chave)).toBeTruthy();
    }
  });

  it("o que está guardado ganha ao de origem, e só na língua guardada", async () => {
    await guardarModelo({
      chave: "registo-formal",
      nome: "Registo formal",
      idioma: "pt",
      subject: "Assunto meu",
      body: "<p>Corpo meu</p>",
    });
    const m = (await listarModelos()).find((x) => x.chave === "registo-formal")!;
    expect(m.pt.subject).toBe("Assunto meu");
    expect(m.en.subject).toBe(
      MODELOS_DE_ORIGEM.find((x) => x.chave === "registo-formal")!.en.subject,
    );
  });

  it("as linhas de versão não aparecem na lista de modelos", async () => {
    await guardarModelo({
      chave: "registo-formal",
      nome: "R",
      idioma: "pt",
      subject: "um",
      body: "<p>1</p>",
    });
    await guardarModelo({
      chave: "registo-formal",
      nome: "R",
      idioma: "pt",
      subject: "dois",
      body: "<p>2</p>",
    });
    const lista = await listarModelos();
    expect(lista.filter((m) => m.chave.includes("#v"))).toHaveLength(0);
    expect(lista.find((m) => m.chave === "registo-formal")!.pt.subject).toBe("dois");
  });
});

describe("histórico e reversão", () => {
  it("guardar por cima arquiva a versão anterior", async () => {
    const comum = { chave: "curto", nome: "Curto", idioma: "pt" as const };
    await guardarModelo({ ...comum, subject: "v1", body: "<p>um</p>" });
    expect(await listarVersoes("curto", "pt")).toHaveLength(0);
    await guardarModelo({ ...comum, subject: "v2", body: "<p>dois</p>" });
    const versoes = await listarVersoes("curto", "pt");
    expect(versoes).toHaveLength(1);
    expect(versoes[0].subject).toBe("v1");
  });

  it("as versões vêm da mais recente para a mais antiga", async () => {
    const comum = { chave: "curto", nome: "Curto", idioma: "pt" as const };
    for (const n of ["a", "b", "c"])
      await guardarModelo({ ...comum, subject: n, body: `<p>${n}</p>` });
    const versoes = await listarVersoes("curto", "pt");
    expect(versoes.map((v) => v.subject)).toEqual(["b", "a"]);
  });

  it("nunca guarda mais do que MAX_VERSOES por modelo e língua", async () => {
    const comum = { chave: "curto", nome: "Curto", idioma: "pt" as const };
    for (let i = 0; i < MAX_VERSOES + 5; i++) {
      await guardarModelo({ ...comum, subject: `v${i}`, body: `<p>${i}</p>` });
    }
    expect((await listarVersoes("curto", "pt")).length).toBeLessThanOrEqual(MAX_VERSOES);
  });

  it("o histórico do português não se mistura com o do inglês", async () => {
    await guardarModelo({
      chave: "curto",
      nome: "C",
      idioma: "pt",
      subject: "p1",
      body: "<p>p1</p>",
    });
    await guardarModelo({
      chave: "curto",
      nome: "C",
      idioma: "pt",
      subject: "p2",
      body: "<p>p2</p>",
    });
    await guardarModelo({
      chave: "curto",
      nome: "C",
      idioma: "en",
      subject: "e1",
      body: "<p>e1</p>",
    });
    expect(await listarVersoes("curto", "pt")).toHaveLength(1);
    expect(await listarVersoes("curto", "en")).toHaveLength(0);
  });

  it("reverter repõe o texto antigo — e o que estava fica no histórico", async () => {
    const comum = { chave: "curto", nome: "Curto", idioma: "pt" as const };
    await guardarModelo({ ...comum, subject: "bom", body: "<p>bom</p>" });
    await guardarModelo({ ...comum, subject: "mau", body: "<p>mau</p>" });
    const [versao] = await listarVersoes("curto", "pt");
    const revertido = await reverterPara("curto", "pt", versao.versaoEm);
    expect(revertido?.subject).toBe("bom");
    const agora = (await listarModelos()).find((m) => m.chave === "curto")!;
    expect(agora.pt.subject).toBe("bom");
    // A reversão é ela própria desfazível: o «mau» não desaparece do mundo.
    expect((await listarVersoes("curto", "pt")).map((v) => v.subject)).toContain("mau");
  });

  it("reverter para uma versão que não existe devolve null e não mexe em nada", async () => {
    await guardarModelo({
      chave: "curto",
      nome: "C",
      idioma: "pt",
      subject: "x",
      body: "<p>x</p>",
    });
    expect(await reverterPara("curto", "pt", "2020-01-01T00:00:00.000Z")).toBeNull();
    expect((await listarModelos()).find((m) => m.chave === "curto")!.pt.subject).toBe("x");
  });
});
