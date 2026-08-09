import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  ficheiroIncompleto,
  pareceHeic,
  motivoDaRecusa,
  garantirFormatoImprimivel,
} from "./proposal-image";
import { recusaDeImagem, nomeOuTipoDeHeic, CONSELHO_HEIC } from "./recusa-de-imagem";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS QUE NÃO SERVEM, E O QUE SE DIZ SOBRE ELAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas avarias que os agentes encontraram a medir o caminho das imagens, e que
 * têm a mesma forma: a porta de entrada deixava passar (ou recusava) sem dizer
 * nada de útil, e o preço pagava-se muito mais tarde.
 *
 *   · uma foto cujo carregamento se interrompeu a meio é uma imagem VÁLIDA
 *     para o descodificador — tem cabeçalho, tem dimensões — e é desenhada até
 *     onde os dados chegam, com o resto CINZENTO. Era guardada e contava como
 *     boa;
 *
 *   · um HEIC do iPhone era recusado com a mesma frase de tudo o resto («não
 *     foi possível processar a imagem»), que não diz o que aconteceu nem o que
 *     fazer — e a pessoa tenta a mesma foto outra vez.
 */

async function jpeg(w = 200, h = 200): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#6e7" } })
    .jpeg()
    .toBuffer();
}
async function png(): Promise<Buffer> {
  return sharp({ create: { width: 60, height: 60, channels: 3, background: "#333" } })
    .png()
    .toBuffer();
}
async function webp(): Promise<Buffer> {
  return sharp({ create: { width: 60, height: 60, channels: 3, background: "#333" } })
    .webp()
    .toBuffer();
}

describe("um ficheiro que chegou a meio é apanhado à porta", () => {
  it("um JPEG inteiro passa", async () => {
    expect(ficheiroIncompleto(await jpeg(), "image/jpeg")).toBe(false);
  });

  it("um JPEG cortado a 40% é recusado", async () => {
    const inteiro = await jpeg(800, 800);
    const cortado = inteiro.subarray(0, Math.floor(inteiro.length * 0.4));
    expect(ficheiroIncompleto(cortado, "image/jpeg")).toBe(true);
  });

  /**
   * A regra que protege as fotos BOAS: há máquinas e programas que deixam lixo,
   * miniaturas ou XMP depois do fim do JPEG. Procurar o marcador exactamente
   * nos últimos dois bytes recusaria essas fotos — que é o erro que não se pode
   * cometer, porque é dizer a alguém que a fotografia está partida quando não
   * está.
   */
  it("um JPEG com lixo depois do fim continua a passar", async () => {
    const comCauda = Buffer.concat([await jpeg(), Buffer.alloc(600, 0x20)]);
    expect(ficheiroIncompleto(comCauda, "image/jpeg")).toBe(false);
  });

  it("um PNG inteiro passa e um cortado é recusado", async () => {
    const inteiro = await png();
    expect(ficheiroIncompleto(inteiro, "image/png")).toBe(false);
    expect(ficheiroIncompleto(inteiro.subarray(0, inteiro.length - 20), "image/png")).toBe(true);
  });

  it("um WebP é medido pelo tamanho que ele próprio declara", async () => {
    const inteiro = await webp();
    expect(ficheiroIncompleto(inteiro, "image/webp")).toBe(false);
    expect(ficheiroIncompleto(inteiro.subarray(0, inteiro.length - 30), "image/webp")).toBe(true);
  });

  it("de um formato que não sabemos ler ao fim não se inventa um diagnóstico", () => {
    expect(ficheiroIncompleto(Buffer.from("qualquer coisa"), "application/octet-stream")).toBe(
      false,
    );
  });

  /**
   * O que muda de facto: um ficheiro incompleto deixa de ser GUARDADO. Era
   * legível, portanto passava; e só se via meses depois, cinzento, na proposta
   * de alguém.
   */
  it("não é guardado, mesmo sendo um JPEG legível", async () => {
    const inteiro = await jpeg(800, 800);
    const cortado = inteiro.subarray(0, Math.floor(inteiro.length * 0.4));
    expect(await garantirFormatoImprimivel(cortado, "image/jpeg")).toBeNull();
    // …e o inteiro continua a passar intacto, sem reconversão nenhuma.
    const bom = await garantirFormatoImprimivel(inteiro, "image/jpeg");
    expect(bom?.contentType).toBe("image/jpeg");
    expect(bom?.bytes.byteLength).toBe(inteiro.byteLength);
  });
});

