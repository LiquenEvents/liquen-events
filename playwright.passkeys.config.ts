import { defineConfig, devices } from "@playwright/test";

/**
 * As passkeys, de ponta a ponta — com o seu próprio servidor.
 *
 * ── Porque é que não corre com os outros ──────────────────────────────────
 * O `playwright.config.ts` arranca, em CI, o servidor de PRODUÇÃO (`npm run
 * start`). E o `Repository` recusa escritas em produção quando o Supabase não
 * está configurado — de propósito: escrever para um ficheiro efémero seria
 * perder dados em silêncio no próximo deploy. O CI não tem Supabase, portanto
 * o registo de um dispositivo nunca chegaria a gravar lá.
 *
 * A saída óbvia era pôr o teste a saltar quando a gravação é recusada. Seria
 * uma suite verde que nunca exercitou nada — a mesma armadilha em que este
 * projecto já caiu (o job E2E com `continue-on-error`, a regra de semgrep que
 * não compilava). Por isso o teste corre contra um servidor de
 * desenvolvimento, onde o armazém em ficheiro é o comportamento pretendido e
 * não um sinal de má configuração.
 *
 * O que se perde: não se prova o comportamento do BUILD de produção. Aceita-se
 * — o que aqui se prova é um protocolo de autenticação (assinaturas reais de um
 * autenticador real, verificadas pelo servidor a sério), e isso não muda entre
 * builds. Todo o resto do E2E continua a correr contra produção.
 *
 * Porta própria, para poder correr ao lado da outra suite sem lhe tocar.
 */
const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/passkeys.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // O ecrã de entrada tem de aceitar a palavra-passe de desenvolvimento
      // para se poder chegar ao registo — que exige sessão, e é o ponto todo.
      SESSION_SECRET: "e2e-passkeys-session-secret-not-for-production-use",
    },
  },
});
