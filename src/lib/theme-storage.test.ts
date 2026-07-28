import { describe, it, expect } from "vitest";
import {
  isThemePath,
  themeFolder,
  themeIdOfPath,
  contentTypeForPath,
  THEME_BUCKET,
} from "./theme-storage";

/**
 * As funções puras de caminhos são o guarda de segurança da biblioteca: os
 * caminhos que chegam do cliente (importar para uma proposta, remover uma
 * foto) são validados SÓ por elas antes de tocar no Storage. Um furo aqui
 * significaria ler/apagar fora da pasta do tema.
 */
describe("isThemePath", () => {
  it("aceita um ficheiro dentro da pasta de um tema", () => {
    expect(isThemePath("tema-1/8f14e45f.jpg")).toBe(true);
    expect(isThemePath("TEMA_2/foto-01.jpeg")).toBe(true);
    expect(isThemePath("t3/a.png")).toBe(true);
    expect(isThemePath("t3/a.webp")).toBe(true);
  });

  it("rejeita travessia de diretórios", () => {
    expect(isThemePath("../proposal-assets/q-1/segredo.jpg")).toBe(false);
    expect(isThemePath("tema/../../etc/passwd.jpg")).toBe(false);
    expect(isThemePath("tema/sub/foto.jpg")).toBe(false);
  });

  it("rejeita URLs, data-URIs e caminhos absolutos", () => {
    expect(isThemePath("https://exemplo.pt/foto.jpg")).toBe(false);
    expect(isThemePath("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isThemePath("/tema/foto.jpg")).toBe(false);
  });

  it("rejeita extensões não-imagem e valores que não são strings", () => {
    expect(isThemePath("tema/script.svg")).toBe(false);
    expect(isThemePath("tema/malware.exe")).toBe(false);
    expect(isThemePath("tema/sem-extensao")).toBe(false);
    expect(isThemePath("")).toBe(false);
    expect(isThemePath(null)).toBe(false);
    expect(isThemePath(42)).toBe(false);
    expect(isThemePath(["tema/a.jpg"])).toBe(false);
  });
});

describe("themeFolder", () => {
  it("mantém ids normais intactos", () => {
    expect(themeFolder("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    );
  });

  it("remove tudo o que poderia escapar da pasta", () => {
    expect(themeFolder("../../etc")).toBe("etc");
    expect(themeFolder("tema/outro")).toBe("temaoutro");
    expect(themeFolder("tema com espaços!")).toBe("temacomespaos");
  });
});

describe("themeIdOfPath", () => {
  it("devolve a pasta de um caminho válido", () => {
    expect(themeIdOfPath("tema-1/foto.jpg")).toBe("tema-1");
  });

  it("devolve vazio para um caminho inválido (nunca um palpite)", () => {
    expect(themeIdOfPath("../fora/foto.jpg")).toBe("");
    expect(themeIdOfPath("foto.jpg")).toBe("");
  });
});

describe("contentTypeForPath", () => {
  it("mapeia a extensão para o content-type da cópia", () => {
    expect(contentTypeForPath("t/a.png")).toBe("image/png");
    expect(contentTypeForPath("t/a.webp")).toBe("image/webp");
    expect(contentTypeForPath("t/a.jpg")).toBe("image/jpeg");
    expect(contentTypeForPath("t/a.JPEG")).toBe("image/jpeg");
  });
});

describe("bucket", () => {
  it("é separado do bucket das propostas", () => {
    expect(THEME_BUCKET).toBe("theme-assets");
  });
});
