import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";

/**
 * O armazém das notas da equipa e da meta de receita.
 *
 * O `Repository` genérico (backends, ler-fundir-escrever, tranca optimista) já
 * está provado em `repository.test.ts`; aqui prende-se o que é DESTE módulo: o
 * compare-and-set visível sobre `revision` — a regra que decide se duas pessoas
 * a escrever ao mesmo tempo perdem texto ou são avisadas.
 */
const db = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  captured: null as unknown,
  falharCriacao: null as unknown,
}));

vi.mock("./repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repository")>();
  return {
    ...actual,
    createRepository: (mapper: Mapper<OverviewField>) => {
      db.captured = mapper;
      return {
        list: async () => {
          const all = [...db.rows.values()] as OverviewField[];
          return mapper.fileCompare ? [...all].sort(mapper.fileCompare) : all;
        },
        get: async (id: string) => (db.rows.get(id) as OverviewField | undefined) ?? null,
        create: async (e: OverviewField) => {
          if (db.falharCriacao) throw db.falharCriacao;
          db.rows.set(mapper.getId(e), e);
        },
        // Espelha Repository.updateWith: lê o actual, deixa o chamador derivar
        // o novo (podendo recusar), grava. Null quando a linha não existe.
        updateWith: async (id: string, mutate: (cur: OverviewField) => OverviewField) => {
          const cur = db.rows.get(id) as OverviewField | undefined;
          if (!cur) return null;
          const merged = mutate(cur);
          db.rows.set(id, merged);
          return merged;
        },
      };
    },
  };
});

import {
  mapper,
  emptyField,
  isOverviewFieldId,
  readOverviewSettings,
  saveOverviewField,
  StaleWriteError,
  type OverviewField,
} from "./overview-settings-store";

const seed = (f: OverviewField) => db.rows.set(f.id, f);
const campo = (over: Partial<OverviewField> = {}): OverviewField => ({
  id: "notas",
  value: "texto",
  revision: 1,
  updatedAt: "2026-07-01T09:00:00.000Z",
  ...over,
});

beforeEach(() => {
  db.rows.clear();
  db.falharCriacao = null;
  vi.clearAllMocks();
});

describe("ler", () => {
  it("um back office estreado devolve os dois campos vazios na revisão 0", async () => {
    const snap = await readOverviewSettings();
    expect(snap.notas).toEqual(emptyField("notas"));
    expect(snap.meta).toEqual(emptyField("meta"));
  });

  it("devolve o que está gravado, campo a campo", async () => {
    seed(campo({ id: "notas", value: "Ligar ao fotógrafo", revision: 4 }));
    seed(campo({ id: "meta", value: "15000", revision: 2 }));
    const snap = await readOverviewSettings();
    expect(snap.notas.value).toBe("Ligar ao fotógrafo");
    expect(snap.notas.revision).toBe(4);
    expect(snap.meta.value).toBe("15000");
  });

  it("um campo gravado e o outro não: o que falta vem vazio, nunca em falta", async () => {
    seed(campo({ id: "notas", value: "só notas", revision: 1 }));
    const snap = await readOverviewSettings();
    expect(snap.meta).toEqual(emptyField("meta"));
  });

  it("ignora linhas com um id que a aplicação não conhece", async () => {
    db.rows.set("lixo", campo({ id: "lixo" as "notas", value: "não devia estar aqui" }));
    const snap = await readOverviewSettings();
    expect(snap.notas.value).toBe("");
    expect(Object.keys(snap).sort()).toEqual(["meta", "notas"]);
  });
});

describe("gravar", () => {
  it("a primeira gravação cria a linha na revisão 1", async () => {
    const guardado = await saveOverviewField("notas", "Primeira nota", 0);
    expect(guardado.revision).toBe(1);
    expect(guardado.value).toBe("Primeira nota");
    expect((await readOverviewSettings()).notas.value).toBe("Primeira nota");
  });

  it("a gravação seguinte sobe a revisão e carimba a hora", async () => {
    seed(campo({ revision: 1, updatedAt: "2026-01-01T00:00:00.000Z" }));
    const guardado = await saveOverviewField("notas", "Segunda versão", 1);
    expect(guardado.revision).toBe(2);
    expect(+new Date(guardado.updatedAt)).toBeGreaterThan(+new Date("2026-01-01T00:00:00.000Z"));
  });

  it("esvaziar é uma gravação como as outras (não é um não-fazer-nada)", async () => {
    seed(campo({ value: "texto antigo", revision: 5 }));
    const guardado = await saveOverviewField("notas", "", 5);
    expect(guardado.value).toBe("");
    expect(guardado.revision).toBe(6);
  });

  it("os dois campos têm revisões independentes", async () => {
    await saveOverviewField("notas", "n", 0);
    await saveOverviewField("notas", "n2", 1);
    // A meta continua na revisão 0: escrever notas não invalida a meta aberta
    // noutro dispositivo.
    const guardada = await saveOverviewField("meta", "15000", 0);
    expect(guardada.revision).toBe(1);
  });
});

