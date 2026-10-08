import { describe, it, expect } from "vitest";
import { soMudaramOsIds, withServiceIds, type ServiceGroup } from "./proposal-doc";

/** Achado n.º 1 da auditoria: o estúdio carimbava ids nas linhas de Serviços ao
 *  abrir, e isso contava como «a pessoa escreveu» — o rascunho do servidor
 *  deixava de ser fundido e as linhas da outra sessão perdiam-se. */
describe("proposal-doc — soMudaramOsIds", () => {
  const semIds: ServiceGroup[] = [
    { title: "Decoração", items: [{ label: "Mesa", desc: "flores" }, { label: "Arco" }] },
  ];

  it("carimbar ids não é uma edição", () => {
    expect(soMudaramOsIds(semIds, withServiceIds(semIds))).toBe(true);
  });

  it("vazio e ausente são a mesma coisa", () => {
    expect(soMudaramOsIds(undefined, [])).toBe(true);
  });

  it("mudar um texto é uma edição", () => {
    const depois = withServiceIds(semIds).map((g) => ({ ...g, title: "Flores" }));
    expect(soMudaramOsIds(semIds, depois)).toBe(false);
  });

  it("acrescentar ou tirar uma linha é uma edição", () => {
    const [g] = withServiceIds(semIds);
    expect(soMudaramOsIds(semIds, [{ ...g, items: g.items.slice(1) }])).toBe(false);
    expect(soMudaramOsIds(semIds, [...semIds, { title: "", items: [] }])).toBe(false);
  });

  it("trocar a ordem é uma edição", () => {
    const [g] = semIds;
    expect(soMudaramOsIds(semIds, [{ ...g, items: [...g.items].reverse() }])).toBe(false);
  });
});
