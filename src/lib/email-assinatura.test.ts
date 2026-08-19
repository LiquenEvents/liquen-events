import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  assinaturaDeEmail,
  assinanteDoEmail,
  emailAoCliente,
  ASSINATURA_NOME,
  ASSINATURA_CARGO,
} from "./email-assinatura";
import { log } from "./logger";
import { SITE } from "./site";
import { MAIL_TO } from "./mail";
import { EMAIL_LOGO_CID } from "./email-logo";

describe("assinaturaDeEmail", () => {
  it("assina sempre com o mesmo nome e cargo da casa", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).toContain(ASSINATURA_NOME);
    expect(html).toContain(ASSINATURA_CARGO);
    expect(texto).toContain(ASSINATURA_NOME);
    expect(texto).toContain(ASSINATURA_CARGO);
  });

  /**
   * A assinatura que ela usa no telemóvel tem «líquen.alentejo@gmail.com» e
   * «líquen-events.com», com acento no i. O endereço não existe e a ligação não
   * abre. Este teste é o que impede que alguém volte a escrever os contactos à
   * mão a partir da fotografia em vez de os ler do `SITE`.
   */
  it("nunca escreve o domínio nem o email com acento", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).not.toMatch(/líquen[.-]/i);
    expect(texto).not.toMatch(/líquen[.-]/i);
    expect(html).toContain(MAIL_TO);
    expect(html).toContain(SITE.url);
  });

  it("mostra o telefone com o espaçamento único do SITE", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).toContain(SITE.phoneDisplay);
    expect(texto).toContain(SITE.phoneDisplay);
    // «+351 91 92 59 820» é o mesmo número com outro espaçamento — dois
    // espaçamentos espalhados pelo produto é o que se está a evitar.
    expect(html).not.toContain("91 92 59 820");
  });

  it("a versão em texto leva os mesmos contactos que o HTML", () => {
    const { texto } = assinaturaDeEmail();
    expect(texto).toContain(MAIL_TO);
    expect(texto).toContain(SITE.url);
    expect(texto).toContain(SITE.name);
  });

  it("leva o logótipo por cid: e nenhuma imagem remota", () => {
    const { html, anexos } = assinaturaDeEmail();
    expect(html).toContain(`cid:${EMAIL_LOGO_CID}`);
    expect(anexos.some((a) => a.cid === EMAIL_LOGO_CID)).toBe(true);
    // Nenhum <img> pode apontar para http(s): o Gmail/Outlook bloqueiam-nas de
    // um remetente desconhecido e o ficheiro só existe depois do deploy.
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("dá um Buffer novo a cada chamada — o nodemailer consome o anterior", () => {
    const a = assinaturaDeEmail().anexos[0];
    const b = assinaturaDeEmail().anexos[0];
    expect(a.content).not.toBe(b.content);
    expect(Buffer.from(a.content).equals(Buffer.from(b.content))).toBe(true);
  });

  it("mostra as redes configuradas e cala o LinkedIn enquanto não tiver endereço", () => {
    const { html } = assinaturaDeEmail();
    expect(html).toContain(SITE.instagram);
    expect(html).toContain(SITE.facebook);
    expect(SITE.linkedin).toBe("");
    expect(html).not.toContain("LinkedIn");
  });

  /**
   * O banner era um rectângulo verde de 560×140 no fim de cada email, com o
   * logótipo repetido — o mesmo que já está no topo da assinatura. Foi-se, e
   * com ele o mecanismo que o trazia de volta a quem largasse um ficheiro em
   * `public/email/`. Uma imagem por email, e é a do logótipo.
   */
  it("fecha na assinatura: uma só imagem, e nenhum banner", () => {
    const { html, anexos } = assinaturaDeEmail();
    expect(anexos).toHaveLength(1);
    expect(anexos[0].cid).toBe(EMAIL_LOGO_CID);
    expect(html).not.toContain("banner");
    expect(html.match(/<img/g) ?? []).toHaveLength(1);
  });
});

