import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";
import type { EventMaterialItem } from "./event-material-types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CHECKLIST DE UM EVENTO NÃO SE LÊ (NEM SE APAGA) TRAZENDO AS DE TODOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dois defeitos do mesmo feitio:
 *
 *   1. `listItemsOfEvent` fazia `list()` da tabela inteira e filtrava em
 *      memória. Isto é lido do telemóvel a meio de uma carga, e trazia as
 *      linhas de todos os eventos já feitos para dentro da função.
 *   2. `removeItemsOfEvent` apagava linha a linha EM SÉRIE: uma checklist de
 *      duzentas linhas eram duzentas idas ao servidor uma atrás da outra, com
 *      quem regenera a checklist a olhar para o ecrã.
 *
 * O duplo do Repository regista o que foi chamado e mede quantos apagamentos
 * estiveram no ar ao mesmo tempo.
 */
const db = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  chamadas: [] as string[],
  removidos: [] as string[],
  emCurso: 0,
  maxEmCurso: 0,
}));

vi.mock("./repository", () => ({
  createRepository: (mapper: Mapper<EventMaterialItem>) => ({
    list: async () => {
      db.chamadas.push("list");
      return [...db.rows.values()] as EventMaterialItem[];
    },
    where: async (column: string, value: unknown, predicate: (e: EventMaterialItem) => boolean) => {
      db.chamadas.push(`where:${column}=${String(value)}`);
      return ([...db.rows.values()] as EventMaterialItem[]).filter(predicate);
    },
    create: async (e: EventMaterialItem) => {
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
  listItemsOfEvent,
  listAllEventItems,
  addEventItem,
  removeItemsOfEvent,
} from "./event-material-items-store";

const linha = (over: Partial<EventMaterialItem>): EventMaterialItem => ({
  id: "i-1",
  eventId: "ev-1",
  name: "Castiçal",
  category: "Decoração",
  kind: "reutilizavel",
  qty: 2,
  critical: false,
  origin: "manual",
  originLabel: "",
  missing: false,
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

describe("listItemsOfEvent pede à base de dados só as linhas do evento", () => {
  it("filtra pela COLUNA, não em memória", async () => {
    db.rows.set("i-1", linha({ id: "i-1", eventId: "ev-1" }));
    db.rows.set("i-2", linha({ id: "i-2", eventId: "ev-2" }));

    const out = await listItemsOfEvent("ev-1");

    expect(out.map((i) => i.id)).toEqual(["i-1"]);
    expect(db.chamadas).toEqual(["where:event_id=ev-1"]);
    expect(db.chamadas).not.toContain("list");
  });

  it("mantém a ordem por categoria e depois por nome", async () => {
    db.rows.set("a", linha({ id: "a", category: "Mesa", name: "Prato" }));
    db.rows.set("b", linha({ id: "b", category: "Decoração", name: "Vela" }));
    db.rows.set("c", linha({ id: "c", category: "Decoração", name: "Castiçal" }));

    expect((await listItemsOfEvent("ev-1")).map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("`listAllEventItems` continua a ler a tabela toda — é quem faz a cópia", async () => {
    db.rows.set("i-1", linha({ id: "i-1" }));
    expect(await listAllEventItems()).toHaveLength(1);
    expect(db.chamadas).toEqual(["list"]);
  });
});

describe("removeItemsOfEvent apaga em grupos, não um de cada vez", () => {
  it("apaga TODAS as linhas do evento e nenhuma de outro", async () => {
    for (let i = 0; i < 20; i++) {
      await addEventItem(linha({ id: `i-${i}`, eventId: "ev-1" }));
    }
    await addEventItem(linha({ id: "de-outro", eventId: "ev-2" }));

    await removeItemsOfEvent("ev-1");

    expect(db.removidos).toHaveLength(20);
    expect(db.removidos).not.toContain("de-outro");
    expect(await listItemsOfEvent("ev-1")).toEqual([]);
  });

  it("os apagamentos sobrepõem-se — mas com tecto", async () => {
    for (let i = 0; i < 20; i++) {
      await addEventItem(linha({ id: `i-${i}`, eventId: "ev-1" }));
    }

    await removeItemsOfEvent("ev-1");

    // Em série o máximo seria 1: vinte esperas encadeadas.
    expect(db.maxEmCurso).toBeGreaterThan(1);
    // E sem tecto seriam vinte ligações abertas de uma vez.
    expect(db.maxEmCurso).toBeLessThanOrEqual(8);
  });
});
