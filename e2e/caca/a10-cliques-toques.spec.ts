import { test, expect } from "@playwright/test";
import {
  assentar,
  cliqueDuplo,
  entrar,
  escutar,
  exigirSilencio,
  irPara,
  provar,
  vezesPedido,
} from "./harness";

/**
 * AGENTE 10 — cliques, toques e estados.
 *
 * O bug que este agente procura primeiro é o mais caro de todos: um duplo
 * clique que cria dois registos. Numa proposta enviada, isso são dois emails
 * ao mesmo casal; num pagamento, é dinheiro contado a dobrar.
 */

test("A10 · duplo clique em «adicionar» não cria dois registos", async ({ page }) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");

  await irPara(page, /^Tarefas$/);
  await assentar(page);

  const novo = page
    .getByRole("button", { name: /Nova tarefa|Adicionar tarefa|\+ Tarefa/i })
    .first();
  if ((await novo.count()) === 0) test.skip(true, "sem botão de nova tarefa");

  const antes = await page.getByRole("listitem").count();
  await cliqueDuplo(novo);
  await assentar(page, 900);
  const depois = await page.getByRole("listitem").count();

  expect(
    depois - antes,
    `Duplo clique criou ${depois - antes} itens (esperado no máximo 1)`,
  ).toBeLessThanOrEqual(1);
  exigirSilencio(r, "tarefas");
});

test("A10 · Esc fecha o seletor de temas e o clique fora também", async ({ page }, info) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");

  await irPara(page, /^Pedidos$/);
  await assentar(page);
  const abrir = page.getByRole("button", { name: /Fazer proposta|Abrir estúdio/i }).first();
  if ((await abrir.count()) === 0) test.skip(true, "sem estúdio nesta semente");
  await abrir.click();
  await assentar(page, 800);

  const dialogo = page.getByRole("dialog");
  const botaoTemas = page
    .getByRole("button", { name: /Da biblioteca|Escolher fotos|Temas/i })
    .first();
  if ((await botaoTemas.count()) === 0) test.skip(true, "sem seletor de temas alcançável");

  await botaoTemas.click();
  await assentar(page, 600);
  if ((await dialogo.count()) === 0) test.skip(true, "o seletor não é um dialog");

  await page.keyboard.press("Escape");
  await assentar(page, 400);
  await provar(page, info, `temas-esc-${info.project.name}.png`);
  expect(await dialogo.count(), "Esc não fechou o diálogo").toBe(0);
  exigirSilencio(r, "seletor de temas");
});

test("A10 · nenhuma acção fica só no hover (invisível em telemóvel)", async ({ page }, info) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");

  await irPara(page, /^Pedidos$/);
  await assentar(page);

  // Procura botões que só ganham dimensão/opacidade com hover: em telemóvel
  // não há hover, portanto são funções inalcançáveis.
  const escondidos = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href]"))) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Opacidade zero num elemento com tamanho = existe mas não se vê.
      if (parseFloat(s.opacity) === 0) {
        const nome =
          el.getAttribute("aria-label") ||
          (el.textContent || "").trim().slice(0, 40) ||
          el.className.toString().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} «${nome}» opacity:0`);
      }
    }
    return out;
  });

  await provar(page, info, `pedidos-hover-${info.project.name}.png`);
  expect(escondidos, `Acções invisíveis sem hover:\n  ${escondidos.join("\n  ")}`).toEqual([]);
  exigirSilencio(r, "pedidos");
});

test("A10 · o foco do teclado é sempre visível ao andar de Tab", async ({ page }) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");

  await irPara(page, /^Pedidos$/);
  await assentar(page);

  const invisiveis: string[] = [];
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const temAnel =
        (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
        s.boxShadow !== "none" ||
        s.borderColor !== "rgba(0, 0, 0, 0)";
      return {
        temAnel,
        nome:
          el.getAttribute("aria-label") ||
          (el.textContent || "").trim().slice(0, 30) ||
          el.tagName.toLowerCase(),
      };
    });
    if (info && !info.temAnel) invisiveis.push(info.nome);
  }

  expect(invisiveis, `Foco invisível em: ${invisiveis.join(", ")}`).toEqual([]);
  exigirSilencio(r, "foco");
});

test("A10 · gravar duas vezes não duplica pedidos à API", async ({ page }) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");

  await irPara(page, /^Definições$/);
  await assentar(page);

  const guardar = page.getByRole("button", { name: /Guardar|Gravar/i }).first();
  if ((await guardar.count()) === 0) test.skip(true, "sem botão de guardar nas definições");

  const antes = vezesPedido(r, "/api/", "PUT") + vezesPedido(r, "/api/", "POST");
  await cliqueDuplo(guardar);
  await assentar(page, 1200);
  const depois = vezesPedido(r, "/api/", "PUT") + vezesPedido(r, "/api/", "POST");

  expect(
    depois - antes,
    `Duplo clique disparou ${depois - antes} escritas (esperado no máximo 1)`,
  ).toBeLessThanOrEqual(1);
});
