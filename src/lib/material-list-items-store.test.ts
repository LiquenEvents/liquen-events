import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";
import type { MaterialListItem } from "./material-list-types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS LINHAS DE UMA LISTA BASE — LIDAS E APAGADAS SÓ AS DELA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O mesmo par de defeitos das linhas de evento: `listItemsOf` trazia a tabela
 * inteira para filtrar em memória, e `removeItemsOf` apagava linha a linha em
 * série (apagar ou duplicar uma lista de cem linhas eram cem idas ao servidor
 * uma atrás da outra). O `Repository.where()` já existia e já era usado noutros
 * stores.
 */
const db = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  chamadas: [] as string[],
  removidos: [] as string[],
  emCurso: 0,
  maxEmCurso: 0,
}));

vi.mock("./repository", () => ({
  createRepository: (mapper: Mapper<MaterialListItem>) => ({
    list: async () => {
      db.chamadas.push("list");
      return [...db.rows.values()] as MaterialListItem[];
    },
    where: async (column: string, value: unknown, predicate: (e: MaterialListItem) => boolean) => {
      db.chamadas.push(`where:${column}=${String(value)}`);
      return ([...db.rows.values()] as MaterialListItem[]).filter(predicate);
    },
    create: async (e: MaterialListItem) => {
      db.rows.set(mapper.getId(e), e);
    },
    update: async () => null,
    remove: async (id: string) => {
      db.emCurso++;
      db.maxEmCurso = Math.max(db.maxEmCurso, db.emCurso);
      await new Promise((r) => setTimeout(r, 2));
      db.emCurso--;
      db.removidos.push(id);
      db.rows.delete(id);
    },
  }),
}));

import {
  listItemsOf,
  listAllListItems,
  addListItem,
  removeItemsOf,
} from "./material-list-items-store";

const linha = (over: Partial<MaterialListItem>): MaterialListItem => ({
  id: "l-1",
  listId: "lista-1",
  itemId: "it-1",
  qty: 1,
  critical: false,
  position: 0,
  ...over,
});

beforeEach(() => {
  db.rows.clear();
  db.chamadas = [];
  db.removidos = [];
  db.emCurso = 0;
  db.maxEmCurso = 0;
  vi.clearAllMocks();
});

describe("listItemsOf pede à base de dados só as linhas da lista", () => {
  it("filtra pela COLUNA, não em memória", async () => {
    db.rows.set("l-1", linha({ id: "l-1", listId: "lista-1" }));
    db.rows.set("l-2", linha({ id: "l-2", listId: "lista-2" }));

    const out = await listItemsOf("lista-1");

    expect(out.map((i) => i.id)).toEqual(["l-1"]);
    expect(db.chamadas).toEqual(["where:list_id=lista-1"]);
    expect(db.chamadas).not.toContain("list");
  });

  it("mantém a ordem pela posição", async () => {
    db.rows.set("a", linha({ id: "a", position: 2 }));
    db.rows.set("b", linha({ id: "b", position: 0 }));

    expect((await listItemsOf("lista-1")).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("`listAllListItems` continua a ler a tabela toda — é quem faz a cópia", async () => {
    db.rows.set("l-1", linha({ id: "l-1" }));
    expect(await listAllListItems()).toHaveLength(1);
    expect(db.chamadas).toEqual(["list"]);
  });
});

describe("removeItemsOf apaga em grupos, não um de cada vez", () => {
  it("apaga TODAS as linhas da lista e nenhuma de outra", async () => {
    for (let i = 0; i < 20; i++) {
      await addListItem(linha({ id: `l-${i}`, listId: "lista-1", position: i }));
    }
    await addListItem(linha({ id: "de-outra", listId: "lista-2" }));

    await removeItemsOf("lista-1");

    expect(db.removidos).toHaveLength(20);
    expect(db.removidos).not.toContain("de-outra");
    expect(await listItemsOf("lista-1")).toEqual([]);
  });

  it("os apagamentos sobrepõem-se — mas com tecto", async () => {
    for (let i = 0; i < 20; i++) {
      await addListItem(linha({ id: `l-${i}`, listId: "lista-1", position: i }));
    }

    await removeItemsOf("lista-1");

    expect(db.maxEmCurso).toBeGreaterThan(1);
    expect(db.maxEmCurso).toBeLessThanOrEqual(8);
  });
});
