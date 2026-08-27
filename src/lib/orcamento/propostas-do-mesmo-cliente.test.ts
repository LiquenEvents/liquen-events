import { describe, expect, it } from "vitest";
import type { Proposal } from "./types";
import { chaveDoCliente, lugaresNoCliente, etiquetaDoLugar } from "./propostas-do-mesmo-cliente";

/**
 * A-01 da auditoria, a metade que se pode fazer sem tocar nos dados.
 *
 * O que este ficheiro guarda não é «conta as propostas» — é as três decisões
 * que fazem a diferença entre isto ajudar e isto enganar:
 *
 *   · quem está sozinho não é caso nenhum;
 *   · sem email não há grupo (juntar todos os sem-email era inventar um
 *     cliente de doze cabeças);
 *   · a ordem não pode dançar entre desenhos.
 */

const p = (id: string, clientEmail: string, createdAt: string) =>
  ({ id, clientEmail, createdAt }) as Pick<Proposal, "id" | "clientEmail" | "createdAt">;

describe("as propostas do mesmo cliente", () => {
  it("numera-as da mais antiga para a mais recente", () => {
    const lugares = lugaresNoCliente([
      p("B", "melanie@example.com", "2026-05-02T10:00:00Z"),
      p("A", "melanie@example.com", "2026-03-11T10:00:00Z"),
    ]);
    expect(lugares.get("A")).toEqual({ ordem: 1, total: 2 });
    expect(lugares.get("B")).toEqual({ ordem: 2, total: 2 });
  });

  it("não diz nada de quem está sozinho", () => {
    // «1 de 1» não é informação: é ruído em cada linha da lista.
    const lugares = lugaresNoCliente([p("A", "so@example.com", "2026-03-11T10:00:00Z")]);
    expect(lugares.size).toBe(0);
  });

  it("junta o mesmo email escrito de outra maneira", () => {
    // `Melanie@Example.com ` e `melanie@example.com` são a mesma caixa de
    // correio. Um espaço à direita entra em qualquer formulário.
    const lugares = lugaresNoCliente([
      p("A", "Melanie@Example.com ", "2026-03-11T10:00:00Z"),
      p("B", "melanie@example.com", "2026-05-02T10:00:00Z"),
    ]);
    expect(lugares.get("A")?.total).toBe(2);
  });

  it("NÃO junta quem não tem email — isso era inventar um cliente", () => {
    const lugares = lugaresNoCliente([
      p("A", "", "2026-03-11T10:00:00Z"),
      p("B", "   ", "2026-05-02T10:00:00Z"),
      p("C", "", "2026-06-02T10:00:00Z"),
    ]);
    expect(lugares.size).toBe(0);
    expect(chaveDoCliente("   ")).toBeNull();
  });

  it("não junta clientes diferentes", () => {
    const lugares = lugaresNoCliente([
      p("A", "melanie@example.com", "2026-03-11T10:00:00Z"),
      p("B", "duarte@example.com", "2026-05-02T10:00:00Z"),
    ]);
    expect(lugares.size).toBe(0);
  });

  it("dá sempre a mesma ordem, mesmo com datas iguais", () => {
    // Sem o desempate pelo `id`, duas propostas criadas no mesmo segundo
    // trocavam de número entre desenhos — e um número que dança lê-se como uma
    // aplicação avariada.
    const mesmoInstante = "2026-03-11T10:00:00Z";
    const entrada = [
      p("Z", "m@example.com", mesmoInstante),
      p("A", "m@example.com", mesmoInstante),
    ];
    const uma = lugaresNoCliente(entrada);
    const outra = lugaresNoCliente([...entrada].reverse());
    expect(uma.get("A")).toEqual(outra.get("A"));
    expect(uma.get("A")?.ordem).toBe(1);
  });

  it("escreve-se em português e cabe numa linha", () => {
    expect(etiquetaDoLugar({ ordem: 2, total: 3 })).toBe("2.ª de 3");
  });
});
