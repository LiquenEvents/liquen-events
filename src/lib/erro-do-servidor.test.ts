import { describe, expect, it } from "vitest";
import { z } from "zod";
import { erroDoServidorEmPortugues, porqueRecusou } from "./erro-do-servidor";
import { firstError, quoteUpdateSchema } from "./validation";

/**
 * A recusa que o servidor já sabia explicar e que o ecrã deitava fora.
 *
 * O teste mais importante deste ficheiro é o primeiro: a frase que se traduz é
 * a que a ROTA manda mesmo — vinda do esquema, pelo `firstError` —, e não uma
 * que alguém escreveu aqui a imitar o Zod. No dia em que a biblioteca mudar de
 * texto, é aqui que se dá por isso.
 */
describe("a queixa que o servidor manda mesmo", () => {
  it("«convidados negativos» chega em inglês e sai em português", () => {
    const r = quoteUpdateSchema.safeParse({ guests: -50 });
    expect(r.success).toBe(false);
    if (r.success) return;
    const doServidor = firstError(r.error);
    expect(doServidor).toBe("Too small: expected number to be >=0");
    expect(erroDoServidorEmPortugues(doServidor)).toBe("O número não pode ser inferior a 0.");
  });

  it("um número acima do tecto também", () => {
    const r = quoteUpdateSchema.safeParse({ guests: 1_000_000 });
    if (r.success) throw new Error("devia ter sido recusado");
    expect(erroDoServidorEmPortugues(firstError(r.error))).toMatch(/não pode ser superior a/);
  });

  it("um preço que não é número", () => {
    const r = z.object({ quotedPrice: z.number() }).safeParse({ quotedPrice: "mil" });
    if (r.success) throw new Error("devia ter sido recusado");
    expect(erroDoServidorEmPortugues(firstError(r.error))).toBe("O valor tem de ser um número.");
  });
});

describe("o que não é da biblioteca passa intacto", () => {
  it("as frases desta casa já estão na língua certa", () => {
    const nosso = "As definições da proposta ainda não têm tabela na base de dados.";
    expect(erroDoServidorEmPortugues(nosso)).toBe(nosso);
    expect(erroDoServidorEmPortugues("Não autorizado")).toBe("Não autorizado");
  });

  it("sem mensagem nenhuma não se inventa uma razão", () => {
    expect(erroDoServidorEmPortugues("")).toBeNull();
    expect(erroDoServidorEmPortugues(undefined)).toBeNull();
  });
});

describe("ler a recusa de uma resposta", () => {
  const resposta = (corpo: unknown) => ({ json: async () => corpo }) as unknown as Response;

  it("tira a razão do corpo e di-la em português", async () => {
    const r = resposta({ error: "Too small: expected number to be >=0" });
    expect(await porqueRecusou(r)).toBe("O número não pode ser inferior a 0.");
  });

  it("um corpo que não é JSON não vira razão nenhuma", async () => {
    const r = {
      json: async () => {
        throw new SyntaxError("<html>502</html>");
      },
    } as unknown as Response;
    expect(await porqueRecusou(r)).toBeNull();
  });
});
