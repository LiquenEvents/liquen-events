import { describe, it, expect } from "vitest";
import { porqueNaoLeu, porqueNaoLeuDoErro } from "./porque-nao-leu";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA LEITURA FALHADA NÃO MANDA REPETIR — E NÃO PROMETE O QUE NÃO GRAVOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O irmão (`porque-falhou.test.ts`) prende as frases de uma gravação. Estes
 * prendem o que as separa das de leitura, que é onde uma frase copiada do
 * outro lado mente:
 *
 *   · nunca «o que escreveste está guardado» — não se escreveu nada;
 *   · a instrução é recarregar ou tentar outra vez, não repetir um gesto;
 *   · a sessão expirada é o caso COMUM, e é o único em que um «Tentar de
 *     novo» faz mal: com a mesma sessão dá o mesmo 401.
 *
 * E prendem o `valeTentarDeNovo`, que é o que decide se o botão aparece.
 */

const OQUE = "os temas";

describe("porqueNaoLeu", () => {
  it("nunca promete que o que se escreveu ficou guardado", () => {
    const todas = [
      porqueNaoLeu(OQUE, null),
      porqueNaoLeu(OQUE, { status: 401 }),
      porqueNaoLeu(OQUE, { status: 404 }),
      porqueNaoLeu(OQUE, { status: 429 }),
      porqueNaoLeu(OQUE, { status: 500 }),
      porqueNaoLeu(OQUE, { status: 504 }),
      porqueNaoLeu(OQUE, { status: 400 }),
    ];
    for (const f of todas) {
      expect(f.mensagem).not.toMatch(/escreveste|gravaç|guardar/i);
      // «Repete» é a instrução de uma gravação: há um gesto para repetir. Numa
      // leitura não há — há uma página para recarregar.
      expect(f.mensagem).not.toMatch(/\brepete\b/i);
      expect(f.mensagem).toMatch(/recarrega|tenta outra vez|volta a entrar/i);
    }
  });

  it("nomeia o que não se conseguiu ler", () => {
    expect(porqueNaoLeu(OQUE, { status: 500 }).mensagem).toContain("não deu para ler os temas");
  });

  it("sem nome, fica só a razão e o passo — o painel já diz o resto", () => {
    // É o caso do `AvisoDeFalha`, cujo título já é «Não foi possível ler as
    // listas»: repeti-lo na linha de baixo é dizer duas vezes o que se vê.
    const f = porqueNaoLeu("", { status: 500 });
    expect(f.mensagem).not.toContain("não deu para ler");
    expect(f.mensagem).toMatch(/tenta outra vez/i);
  });

  it("sem ligação: diz que não se perdeu nada, porque isto era uma leitura", () => {
    const f = porqueNaoLeu(OQUE, null);
    expect(f.mensagem).toContain("Sem ligação");
    expect(f.mensagem).toMatch(/não se perdeu nada/i);
    expect(f.razao).toBe("sem-rede");
    expect(f.valeTentarDeNovo).toBe(true);
  });

  it("sessão expirada: manda entrar, e NÃO oferece tentar de novo", () => {
    for (const status of [401, 403]) {
      const f = porqueNaoLeu(OQUE, { status }, { error: "Não autorizado" });
      expect(f.mensagem).toContain("sessão expirou");
      expect(f.mensagem).toContain("Volta a entrar");
      expect(f.sessaoExpirou).toBe(true);
      expect(f.razao).toBe("sessao-expirada");
      // Com a mesma sessão, pedir outra vez dá o mesmo 401 — e um botão que
      // não pode funcionar é pior do que nenhum.
      expect(f.valeTentarDeNovo).toBe(false);
      // «Não autorizado» é o que TODAS as rotas dizem, e não diz o que fazer:
      // aqui a frase do servidor não ganha.
      expect(f.mensagem).not.toContain("Não autorizado");
    }
  });

  it("já não existe: manda recarregar, e não insiste", () => {
    const f = porqueNaoLeu(OQUE, { status: 404 });
    expect(f.mensagem).toContain("já não existe");
    expect(f.mensagem).toContain("recarrega");
    expect(f.razao).toBe("nao-existe");
    expect(f.valeTentarDeNovo).toBe(false);
  });

  it("o servidor demorou demasiado: diz que os dados continuam lá", () => {
    for (const status of [408, 504]) {
      const f = porqueNaoLeu(OQUE, { status });
      expect(f.mensagem).toContain("demorou demasiado");
      expect(f.mensagem).toMatch(/os dados estão lá/i);
      expect(f.razao).toBe("demorou");
      expect(f.valeTentarDeNovo).toBe(true);
    }
  });

  it("pedidos a mais: manda esperar um minuto", () => {
    const f = porqueNaoLeu(OQUE, { status: 429 });
    expect(f.mensagem).toContain("Espera um minuto");
    expect(f.razao).toBe("pedidos-a-mais");
  });

  it("num 500, a frase do servidor GANHA — ao contrário da gravação", () => {
    // É a diferença medida entre «não foi possível ler» e «falta correr o
    // db/schema.sql»: a segunda resolve-se sozinha, sem ir aos registos.
    const f = porqueNaoLeu(OQUE, { status: 503 }, { error: "Falta correr o db/schema.sql." });
    expect(f.mensagem).toBe("Falta correr o db/schema.sql.");
    expect(f.razao).toBe("servidor");
    expect(f.valeTentarDeNovo).toBe(true);
  });

  it("um 500 mudo diz o número, que é o que se cita a pedir ajuda", () => {
    const f = porqueNaoLeu(OQUE, { status: 500 }, null);
    expect(f.mensagem).toContain("(500)");
    expect(f.mensagem).toMatch(/nada foi apagado/i);
    // E não é o número sozinho: «500» num aviso não é uma frase.
    expect(f.mensagem.length).toBeGreaterThan(20);
  });

  it("as genéricas do servidor não valem mais do que as nossas", () => {
    for (const error of ["Erro interno", "Internal Server Error", "erro."]) {
      const f = porqueNaoLeu(OQUE, { status: 500 }, { error });
      expect(f.mensagem).toContain("não deu para ler os temas");
    }
  });

  it("uma recusa sem explicação dá o número e manda recarregar", () => {
    const f = porqueNaoLeu(OQUE, { status: 400 });
    expect(f.mensagem).toContain("(400)");
    expect(f.razao).toBe("recusa");
  });

  it("um corpo com um rasto de pilha enorme não vai para o ecrã", () => {
    const f = porqueNaoLeu(OQUE, { status: 500 }, { error: "x".repeat(400) });
    expect(f.mensagem).not.toContain("xxx");
  });
});

