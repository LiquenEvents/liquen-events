import { test, expect } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEM REDE, O ECRÃ VOLTA VIVO — E NÃO SÓ DESENHADO @semrede
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `public/sw.js` guarda o invólucro das páginas para que uma visita sem rede
 * ainda veja o sítio. Isso é metade da promessa. A outra metade é que o que
 * volta esteja VIVO: se o JavaScript não pegar, o que aparece é uma fotografia
 * do ecrã — o menu não abre, nada responde, e quem está do outro lado não
 * consegue ir a sítio nenhum.
 *
 * ── PORQUE É QUE ISTO PASSOU A TER UM GUARDA PRÓPRIO ─────────────────────
 *
 * Ninguém media esta metade. O único passeio que recarregava sem rede era o do
 * carregamento no telemóvel (`carregamento-movel.spec.ts`), e mede outra coisa
 * — que a marcação não se perde. Quando o `next dev` deixou de hidratar uma
 * página vinda da cache do service worker (ver o comentário lá, com as
 * medições), esse passeio ficou vermelho e a pergunta «mas o produto está
 * bom?» não tinha ninguém para a responder. Passa a ter, e no sítio certo:
 * contra o servidor de PRODUÇÃO, que é o que ela usa.
 *
 * ── O QUE SE MEDE, E PORQUE É ISTO E NÃO A FIBRA DO REACT ────────────────
 *
 * Mediu-se primeiro a presença de fibras do React nos nós do DOM. Funciona,
 * mas é uma pergunta sobre a máquina e não sobre a promessa — e um dia em que
 * o React mude o nome da propriedade, o guarda passa a dizer que o site está
 * morto sem estar. O que se mede é o BOTÃO DO MENU: carrega-se nele e exige-se
 * que o menu abra. Se o ecrã voltou morto, não abre. É a mesma avaria, vista
 * pelo lado de quem a sofre.
 *
 * (A cortina de entrada foi a primeira candidata e não serve: `data-cortina`
 * já vem `"fora"` no HTML de uma segunda visita, com ou sem hidratação. Foi
 * medido nos dois servidores antes de se escolher o botão.)
 */

// O telemóvel é onde o menu é um botão em vez de uma fila de links — e é o
// aparelho de quem está sem rede numa quinta.
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  // Página pública: a sessão de administração da configuração não faz aqui
  // falta nenhuma, e sem ela o passeio não depende de haver back office.
  storageState: { cookies: [], origins: [] },
});

test.describe("sem rede, o ecrã volta vivo @semrede", () => {
  test("uma página recarregada sem rede continua a responder ao menu", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    // O `ServiceWorkerRegister` só registra em produção, e é lá que este
    // passeio corre. Registar à mão de qualquer maneira torna-o determinista e
    // não muda o que se prova: o ficheiro registado é o `public/sw.js` de
    // verdade, o mesmo que o produto usa.
    const controlado = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      try {
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        // O `claim()` acontece no `activate`; até lá esta página ainda não é
        // controlada, e uma navegação não controlada não vai para a cache.
        for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return Boolean(navigator.serviceWorker.controller);
      } catch {
        return false;
      }
    });
    expect(controlado, "o service worker de produção (public/sw.js) tomou conta da página").toBe(
      true,
    );

    // Uma passagem ONLINE já sob o service worker: é ela que põe o invólucro e
    // os pacotes na cache. Sem isto não há nada para servir depois.
    await page.reload();
    await page.waitForLoadState("load");

    const botao = page.getByRole("button", { name: /menu/i });
    await expect(botao, "o botão do menu existe no telemóvel").toBeVisible();

    // ── E agora sem rede ────────────────────────────────────────────────────
    await context.setOffline(true);
    await page.reload();

    // Primeiro: veio a página a sério, e não o `offline.html` nem a raiz.
    await expect(page).toHaveTitle(/Líquen/);
    await expect(botao, "o botão do menu voltou com a página").toBeVisible();

    // Depois: está vivo. Este é o coração do guarda.
    await botao.click();
    await expect(
      botao,
      "carregou-se no botão do menu e ele não abriu — a página voltou desenhada mas morta",
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: /galeria/i })
        .first(),
      "o menu abriu mas sem os links para se ir a algum sítio",
    ).toBeVisible();

    await context.setOffline(false);
  });
});
