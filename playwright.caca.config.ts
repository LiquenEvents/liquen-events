import { defineConfig, devices } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CAÇA — configuração própria
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Separada da `playwright.config.ts` por três razões:
 *
 *  1. GRAVA TUDO. Vídeo e trace em todos os percursos, não só nas repetições.
 *     Um bug de interacção sem vídeo é uma frase que ninguém consegue seguir.
 *  2. SEIS APARELHOS. O mesmo percurso corre em desktop e em telemóvel, porque
 *     é aí que estão os defeitos que ninguém vê: o que cabe a 1440 não cabe a
 *     375, e o que se clica com o rato não se acerta com o dedo.
 *  3. NÃO REPETE. `retries: 0` de propósito — uma falha intermitente é um
 *     achado, e repetir até passar é a maneira de a esconder.
 *
 * O `executablePath` existe porque a versão do Playwright fixada no
 * package.json procura um chromium mais recente do que o que está instalado
 * nesta máquina. Sem isto, nenhum percurso arranca.
 */

const PORT = Number(process.env.CACA_PORT || 3000);
const baseURL = `http://localhost:${PORT}`;

/** O chromium que existe nesta máquina (o pinned não está descarregado). */
const chromium = process.env.CACA_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const comum = {
  baseURL,
  trace: "retain-on-failure" as const,
  video: "retain-on-failure" as const,
  screenshot: "only-on-failure" as const,
  // `--no-sandbox`: o contentor onde isto corre é root, e o chromium recusa
  // arrancar sem isto. É condição do ambiente de teste, não da aplicação.
  launchOptions: { executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] },
};

export default defineConfig({
  testDir: "./e2e/caca",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  // Zero repetições: uma falha intermitente é um achado, não ruído a limpar.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "caca-resultados.json" }],
    ["html", { open: "never", outputFolder: "caca-relatorio" }],
  ],
  outputDir: "caca-artefactos",
  projects: [
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], ...comum, viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop-1920",
      use: { ...devices["Desktop Chrome"], ...comum, viewport: { width: 1920, height: 1080 } },
    },
    // Os telemóveis que a equipa usa. O SE é o pior caso de largura e é onde
    // quase tudo o que parte, parte.
    //
    // `browserName: "chromium"` é OBRIGATÓRIO aqui: os perfis de iPhone do
    // Playwright trazem `defaultBrowserType: "webkit"`, e o webkit não está
    // instalado nesta máquina. Sem esta linha, todos os percursos móveis
    // morrem no arranque com "browser has been closed" — que se lê como um
    // defeito da aplicação e não é.
    // 375px — o iPhone SE de 2.ª/3.ª geração, que é o que a equipa tem. O perfil
    // `devices["iPhone SE"]` do Playwright é o de PRIMEIRA geração, 320px, e a
    // diferença não é cosmética: num calendário de sete colunas são 36px por
    // dia contra 45px, ou seja, o lado errado da regra dos 44.
    {
      name: "iphone-se",
      use: {
        ...devices["iPhone SE"],
        ...comum,
        browserName: "chromium",
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: "iphone-15",
      use: {
        ...devices["iPhone 13 Pro"],
        ...comum,
        browserName: "chromium",
        viewport: { width: 393, height: 852 },
      },
    },
    {
      name: "pixel-8",
      use: {
        ...devices["Pixel 5"],
        ...comum,
        browserName: "chromium",
        viewport: { width: 412, height: 915 },
      },
    },
    { name: "ipad", use: { ...devices["iPad (gen 7)"], ...comum, browserName: "chromium" } },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
