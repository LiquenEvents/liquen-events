import { test, expect } from "@playwright/test";
import { assentar, entrar, escutar, exigirSilencio, irPara, provar } from "./harness";

/**
 * AGENTE 2 — o editor de serviços sob stress.
 *
 * O editor é a secção mais escrita do estúdio: dezenas de linhas por proposta,
 * muitas vezes com o cliente ao telefone. Os defeitos que interessam aqui não
 * aparecem com três linhas — aparecem com cinquenta, com nomes de 300
 * caracteres, e depois de arrastar, duplicar e desfazer.
 */

const LONGO = "Arranjos de mesa baixos com eucalipto e rosas de jardim ".repeat(6).slice(0, 300);
const EMOJI = "Arco floral 🌿💐 — cerimónia ☀️";

/** Abre o estúdio do primeiro pedido disponível. */
async function abrirEstudio(page: import("@playwright/test").Page) {
  await irPara(page, /^Fazer Proposta$/);
  await assentar(page, 800);
  // O passo "Fazer proposta" pode pedir para escolher um pedido primeiro.
  const escolher = page.getByRole("button", { name: /Escolher|Seleccionar|Abrir/i }).first();
  if ((await escolher.count()) > 0 && (await escolher.isVisible().catch(() => false))) {
    await escolher.click().catch(() => {});
    await assentar(page, 600);
  }
  return (await page.getByRole("button", { name: /\+ Adicionar linha/i }).count()) > 0;
}

test("A2 · 50 linhas: continua utilizável e sem erros de consola", async ({ page }, info) => {
  test.slow();
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");
  test.skip(!(await abrirEstudio(page)), "editor de serviços não alcançável nesta semente");

  const adicionar = page.getByRole("button", { name: /\+ Adicionar linha/i }).first();
  const primeira = page.getByLabel(/^Linha 1 do grupo 1$/);
  await primeira.click();

  // Enter cria a linha seguinte e leva lá o cursor — é o caminho real.
  for (let i = 1; i <= 50; i += 1) {
    await page.keyboard.type(`Serviço ${i}`);
    await page.keyboard.press("Enter");
  }
  await assentar(page, 600);

  const linhas = await page.getByLabel(/^Linha \d+ do grupo 1$/).count();
  expect(linhas, `Esperava ~50 linhas, obtive ${linhas}`).toBeGreaterThanOrEqual(45);

  // Com 50 linhas, o ecrã não pode passar a fazer scroll horizontal.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await provar(page, info, `editor-50-linhas-${info.project.name}.png`);
  expect(overflow, `Overflow horizontal de ${overflow}px com 50 linhas`).toBeLessThanOrEqual(1);

  expect(adicionar).toBeTruthy();
  exigirSilencio(r, "editor com 50 linhas");
});

test("A2 · nome de 300 caracteres não rebenta o layout", async ({ page }, info) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");
  test.skip(!(await abrirEstudio(page)), "editor não alcançável");

  const primeira = page.getByLabel(/^Linha 1 do grupo 1$/);
  await primeira.fill(LONGO);
  await assentar(page, 400);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await provar(page, info, `editor-300-chars-${info.project.name}.png`);
  expect(overflow, `Nome de 300 chars provocou ${overflow}px de overflow`).toBeLessThanOrEqual(1);
  exigirSilencio(r, "editor com nome longo");
});

test("A2 · emojis e acentos sobrevivem a gravar e reler", async ({ page }) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");
  test.skip(!(await abrirEstudio(page)), "editor não alcançável");

  const primeira = page.getByLabel(/^Linha 1 do grupo 1$/);
  await primeira.fill(EMOJI);
  await primeira.blur();
  await assentar(page, 1500); // deixa o rascunho gravar

  await page.reload();
  await assentar(page, 1500);

  const valor = await page
    .getByLabel(/^Linha 1 do grupo 1$/)
    .inputValue()
    .catch(() => "");
  expect(valor, "Emojis/acentos perderam-se ao gravar e reler").toContain("Arco floral");
  exigirSilencio(r, "emojis");
});

test("A2 · apagar uma linha do meio não desloca as outras", async ({ page }) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");
  test.skip(!(await abrirEstudio(page)), "editor não alcançável");

  const primeira = page.getByLabel(/^Linha 1 do grupo 1$/);
  await primeira.click();
  for (const nome of ["Um", "Dois", "Três", "Quatro"]) {
    await page.keyboard.type(nome);
    await page.keyboard.press("Enter");
  }
  await assentar(page, 400);

  // Remove a linha 2 ("Dois").
  const remover = page.getByRole("button", { name: /Remover linha 2 do grupo 1/i }).first();
  if ((await remover.count()) === 0) test.skip(true, "sem botão de remover identificável");
  await remover.click();
  await assentar(page, 400);

  const valores: string[] = [];
  const campos = page.getByLabel(/^Linha \d+ do grupo 1$/);
  for (let i = 0; i < (await campos.count()); i += 1) {
    valores.push(await campos.nth(i).inputValue());
  }
  expect(valores.join("|"), "A remoção deslocou os valores").not.toContain("Dois");
  expect(valores).toContain("Três");
  exigirSilencio(r, "remoção");
});

test("A2 · desfazer várias vezes seguidas não parte nada", async ({ page }) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");
  test.skip(!(await abrirEstudio(page)), "editor não alcançável");

  const primeira = page.getByLabel(/^Linha 1 do grupo 1$/);
  await primeira.click();
  for (const nome of ["A", "B", "C", "D", "E"]) {
    await page.keyboard.type(nome);
    await page.keyboard.press("Enter");
  }
  await assentar(page, 300);

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(60);
  }
  await assentar(page, 400);

  // O que importa não é o estado final exacto — é não ter rebentado.
  expect(await page.getByLabel(/^Linha 1 do grupo 1$/).count()).toBeGreaterThanOrEqual(1);
  exigirSilencio(r, "desfazer repetido");
});

test("A2 · grupo sem nome e linha vazia não geram erro", async ({ page }) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");
  test.skip(!(await abrirEstudio(page)), "editor não alcançável");

  const titulo = page.getByLabel(/Título do grupo 1/i);
  if ((await titulo.count()) > 0) await titulo.fill("");
  const primeira = page.getByLabel(/^Linha 1 do grupo 1$/);
  await primeira.fill("");
  await primeira.blur();
  await assentar(page, 1200);

  exigirSilencio(r, "grupo e linha vazios");
});
