import { describe, it, expect } from "vitest";
import { porqueFalhou, porqueRebentou } from "./porque-falhou";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FRASE DE FALHA TEM TRÊS PARTES, E A TERCEIRA É A QUE FALTAVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Não foi possível guardar.» diz o quê (mal), não diz porquê, e não diz o que
 * fazer. Quem a lê faz sempre a mesma coisa — carrega outra vez — e em três dos
 * seis casos isso não funciona nunca.
 *
 * Estes testes prendem o que separa as seis situações umas das outras, e
 * sobretudo o `vaidaAdianteRepetir`: é ele que decide se se mostra um «Tentar de
 * novo», e um botão que não pode funcionar é pior do que nenhum.
 */

const OQUE = 'guardar a quantidade de "Escadote"';

describe("porqueFalhou", () => {
  it("sem ligação: diz que nada se perdeu, e que se repete depois", () => {
    const f = porqueFalhou(OQUE, null);
    expect(f.mensagem).toContain("Sem ligação");
    expect(f.mensagem).toContain(OQUE);
    // A parte que evita o pior: quem está numa quinta precisa de saber se o
    // que escreveu ainda existe.
    expect(f.mensagem).toContain("Nada se perdeu");
    expect(f.vaidaAdianteRepetir).toBe(true);
  });

  it("sessão expirada: manda entrar, e NÃO manda repetir", () => {
    for (const status of [401, 403]) {
      const f = porqueFalhou(OQUE, { status });
      expect(f.mensagem).toContain("sessão expirou");
      expect(f.mensagem).toContain("Volta a entrar");
      expect(f.sessaoExpirou).toBe(true);
      // Repetir sem voltar a entrar falha sempre.
      expect(f.vaidaAdianteRepetir).toBe(false);
    }
  });

  it("já não existe: manda recarregar, não repetir", () => {
    const f = porqueFalhou(OQUE, { status: 404 });
    expect(f.mensagem).toContain("já não existe");
    expect(f.mensagem).toContain("recarrega");
    expect(f.vaidaAdianteRepetir).toBe(false);
  });

  it("conflito: diz que alguém mexeu ao mesmo tempo", () => {
    const f = porqueFalhou(OQUE, { status: 409 });
    expect(f.mensagem).toContain("ao mesmo tempo");
    expect(f.vaidaAdianteRepetir).toBe(true);
  });

  it("servidor em baixo: diz que não é culpa do que se fez", () => {
    const f = porqueFalhou(OQUE, { status: 503 });
    expect(f.mensagem).toContain("não está a aceitar gravações");
    expect(f.mensagem).toContain("Espera um pouco");
    expect(f.vaidaAdianteRepetir).toBe(true);
  });

  it("recusa do conteúdo: repetir o mesmo não muda nada", () => {
    const f = porqueFalhou(OQUE, { status: 400 });
    expect(f.mensagem).toContain("recusou");
    expect(f.vaidaAdianteRepetir).toBe(false);
  });

  /** ── A FRASE DO SERVIDOR É A ÚNICA QUE SABE O CASO CONCRETO ─────────── */

  it("uma recusa explicada usa as palavras do servidor", () => {
    const f = porqueFalhou(OQUE, { status: 400 }, { error: "Já existe uma lista com esse nome" });
    expect(f.mensagem).toBe("Já existe uma lista com esse nome.");
  });

  it("e não lhe põe um segundo ponto final", () => {
    const f = porqueFalhou(OQUE, { status: 422 }, { error: "Falta o nome." });
    expect(f.mensagem).toBe("Falta o nome.");
  });

  it("uma frase genérica do servidor não vale mais do que a nossa", () => {
    // «Erro interno» é a mesma palavra vazia vista do outro lado.
    const f = porqueFalhou(OQUE, { status: 400 }, { error: "Erro interno" });
    expect(f.mensagem).toContain(OQUE);
    expect(f.mensagem).not.toBe("Erro interno.");
  });

  it("um 500 NÃO empresta as palavras do servidor", () => {
    // Um 500 traz rastos de pilha e nomes de tabelas, e nenhum diz o que fazer.
    const f = porqueFalhou(OQUE, { status: 500 }, { error: 'relation "event_material" does not' });
    expect(f.mensagem).not.toContain("relation");
    expect(f.mensagem).toContain("Espera um pouco");
  });

  it("uma frase gigantesca do servidor é deitada fora", () => {
    const f = porqueFalhou(OQUE, { status: 400 }, { error: "x".repeat(500) });
    expect(f.mensagem).toContain(OQUE);
  });

  it("um corpo que não é objecto não rebenta", () => {
    expect(porqueFalhou(OQUE, { status: 400 }, null).mensagem).toContain(OQUE);
    expect(porqueFalhou(OQUE, { status: 400 }, "texto solto").mensagem).toContain(OQUE);
    expect(porqueFalhou(OQUE, { status: 400 }, { error: 42 }).mensagem).toContain(OQUE);
  });

  /** ── TODAS NOMEIAM A COISA ────────────────────────────────────────── */

  it("todas as frases genéricas dizem sobre O QUÊ é o aviso", () => {
    // Sem o nome, quem tem seis separadores abertos não sabe sobre o que é.
    for (const status of [401, 404, 409, 413, 429, 500, 400]) {
      expect(porqueFalhou(OQUE, { status }).mensagem, `status ${status}`).toContain(OQUE);
    }
    expect(porqueFalhou(OQUE, null).mensagem).toContain(OQUE);
  });

  it("nenhuma diz «algo correu mal»", () => {
    const todas = [null, ...[401, 404, 409, 413, 429, 500, 400].map((status) => ({ status }))].map(
      (r) => porqueFalhou(OQUE, r).mensagem,
    );
    for (const m of todas) {
      expect(m).not.toMatch(/algo correu mal|ocorreu um erro|erro inesperado/i);
      // E todas acabam com uma instrução: há um verbo no imperativo lá dentro.
      expect(m, m).toMatch(/repete|recarrega|volta a entrar|corta|espera/i);
    }
  });
});

describe("porqueRebentou", () => {
  it("um `catch` conta como «não chegou»", () => {
    expect(porqueRebentou(OQUE).mensagem).toBe(porqueFalhou(OQUE, null).mensagem);
  });
});
