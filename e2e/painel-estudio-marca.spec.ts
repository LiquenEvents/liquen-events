import { test, expect, type Locator, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «ESTA PÁGINA / TODAS» — a marca do painel do estúdio ANDA, E PÁRA NO SÍTIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
 * outra, quando se carrega numa coisa e vai-se para outra coisa».
 *
 * A barra de separadores do `PainelDoEstudio` é a única do estúdio escrita à
 * mão, fora do `ui/Segmented.tsx` — e era a única sem o gesto que ele tem: o
 * botão activo acendia num sítio e apagava-se no outro no mesmo fotograma.
 * Passou a ter a mesma marca que desliza, com a mesma medida
 * (`ui/useMarcaQueAnda.ts`) e a mesma constante (`MARCA`, 250 ms).
 *
 * ── O QUE FALTAVA, E QUE É SÓ ISTO ────────────────────────────────────────
 *
 * A canalização já estava provada em jsdom
 * (`PainelDoEstudio.test.tsx`, «a barra de separadores do painel»): que a
 * marca existe, que é UMA só, que mede o separador com `aria-selected="true"`,
 * que usa a constante da casa, e que o primeiro fotograma não anda. Faltava a
 * única coisa que o jsdom não pode dizer — ONDE É QUE ELA PÁRA. `offsetParent`
 * é sempre nulo ali e as medidas são zero: sem disposição, «não há marca» e
 * «há marca e está no sítio» lêem-se igual. Quem escreveu aquele ficheiro
 * disse-o por extenso e deixou este passeio por escrever, convencido de que
 * não havia browsers nesta máquina. Havia — em `PLAYWRIGHT_BROWSERS_PATH`.
 *
 * ── E O QUE ELE ENCONTROU À PRIMEIRA CORRIDA ──────────────────────────────
 *
 * A marca não existia. Zero elementos ao abrir o painel, medido: o `<div
 * role="tablist">` estava lá com os dois separadores e nenhum filete. A causa
 * está hoje escrita no `ui/useMarcaQueAnda.ts` — o efeito da medida lia
 * `zona.current` com o `RefObject` nas dependências, e um `RefObject` é sempre
 * o mesmo objecto; este painel só se MONTA depois de a fila das colunas se
 * medir a si própria, portanto a barra nascia um desenho depois de o efeito
 * ter corrido e saído pelo `return`. Nunca mais voltava a correr.
 *
 * O que se via: ao abrir, nada — e o separador activo mantinha o seu próprio
 * fundo branco, que é a rede desenhada para o instante antes da primeira
 * medida, portanto NADA parecia partido. À primeira troca a `chave` mudava, a
 * medida corria pela primeira vez e a marca aparecia já em cima do destino,
 * sem percurso nenhum. Ou seja: o gesto que isto existe para fazer não
 * acontecia nunca na primeira troca — que é a única que se vê ao abrir o
 * estúdio.
 *
 * É por isso que a contagem da marca se afirma ANTES do primeiro clique. Um
 * passeio que carregasse primeiro e medisse depois passava por verde com o
 * defeito lá dentro.
 *
 * ── E MEDE-SE COM `expect.poll`, PELA MESMA RAZÃO DOS IRMÃOS ──────────────
 *
 * Porque a marca leva 250 ms a percorrer o caminho. A primeira versão do
 * passeio da barra lateral mediu-a A MEIO: deu 4,17 px de diferença e leu-se
 * como desalinhamento quando era, afinal, a animação a funcionar. O que
 * interessa é onde ela PÁRA — daí a comparação viver dentro do `poll`, a
 * repetir até assentar, e não numa leitura só.
 *
 * O que ele mede, num Chromium a 1920×1080 e com esta janela: a marca pára em
 * x=1386 sobre «Esta página» e em x=1554 sobre «Todas» — 168 px de percurso,
 * que são os 164 px do separador mais os 4 do `gap-1` —, com os mesmos 164 px
 * de largura nas duas paragens. Depois de assentar, a diferença para o canto
 * do separador activo é de **0,00 px** nos dois eixos e na largura. Com o
 * filete deslocado 40 px de propósito, o mesmo `poll` devolve 40.
 *
 * ── E PORQUE É QUE ESTE FICHEIRO CORRE NA SUITE DOS DADOS ─────────────────
 *
 * Porque o estúdio só abre a partir de um PEDIDO gravado, e o servidor de
 * produção que o `playwright.config.ts` arranca recusa escritas sem Supabase.
 * A razão está por extenso em `playwright.dados.config.ts`; este ficheiro
 * segue a mesma porta que o `nav-estudio-marca.spec.ts` e o
 * `fazer-proposta-cliente.spec.ts`, e está excluído lá como os irmãos.
 *
 * ── PORQUE É QUE O PASSEIO SEMEIA UM RASCUNHO ─────────────────────────────
 *
 * Porque esta barra só existe com páginas de inspiração: sem um mood board COM
 * fotografias, o painel diz «Ainda não há páginas de inspiração» e não há
 * separadores nenhuns para marcar. Montá-los a clicar — adicionar board, abrir
 * a biblioteca, escolher fotos — era um passeio inteiro antes do que se quer
 * medir, e cada degrau a mais é um degrau que pode partir por razões que não
 * têm nada a ver com a marca. O rascunho vai ao `localStorage` antes de a
 * página abrir, que é a receita já usada no `moodboards-arrasto.spec.ts`.
 *
 * ── E PORQUE É QUE A JANELA É GRANDE ──────────────────────────────────────
 *
 * Porque este painel só se MONTA onde cabe, e quem decide é a fila das três
 * colunas a medir-se a si própria (`LARGURA_MINIMA_DA_FILA`, 992 px, no
 * `ProposalStudio.tsx`). Num 1280×720 a fila não chega lá e não há painel
 * nenhum — o que é o comportamento certo e não o que aqui se mede.
 */
test.use({ viewport: { width: 1920, height: 1080 } });

/** O canto de cima, o da esquerda e a largura, numa leitura só. */
async function caixa(alvo: Locator): Promise<{ x: number; y: number; w: number }> {
  return alvo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width };
  });
}

