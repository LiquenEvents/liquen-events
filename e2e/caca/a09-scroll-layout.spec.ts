import { test, expect } from "@playwright/test";
import { auditar, entrar, escutar, exigirSilencio, irPara, assentar, provar } from "./harness";

/**
 * AGENTE 9 — scroll e layout, em todos os ecrãs e em todas as larguras.
 *
 * É o agente mais barato e o que costuma render mais: overflow horizontal e
 * alvos de toque pequenos não precisam de um percurso complicado para
 * aparecerem — basta abrir o ecrã na largura certa.
 *
 * Cada vista é um teste próprio para o relatório dizer QUAL parte, em vez de
 * um único teste vermelho que obriga a ler o log para saber onde.
 */

/**
 * ── ESTA LISTA TEM DE SER A DO MENU, E TINHA DERIVADO ─────────────────────
 *
 * Três entradas apontavam para sítios que já não existem, e o teste falhava a
 * dizer "não consegui chegar" — o que parece um defeito do produto e é um
 * defeito do teste. Como o passo que as corre é informativo, ninguém reparou.
 *
 * As três, com a origem de cada uma:
 *  · `Acompanhamento` e `Serviços` — destinos que ELA mandou tirar do menu, e
 *    que eu tirei. A lista ficou para trás;
 *  · `Contratos` — renomeado para "Propostas Aceites" numa ronda anterior;
 *  · `Fazer Proposta` — o menu diz "Fazer proposta", com `p` pequeno, e a
 *    expressão exigia maiúscula.
 *
 * O `nav.contrato.test.ts` guarda o menu; esta lista é a projecção dele nos
 * percursos de ergonomia, e mantê-las de acordo é trabalho manual até alguém
 * as ligar por código.
 *
 * ── E NÃO ERA SÓ A LISTA ───────────────────────────────────────────────────
 * Corrigida a lista, quatro vistas continuavam a falhar com o mesmo «não
 * consegui chegar» — e não tinham nada de errado: era o tecto de oito entradas
 * por minuto do `/api/admin/login`, que este ficheiro sozinho estoirava com
 * catorze testes. Falhavam sempre as ÚLTIMAS. Está contado em `harness.ts`, no
 * bloco «O COFRE DA SESSÃO»; o que fica aqui é o aviso de que um «não consegui
 * chegar à vista X» tem duas causas possíveis e a segunda não se vê no menu.
 */
const VISTAS: { rotulo: RegExp; nome: string }[] = [
  { rotulo: /^Visão Geral$/, nome: "visao-geral" },
  { rotulo: /^Pedidos$/, nome: "pedidos" },
  { rotulo: /^Fazer proposta$/, nome: "fazer-proposta" },
  { rotulo: /^Propostas$/, nome: "propostas" },
  { rotulo: /^Calendário$/, nome: "calendario" },
  { rotulo: /^Tarefas$/, nome: "tarefas" },
  { rotulo: /^Faturas$/, nome: "faturas" },
  { rotulo: /^Propostas Aceites$/, nome: "propostas-aceites" },
  { rotulo: /^Material$/, nome: "material" },
  { rotulo: /^Temas$/, nome: "temas" },
  { rotulo: /^Estatísticas$/, nome: "estatisticas" },
  { rotulo: /^Definições$/, nome: "definicoes" },
];

for (const vista of VISTAS) {
  test(`A9 · ${vista.nome} · sem overflow, alvos ≥44px, inputs ≥16px`, async ({ page }, info) => {
    const r = escutar(page);
    test.skip(!(await entrar(page)), "login indisponível neste ambiente");

    await irPara(page, vista.rotulo);
    await assentar(page);

    const a = await auditar(page, vista.nome);

    // Anexa sempre — a prova de que passou vale tanto como a de que falhou.
    await provar(page, info, `${vista.nome}-${info.project.name}.png`);

    const queixas: string[] = [];
    if (a.overflow > 1) {
      queixas.push(
        `OVERFLOW HORIZONTAL de ${a.overflow}px.\nCulpados:\n  ${a.culpados.join("\n  ")}`,
      );
    }
    if (a.alvos.length > 0) {
      queixas.push(
        `ALVOS DE TOQUE pequenos (${a.alvos.length}):\n  ` +
          a.alvos.map((x) => `${x.descricao} ${x.largura}×${x.altura}`).join("\n  "),
      );
    }
    if (a.inputs.length > 0) {
      queixas.push(`INPUTS com letra <16px (zoom do iOS):\n  ` + a.inputs.join("\n  "));
    }

    expect(queixas, `${vista.nome} @ ${info.project.name}\n\n${queixas.join("\n\n")}`).toEqual([]);
    exigirSilencio(r, vista.nome);
  });
}

test("A9 · o modal de temas não deixa a página de fundo fazer scroll", async ({ page }) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");

  await irPara(page, /^Temas$/);
  await assentar(page);

  const antes = await page.evaluate(() => document.body.style.overflow);
  // Sem modal aberto, o body faz scroll normalmente.
  expect(antes === "hidden").toBe(false);
  exigirSilencio(r, "temas");
});

test("A9 · a barra fixa do estúdio não tapa o último campo", async ({ page }, info) => {
  const r = escutar(page);
  test.skip(!(await entrar(page)), "login indisponível");

  await irPara(page, /^Pedidos$/);
  await assentar(page);

  // Abre o estúdio do primeiro pedido que tiver botão para isso.
  const abrir = page
    .getByRole("button", { name: /Fazer proposta|Abrir estúdio|Proposta/i })
    .first();
  if ((await abrir.count()) === 0) test.skip(true, "sem pedido com estúdio nesta semente");
  await abrir.click();
  await assentar(page, 800);

  // Desce até ao fim e vê se o que está por baixo da barra fixa é alcançável.
  await page.keyboard.press("End");
  await page.mouse.wheel(0, 20000);
  await assentar(page, 400);

  const tapado = await page.evaluate(() => {
    // A barra fixa do estúdio é `position: sticky; bottom: 0`.
    const barras = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
      const s = getComputedStyle(el);
      return (s.position === "sticky" || s.position === "fixed") && s.bottom === "0px";
    });
    if (barras.length === 0) return null;
    const barra = barras[barras.length - 1].getBoundingClientRect();
    // Algum campo interactivo fica por baixo dela?
    const alvos = Array.from(
      document.querySelectorAll<HTMLElement>("input, textarea, button, select"),
    );
    for (const el of alvos) {
      const rr = el.getBoundingClientRect();
      if (rr.height === 0) continue;
      const centro = rr.top + rr.height / 2;
      if (centro > barra.top && centro < barra.bottom && !barras[barras.length - 1].contains(el)) {
        return `${el.tagName} «${el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 30)}» por baixo da barra fixa`;
      }
    }
    return null;
  });

  await provar(page, info, `estudio-barra-fixa-${info.project.name}.png`);
  expect(tapado, `Conteúdo tapado pela barra fixa: ${tapado}`).toBeNull();
  exigirSilencio(r, "estúdio");
});