describe("duas pessoas ao mesmo tempo", () => {
  it("gravar sobre uma revisão antiga é RECUSADO e não toca no que lá está", async () => {
    seed(campo({ value: "o que a Ana escreveu", revision: 4 }));
    await expect(saveOverviewField("notas", "o que eu escrevi", 3)).rejects.toBeInstanceOf(
      StaleWriteError,
    );
    expect((await readOverviewSettings()).notas.value).toBe("o que a Ana escreveu");
  });

  it("o erro transporta a versão do servidor, para se poderem mostrar as duas", async () => {
    seed(campo({ value: "o que a Ana escreveu", revision: 4 }));
    const erro = await saveOverviewField("notas", "o meu", 3).catch((e) => e);
    expect(erro).toBeInstanceOf(StaleWriteError);
    expect((erro as StaleWriteError).current.value).toBe("o que a Ana escreveu");
    expect((erro as StaleWriteError).current.revision).toBe(4);
  });

  it("gravar duas vezes com a MESMA revisão base: a segunda é recusada", async () => {
    seed(campo({ value: "base", revision: 1 }));
    await saveOverviewField("notas", "versão A", 1);
    await expect(saveOverviewField("notas", "versão B", 1)).rejects.toBeInstanceOf(StaleWriteError);
    expect((await readOverviewSettings()).notas.value).toBe("versão A");
  });

  it("estrear um campo com uma revisão que não é 0 é conflito, não uma criação", async () => {
    await expect(saveOverviewField("notas", "x", 2)).rejects.toBeInstanceOf(StaleWriteError);
    expect((await readOverviewSettings()).notas.value).toBe("");
  });

  it("dois dispositivos a estrear o mesmo campo: o segundo insert é conflito, não 500", async () => {
    db.falharCriacao = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    // A linha "já lá está" porque o outro dispositivo ganhou a corrida.
    seed(campo({ value: "o do outro dispositivo", revision: 1 }));
    db.rows.delete("notas");
    const promessa = saveOverviewField("notas", "o meu", 0);
    // O `get` inicial não encontrou nada; a criação bate na chave primária.
    await expect(promessa).rejects.toBeInstanceOf(StaleWriteError);
  });

  it("uma falha de escrita que NÃO é duplicado sobe tal e qual (não vira conflito)", async () => {
    db.falharCriacao = new Error("ligação perdida");
    await expect(saveOverviewField("notas", "x", 0)).rejects.toThrow("ligação perdida");
  });
});

describe("mapper (camelCase ↔ snake_case)", () => {
  it("faz a ida e volta de um campo completo", () => {
    const f = campo({ id: "meta", value: "15000", revision: 9 });
    expect(mapper.fromRow(mapper.toRow(f))).toEqual(f);
    expect(mapper.getId(f)).toBe("meta");
  });

  it("uma linha nova lê-se como vazia na revisão 0, nunca como 'null'", () => {
    const back = mapper.fromRow({ id: "notas", value: null, revision: null });
    expect(back.value).toBe("");
    expect(back.revision).toBe(0);
    expect(back.updatedAt).toBeTruthy();
  });

  it("uma revisão que não é número lê-se como 0 (nunca NaN, que quebraria o CAS)", () => {
    expect(mapper.fromRow({ id: "notas", revision: "lixo" }).revision).toBe(0);
    expect(mapper.fromRow({ id: "notas", revision: "7" }).revision).toBe(7);
  });

  it("a tabela e o ficheiro de recurso são os esperados", () => {
    expect(mapper.table).toBe("overview_settings");
    expect(mapper.fileName).toBe("overview-settings.json");
    // `touch` é a segunda tranca: sem ele, duas gravações na mesma milésima
    // sobre a mesma revisão passavam as duas.
    expect(mapper.touch).toBe(true);
  });

  it("isOverviewFieldId só deixa passar os dois campos conhecidos", () => {
    expect(isOverviewFieldId("notas")).toBe(true);
    expect(isOverviewFieldId("meta")).toBe(true);
    expect(isOverviewFieldId("metas")).toBe(false);
    expect(isOverviewFieldId(null)).toBe(false);
  });
});
