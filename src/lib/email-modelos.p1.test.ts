import { describe, it, expect } from "vitest";
import { prepararModelo, marcadoresDoPedido } from "./email-modelos";
import { REMETENTE_POR_OMISSAO } from "./email-template-vars";
import type { EmailTemplate } from "./email-templates-store";

const modelo = (subject: string, body: string): EmailTemplate => ({
  key: "k",
  name: "Registo formal",
  subject,
  body,
  updatedAt: "",
});

describe("prepararModelo — o dialecto novo {{...}}", () => {
  it("desenha variáveis e blocos", () => {
    const r = prepararModelo(
      modelo(
        "Proposta {{cliente_nome}}",
        "<p>Olá {{cliente_nome}}{{#se evento_data}}, a {{evento_data}}{{/se}}.</p>",
      ),
      { cliente_nome: "Marta", evento_data: "12 de setembro de 2026" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assunto).toBe("Proposta Marta");
    expect(r.html).toContain("Olá Marta, a 12 de setembro de 2026.");
  });

  it("uma variável vazia GUARDADA pelo seu bloco não impede o envio", () => {
    const r = prepararModelo(
      modelo(
        "Proposta",
        "<p>Olá {{cliente_nome}}{{#se evento_data}}, a {{evento_data}}{{/se}}.</p>" +
          "{{#se_nao evento_data}}<p>Aguardamos a data.</p>{{/se_nao}}",
      ),
      { cliente_nome: "Marta", evento_data: "" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain("Olá Marta.");
    expect(r.html).toContain("Aguardamos a data.");
    expect(r.html).not.toContain("{{");
  });

  it("uma variável vazia A DESCOBERTO recusa o envio e diz qual é", () => {
    const r = prepararModelo(modelo("Proposta", "<p>Olá {{cliente_nome}},</p>"), {
      cliente_nome: "",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.emFalta).toEqual(["cliente_nome"]);
    expect(r.motivo).toContain("Primeiro nome");
    expect(r.motivo).toContain("NÃO foi enviado");
  });

  it("escapa o HTML dos valores no corpo, mas não no assunto", () => {
    const r = prepararModelo(modelo("{{cliente_nome}}", "<p>{{cliente_nome}}</p>"), {
      cliente_nome: "<b>Marta</b> & João",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain("&lt;b&gt;Marta&lt;/b&gt; &amp; João");
    expect(r.html).not.toContain("<b>Marta</b>");
    expect(r.assunto).toBe("<b>Marta</b> & João");
  });

  it("um modelo cujo corpo fica vazio depois dos blocos é recusado", () => {
    const r = prepararModelo(modelo("Proposta", "{{#se evento_data}}<p>x</p>{{/se}}"), {
      evento_data: "",
    });
    expect(r.ok).toBe(false);
  });
});

describe("prepararModelo — o dialecto antigo {x} continua igual", () => {
  it("desenha e escapa como sempre desenhou", () => {
    const r = prepararModelo(modelo("Olá {nome}", "<p>Olá {nome}</p>"), { nome: "Rui & Ana" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assunto).toBe("Olá Rui & Ana");
    expect(r.html).toContain("Rui &amp; Ana");
  });

  it("recusa o marcador antigo sem valor, como antes", () => {
    const r = prepararModelo(modelo("Falta uma semana para {data_evento}", "<p>x</p>"), {
      data_evento: "",
    });
    expect(r.ok).toBe(false);
  });
});

describe("marcadoresDoPedido — a ponte para as variáveis novas", () => {
  const pedido = { name: "Marta Sofia Gaspar", date: "2026-09-12", location: "Évora" };

  it("dá as chaves antigas e as novas ao mesmo tempo", () => {
    const v = marcadoresDoPedido(pedido, { link: "https://x", valor: "14.500,00 €" });
    expect(v.nome).toBe("Marta");
    expect(v.cliente_nome).toBe("Marta");
    expect(v.cliente_nome_completo).toBe("Marta Sofia Gaspar");
    expect(v.evento_data).toBe(v.data_evento);
    expect(v.evento_local).toBe("Évora");
    expect(v.link_proposta).toBe("https://x");
    expect(v.valor_total).toBe("14.500,00 €");
  });

  it("o remetente é a casa — nunca o cliente", () => {
    const v = marcadoresDoPedido(pedido);
    expect(v.remetente_nome).toBe(REMETENTE_POR_OMISSAO);
    expect(v.remetente_nome).not.toMatch(/Marta/);
  });

  it("um remetente indicado à parte é respeitado, e continua a não ser o cliente", () => {
    const v = marcadoresDoPedido(pedido, { remetente_nome: "Catarina Gaspar" });
    expect(v.remetente_nome).toBe("Catarina Gaspar");
  });

  it("o que não existe fica vazio — nunca «a definir»", () => {
    const v = marcadoresDoPedido({ name: "Marta" });
    expect(v.evento_data).toBe("");
    expect(v.evento_local).toBe("");
    expect(v.valor_total).toBe("");
  });
});
