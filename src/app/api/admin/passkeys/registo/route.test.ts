import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * REGISTAR UM DISPOSITIVO — o passo que transforma um aparelho numa chave.
 *
 * A guarda de sessão está prendida na auditoria geral (`auth-guard-audit`).
 * Aqui prende-se o que é próprio desta rota: que o desafio pertence à conta que
 * o pediu, que a credencial fica guardada com o DOMÍNIO actual (sem o qual a
 * entrada não a reconhece), e que não se acumulam aparelhos sem fim.
 */

const SEGREDO = "um-segredo-de-testes-com-32-caracteres-ou-mais";
process.env.SESSION_SECRET = SEGREDO;

const wa = vi.hoisted(() => ({ verificado: true as boolean }));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "x" })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: wa.verificado,
    registrationInfo: wa.verificado
      ? {
          credential: {
            id: "cred-nova",
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 0,
            transports: ["internal"],
          },
        }
      : undefined,
  })),
}));

const store = vi.hoisted(() => ({
  existentes: [] as unknown[],
  criadas: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/passkeys-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/passkeys-store")>()),
  listPasskeysFor: vi.fn(async () => store.existentes),
  createPasskey: vi.fn(async (p: Record<string, unknown>) => {
    store.criadas.push(p);
  }),
}));

const { GET, POST } = await import("./route");
const { ADMIN_COOKIE, createSession } = await import("@/lib/admin-auth");
const { CHALLENGE_COOKIE, novoDesafio, selarDesafio } = await import("@/lib/passkey-challenge");

const DOMINIO = "liquen.test";

function pedido(opts: {
  sessao?: string | null;
  desafioDe?: string | null;
  metodo?: "GET" | "POST";
}) {
  const { sessao = "Catarina", desafioDe = "Catarina", metodo = "POST" } = opts;
  const cookies: string[] = [];
  if (sessao) cookies.push(`${ADMIN_COOKIE}=${createSession(sessao)}`);
  if (desafioDe !== null) {
    cookies.push(`${CHALLENGE_COOKIE}=${selarDesafio("registo", novoDesafio(), desafioDe)}`);
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: DOMINIO,
  };
  if (cookies.length) headers.cookie = cookies.join("; ");

  return new NextRequest(`https://${DOMINIO}/api/admin/passkeys/registo`, {
    method: metodo,
    headers,
    ...(metodo === "POST"
      ? { body: JSON.stringify({ response: { id: "cred-nova" }, deviceLabel: "iPhone" }) }
      : {}),
  });
}

beforeEach(() => {
  wa.verificado = true;
  store.existentes = [];
  store.criadas = [];
});

describe("GET — as opções", () => {
  it("recusa quem não tem sessão", async () => {
    const res = await GET(pedido({ sessao: null, desafioDe: null, metodo: "GET" }));
    expect(res.status).toBe(401);
  });

  it("com sessão, devolve as opções e sela o desafio", async () => {
    const res = await GET(pedido({ desafioDe: null, metodo: "GET" }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(CHALLENGE_COOKIE)?.value).toBeTruthy();
  });

  it("recusa quando a conta já tem o tecto de dispositivos", async () => {
    store.existentes = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}` }));
    const res = await GET(pedido({ desafioDe: null, metodo: "GET" }));
    expect(res.status).toBe(409);
  });
});

describe("POST — guardar o dispositivo", () => {
  it("recusa quem não tem sessão", async () => {
    const res = await POST(pedido({ sessao: null }));
    expect(res.status).toBe(401);
    expect(store.criadas).toEqual([]);
  });

  it("sem desafio selado não guarda nada", async () => {
    const res = await POST(pedido({ desafioDe: null }));
    expect(res.status).toBe(400);
    expect(store.criadas).toEqual([]);
  });

  it("um desafio emitido para OUTRA conta não serve", async () => {
    // Mesmo browser, outra entrada pelo meio: sem esta verificação o aparelho
    // acabava preso à conta errada.
    const res = await POST(pedido({ sessao: "Catarina", desafioDe: "Rui" }));
    expect(res.status).toBe(400);
    expect(store.criadas).toEqual([]);
  });

  it("verificação falhada não guarda nada", async () => {
    wa.verificado = false;
    const res = await POST(pedido({}));
    expect(res.status).toBe(400);
    expect(store.criadas).toEqual([]);
  });

  it("guarda a credencial com o domínio actual e a conta da sessão", async () => {
    const res = await POST(pedido({}));
    expect(res.status).toBe(200);
    expect(store.criadas).toHaveLength(1);
    const guardada = store.criadas[0];
    expect(guardada.id).toBe("cred-nova");
    expect(guardada.userName).toBe("Catarina");
    // Sem o domínio certo, a entrada nunca reconheceria esta credencial.
    expect(guardada.rpId).toBe(DOMINIO);
    expect(guardada.deviceLabel).toBe("iPhone");
    expect(guardada.lastUsedAt).toBeNull();
    // A chave pública vai em base64url, que é como a entrada a volta a ler.
    expect(Buffer.from(String(guardada.publicKey), "base64url")).toEqual(
      Buffer.from(new Uint8Array([1, 2, 3])),
    );
  });

  it("limpa o cookie do desafio depois de usar", async () => {
    const res = await POST(pedido({}));
    expect(res.cookies.get(CHALLENGE_COOKIE)?.value).toBeFalsy();
  });

  it("sem nome escrito, o dispositivo fica com um nome em vez de vazio", async () => {
    const req = new NextRequest(`https://${DOMINIO}/api/admin/passkeys/registo`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: DOMINIO,
        cookie: `${ADMIN_COOKIE}=${createSession("Catarina")}; ${CHALLENGE_COOKIE}=${selarDesafio(
          "registo",
          novoDesafio(),
          "Catarina",
        )}`,
      },
      body: JSON.stringify({ response: { id: "cred-nova" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(store.criadas[0].deviceLabel).toBe("Dispositivo");
  });
});
