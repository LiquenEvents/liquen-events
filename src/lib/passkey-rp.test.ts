import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Quem somos, do ponto de vista do WebAuthn.
 *
 * É aqui que mora a resistência a phishing: a assinatura está presa a esta
 * origem e a mais nenhuma. Um `rpID` mal calculado não parte nada de forma
 * visível — as passkeys deixam simplesmente de funcionar, ou pior, passam a ser
 * aceites onde não deviam.
 */

async function carregar() {
  vi.resetModules();
  return import("./passkey-rp");
}

function pedido(host: string, esquema = "https") {
  return new NextRequest(`${esquema}://${host || "sem-host"}/api/x`, { headers: { host } });
}

afterEach(() => {
  delete process.env.WEBAUTHN_RP_ID;
  delete process.env.WEBAUTHN_ORIGIN;
});

describe("rpID", () => {
  it("sem configuração, sai do host do pedido", async () => {
    const { rpID } = await carregar();
    expect(rpID(pedido("liquen-events.com"))).toBe("liquen-events.com");
  });

  it("deixa cair a porta — o rpID é só o domínio", async () => {
    // "localhost:3000" como rpID é rejeitado pelo browser sem explicação útil.
    const { rpID } = await carregar();
    expect(rpID(pedido("localhost:3000"))).toBe("localhost");
  });

  it("o host é normalizado para minúsculas", async () => {
    const { rpID } = await carregar();
    expect(rpID(pedido("Liquen-Events.COM"))).toBe("liquen-events.com");
  });

  it("a configuração explícita ganha ao host", async () => {
    // É esta a linha de defesa contra um `Host` forjado passar a decidir o
    // domínio numa instalação a sério.
    process.env.WEBAUTHN_RP_ID = "liquen-events.com";
    const { rpID } = await carregar();
    expect(rpID(pedido("host-forjado.example"))).toBe("liquen-events.com");
  });

  it("um host vazio não produz um rpID vazio", async () => {
    const { rpID } = await carregar();
    expect(rpID(pedido(""))).toBe("localhost");
  });
});

describe("origem esperada", () => {
  it("segue o esquema do pedido", async () => {
    const { origemEsperada } = await carregar();
    expect(origemEsperada(pedido("liquen-events.com"))).toBe("https://liquen-events.com");
  });

  it("um build de produção servido em http produz uma origem http", async () => {
    // Foi isto que partiu o E2E: com o esquema fixo em `https` sempre que
    // NODE_ENV=production, um build de produção em http://localhost recusava
    // TODAS as passkeys, com a mensagem genérica a esconder o motivo.
    const anterior = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    const { origemEsperada } = await carregar();
    expect(origemEsperada(pedido("localhost:3000", "http"))).toBe("http://localhost:3000");
    vi.stubEnv("NODE_ENV", anterior ?? "test");
  });

  it("a configuração explícita ganha, sem barra no fim", async () => {
    process.env.WEBAUTHN_ORIGIN = "https://liquen-events.com/";
    const { origemEsperada } = await carregar();
    expect(origemEsperada(pedido("outro.example"))).toBe("https://liquen-events.com");
  });
});
