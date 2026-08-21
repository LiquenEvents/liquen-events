import { describe, it, expect, vi } from "vitest";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA REDE SEM ENDEREÇO NÃO TEM ÍCONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «se algum perfil não existir, remover o ícone em vez de o deixar
 * apontar para lado nenhum».
 *
 * O mecanismo já existia (`redesConfiguradas` filtra as que têm endereço
 * vazio), e o LinkedIn chegou a estar assim — entrou sozinho quando o
 * `SITE.linkedin` deixou de estar vazio. O que não existia era um teste, e sem
 * ele a regra vive de um `filter` que qualquer refactor apaga sem barulho.
 *
 * Vive num ficheiro à parte porque precisa de SUBSTITUIR o `SITE`, e fazê-lo no
 * ficheiro grande da assinatura punha todos os outros testes a olhar para uma
 * configuração de mentira.
 */

vi.mock("./site", async (importOriginal) => {
  const real = (await importOriginal<typeof import("./site")>()).SITE;
  return { SITE: { ...real, linkedin: "" } };
});

const { assinaturaDeEmail } = await import("./email-assinatura");

describe("uma rede sem endereço configurado", () => {
  const assinatura = () => assinaturaDeEmail({ nome: "Catarina Gaspar" });

  it("não desenha o ícone nem o link", () => {
    const { html, texto } = assinatura();
    expect(html).not.toContain("LinkedIn");
    expect(texto).not.toContain("LinkedIn");
    // E sobretudo: não fica um `href` vazio nem um `href="#"`.
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    for (const h of hrefs) expect(h.trim()).not.toBe("");
  });

  /**
   * CONTROLO POSITIVO. Sem isto, o teste de cima passava por a assinatura não
   * ter redes nenhumas — e deixava de provar o que quer que fosse.
   */
  it("mas as que TÊM endereço continuam lá", () => {
    const { html, texto } = assinatura();
    expect(html).toContain("Facebook");
    expect(html).toContain("Instagram");
    expect(texto).toContain("Facebook");
  });

  it("e o anexo do ícone que não se desenha também não viaja", () => {
    const nomes = assinatura().anexos.map((a) => String(a.filename ?? ""));
    expect(nomes.some((n) => /linkedin/i.test(n))).toBe(false);
    expect(nomes.some((n) => /facebook/i.test(n))).toBe(true);
  });
});