/**
 * Semeia um rascunho com duas páginas de inspiração, ANTES de a página abrir.
 *
 * `addInitScript` e não um `evaluate` depois do `goto`: o restauro corre na
 * montagem do estúdio, e escrever depois disso seria escrever tarde de mais. A
 * chave é a que o `ProposalStudio` calcula, e o carimbo `:at` é o que faz o
 * rascunho local ganhar ao do servidor (que aqui não existe) — sem ele ficam
 * empatados e o estúdio prefere o de lá.
 *
 * Os caminhos das fotografias não resolvem para imagem nenhuma, e é de
 * propósito: a miniatura desenha uma caixa vazia (`data-previa="sem-foto"`) em
 * vez de um ícone partido, e o que aqui se mede são os separadores, não as
 * fotos.
 */
async function semearInspiracoes(page: Page, quoteId: string): Promise<void> {
  await page.addInitScript((id) => {
    localStorage.setItem(
      `liquen-proposal-studio-${id}`,
      JSON.stringify({
        template: "decoracao",
        moodBoards: [
          {
            id: "board-a",
            title: "Cerimónia",
            layout: "mosaico",
            images: ["fotos/um.jpg", "fotos/dois.jpg"],
          },
          { id: "board-b", title: "Jantar", layout: "mosaico", images: ["fotos/tres.jpg"] },
        ],
        coverImages: ["", ""],
      }),
    );
    localStorage.setItem(`liquen-proposal-studio-${id}:at`, String(Date.now()));
  }, quoteId);
}

