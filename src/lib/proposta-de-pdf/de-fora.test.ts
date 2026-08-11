import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { lerPropostaDePdf } from "./index";
import { documentoDeCampos } from "./tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM PDF QUE NÃO FOI FEITO POR NÓS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O teste de ida e volta mede o caso fácil: sabemos a composição dos nossos PDF
 * porque a escrevemos. O acervo verdadeiro dela não é esse — são anos de
 * propostas feitas em Word e no Canva, com rótulos e com uma folha que ninguém
 * aqui desenhou.
 *
 * Não temos nenhuma dessas em ficheiro. O que se pode fazer — e é o que se faz
 * aqui — é construir uma à mão, com o `pdf-lib`, a IMITAR uma folha de Word: A4
 * ao alto, Helvetica, rótulos com dois pontos e o valor à direita, uma lista
 * com travessões, um total com o valor encostado à direita da folha. Nada da
 * nossa composição: nem a página de «Apresentação», nem as legendas em
 * maiúsculas espaçadas, nem o número em corpo 22.
 *
 * ── O QUE ESTE TESTE FIXA ─────────────────────────────────────────────────
 *
 * Não fixa uma percentagem — fixa o COMPORTAMENTO, que é o que interessa:
 *
 *   · o que tem rótulo impresso é lido, e é lido com confiança MÉDIA, nunca
 *     alta, porque o sítio onde estava não se conhece;
 *   · o que NÃO tem rótulo (os serviços, as condições, as listas) não é lido, e
 *     é dito que não foi — nunca inventado a partir da forma do texto;
 *   · as fotografias saem na mesma, porque para as tirar não é preciso perceber
 *     a folha.
 *
 * Um campo errado com ar de certo é o único resultado inaceitável. Um campo
 * vazio é uma tarde de trabalho poupada a menos, e diz-se.
 */

async function folhaDeWord(opcoes: { comFoto?: boolean } = {}) {
  const pdf = await PDFDocument.create();
  // A4 ao alto e Helvetica — o oposto da nossa folha (A4 ao baixo, Carlito).
  const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const tinta = rgb(0.1, 0.1, 0.1);

  let y = 780;
  const linha = (
    texto: string,
    opcoesDaLinha: { x?: number; size?: number; font?: typeof reg; salto?: number } = {},
  ) => {
    page.drawText(texto, {
      x: opcoesDaLinha.x ?? 60,
      y,
      font: opcoesDaLinha.font ?? reg,
      size: opcoesDaLinha.size ?? 11,
      color: tinta,
    });
    y -= opcoesDaLinha.salto ?? 18;
  };
  /** Rótulo à esquerda, valor numa coluna a meio — como uma tabela de Word. */
  const par = (rotulo: string, valor: string) => {
    page.drawText(`${rotulo}:`, { x: 60, y, font: bold, size: 11, color: tinta });
    page.drawText(valor, { x: 200, y, font: reg, size: 11, color: tinta });
    y -= 18;
  };

  linha("PROPOSTA DE ORCAMENTO", { font: bold, size: 16, salto: 34 });
  par("Cliente", "Ana e Rui");
  par("Data", "18 de julho de 2026");
  par("Local", "Quinta do Sol");
  par("Convidados", "120 pax");
  par("Cerimónia", "Civil");
  y -= 20;
  linha("Servicos incluidos", { font: bold, size: 13, salto: 24 });
  linha("- Decoracao da cerimonia");
  linha("- Decoracao do copo de agua");
  linha("- Centros de mesa");
  y -= 24;
  // O total: rótulo à esquerda, valor encostado à direita da folha.
  page.drawText("Valor Total", { x: 60, y, font: bold, size: 12, color: tinta });
  const valor = "5.500,00 EUR + IVA";
  page.drawText(valor, {
    x: 535 - bold.widthOfTextAtSize(valor, 12),
    y,
    font: bold,
    size: 12,
    color: tinta,
  });

  if (opcoes.comFoto) {
    const jpeg = await sharp({
      create: { width: 1000, height: 700, channels: 3, background: { r: 200, g: 150, b: 120 } },
    })
      .jpeg()
      .toBuffer();
    const img = await pdf.embedJpg(jpeg);
    page.drawImage(img, { x: 60, y: 120, width: 300, height: 210 });
  }
  return await pdf.save();
}

