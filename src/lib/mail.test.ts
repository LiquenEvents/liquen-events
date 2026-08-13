import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * `to ?? MAIL_TO` — A LINHA DE QUE SE TEM MEDO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Uma linha só, no meio do `sendMail`, decide se um email vai para o CLIENTE ou
 * para a caixa da CASA. Metade dos envios daqui são avisos internos que NÃO
 * trazem `to` (um pedido novo, um erro do cron) e contam com o fallback; a outra
 * metade são documentos do cliente, que contam com o contrário.
 *
 * Não havia um único teste sobre isto. Ficam aqui presos os dois lados — e o
 * canto afiado do meio: uma string VAZIA não é «sem destinatário» para o `??`,
 * cai na mesma para a caixa da casa. É por isso que quem envia ao cliente tem de
 * validar o endereço ANTES de chamar isto (ver a rota da fatura), e não confiar
 * que o `sendMail` recusa.
 */

const smtp = vi.hoisted(() => ({ enviados: [] as Record<string, unknown>[], criados: 0 }));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => {
      smtp.criados++;
      return {
        sendMail: async (opcoes: Record<string, unknown>) => {
          smtp.enviados.push(opcoes);
          return { messageId: "<teste@liquen>" };
        },
      };
    },
  },
}));

import { sendMail, MAIL_TO, esc } from "./mail";

const ultimo = () => smtp.enviados.at(-1)!;

beforeEach(() => {
  smtp.enviados = [];
  smtp.criados = 0;
  // SMTP configurado — senão o `sendMail` devolve `{ sent: false }` sem enviar.
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_USER", "casa@example.com");
  vi.stubEnv("SMTP_PASS", "segredo");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendMail — para onde vai o email", () => {
  it("com `to`, vai para o `to` (e só para lá)", async () => {
    const r = await sendMail({
      to: "ana@example.com",
      subject: "Recibo FT 2026/0012 — Líquen Events",
      html: "<p>olá</p>",
    });
    expect(r).toEqual({ sent: true });
    expect(ultimo().to).toBe("ana@example.com");
    expect(ultimo().to).not.toBe(MAIL_TO);
  });

  it("sem `to`, vai para a casa — é disto que os avisos internos vivem", async () => {
    await sendMail({ subject: "Novo pedido de orçamento", html: "<p>chegou um pedido</p>" });
    expect(ultimo().to).toBe(MAIL_TO);
  });

  it("`to: undefined` é o mesmo que não o passar — casa", async () => {
    await sendMail({ to: undefined, subject: "Aviso do cron", html: "<p>x</p>" });
    expect(ultimo().to).toBe(MAIL_TO);
  });

  /**
   * O canto afiado, e a razão de este ficheiro existir. Um pedido nascido de um
   * telefonema tem `email: ""`. O `??` só apanha `null`/`undefined`: a string
   * vazia NÃO cai para a casa nem é recusada aqui — desce inteira ao nodemailer,
   * que atira «No recipients defined» já depois de o emissor ter gasto o que
   * tinha para gastar (um número de fatura, por exemplo).
   *
   * Ou seja: `sendMail` não é uma guarda. Quem envia ao cliente valida o
   * endereço ANTES — ver a rota da fatura.
   */
  it('`to: ""` não é apanhado pelo `??` — desce vazio ao SMTP, não vai para a casa', async () => {
    await sendMail({ to: "", subject: "Documento", html: "<p>x</p>" });
    expect(ultimo().to).toBe("");
    expect(ultimo().to).not.toBe(MAIL_TO);
  });

  it("o resto do envelope passa intacto (assunto, texto, replyTo, anexos, cabeçalhos)", async () => {
    await sendMail({
      to: "ana@example.com",
      replyTo: MAIL_TO,
      subject: "Fatura FT 2026/0012 — Líquen Events",
      html: "<p>olá</p>",
      text: "olá",
      attachments: [{ filename: "Fatura-FT 2026-0012.pdf", content: Buffer.from("%PDF") }],
      headers: { "Auto-Submitted": "auto-generated" },
    });
    const env = ultimo();
    expect(env.subject).toBe("Fatura FT 2026/0012 — Líquen Events");
    expect(env.text).toBe("olá");
    expect(env.replyTo).toBe(MAIL_TO);
    expect(env.headers).toEqual({ "Auto-Submitted": "auto-generated" });
    const anexos = env.attachments as { filename: string; content: Buffer }[];
    expect(anexos[0].filename).toBe("Fatura-FT 2026-0012.pdf");
    expect(Buffer.isBuffer(anexos[0].content)).toBe(true);
    // O remetente é sempre a marca, nunca uma caixa nua.
    expect(String(env.from)).toContain("Líquen Events");
  });

  it("sem SMTP configurado não envia nada e diz que não enviou (em vez de rebentar)", async () => {
    vi.stubEnv("SMTP_HOST", "");
    const r = await sendMail({ to: "ana@example.com", subject: "x", html: "<p>x</p>" });
    expect(r).toEqual({ sent: false });
    expect(smtp.enviados).toHaveLength(0);
  });
});

describe("esc", () => {
  it("escapa o que vai parar ao HTML do email", () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(esc(null)).toBe("");
  });
});