describe("porqueNaoLeuDoErro", () => {
  it("reconhece o estado guardado na mensagem do erro", () => {
    // `throw new Error(String(res.status))` é o que meia dúzia de sítios desta
    // casa escreve para não perder o número no caminho até ao `catch`.
    const f = porqueNaoLeuDoErro(OQUE, new Error("401"));
    expect(f.sessaoExpirou).toBe(true);
    expect(f.valeTentarDeNovo).toBe(false);
  });

  it("o que o browser atira quando a rede cai conta como sem ligação", () => {
    for (const erro of [new TypeError("Failed to fetch"), new Error("Load failed")]) {
      expect(porqueNaoLeuDoErro(OQUE, erro).razao).toBe("sem-rede");
    }
  });

  it("uma frase escrita nesta casa passa tal e qual", () => {
    const f = porqueNaoLeuDoErro(OQUE, new Error("A base de dados não respondeu"));
    expect(f.mensagem).toBe("A base de dados não respondeu.");
  });

  it("uma palavra solta não é uma frase para mostrar a ninguém", () => {
    // `throw new Error("falhou")` é um sinal interno. Pô-lo no ecrã seria o
    // mesmo que pôr lá «500».
    const f = porqueNaoLeuDoErro(OQUE, new Error("falhou"));
    expect(f.mensagem).not.toBe("falhou.");
    expect(f.mensagem).toContain("os temas");
    expect(f.mensagem).toMatch(/tenta outra vez/i);
  });
});
