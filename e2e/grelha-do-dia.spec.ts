import { test, expect, type Locator, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido, idDaSemente } from "./semear-pedido";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A GRELHA DO DIA — O QUE SÓ SE VÊ COM PÍXEIS A SÉRIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A aritmética das colunas está presa em `lib/orcamento/guioes.colunas.test.ts`
 * e a semântica em `GrelhaDoDia.test.tsx`. Nenhuma das duas consegue ver o que
 * este passeio vê, porque em jsdom não há disposição nenhuma:
 * `getBoundingClientRect` devolve zeros e uma grelha inteiramente colapsada
 * passaria os dois ficheiros de ponta a ponta.
 *
 * As cinco coisas que só existem aqui, e todas silenciosas:
 *
 *  1. **A altura É a duração.** Uma montagem de 3 h tem de medir quatro vezes
 *     uma cerimónia de 45 min. Um erro de escala não dá erro nenhum — dá uma
 *     grelha bonita que responde mal à única pergunta que ela faz.
 *  2. **Um instante não é um bloco de altura zero.** Sem duração declarada, o
 *     momento continua a ter de se VER.
 *  3. **A madrugada fica em baixo.** O encerramento das 02:00 é o FIM do dia
 *     (a regra das 05:00, no motor). Desenhado no topo da manhã seria um copo
 *     de água às duas da tarde a abrir o guião.
 *  4. **O choque põe-se ao LADO, e não por cima.** Dois momentos da mesma
 *     pessoa em cima um do outro tapavam-se, e a grelha mostrava um dia limpo
 *     onde há um erro. Prova-se com as caixas: os dois x não se cruzam.
 *  5. **A 390 px a coluna das horas NÃO desaparece.** É a decisão difícil deste
 *     ecrã: com quatro pessoas a grelha rola para o lado, e uma grelha de horas
 *     sem horas é uma mancha. Rola-se até ao fim e mede-se se ela lá está.
 *
 * Corre em `npm run test:e2e:dados` pela razão de sempre: GRAVA, e o servidor
 * de produção sem Supabase recusa escritas (ver `playwright.dados.config.ts`).
 */

/**
 * O dia que se semeia, escolhido para exercitar as cinco coisas de uma vez.
 *
 * As durações são degraus da lista (`DEGRAUS_DE_DURACAO`), para o dia poder ser
 * editado à mão depois deste passeio sem cair numa opção inventada.
 */
const DIA = [
  // A Ana tem 3 h de montagem E uma prova lá dentro — é o CHOQUE.
  { id: "g-1", time: "09:00", title: "Montagem do arco", owner: "Ana Silva", duracao: 180 },
  { id: "g-2", time: "10:00", title: "Prova de bolo", owner: "ana silva ", duracao: 60 },
  // Sem responsável — a coluna que tem de ficar em ÚLTIMO apesar de começar cedo.
  { id: "g-3", time: "08:00", title: "Abrir o espaço", duracao: 60 },
  // O Rui atravessa o dia até à madrugada.
  { id: "g-4", time: "17:00", title: "Cerimónia", owner: "Rui", duracao: 45 },
  { id: "g-5", time: "20:00", title: "Brinde dos noivos", owner: "Rui" },
  { id: "g-6", time: "23:00", title: "Festa", owner: "Rui", duracao: 180 },
  { id: "g-7", time: "02:00", title: "Encerramento", owner: "Rui", duracao: 60 },
  // Uma quarta pessoa, que é o que faz a grelha não caber em 390 px.
  { id: "g-8", time: "16:00", title: "Flores na mesa", owner: "Sofia", duracao: 30 },
];

/** Um minuto vale um píxel — ver `PX_POR_MINUTO` na `GrelhaDoDia`. */
const PX_POR_MINUTO = 1;

/** Folga na medição: bordas de 1 px e arredondamentos do browser. */
const FOLGA = 2;

async function caixa(alvo: Locator) {
  const b = await alvo.boundingBox();
  expect(b, "o elemento não tem caixa nenhuma — está escondido?").not.toBeNull();
  return b!;
}

/** Um bloco da grelha, pela coluna a que pertence e pelo título que escreve. */
function bloco(page: Page, coluna: string, titulo: string): Locator {
  return page
    .getByRole("region", { name: `Coluna de ${coluna}` })
    .locator("li")
    .filter({ hasText: titulo });
}

