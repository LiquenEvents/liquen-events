import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ESTADO_ADMIN } from "./estado-admin";
import { entrarNoBackOffice } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ENTRAR UMA VEZ, E SER ESSA A SESSÃO DE TODA A PASSAGEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O vermelho que isto resolve ───────────────────────────────────────────
 *
 * O `POST /api/admin/login` tem um tecto de OITO ENTRADAS POR MINUTO por
 * endereço (e sessenta à hora). É um tecto certo — protege a porta dela de
 * quem esteja a tentar palavras-passe à sorte — e não se toca.
 *
 * Só que cada passeio abre um contexto novo, sem cookies, e entrava outra vez.
 * O passeio do telemóvel, sozinho, faz sete entradas em quarenta segundos. Com
 * a configuração principal a correr antes, o contador já vinha gasto: a partir
 * do oitavo, o servidor responde 429, o `entrarNoBackOffice` não entra, e o
 * teste morre no `page.goto` com «Target page, context or browser has been
 * closed» — uma mensagem que se lê como avaria de infraestrutura e manda quem
 * a lê procurar o problema no sítio errado.
 *
 * Foi isso, e só isso, que pintou doze passeios de vermelho numa passagem: o
 * primeiro a bater no tecto derrubou todos os que vinham atrás.
 *
 * ── O remédio ─────────────────────────────────────────────────────────────
 *
 * Entra-se UMA vez, aqui, e guarda-se a sessão. Todos os projectos que
 * dependem deste arrancam com ela já posta, e o `entrarNoBackOffice` de cada
 * passeio encontra o painel aberto e devolve `true` sem gastar entrada
 * nenhuma. Uma passagem inteira passa a custar uma entrada em vez de trinta.
 *
 * A entrada VERDADEIRA — o formulário, a palavra-passe, o 429, o segundo
 * factor — continua a ter os seus próprios testes. O que deixa de existir é a
 * repetição que não media nada e gastava o contador de todos.
 *
 * ── Quando não há como entrar ─────────────────────────────────────────────
 *
 * Fora do CI, uma máquina sem `ADMIN_PASSWORD_HASH` não entra — e isso é uma
 * condição do ambiente, não uma avaria. Aqui grava-se o estado ANÓNIMO na
 * mesma: sem ficheiro, todos os projectos que dependem deste rebentavam a
 * arrancar. Com ele, cada passeio tenta entrar como sempre tentou e salta-se
 * sozinho, que é o que já fazia.
 */

setup("entra uma vez, e é essa a sessão de toda a passagem", async ({ page }) => {
  setup.setTimeout(120_000);
  fs.mkdirSync(path.dirname(ESTADO_ADMIN), { recursive: true });

  const dentro = await entrarNoBackOffice(page);
  if (process.env.CI) {
    expect(
      dentro,
      "não entrei no back office para guardar a sessão — ADMIN_PASSWORD_HASH em falta no CI?",
    ).toBe(true);
  }

  await page.context().storageState({ path: ESTADO_ADMIN });
});
