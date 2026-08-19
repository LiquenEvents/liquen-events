import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM COMPONENTE DE BROWSER PODE PUXAR UM MÓDULO DE SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um ecrã com `"use client"` é empacotado para o telemóvel de quem o abre. Se,
 * pela cadeia de importações, ele chegar a um módulo marcado `server-only`, o
 * `next build` PARA — e para com uma mensagem que fala de um pacote que
 * ninguém escreveu à mão:
 *
 *     Module not found: Can't resolve 'nodemailer'
 *       ./src/lib/mail.ts → ./src/lib/email-corpo-escrito.ts
 *       → EmailDoEnvio.tsx → ProposalStudio.tsx → AdminClient.tsx
 *
 * Foi exactamente isso que aconteceu: o ecrã de envio queria UM NÚMERO — o
 * tecto de caracteres do corpo — e a constante vivia num ficheiro
 * `server-only` que importa o `nodemailer`. Um `import` de uma linha arrastou
 * ligações SMTP para dentro do pacote do browser.
 *
 * ── PORQUE É QUE ISTO É UM TESTE, E NÃO «TER CUIDADO» ─────────────────────
 *
 * A bateria não podia ter apanhado isto e não é defeito dela: o vitest corre
 * tudo no mesmo sítio e NÃO TEM a fronteira entre servidor e browser. Só o
 * `next build` a tem — ou seja, o erro só aparecia depois de o trabalho estar
 * feito, empurrado, e com a CI vermelha. Este teste traz essa fronteira para
 * onde ela custa segundos.
 */

const RAIZ = path.join(process.cwd(), "src");

function ficheiros(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === "node_modules" || nome === ".next") continue;
      ficheiros(p, acc);
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      acc.push(p);
    }
  }
  return acc;
}

const TODOS = ficheiros(RAIZ);
const conteudo = new Map(TODOS.map((f) => [f, readFileSync(f, "utf8")]));

/** `true` se o ficheiro se declara de browser. */
const ehDeCliente = (f: string) => /^\s*["']use client["']/m.test(conteudo.get(f) ?? "");
/** `true` se o ficheiro se declara de servidor. */
const ehDeServidor = (f: string) => /^import\s+["']server-only["']/m.test(conteudo.get(f) ?? "");

/** Resolve um `@/...` ou um `./...` para um ficheiro real, se existir. */
function resolver(deOnde: string, especificador: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = path.join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.resolve(path.dirname(deOnde), especificador);
  else return null; // pacote externo — não é connosco
  for (const sufixo of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const tentativa = base + sufixo;
    if (conteudo.has(tentativa)) return tentativa;
  }
  return null;
}

/**
 * As importações que CONTAM.
 *
 * `import type { X } from "…"` não conta, e a distinção não é um pormenor: um
 * tipo é apagado na compilação e nunca chega ao pacote do browser. Sem esta
 * distinção o teste acusava quatro ecrãs que estão certos — e um teste que
 * acusa quem está certo é um teste que se aprende a ignorar.
 */
const IMPORTACAO = /(?:^|\n)\s*import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/g;

function importados(f: string): string[] {
  const fora: string[] = [];
  for (const m of (conteudo.get(f) ?? "").matchAll(IMPORTACAO)) {
    const alvo = resolver(f, m[1]);
    if (alvo) fora.push(alvo);
  }
  return fora;
}

/** O caminho de importações até um módulo de servidor, ou `null` se não houver. */
function caminhoAteServidor(inicio: string): string[] | null {
  const vistos = new Set<string>([inicio]);
  const fila: string[][] = [[inicio]];
  while (fila.length) {
    const caminho = fila.shift()!;
    for (const seguinte of importados(caminho[caminho.length - 1])) {
      if (vistos.has(seguinte)) continue;
      vistos.add(seguinte);
      const adiante = [...caminho, seguinte];
      if (ehDeServidor(seguinte)) return adiante;
      fila.push(adiante);
    }
  }
  return null;
}

describe("a fronteira entre o servidor e o browser", () => {
  const deCliente = TODOS.filter(ehDeCliente);

  it("há componentes de browser para verificar (controlo positivo)", () => {
    // Sem isto, o teste seguinte passaria por não haver nada que percorrer —
    // uma expressão regular partida transformava-o numa linha verde a mentir.
    expect(deCliente.length).toBeGreaterThan(50);
  });

  it("reconhece um módulo de servidor quando o vê (controlo positivo)", () => {
    const servidores = TODOS.filter(ehDeServidor);
    expect(servidores.length).toBeGreaterThan(5);
  });

  it.each(deCliente.map((f) => [path.relative(process.cwd(), f), f]))(
    "%s não chega a nenhum módulo `server-only`",
    (_rotulo, f) => {
      const caminho = caminhoAteServidor(f as string);
      expect(
        caminho,
        caminho
          ? `cadeia até servidor:\n  ${caminho.map((x) => path.relative(process.cwd(), x)).join("\n  → ")}`
          : "",
      ).toBeNull();
    },
  );
});
