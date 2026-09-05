import { defineConfig, devices } from "@playwright/test";
import { ESTADO_ADMIN } from "./e2e/estado-admin";

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
  /**
   * ── SÓ OS `*.spec.ts` SÃO PASSEIOS ───────────────────────────────────────
   *
   * Por omissão o Playwright recolhe `*.spec.ts` E `*.test.ts`. Nesta casa a
   * segunda extensão é do vitest, e desde que os ajudantes do `e2e/` passaram a
   * ter testes de unidade (`caca/harness.rotulos.test.ts`) havia ficheiros aqui
   * dentro que importam `vitest` — que o Playwright tentava carregar e rebentava
   * antes de correr passeio nenhum:
   *
   *     Error: Vitest cannot be imported in a CommonJS module using require().
   *        at caca/harness.rotulos.test.ts:1
   *
   * Um passo inteiro do CI vermelho sem um único teste ter chegado a correr.
   * Dizer aqui o que é um passeio resolve-o na origem, e vale para qualquer
   * teste de unidade que venha a nascer nesta pasta.
   */
  testMatch: "**/*.spec.ts",
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
  //
  // Os seis ficheiros a seguir saíram daqui pela razão que está escrita por
  // extenso em `playwright.dados.config.ts`: precisam de UM PEDIDO gravado, e
  // este servidor de produção recusa escritas sem Supabase. Enquanto cá
  // estiveram, dez dos seus passeios SALTAVAM («Sem pedidos nesta instalação»)
  // e dois falhavam dentro do passo `continue-on-error` — doze testes que
  // nunca correram e cuja ausência ninguém via. Correm agora em
  // `npm run test:e2e:dados`, contra um servidor que grava.
  testIgnore: [
    "**/passkeys.spec.ts",
    "**/upload-medicao.spec.ts",
    "**/biblioteca-temas.spec.ts",
    "**/carregamento-movel.spec.ts",
    "**/fazer-proposta-cliente.spec.ts",
    "**/nav-estudio-marca.spec.ts",
    "**/proposta-rascunho.spec.ts",
    "**/temas.spec.ts",
    "**/caca/a02-editor-stress.spec.ts",
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Entra uma vez e guarda a sessão. A razão por extenso está no próprio
    // ficheiro: o tecto de oito entradas por minuto é do produto e está certo,
    // e uma suite que entra trinta vezes tranca-se sozinha à porta.
    { name: "sessao", testMatch: /sessao-admin\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium",
      testIgnore: ["**/*.setup.ts"],
      use: { ...devices["Desktop Chrome"], storageState: ESTADO_ADMIN },
      dependencies: ["sessao"],
    },
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