/**
 * ── PORQUE É QUE A VISTA SE PEDE PELO ENDEREÇO E NÃO PELO BOTÃO ───────────
 *
 * O `guiao-do-dia.spec.ts` clica no botão «Timelines» da navegação, e faz bem:
 * o que ele guarda é precisamente que o DESTINO existe (uma `View` declara-se
 * em quatro sítios e só dois é que o compilador exige em par).
 *
 * Aqui não. Este passeio mede PÍXEIS, e mede-os a 390 px — onde a barra de
 * baixo tem quatro lugares e o «Timelines» vive dentro do «Mais» (está escrito
 * no `docs/GUIAO-DO-DIA.md`: entra no `MORE_NAV`). Escrito com o clique na
 * barra, as duas medições de telemóvel falhavam à procura de um botão que
 * naquela largura não está lá — e falhavam com a cara de outra coisa, um
 * «timeout» de 120 s. Foi o que aconteceu à primeira.
 *
 * O `AGENTS.md` dá a saída para os passeios: pedir a secção pelo ENDEREÇO,
 * `/orcamento/admin?v=<secção>`, que o SERVIDOR resolve — e esperar pela
 * hidratação antes de clicar, porque o cabeçalho passa a vir desenhado do
 * servidor e deixa de a provar. O sinal é a classe `admin-mode` no `body`.
 */
