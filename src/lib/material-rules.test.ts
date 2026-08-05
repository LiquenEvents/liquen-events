import { describe, it, expect } from "vitest";
import {
  gerarChecklist,
  regraDispara,
  type MaterialRule,
  type ContextoEvento,
} from "./material-rules";
import type { MaterialItem } from "./material-types";
import type { MaterialList, MaterialListItem } from "./material-list-types";

/**
 * O QUE VAI NA CARRINHA.
 *
 * O erro que importa não é um item a mais — é um a menos, descoberto a 200 km
 * de casa. Estes testes prendem as regras de junção que evitam isso, e a
 * explicabilidade sem a qual a lista deixa de ser usada.
 */

const item = (id: string, over: Partial<MaterialItem> = {}): MaterialItem => ({
  id,
  name: id,
  category: "Ferramentas",
  kind: "reutilizavel",
  unit: "unidade",
  stock: 5,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const lista = (id: string, over: Partial<MaterialList> = {}): MaterialList => ({
  id,
  name: id,
  isDefault: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const linha = (
  listId: string,
  itemId: string,
  over: Partial<MaterialListItem> = {},
): MaterialListItem => ({
  id: `${listId}-${itemId}`,
  listId,
  itemId,
  qty: 1,
  critical: false,
  position: 0,
  ...over,
});

const regra = (over: Partial<MaterialRule> = {}): MaterialRule => ({
  id: "r1",
  name: "Regra",
  enabled: true,
  matchKind: "sempre",
  action: "add_list",
  position: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const ctx = (over: Partial<ContextoEvento> = {}): ContextoEvento => ({
  servicos: [],
  texto: "",
  pax: 120,
  ...over,
});

describe("regraDispara", () => {
  it("encontra o serviço sem ligar a acentos nem maiúsculas", () => {
    const r = regra({ matchKind: "servico", matchValue: "arco floral" });
    expect(regraDispara(r, ctx({ servicos: ["Arco Floral na cerimónia"] }))).toBe(true);
    expect(regraDispara(r, ctx({ servicos: ["Centros de mesa"] }))).toBe(false);
  });

  it("uma regra desligada nunca dispara, mesmo que encaixe", () => {
    const r = regra({ enabled: false, matchKind: "servico", matchValue: "velas" });
    expect(regraDispara(r, ctx({ servicos: ["Velas nas mesas"] }))).toBe(false);
  });

  it("regra de serviço SEM valor não dispara — não é um 'sempre' disfarçado", () => {
    // Deixar passar isto fazia uma regra meio escrita acrescentar material a
    // todos os eventos, e ninguém percebia porquê.
    const r = regra({ matchKind: "servico", matchValue: "" });
    expect(regraDispara(r, ctx({ servicos: ["Seja o que for"] }))).toBe(false);
  });

  it("a regra de convidados é um mínimo, não uma igualdade", () => {
    const r = regra({ matchKind: "pax", matchValue: "100" });
    expect(regraDispara(r, ctx({ pax: 100 }))).toBe(true);
    expect(regraDispara(r, ctx({ pax: 250 }))).toBe(true);
    expect(regraDispara(r, ctx({ pax: 99 }))).toBe(false);
  });
});

describe("gerarChecklist", () => {
  const catalogo = [
    item("escadote", { name: "Escadote", category: "Ferramentas" }),
    item("extensao", { name: "Extensão", category: "Iluminação" }),
    item("sacos", { name: "Sacos do lixo", category: "Limpeza", kind: "consumivel" }),
  ];

  it("começa pelos essenciais, e diz que vieram de lá", () => {
    const out = gerarChecklist(ctx(), {
      regras: [],
      listas: [lista("essenciais", { name: "Essenciais de carrinha", isDefault: true })],
      linhasDeLista: [linha("essenciais", "escadote", { critical: true })],
      catalogo,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: "Escadote",
      critical: true,
      origin: "base",
      originLabel: "Essenciais de carrinha",
    });
  });

  it("o mesmo item vindo de dois sítios NÃO aparece duas vezes", () => {
    // Uma linha repetida lê-se como um engano e faz perder a confiança na
    // lista inteira — e depois ninguém a usa.
    const out = gerarChecklist(ctx(), {
      regras: [regra({ id: "r1", name: "Iluminação", listId: "extra" })],
      listas: [
        lista("essenciais", { name: "Essenciais", isDefault: true }),
        lista("extra", { name: "Extra" }),
      ],
      linhasDeLista: [
        linha("essenciais", "extensao", { qty: 2 }),
        linha("extra", "extensao", { qty: 3 }),
      ],
      catalogo,
    });
    expect(out).toHaveLength(1);
    // Fica a MAIOR: levar três quando uma origem pedia três é o que evita a
    // viagem à loja.
    expect(out[0].qty).toBe(3);
    // E o rótulo soma as origens, para se perceber porque é que são três.
    expect(out[0].originLabel).toContain("Essenciais");
    expect(out[0].originLabel).toContain("Iluminação");
  });

  it("ser crítico é contagioso — basta uma origem marcar", () => {
    const out = gerarChecklist(ctx(), {
      regras: [regra({ listId: "extra" })],
      listas: [
        lista("essenciais", { isDefault: true, name: "Essenciais" }),
        lista("extra", { name: "Extra" }),
      ],
      linhasDeLista: [
        linha("essenciais", "escadote", { critical: false }),
        linha("extra", "escadote", { critical: true }),
      ],
      catalogo,
    });
    expect(out[0].critical).toBe(true);
  });

  it("as quantidades que escalam usam os convidados do evento", () => {
    const out = gerarChecklist(ctx({ pax: 120 }), {
      regras: [],
      listas: [lista("essenciais", { isDefault: true, name: "Essenciais" })],
      linhasDeLista: [linha("essenciais", "sacos", { qty: 2, qtyPerPax: 1 / 50 })],
      catalogo,
    });
    expect(out[0].qty).toBe(3);
  });

  it("um item apagado do catálogo não entra como linha sem nome", () => {
    // Uma linha "(item removido)" na carrinha não diz nada a ninguém.
    const out = gerarChecklist(ctx(), {
      regras: [],
      listas: [lista("essenciais", { isDefault: true, name: "Essenciais" })],
      linhasDeLista: [linha("essenciais", "ja-nao-existe")],
      catalogo,
    });
    expect(out).toEqual([]);
  });

  it("uma regra que não dispara não traz nada", () => {
    const out = gerarChecklist(ctx({ servicos: ["Mesas"] }), {
      regras: [regra({ matchKind: "servico", matchValue: "arco floral", listId: "extra" })],
      listas: [lista("extra", { name: "Extra" })],
      linhasDeLista: [linha("extra", "escadote")],
      catalogo,
    });
    expect(out).toEqual([]);
  });

  it("sai agrupada por categoria — é assim que se carrega uma carrinha", () => {
    const out = gerarChecklist(ctx(), {
      regras: [],
      listas: [lista("e", { isDefault: true, name: "Essenciais" })],
      linhasDeLista: [linha("e", "sacos"), linha("e", "escadote"), linha("e", "extensao")],
      catalogo,
    });
    expect(out.map((l) => l.category)).toEqual(["Ferramentas", "Iluminação", "Limpeza"]);
  });
});
