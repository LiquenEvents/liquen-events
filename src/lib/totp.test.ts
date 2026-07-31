import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { totp, verifyTotp, verifyTotpOnce, generateTotpSecret, resetTotpUsage } from "./totp";

// RFC 6238 secret "12345678901234567890" (ASCII) in base32 — a PUBLIC test
// vector from the standard, not a real secret. gitleaks:allow
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // gitleaks:allow

afterEach(() => vi.useRealTimers());

describe("totp — RFC 6238 vectors (SHA-1, 6 digits)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("matches the published code at t=%i", (t, expected) => {
    expect(totp(RFC_SECRET, t)).toBe(expected);
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and rejects a wrong one", () => {
    const secret = generateTotpSecret();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const code = totp(secret, Date.now() / 1000);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("rejects malformed tokens", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });

  it("generates distinct 32-char base32 secrets", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
  });

  it("aceita a janela: passo actual e anterior, nunca o seguinte", () => {
    // Relógio preso a meio de um passo: sem isto o teste podia atravessar a
    // fronteira dos 30 s entre asserções e falhar por acaso.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:15Z"));
    const secret = generateTotpSecret();
    const agora = Math.floor(Date.now() / 1000);
    expect(verifyTotp(secret, totp(secret, agora))).toBe(true);
    expect(verifyTotp(secret, totp(secret, agora - 30))).toBe(true);
    expect(verifyTotp(secret, totp(secret, agora + 30))).toBe(false);
    expect(verifyTotp(secret, totp(secret, agora - 60))).toBe(false);
  });
});

/**
 * Uso único (RFC 6238 §5.2). Sem isto, um código valia os ~60 s da janela
 * inteira e podia ser reapresentado à vontade — que é o que um phishing em
 * tempo real faz: apanha palavra-passe e código no site falso e usa-os no
 * verdadeiro segundos depois.
 */
describe("verifyTotpOnce — o código é gasto ao ser aceite", () => {
  beforeEach(() => resetTotpUsage());

  it("aceita o código uma vez e recusa a repetição", () => {
    const secret = generateTotpSecret();
    const codigo = totp(secret);
    expect(verifyTotpOnce(secret, codigo)).toBe(true);
    // Segunda apresentação do MESMO código, dentro da mesma janela.
    expect(verifyTotpOnce(secret, codigo)).toBe(false);
    expect(verifyTotpOnce(secret, codigo)).toBe(false);
  });

  it("queima também o passo anterior da janela de tolerância", () => {
    // Senão bastava recuar 30 s: gasto o código actual, o anterior continuava
    // bom e a repetição voltava a passar pela porta do lado.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:15Z"));
    const secret = generateTotpSecret();
    const agora = Math.floor(Date.now() / 1000);
    expect(verifyTotpOnce(secret, totp(secret, agora))).toBe(true);
    expect(verifyTotpOnce(secret, totp(secret, agora - 30))).toBe(false);
  });

  it("um segredo gasto não gasta os outros", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(verifyTotpOnce(a, totp(a))).toBe(true);
    expect(verifyTotpOnce(b, totp(b))).toBe(true);
  });

  it("o passo seguinte volta a ser aceite", () => {
    // O tempo anda: gastar um código não pode fechar a conta para sempre.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const secret = generateTotpSecret();
    expect(verifyTotpOnce(secret, totp(secret, Date.now() / 1000))).toBe(true);
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z")); // dois passos à frente
    expect(verifyTotpOnce(secret, totp(secret, Date.now() / 1000))).toBe(true);
  });

  it("um código errado não gasta nada", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpOnce(secret, "000000")).toBe(false);
    expect(verifyTotpOnce(secret, totp(secret))).toBe(true);
  });

  it("verifyTotp continua puro — não gasta o código", () => {
    // O verificador dos vectores da RFC tem de manter-se sem estado.
    const secret = generateTotpSecret();
    const codigo = totp(secret);
    expect(verifyTotp(secret, codigo)).toBe(true);
    expect(verifyTotp(secret, codigo)).toBe(true);
  });
});
