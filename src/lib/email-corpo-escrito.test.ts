import { describe, it, expect } from "vitest";
import {
  assuntoEscritoAMao,
  corpoEscritoAMao,
  excedeOTecto,
  MAXIMO_ASSUNTO_ESCRITO,
  MAXIMO_CORPO_ESCRITO,
  paragrafosDeTexto,
} from "./email-corpo-escrito";

/** O que o `esc` deixa passar e continua a estragar um email. */
const SUJIDADE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

describe("corpoEscritoAMao", () => {
  it("nada escrito é nada — o envio segue como seguia antes desta caixa existir", () => {
    expect(corpoEscritoAMao(undefined)).toBeNull();
    expect(corpoEscritoAMao("")).toBeNull();
    expect(corpoEscritoAMao("   \n\n  ")).toBeNull();
    // Um cliente avariado a mandar um número não pode parar uma proposta.
    expect(corpoEscritoAMao(42)).toBeNull();
    expect(corpoEscritoAMao({ html: "<b>oi</b>" })).toBeNull();
  });

  /**
   * O que vem da caixa é TEXTO, não marcação. Um «arco & flores» ou um «<3»
   * sem escape dá, na melhor das hipóteses, um símbolo que desaparece; na pior,
   * uma etiqueta aberta que come o resto do email.
   */
  it("escapa tudo — ninguém injecta marcação por esta porta", () => {
    const escrito = corpoEscritoAMao(`Arco & flores <3 <script>alert(1)</script>`)!;
    expect(escrito.html).not.toContain("<script");
    expect(escrito.html).toContain("&lt;script&gt;");
    expect(escrito.html).toContain("&amp;");
    // O texto simples leva o que ela escreveu, tal e qual: escapar é uma
    // preocupação de HTML.
    expect(escrito.texto).toContain("Arco & flores <3");
  });

  it("uma imagem, uma âncora ou um estilo escritos à mão saem como palavras", () => {
    const escrito = corpoEscritoAMao(
      `<img src=x onerror=alert(1)> e <a href="javascript:x">aqui</a>`,
    )!;
    expect(escrito.html).not.toMatch(/<(img|a|script|style)\b/i);
  });

  it("as quebras de linha dela sobrevivem: linha em branco é parágrafo novo", () => {
    const escrito = corpoEscritoAMao("Olá Ana,\nTudo bem?\n\nSegue a proposta.")!;
    expect(escrito.html.match(/<p\b/g)).toHaveLength(2);
    expect(escrito.html).toContain("Olá Ana,<br>Tudo bem?");
    expect(escrito.texto).toBe("Olá Ana,\nTudo bem?\n\nSegue a proposta.");
  });

  /** Caracteres de controlo e marcas bidireccionais sobrevivem ao `esc` e
   *  conseguem inverter a leitura de tudo o que vem a seguir. */
  it("tira os caracteres de controlo e as marcas bidireccionais", () => {
    const escrito = corpoEscritoAMao("Ol\u00e1\u202E Ana\u0007 Silva")!;
    expect(escrito.html).not.toMatch(SUJIDADE);
    expect(escrito.texto).not.toMatch(SUJIDADE);
    expect(escrito.texto).toContain("Ana");
  });

  it("não emite parágrafos vazios a partir de linhas em branco a mais", () => {
    const escrito = corpoEscritoAMao("Um.\n\n\n\n\nDois.")!;
    expect(escrito.html.match(/<p\b/g)).toHaveLength(2);
  });
});

describe("excedeOTecto", () => {
  /**
   * Recusa-se, não se corta. Um email de proposta cortado a meio de uma frase
   * chega ao cliente com ar de avaria e ninguém do lado de cá dá por isso —
   * enquanto uma recusa aparece no ecrã de quem está a carregar no botão.
   */
  it("um texto dentro do tecto passa, um texto acima dele é recusado", () => {
    expect(excedeOTecto("a".repeat(MAXIMO_CORPO_ESCRITO))).toBe(false);
    expect(excedeOTecto("a".repeat(MAXIMO_CORPO_ESCRITO + 1))).toBe(true);
    expect(excedeOTecto(undefined)).toBe(false);
  });
});

describe("paragrafosDeTexto", () => {
  it("é o mesmo tratamento, para quem só quer o markup", () => {
    expect(paragrafosDeTexto("Olá.")).toContain("<p ");
    expect(paragrafosDeTexto("")).toBe("");
  });
});

describe("assuntoEscritoAMao", () => {
  it("devolve o assunto tal e qual quando é uma frase normal", () => {
    expect(assuntoEscritoAMao("A vossa proposta — Líquen Events")).toBe(
      "A vossa proposta — Líquen Events",
    );
  });

  /**
   * A ausência é o estado NORMAL: um envio sem assunto editado tem de sair
   * exactamente como saía antes desta caixa existir.
   *
   * CONTROLO POSITIVO na primeira linha — sem ele, uma função que devolvesse
   * `null` a tudo passava neste teste com louvor.
   */
  it("vazio, só espaços, ou o que não é texto: null", () => {
    expect(assuntoEscritoAMao("Proposta")).toBe("Proposta"); // controlo positivo
    expect(assuntoEscritoAMao("")).toBeNull();
    expect(assuntoEscritoAMao("   \n  ")).toBeNull();
    expect(assuntoEscritoAMao(undefined)).toBeNull();
    expect(assuntoEscritoAMao(42)).toBeNull();
    expect(assuntoEscritoAMao({ assunto: "Proposta" })).toBeNull();
  });

  /**
   * ── A QUEBRA DE LINHA NUM ASSUNTO NÃO É UMA QUEBRA DE LINHA ──────────────
   *
   * É o fim do cabeçalho `Subject:` e o princípio de outro qualquer. Um `\n`
   * seguido de `Bcc:` num assunto que passasse tal e qual é uma cópia deste
   * email para quem quer que a escreva.
   */
  it("colapsa as quebras de linha: o assunto sai numa linha só", () => {
    const sujo = "Proposta\nBcc: outro@exemplo.pt\r\npara o vosso casamento";
    const limpo = assuntoEscritoAMao(sujo)!;
    expect(limpo).not.toContain("\n");
    expect(limpo).not.toContain("\r");
    expect(limpo).toBe("Proposta Bcc: outro@exemplo.pt para o vosso casamento");
  });

  it("tira as marcas invisíveis que sobrevivem ao escape", () => {
    const limpo = assuntoEscritoAMao("Pro\u202Eposta\u0007")!;
    expect(limpo).not.toMatch(SUJIDADE);
    expect(limpo).toContain("Pro");
  });

  it("corta no tecto em vez de deixar passar um texto", () => {
    const enorme = "a".repeat(MAXIMO_ASSUNTO_ESCRITO + 50);
    expect(assuntoEscritoAMao(enorme)).toHaveLength(MAXIMO_ASSUNTO_ESCRITO);
  });
});
