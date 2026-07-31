import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// Only the rate limiter is mocked — the real auth (verifyCredentials, sessions)
// is exercised end to end against the dev shared password.
// `porChave` deixa esgotar UM contador de cada vez. Sem isso não dava para
// distinguir o tecto por IP do tecto por conta — os dois respondem 429 e um
// mock com resposta única não sabe dizer qual deles disparou.
// `tectoReal` liga a contagem verdadeira para uma chave: é o que permite provar
// quantas tentativas o contador deixa passar, em vez de só espreitar as chamadas.
const rl = vi.hoisted(() => ({
  result: { ok: true } as { ok: boolean; retryAfter?: number },
  porChave: new Map<string, { ok: boolean; retryAfter?: number }>(),
  chamadas: [] as string[],
  tectoReal: new Map<string, number>(),
  contagens: new Map<string, number>(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string) => {
    rl.chamadas.push(key);
    const forcado = rl.porChave.get(key);
    if (forcado) return forcado;
    const tecto = rl.tectoReal.get(key);
    if (tecto !== undefined) {
      const n = (rl.contagens.get(key) ?? 0) + 1;
      rl.contagens.set(key, n);
      return n > tecto ? { ok: false, retryAfter: 3600 } : { ok: true };
    }
    return rl.result;
  }),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { POST } from "./route";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

function postReq(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const saved: Record<string, string | undefined> = {};
const KEYS = ["ADMIN_USERS", "ADMIN_PASSWORD_HASH", "ADMIN_TOTP_SECRET", "SESSION_SECRET"];

beforeEach(() => {
  rl.result = { ok: true };
  rl.porChave.clear();
  rl.chamadas = [];
  rl.tectoReal.clear();
  rl.contagens.clear();
  vi.clearAllMocks();
  for (const k of KEYS) saved[k] = process.env[k];
  // Dev shared-password mode: no individual users, no extra password/2FA.
  delete process.env.ADMIN_USERS;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_TOTP_SECRET;
  process.env.SESSION_SECRET = "login-test-secret-1234567890";
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("POST /api/admin/login", () => {
  it("rejects wrong credentials with 401 and sets no session", async () => {
    const res = await POST(postReq({ name: "Catarina", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(ADMIN_COOKIE)).toBeUndefined();
  });

  it("accepts the dev password and mints a session cookie", async () => {
    const res = await POST(postReq({ name: "Catarina", password: "liquen2026" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = res.cookies.get(ADMIN_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
  });

  it("throttles brute-force attempts with 429", async () => {
    rl.result = { ok: false, retryAfter: 30 };
    const res = await POST(postReq({ name: "Catarina", password: "liquen2026" }));
    expect(res.status).toBe(429);
  });
});

/**
 * O tecto POR CONTA — o que fecha a porta ao segundo factor.
 *
 * O tecto por IP sozinho não protege o TOTP: quem tenha a palavra-passe fica só
 * com 6 dígitos à frente, e rodar endereços (barato) comprava oito tentativas
 * novas por endereço. Este contador é o mesmo para o mundo inteiro, portanto
 * rodar endereços deixa de comprar tentativas.
 */
describe("POST /api/admin/login — tecto por conta", () => {
  const chaveConta = (n: string) => `login-conta:${n.toLowerCase()}`;

  it("recusa com 429 uma tentativa FALHADA quando o contador está esgotado", async () => {
    rl.porChave.set(chaveConta("Catarina"), { ok: false, retryAfter: 900 });
    const res = await POST(postReq({ name: "Catarina", password: "errada" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    expect(res.cookies.get(ADMIN_COOKIE)).toBeUndefined();
  });

  it("a chave da conta NÃO depende do endereço", async () => {
    // Se a chave levasse o IP, rodar endereços dava contadores novos e o tecto
    // não valia nada. O IP de teste é "test-ip".
    await POST(postReq({ name: "Catarina", password: "wrong" }));
    const daConta = rl.chamadas.filter((k) => k.startsWith("login-conta:"));
    expect(daConta).toHaveLength(1);
    expect(daConta[0]).not.toContain("test-ip");
  });

  it("conta a tentativa mesmo quando a conta não existe", async () => {
    // Se só contasse depois de saber que a conta é válida, o tempo de resposta
    // dizia quais os nomes que existem — e a busca ficava sem tecto nenhum.
    await POST(postReq({ name: "nao-existe-de-certeza", password: "seja-o-que-for" }));
    expect(rl.chamadas).toContain(chaveConta("nao-existe-de-certeza"));
  });

  it("o mesmo nome com maiúsculas diferentes partilha o contador", async () => {
    // Senão bastava alternar CATARINA / Catarina / catarina para multiplicar
    // o tecto pelo número de combinações.
    await POST(postReq({ name: "CATARINA", password: "wrong" }));
    expect(rl.chamadas).toContain("login-conta:catarina");
  });

  it("o tecto por IP continua a valer, e é o primeiro a disparar", async () => {
    rl.porChave.set("login:test-ip", { ok: false, retryAfter: 30 });
    const res = await POST(postReq({ name: "Catarina", password: "liquen2026" }));
    expect(res.status).toBe(429);
    // Disparou antes de sequer tocar no contador da conta.
    expect(rl.chamadas.some((k) => k.startsWith("login-conta:"))).toBe(false);
  });
});

/**
 * O tecto por conta não pode virar-se contra a dona da conta.
 *
 * O nome "Catarina" está no site. Quando o contador era consultado ANTES de
 * verificar as credenciais, gastava-se em qualquer pedido: vinte pedidos
 * anónimos, de vinte endereços diferentes, e a própria — com a palavra-passe
 * certa — levava 429 durante uma hora (medido: Retry-After 3598). Com o
 * limitador distribuído era pior, porque o PEXPIRE é renovado a cada toque:
 * um pedido por hora mantinha o back office fechado indefinidamente.
 *
 * Contar SÓ as falhas mantém o tecto contra quem procura às cegas (que falha
 * sempre, logo é sempre contado) e devolve a porta a quem tem a chave.
 */
describe("POST /api/admin/login — o tecto por conta não fecha a porta a quem sabe a palavra-passe", () => {
  const chaveConta = (n: string) => `login-conta:${n.toLowerCase()}`;

  it("depois de 20 falhas alheias, a palavra-passe certa continua a entrar", async () => {
    rl.tectoReal.set(chaveConta("Catarina"), 20);
    for (let i = 0; i < 20; i++) {
      const r = await POST(postReq({ name: "Catarina", password: `tentativa-${i}` }));
      expect(r.status).toBe(401);
    }
    // O contador está esgotado. A dona, com a palavra-passe certa:
    const res = await POST(postReq({ name: "Catarina", password: "liquen2026" }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeTruthy();
  }, 60_000);

  it("uma entrada bem sucedida não gasta o contador da conta", async () => {
    const res = await POST(postReq({ name: "Catarina", password: "liquen2026" }));
    expect(res.status).toBe(200);
    expect(rl.chamadas.some((k) => k.startsWith("login-conta:"))).toBe(false);
  });

  it("o tecto continua a travar a busca às cegas — a 21.ª falha é 429", async () => {
    rl.tectoReal.set(chaveConta("Catarina"), 20);
    for (let i = 0; i < 20; i++) {
      await POST(postReq({ name: "Catarina", password: `tentativa-${i}` }));
    }
    const res = await POST(postReq({ name: "Catarina", password: "mais-uma" }));
    expect(res.status).toBe(429);
  }, 60_000);

  it("o código de 2FA errado gasta o contador — é aí que a busca dos 6 dígitos bate", async () => {
    process.env.ADMIN_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // gitleaks:allow
    rl.tectoReal.set(chaveConta("Catarina"), 20);
    // Palavra-passe certa, código errado: a tentativa TEM de ser contada,
    // senão quem tem a palavra-passe procura os 6 dígitos sem tecto nenhum.
    const res = await POST(postReq({ name: "Catarina", password: "liquen2026", code: "000000" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ needs2fa: true });
    expect(rl.contagens.get(chaveConta("Catarina"))).toBe(1);
  });
});
