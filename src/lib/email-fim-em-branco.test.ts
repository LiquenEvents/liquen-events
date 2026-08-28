import { describe, it, expect } from "vitest";
import { semFimEmBranco } from "./email-fim-em-branco";

/**
 * O que se prende aqui é a fronteira: TIRA-SE o que não é conteúdo no fim, e
 * NÃO SE TOCA em mais nada. Metade destes casos são sobre a segunda metade —
 * uma arrumação que come uma palavra dela é muito pior do que um email
 * comprido.
 */
describe("o fim em branco de um corpo de email", () => {
  it("CONTROLO POSITIVO: um corpo já arrumado sai igual a si próprio", () => {
    // Sem isto, uma função que devolvesse "" passava em todos os casos de cima.
    const corpo = "<p>Olá Melanie,</p><p>Segue a vossa proposta.</p>";
    expect(semFimEmBranco(corpo)).toBe(corpo);
  });

  it("tira os blocos que o editor deixa por cada Enter no fim", () => {
    // É isto que um `contentEditable` escreve quando se carrega em Enter.
    expect(semFimEmBranco("<p>Olá</p><div><br></div><div><br></div>")).toBe("<p>Olá</p>");
    expect(semFimEmBranco("<p>Olá</p><p><br></p>")).toBe("<p>Olá</p>");
    expect(semFimEmBranco("<p>Olá</p><p>&nbsp;</p>")).toBe("<p>Olá</p>");
  });

  it("tira blocos vazios ENCAIXADOS — é para isso que o ciclo existe", () => {
    expect(semFimEmBranco("<p>Olá</p><div><div><br></div></div>")).toBe("<p>Olá</p>");
  });

  it("tira `<br>` e espaços duros soltos no fim", () => {
    expect(semFimEmBranco("<p>Olá</p><br><br>")).toBe("<p>Olá</p>");
    expect(semFimEmBranco("<p>Olá</p>&nbsp;\n  ")).toBe("<p>Olá</p>");
  });

  it("NÃO toca nas linhas em branco do MEIO — isso é composição dela", () => {
    const corpo = "<p>Olá</p><div><br></div><p>Segue a proposta.</p>";
    expect(semFimEmBranco(corpo)).toBe(corpo);
  });

  it("NÃO come um bloco que tenha texto, por pouco que seja", () => {
    expect(semFimEmBranco("<p>Olá</p><p>.</p>")).toBe("<p>Olá</p><p>.</p>");
    expect(semFimEmBranco("<p>Olá</p><p><br>x</p>")).toBe("<p>Olá</p><p><br>x</p>");
  });

  it("NÃO come um `<br>` que está DENTRO de um parágrafo com texto", () => {
    // A quebra de linha dela entre duas frases do mesmo parágrafo.
    const corpo = "<p>Olá Melanie,<br>Segue a proposta.</p>";
    expect(semFimEmBranco(corpo)).toBe(corpo);
  });

  it("NÃO desmancha a moldura de uma tabela — uma célula vazia é estrutura", () => {
    const corpo = "<table><tr><td>Olá</td></tr><tr><td></td></tr></table>";
    expect(semFimEmBranco(corpo)).toBe(corpo);
  });

  it("uma imagem no fim NÃO é um fim em branco", () => {
    // A faixa da marca, por exemplo. Um bloco com um `<img>` tem conteúdo.
    const corpo = '<p>Olá</p><div><img src="cid:x" alt=""></div>';
    expect(semFimEmBranco(corpo)).toBe(corpo);
  });

  it("aguenta o vazio e o que não é texto nenhum", () => {
    expect(semFimEmBranco("")).toBe("");
    expect(semFimEmBranco("<div><br></div>")).toBe("");
    // @ts-expect-error — a rota pode entregar o que a base tiver.
    expect(semFimEmBranco(null)).toBe("");
  });

  it("não se pendura num corpo patológico", () => {
    // Mil blocos vazios encaixados: tem de acabar, e depressa.
    const fundo = "<p>Olá</p>";
    const corpo = fundo + "<div>".repeat(400) + "<br>" + "</div>".repeat(400);
    const antes = Date.now();
    const fora = semFimEmBranco(corpo);
    expect(Date.now() - antes).toBeLessThan(2000);
    // Pode não conseguir desmontar 400 níveis dentro do tecto de voltas — o que
    // NÃO pode é perder o que estava antes.
    expect(fora.startsWith(fundo)).toBe(true);
  });
});
