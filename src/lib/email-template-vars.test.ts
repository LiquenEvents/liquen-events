import { describe, it, expect } from "vitest";
import {
  construirValores,
  primeiroNome,
  VARIAVEIS,
  REMETENTE_POR_OMISSAO,
  type EntradaDosValores,
} from "./email-template-vars";
import { renderizarCorpo } from "./email-template-engine";

const base: EntradaDosValores = {
  destinatario: { nomeCompleto: "Marta Sofia Carrelhas Gaspar" },
};

describe("o remetente NUNCA é o destinatário", () => {
  it("sem remetente indicado, assina a casa — nunca o cliente", () => {
    const v = construirValores(base);
    expect(v.remetente_nome).toBe(REMETENTE_POR_OMISSAO);
    expect(v.remetente_nome).not.toBe(v.cliente_nome);
    expect(v.remetente_nome).not.toBe(v.cliente_nome_completo);
    expect(v.remetente_nome).not.toMatch(/Marta/);
  });

  it("mudar o cliente não mexe uma letra no remetente", () => {
    const a = construirValores({ ...base, remetente: { nome: "Catarina Gaspar" } });
    const b = construirValores({
      destinatario: { nomeCompleto: "João Pereira" },
      remetente: { nome: "Catarina Gaspar" },
    });
    expect(a.remetente_nome).toBe("Catarina Gaspar");
    expect(b.remetente_nome).toBe("Catarina Gaspar");
  });

  it("um remetente vazio ou só com espaços cai na casa, não no cliente", () => {
    for (const nome of ["", "   ", undefined]) {
      const v = construirValores({ ...base, remetente: { nome } });
      expect(v.remetente_nome).toBe(REMETENTE_POR_OMISSAO);
      expect(v.remetente_nome).not.toMatch(/Marta/);
    }
  });

  it("no email desenhado, a assinatura não traz o nome do casal", () => {
    const v = construirValores({ ...base, remetente: { nome: "Catarina Gaspar" } });
    const saida = renderizarCorpo("Olá {{cliente_nome}},<br>{{remetente_nome}}", v);
    expect(saida).toBe("Olá Marta,<br>Catarina Gaspar");
  });

  it("nenhuma variável fora das do cliente carrega o nome do cliente", () => {
    const v = construirValores({
      destinatario: { nomeCompleto: "Marta Gaspar", email: "marta@exemplo.pt" },
      evento: { tipo: "casamentos", dataIso: "2026-09-12", local: "Évora" },
      proposta: { totalComIva: 14500, validadeIso: "2026-03-01", sinalPercentagem: 30, link: "u" },
      remetente: { nome: "Catarina Gaspar" },
    });
    for (const [chave, valor] of Object.entries(v)) {
      if (chave.startsWith("cliente_")) continue;
      expect(valor, `«${chave}» traz o nome do cliente`).not.toMatch(/Marta/);
    }
  });
});

describe("primeiro nome", () => {
  it("é o primeiro, não o legal completo", () => {
    expect(primeiroNome("Francisco Maria Carrelhas Das Neves Da Palma Gaspar")).toBe("Francisco");
  });
  it("aguenta espaços a mais e vazio", () => {
    expect(primeiroNome("  Marta   Gaspar ")).toBe("Marta");
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome(undefined)).toBe("");
  });
});

describe("os valores", () => {
  it("data por extenso em português", () => {
    const v = construirValores({ ...base, evento: { dataIso: "2026-09-12" } });
    expect(v.evento_data).toBe("12 de setembro de 2026");
  });

  it("data por extenso em inglês quando o pedido é inglês", () => {
    const v = construirValores({ ...base, evento: { dataIso: "2026-09-12" }, idioma: "en" });
    expect(v.evento_data).toMatch(/12 September 2026/);
  });

  it("data por definir fica VAZIA — nunca «a definir»", () => {
    const v = construirValores({ ...base, evento: { dataIso: "" } });
    expect(v.evento_data).toBe("");
  });

  it("o tipo de evento sai pelo nome, na língua de quem lê", () => {
    expect(construirValores({ ...base, evento: { tipo: "casamentos" } }).evento_tipo).toBe(
      "Casamento",
    );
    expect(
      construirValores({ ...base, evento: { tipo: "casamentos" }, idioma: "en" }).evento_tipo,
    ).toBe("Wedding");
  });

  it("o valor total vem formatado com IVA", () => {
    expect(construirValores({ ...base, proposta: { totalComIva: 14500 } }).valor_total).toMatch(
      /14[. ]500/,
    );
  });

  it("um total ausente fica vazio e não «0 €»", () => {
    expect(construirValores(base).valor_total).toBe("");
  });

  it("a percentagem do sinal leva o símbolo", () => {
    expect(construirValores({ ...base, proposta: { sinalPercentagem: 30 } }).sinal_percentagem).toBe(
      "30%",
    );
  });

  it("todas as variáveis do catálogo têm uma chave no mapa", () => {
    const v = construirValores(base);
    for (const item of VARIAVEIS) expect(Object.keys(v)).toContain(item.chave);
  });

  it("o catálogo separa o cliente de quem assina", () => {
    const remetente = VARIAVEIS.find((x) => x.chave === "remetente_nome");
    expect(remetente?.grupo).toBe("remetente");
    expect(VARIAVEIS.find((x) => x.chave === "cliente_nome")?.grupo).toBe("cliente");
  });
});

describe("um casal são duas pessoas", () => {
  it("mantém os dois no cumprimento", () => {
    expect(primeiroNome("Marta Sofia Gaspar e João Pedro Pereira")).toBe("Marta e João");
    expect(primeiroNome("Marta & João Pereira")).toBe("Marta e João");
  });
  it("uma pessoa só continua a ser um nome só", () => {
    expect(primeiroNome("Marta Sofia Gaspar")).toBe("Marta");
  });
  it("não confunde um «e» que faz parte do nome", () => {
    expect(primeiroNome("Maria Estrela")).toBe("Maria");
  });
});