describe("emailAoCliente", () => {
  it("junta a assinatura ao corpo, nas duas versões, e devolve os anexos", () => {
    const { html, text, attachments } = emailAoCliente({
      html: "<p>Segue a proposta.</p>",
      texto: "Segue a proposta.",
    });
    expect(html).toContain("<p>Segue a proposta.</p>");
    expect(html).toContain(ASSINATURA_NOME);
    expect(text).toContain("Segue a proposta.");
    expect(text).toContain(SITE.phoneDisplay);
    expect(attachments.some((a) => a.cid === EMAIL_LOGO_CID)).toBe(true);
  });

  /**
   * HTML de email é hostil: o Outlook não percebe metade do CSS moderno. Nada
   * daqui pode depender de flexbox/grid nem de uma folha de estilo no
   * cabeçalho — que o Gmail deita fora de qualquer forma.
   */
  it("não usa flexbox, grid nem <style> no cabeçalho", () => {
    const { html } = emailAoCliente({ html: "<p>Olá.</p>", texto: "Olá." });
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("display:grid");
    expect(html).not.toContain("<style");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM ASSINA É QUEM ENVIOU — E NUNCA, NUNCA, QUEM RECEBE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O nome era fixo: saísse o email de quem saísse, assinava a Catarina. Com mais
 * do que uma conta no back office (`admin-auth`), isso deixou de ser verdade —
 * quem escreve ao casal assina o que escreveu.
 *
 * E a protecção, que é a razão pela qual isto se mexeu: chegou a sair um email
 * com DUAS assinaturas contraditórias, uma delas com o nome da própria pessoa
 * que o recebeu. A causa estava no corpo (um `{nome}` no rodapé de um modelo
 * guardado no back office, ver `email-modelos.ts`) e não aqui — mas a regra
 * vale na mesma, e vale para sempre: nenhum email pode sair assinado com o nome
 * de quem o vai ler.
 */
describe("quem assina", () => {
  beforeEach(() => {
    vi.mocked(log.warn).mockClear();
  });

  it("assina com o nome de quem tem a sessão iniciada", () => {
    const { html, texto } = assinaturaDeEmail({ nome: "Rui Belo" });
    expect(html).toContain("Rui Belo");
    expect(texto).toContain("Rui Belo");
    expect(html).not.toContain(ASSINATURA_NOME);
  });

  it("sem sessão (o formulário público) assina a casa, com o cargo", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).toContain(ASSINATURA_NOME);
    expect(html).toContain(ASSINATURA_CARGO);
    expect(texto).toContain(ASSINATURA_CARGO);
  });

  /** «Manager» é o cargo DELA. Debaixo de outro nome era uma promoção
   *  inventada pelo software — melhor nenhum cargo do que um cargo falso. */
  it("o cargo da casa não acompanha um nome que não é o da casa", () => {
    const { html, texto } = assinaturaDeEmail({ nome: "Rui Belo" });
    expect(html).not.toContain(ASSINATURA_CARGO);
    expect(texto).not.toContain(ASSINATURA_CARGO);
  });

  /** A conta dela pode chamar-se só «Catarina». Continua a ser ela. */
  it("o cargo acompanha o primeiro nome da conta da casa", () => {
    expect(assinanteDoEmail({ nome: "Catarina" }).cargo).toBe(ASSINATURA_CARGO);
    expect(assinanteDoEmail({ nome: "catarina gaspar" }).cargo).toBe(ASSINATURA_CARGO);
  });

  it("nunca assina com o nome de quem recebe — cai para o da casa e regista", () => {
    const { nome, cargo } = assinanteDoEmail({
      nome: "Mónica Teófilo",
      destinatario: "Mónica Teófilo",
    });
    expect(nome).toBe(ASSINATURA_NOME);
    expect(cargo).toBe(ASSINATURA_CARGO);
    expect(vi.mocked(log.warn)).toHaveBeenCalledTimes(1);
  });

  /** Acentos, maiúsculas e espaços a mais não podem ser a porta do lado. */
  it("a protecção não se desfaz com acentos, maiúsculas nem espaços", () => {
    expect(
      assinanteDoEmail({ nome: "  MÓNICA   teofilo ", destinatario: "Monica Teófilo" }).nome,
    ).toBe(ASSINATURA_NOME);
  });

  /** Nomes diferentes não podem accionar a protecção — senão ninguém assina. */
  it("deixa passar um nome que só se parece com o do destinatário", () => {
    expect(assinanteDoEmail({ nome: "Mónica Teófilo", destinatario: "Mónica Teixeira" }).nome).toBe(
      "Mónica Teófilo",
    );
    expect(vi.mocked(log.warn)).not.toHaveBeenCalled();
  });

  /** O registo não pode levar os nomes: vai para o webhook de alertas. */
  it("regista a ocorrência sem escrever lá os nomes", () => {
    assinanteDoEmail({ nome: "Mónica Teófilo", destinatario: "Mónica Teófilo" });
    const [mensagem, contexto] = vi.mocked(log.warn).mock.calls[0];
    expect(JSON.stringify([mensagem, contexto])).not.toMatch(/Mónica|Teófilo/i);
  });

  it("o emailAoCliente leva a assinatura de quem envia até ao fim", () => {
    const { html, text } = emailAoCliente({
      html: "<p>Segue.</p>",
      texto: "Segue.",
      quem: { nome: "Rui Belo", destinatario: "Mónica Teófilo" },
    });
    expect(html).toContain("Rui Belo");
    expect(text).toContain("Rui Belo");
  });
});
