import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  createSession,
  readSession,
  isAuthed,
  verifyCredentials,
  ADMIN_COOKIE,
} from "./admin-auth";
import { createPortalToken } from "./portal-token";

// Adversarial coverage for the admin session token verifier. The happy path and
// the tamper/expiry/version/proposal-confusion cases live in admin-auth.test.ts;
// this file adds the attacker-shaped inputs that verifier must survive without
// throwing and without ever honouring a non-canonical or forged token.

const SAVED = process.env.SESSION_SECRET;

beforeAll(() => {
  // Obvious low-entropy placeholder, not a real key.
  process.env.SESSION_SECRET = "test-admin-adversarial-secret-1234567890"; // gitleaks:allow
});

afterAll(() => {
  if (SAVED === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = SAVED;
});

/** Minimal NextRequest stand-in exposing only what isAuthed reads. */
function reqWithCookie(value: string | undefined): NextRequest {
  return {
    cookies: {
      get: (name: string) => (name === ADMIN_COOKIE && value !== undefined ? { value } : undefined),
    },
  } as unknown as NextRequest;
}

describe("readSession — non-canonical token shape (trailing junk)", () => {
  it("refuses a valid token with an extra dotted segment appended", () => {
    const token = createSession("Catarina");
    expect(readSession(token)).toEqual({ name: "Catarina" });
    // base64url contains no ".", so a genuine token is exactly `body.sig`.
    // Anything with a 3rd segment is tampered/non-canonical and must be refused,
    // matching the hardened portal-token verifier.
    expect(readSession(`${token}.junk`)).toBeNull();
    expect(readSession(`${token}.a.b.c`)).toBeNull();
  });

  it("isAuthed rejects a cookie carrying a token with trailing junk", () => {
    const token = createSession("Catarina");
    expect(isAuthed(reqWithCookie(token))).toBe(true);
    expect(isAuthed(reqWithCookie(`${token}.junk`))).toBe(false);
  });
});

describe("readSession — hostile inputs never throw, always deny", () => {
  it("denies null / undefined / empty / dotless / dot-only inputs", () => {
    expect(readSession(null)).toBeNull();
    expect(readSession(undefined)).toBeNull();
    expect(readSession("")).toBeNull();
    expect(readSession("no-separator-here")).toBeNull();
    expect(readSession(".")).toBeNull();
    expect(readSession("body.")).toBeNull();
    expect(readSession(".sig")).toBeNull();
  });

  it("denies an oversized cookie without throwing", () => {
    const huge = "A".repeat(200_000) + "." + "B".repeat(200_000);
    expect(() => readSession(huge)).not.toThrow();
    expect(readSession(huge)).toBeNull();
  });

  it("denies a well-formed shape whose body is not valid base64url JSON", () => {
    // Reaches the JSON.parse branch only if the sig matched, which it cannot for
    // an attacker; but the verifier must still never throw on garbage bodies.
    expect(() => readSession("!!!not-base64!!!.@@@bad-sig@@@")).not.toThrow();
    expect(readSession("!!!not-base64!!!.@@@bad-sig@@@")).toBeNull();
  });

  it("denies a short signature (length mismatch) without throwing", () => {
    const token = createSession("Catarina");
    const [body] = token.split(".");
    expect(() => readSession(`${body}.x`)).not.toThrow();
    expect(readSession(`${body}.x`)).toBeNull();
  });

  it("denies an unsigned but well-shaped forgery (right body, wrong sig)", () => {
    const forged = Buffer.from(
      JSON.stringify({ typ: "session", sub: "Hacker", exp: Date.now() + 1e9, v: "1" }),
    ).toString("base64url");
    expect(readSession(`${forged}.${"A".repeat(43)}`)).toBeNull();
  });
});

describe("readSession — cross-domain token confusion", () => {
  it("never accepts a portal-link token as an admin session", () => {
    // Same SESSION_SECRET, same wire format, but signed with the raw secret and
    // carrying typ:"portal" — must be cryptographically and semantically refused.
    const portal = createPortalToken("quote-123");
    expect(readSession(portal)).toBeNull();
  });
});

/**
 * Enumeração de contas por tempo de resposta.
 *
 * `verifyCredentials` corre um compare de bcrypt mesmo quando o nome não existe,
 * para que o relógio não denuncie quais as contas válidas. Só que o compare-
 * -fantasma tem de custar o MESMO que o verdadeiro. Enquanto usou um hash fixo
 * de custo 10 contra contas reais de custo 12, ele próprio era o oráculo:
 * medido, 349 ms para uma conta existente contra 86 ms para uma inexistente —
 * um rácio de 4x, visível do outro lado da Internet.
 */
describe("verifyCredentials — nome desconhecido não se distingue pelo tempo", () => {
  const CUSTO = 12;
  const GUARDADOS: Record<string, string | undefined> = {};
  const CHAVES = ["ADMIN_USERS", "ADMIN_PASSWORD_HASH"];

  beforeEach(async () => {
    for (const k of CHAVES) GUARDADOS[k] = process.env[k];
    const bcrypt = (await import("bcryptjs")).default;
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", passwordHash: bcrypt.hashSync("cat-pass", CUSTO) },
    ]);
    delete process.env.ADMIN_PASSWORD_HASH;
  });

  afterEach(() => {
    for (const k of CHAVES) {
      if (GUARDADOS[k] === undefined) delete process.env[k];
      else process.env[k] = GUARDADOS[k];
    }
  });

  it("compara contra um hash do mesmo factor de custo das contas reais", async () => {
    // A prova sem relógio: espia-se o argumento do compare. Com o nome
    // desconhecido, o hash usado tem de ter o custo das contas configuradas
    // (12), não o custo do hash de desenvolvimento embutido no ficheiro (10).
    const bcrypt = (await import("bcryptjs")).default;
    const usados: string[] = [];
    const espia = vi.spyOn(bcrypt, "compareSync").mockImplementation((_p, h) => {
      usados.push(String(h));
      return false;
    });
    try {
      await verifyCredentials("NaoExisteDeCerteza", "seja-o-que-for");
    } finally {
      espia.mockRestore();
    }
    expect(usados).toHaveLength(1);
    expect(usados[0].startsWith(`$2b$${CUSTO}$`)).toBe(true);
    expect(usados[0].startsWith("$2b$10$")).toBe(false);
  });

  // A medição a relógio fica FORA da bateria por omissão: numa máquina carregada
  // o rácio oscila para os dois lados (observado entre 0,47x e 2,38x já COM a
  // correcção posta), e um teste que falha por causa da carga vale menos do que
  // teste nenhum. A garantia a sério é a de cima — o factor de custo do hash —
  // que é exacta e não depende de relógio. Esta fica como reprodutor, a pedido:
  //
  //   AUDIT_TIMING=1 npx vitest run src/lib/admin-auth.adversarial.test.ts
  //
  // Numa máquina em repouso mediu-se, ANTES da correcção: conta existente 348,9 ms
  // contra 86,2 ms para uma inexistente — rácio 4,05x (e 4,25x numa repetição).
  // DEPOIS da correcção o rácio cai para perto de 1.
  it.runIf(process.env.AUDIT_TIMING)(
    "mede: existente e inexistente demoram o mesmo",
    async () => {
      // Estatística: o MÍNIMO, não a mediana. O ruído do escalonador só acrescenta
      // tempo, nunca tira, portanto a amostra mais rápida é a estimativa mais
      // limpa do custo verdadeiro — e é também o que um atacante usaria, repetindo
      // e ficando com o chão. Com a mediana este teste falhava quando a máquina
      // estava carregada; com o mínimo não depende da carga.
      const medir = async (nome: string, n: number) => {
        let melhor = Infinity;
        for (let i = 0; i < n; i++) {
          const t0 = process.hrtime.bigint();
          await verifyCredentials(nome, "palavra-errada-qualquer");
          melhor = Math.min(melhor, Number(process.hrtime.bigint() - t0) / 1e6);
        }
        return melhor;
      };
      // Aquecimento intercalado: o primeiro compare de cada lado paga o arranque
      // do módulo e o JIT, e não é isso que se quer medir.
      await medir("Catarina", 2);
      await medir("NaoExisteDeCerteza", 2);
      const existe = await medir("Catarina", 8);
      const naoExiste = await medir("NaoExisteDeCerteza", 8);
      const racio = existe / naoExiste;
      // O que interessa é o limite de CIMA: a fuga é a conta existente demorar
      // MAIS, e antes da correcção o rácio media 4,05x (349 ms contra 86 ms).
      // Abaixo de 2x já não há sinal aproveitável. O limite de baixo é só uma
      // rede contra uma medição degenerada — fica largo de propósito, porque uma
      // máquina carregada consegue puxar qualquer dos dois lados para baixo e a
      // garantia a sério é o teste do factor de custo, aqui ao lado, que não
      // depende de relógio nenhum.
      expect(racio).toBeGreaterThan(0.2);
      expect(racio).toBeLessThan(2);
    },
    120_000,
  );
});

describe("isAuthed — cookie plumbing", () => {
  it("is false when the admin cookie is absent", () => {
    expect(isAuthed(reqWithCookie(undefined))).toBe(false);
  });

  it("is false for an empty cookie value", () => {
    expect(isAuthed(reqWithCookie(""))).toBe(false);
  });

  it("is true for a genuine session cookie", () => {
    expect(isAuthed(reqWithCookie(createSession("Rui")))).toBe(true);
  });
});
