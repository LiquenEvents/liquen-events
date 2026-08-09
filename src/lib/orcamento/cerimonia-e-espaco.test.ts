import { describe, it, expect } from "vitest";
import { CEREMONY_TYPES, SPACE_TYPES, ceremonyTypeLabel, spaceTypeLabel } from "./data";
import { quoteFormSchema } from "../validation";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CIVIL OU RELIGIOSA, INTERIOR OU EXTERIOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas perguntas novas no formulário público, e as duas mudam o trabalho antes
 * de mudarem o preço: uma cerimónia religiosa é um segundo espaço para decorar
 * no mesmo dia, e um evento ao ar livre traz sempre uma montagem alternativa
 * para o caso de o tempo virar.
 *
 * O que se guarda aqui são as três propriedades que fazem isto funcionar:
 *
 *   1. o VALIDADOR deixa passar os campos — o esquema faz `.strip()`, e um
 *      campo não declarado é deitado fora em silêncio, que é a avaria que não
 *      dá erro nenhum: o cliente escolhe, a rota aceita, e a resposta nunca
 *      chega à base de dados;
 *   2. a LEITURA é que decide o que é válido — um identificador que não esteja
 *      no catálogo devolve vazio, e uma linha vazia não é desenhada em lado
 *      nenhum;
 *   3. os rótulos existem nas DUAS línguas, porque metade do resumo em inglês
 *      e metade em português é pior do que só uma delas.
 */

const pedidoBase = {
  name: "Ana Ferreira",
  email: "ana@exemplo.pt",
  phone: "912345678",
};

describe("o validador deixa passar a cerimónia e o espaço", () => {
  it("os dois campos sobrevivem ao esquema", () => {
    const r = quoteFormSchema.safeParse({
      ...pedidoBase,
      ceremonyType: "religiosa",
      spaceType: "interior-exterior",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.ceremonyType).toBe("religiosa");
    expect(r.success && r.data.spaceType).toBe("interior-exterior");
  });

  /**
   * Um pedido feito antes destes campos existirem — e um pedido de quem
   * simplesmente não respondeu, que é o caso mais comum — não pode falhar nem
   * ganhar um valor inventado.
   */
  it("um pedido sem eles continua válido, e fica vazio", () => {
    const r = quoteFormSchema.safeParse(pedidoBase);
    expect(r.success).toBe(true);
    expect(r.success && r.data.ceremonyType).toBe("");
    expect(r.success && r.data.spaceType).toBe("");
  });

  it("um valor enorme é recusado antes de chegar à base de dados", () => {
    const r = quoteFormSchema.safeParse({ ...pedidoBase, spaceType: "x".repeat(400) });
    expect(r.success).toBe(false);
  });
});

describe("a leitura é que decide o que é válido", () => {
  it("cada opção do catálogo tem rótulo nas duas línguas", () => {
    for (const o of [...CEREMONY_TYPES, ...SPACE_TYPES]) {
      expect(o.label.length, o.id).toBeGreaterThan(0);
      expect(o.en.length, o.id).toBeGreaterThan(0);
    }
  });

  it("devolve o rótulo na língua do pedido", () => {
    expect(ceremonyTypeLabel("civil-religiosa")).toBe("Civil e religiosa");
    expect(ceremonyTypeLabel("civil-religiosa", "en")).toBe("Civil and religious");
    expect(spaceTypeLabel("exterior")).toBe("Exterior");
    expect(spaceTypeLabel("exterior", "en")).toBe("Outdoors");
  });

  /**
   * A razão por que os campos são identificadores livres no servidor e não um
   * enum fechado: acrescentar uma opção ao catálogo não pode exigir uma
   * alteração coordenada no validador. O preço disso é este — o que não
   * conhecemos tem de morrer na leitura, e não a meio de um email.
   */
  it("um identificador que não existe devolve vazio, e não o próprio texto", () => {
    for (const lixo of ["<script>alert(1)</script>", "inventado", "", null, undefined, 42]) {
      expect(ceremonyTypeLabel(lixo)).toBe("");
      expect(spaceTypeLabel(lixo)).toBe("");
    }
  });

  it("os identificadores não se repetem entre si", () => {
    const ids = [...CEREMONY_TYPES, ...SPACE_TYPES].map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