describe("um PDF de fora — folha de Word imitada", () => {
  it("lê o que tem rótulo impresso, e só com confiança média", async () => {
    const r = await lerPropostaDePdf(await folhaDeWord());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lido = documentoDeCampos(r.rascunho.campos);

    console.log(
      [
        "\n── PDF de fora ──",
        ...r.rascunho.campos.map(
          (c) => `  ${c.confianca.padEnd(6)} ${c.campo.padEnd(18)} ${JSON.stringify(c.valor)}`,
        ),
        `  por ler: ${r.rascunho.porLer.map((p) => p.campo).join(", ")}`,
      ].join("\n"),
    );

    expect(lido.clientNames).toBe("Ana e Rui");
    expect(lido.eventDate).toBe("18 de julho de 2026");
    expect(lido.location).toBe("Quinta do Sol");
    expect(lido.guests).toBe("120 pax");
    expect(lido.ceremony).toBe("Civil");
    expect(lido.totalText).toBe("5.500,00 EUR + IVA");
    expect(lido.totalAmount).toBe(5500);
    expect(lido.totalVatMode).toBe("acrescer");

    // NADA disto pode vir com confiança alta: a folha não é a nossa e o motor
    // não sabe em que parte do documento está.
    expect(r.rascunho.campos.every((c) => c.confianca === "media")).toBe(true);
  }, 60_000);

  it("não inventa o que não tem rótulo — e diz que não leu", async () => {
    const r = await lerPropostaDePdf(await folhaDeWord());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lido = documentoDeCampos(r.rascunho.campos);

    // Os três serviços estão lá impressos, com travessões. Uma lista com
    // travessões é indistinguível de três parágrafos curtos sem um cabeçalho
    // que diga que é a lista dos serviços — e inventar três serviços numa
    // proposta é pior do que não trazer nenhum.
    expect(lido.serviceGroups).toBeUndefined();
    expect(lido.condicoesGerais).toBeUndefined();
    expect(lido.notasImportantes).toBeUndefined();
    expect(lido.budgetItems).toBeUndefined();

    // E cada um deles é DITO, com a razão.
    const porLer = new Map(r.rascunho.porLer.map((p) => [p.campo, p.porque]));
    for (const campo of ["serviceGroups", "budgetItems", "condicoesGerais", "notasImportantes"]) {
      expect(porLer.has(campo), `«${campo}» tinha de estar em porLer`).toBe(true);
      expect(porLer.get(campo)!.length).toBeGreaterThan(20);
    }
  }, 60_000);

  it("as fotografias saem, mesmo sem se perceber a folha", async () => {
    const r = await lerPropostaDePdf(await folhaDeWord({ comFoto: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rascunho.fotos).toHaveLength(1);
    const foto = r.rascunho.fotos[0];
    expect(foto.larguraPx).toBe(1000);
    expect(foto.origem.pagina).toBe(1);
    // Sem páginas de inspiração nem capa reconhecível, a foto não tem sítio —
    // e é melhor não ter sítio do que ter o errado.
    expect(foto.destino).toBeNull();
    // JPEG a sério, pronto para o caminho das fotos de proposta.
    expect(Buffer.from(foto.bytes, "base64").subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  }, 60_000);
});

describe("ficheiros que não são propostas", () => {
  it("um ficheiro vazio é recusado com uma frase que se pode mostrar", async () => {
    const r = await lerPropostaDePdf(new Uint8Array(0));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.porque).toMatch(/vazio/i);
  });

  it("um ficheiro que não é um PDF é recusado sem rebentar", async () => {
    const r = await lerPropostaDePdf(Buffer.from("isto é um texto qualquer, não é um PDF"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.porque.length).toBeGreaterThan(10);
  });

  it("um PDF sem uma única letra devolve as fotos e DIZ que não tem texto", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    page.drawImage(await pdf.embedJpg(jpeg), { x: 40, y: 300, width: 500, height: 375 });

    const r = await lerPropostaDePdf(await pdf.save());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rascunho.campos).toHaveLength(0);
    expect(r.rascunho.fotos).toHaveLength(1);
    expect(r.rascunho.avisos.some((a) => a.tipo === "pdf-sem-texto")).toBe(true);
  }, 60_000);

  it("um PDF acima do tecto de tamanho é recusado antes de ser aberto", async () => {
    const enorme = new Uint8Array(13 * 1024 * 1024);
    const r = await lerPropostaDePdf(enorme);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.porque).toMatch(/limite/i);
  });
});
