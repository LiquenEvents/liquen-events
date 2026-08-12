import { defineConfig, devices } from "@playwright/test";

/**
 * A MEDIÇÃO DO CARREGAMENTO — instrumento, não suite.
 *
 * Corre sozinha, contra o servidor de desenvolvimento e o Storage de teste
 * (`scripts/supabase-de-teste.mjs`), com a rede e o CPU estrangulados de dentro
 * do próprio passeio. Fica fora do CI de propósito: demora dezenas de minutos e
 * o que produz é um JSON para se ler, não um verde ou um vermelho.
 *
 *   node scripts/supabase-de-teste.mjs &
 *   SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=x npx next dev --port 3311 &
 *   MEDICAO_ETIQUETA=antes npx playwright test --config playwright.medicao.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: [process.env.MEDICAO_SPEC ?? "**/upload-medicao.spec.ts"],
  grep: process.env.MEDICAO_GREP ? new RegExp(process.env.MEDICAO_GREP) : undefined,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60 * 60_000,
  use: { baseURL: "http://localhost:3311", trace: "off", video: "off" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // O binário desta máquina. O `channel`/download automático não serve:
        // a medição corre onde estiver o Chromium instalado.
        launchOptions: {
          executablePath:
            process.env.CHROMIUM_BIN ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        },
      },
    },
  ],
});
