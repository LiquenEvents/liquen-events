import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createProposalToken, readProposalToken, TTL_MS } from "./proposal-token";
import { DEFAULT_VALID_DAYS } from "./proposal-doc";
import { createSession } from "./admin-auth";

// proposal-token reads the signing secret lazily from the environment, so keep
// each test hermetic by controlling SESSION_SECRET.
const ENV_KEYS = ["SESSION_SECRET", "ADMIN_SESSION_SECRET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SESSION_SECRET = "test-secret-please-change-1234567890";
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// Re-create the wire format with an arbitrary payload, for negative cases that
// the public API would never mint itself.
function forge(payload: unknown, secret = process.env.SESSION_SECRET!): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

describe("proposal-token — signed accept links", () => {
  it("round-trips a valid token", () => {
    const token = createProposalToken("prop-123");
    expect(readProposalToken(token)?.proposalId).toBe("prop-123");
  });

  it("rejects a tampered payload kept alongside the original signature", () => {
    const token = createProposalToken("prop-123");
    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ pid: "prop-999", exp: Date.now() + 1e9 }),
    ).toString("base64url");
    expect(readProposalToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects garbage, empty, null and undefined tokens", () => {
    expect(readProposalToken("")).toBeNull();
    expect(readProposalToken("not-a-token")).toBeNull();
    expect(readProposalToken("a.b.c")).toBeNull();
    expect(readProposalToken(null)).toBeNull();
    expect(readProposalToken(undefined)).toBeNull();
  });

  it("rejects a canonical token with trailing junk appended", () => {
    // `body.sig` is genuinely valid; appending `.junk` must NOT be silently
    // dropped (the old 2-target split-destructure accepted `body.sig.junk`).
    const token = createProposalToken("prop-123");
    expect(readProposalToken(token)?.proposalId).toBe("prop-123");
    expect(readProposalToken(`${token}.junk`)).toBeNull();
    expect(readProposalToken(`${token}.a.b.c`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = createProposalToken("prop-123");
    process.env.SESSION_SECRET = "a-totally-different-secret-987654321";
    expect(readProposalToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createProposalToken("prop-123");
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z")); // um ano depois
    expect(readProposalToken(token)).toBeNull();
  });

  /**
   * ── O LINK TEM DE DURAR MAIS DO QUE A PROPOSTA ───────────────────────────
   *
   * O prazo do token era 14 dias, escrito à mão, com o argumento de estar
   * «comfortably past a normal decision window». A janela de decisão deixou de
   * ser 14 dias no dia em que a validade da proposta passou a 60
   * ({@link DEFAULT_VALID_DAYS}) — e ninguém voltou aqui. O casal que abrisse o
   * email ao fim de três semanas, com o PDF a dizer «válida até 12 de Outubro»,
   * carregava no link e recebia «Link inválido ou expirado»: um beco sem saída,
   * na página que existe para eles dizerem que sim.
   *
   * O que este teste prende não é o número — é a RELAÇÃO entre os dois. Se
   * alguém voltar a mexer na validade por omissão, é aqui que ouve.
   */
  it("continua válido no último dia de validade da proposta (e um pouco depois)", () => {
    vi.useFakeTimers();
    const envio = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(envio);
    const token = createProposalToken("prop-123");

    // O último dia da validade por omissão: o link tem de abrir.
    vi.setSystemTime(envio.getTime() + DEFAULT_VALID_DAYS * 864e5);
    expect(readProposalToken(token)?.proposalId).toBe("prop-123");

    // E ainda depois disso, para o casal encontrar a frase honesta («esta
    // proposta expirou») em vez de um link partido — e para o estúdio poder
    // esticar a validade sem ter de reenviar o email.
    vi.setSystemTime(envio.getTime() + (DEFAULT_VALID_DAYS + 7) * 864e5);
    expect(readProposalToken(token)?.proposalId).toBe("prop-123");
  });

  it("rejects a validly-signed token that carries no proposal id", () => {
    expect(readProposalToken(forge({ exp: Date.now() + 1e9 }))).toBeNull();
  });

  it("rejects a token with a non-numeric expiry", () => {
    expect(readProposalToken(forge({ pid: "prop-1", exp: "soon" }))).toBeNull();
  });

  it("rejects a token with an empty-string proposal id", () => {
    expect(readProposalToken(forge({ pid: "", exp: Date.now() + 1e9 }))).toBeNull();
  });

  it("mints unguessable, per-proposal tokens", () => {
    const a = createProposalToken("prop-A");
    const b = createProposalToken("prop-B");
    expect(a).not.toEqual(b);
    expect(readProposalToken(a)?.proposalId).toBe("prop-A");
    expect(readProposalToken(b)?.proposalId).toBe("prop-B");
  });

  it("rejects a validly-signed token whose body is not valid JSON", () => {
    // Assinatura correta, mas o corpo (base64url) não é JSON — a desserialização
    // rebenta e tem de devolver null em vez de propagar.
    const body = Buffer.from("nao-e-json{{").toString("base64url");
    const sig = createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");
    expect(readProposalToken(`${body}.${sig}`)).toBeNull();
  });

  // Domain separation: an admin session token must NOT read as a proposal token
  // (the session signs with a derived key AND declares typ:"session").
  it("does not accept an admin session token as a proposal link", () => {
    const session = createSession("Catarina");
    expect(readProposalToken(session)).toBeNull();
  });

  it("rejects a validly-signed token that declares a non-proposal type", () => {
    expect(
      readProposalToken(forge({ typ: "session", pid: "prop-1", exp: Date.now() + 1e9 })),
    ).toBeNull();
  });

  // Backward compatibility: accept links minted before the typ claim existed
  // (payload had only { pid, exp }) must keep validating until they expire.
  it("still accepts a legacy token that carries no type claim", () => {
    expect(
      readProposalToken(forge({ pid: "prop-legacy", exp: Date.now() + 1e9 }))?.proposalId,
    ).toBe("prop-legacy");
  });

  /**
   * ── A HORA DE EMISSÃO, QUE É O QUE PERMITE CORTAR UM LINK ────────────────
   *
   * O corte de links é um carimbo de tempo no pedido, e a regra é «morre o que
   * foi emitido ANTES do corte». Sem saber a idade de cada endereço, ou o corte
   * não apanha os já enviados (não fecha nada) ou mata também o que ela cunhar
   * a seguir — e aí ela reenviaria a proposta para um link morto.
   */
  it("um token novo diz quando foi emitido", () => {
    const antes = Date.now();
    const lido = readProposalToken(createProposalToken("prop-123"));
    const depois = Date.now();
    expect(lido).not.toBeNull();
    const emitido = lido!.emitidoEm;
    expect(emitido).toBeGreaterThanOrEqual(antes);
    expect(emitido).toBeLessThanOrEqual(depois);
  });

  it("um token ANTIGO, sem `iat`, tem a emissão deduzida do prazo", () => {
    /**
     * Os links já em caixas de correio não trazem `iat` e não podem passar a
     * ser incortáveis por isso. O `exp` é `emissão + TTL_MS`, portanto a
     * emissão deduz-se ao milissegundo enquanto o prazo for o mesmo.
     */
    const emitido = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const lido = readProposalToken(forge({ typ: "proposal", pid: "p", exp: emitido + TTL_MS }));
    expect(lido?.emitidoEm).toBe(emitido);
  });

  it("um `iat` que não seja número não vira NaN — cai na dedução", () => {
    // Um payload estranho não passa pela assinatura vinda de fora, mas a
    // comparação do corte nunca pode responder ao calhas por causa de um `NaN`.
    const emitido = Date.now() - 1000;
    const lido = readProposalToken(
      forge({ typ: "proposal", pid: "p", iat: "ontem", exp: emitido + TTL_MS }),
    );
    expect(Number.isFinite(lido?.emitidoEm)).toBe(true);
    expect(lido?.emitidoEm).toBe(emitido);
  });
});

describe("quoteIdFor — idempotency id", () => {
  it("is deterministic for the same submission id", async () => {
    const { quoteIdFor } = await import("./quotes-store");
    expect(quoteIdFor("sub-abc")).toBe(quoteIdFor("sub-abc"));
  });

  it("differs across submission ids and looks like a quote reference", async () => {
    const { quoteIdFor } = await import("./quotes-store");
    expect(quoteIdFor("sub-abc")).not.toBe(quoteIdFor("sub-xyz"));
    expect(quoteIdFor("sub-abc")).toMatch(/^LIQ-[0-9A-F]{6}-[0-9A-F]{16}$/);
  });
});
