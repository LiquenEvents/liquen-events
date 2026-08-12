import { describe, it, expect } from "vitest";
import { PARAM_DESTINO, destinoSeguro, entradaCom } from "./entrada-destino";

/**
 * O GUARDA DO «VOLTAR À PÁGINA QUE SE TENTAVA ABRIR».
 *
 * Esta é a função que impede que uma comodidade se transforme numa porta: sem
 * ela, `?destino=` manda o ecrã de entrada despejar quem acabou de se
 * autenticar em qualquer sítio que o link diga — incluindo uma cópia deste site.
 *
 * Os casos maus abaixo não são hipóteses académicas: são a lista de formas
 * conhecidas de fazer um verificador ingénuo dizer «isto é interno».
 */

describe("destinoSeguro", () => {
  it("deixa passar as páginas do back office", () => {
    expect(destinoSeguro("/pt/orcamento/admin")).toBe("/pt/orcamento/admin");
    expect(destinoSeguro("/pt/orcamento/admin/evento/LQ-042")).toBe(
      "/pt/orcamento/admin/evento/LQ-042",
    );
    expect(destinoSeguro("/orcamento/admin/carregamento/abc")).toBe(
      "/orcamento/admin/carregamento/abc",
    );
    expect(destinoSeguro("/en/orcamento/admin")).toBe("/en/orcamento/admin");
  });

  it("mantém o que vem depois do caminho — filtros e âncora", () => {
    // O link que se abriu pode ser para um separador ou uma vista concreta.
    expect(destinoSeguro("/pt/orcamento/admin?vista=agenda#topo")).toBe(
      "/pt/orcamento/admin?vista=agenda#topo",
    );
  });

  it("recusa um endereço absoluto — o caso que abre a porta", () => {
    for (const mau of [
      "https://liquen-eventos.com/entrar",
      "http://evil.example/",
      "//evil.example/orcamento/admin",
      "https:/evil.example",
      "HTTPS://EVIL.EXAMPLE",
    ]) {
      expect(destinoSeguro(mau), `aceitou "${mau}"`).toBeNull();
    }
  });

  it("recusa as formas disfarçadas de uma autoridade", () => {
    for (const mau of [
      "/\\evil.example", // barra invertida: alguns browsers lêem como //
      "/%2f%2fevil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "java\nscript:alert(1)",
      " /pt/orcamento/admin",
      "/pt/orcamento/admin\n.evil",
    ]) {
      expect(destinoSeguro(mau), `aceitou ${JSON.stringify(mau)}`).toBeNull();
    }
  });

  it("recusa caminhos internos que não são do back office", () => {
    // Não é um ataque — é só que quem entra no back office quer o back office,
    // e uma lista de permitidos curta é a que não envelhece mal.
    expect(destinoSeguro("/pt/galeria")).toBeNull();
    expect(destinoSeguro("/pt/orcamento")).toBeNull();
    expect(destinoSeguro("/pt/orcamento/admins-falsos")).toBeNull();
    expect(destinoSeguro("/api/admin/passkeys")).toBeNull();
  });

  it("um `..` não escapa do back office", () => {
    // O `new URL` normaliza antes de se verificar, portanto o que é testado é o
    // caminho REAL e não o texto que o disfarça.
    expect(destinoSeguro("/pt/orcamento/admin/../../../api/backup")).toBeNull();
  });

  it("vazio, nulo e disparates não rebentam nem passam", () => {
    expect(destinoSeguro(null)).toBeNull();
    expect(destinoSeguro(undefined)).toBeNull();
    expect(destinoSeguro("")).toBeNull();
    expect(destinoSeguro("/")).toBeNull();
    expect(destinoSeguro("a".repeat(3000))).toBeNull();
  });

  it("o que sai é sempre o que foi verificado, e não o texto de entrada", () => {
    const limpo = destinoSeguro("/pt/orcamento/admin/evento/a b");
    expect(limpo).toBe("/pt/orcamento/admin/evento/a%20b");
    // E volta a passar pelo próprio guarda sem mudar — a função é idempotente,
    // que é o que permite validá-la outra vez antes de navegar.
    expect(destinoSeguro(limpo)).toBe(limpo);
  });
});

describe("entradaCom", () => {
  it("monta um endereço que o guarda volta a aceitar", () => {
    const url = entradaCom("/pt/orcamento/admin", "/pt/orcamento/admin/evento/LQ-1");
    expect(url).toBe(
      `/pt/orcamento/admin?${PARAM_DESTINO}=%2Fpt%2Forcamento%2Fadmin%2Fevento%2FLQ-1`,
    );
    const lido = new URL(url, "https://x.invalid").searchParams.get(PARAM_DESTINO);
    expect(destinoSeguro(lido)).toBe("/pt/orcamento/admin/evento/LQ-1");
  });
});
