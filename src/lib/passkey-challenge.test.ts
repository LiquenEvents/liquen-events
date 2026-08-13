import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * O desafio do WebAuthn selado num cookie.
 *
 * O que se prende aqui é o que o cookie tem de recusar. Um desafio aceite por
 * engano não é um erro de conforto: é o servidor a acreditar num número que não
 * emitiu, e a partir daí a assinatura que o acompanha deixa de provar nada.
 */

const SEGREDO = "um-segredo-de-testes-com-32-caracteres-ou-mais";

async function carregar() {
  vi.resetModules();
  process.env.SESSION_SECRET = SEGREDO;
  return import("./passkey-challenge");
}

describe("desafio selado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SESSION_SECRET;
  });

  it("um desafio selado volta a ler-se inteiro", async () => {
    const { novoDesafio, selarDesafio, lerDesafio } = await carregar();
    const ch = novoDesafio();
    const token = selarDesafio("registo", ch, "Catarina");
    const lido = lerDesafio(token, "registo");
    expect(lido?.challenge).toBe(ch);
    expect(lido?.userName).toBe("Catarina");
  });

  it("dois desafios seguidos nunca são iguais", async () => {
    const { novoDesafio } = await carregar();
    const vistos = new Set(Array.from({ length: 50 }, () => novoDesafio()));
    expect(vistos.size).toBe(50);
  });

  it("um desafio de REGISTO não serve na ENTRADA", async () => {
    // Sem isto, o desafio emitido para acrescentar um aparelho — que se obtém
    // estando dentro — podia ser reapresentado no caminho que abre a sessão.
    const { novoDesafio, selarDesafio, lerDesafio } = await carregar();
    const token = selarDesafio("registo", novoDesafio(), "Catarina");
    expect(lerDesafio(token, "entrada")).toBeNull();
  });

  it("um desafio de ENTRADA não serve no REGISTO", async () => {
    const { novoDesafio, selarDesafio, lerDesafio } = await carregar();
    const token = selarDesafio("entrada", novoDesafio());
    expect(lerDesafio(token, "registo")).toBeNull();
  });

  it("passados dois minutos deixa de valer", async () => {
    const { novoDesafio, selarDesafio, lerDesafio } = await carregar();
    const token = selarDesafio("entrada", novoDesafio());
    expect(lerDesafio(token, "entrada")).not.toBeNull();
    vi.advanceTimersByTime(2 * 60 * 1000 + 1);
    expect(lerDesafio(token, "entrada")).toBeNull();
  });

  it("mexer no corpo invalida a assinatura", async () => {
    const { novoDesafio, selarDesafio, lerDesafio } = await carregar();
    const token = selarDesafio("entrada", novoDesafio());
    const [corpo, assinatura] = token.split(".");
    // Esticar a validade é a alteração que interessaria a quem mexesse: vai
    // dentro do que é assinado, e por isso parte a assinatura.
    const payload = JSON.parse(Buffer.from(corpo, "base64url").toString());
    payload.exp = Date.now() + 10 * 365 * 24 * 3600 * 1000;
    const forjado = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(lerDesafio(`${forjado}.${assinatura}`, "entrada")).toBeNull();
  });

  it("um token de outra instalação (outro segredo) é recusado", async () => {
    const { novoDesafio, selarDesafio } = await carregar();
    const alheio = selarDesafio("entrada", novoDesafio());

    vi.resetModules();
    process.env.SESSION_SECRET = "outro-segredo-completamente-diferente-e-longo";
    const { lerDesafio } = await import("./passkey-challenge");
    expect(lerDesafio(alheio, "entrada")).toBeNull();
  });

  it("lixo, vazio e formatos estranhos não rebentam nem passam", async () => {
    const { lerDesafio } = await carregar();
    for (const mau of ["", "abc", "a.b.c", ".", "a.", ".b", "não-base64!.x"]) {
      expect(lerDesafio(mau, "entrada"), `aceitou "${mau}"`).toBeNull();
    }
    expect(lerDesafio(undefined, "entrada")).toBeNull();
    expect(lerDesafio(null, "entrada")).toBeNull();
  });

  it("o cookie é httpOnly, SameSite=Strict e de vida curta", async () => {
    const { opcoesCookieDesafio } = await carregar();
    const o = opcoesCookieDesafio();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("strict");
    expect(o.maxAge).toBe(120);
  });
});