describe("o HEIC do iPhone é reconhecido pelo que é", () => {
  /** Um cabeçalho `ftyp` com a marca pedida — é isto que distingue os dois. */
  const comMarca = (marca: string) =>
    Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftyp", "ascii"),
      Buffer.from(marca, "ascii"),
      Buffer.alloc(16),
    ]);

  it("as marcas da família HEVC são HEIC", () => {
    for (const marca of ["heic", "heix", "mif1", "msf1"]) {
      expect(pareceHeic(comMarca(marca)), marca).toBe(true);
    }
  });

  /** O AVIF usa a MESMA caixa e o sharp lê-o. Confundi-los mandaria a pessoa
   *  converter uma foto que já funciona. */
  it("um AVIF não é confundido com um HEIC", () => {
    expect(pareceHeic(comMarca("avif"))).toBe(false);
    expect(pareceHeic(comMarca("avis"))).toBe(false);
  });

  it("um JPEG não é confundido com nada", async () => {
    expect(pareceHeic(await jpeg())).toBe(false);
  });

  it("é o motivo que a rota vai usar para escolher a frase", () => {
    expect(motivoDaRecusa(comMarca("heic"), "image/heic")).toBe("heic");
  });
});

describe("a frase que a pessoa lê", () => {
  /**
   * As três avarias davam a MESMA frase, que é verdadeira e não serve para
   * nada: não diz o que aconteceu nem o que fazer.
   */
  it("o HEIC explica o formato e diz onde se muda", () => {
    const frase = recusaDeImagem("heic", "IMG_4821.HEIC");
    expect(frase).toContain("IMG_4821.HEIC");
    expect(frase).toMatch(/HEIC/);
    expect(frase).toMatch(/Mais compat/i);
    expect(frase).toMatch(/JPEG/);
  });

  it("a incompleta manda tentar outra vez, e diz o que aconteceria se ficasse", () => {
    const frase = recusaDeImagem("incompleta", "capa.jpg");
    expect(frase).toContain("capa.jpg");
    expect(frase).toMatch(/incompleta/i);
    expect(frase).toMatch(/cinzenta/i);
  });

  it("a ilegível mantém a frase de sempre — aí estava certa", () => {
    expect(recusaDeImagem("ilegivel", "x.bin")).toBe("Não foi possível processar a imagem: x.bin.");
  });

  it("as três frases são diferentes umas das outras", () => {
    const frases = (["heic", "incompleta", "ilegivel"] as const).map((m) => recusaDeImagem(m, "f"));
    expect(new Set(frases).size).toBe(3);
  });
});

describe("o HEIC apanhado no navegador, antes de haver pedido nenhum", () => {
  /**
   * O caso mais provável: um HEIC arrastado do telemóvel para o computador e
   * carregado no Chrome, que não sabe descodificá-lo. A pessoa encontra o
   * problema AQUI — não chega a haver pedido ao servidor — e é por isso que a
   * explicação tem de viver num sítio que os dois lados leiam.
   */
  it("reconhece-se pela extensão ou pelo tipo declarado", () => {
    expect(nomeOuTipoDeHeic("IMG_4821.HEIC", "")).toBe(true);
    expect(nomeOuTipoDeHeic("foto.heif", "application/octet-stream")).toBe(true);
    expect(nomeOuTipoDeHeic("sem-extensao", "image/heic")).toBe(true);
    expect(nomeOuTipoDeHeic("foto.jpg", "image/jpeg")).toBe(false);
    // Um nome que só CONTÉM "heic" não é um HEIC.
    expect(nomeOuTipoDeHeic("heic-e-outros-formatos.pdf", "application/pdf")).toBe(false);
  });

  it("os dois lados dizem a MESMA coisa", () => {
    // Se um dia divergirem, é sinal de que alguém escreveu a instrução duas
    // vezes — que é exactamente o que este módulo existe para impedir.
    expect(recusaDeImagem("heic", "IMG.HEIC")).toContain(CONSELHO_HEIC);
  });
});
