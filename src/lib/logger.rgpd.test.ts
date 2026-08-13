import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, redactString, redactValue, redactContext } from "./logger";

/**
 * Rede de segurança RGPD para os registos.
 *
 * Os registos da Vercel são conservados e consultáveis, e os de nível `error`
 * são ainda reencaminhados para terceiros (Sentry, webhook de Slack/Discord).
 * Estes testes falham se alguém voltar a deixar passar para os registos:
 *   · um email ou telefone de cliente (dado pessoal),
 *   · um token de /proposta/… ou /portal/… (credencial de acesso do cliente).
 *
 * São propositadamente escritos contra a fachada pública `log.*`, e não só
 * contra as funções auxiliares, para que a protecção continue a valer mesmo que
 * a implementação interna mude.
 */

/** Junta tudo o que um espião recebeu numa só string pesquisável. */
function text(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .flat()
    .map((a: unknown) =>
      a instanceof Error ? `${a.name}: ${a.message}\n${a.stack ?? ""}` : String(a),
    )
    .join("\n");
}

describe("redacção — dados pessoais", () => {
  it("redige endereços de email em qualquer posição de uma string", () => {
    const out = redactString("SMTP 550: recipient joana.silva+casamento@gmail.com rejected");
    expect(out).not.toContain("joana.silva+casamento@gmail.com");
    expect(out).not.toContain("@gmail.com");
    expect(out).toContain("SMTP 550");
  });

  it("redige telefones portugueses e internacionais", () => {
    expect(redactString("contacto 912345678")).not.toContain("912345678");
    expect(redactString("contacto 912 345 678")).not.toContain("912 345 678");
    expect(redactString("contacto +351 912 345 678")).not.toContain("912");
  });

  /**
   * O telefone no fim de uma frase.
   *
   * A guarda do lado direito do padrão português era `(?![\w.-])`, e o `.`
   * estava lá para não apanhar pedaços de números maiores (IPs, versões). Só
   * que um telefone escrito por uma pessoa acaba, quase sempre, num PONTO — é
   * o fim da frase. E do lado esquerdo a mesma guarda recusava o «tel.» que
   * toda a gente escreve antes do número. Nesses dois casos o telefone saía
   * INTEIRO para os registos da Vercel, para o Sentry e para o webhook do
   * Slack. O padrão internacional (`+351 …`) nunca teve o problema: a guarda
   * dele já era só `(?![\w])`.
   */
  it("redige o telefone mesmo colado à pontuação da frase", () => {
    expect(redactString("Contacto da noiva: 912345678.")).not.toContain("912345678");
    expect(redactString("tel.912345678")).not.toContain("912345678");
    expect(redactString("ligar para 912345678, depois das 18h")).not.toContain("912345678");
    expect(redactString("(912345678)")).not.toContain("912345678");
  });

  it("continua a não apanhar pedaços de números maiores", () => {
    // O que a guarda do `.` protegia: um endereço IP não é um telefone.
    expect(redactString("origem 255.255.255.0")).toBe("origem 255.255.255.0");
    expect(redactString("versão 2.10.345.678.9")).toBe("versão 2.10.345.678.9");
  });

  it("não estraga marcas temporais, identificadores internos nem números normais", () => {
    const ts = "2026-07-31T13:21:00.000Z";
    expect(redactString(ts)).toBe(ts);
    const id = "LIQ-M1A2B3-9F3C7A1B2D4E5F60";
    expect(redactString(id)).toBe(id);
    expect(redactString("duração 1234 ms, 42 linhas")).toBe("duração 1234 ms, 42 linhas");
  });
});

describe("redacção — tokens de capacidade nos caminhos", () => {
  it("redige o token de /proposta/<token> (aceitação de proposta, 14 dias)", () => {
    const out = redactString("/proposta/eyJ0eXAiOiJwcm9wb3NhbCJ9.AbCdEf-_123456789");
    expect(out).not.toContain("eyJ0eXAiOiJwcm9wb3NhbCJ9");
    expect(out).toContain("/proposta/");
  });

  it("redige o token de /portal/<token> (reserva completa do cliente, 365 dias)", () => {
    const out = redactString("https://liquen.pt/en/portal/AbCdEf123456._~-xyz?utm_source=email");
    expect(out).not.toContain("AbCdEf123456");
    expect(out).toContain("/portal/");
  });

  it("redige parâmetros de query sensíveis", () => {
    const out = redactString("/api/x?token=segredo123&page=2");
    expect(out).not.toContain("segredo123");
    expect(out).toContain("page=2");
  });
});

