import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn(async () => null);
vi.mock("./email-templates-store", async () => {
  const real =
    await vi.importActual<typeof import("./email-templates-store")>("./email-templates-store");
  return { ...real, getTemplate: get };
});

const { rascunhoParaEnvio, corpoEnviavel, MODELO_POR_OMISSAO } =
  await import("./email-modelos-rascunho");
const { construirValores } = await import("./email-template-vars");

const LINK = "https://liquenevents.pt/proposta/abc";

const valores = (comData: boolean) =>
  construirValores({
    destinatario: { nomeCompleto: "Marta Sofia Gaspar e João Pedro Pereira" },
    evento: {
      tipo: "casamentos",
      dataIso: comData ? "2026-09-12" : "",
      local: "Herdade da Malhadinha",
    },
    proposta: { totalComIva: 14500, validadeIso: "2026-03-31", link: LINK },
    remetente: { nome: "Catarina Gaspar" },
  });

beforeEach(() => get.mockClear());

/**
 * O CAMINHO SEM EDIÇÃO É O CAMINHO NORMAL, e é por isso que é aqui que se
 * prende o texto palavra por palavra. Se alguma normalização de espaços, um
 * sanitizador zeloso ou uma ida e volta por HTML lhe mexer, é este teste que
 * cai — e não um casal a receber o email já enviado.
 */
const COM_DATA = [
  "Olá Marta e João, boa tarde,",
  "",
  "De acordo com o solicitado, enviamos a nossa proposta de decoração e respetivo orçamento para o Casamento no Herdade da Malhadinha, a 12 de setembro de 2026.",
  "",
  `A proposta segue em anexo e pode também ser consultada aqui: ${LINK}`,
  "",
  "Estamos ao Vosso dispor para esclarecimento de alguma dúvida ou questão, ou adaptação e ajuste de alguma ideia ou outras sugestões de decor.",
  "",
  "Obrigada, agradecemos a atenção e aguardamos o Vosso feedback.",
].join("\n");

const SEM_DATA = [
  "Olá Marta e João, boa tarde,",
  "",
  "De acordo com o solicitado, enviamos a nossa proposta de decoração e respetivo orçamento para o Casamento no Herdade da Malhadinha.",
  "",
  "Ainda aguardamos a informação relativamente à data, mas podemos depois acrescentá-la à proposta.",
  "",
  `A proposta segue em anexo e pode também ser consultada aqui: ${LINK}`,
  "",
  "Estamos ao Vosso dispor para esclarecimento de alguma dúvida ou questão, ou adaptação e ajuste de alguma ideia ou outras sugestões de decor.",
  "",
  "Obrigada, agradecemos a atenção e aguardamos o Vosso feedback.",
].join("\n");

describe("o rascunho que abre no envio", () => {
  it("por omissão é o «Registo formal»", async () => {
    expect(MODELO_POR_OMISSAO).toBe("registo-formal");
    const r = await rascunhoParaEnvio({ valores: valores(true) });
    expect("erro" in r).toBe(false);
    if ("erro" in r) return;
    expect(r.chave).toBe("registo-formal");
  });

  it("o texto dela chega PALAVRA POR PALAVRA, só com as variáveis resolvidas", async () => {
    const r = await rascunhoParaEnvio({ valores: valores(true) });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.texto).toBe(COM_DATA);
  });

  it("sem data, entra o parágrafo dela e o espaçamento fica igual", async () => {
    const r = await rascunhoParaEnvio({ valores: valores(false) });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.texto).toBe(SEM_DATA);
  });

  it("as linhas em branco entre parágrafos são significado e sobrevivem", async () => {
    const r = await rascunhoParaEnvio({ valores: valores(true) });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.texto.split(/\n\n/)).toHaveLength(5);
    expect(r.texto).not.toMatch(/\n\n\n/);
  });

  it("não sobra uma única chaveta para ninguém ver", async () => {
    for (const v of [valores(true), valores(false)]) {
      const r = await rascunhoParaEnvio({ valores: v });
      if ("erro" in r) throw new Error(r.erro);
      expect(r.texto).not.toContain("{{");
      expect(r.assunto).not.toContain("{{");
    }
  });

  it("o «Vosso» maiúsculo dela não é «corrigido» pelo caminho", async () => {
    const r = await rascunhoParaEnvio({ valores: valores(true) });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.texto).toContain("ao Vosso dispor");
    expect(r.texto).toContain("o Vosso feedback");
    expect(r.texto).toContain("respetivo");
  });

  it("a versão inglesa vem em inglês", async () => {
    const r = await rascunhoParaEnvio({ idioma: "en", valores: valores(true) });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.texto).toContain("good afternoon");
    expect(r.texto).not.toContain("boa tarde");
  });

  it("os outros dois modelos continuam a existir para quem os for buscar", async () => {
    const r = await rascunhoParaEnvio({ chave: "curto", valores: valores(true) });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.chave).toBe("curto");
    expect(r.texto).toContain("Segue a nossa proposta");
  });

  it("um modelo que não existe naquela língua diz-se, não se inventa", async () => {
    const r = await rascunhoParaEnvio({
      chave: "sinal-recebido",
      idioma: "en",
      valores: valores(true),
    });
    expect("erro" in r).toBe(true);
  });
});

describe("do que está na caixa para o que sai", () => {
  it("o texto sai INTACTO na versão em texto simples", () => {
    expect(corpoEnviavel(COM_DATA).texto).toBe(COM_DATA);
  });

  it("cada parágrafo é um parágrafo — o email não chega como um bloco só", () => {
    const { html } = corpoEnviavel(COM_DATA);
    expect(html.match(/<p\b/g) ?? []).toHaveLength(5);
  });

  it("uma quebra de linha simples dentro de um parágrafo continua a ser uma quebra", () => {
    const { html } = corpoEnviavel("Uma linha\noutra linha");
    expect(html).toContain("Uma linha<br>outra linha");
  });

  it("escapa o que a pessoa escreveu — um «<» não parte o email", () => {
    const { html } = corpoEnviavel('Olá <b>Marta</b> & "João"');
    expect(html).toContain("&lt;b&gt;Marta&lt;/b&gt; &amp; &quot;João&quot;");
    expect(html).not.toContain("<b>Marta</b>");
  });

  it("a ligação fica carregável, e o texto simples mantém o endereço", () => {
    const { html, texto } = corpoEnviavel(`Vê aqui: ${LINK}`);
    expect(html).toContain(`href="${LINK}"`);
    expect(texto).toContain(LINK);
  });

  it("não fecha nada por ela — a assinatura da casa entra depois", () => {
    const { html } = corpoEnviavel(COM_DATA);
    expect(html).not.toMatch(/Líquen Events\s*·/);
    expect(html).not.toContain("<hr");
  });
});

describe("o remetente e o cliente, depois de tudo isto", () => {
  it("o nome do casal não chega a nenhuma variável de quem assina", async () => {
    const r = await rascunhoParaEnvio({ valores: valores(true) });
    if ("erro" in r) throw new Error(r.erro);
    const v = valores(true);
    expect(v.remetente_nome).toBe("Catarina Gaspar");
    expect(v.remetente_nome).not.toMatch(/Marta|João/);
  });
});
