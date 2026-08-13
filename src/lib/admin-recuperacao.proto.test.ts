import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS TABELAS DA RECUPERAÇÃO NÃO PODEM CONTAMINAR O PROCESSO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `pedidos` e `senhas` são indexadas por um endereço de email que vem de fora.
 * Num objecto normal de JavaScript, escrever na chave `__proto__` não cria uma
 * entrada: muda o que TODOS os objectos do processo herdam. A partir daí, um
 * `registo.qualquerCoisa` passa a devolver o que o atacante lá pôs, em código
 * que nunca ouviu falar de recuperação de palavras-passe.
 *
 * A análise de segurança do GitHub apontou para a linha que escreve nessa
 * tabela e chamou-lhe «remote property injection». Tinha razão a apontar,
 * embora o caminho estivesse fechado por acaso noutro ficheiro — e uma defesa
 * acidental é uma defesa que a próxima pessoa desfaz sem saber.
 *
 * Isto prende a defesa no sítio onde o conteúdo guardado ENTRA.
 */

const estado = vi.hoisted(() => ({ mapa: new Map<string, unknown>() }));

vi.mock("./app-state", () => ({
  getState: vi.fn(async (k: string) => {
    const v = estado.mapa.get(k);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }),
  setState: vi.fn(async (k: string, v: unknown) => {
    estado.mapa.set(k, JSON.parse(JSON.stringify(v)));
    return { gravado: true, onde: "servidor", duradouro: true };
  }),
}));

const { lerRegisto, registoVazio, CHAVE_ESTADO } = await import("./admin-recuperacao");

describe("as tabelas da recuperação não herdam nada", () => {
  beforeEach(() => {
    estado.mapa.clear();
  });

  it("um registo vazio vem sem prototype", () => {
    const r = registoVazio();
    expect(Object.getPrototypeOf(r.pedidos)).toBe(null);
    expect(Object.getPrototypeOf(r.senhas)).toBe(null);
  });

  it("o que foi lido do armazenamento também vem sem prototype", async () => {
    estado.mapa.set(CHAVE_ESTADO, {
      pedidos: { "ana@exemplo.pt": { resumo: "x", expiraEm: 1, pedidoEm: 0 } },
      senhas: {},
    });
    const r = await lerRegisto();
    expect(Object.getPrototypeOf(r.pedidos)).toBe(null);
    expect(r.pedidos["ana@exemplo.pt"]?.resumo).toBe("x");
  });

  it("uma chave `__proto__` guardada é uma entrada, não uma herança", async () => {
    // Um registo estragado — de propósito ou por acidente — com a chave
    // perigosa lá dentro. Note-se que isto entra por JSON, que é o caminho
    // verdadeiro: `JSON.parse` cria uma propriedade normal chamada
    // `__proto__`, e é a CÓPIA para um objecto normal que a transformaria em
    // herança.
    estado.mapa.set(
      CHAVE_ESTADO,
      JSON.parse('{"pedidos":{"__proto__":{"resumo":"veneno"}},"senhas":{}}'),
    );

    const r = await lerRegisto();

    // A entrada existe, e é só uma entrada.
    expect(r.pedidos["__proto__"]).toEqual({ resumo: "veneno" });
    // E não contaminou nada: um objecto acabado de fazer não sabe nada disto.
    expect(({} as Record<string, unknown>).resumo).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("resumo");
  });

  it("escrever numa chave perigosa não muda os objectos do processo", async () => {
    const r = registoVazio();
    r.pedidos["__proto__"] = { resumo: "veneno", expiraEm: 0, pedidoEm: 0 };
    r.senhas["constructor"] = { hash: "veneno", definidaEm: 0, substituiu: "" };

    expect(({} as Record<string, unknown>).resumo).toBeUndefined();
    expect(({} as Record<string, unknown>).hash).toBeUndefined();
    // E o objecto continua a ser utilizável: a entrada está lá para ser lida.
    expect(r.pedidos["__proto__"]?.resumo).toBe("veneno");
  });

  it("uma tabela ausente ou de um tipo errado não rebenta nem herda", async () => {
    for (const guardado of [
      {},
      { pedidos: null, senhas: undefined },
      { pedidos: "não é um objecto", senhas: 42 },
    ]) {
      estado.mapa.set(CHAVE_ESTADO, guardado);
      const r = await lerRegisto();
      expect(Object.getPrototypeOf(r.pedidos)).toBe(null);
      expect(Object.getPrototypeOf(r.senhas)).toBe(null);
      expect(Object.keys(r.pedidos)).toEqual([]);
    }
  });
});