test.describe("Back office — a marca dos separadores do painel do estúdio", () => {
  test("a marca desliza para o separador escolhido, e PÁRA em cima dele", async ({ page }) => {
    test.setTimeout(120_000);
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);

    /**
     * ── QUAL PEDIDO, E PORQUE É QUE ISSO SE PERGUNTA ─────────────────────
     *
     * O rascunho vive debaixo do id do pedido (`liquen-proposal-studio-<id>`),
     * portanto semeá-lo obriga a saber QUAL linha se vai abrir. A primeira
     * versão deste passeio semeou o id que o `garantirPedido` devolve — o
     * primeiro da API — e abriu a primeira linha da tabela, a contar que
     * fossem o mesmo. Não são: a tabela tem a sua própria ordem, e o painel
     * abriu sem separadores nenhuns com o rascunho gravado ao lado. Aqui
     * pergunta-se o email àquele pedido e é POR ELE que a linha se escolhe.
     */
    const lista = await (await page.request.get("/api/orcamento")).json();
    const pedido = (Array.isArray(lista) ? lista[0] : null) as {
      id?: string;
      email?: string;
    } | null;
    expect(pedido?.id, "a lista de pedidos veio sem id").toBeTruthy();
    expect(pedido?.email, "o pedido semeado veio sem email — não há por onde o achar").toBeTruthy();
    await semearInspiracoes(page, pedido!.id!);

    // O caminho curto para o estúdio em página inteira: a lista de pedidos e a
    // linha daquele pedido. É o mesmo do `nav-estudio-marca.spec.ts`.
    await page.goto("/orcamento/admin?v=pedidos", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 30_000,
    });
    const linha = page.getByRole("row").filter({ hasText: pedido!.email! }).first();
    await expect(linha).toBeVisible({ timeout: 20_000 });
    await linha.click();
    await expect(page.getByText(/Proposta para/)).toBeVisible({ timeout: 60_000 });

    const painel = page.getByRole("complementary", { name: /O que vai sair/i });
    await expect(
      painel,
      "o painel não se montou — a fila das colunas não chegou aos 992 px?",
    ).toBeVisible({ timeout: 60_000 });

    const barra = painel.getByRole("tablist", { name: "O que mostrar" });
    await expect(
      barra,
      "o painel abriu sem separadores — o rascunho não trouxe páginas de inspiração?",
    ).toBeVisible({ timeout: 30_000 });

    // A marca é filha DIRECTA da barra, como no `Segmented` e na barra lateral.
    // Uma marca dentro de cada separador dava o mesmo desenho parado e nenhum
    // percurso — é a maneira mais fácil de partir isto sem se notar.
    const marca = barra.locator('> [aria-hidden="true"]');
    await expect(marca, "a barra de separadores ficou sem marca nenhuma").toHaveCount(1, {
      timeout: 30_000,
    });

    const separadores = barra.getByRole("tab");
    await expect(separadores).toHaveCount(2);
    const activo = () => barra.locator('[aria-selected="true"]');
    await expect(activo()).toHaveText("Esta página");

    /**
     * Quanto é que a marca está FORA do separador activo, no pior dos eixos.
     *
     * Os dois eixos e a largura, e não só o `x`: a barra é horizontal, mas uma
     * marca com a largura errada aponta para o vizinho tão bem como uma marca
     * na coluna errada — e o `MARCA` da casa faz a largura andar junto com o
     * `translate` (`transition-[translate,width]`) precisamente por isso.
     */
    const desalinhamento = async () => {
      const [m, a] = await Promise.all([caixa(marca), caixa(activo())]);
      return Math.max(Math.abs(m.x - a.x), Math.abs(m.y - a.y), Math.abs(m.w - a.w));
    };

    /**
     * AO ABRIR já está em cima do primeiro separador.
     *
     * Não é uma afirmação de encher: é a que apanhou o defeito contado no
     * cabeçalho. Uma barra sem marca nenhuma até ao primeiro clique passava por
     * verde num passeio que carregasse primeiro e medisse depois.
     *
     * Dois píxeis de tolerância porque `getBoundingClientRect` devolve
     * fraccionários: o que aqui se apanha é a marca a parar NOUTRO separador,
     * não meio píxel de arredondamento.
     */
    await expect
      .poll(desalinhamento, {
        message: "a marca não nasceu em cima do separador activo",
        timeout: 30_000,
      })
      .toBeLessThanOrEqual(2);

    const antes = await caixa(marca);

    // O gesto: carregar no outro separador.
    await separadores.filter({ hasText: "Todas" }).click();
    await expect
      .poll(() => activo().textContent(), {
        message: "o separador activo não mudou com o clique",
        timeout: 30_000,
      })
      .toBe("Todas");

    // …a marca mudou de sítio…
    await expect
      .poll(async () => JSON.stringify(await caixa(marca)), {
        message: "a marca ficou parada quando o separador activo mudou",
        timeout: 30_000,
      })
      .not.toBe(JSON.stringify(antes));

    // …e continua a ser UMA só…
    await expect(marca).toHaveCount(1);

    // …e ASSENTA em cima do separador activo, que é o que o `poll` espera: ele
    // repete até a transição de 250 ms parar, em vez de a apanhar a meio.
    await expect
      .poll(desalinhamento, { message: "a marca parou fora do separador activo", timeout: 30_000 })
      .toBeLessThanOrEqual(2);

    // E a volta: o gesto tem de funcionar nos dois sentidos, senão bastava uma
    // marca que andasse uma vez e ficasse presa no fim da barra.
    await separadores.filter({ hasText: "Esta página" }).click();
    await expect
      .poll(() => activo().textContent(), {
        message: "o separador activo não voltou atrás",
        timeout: 30_000,
      })
      .toBe("Esta página");
    await expect
      .poll(desalinhamento, {
        message: "a marca não voltou a assentar no primeiro separador",
        timeout: 30_000,
      })
      .toBeLessThanOrEqual(2);
  });
});
