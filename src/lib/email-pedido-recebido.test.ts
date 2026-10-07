import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emailPedidoRecebido, type DadosDoPedidoRecebido } from "./email-pedido-recebido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE SAI É O DESENHO DELA — BYTE A BYTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Regra dela: «não alterar textos, cores, tamanhos nem espaçamentos do HTML
 * novo». A única prova disso que não depende de olhar é esta: com os valores
 * de exemplo do próprio ficheiro, o HTML que o código monta tem de ser IGUAL
 * ao `docs/email-pedido-recebido-apple.html`, trocados só os marcadores que o
 * ficheiro manda trocar (`LOGO_URL`, `BANNER_URL`, `ICON_*_URL`, `*_URL`).
 *
 * Se alguém mexer num espaçamento, numa cor ou numa palavra — no ficheiro ou
 * no código —, isto deixa de ser igual e diz onde.
 */

const ORIGINAL = readFileSync(join(process.cwd(), "docs/email-pedido-recebido-apple.html"), "utf8");

/** O comentário «A TROCAR antes de usar…» é para quem integra: não segue no email. */
function semComentarioDeAutoria(html: string): string {
  const i = html.indexOf("<!--\n  LÍQUEN EVENTS · Email");
  const j = html.indexOf("-->\n", i) + "-->\n".length;
  return html.slice(0, i) + html.slice(j);
}

const REDES = {
  facebook: "https://www.facebook.com/liquen.events",
  instagram: "https://www.instagram.com/liquen.events",
  linkedin: "https://pt.linkedin.com/company/l%C3%ADquen-events",
};

/** Os valores de exemplo DO FICHEIRO, ligados às variáveis reais. */
const EXEMPLO: DadosDoPedidoRecebido = {
  locale: "pt",
  nome: "Ana",
  pedido: {
    evento: "Conferência",
    data: "2026-11-06",
    convidados: 50,
    local: "Évora",
    espaco: "Interior",
  },
  casa: {
    nome: "Catarina Gaspar",
    cargo: "Manager",
    telefone: "+351919259820",
    telefoneVisivel: "+351 919 259 820",
    email: "liquen.alentejo@gmail.com",
    site: "https://liquen-events.com",
  },
  imagens: {
    logo: "cid:liquen-logo",
    banner: "cid:liquen-banner",
    redes: [
      { nome: "Facebook", url: REDES.facebook, cid: "liquen-social-facebook" },
      { nome: "Instagram", url: REDES.instagram, cid: "liquen-social-instagram" },
      { nome: "LinkedIn", url: REDES.linkedin, cid: "liquen-social-linkedin" },
    ],
  },
};

/** O ficheiro dela com os marcadores trocados — e mais nada. */
const ESPERADO = semComentarioDeAutoria(ORIGINAL)
  .replace('src="LOGO_URL"', 'src="cid:liquen-logo"')
  .replace('src="BANNER_URL"', 'src="cid:liquen-banner"')
  // Os ícones antes das ligações: `ICON_FACEBOOK_URL` contém `FACEBOOK_URL`.
  .replace('src="ICON_FACEBOOK_URL"', 'src="cid:liquen-social-facebook"')
  .replace('src="ICON_INSTAGRAM_URL"', 'src="cid:liquen-social-instagram"')
  .replace('src="ICON_LINKEDIN_URL"', 'src="cid:liquen-social-linkedin"')
  .replace('href="FACEBOOK_URL"', `href="${REDES.facebook}"`)
  .replace('href="INSTAGRAM_URL"', `href="${REDES.instagram}"`)
  .replace('href="LINKEDIN_URL"', `href="${REDES.linkedin}"`);

/** Onde duas cadeias começam a divergir, para o vermelho dizer ONDE. */
function primeiraDiferenca(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return "iguais";
  const linha = a.slice(0, i).split("\n").length;
  return `linha ${linha}:\n  esperado: ${JSON.stringify(a.slice(i - 40, i + 60))}\n  saiu:     ${JSON.stringify(b.slice(i - 40, i + 60))}`;
}

describe("o email «Pedido recebido» é o desenho dela", () => {
  it("com os valores de exemplo, o HTML é igual ao ficheiro dela", () => {
    const { html } = emailPedidoRecebido(EXEMPLO);
    expect(html === ESPERADO, primeiraDiferenca(ESPERADO, html)).toBe(true);
  });

  it("e nenhum marcador do ficheiro fica por trocar", () => {
    const { html } = emailPedidoRecebido(EXEMPLO);
    for (const m of [
      "LOGO_URL",
      "BANNER_URL",
      "ICON_",
      "FACEBOOK_URL",
      "INSTAGRAM_URL",
      "LINKEDIN_URL",
    ]) {
      expect(html, `ficou «${m}» no email`).not.toContain(m);
    }
  });

  /**
   * O CONTROLO NEGATIVO: a comparação apanha uma mudança de um píxel. Sem
   * isto, um `ESPERADO` montado a partir da própria saída passava sempre.
   */
  it("e a comparação apanha um espaçamento mexido", () => {
    const { html } = emailPedidoRecebido(EXEMPLO);
    const mexido = html.replace("padding:56px 56px 0;", "padding:55px 56px 0;");
    expect(mexido).not.toBe(ESPERADO);
    expect(ESPERADO).toContain("padding:56px 56px 0;");
  });
});

