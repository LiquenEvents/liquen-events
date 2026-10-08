import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ESTILO_DO_EMAIL,
  htmlDoPedidoParaAEquipa,
  type DadosDoPedidoParaAEquipa,
} from "./email-pedido-equipa";

/**
 * O email que a equipa recebe passou ao desenho do email ao cliente, a pedido
 * dela («coloca também com a mesma estrutura e design»). Estes casos guardam
 * as duas metades disso: que o desenho é MESMO o mesmo, e que nada do que a
 * equipa lia antes se perdeu pelo caminho.
 */

const DESENHO_DELA = readFileSync(
  join(process.cwd(), "docs/email-pedido-recebido-apple.html"),
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

describe("o email da equipa tem o desenho do email ao cliente", () => {
  it("a folha de estilo é a mesma, à letra", () => {
    const doDesenho = /<style>\n {2}body[\s\S]*?<\/style>/.exec(DESENHO_DELA)?.[0];
    expect(doDesenho, "não encontrei a folha de estilo no ficheiro dela").toBeTruthy();
    expect(ESTILO_DO_EMAIL).toBe(doDesenho);
    expect(htmlDoPedidoParaAEquipa(PEDIDO)).toContain(doDesenho!);
  });

  it("o mesmo cartão, o mesmo título e a mesma cápsula", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    for (const peca of [
      'class="card sf" style="max-width:640px;background:#ffffff;border-radius:18px;',
      'class="h1 t1" style="margin:0;font-size:40px;line-height:44px;font-weight:600;letter-spacing:-0.3px;color:#1d1d1f;"',
      'class="btn" style="display:inline-block;background:#4d6650;color:#ffffff;text-decoration:none;font-size:17px;line-height:20px;font-weight:400;padding:13px 24px;border-radius:980px;"',
      'class="box" style="background:#f5f5f7;border-radius:18px;"',
    ]) {
      expect(DESENHO_DELA, "a peça já não está no desenho dela").toContain(peca);
      expect(html, `o email da equipa perdeu: ${peca.slice(0, 50)}…`).toContain(peca);
    }
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
      "Ref. LIQ-AE3E61-2D3846A4AC81D8A6 · 06/10/2026, 16:58:03",
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

  it("a última linha de cada cartão não leva filete por baixo", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    expect(html).toContain(
      '<td class="t2" style="padding:14px 12px 14px 0;color:#6e6e73;">Espaço</td>',
    );
    expect(html).toContain(
      '<td class="t2 line" style="padding:14px 12px 14px 0;border-bottom:1px solid #d2d2d7;color:#6e6e73;">Convidados</td>',
    );
  });

  it("sem notas, não há caixa das notas", () => {
    expect(htmlDoPedidoParaAEquipa({ ...PEDIDO, notas: "  " })).not.toContain("Notas do cliente");
  });
});

describe("os botões, nos três casos", () => {
  it("com telefone e email: a cápsula do WhatsApp e a ligação do email", () => {
    const html = htmlDoPedidoParaAEquipa(PEDIDO);
    expect(html).toContain(">Enviar WhatsApp</a>");
    expect(html).toContain(">Responder por email&nbsp;›</a>");
  });

  it("só com telefone: só a cápsula", () => {
    const html = htmlDoPedidoParaAEquipa({ ...PEDIDO, mailto: "" });
    expect(html).toContain(">Enviar WhatsApp</a>");
    expect(html).not.toContain("Responder por email");
  });

  it("só com email: a cápsula é o email", () => {
    const html = htmlDoPedidoParaAEquipa({ ...PEDIDO, whatsapp: "" });
    expect(html).toContain(">Responder ao cliente</a>");
    expect(html).not.toContain("wa.me");
  });

  it("nenhum botão com href vazio", () => {
    for (const d of [PEDIDO, { ...PEDIDO, mailto: "" }, { ...PEDIDO, whatsapp: "" }]) {
      expect(htmlDoPedidoParaAEquipa(d)).not.toMatch(/href=""/);
    }
  });
});
