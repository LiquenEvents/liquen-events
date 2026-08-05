import { describe, it, expect } from "vitest";
import { respostaPdf } from "./pdf-resposta";

/**
 * O contrato HTTP de servir um PDF: tamanho, pedaços, e revalidação.
 *
 * Isto é código de protocolo — o valor está nos casos das pontas, não no
 * caminho feliz. Um `Content-Range` mal calculado por um byte dá um ficheiro
 * corrompido no leitor do cliente, e não há como dar por isso a olho.
 */

const corpo = (n: number) =>
  Buffer.from(Array.from({ length: n }, (_, i) => i % 256)) as Buffer<ArrayBuffer>;

const pedir = (headers: Record<string, string> = {}) => new Request("http://x/p.pdf", { headers });

const NOME = { nome: "Proposta-Liquen-LIQ-1.pdf" };

describe("respostaPdf — sem Range", () => {
  it("serve o ficheiro inteiro com Content-Length e anuncia que aceita pedaços", async () => {
    const bytes = corpo(1000);
    const res = respostaPdf(pedir(), bytes, NOME);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    // O número que faltava: sem ele a resposta ia em `chunked` e o leitor não
    // sabia onde estava o fim do ficheiro — que é onde está a tabela de
    // referências de um PDF não linearizado.
    expect(res.headers.get("Content-Length")).toBe("1000");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toMatch(/^"[A-Za-z0-9_-]+"$/);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
  });

  it("o ETag segue o CONTEÚDO, não o nome do ficheiro", () => {
    const a = respostaPdf(pedir(), corpo(100), NOME).headers.get("ETag");
    const igual = respostaPdf(pedir(), corpo(100), { nome: "outro.pdf" }).headers.get("ETag");
    const diferente = respostaPdf(pedir(), corpo(101), NOME).headers.get("ETag");
    expect(igual).toBe(a);
    expect(diferente).not.toBe(a);
  });
});

describe("respostaPdf — pedaços", () => {
  it("bytes=0-99 devolve os primeiros 100 bytes, com o Content-Range certo", async () => {
    const bytes = corpo(1000);
    const res = respostaPdf(pedir({ range: "bytes=0-99" }), bytes, NOME);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-99/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    // Os limites são INCLUSIVOS dos dois lados. Um engano de um byte aqui
    // corrompe o ficheiro no leitor sem dar erro nenhum.
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes.subarray(0, 100));
  });

  it("bytes=-500 devolve a CAUDA — que é o primeiro pedido de um leitor de PDF", async () => {
    const bytes = corpo(1000);
    const res = respostaPdf(pedir({ range: "bytes=-500" }), bytes, NOME);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 500-999/1000");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes.subarray(500));
  });

  it("uma cauda maior do que o ficheiro dá o ficheiro inteiro, não um erro", async () => {
    const bytes = corpo(100);
    const res = respostaPdf(pedir({ range: "bytes=-9999" }), bytes, NOME);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-99/100");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
  });

  it("bytes=500- vai daí até ao fim", async () => {
    const bytes = corpo(1000);
    const res = respostaPdf(pedir({ range: "bytes=500-" }), bytes, NOME);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 500-999/1000");
  });

  it("um fim para lá do ficheiro fica preso ao último byte", async () => {
    const res = respostaPdf(pedir({ range: "bytes=900-99999" }), corpo(1000), NOME);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 900-999/1000");
  });

  it("um início para lá do fim é 416, e diz o tamanho verdadeiro", async () => {
    // Não é um 200 silencioso: o cliente pediu uma coisa concreta que não
    // existe, e tem de ficar a saber — com o tamanho para se corrigir.
    const res = respostaPdf(pedir({ range: "bytes=5000-6000" }), corpo(1000), NOME);
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("vários intervalos respondem 200 com o ficheiro inteiro — resposta legal", async () => {
    // `multipart/byteranges` é o caminho complicado e nenhum leitor de PDF
    // precisa dele. 200 é uma resposta válida a um pedido parcial.
    const bytes = corpo(1000);
    const res = respostaPdf(pedir({ range: "bytes=0-99,200-299" }), bytes, NOME);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("1000");
  });

  it("uma unidade que não é bytes ignora-se", () => {
    const res = respostaPdf(pedir({ range: "paginas=1-2" }), corpo(1000), NOME);
    expect(res.status).toBe(200);
  });

  it.each(["bytes=", "bytes=-", "bytes=abc-def", "bytes=100-50", "lixo"])(
    "um Range que não se percebe (%s) dá o ficheiro inteiro em vez de rebentar",
    (mau) => {
      const res = respostaPdf(pedir({ range: mau }), corpo(1000), NOME);
      expect(res.status).toBe(200);
    },
  );
});

describe("respostaPdf — revalidação", () => {
  it("If-None-Match com o ETag actual fecha-se com 304 vazio", async () => {
    const bytes = corpo(1000);
    const etag = respostaPdf(pedir(), bytes, NOME).headers.get("ETag")!;
    const res = respostaPdf(pedir({ "if-none-match": etag }), bytes, NOME);
    expect(res.status).toBe(304);
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("If-None-Match com um ETag velho volta a servir o ficheiro", () => {
    const res = respostaPdf(pedir({ "if-none-match": '"de-outra-versao"' }), corpo(1000), NOME);
    expect(res.status).toBe(200);
  });

  it('If-None-Match: * conta como "tenho alguma"', () => {
    expect(respostaPdf(pedir({ "if-none-match": "*" }), corpo(10), NOME).status).toBe(304);
  });

  it("aceita a forma fraca (W/) e a lista separada por vírgulas", () => {
    const etag = respostaPdf(pedir(), corpo(10), NOME).headers.get("ETag")!;
    const res = respostaPdf(pedir({ "if-none-match": `"outro", W/${etag}` }), corpo(10), NOME);
    expect(res.status).toBe(304);
  });

  it("If-Range que NÃO bate certo manda o ficheiro inteiro, não o pedaço", async () => {
    // O ponto todo do `If-Range`: o cliente tem meia versão antiga em mãos.
    // Costurar-lhe um pedaço da versão nova dava um ficheiro corrompido — sem
    // erro nenhum, e só se notava ao tentar abrir.
    const bytes = corpo(1000);
    const res = respostaPdf(
      pedir({ range: "bytes=0-99", "if-range": '"versao-antiga"' }),
      bytes,
      NOME,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("1000");
  });

  it("If-Range que bate certo continua a dar o pedaço", () => {
    const bytes = corpo(1000);
    const etag = respostaPdf(pedir(), bytes, NOME).headers.get("ETag")!;
    const res = respostaPdf(pedir({ range: "bytes=0-99", "if-range": etag }), bytes, NOME);
    expect(res.status).toBe(206);
  });
});
