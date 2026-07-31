import { describe, it, expect } from "vitest";
import {
  sanitizeTelemetryPath,
  isTokenRoute,
  TOKEN_PATH_PATTERN,
  TOKEN_PLACEHOLDER,
} from "./safe-path";

/**
 * Tokens REAIS medidos neste repositório (ver src/lib/portal-token.ts e
 * src/lib/proposal-token.ts): payload base64url + "." + assinatura HMAC.
 * O do portal tem ~140 caracteres, o da proposta ~122.
 */
const PORTAL_TOKEN =
  "eyJ0eXAiOiJwb3J0YWwiLCJxaWQiOiJMSVEtTTFBMkIzLTlGM0M3QTFCMkQ0RTVGNjAiLCJleHAiOjE4MTcwNDU5MDIwNjd9.xYFYVlyLqOb33tAqHDgzJBtmszJm7XHFxgQ3Oy3zGyY";
const PROPOSAL_TOKEN = "eyJ0eXAiOiJwcm9wb3NhbCIsInBpZCI6InByb3BfMTIzIn0.AbCdEf-_1234567890xyz";

describe("sanitizeTelemetryPath", () => {
  it("tira o token do portal, mantendo a rota identificável", () => {
    const out = sanitizeTelemetryPath(`/portal/${PORTAL_TOKEN}`);
    expect(out).toBe(`/portal/${TOKEN_PLACEHOLDER}`);
    expect(out).not.toContain(PORTAL_TOKEN);
  });

  it("tira o token da proposta", () => {
    expect(sanitizeTelemetryPath(`/proposta/${PROPOSAL_TOKEN}`)).toBe(
      `/proposta/${TOKEN_PLACEHOLDER}`,
    );
  });

  it("funciona com o prefixo de idioma e com a reescrita do proxy", () => {
    expect(sanitizeTelemetryPath(`/en/portal/${PORTAL_TOKEN}`)).toBe(
      `/en/portal/${TOKEN_PLACEHOLDER}`,
    );
    expect(sanitizeTelemetryPath(`/pt/proposta/${PROPOSAL_TOKEN}`)).toBe(
      `/pt/proposta/${TOKEN_PLACEHOLDER}`,
    );
  });

  it("funciona num URL absoluto e preserva query e fragmento", () => {
    const out = sanitizeTelemetryPath(
      `https://liquen-events.com/portal/${PORTAL_TOKEN}?utm_source=email#faturas`,
    );
    expect(out).not.toContain(PORTAL_TOKEN);
    expect(out).toContain("utm_source=email");
    expect(out).toContain("#faturas");
  });

  it("não mexe nas rotas normais", () => {
    for (const p of ["/", "/galeria", "/en/servicos/casamentos", "/orcamento/admin"]) {
      expect(sanitizeTelemetryPath(p)).toBe(p);
    }
  });

  it("apanha o segmento haja o que houver a seguir (mais do que um por URL)", () => {
    const out = sanitizeTelemetryPath(`/portal/${PORTAL_TOKEN}/proposta/${PROPOSAL_TOKEN}`);
    expect(out).not.toContain(PORTAL_TOKEN);
    expect(out).not.toContain(PROPOSAL_TOKEN);
  });

  it("um token real cabe inteiro no tecto de 256 do VitalSchema — ou seja, SEM esta limpeza seria gravado por completo", () => {
    // Esta é a prova de que o problema é real e não teórico: o campo não trunca.
    expect(`/portal/${PORTAL_TOKEN}`.length).toBeLessThan(256);
    expect(`/proposta/${PROPOSAL_TOKEN}`.length).toBeLessThan(256);
  });
});

describe("isTokenRoute", () => {
  it("reconhece as rotas com token, com e sem prefixo de idioma", () => {
    expect(isTokenRoute(`/portal/${PORTAL_TOKEN}`)).toBe(true);
    expect(isTokenRoute(`/en/proposta/${PROPOSAL_TOKEN}`)).toBe(true);
    expect(isTokenRoute(`/pt/portal/abc`)).toBe(true);
  });

  it("não confunde rotas normais", () => {
    expect(isTokenRoute("/galeria")).toBe(false);
    expect(isTokenRoute("/orcamento/admin")).toBe(false);
    expect(isTokenRoute("/portal")).toBe(false); // sem segmento = sem token
    expect(isTokenRoute(null)).toBe(false);
    expect(isTokenRoute(undefined)).toBe(false);
  });

  it("não guarda estado entre chamadas (a regex é recriada, não é global partilhada)", () => {
    const p = `/portal/${PORTAL_TOKEN}`;
    expect(isTokenRoute(p)).toBe(true);
    expect(isTokenRoute(p)).toBe(true);
    expect(isTokenRoute(p)).toBe(true);
  });
});

describe("TOKEN_PATH_PATTERN — interpolável no script inline do Google tag", () => {
  it("não traz aspas nem barras invertidas que partam a string de JS", () => {
    expect(TOKEN_PATH_PATTERN).not.toMatch(/['"\\]/);
  });

  it("compila e comporta-se igual dentro do browser (mesma regex, mesmo resultado)", () => {
    // Reproduz exactamente o que o script inline faz em CONSENT_BOOTSTRAP.
    const href = `https://liquen-events.com/portal/${PORTAL_TOKEN}`;
    const asBrowser = href.replace(new RegExp(TOKEN_PATH_PATTERN, "g"), `/$1/${TOKEN_PLACEHOLDER}`);
    expect(asBrowser).toBe(sanitizeTelemetryPath(href));
    expect(asBrowser).not.toContain(PORTAL_TOKEN);
  });
});
