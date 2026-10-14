import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ESTILO_DO_EMAIL,
  htmlDoPedidoParaAEquipa,
  type DadosDoPedidoParaAEquipa,
} from "./email-pedido-equipa";
import { ESTILO_DA_CARTA } from "./email-pedido-recebido";

/**
 * O email que a equipa recebe tem a ESTRUTURA DA CARTA que vai ao cliente, a
 * pedido dela (14/10: «quero que coloques a estrutura do email que enviamos
 * para o cliente… no email que recebemos quando recebemos o pedido»). Estes
 * casos guardam as duas metades disso: que o desenho é MESMO o da carta, e que
 * nada do que a equipa lia antes se perdeu pelo caminho.
 */

const DESENHO_DELA = readFileSync(
  join(process.cwd(), "docs/email-pedido-recebido-carta.html"),
  "utf8",
);

/** O pedido da fotografia que ela mandou. */
const PEDIDO: DadosDoPedidoParaAEquipa = {
  logo: "cid:liquen-logo",
  nome: "Ana lobo",
  data: "sexta, 6 nov 2026",
  fimDeSemana: false,
  subtitulo: "Conferências & Congressos · Eventos Empresariais",
  preheader: "Ana lobo · sexta, 6 nov 2026 · 50 convidados · Évora",
  whatsapp: "https://wa.me/351919075659?text=Ol%C3%A1%20Ana",
  mailto: "mailto:analobo@exemplo.pt?subject=L%C3%ADquen&body=Ol%C3%A1",
  lembrete: "Pedidos respondidos no próprio dia convertem muito mais.",
  primeiroNome: "Ana",
  pedido: [
    { rotulo: "Convidados", valor: "50" },
    { rotulo: "Local", valor: "Évora" },
    { rotulo: "Espaço", valor: "Interior" },
  ],
  contacto: [
    { rotulo: "Email", valor: "analobo@exemplo.pt", href: "mailto:analobo@exemplo.pt" },
    { rotulo: "Telefone", valor: "919075659", href: "tel:919075659" },
  ],
  notas: "O serviço desejado não seria tanto pela decoração mas pela parte do catering.",
  referencia: "LIQ-AE3E61-2D3846A4AC81D8A6",
  quando: "06/10/2026, 16:58:03",
};

describe("o email da equipa tem a estrutura da carta ao cliente", () => {
  it("a folha de estilo é a da carta, a mesma constante", () => {
    expect(ESTILO_DO_EMAIL).toBe(ESTILO_DA_CARTA);
    expect(htmlDoPedidoParaAEquipa(PEDIDO)).toContain(ESTILO_DA_CARTA);
  });

  it("a mesma página, o mesmo título e as mesmas linhas finas", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    for (const peca of [
      "max-width:600px;font-family:-apple-system",
      'class="h1 t1" style="margin:0;font-size:32px;line-height:36px;font-weight:600;letter-spacing:0.1px;color:#1d1d1f;"',
      'class="lbl t2 line" width="140" valign="top" style="width:140px;padding:12px 12px 12px 0;border-top:1px solid #d2d2d7;',
    ]) {
      expect(DESENHO_DELA, "a peça já não está no desenho dela").toContain(peca);
      expect(html, `o email da equipa perdeu: ${peca.slice(0, 50)}…`).toContain(peca);
    }
  });

  it("sem os cartões cinzentos nem a cápsula do desenho anterior", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    expect(html).not.toContain("#f5f5f7;border-radius:18px");
    expect(html).not.toContain("border-radius:980px");
  });
});

