import { describe, expect, it } from "vitest";
import { localeDoCaminho, localizeHref } from "./config";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O LINK QUE SAÍA DO BACK OFFICE PARA UM 404
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O back office lia a língua com `pathname.split("/").filter(Boolean)[0]`.
 * Acerta em `/en/orcamento/admin` e falha em tudo o resto — o site é português
 * SEM prefixo, e em `/orcamento/admin` esse primeiro segmento é a palavra
 * «orcamento».
 *
 * O botão «Dossier» ficava a apontar para `/orcamento/orcamento/admin/evento/
 * {id}`: o 404 do site público, com o menu comercial e um botão que leva à
 * homepage. O Dossier é o ecrã mais completo do produto e estava inacessível.
 */
describe("a língua lida de um caminho", () => {
  it("o caminho canónico do back office é português — e não «orcamento»", () => {
    expect(localeDoCaminho("/orcamento/admin")).toBe("pt");
    expect(localeDoCaminho("/orcamento/admin/evento/LIQ-1")).toBe("pt");
  });

  it("o espelho inglês é inglês", () => {
    expect(localeDoCaminho("/en/orcamento/admin")).toBe("en");
    expect(localeDoCaminho("/en")).toBe("en");
  });

  it("«/enigma» não é inglês — o prefixo é um segmento, não um prefixo de texto", () => {
    expect(localeDoCaminho("/enigma")).toBe("pt");
  });

  it("sem caminho nenhum, português", () => {
    expect(localeDoCaminho(null)).toBe("pt");
    expect(localeDoCaminho(undefined)).toBe("pt");
    expect(localeDoCaminho("")).toBe("pt");
  });
});

describe("o endereço do Dossier, composto", () => {
  const dossier = (caminho: string) =>
    localizeHref("/orcamento/admin/evento/LIQ-1", localeDoCaminho(caminho));

  it("a partir do back office português, não duplica «orcamento»", () => {
    // Era isto que dava 404: `/orcamento/orcamento/admin/evento/LIQ-1`.
    expect(dossier("/orcamento/admin")).toBe("/orcamento/admin/evento/LIQ-1");
    expect(dossier("/orcamento/admin")).not.toContain("/orcamento/orcamento/");
  });

  it("e a partir do espelho inglês, fica no espelho inglês", () => {
    expect(dossier("/en/orcamento/admin")).toBe("/en/orcamento/admin/evento/LIQ-1");
  });
});