describe("as regras dela", () => {
  it("o assunto é «Recebemos o seu pedido.», com o ponto", () => {
    expect(emailPedidoRecebido(EXEMPLO).subject).toBe("Recebemos o seu pedido.");
  });

  it("a data por definir diz «Ainda a definir»", () => {
    const { html, text } = emailPedidoRecebido({
      ...EXEMPLO,
      pedido: { ...EXEMPLO.pedido, data: "" },
    });
    expect(html).toContain(">Ainda a definir</td>");
    expect(text).toContain("Data: Ainda a definir");
  });

  it("sem número, os convidados dizem a estimativa que ela escolheu", () => {
    const { html, text } = emailPedidoRecebido({
      ...EXEMPLO,
      pedido: { ...EXEMPLO.pedido, convidados: undefined, convidadosEstimativa: "50 a 100" },
    });
    expect(html).toContain(">50 a 100</td>");
    expect(html).not.toContain("Cerca de");
    expect(text).toContain("Convidados: 50 a 100");
  });

  it("com número, «Cerca de 50»", () => {
    expect(emailPedidoRecebido(EXEMPLO).html).toContain(">Cerca de 50</td>");
  });

  it("sem nome, começa em «O seu pedido já está connosco.»", () => {
    const { html, text } = emailPedidoRecebido({ ...EXEMPLO, nome: "" });
    expect(html).toContain('color:#1d1d1f;">O seu pedido já está connosco.</p>');
    expect(html).not.toContain("Olá");
    expect(text).not.toContain("Olá");
  });

  it("o WhatsApp abre sem mensagem escrita", () => {
    const { html } = emailPedidoRecebido(EXEMPLO);
    const ligacoes = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((m) => m[1]);
    expect(ligacoes.length).toBe(3);
    for (const l of ligacoes) expect(l).toBe("https://wa.me/351919259820");
  });

  it("escreve o que o cliente escreveu, sem o deixar entrar no HTML", () => {
    const { html } = emailPedidoRecebido({
      ...EXEMPLO,
      nome: '<img src=x onerror="alert(1)">',
      pedido: { ...EXEMPLO.pedido, local: "<b>Évora</b>", evento: 'Festa "da" Ana' },
    });
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<b>Évora</b>");
    expect(html).toContain("&lt;b&gt;Évora&lt;/b&gt;");
  });

  it("uma linha que chegue vazia sai, e o filete de baixo passa para a última que fica", () => {
    const { html } = emailPedidoRecebido({
      ...EXEMPLO,
      pedido: { ...EXEMPLO.pedido, espaco: "" },
    });
    expect(html).not.toContain(">Espaço</td>");
    // «Local» passa a ser a última: sem filete por baixo.
    expect(html).toContain(
      '<td class="t2" style="padding:14px 12px 14px 0;color:#6e6e73;">Local</td>',
    );
  });

  it("sem banner nem redes, os blocos saem inteiros — não fica uma imagem partida", () => {
    const { html } = emailPedidoRecebido({
      ...EXEMPLO,
      imagens: { ...EXEMPLO.imagens, banner: null, redes: [] },
    });
    expect(html).not.toContain("liquen-banner");
    expect(html).not.toContain("liquen-social-");
    expect(html).not.toContain("<!-- 10. MANTIDO: banner Líquen -->");
  });
});

describe("e em inglês, com o mesmo desenho", () => {
  const EN: DadosDoPedidoRecebido = {
    ...EXEMPLO,
    locale: "en",
    pedido: { ...EXEMPLO.pedido, evento: "Conference", espaco: "Indoors" },
  };

  it("diz tudo em inglês", () => {
    const { subject, html, text } = emailPedidoRecebido(EN);
    expect(subject).toBe("We've received your request.");
    expect(html).toContain('<html lang="en"');
    expect(html).toContain("Hello Ana. Your request is already with us.");
    expect(html).toContain(">6 November 2026</td>");
    expect(html).toContain(">Around 50</td>");
    for (const pt of [
      "Recebemos",
      "Olá",
      "Convidados",
      "A seguir",
      "Com carinho",
      "Recebeu este email",
    ]) {
      expect(html, `ficou «${pt}» no email inglês`).not.toContain(pt);
      expect(text, `ficou «${pt}» no texto inglês`).not.toContain(pt);
    }
  });

  /**
   * O mesmo desenho: tirando o texto, o esqueleto do HTML inglês é o do
   * português — as mesmas etiquetas, classes, cores, tamanhos e espaçamentos.
   */
  it("e o esqueleto é o mesmo do português", () => {
    const esqueleto = (h: string) =>
      h.replace(/>[^<]*</g, "><").replace(/ (lang|alt)="[^"]*"/g, "");
    expect(esqueleto(emailPedidoRecebido(EN).html)).toBe(
      esqueleto(emailPedidoRecebido(EXEMPLO).html),
    );
  });
});