describe("e nada do que a equipa lia se perdeu", () => {
  it("quem, quando, o quê, o contacto, as notas e a referência", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    for (const v of [
      "Novo pedido de orçamento",
      ">Ana lobo</h1>",
      "sexta, 6 nov 2026",
      "Conferências &amp; Congressos · Eventos Empresariais",
      ">50</td>",
      ">Évora</td>",
      ">Interior</td>",
      ">analobo@exemplo.pt</a>",
      ">919075659</a>",
      "pela parte do catering",
      ">LIQ-AE3E61-2D3846A4AC81D8A6</td>",
      "Chegou a 06/10/2026, 16:58:03.",
      "Pedidos respondidos no próprio dia convertem muito mais.",
      "a resposta vai direta para Ana.",
    ]) {
      expect(html, `falta «${v}»`).toContain(v);
    }
  });

  it("um fim de semana diz-se ao lado da data", () => {
    const html = htmlDoPedidoParaAEquipa({
      ...PEDIDO,
      data: "sábado, 7 nov 2026",
      fimDeSemana: true,
    });
    expect(html).toContain("sábado, 7 nov 2026 · fim de semana");
  });

  it("o mailto é escapado UMA vez — duas partiam o assunto e o corpo", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    expect(html).toContain(
      'href="mailto:analobo@exemplo.pt?subject=L%C3%ADquen&amp;body=Ol%C3%A1"',
    );
    expect(html).not.toContain("&amp;amp;");
  });

  it("o que o cliente escreveu não entra no HTML", () => {
    const html = htmlDoPedidoParaAEquipa({
      ...PEDIDO,
      nome: "<script>x</script>",
      notas: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
  });

  it("todas as linhas têm o filete de cima, e só a última o de baixo", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    expect(html).toMatch(/border-top:1px solid #d2d2d7;color:#6e6e73;">Convidados<\/td>/);
    // A última é a referência, que quebra onde for preciso.
    expect(html).toMatch(
      /border-top:1px solid #d2d2d7;border-bottom:1px solid #d2d2d7;color:#6e6e73;">Referência<\/td>/,
    );
    expect((html.match(/border-bottom:1px solid #d2d2d7/g) ?? []).length).toBe(2);
  });

  it("sem notas, não há caixa das notas", () => {
    expect(htmlDoPedidoParaAEquipa({ ...PEDIDO, notas: "  " })).not.toContain("Notas do cliente");
  });
});

describe("responder ao cliente, nos três casos", () => {
  it("com telefone e email: as duas ligações", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    expect(html).toContain(">Enviar WhatsApp&nbsp;›</a>");
    expect(html).toContain(">Responder por email&nbsp;›</a>");
  });

  it("só com telefone: só o WhatsApp", () => {
    const html = htmlDoPedidoParaAEquipa({ ...PEDIDO, mailto: "" });
    expect(html).toContain(">Enviar WhatsApp&nbsp;›</a>");
    expect(html).not.toContain("Responder por email");
  });

  it("só com email: só o email", () => {
    const html = htmlDoPedidoParaAEquipa({ ...PEDIDO, whatsapp: "" });
    expect(html).toContain(">Responder por email&nbsp;›</a>");
    expect(html).not.toContain("wa.me");
  });

  it("nenhum botão com href vazio", () => {
    for (const d of [PEDIDO, { ...PEDIDO, mailto: "" }, { ...PEDIDO, whatsapp: "" }]) {
      expect(htmlDoPedidoParaAEquipa(d)).not.toMatch(/href=""/);
    }
  });
});

/**
 * 14/10: «Maria Silva» em grande num pedido da Luana e do Afonso. Quando quem
 * escreveu não é um dos noivos, vai o casal em grande, quem escreveu numa
 * linha por baixo, e o rodapé diz para que endereço vai a resposta (e não
 * «direta para Maria», que não se sabe se é dela).
 */
describe("quem pede e quem se casa", () => {
  const COM_CASAL: DadosDoPedidoParaAEquipa = {
    ...PEDIDO,
    nome: "Luana Silva & Afonso Duarte",
    feitoPor: "Maria Silva",
    primeiroNome: "Maria",
    respostaPara: "casal@exemplo.pt",
  };

  it("o casal vai em grande e quem escreveu numa linha por baixo", () => {
    const html = htmlDoPedidoParaAEquipa(COM_CASAL);
    expect(html).toMatch(/<h1[^>]*>Luana Silva &amp; Afonso Duarte<\/h1>/);
    expect(html).toContain("Pedido feito por Maria Silva");
  });

  it("o rodapé diz o endereço da resposta, e não o nome de quem escreveu", () => {
    const html = htmlDoPedidoParaAEquipa(COM_CASAL);
    expect(html).toContain("a resposta vai para casal@exemplo.pt");
    expect(html).not.toContain("direta para Maria");
  });

  it("sem ninguém a mais, fica como sempre", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    expect(html).not.toContain("Pedido feito por");
    expect(html).toContain("a resposta vai direta para Ana");
  });
});
