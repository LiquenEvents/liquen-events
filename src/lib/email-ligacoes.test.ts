import { describe, it, expect } from "vitest";
import { arrumarLigacao, ROTULO_DA_PROPOSTA } from "./email-ligacoes";
import { textoDoCorpo } from "./email-modelos";

/** Um link de proposta a sério: quatro linhas de caracteres aleatórios. */
const URL = `https://liquen-events.com/proposta/${"aG9sYS1zb3UtdW0tdG9rZW4tbXVpdG8tY29tcHJpZG8".repeat(3)}`;
const arrumar = (html: string) => arrumarLigacao(html, { url: URL, rotulo: ROTULO_DA_PROPOSTA });

describe("arrumarLigacao", () => {
  /**
   * O caso que chegou à caixa da cliente: o construtor do editor simples
   * escreve `<a href="{link}">{link}</a>` (ver `email-template-format.ts`), e o
   * modelo por omissão também. O endereço aparecia inteiro, em texto, e um
   * email com quatro linhas de caracteres aleatórios parece phishing.
   */
  it("um endereço que se mostra a si próprio passa a texto âncora", () => {
    const saiu = arrumar(`<p>Veja aqui: <a href="${URL}" style="color:#637a5f">${URL}</a></p>`);
    expect(saiu).toContain(`>${ROTULO_DA_PROPOSTA}<`);
    expect(saiu).toContain(`href="${URL}"`);
    // O endereço fica SÓ no href — não sobra nenhum a fazer de texto.
    expect(saiu.replace(/href="[^"]*"/g, "")).not.toContain(URL);
    // E o estilo dela não se toca: é o modelo dela.
    expect(saiu).toContain('style="color:#637a5f"');
  });

  /** O mesmo `{link}` duas vezes: uma como href, outra solta no meio do texto. */
  it("o endereço solto no texto passa a ligação, e nenhum sobra à vista", () => {
    const saiu = arrumar(`<p>Aqui: <a href="${URL}">ver</a></p><p>Ou copie: ${URL}</p>`);
    expect(saiu.replace(/href="[^"]*"/g, "")).not.toContain(URL);
    expect(saiu).toContain(">ver<");
    expect(
      saiu.match(new RegExp(`href="${URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g")),
    ).toHaveLength(2);
  });

  /** O texto dela não é para reescrever: só o endereço nu é que sai. */
  it("não mexe numa âncora que já tem palavras", () => {
    const html = `<p><a href="${URL}">Ver a minha proposta</a></p>`;
    expect(arrumar(html)).toBe(html);
  });

  /** Outros links do modelo (o Instagram, o site) não são este link. */
  it("não toca em endereços que não são o desta proposta", () => {
    const html = `<p><a href="https://instagram.com/liquen.events">https://instagram.com/liquen.events</a></p>`;
    expect(arrumar(html)).toBe(html);
  });

  it("não estraga um modelo que não fala do link", () => {
    const html = `<p>Olá Ana, a proposta está pronta.</p>`;
    expect(arrumar(html)).toBe(html);
  });

  /** Um endereço dentro de um atributo (um `src`, um `background`) é markup,
   *  não texto — embrulhá-lo numa âncora partia o modelo. */
  it("não mexe em endereços que vivem dentro de etiquetas", () => {
    const html = `<img src="${URL}" alt="nada">`;
    expect(arrumar(html)).toBe(html);
  });

  /**
   * As duas versões do email têm de dizer o mesmo — duas alternativas que
   * divergem são, por si só, um sinal de spam (ver `email-assinatura.ts`). Em
   * texto simples não há onde carregar, portanto o endereço aparece, mas
   * aparece uma vez e com a mesma etiqueta que o HTML mostra.
   */
  it("a versão em texto diz o mesmo: a etiqueta e o endereço, uma vez", () => {
    const texto = textoDoCorpo(arrumar(`<p>Veja: <a href="${URL}">${URL}</a></p>`));
    expect(texto).toContain(ROTULO_DA_PROPOSTA);
    expect(texto).toContain(URL);
    expect(texto.split(URL)).toHaveLength(2);
    expect(texto).not.toMatch(/[<>]/);
  });

  it("sem endereço nenhum para arrumar, devolve o que recebeu", () => {
    const html = `<p>Olá.</p>`;
    expect(arrumarLigacao(html, { url: "", rotulo: ROTULO_DA_PROPOSTA })).toBe(html);
  });
});
