import { describe, it, expect } from "vitest";
import {
  renderizarCorpo,
  renderizarAssunto,
  variaveisPorPreencher,
  validarModelo,
} from "./email-template-engine";

describe("variáveis {{...}}", () => {
  it("substitui uma variável conhecida", () => {
    expect(renderizarCorpo("Olá {{cliente_nome}},", { cliente_nome: "Marta" })).toBe("Olá Marta,");
  });

  it("aceita espaços dentro das chavetas", () => {
    expect(renderizarCorpo("{{ cliente_nome }}", { cliente_nome: "Marta" })).toBe("Marta");
  });

  it("uma variável desconhecida sai VAZIA e nunca como texto literal", () => {
    const saida = renderizarCorpo("Olá {{nao_existe}}.", {});
    // «Olá .» — com o espaço órfão — era o que saía antes de o
    // `arrumarEspacos` existir. A regra 1 continua a ser a mesma (nada de
    // chavetas para o cliente); o que mudou é que a pontuação já não fica
    // pendurada a seguir a um buraco.
    expect(saida).toBe("Olá.");
    expect(saida).not.toContain("{{");
  });

  it("escapa o HTML dos valores no corpo", () => {
    expect(renderizarCorpo("Olá {{cliente_nome}}", { cliente_nome: '<b>"M" & J</b>' })).toBe(
      "Olá &lt;b&gt;&quot;M&quot; &amp; J&lt;/b&gt;",
    );
  });

  it("NÃO escapa o assunto — é um cabeçalho, não markup", () => {
    expect(renderizarAssunto("Proposta {{cliente_nome}}", { cliente_nome: "Marta & João" })).toBe(
      "Proposta Marta & João",
    );
  });

  it("um valor que traz {{...}} lá dentro não é reinterpretado", () => {
    expect(renderizarCorpo("{{cliente_nome}}", { cliente_nome: "{{remetente_nome}}" })).toBe(
      "{{remetente_nome}}",
    );
  });
});

describe("blocos condicionais", () => {
  const modelo =
    "Proposta{{#se evento_local}} para o {{evento_tipo}} no {{evento_local}}{{/se}}" +
    "{{#se evento_data}}, a {{evento_data}}{{/se}}." +
    "{{#se_nao evento_data}} Aguardamos a data.{{/se_nao}}";

  it("mostra o bloco quando a variável tem valor", () => {
    expect(
      renderizarCorpo(modelo, {
        evento_local: "Herdade da Malhadinha",
        evento_tipo: "casamento",
        evento_data: "12 de setembro de 2026",
      }),
    ).toBe("Proposta para o casamento no Herdade da Malhadinha, a 12 de setembro de 2026.");
  });

  it("esconde o bloco e mostra o «se_nao» quando falta o valor", () => {
    expect(renderizarCorpo(modelo, { evento_local: "", evento_tipo: "casamento" })).toBe(
      "Proposta. Aguardamos a data.",
    );
  });

  it("um valor só com espaços conta como vazio", () => {
    expect(renderizarCorpo("{{#se evento_data}}X{{/se}}", { evento_data: "   " })).toBe("");
  });

  it("aninha blocos", () => {
    const fonte = "{{#se a}}A{{#se b}}B{{/se}}{{/se}}";
    expect(renderizarCorpo(fonte, { a: "1", b: "1" })).toBe("AB");
    expect(renderizarCorpo(fonte, { a: "1", b: "" })).toBe("A");
    expect(renderizarCorpo(fonte, { a: "", b: "1" })).toBe("");
  });

  it("um bloco por fechar nunca deixa {{#se}} sair para o cliente", () => {
    const saida = renderizarCorpo("Olá{{#se x}} tudo bem", { x: "1" });
    expect(saida).not.toContain("{{");
    expect(saida).toBe("Olá tudo bem");
  });

  it("um fecho a mais é ignorado, não sai como texto", () => {
    expect(renderizarCorpo("Olá{{/se}} adeus", {})).toBe("Olá adeus");
  });
});

describe("variáveis por preencher", () => {
  it("assinala a variável vazia que está a descoberto", () => {
    expect(variaveisPorPreencher("Olá {{cliente_nome}}", { cliente_nome: "" })).toEqual([
      "cliente_nome",
    ]);
  });

  it("NÃO assinala a variável vazia protegida pelo seu próprio bloco", () => {
    expect(
      variaveisPorPreencher("{{#se evento_data}}a {{evento_data}}{{/se}}", { evento_data: "" }),
    ).toEqual([]);
  });

  it("assinala a variável vazia dentro de um bloco que guarda OUTRA coisa", () => {
    expect(
      variaveisPorPreencher("{{#se evento_local}}{{evento_data}}{{/se}}", {
        evento_local: "Évora",
        evento_data: "",
      }),
    ).toEqual(["evento_data"]);
  });
});

describe("validação para o editor", () => {
  it("aceita um modelo bem escrito", () => {
    expect(validarModelo("{{#se a}}x{{/se}}{{#se_nao a}}y{{/se_nao}}")).toEqual([]);
  });

  it("apanha um bloco por fechar", () => {
    expect(validarModelo("{{#se a}}x").join(" ")).toMatch(/por fechar/i);
  });

  it("apanha um fecho sem abertura", () => {
    expect(validarModelo("x{{/se}}").join(" ")).toMatch(/sem abertura/i);
  });

  it("apanha um fecho trocado", () => {
    expect(validarModelo("{{#se a}}x{{/se_nao}}").join(" ")).toMatch(/se_nao/);
  });
});
