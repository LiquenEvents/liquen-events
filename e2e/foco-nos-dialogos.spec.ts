import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * O FOCO NAS JANELAS DO BACK OFFICE, MEDIDO NUM BROWSER A SÉRIO.
 *
 * ── Porque é que este passeio existe, e não chega o jsdom ───────────────────
 * A armadilha de foco (`useFocusTrap`) tem cobertura unitária farta, mas essa
 * cobertura mente por omissão num ponto preciso: o hook decide quem é focável
 * com `el.offsetParent !== null`, e o jsdom NÃO FAZ DISPOSIÇÃO — ali o
 * `offsetParent` é sempre `null`. O `useFocusTrap.test.ts` contorna isso com um
 * remendo ao protótipo, declarado no cabeçalho dele. Ou seja: o único teste que
 * prova que o Tab circula é um teste que primeiro ensina o DOM a responder o
 * que o browser responderia. Se a resposta verdadeira do browser fosse outra —
 * um `opacity:0` inicial, uma animação por acabar, um `inert` mal apontado —
 * nenhum teste do repositório dava por isso.
 *
 * Uma auditoria em produção (achado F-06) disse ter visto exactamente isso: a
 * paleta a abrir com o foco num `<h2>` da página de trás, escrever não chegar
 * ao campo, e o Tab a passear pela página por baixo. Este ficheiro é a medição
 * que faltava para decidir a questão com factos em vez de leitura de código.
 *
 * ── O que se mede, e porquê assim ──────────────────────────────────────────
 * Três perguntas, feitas ao browser e não ao código:
 *   1. onde está o `document.activeElement` depois de abrir;
 *   2. o que acontece ao texto que o TECLADO escreve (`page.keyboard.type`, sem
 *      `fill()` e sem `click()` no campo — os dois poriam lá o foco por si e
 *      apagavam justamente o defeito que se procura);
 *   3. onde o Tab e o Shift+Tab deixam o foco, dando voltas suficientes para
 *      passar o fim da lista pelo menos uma vez.
 * E ainda a devolução do foco a quem abriu, que é a outra metade do achado.
 */

/** Ruído de consola que não é defeito — mesma lista do smoke do back office. */
const IGNORADOS = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_)/i,
];

/**
 * Entra pelo formulário verdadeiro, com as credenciais de desenvolvimento.
 * Devolve `false` quando a instalação recusa a palavra-passe de dev (um build
 * de produção sem `ADMIN_PASSWORD_HASH` recusa-a de propósito) para o passeio
 * SALTAR em vez de falhar — o mesmo contrato do `admin-smoke.spec.ts`.
 */
async function entrar(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  await page.getByLabel(/O teu email/i).fill("catarina@liquen-events.com");
  await page.locator('input[name="password"]').fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  try {
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Um retrato de quem tem o foco AGORA, colhido dentro do browser. Devolve-se
 * uma descrição legível (etiqueta, papel, tag) e não o elemento, porque o que
 * falha tem de se ler no relatório sem abrir o trace: «estava num H2» é o
 * diagnóstico do achado, e é isso que a mensagem tem de conseguir dizer.
 */
async function quemTemOFoco(dialogo: Locator) {
  return dialogo.evaluate((d) => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: "(nenhum)", papel: null, etiqueta: null, dentroDoDialogo: false };
    return {
      tag: el.tagName,
      papel: el.getAttribute("role"),
      etiqueta: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? null,
      dentroDoDialogo: d.contains(el),
    };
  });
}

