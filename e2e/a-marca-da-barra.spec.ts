import { test, expect } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MARCA AO MEIO DA BARRA — E A CAIXA VAZIA QUE SOBREVIVEU A TRÊS RONDAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Ela pediu a marca maior três vezes seguidas. Das três, eu subi
 * o número da altura — 32 → 48 → 64 — e das três ela voltou a dizer que estava
 * pequena. À terceira mandou também «e mais ao meio», e foi essa a pista que me
 * fez medir em vez de continuar a somar.
 *
 * O ficheiro tinha 3747 × 2238, e o desenho lá dentro 2146 × 1084: **57% da
 * largura e 48% da altura**. Metade da caixa era transparência. Portanto:
 *
 *   · a altura que o CSS pedia era a da TELA, e o desenho saía com menos de
 *     metade dela — `h-16` dava 31 px de marca;
 *   · e o desenho nem sequer estava centrado na sua própria tela (65 px à
 *     direita, 99 px acima), por isso centrar a tela na barra deixava a marca
 *     ao lado do meio, sem nada no CSS que o explicasse.
 *
 * As duas queixas dela, uma só causa, e nenhuma no número que eu andava a
 * mexer. Este passeio é o que impede a mesma caixa vazia de voltar a entrar
 * sem ninguém dar por ela: mede o DESENHO, não o ficheiro.
 */

/** Quanto do ficheiro é desenho, e onde está o centro do desenho nele. */
async function medirATinta(page: import("@playwright/test").Page, url: string) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let minx = c.width;
    let maxx = -1;
    let miny = c.height;
    let maxy = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        // Desenho = píxel que se vê: opaco o bastante e não quase-branco.
        if (d[i + 3] > 16 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) {
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
      }
    }
    /**
     * ── E ONDE ESTÁ A FOLHA EM RELAÇÃO À PALAVRA ───────────────────────────
     *
     * A marca é EMPILHADA: o símbolo por cima, «LÍQUEN EVENTS» por baixo. Corta-
     * se pela linha vazia mais alta entre os dois e mede-se cada metade.
     */
    const tinta = (x: number, y: number) => {
      const i = (y * c.width + x) * 4;
      return d[i + 3] > 16 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245);
    };
    const centroDe = (y0: number, y1: number) => {
      let a = c.width;
      let b = -1;
      for (let y = y0; y < y1; y++)
        for (let x = 0; x < c.width; x++)
          if (tinta(x, y)) {
            if (x < a) a = x;
            if (x > b) b = x;
          }
      return b < 0 ? null : (a + b) / 2;
    };
    let corte = miny;
    let melhor = -1;
    for (let y = miny; y <= maxy; y++) {
      let vazia = true;
      for (let x = 0; x < c.width && vazia; x++) if (tinta(x, y)) vazia = false;
      if (!vazia) continue;
      let fim = y;
      while (fim <= maxy) {
        let v = true;
        for (let x = 0; x < c.width && v; x++) if (tinta(x, fim)) v = false;
        if (!v) break;
        fim++;
      }
      if (fim - y > melhor) {
        melhor = fim - y;
        corte = Math.round((y + fim) / 2);
      }
      y = fim;
    }
    const simbolo = centroDe(miny, corte);
    const palavra = centroDe(corte, maxy + 1);

    return {
      tela: { w: c.width, h: c.height },
      fracaoLargura: (maxx - minx + 1) / c.width,
      fracaoAltura: (maxy - miny + 1) / c.height,
      desvioX: ((minx + maxx) / 2 - c.width / 2) / c.width,
      desvioY: ((miny + maxy) / 2 - c.height / 2) / c.height,
      /** Quanto é que a folha desvia do centro da palavra, em fracção da tela. */
      simboloVsPalavra: simbolo === null || palavra === null ? null : (simbolo - palavra) / c.width,
    };
  }, url);
}

