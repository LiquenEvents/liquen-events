import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O modelo guardado é o que este ficheiro controla: cada caso escreve o texto
 * que quer ver resolvido, e a ponte (`rascunhoParaEnvio`) lê-o daqui como leria
 * o que ela escreveu em «Modelos de email».
 */
let guardado: { name: string; subject: string; body: string } | null = null;
const get = vi.fn(async () => guardado);
vi.mock("./email-templates-store", async () => {
  const real =
    await vi.importActual<typeof import("./email-templates-store")>("./email-templates-store");
  return { ...real, getTemplate: get };
});

const { rascunhoDoEnvio, valoresDoEnvio } = await import("./email-rascunho-do-envio");
const { MARCADOR_DA_LIGACAO } = await import("./email-ligacao-reservada");
const { construirCorpoDeModelo } = await import("./email-template-format");

/** Um corpo de modelo tal como o editor o guarda: texto simples embrulhado. */
const modelo = (texto: string) => ({
  name: "Modelo de teste",
  subject: "Proposta | Líquen Events",
  body: construirCorpoDeModelo(texto),
});

beforeEach(() => {
  get.mockClear();
  guardado = null;
});

const so = async (texto: string, valores: Record<string, string>) => {
  guardado = modelo(texto);
  const r = await rascunhoDoEnvio({ chave: "x", idioma: "pt", valores });
  if ("erro" in r) throw new Error(r.erro);
  return r;
};

describe("o aviso do «Olá ,»", () => {
  it("acusa a variável vazia que fica à vista", async () => {
    const r = await so("Olá {{cliente_nome}},", { cliente_nome: "" });
    expect(r.porPreencher.map((v) => v.chave)).toEqual(["cliente_nome"]);
    // E dá-lhe o nome que ela lê no menu de variáveis, não a chave crua.
    expect(r.porPreencher[0].rotulo).toBe("Primeiro nome");
    // «Olá ,» — com o espaço órfão — era o que o desenho produzia antes de o
    // `arrumarEspacos` existir. O que ESTE teste guarda é que a limpeza não
    // esconde o problema: o aviso continua a nomear a variável, porque olha
    // para o MODELO e não para o texto desenhado. Se um dia passar a olhar
    // para o texto, este par de asserções acende.
    expect(r.rascunho.texto).toBe("Olá,");
  });

  /**
   * A REGRA DO P1, e a razão de este ficheiro existir. Uma variável vazia
   * guardada pelo seu próprio `{{#se}}` não é uma falta: ela já escreveu o que
   * fazer sem esse dado, e acusá-la disso era discutir uma decisão tomada.
   */
  it("cala-se sobre a variável que o seu próprio {{#se}} protege", async () => {
    const r = await so("Proposta{{#se evento_data}}, a {{evento_data}}{{/se}}.", {
      evento_data: "",
    });
    expect(r.porPreencher).toEqual([]);
    expect(r.rascunho.texto).toBe("Proposta.");
  });

  /**
   * CONTROLO POSITIVO do caso de cima: a mesma variável vazia, o mesmo modelo,
   * mas guardada por OUTRO nome. Aí está mesmo a descoberto e tem de sair
   * nomeada — senão o teste anterior passava por o aviso nunca dizer nada.
   */
  it("mas acusa-a quando quem a guarda é outra variável", async () => {
    const r = await so("{{#se evento_local}}No {{evento_local}}, a {{evento_data}}{{/se}}.", {
      evento_local: "Herdade da Malhadinha",
      evento_data: "",
    });
    expect(r.porPreencher.map((v) => v.chave)).toEqual(["evento_data"]);
  });

  it("não acusa o que está dentro de um bloco que nem chega a ser desenhado", async () => {
    const r = await so("{{#se evento_local}}No {{evento_local}}{{/se}}fim.", {
      evento_local: "",
    });
    expect(r.porPreencher).toEqual([]);
    expect(r.rascunho.texto).toBe("fim.");
  });

  it("nomeia as duas quando são duas, e cada uma uma vez só", async () => {
    const r = await so("Olá {{cliente_nome}}, a {{evento_data}} em {{evento_data}}.", {
      cliente_nome: "",
      evento_data: "",
      evento_local: "",
    });
    expect(r.porPreencher.map((v) => v.chave)).toEqual(["cliente_nome", "evento_data"]);
  });

  it("também olha para o ASSUNTO, que é a linha que o casal lê primeiro", async () => {
    guardado = { ...modelo("Corpo sem variáveis."), subject: "Proposta para {{cliente_nome}}" };
    const r = await rascunhoDoEnvio({ chave: "x", idioma: "pt", valores: { cliente_nome: "" } });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.porPreencher.map((v) => v.chave)).toEqual(["cliente_nome"]);
  });

  /** O caminho normal — nada por preencher — não pode custar uma passagem por
   *  variável: é o que acontece em todos os envios. */
  it("com tudo preenchido não desenha nem uma vez a mais", async () => {
    guardado = modelo("Olá {{cliente_nome}}, a {{evento_data}}.");
    const r = await rascunhoDoEnvio({
      chave: "x",
      idioma: "pt",
      valores: { cliente_nome: "Marta", evento_data: "12 de setembro de 2026" },
    });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.porPreencher).toEqual([]);
    // Uma leitura do modelo, e mais nenhuma: sem valores vazios não há segunda
    // passagem a fazer.
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("os valores desta proposta", () => {
  const base = {
    clientNames: "Marta Sofia Gaspar e João Pedro Pereira",
    emailDoCliente: "marta@exemplo.pt",
    tipoDeEvento: "casamentos",
    dataIso: "2026-09-12",
    local: "Herdade da Malhadinha",
    totalComIva: 14500,
    validadeIso: "2026-03-31",
    sinalPercentagem: 30,
    idioma: "pt" as const,
  };

  it("saúda o casal pelos dois primeiros nomes", () => {
    expect(valoresDoEnvio(base).cliente_nome).toBe("Marta e João");
  });

  it("a ligação leva o marcador, porque ainda não há proposta para assinar", () => {
    expect(valoresDoEnvio(base).link_proposta).toBe(MARCADOR_DA_LIGACAO);
  });

  /**
   * A LINHA QUE SEPARA QUEM RECEBE DE QUEM ASSINA. Já saiu correio desta casa
   * assinado com o nome do cliente; o ecrã de envio é mais um sítio onde os
   * dois passam lado a lado, e não pode ser o sítio onde voltam a trocar-se.
   */
  it("quem assina é quem tem a sessão — nunca o casal", () => {
    expect(valoresDoEnvio({ ...base, remetente: "Catarina Gaspar" }).remetente_nome).toBe(
      "Catarina Gaspar",
    );
    // Sem sessão, cai no nome da CASA. Nunca, em caso nenhum, no do cliente.
    const semSessao = valoresDoEnvio(base);
    expect(semSessao.remetente_nome).toBe("Líquen Events");
    expect(semSessao.remetente_nome).not.toContain("Marta");
    expect(semSessao.remetente_nome).not.toContain("João");
  });

  it("o valor é o desta proposta, formatado como o cliente o vê", () => {
    // O espaço antes do símbolo é o INSEPARÁVEL do português — normaliza-se
    // aqui para o teste falar do número e não da largura do espaço.
    expect(valoresDoEnvio(base).valor_total.replace(/\u00a0/g, " ")).toBe("14.500,00 €");
  });

  it("um evento ainda sem data dá vazio — nunca um «a definir» inventado", () => {
    expect(valoresDoEnvio({ ...base, dataIso: "" }).evento_data).toBe("");
  });
});
