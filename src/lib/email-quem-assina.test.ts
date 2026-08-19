import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { ADMIN_COOKIE, createSession } from "./admin-auth";
import { nomeDeQuemEnvia } from "./email-quem-assina";

beforeAll(() => {
  process.env.SESSION_SECRET = "um-segredo-de-teste-com-tamanho-que-chegue";
});

/** Um pedido com (ou sem) o cookie de sessão do back office. */
function pedido(token?: string): NextRequest {
  const req = new NextRequest("https://liquen-events.com/api/orcamento/q1/proposta", {
    method: "POST",
  });
  if (token) req.cookies.set(ADMIN_COOKIE, token);
  return req;
}

describe("nomeDeQuemEnvia", () => {
  it("dá o nome de quem tem a sessão iniciada", () => {
    expect(nomeDeQuemEnvia(pedido(createSession("Catarina Gaspar")))).toBe("Catarina Gaspar");
    expect(nomeDeQuemEnvia(pedido(createSession("Rui Belo")))).toBe("Rui Belo");
  });

  /** Sem sessão o email não devia sequer sair (as rotas exigem-na), mas se
   *  sair assina a casa em vez de assinar em branco. */
  it("sem cookie, sem sessão e com um token forjado dá vazio", () => {
    expect(nomeDeQuemEnvia(pedido())).toBe("");
    expect(nomeDeQuemEnvia(pedido("isto.nao-e-um-token"))).toBe("");
  });

  it("apara os espaços em vez de os deixar chegar à assinatura", () => {
    expect(nomeDeQuemEnvia(pedido(createSession("  Rui   Belo  ")))).toBe("Rui Belo");
  });
});
