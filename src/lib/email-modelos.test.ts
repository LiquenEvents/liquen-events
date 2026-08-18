import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MODELOS DELA, A CAMINHO DE UM CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estes testes fecham é o troço entre o texto que ela escreve no ecrã
 * «Modelos de email» e o email que sai — o troço que até aqui não existia:
 * `renderTemplate` não tinha um único chamador de produção.
 *
 * Os quatro defeitos que este troço pode ter, e que estão aqui um a um:
 *   • o rodapé A DOBRAR (o modelo traz o seu, a assinatura da casa traz outro);
 *   • o marcador sem valor, que deixava «Falta uma semana para » no assunto;
 *   • o modelo vazio, que dava um email em branco a um cliente;
 *   • o valor do cliente a entrar como markup no corpo.
 */

const guardado = vi.hoisted(() => ({
  fn: vi.fn(async (_chave: string) => null as unknown),
}));

vi.mock("./email-templates-store", async (original) => {
  const real = await original<typeof import("./email-templates-store")>();
  return { ...real, getTemplate: guardado.fn };
});

import {
  desmoldurar,
  textoDoCorpo,
  prepararModelo,
  modeloParaEnvioAutomatico,
  modeloParaEnvioAPedido,
  marcadoresDoPedido,
} from "./email-modelos";
import type { EmailTemplate } from "./email-templates-store";
import type { Quote } from "./orcamento/types";

const tpl = (subject: string, body: string, name = "Modelo"): EmailTemplate => ({
  key: "sinal-recebido",
  name,
  subject,
  body,
  updatedAt: "",
});

/** Um corpo tal e qual como fica GUARDADO hoje: moldura própria e rodapé
 *  próprio lá dentro — é o que está na base dela neste momento. */
const CORPO_GUARDADO = [
  `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
  `  <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">Está tudo tratado</h2>`,
  `  <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Olá {nome},</p>`,
  `  <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">`,
  `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Portugal</p>`,
  `</div>`,
].join("\n");

beforeEach(() => {
  guardado.fn.mockReset();
  guardado.fn.mockResolvedValue(null);
});

describe("desmoldurar — onde acaba o modelo e onde começa a moldura da casa", () => {
  it("tira o rodapé que os modelos GUARDADOS dela já têm lá dentro", () => {
    const corpo = desmoldurar(CORPO_GUARDADO);
    expect(corpo).not.toContain("Líquen Events · Portugal");
    expect(corpo).not.toMatch(/<hr\b/i);
    // O que é dela fica intacto.
    expect(corpo).toContain("Está tudo tratado");
    expect(corpo).toContain("Olá {nome},");
  });

  it("tira a moldura exterior — a do `emailAoCliente` é que manda", () => {
    const corpo = desmoldurar(CORPO_GUARDADO);
    expect(corpo.trimStart().startsWith("<div")).toBe(false);
    expect(corpo).not.toContain("max-width:560px");
  });

  it("deixa em paz um `<div>` interior que não é a moldura", () => {
    const corpo = desmoldurar(`<p>Olá</p>\n<div class="caixa">dentro</div>`);
    expect(corpo).toContain(`<div class="caixa">dentro</div>`);
    expect(corpo).toContain("<p>Olá</p>");
  });

  it("não manda para o cliente o marcador escondido do editor", () => {
    const corpo = desmoldurar(`<!-- liquen:rich:v1:AAAA --><p>Olá</p>`);
    expect(corpo).not.toContain("liquen:rich");
    const simples = desmoldurar(`<!-- liquen:simple:v1:AAAA --><p>Olá</p>`);
    expect(simples).not.toContain("liquen:simple");
  });
});

describe("textoDoCorpo — a versão em texto simples que todo o correio leva", () => {
  it("não manda etiquetas nem entidades para quem lê em texto", () => {
    const texto = textoDoCorpo(`<p>Marta &amp; Jo&#227;o</p><p>Segundo par&#xE1;grafo</p>`);
    expect(texto).not.toMatch(/[<>]/);
    expect(texto).toContain("Marta & João");
    expect(texto).toContain("Segundo parágrafo");
  });

  it("uma ligação leva o endereço consigo — em texto não há onde carregar", () => {
    const texto = textoDoCorpo(`<p><a href="https://liquen.test/p/abc">Ver proposta</a></p>`);
    expect(texto).toContain("Ver proposta (https://liquen.test/p/abc)");
  });

  it("não repete o endereço quando o texto da ligação já é o endereço", () => {
    const url = "https://liquen.test/p/abc";
    const texto = textoDoCorpo(`<p><a href="${url}">${url}</a></p>`);
    expect(texto.match(/https:\/\/liquen\.test/g)).toHaveLength(1);
  });
});