describe("redacção — contexto estruturado", () => {
  it("redige o valor de chaves inequivocamente sensíveis", () => {
    const out = redactContext({ email: "cliente@exemplo.pt", telefone: "912345678", token: "abc" });
    expect(JSON.stringify(out)).not.toContain("cliente@exemplo.pt");
    expect(JSON.stringify(out)).not.toContain("912345678");
    expect(JSON.stringify(out)).not.toContain("abc");
  });

  it("mantém as chaves ambíguas úteis ao diagnóstico quando o valor não é pessoal", () => {
    const out = redactContext({ to: "temas/2026/foto.jpg", id: "LIQ-1", mode: "copy" });
    expect(out).toEqual({ to: "temas/2026/foto.jpg", id: "LIQ-1", mode: "copy" });
  });

  it("desce por objectos e arrays aninhados", () => {
    const out = redactValue({ lead: { contactos: ["ana@exemplo.pt", "912345678"] } });
    const s = JSON.stringify(out);
    expect(s).not.toContain("ana@exemplo.pt");
    expect(s).not.toContain("912345678");
  });

  it("não rebenta nem entra em ciclo com estruturas profundas", () => {
    type Node = { next?: Node };
    const a: Node = {};
    a.next = a;
    expect(() => redactValue(a)).not.toThrow();
  });
});

describe("log.* — nada de dados pessoais chega à consola", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("não regista o email do cliente vindo do contexto", () => {
    log.info("orcamento: lead recebida", { id: "LIQ-1", email: "cliente@exemplo.pt" });
    expect(text(logSpy)).not.toContain("cliente@exemplo.pt");
  });

  it("não regista o email do cliente vindo da MENSAGEM de um erro do SMTP", () => {
    // O caso real: o nodemailer devolve o destinatário dentro da própria
    // mensagem, e a rota só passa `{ id }` como contexto — sem esta rede, o
    // email do cliente ia parar aos registos (e ao Sentry / webhook).
    const smtp = new Error("Can't send mail: 550 5.1.1 <cliente@exemplo.pt> user unknown");
    log.error("orcamento: email de confirmação ao cliente falhou", smtp, { id: "LIQ-1" });
    expect(text(errSpy)).not.toContain("cliente@exemplo.pt");
    expect(text(errSpy)).toContain("LIQ-1");
  });

  it("não regista o email vindo de uma violação de unicidade do Postgres", () => {
    const pg = new Error(
      'duplicate key value violates unique constraint "quotes_email_key"; Key (email)=(ana@exemplo.pt) already exists.',
    );
    log.error("orcamento: persistência falhou", pg, { id: "LIQ-2" });
    expect(text(errSpy)).not.toContain("ana@exemplo.pt");
  });

  it("não regista o token do portal vindo do caminho de um Web Vital", () => {
    log.info("web-vital", { metric: "LCP", path: "/portal/AbCdEf123456xyz789" });
    expect(text(logSpy)).not.toContain("AbCdEf123456xyz789");
  });

  it("não regista o token da proposta vindo do documentUri de um relatório CSP", () => {
    log.warn("CSP violation", {
      documentUri: "https://liquen.pt/proposta/tok3nS3cr3t0AbCdEf",
      violatedDirective: "script-src",
    });
    expect(text(errSpy)).not.toContain("tok3nS3cr3t0AbCdEf");
    expect(text(errSpy)).toContain("script-src");
  });
});

describe("log.error — nada de dados pessoais sai para terceiros", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env.ERROR_WEBHOOK_URL;
    delete process.env.SENTRY_DSN;
  });

  it("o webhook de alerta não leva o email do cliente", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("rgpd-webhook-case", new Error("550 <cliente@exemplo.pt> rejeitado"), {
      email: "cliente@exemplo.pt",
      telefone: "912345678",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
    expect(body).not.toContain("cliente@exemplo.pt");
    expect(body).not.toContain("912345678");
    expect(body).toContain("rgpd-webhook-case");
  });

  it("o envelope do Sentry não leva o email do cliente", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENTRY_DSN = "https://chave@sentry.example.com/42";
    log.error("rgpd-sentry-case", new Error("550 <cliente@exemplo.pt> rejeitado"), {
      email: "cliente@exemplo.pt",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
    expect(body).not.toContain("cliente@exemplo.pt");
    expect(body).toContain("rgpd-sentry-case");
  });
});