test.describe("Foco preso nas janelas do back office", () => {
  test("a paleta de comandos: foco no campo, teclado a chegar lá, Tab que não sai", async ({
    page,
  }) => {
    const erros: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORADOS.some((re) => re.test(m.text()))) erros.push(m.text());
    });

    test.skip(!(await entrar(page)), "Sem login de dev nesta instalação.");

    // Damos o foco a um elemento CONHECIDO da página antes de abrir, por duas
    // razões: é o que uma pessoa tem (o foco está sempre algures) e é a única
    // forma de depois verificar a devolução do foco a quem abriu.
    const abridor = page.getByRole("button", { name: "Ajuda e glossário" });
    await abridor.focus();
    await expect(abridor).toBeFocused();

    // Pelo atalho, como uma pessoa faz — e não por um clique, que poria o foco
    // no sítio por si mesmo e escondia o defeito.
    await page.keyboard.press("ControlOrMeta+k");

    const dialogo = page.getByRole("dialog", { name: /Pesquisar e navegar/i });
    await expect(dialogo).toBeVisible();

    // ── PERGUNTA 1: o foco ficou no campo de pesquisa? ──────────────────────
    const campo = page.getByRole("combobox", { name: /Pesquisar/i });
    const foco = await quemTemOFoco(dialogo);
    expect(
      foco.dentroDoDialogo,
      `Ao abrir, o foco ficou FORA do diálogo: <${foco.tag}> «${foco.etiqueta}».`,
    ).toBe(true);
    await expect(campo, "O foco não ficou no campo de pesquisa.").toBeFocused();

    // ── PERGUNTA 2: o que o teclado escreve chega ao campo? ─────────────────
    // `keyboard.type` escreve para onde o foco estiver, seja onde for. Se o
    // foco estivesse num `<h2>` de trás, o campo ficava vazio — que é
    // exactamente o sintoma relatado («continua com o placeholder»).
    await page.keyboard.type("visao");
    await expect(campo, "O que o teclado escreveu não chegou ao campo.").toHaveValue("visao");

    // Limpa, para a lista voltar a ter as opções todas e o Tab ter por onde
    // circular.
    for (let i = 0; i < "visao".length; i++) await page.keyboard.press("Backspace");
    await expect(campo).toHaveValue("");

    // ── PERGUNTA 3: o Tab circula lá dentro, ou sai para a página de trás? ──
    // Doze voltas: a paleta tem o campo, o botão de fechar e uma opção por
    // destino, portanto doze passa o fim da lista com folga. Verifica-se a
    // CADA passo — um trap que só falha à terceira volta é um trap que falha.
    for (let i = 1; i <= 12; i++) {
      await page.keyboard.press("Tab");
      const agora = await quemTemOFoco(dialogo);
      expect(
        agora.dentroDoDialogo,
        `O Tab nº ${i} saiu do diálogo e caiu em <${agora.tag}> «${agora.etiqueta}».`,
      ).toBe(true);
    }

    // E para trás, que é o sentido que a auditoria não chegou a testar e onde
    // um trap escrito à mão falha com igual facilidade.
    for (let i = 1; i <= 12; i++) {
      await page.keyboard.press("Shift+Tab");
      const agora = await quemTemOFoco(dialogo);
      expect(
        agora.dentroDoDialogo,
        `O Shift+Tab nº ${i} saiu do diálogo e caiu em <${agora.tag}> «${agora.etiqueta}».`,
      ).toBe(true);
    }

    // ── E a devolução: fechar tem de pôr o foco onde ele estava. ────────────
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(abridor, "Ao fechar, o foco não voltou a quem abriu.").toBeFocused();

    expect(erros, `Erros de consola durante o passeio:\n${erros.join("\n")}`).toEqual([]);
  });

  test("a Ajuda e glossário: mesmo contrato, pela via do botão", async ({ page }) => {
    const erros: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORADOS.some((re) => re.test(m.text()))) erros.push(m.text());
    });

    test.skip(!(await entrar(page)), "Sem login de dev nesta instalação.");

    // Aqui o abridor é o próprio botão clicado — o caso normal, e aquele em que
    // a devolução do foco tem um destino óbvio para verificar.
    const abridor = page.getByRole("button", { name: "Ajuda e glossário" });
    await abridor.click();

    const dialogo = page.getByRole("dialog", { name: /Ajuda e glossário/i });
    await expect(dialogo).toBeVisible();

    const foco = await quemTemOFoco(dialogo);
    expect(
      foco.dentroDoDialogo,
      `Ao abrir a Ajuda, o foco ficou FORA do diálogo: <${foco.tag}> «${foco.etiqueta}».`,
    ).toBe(true);

    // A Ajuda é texto: o único focável lá dentro é o × de fechar. Um trap que
    // se porte bem tem de deixar o foco NELE a cada Tab, em vez de o deixar
    // escorregar para a página — que é o caso mais fácil de falhar, porque não
    // há um «primeiro» e um «último» distintos para o hook comparar.
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.press(i % 2 === 0 ? "Shift+Tab" : "Tab");
      const agora = await quemTemOFoco(dialogo);
      expect(
        agora.dentroDoDialogo,
        `Na Ajuda, o Tab nº ${i} saiu do diálogo e caiu em <${agora.tag}> «${agora.etiqueta}».`,
      ).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(
      abridor,
      "Ao fechar a Ajuda, o foco não voltou ao botão que a abriu.",
    ).toBeFocused();

    expect(erros, `Erros de consola durante o passeio:\n${erros.join("\n")}`).toEqual([]);
  });

  /**
   * ── A OUTRA METADE DO ACHADO: O FUNDO CONTINUA NA ÁRVORE DE ACESSIBILIDADE ─
   * O `useFocusTrap` marca `inert`/`aria-hidden` nos IRMÃOS do diálogo, mas
   * procura-os apenas entre os FILHOS DIRECTOS do `document.body`:
   *
   *     for (const node of Array.from(document.body.children))
   *       if (node === container || node.contains(container)) continue;
   *
   * No back office nenhum destes diálogos vai para um portal — são desenhados
   * onde estão declarados, lá no fundo da árvore do `AdminClient`. Logo o único
   * filho do `body` que existe é a raiz da aplicação, essa CONTÉM o diálogo, e
   * a guarda salta-a. Resultado: não sobra irmão nenhum para marcar, e o fundo
   * inteiro — barra, menu, títulos — fica na árvore de acessibilidade com o
   * modal aberto por cima.
   *
   * Nos testes unitários isto não se vê, e não por acaso: o `@testing-library`
   * desenha dentro de um `<div>` que pendura no `body`, portanto ali o diálogo
   * TEM irmãos de nível de `body` e a marcação parece funcionar. É uma
   * diferença de forma da árvore, não de comportamento do hook.
   *
   * Mede-se à parte do Tab de propósito: são dois defeitos distintos e quem ler
   * um vermelho tem de saber qual dos dois caiu.
   */
  test("com a paleta aberta, o fundo sai da árvore de acessibilidade", async ({ page }) => {
    test.skip(!(await entrar(page)), "Sem login de dev nesta instalação.");

    const menu = page.getByRole("navigation", { name: /Navegação do back office/i });
    await expect(menu).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog", { name: /Pesquisar e navegar/i })).toBeVisible();

    // Pergunta-se ao browser, não ao React: algum antepassado do menu está
    // marcado como escondido ou inerte? É assim que um leitor de ecrã decide.
    const fundo = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label*="Navegação do back office" i]');
      if (!nav) return { achou: false, escondido: false, inerte: false };
      let escondido = false;
      let inerte = false;
      for (let el: Element | null = nav; el; el = el.parentElement) {
        if (el.getAttribute("aria-hidden") === "true") escondido = true;
        if ((el as HTMLElement).inert) inerte = true;
      }
      return { achou: true, escondido, inerte };
    });

    expect(fundo.achou, "Não se encontrou o menu de navegação para medir.").toBe(true);
    expect(
      fundo.escondido || fundo.inerte,
      "Com o modal aberto, o menu de fundo continua visível para tecnologia de apoio: " +
        'nenhum antepassado tem `aria-hidden="true"` nem `inert`.',
    ).toBe(true);
  });
});