describe("prepararModelo — o que se recusa a sair", () => {
  it("um modelo vazio (ou só com espaços) não vira um email em branco", () => {
    const so_espacos = prepararModelo(tpl("Assunto", `<div>\n  <p>   </p>\n</div>`), {});
    expect(so_espacos.ok).toBe(false);
    const sem_assunto = prepararModelo(tpl("   ", `<p>Olá</p>`), {});
    expect(sem_assunto.ok).toBe(false);
  });

  it("«Falta uma semana para {data_evento}» sem data NÃO sai com o buraco", () => {
    const r = prepararModelo(
      tpl(
        "Falta uma semana para {data_evento}",
        `<p>Olá {nome}, em {local}.</p>`,
        "Falta uma semana",
      ),
      { nome: "Ana", data_evento: "", local: "  " },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.emFalta).toEqual(["data_evento", "local"]);
    // A frase tem de servir a quem está com o dedo no botão: diz o modelo,
    // diz o dado que falta, e diz que NÃO foi enviado.
    expect(r.motivo).toContain("Falta uma semana");
    expect(r.motivo).toContain("{data_evento}");
    expect(r.motivo).toContain("{local}");
    expect(r.motivo).toMatch(/não foi enviado/i);
  });

  it("um marcador que o modelo não usa não impede nada", () => {
    const r = prepararModelo(tpl("Olá", `<p>Olá {nome}.</p>`), { nome: "Ana", local: "" });
    expect(r.ok).toBe(true);
  });

  it("o corpo escapa os valores do cliente; o assunto NÃO — é um cabeçalho", () => {
    const r = prepararModelo(tpl("Proposta para {nome}", `<p>Olá {nome},</p>`), {
      nome: `L'Étoile <b>Marta & João</b>`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain("&lt;b&gt;");
    expect(r.html).toContain("&amp;");
    expect(r.html).not.toContain("<b>Marta");
    // O apóstrofo também é escapado pelo `esc` do servidor (`&#39;`) — e volta
    // a ser um apóstrofo na versão em texto, que é onde ela o vai ler.
    expect(r.html).toContain("L&#39;Étoile");
    expect(r.texto).toContain("L'Étoile");
    // O assunto é texto de uma ponta à outra: quem o codifica é o nodemailer.
    expect(r.assunto).toBe(`Proposta para L'Étoile <b>Marta & João</b>`);
  });

  it("o texto simples do corpo não traz de volta as etiquetas do cliente", () => {
    const r = prepararModelo(tpl("Olá", `<p>Olá {nome},</p>`), { nome: `<script>x</script>` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto).not.toMatch(/[<>]/);
  });

  it("o {link} entra no href E no texto visível, sem escapar o endereço a mais", () => {
    const link = "https://liquen-events.com/proposta/tok-real";
    const r = prepararModelo(tpl("Olá", `<p><a href="{link}">{link}</a></p>`), { link });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain(`href="${link}"`);
    expect(r.texto).toContain(link);
  });
});

describe("modeloParaEnvioAutomatico — o caminho da proposta, com recurso", () => {
  it("sem nada guardado devolve nulo: sai o texto da casa, nunca um email vazio", async () => {
    guardado.fn.mockResolvedValue(null);
    expect(await modeloParaEnvioAutomatico("proposta-enviada", { nome: "Ana" })).toBeNull();
  });

  it("guardado mas em branco devolve nulo — o recurso é o texto da casa", async () => {
    guardado.fn.mockResolvedValue(tpl("Assunto", "   \n  "));
    expect(await modeloParaEnvioAutomatico("proposta-enviada", { nome: "Ana" })).toBeNull();
  });

  it("guardado com um marcador sem valor devolve nulo — nunca um buraco", async () => {
    guardado.fn.mockResolvedValue(tpl("Assunto", `<p>Olá {nome}, em {local}.</p>`));
    expect(await modeloParaEnvioAutomatico("proposta-enviada", { nome: "Ana" })).toBeNull();
  });

  it("guardado e preenchido é o que sai — já sem o rodapé dele", async () => {
    guardado.fn.mockResolvedValue(tpl("A sua proposta", CORPO_GUARDADO));
    const out = await modeloParaEnvioAutomatico("proposta-enviada", { nome: "Ana" });
    expect(out).not.toBeNull();
    expect(out?.assunto).toBe("A sua proposta");
    expect(out?.html).toContain("Olá Ana,");
    expect(out?.html).not.toContain("Líquen Events · Portugal");
    expect(out?.texto).toContain("Olá Ana,");
  });

  it("uma avaria a ler a tabela não trava a proposta — devolve nulo", async () => {
    guardado.fn.mockRejectedValue(new Error("relation does not exist"));
    expect(await modeloParaEnvioAutomatico("proposta-enviada", { nome: "Ana" })).toBeNull();
  });
});

describe("modeloParaEnvioAPedido — os botões dela", () => {
  it("sem nada guardado usa a semente: o botão tem sempre um email a sério", async () => {
    guardado.fn.mockResolvedValue(null);
    const r = await modeloParaEnvioAPedido("agradecimento", { nome: "Ana" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assunto).toBe("Obrigado por nos ter escolhido");
    expect(r.html).not.toContain("Líquen Events · Portugal");
  });

  it("a semente do sinal sem valor recusa, em vez de dizer «recebemos »", async () => {
    guardado.fn.mockResolvedValue(null);
    const r = await modeloParaEnvioAPedido("sinal-recebido", { nome: "Ana" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.emFalta).toContain("valor");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS EMAILS DE ACOMPANHAMENTO SAEM SEMPRE EM PORTUGUÊS — E NÃO PODEM
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Ao contrário da proposta (que tem o texto da casa em inglês como rede),
   * estes três modelos só existem em português. Um pedido inglês tem de
   * RECUSAR o envio, não mandar português — um casal britânico não pode ler
   * «Sinal recebido, reserva confirmada» sem perceber nada.
   */
  it("um pedido inglês recusa o envio, em vez de mandar português", async () => {
    guardado.fn.mockResolvedValue(null);
    const r = await modeloParaEnvioAPedido(
      "sinal-recebido",
      { nome: "Ana", valor: "1.500,00 €" },
      "en",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/inglês/i);
    expect(r.motivo).toMatch(/não foi enviado/i);
    expect(r.motivo).toContain("Sinal recebido");
  });

  it("um pedido português continua a usar o modelo, como sempre", async () => {
    guardado.fn.mockResolvedValue(null);
    const r = await modeloParaEnvioAPedido("agradecimento", { nome: "Ana" }, "pt");
    expect(r.ok).toBe(true);
  });

  it("um pedido sem língua gravada (anterior ao campo) continua a usar o modelo", async () => {
    guardado.fn.mockResolvedValue(null);
    const r = await modeloParaEnvioAPedido("agradecimento", { nome: "Ana" }, undefined);
    expect(r.ok).toBe(true);
  });
});

describe("marcadoresDoPedido — de onde vêm os valores", () => {
  const pedido = {
    id: "LIQ-1",
    name: "Francisco Maria Carrelhas Gaspar",
    email: "f@x.pt",
    date: "2026-09-12",
    location: "Herdade da Malhadinha",
    company: "Acme Lda",
  } as unknown as Quote;

  it("o nome é o PRIMEIRO nome — é assim que se trata um cliente", () => {
    expect(marcadoresDoPedido(pedido).nome).toBe("Francisco");
  });

  it("a data sai escrita como se escreve em Portugal, não em ISO", () => {
    const v = marcadoresDoPedido(pedido).data_evento;
    expect(v).not.toBe("2026-09-12");
    expect(v).toMatch(/12 de setembro de 2026/i);
  });

  it("uma data por preencher fica VAZIA — é o que faz a recusa acontecer", () => {
    const semData = { ...pedido, date: "" } as unknown as Quote;
    expect(marcadoresDoPedido(semData).data_evento).toBe("");
  });

  it("o que vier de fora (o link, o valor) sobrepõe-se ao pedido", () => {
    const v = marcadoresDoPedido(pedido, { link: "https://x.pt/t", valor: "1 500,00 €" });
    expect(v.link).toBe("https://x.pt/t");
    expect(v.valor).toBe("1 500,00 €");
  });
});
