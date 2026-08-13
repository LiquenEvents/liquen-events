import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";

/**
 * O armazém dos dispositivos.
 *
 * O `Repository` genérico já está provado em `repository.test.ts`. Aqui
 * prendem-se as duas regras que são DESTE módulo e que, se falharem, falham em
 * silêncio: quem pode remover o quê, e o que conta como contador retrocedido.
 */

const db = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  captured: null as unknown,
}));

vi.mock("./repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repository")>();
  return {
    ...actual,
    createRepository: (mapper: Mapper<Passkey>) => {
      db.captured = mapper;
      return {
        list: async () => [...db.rows.values()] as Passkey[],
        get: async (id: string) => (db.rows.get(id) as Passkey | undefined) ?? null,
        create: async (e: Passkey) => {
          db.rows.set(mapper.getId(e), e);
        },
        update: async (id: string, updates: Partial<Passkey>) => {
          const cur = db.rows.get(id) as Passkey | undefined;
          if (!cur) return null;
          const merged = { ...cur, ...updates };
          db.rows.set(id, merged);
          return merged;
        },
        remove: async (id: string) => {
          db.rows.delete(id);
        },
      };
    },
  };
});

const {
  contadorRetrocedeu,
  createPasskey,
  listPasskeysFor,
  marcarUso,
  mesmaConta,
  removePasskeyOwnedBy,
  renamePasskeyOwnedBy,
  mapper,
} = await import("./passkeys-store");
type Passkey = import("./passkeys-store").Passkey;

function passkey(over: Partial<Passkey> = {}): Passkey {
  return {
    id: "cred-1",
    userName: "Catarina",
    publicKey: "chave-publica",
    counter: 0,
    transports: ["internal"],
    rpId: "liquen-events.com",
    deviceLabel: "iPhone",
    createdAt: "2026-08-01T10:00:00.000Z",
    lastUsedAt: null,
    ...over,
  };
}

beforeEach(() => {
  db.rows.clear();
});

describe("mesmaConta", () => {
  it("ignora maiúsculas e espaços à volta", () => {
    expect(mesmaConta("Catarina", "  catarina ")).toBe(true);
    expect(mesmaConta("Catarina", "Catarino")).toBe(false);
  });
});

describe("remover um dispositivo", () => {
  it("o dono remove o seu", async () => {
    await createPasskey(passkey());
    expect(await removePasskeyOwnedBy("cred-1", "Catarina")).toBe(true);
    expect(await listPasskeysFor("Catarina")).toEqual([]);
  });

  it("NINGUÉM remove o de outra pessoa, mesmo sabendo o id", async () => {
    // Apagar a última credencial de alguém é trancá-lo fora. O id vem do
    // cliente; sem esta verificação bastava conhecê-lo.
    await createPasskey(passkey());
    expect(await removePasskeyOwnedBy("cred-1", "Rui")).toBe(false);
    expect(await listPasskeysFor("Catarina")).toHaveLength(1);
  });

  it("um id que não existe responde como um id alheio — sem dizer qual é qual", async () => {
    expect(await removePasskeyOwnedBy("cred-inexistente", "Catarina")).toBe(false);
  });
});

describe("renomear", () => {
  it("o dono muda o nome do seu aparelho", async () => {
    // O nome é escolhido no registo, quando só há um aparelho na conta. Ao
    // terceiro telemóvel, três linhas a dizer «iPhone» tornam a lista inútil —
    // e uma lista que não se sabe ler é uma lista onde nada se remove.
    await createPasskey(passkey());
    expect(await renamePasskeyOwnedBy("cred-1", "Catarina", "iPhone antigo")).toBe(true);
    expect((await listPasskeysFor("Catarina"))[0].deviceLabel).toBe("iPhone antigo");
  });

  it("NINGUÉM renomeia o de outra pessoa", async () => {
    // Mais discreto do que apagar e não menos sério: baptizar o aparelho de
    // outra pessoa é montar a armadilha para que ela apague o seu.
    await createPasskey(passkey());
    expect(await renamePasskeyOwnedBy("cred-1", "Rui", "Portátil do Rui")).toBe(false);
    expect((await listPasskeysFor("Catarina"))[0].deviceLabel).toBe("iPhone");
  });

  it("um nome vazio não apaga o que lá está", async () => {
    await createPasskey(passkey());
    expect(await renamePasskeyOwnedBy("cred-1", "Catarina", "   ")).toBe(false);
    expect((await listPasskeysFor("Catarina"))[0].deviceLabel).toBe("iPhone");
  });

  it("um nome enorme é cortado, não recusado", async () => {
    await createPasskey(passkey());
    await renamePasskeyOwnedBy("cred-1", "Catarina", "x".repeat(500));
    expect((await listPasskeysFor("Catarina"))[0].deviceLabel).toHaveLength(60);
  });
});

describe("listar por conta", () => {
  it("só devolve os da própria conta", async () => {
    await createPasskey(passkey({ id: "a", userName: "Catarina" }));
    await createPasskey(passkey({ id: "b", userName: "Rui" }));
    await createPasskey(passkey({ id: "c", userName: "catarina" }));
    const dela = await listPasskeysFor("Catarina");
    expect(dela.map((p) => p.id).sort()).toEqual(["a", "c"]);
  });
});

describe("contador de assinaturas", () => {
  it("0 → 0 é normal, não é clone", () => {
    // iCloud Keychain e Google Password Manager sincronizam a credencial de
    // propósito e mandam sempre 0. Tratar isso como clone fechava a porta a
    // toda a gente que usa um telemóvel moderno.
    expect(contadorRetrocedeu(0, 0)).toBe(false);
  });

  it("avançar é normal", () => {
    expect(contadorRetrocedeu(5, 6)).toBe(false);
    expect(contadorRetrocedeu(0, 1)).toBe(false);
  });

  it("repetir ou recuar é sinal de credencial clonada", () => {
    expect(contadorRetrocedeu(5, 5)).toBe(true);
    expect(contadorRetrocedeu(5, 4)).toBe(true);
    expect(contadorRetrocedeu(1, 0)).toBe(true);
  });
});

describe("marcar utilização", () => {
  it("guarda o contador novo e a data", async () => {
    await createPasskey(passkey({ counter: 3 }));
    await marcarUso("cred-1", 4);
    const [p] = await listPasskeysFor("Catarina");
    expect(p.counter).toBe(4);
    expect(p.lastUsedAt).toBeTruthy();
  });
});

describe("mapeamento para a base de dados", () => {
  it("a ida e volta não perde nada", () => {
    const original = passkey({ counter: 7, lastUsedAt: "2026-08-03T09:00:00.000Z" });
    const linha = mapper.toRow(original);
    expect(mapper.fromRow(linha as Record<string, unknown>)).toEqual(original);
  });

  it("uma linha com colunas em falta lê-se sem rebentar", () => {
    // Uma tabela criada por uma versão anterior do schema não pode partir a
    // leitura — devolve valores neutros, e o `rp_id` vazio nunca vai bater
    // certo com o domínio actual, portanto falha fechado.
    const lido = mapper.fromRow({ id: "x" });
    expect(lido.counter).toBe(0);
    expect(lido.transports).toEqual([]);
    expect(lido.rpId).toBe("");
    expect(lido.lastUsedAt).toBeNull();
  });
});