async function abrirAGrelha(page: Page) {
  await page.goto("/orcamento/admin?v=guioes", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"), null, {
    timeout: 120_000,
  });
  await expect(page.getByRole("heading", { level: 1, name: /^Timelines$/ })).toBeVisible({
    timeout: 60_000,
  });

  const linha = page.getByRole("button", { name: /Semente E2E/ }).first();
  await expect(linha).toBeVisible({ timeout: 60_000 });
  await linha.click();
  await expect(page.getByText("Cronograma do Dia")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("radio", { name: "Por pessoa" }).click();
  await expect(page.getByRole("group", { name: "Grelha do dia, por responsável" })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("Grelha do dia @grelha", () => {
  test.beforeEach(async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    // Garante que há pelo menos um pedido; o id que devolve é o do PRIMEIRO da
    // lista, que pode não ser este — ver `idDaSemente`.
    await garantirPedido(page);
    const id = await idDaSemente(page);

    // A semente é reaproveitada entre corridas: o dia que este passeio mede é
    // o que ele próprio escreve, e não o que a corrida anterior deixou. Vai
    // INTEIRO e substitui — não se junta ao que lá estava.
    const gravou = await page.request.patch(`/api/orcamento/${id}`, { data: { timeline: DIA } });
    expect(gravou.ok(), "não foi possível semear a timeline da grelha").toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });
  });

  test("as horas descem, uma coluna por quem faz, e a altura é a duração", async ({ page }) => {
    test.setTimeout(240_000);
    await abrirAGrelha(page);

    // ── AS COLUNAS ────────────────────────────────────────────────────────
    // Quatro, e não cinco: «Ana Silva» e «ana silva » são a mesma pessoa. A
    // ordem é a hora a que cada um entra ao serviço, com quem não tem dono no
    // fim — apesar de o «Abrir o espaço» começar às 08:00, antes de toda a
    // gente.
    const nomes = await page
      .getByRole("group", { name: "Grelha do dia, por responsável" })
      .getByRole("region")
      .evaluateAll((rs) => rs.map((r) => r.getAttribute("aria-label")));
    expect(nomes).toEqual([
      "Coluna de Ana Silva",
      "Coluna de Sofia",
      "Coluna de Rui",
      "Coluna de Sem responsável",
    ]);

    // ── 1. A ALTURA É A DURAÇÃO ───────────────────────────────────────────
    const montagem = await caixa(bloco(page, "Ana Silva", "Montagem do arco"));
    const cerimonia = await caixa(bloco(page, "Rui", "Cerimónia"));
    const flores = await caixa(bloco(page, "Sofia", "Flores na mesa"));

    console.log(
      `[medido] montagem 180 min → ${montagem.height} px · cerimónia 45 min → ${cerimonia.height} px · flores 30 min → ${flores.height} px`,
    );
    expect(Math.abs(montagem.height - 180 * PX_POR_MINUTO)).toBeLessThanOrEqual(FOLGA);
    expect(Math.abs(cerimonia.height - 45 * PX_POR_MINUTO)).toBeLessThanOrEqual(FOLGA);
    expect(Math.abs(flores.height - 30 * PX_POR_MINUTO)).toBeLessThanOrEqual(FOLGA);
    // E a proporção lê-se: quatro cerimónias cabem numa montagem.
    expect(montagem.height / cerimonia.height).toBeGreaterThan(3.5);

    // ── 2. O INSTANTE VÊ-SE, E NÃO MEDE ZERO ──────────────────────────────
    const brinde = await caixa(bloco(page, "Rui", "Brinde dos noivos"));
    console.log(`[medido] brinde (instante, sem duração) → ${brinde.height} px`);
    expect(brinde.height).toBeGreaterThan(12);
    // …e continua a NÃO ser um bloco com duração: mede menos do que o degrau
    // mais pequeno da lista (15 min), portanto nunca se confunde com um.
    expect(brinde.height).toBeLessThan(30 * PX_POR_MINUTO);

    // ── 3. A MADRUGADA FICA EM BAIXO ──────────────────────────────────────
    const festa = await caixa(bloco(page, "Rui", "Festa"));
    const encerramento = await caixa(bloco(page, "Rui", "Encerramento"));
    console.log(
      `[medido] montagem y=${montagem.y} · festa 23:00 y=${festa.y} · encerramento 02:00 y=${encerramento.y}`,
    );
    expect(encerramento.y).toBeGreaterThan(festa.y);
    expect(festa.y).toBeGreaterThan(montagem.y);
    // Encostam: a festa das 23:00 dura 3 h e acaba às 02:00, que é onde o
    // encerramento começa.
    expect(Math.abs(encerramento.y - (festa.y + festa.height))).toBeLessThanOrEqual(FOLGA);

    // ── 4. O CHOQUE FICA AO LADO, E COM A PALAVRA ─────────────────────────
    const prova = await caixa(bloco(page, "Ana Silva", "Prova de bolo"));
    const coluna = await caixa(page.getByRole("region", { name: "Coluna de Ana Silva" }));
    console.log(
      `[medido] coluna da Ana ${coluna.width} px · montagem x=${montagem.x} w=${montagem.width} · prova x=${prova.x} w=${prova.width}`,
    );
    // Os dois carris não se cruzam: um começa onde o outro acaba.
    expect(montagem.x + montagem.width).toBeLessThanOrEqual(prova.x + FOLGA);
    // E os dois são mais estreitos do que a coluna — é a coluna a repartir-se,
    // que é o sinal de que ali há duas coisas ao mesmo tempo.
    expect(montagem.width).toBeLessThan(coluna.width * 0.6);
    // A cor nunca é o único portador: a palavra está lá, nos dois blocos.
    await expect(
      page
        .getByRole("region", { name: "Coluna de Ana Silva" })
        .getByText("Choque", { exact: true }),
    ).toHaveCount(2);

    // E a frase inteira é o nome acessível — não um código.
    await expect(
      page.getByText(
        "Ana Silva · Montagem do arco · 09:00 às 12:00, 3 h — Choque: a mesma pessoa em dois sítios ao mesmo tempo",
      ),
    ).toHaveCount(1);
  });

  test.describe("a 390 px, de pé numa quinta", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("a coluna das horas fica presa mesmo com a grelha a rolar para o lado", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await abrirAGrelha(page);

      const grelha = page.getByRole("group", { name: "Grelha do dia, por responsável" });
      const medidas = await grelha.evaluate((el) => ({
        largura: el.clientWidth,
        conteudo: el.scrollWidth,
      }));
      console.log(
        `[medido a 390] caixa da grelha ${medidas.largura} px · conteúdo ${medidas.conteudo} px · quatro colunas`,
      );
      // Com quatro pessoas o conteúdo não cabe: é PRECISO rolar. É a decisão
      // deste ecrã — encolher até caber dava colunas de 57 px, onde um título
      // não escreve uma palavra inteira.
      expect(medidas.conteudo).toBeGreaterThan(medidas.largura);

      /**
       * ── E O ROLO É DA CAIXA, NUNCA DA PÁGINA ──────────────────────────
       *
       * Esta linha nasceu de uma medição que falhou. A caixa da grelha media
       * 432 px dentro de um ecrã de 390: o painel do guião é um item de uma
       * grelha, um item de grelha nasce com `min-width: auto`, e a largura
       * mínima da grelha do dia (48 + 4×96) esticava o painel e arrastava a
       * PÁGINA para um rolo horizontal. A grelha ficava com o aspecto certo e
       * o ecrã inteiro passava a abanar para o lado — o defeito que a Parte 16
       * do sistema de design proíbe pelo nome.
       *
       * Nada disto se vê a ler o código, e nenhum teste de unidade lhe chega.
       */
      const overflow = await page.evaluate(() => {
        const limite = document.documentElement.clientWidth;
        const culpados: string[] = [];
        /** Dentro de um contentor com rolo próprio, passar do limite é o que se
            pretende — é o rolo da grelha. Só interessa quem estica a PÁGINA. */
        const dentroDeUmRolo = (el: HTMLElement) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === "auto" || o === "scroll" || o === "hidden") return true;
          }
          return false;
        };
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= limite + 1) continue;
          if (dentroDeUmRolo(el)) continue;
          culpados.push(
            `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)} → right ${Math.round(r.right)}`,
          );
        }
        return {
          px: document.documentElement.scrollWidth - limite,
          limite,
          culpados: culpados.slice(0, 6),
        };
      });
      console.log(
        `[medido a 390] rolo horizontal da PÁGINA: ${overflow.px} px (tem de ser 0). Quem passa dos ${overflow.limite}: ${overflow.culpados.join(" | ") || "ninguém"}`,
      );
      expect(overflow.px, `passam do limite: ${overflow.culpados.join(" | ")}`).toBeLessThanOrEqual(
        1,
      );

      /**
       * Uma hora que SÓ existe na coluna das horas.
       *
       * «08:00» seria a escolha óbvia — e é a errada: o «Abrir o espaço»
       * também começa às 08:00 e escreve essa hora dentro do bloco, portanto o
       * localizador apanhava dois elementos e o `.first()` dependia da ordem do
       * documento. Às 11:00 não começa nada neste dia.
       */
      const hora = grelha.getByText("11:00", { exact: true });
      const antes = await caixa(hora);

      // Rola até ao fim, que é o pior caso possível.
      await grelha.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await expect(async () => {
        const agora = await grelha.evaluate((el) => el.scrollLeft);
        expect(agora).toBeGreaterThan(0);
      }).toPass({ timeout: 5_000 });

      const depois = await caixa(hora);
      const caixaDaGrelha = await caixa(grelha);
      console.log(
        `[medido a 390] «08:00» antes de rolar x=${antes.x} · depois de rolar até ao fim x=${depois.x} (a caixa começa em ${caixaDaGrelha.x})`,
      );
      // A hora não se mexeu, e continua encostada à esquerda da caixa: era esta
      // a coluna que um rolo lateral fazia desaparecer.
      await expect(hora).toBeVisible();
      expect(Math.abs(depois.x - antes.x)).toBeLessThanOrEqual(FOLGA);
      expect(depois.x - caixaDaGrelha.x).toBeLessThanOrEqual(FOLGA);

      // E a última pessoa ficou à vista — que é o que o rolo foi lá buscar.
      await expect(page.getByRole("region", { name: "Coluna de Sem responsável" })).toBeVisible();
    });

    test("cada coluna cabe com palavras lá dentro, e não só com cor", async ({ page }) => {
      test.setTimeout(240_000);
      await abrirAGrelha(page);

      const coluna = await caixa(page.getByRole("region", { name: "Coluna de Rui" }));
      const cerimonia = await caixa(bloco(page, "Rui", "Cerimónia"));
      console.log(
        `[medido a 390] coluna ${coluna.width} px · bloco da cerimónia ${cerimonia.width}×${cerimonia.height} px`,
      );
      // O chão de 96 px é o que separa «cabe uma palavra» de «cabe uma cor».
      expect(coluna.width).toBeGreaterThanOrEqual(96 - FOLGA);
      // E o título está mesmo desenhado, não só no nome acessível.
      await expect(
        page.getByRole("region", { name: "Coluna de Rui" }).getByText("Cerimónia", { exact: true }),
      ).toBeVisible();
    });
  });
});
