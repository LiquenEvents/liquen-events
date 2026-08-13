import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the critical user journeys. Run with `npm run test:e2e`.
 *
 * The browser binary is downloaded with `npx playwright install chromium`.
 * Locally we reuse a running `npm run dev`; in CI we build and start the
 * production server for a realistic run.
 */
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // As passkeys correm à parte, em `playwright.passkeys.config.ts`. A razão
  // está lá escrita: precisam de GRAVAR, e o servidor de produção que este
  // ficheiro arranca recusa escritas sem Supabase — de propósito.
  //
  // A medição do carregamento também corre à parte, em
  // `playwright.medicao.config.ts`, e esse ficheiro diz de si próprio «fica
  // fora do CI de propósito» — só que dizê-lo lá não bastava: o `testDir`
  // daqui varre a pasta toda, e o `--grep-invert` do CI não a apanha (a
  // etiqueta é `@medicao`). Resultado: corria a cada passagem e rebentava com
  // `ECONNREFUSED 127.0.0.1:54321`, à procura do Storage de teste que só a
  // config dela arranca. Não é sequer um teste — não tem `expect`s de valor, é
  // um instrumento que escreve um JSON —, portanto um vermelho dela não quer
  // dizer nada, e um vermelho que não quer dizer nada é um vermelho que se
  // aprende a ignorar.
  testIgnore: ["**/passkeys.spec.ts", "**/upload-medicao.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