test.describe("a marca da barra do back office @movimento", () => {
  test("o desenho enche a caixa e está no meio da barra", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pt/orcamento/admin");

    const marca = page.locator('header img[src*="logo-liquen-marca"]').first();
    await marca.waitFor({ state: "visible" });

    const url = await marca.evaluate((el) => (el as HTMLImageElement).currentSrc);
    const tinta = await medirATinta(page, url);

    /**
     * 1. O FICHEIRO É QUASE TODO DESENHO.
     *
     * É esta a asserção que apanha a avaria de origem. Com o ficheiro antigo
     * dava 0,57 e 0,48 — e a barra parecia ter a marca a metade do tamanho que
     * o CSS dizia, sem nenhuma explicação visível no CSS.
     */
    expect(
      tinta.fracaoLargura,
      `só ${(tinta.fracaoLargura * 100).toFixed(0)}% da largura do ficheiro é desenho — ` +
        "o resto é transparência, e a altura que o CSS pede aplica-se à caixa toda, " +
        "não ao que se vê",
    ).toBeGreaterThan(0.9);
    expect(
      tinta.fracaoAltura,
      `só ${(tinta.fracaoAltura * 100).toFixed(0)}% da altura do ficheiro é desenho`,
    ).toBeGreaterThan(0.9);

    /**
     * 2. E O DESENHO ESTÁ CENTRADO NO SEU PRÓPRIO FICHEIRO.
     *
     * Sem isto, `justify-center` centra uma caixa cujo conteúdo está de lado, e
     * a marca fica ao lado do meio para sempre. Era a segunda metade do «mais
     * ao meio» dela.
     */
    expect(
      Math.abs(tinta.desvioX),
      `o desenho está ${(tinta.desvioX * 100).toFixed(1)}% ao lado do centro do ficheiro`,
    ).toBeLessThan(0.02);
    expect(
      Math.abs(tinta.desvioY),
      `o desenho está ${(tinta.desvioY * 100).toFixed(1)}% acima/abaixo do centro do ficheiro`,
    ).toBeLessThan(0.02);

    /**
     * 2b. E A FOLHA ESTÁ POR CIMA DA PALAVRA, NÃO AO LADO DELA.
     *
     * Esta é a que ela viu e eu não. Depois de o ficheiro estar recortado e
     * centrado, mandou outra fotografia: «o logo não está bem ao meio». Fui
     * medir as duas metades em separado, e o desvio do RECORTE era de 2 px —
     * invisível. O que ela estava a ver era outro, e maior:
     *
     *     centro da palavra «LÍQUEN EVENTS» .... 450
     *     centro do símbolo (a folha) .......... 354
     *     ─────────────────────────────────────────
     *     a folha, 96 px à esquerda ............ 10,6% da largura da palavra
     *
     * Num logótipo empilhado é a PALAVRA que define a largura, portanto centrar
     * o conjunto centra a palavra — e a folha, que é onde o olho pousa
     * primeiro, fica pendurada para um lado. O conjunto lê-se torto mesmo
     * estando, à letra, ao meio.
     *
     * Ela decidiu alinhar a folha por cima da palavra, só no ficheiro do back
     * office. Isto guarda essa decisão.
     */
    expect(
      tinta.simboloVsPalavra,
      "não se conseguiu separar o símbolo da palavra — a medida deixou de medir",
    ).not.toBeNull();
    expect(
      Math.abs(tinta.simboloVsPalavra!),
      `a folha está ${(tinta.simboloVsPalavra! * 100).toFixed(1)}% da largura ao lado do ` +
        "centro da palavra — o conjunto lê-se torto mesmo estando centrado",
    ).toBeLessThan(0.01);

    /**
     * 3. E A CAIXA ESTÁ AO MEIO DO ESPAÇO QUE TEM — QUE NÃO É O MEIO DA BARRA.
     *
     * ── ESTE CASO MUDOU DE REGRA, E A RAZÃO ESTÁ MEDIDA ──────────────────
     *
     * Guardava «ao meio da BARRA», com uma tolerância de 2 px. Ela olhou para
     * o cabeçalho e escreveu «coloca mais para o lado esquerdo o logo».
     *
     * MEDIDO a 1440, no Calendário, com a sessão aberta:
     *
     *     o título ................ 40 → 204
     *     os comandos ............. 979 → 1400
     *     o vazio entre os dois ... 204 → 979, com o meio nos 591
     *     a marca ................. 665 → 776, com o meio nos 720
     *
     * A marca estava ao meio da barra, à letra. E lia-se torta: os comandos da
     * direita pesam 421 px contra os 164 do título, portanto o meio dos 1440
     * encosta-a ao lado cheio e abre um buraco do lado do título.
     *
     * A regra nova é a que ela pediu: ao meio do VAZIO. E é isso que se mede
     * aqui — não um número fixo, que dependia da vista, mas a distância ao
     * ponto médio entre onde o título acaba e onde os comandos começam.
     *
     * A tolerância é de 24 px e não de 2, e é uma decisão e não desleixo: o CSS
     * consegue isto com uma margem em percentagem (`pe-[18%]`, ver o
     * `AdminClient.tsx`), que é o que faz a conta escalar do ecrã de 1024 ao de
     * 1920 sem um número escrito à mão por cada um. Uma percentagem aproxima o
     * meio do vazio; não o acerta ao píxel em todas as larguras. O que este
     * guarda tem de impedir é a marca voltar ao meio da BARRA — e isso são
     * 129 px de distância, cinco vezes a tolerância.
     */
    const barra = page.locator("header").first();
    const caixaDaBarra = (await barra.boundingBox())!;
    const caixaDaMarca = (await marca.boundingBox())!;
    const centroDaMarca = caixaDaMarca.x + caixaDaMarca.width / 2;

    const fimDoTitulo = await page.evaluate(() => {
      const cab = document.querySelector("header");
      const t = cab?.querySelector("h1, h2");
      return t ? t.getBoundingClientRect().right : null;
    });
    const inicioDosComandos = await page.evaluate(() => {
      const cab = document.querySelector("header");
      if (!cab) return null;
      const controlos = [...cab.querySelectorAll("button, a")]
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        // Só os da metade direita: o título também pode ser um botão.
        .filter((r) => r.left > cab.getBoundingClientRect().width / 2);
      return controlos.length ? Math.min(...controlos.map((r) => r.left)) : null;
    });

    expect(fimDoTitulo, "não se achou o título da vista — a medida deixou de medir").not.toBeNull();
    expect(
      inicioDosComandos,
      "não se acharam os comandos da direita — a medida deixou de medir",
    ).not.toBeNull();

    const meioDoVazio = (fimDoTitulo! + inicioDosComandos!) / 2;
    const centroDaBarra = caixaDaBarra.x + caixaDaBarra.width / 2;
    expect(
      Math.abs(centroDaMarca - meioDoVazio),
      `a marca está a ${Math.abs(centroDaMarca - meioDoVazio).toFixed(1)} px do meio do vazio ` +
        `(título acaba aos ${fimDoTitulo!.toFixed(0)}, comandos começam aos ${inicioDosComandos!.toFixed(0)})`,
    ).toBeLessThan(24);

    /* E o controlo negativo do mesmo fôlego: se alguém devolver a marca ao meio
       da barra, isto tem de acusar. Sem esta linha, uma tolerância de 24 px num
       vazio estreito podia deixar passar as duas posições. */
    expect(
      Math.abs(centroDaMarca - centroDaBarra),
      "a marca voltou ao meio da BARRA — ela pediu-a ao meio do vazio, ver o `AdminClient.tsx`",
    ).toBeGreaterThan(24);

    /**
     * 4. E VÊ-SE. Um número que se pede em CSS e que agora É o que se vê.
     */
    expect(
      caixaDaMarca.height,
      `a marca ficou com ${caixaDaMarca.height.toFixed(0)} px de altura — ela pediu-a maior três vezes`,
    ).toBeGreaterThan(48);

    /** E não estoira a barra: a barra é a moldura do painel inteiro. */
    expect(
      caixaDaMarca.height,
      "a marca é mais alta do que a barra que a segura",
    ).toBeLessThanOrEqual(caixaDaBarra.height);
  });
});
