import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";
import type { EventMaterialLog } from "./event-material-log-store";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O REGISTO DE UM EVENTO NÃO SE LÊ TRAZENDO O REGISTO DE TODOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Esta tabela é append-only: cresce a cada marcação de material de cada evento
 * e nunca encolhe. `listLogOf` fazia `list()` da tabela inteira e filtrava em
 * memória — ao fim de uma época, ver quem carregou o escadote de UM casamento
 * passava por trazer o registo de todos os outros para dentro da função.
 *
 * O `Repository.where()` existe e é usado noutros stores; é ele que empurra o
 * filtro para a base de dados. O duplo aqui distingue as duas coisas: regista o
 * que foi chamado (`list` ou `where`) e aplica o PREDICADO — que é a metade que
 * serve o backend de ficheiro e que tem de estar de acordo com a coluna.
 */
const db = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  chamadas: [] as string[],
}));

vi.mock("./repository", () => ({
  createRepository: (mapper: Mapper<EventMaterialLog>) => ({
    list: async () => {
      db.chamadas.push("list");
      return [...db.rows.values()] as EventMaterialLog[];
    },
    where: async (column: string, value: unknown, predicate: (e: EventMaterialLog) => boolean) => {
      db.chamadas.push(`where:${column}=${String(value)}`);
      return ([...db.rows.values()] as EventMaterialLog[]).filter(predicate);
    },
    create: async (e: EventMaterialLog) => {
      db.rows.set(mapper.getId(e), e);
    },
  }),
}));

import { mapper, listLogOf, listAllLog, registar } from "./event-material-log-store";

const linha = (over: Partial<EventMaterialLog>): EventMaterialLog => ({
  id: "l-1",
  eventId: "ev-1",
  itemId: "it-1",
  action: "loaded",
  actor: "Catarina",
  markedAt: "2026-05-16T09:00:00.000Z",
  syncedAt: "2026-05-16T09:00:01.000Z",
  superseded: false,
  ...over,
});

beforeEach(() => {
  db.rows.clear();
  db.chamadas = [];
  vi.clearAllMocks();
});

describe("listLogOf pede à base de dados só o que é do evento", () => {
  it("filtra pela COLUNA, não em memória", async () => {
    db.rows.set("l-1", linha({ id: "l-1", eventId: "ev-1" }));
    db.rows.set("l-2", linha({ id: "l-2", eventId: "ev-2" }));

    const out = await listLogOf("ev-1");

    expect(out.map((l) => l.id)).toEqual(["l-1"]);
    // A asserção que importa: a tabela inteira NUNCA foi lida.
    expect(db.chamadas).toEqual(["where:event_id=ev-1"]);
    expect(db.chamadas).not.toContain("list");
  });

  it("o predicado do backend de ficheiro concorda com a coluna", async () => {
    db.rows.set("l-1", linha({ id: "l-1", eventId: "ev-1" }));
    db.rows.set("l-2", linha({ id: "l-2", eventId: "outro" }));

    // O duplo aplica o predicado: se ele olhasse para o campo errado, isto
    // trazia a linha do outro evento — que é o defeito com outra roupa.
    expect((await listLogOf("ev-1")).map((l) => l.id)).toEqual(["l-1"]);
  });

  it("continua a vir do mais recente para o mais antigo", async () => {
    db.rows.set("velha", linha({ id: "velha", markedAt: "2026-05-16T08:00:00.000Z" }));
    db.rows.set("nova", linha({ id: "nova", markedAt: "2026-05-16T10:00:00.000Z" }));

    expect((await listLogOf("ev-1")).map((l) => l.id)).toEqual(["nova", "velha"]);
  });

  it("`listAllLog` continua a ser a leitura da tabela toda — é quem faz a cópia", async () => {
    db.rows.set("l-1", linha({ id: "l-1" }));
    expect(await listAllLog()).toHaveLength(1);
    expect(db.chamadas).toEqual(["list"]);
  });
});

describe("registar", () => {
  it("dá id e carimbo de servidor, e a marcação fica lá", async () => {
    const l = await registar({
      eventId: "ev-1",
      itemId: "it-9",
      action: "missing",
      actor: "Rui",
      markedAt: "2026-05-16T09:30:00.000Z",
      superseded: false,
    });

    expect(l.id).toMatch(/[0-9a-f-]{36}/);
    expect(l.syncedAt).toBeTruthy();
    expect((await listLogOf("ev-1")).map((x) => x.itemId)).toEqual(["it-9"]);
  });

  it("o mapper leva e traz a linha sem a estragar", () => {
    const l = linha({ value: "3", superseded: true });
    expect(mapper.fromRow(mapper.toRow(l))).toEqual(l);
  });
});
