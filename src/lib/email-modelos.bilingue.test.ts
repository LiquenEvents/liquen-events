import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
vi.mock("./email-templates-store", async () => {
  const real = await vi.importActual<typeof import("./email-templates-store")>(
    "./email-templates-store",
  );
  return { ...real, getTemplate: get };
});

const { modeloParaEnvioAPedido, modeloParaEnvioAutomatico } = await import("./email-modelos");

const linha = (key: string, subject: string, body: string) => ({
  key,
  name: "Curto",
  subject,
  body,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(() => get.mockReset());

describe("o email segue a língua do cliente", () => {
  it("um pedido inglês vai buscar a linha «@en»", async () => {
    get.mockImplementation(async (id: string) =>
      id === "curto@en" ? linha(id, "Your proposal", "<p>Hello {{cliente_nome}}</p>") : null,
    );
    const r = await modeloParaEnvioAPedido("curto" as never, { cliente_nome: "Marta" }, "en");
    expect(get).toHaveBeenCalledWith("curto@en");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assunto).toBe("Your proposal");
    expect(r.html).toContain("Hello Marta");
  });

  it("um pedido português continua a ir à chave nua", async () => {
    get.mockImplementation(async (id: string) =>
      id === "curto" ? linha(id, "A tua proposta", "<p>Olá {{cliente_nome}}</p>") : null,
    );
    const r = await modeloParaEnvioAPedido("curto" as never, { cliente_nome: "Marta" }, "pt");
    expect(get).toHaveBeenCalledWith("curto");
    expect(r.ok).toBe(true);
  });

  it("sem versão inglesa guardada NEM de origem, recusa — não traduz nem manda português", async () => {
    get.mockResolvedValue(null);
    const r = await modeloParaEnvioAPedido("sinal-recebido" as never, {}, "en");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/inglesa/i);
  });

  it("o envio automático também respeita a língua", async () => {
    get.mockImplementation(async (id: string) =>
      id === "registo-formal@en" ? linha(id, "Proposal", "<p>Hello {{cliente_nome}}</p>") : null,
    );
    const r = await modeloParaEnvioAutomatico(
      "registo-formal" as never,
      { cliente_nome: "Marta" },
      "en",
    );
    expect(r?.assunto).toBe("Proposal");
  });

  it("o envio automático sem língua indicada continua português — nada muda para quem já chama", async () => {
    get.mockImplementation(async (id: string) =>
      id === "proposta-enviada" ? linha(id, "A sua proposta", "<p>Olá {nome}</p>") : null,
    );
    const r = await modeloParaEnvioAutomatico("proposta-enviada" as never, { nome: "Marta" });
    expect(get).toHaveBeenCalledWith("proposta-enviada");
    expect(r?.assunto).toBe("A sua proposta");
  });
});
