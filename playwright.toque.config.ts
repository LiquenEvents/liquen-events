import { defineConfig, devices } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PIXEL MEXE-SE? — a medição do toque, num browser a sério
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um teste em jsdom diz que a classe lá está. Não diz que o elemento encolhe:
 * o jsdom não compila CSS, não avalia media queries e não tem `:active`. Toda
 * a armadilha desta casa — `transition-[transform]` não cobre `scale` — é
 * invisível a um teste desses, porque a classe ESTÁ LÁ e na mesma não anima.
 *
 * Este passeio põe o rato EM BAIXO sobre o elemento e lê o `scale` computado.
 *
 * ── CONFIGURAÇÃO PRÓPRIA, E PORQUÊ ────────────────────────────────────────
 *
 * A configuração principal arranca com o projecto `sessao`, que ENTRA no back
 * office e precisa do `ADMIN_PASSWORD_HASH`. Isto não precisa de entrar em
 * lado nenhum: mede o ecrã de entrada (que é público) e um banco de amostras
 * montado com as classes LIDAS DA FONTE. Depender da sessão era pintar de
 * vermelho, num ambiente sem o segredo, uma medição que não tem nada que ver
 * com autenticação.
 *
 * ── DOIS TAMANHOS, E OS DOIS CONTAM ───────────────────────────────────────
 *
 * «Eu não quero só no iPhone, eu também quero no desktop.» 1440 é o portátil
 * dela; 390 é o telemóvel. O toque é o canal que serve os DOIS, e é por isso
 * que se mede nos dois: uma regra escondida atrás de um `lg:` passaria por
 * boa num só.
 */
const PORT = Number(process.env.PORT_TOQUE ?? 3111);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/resposta-ao-toque.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    {
      name: "computador-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "telemovel-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `PORT=${PORT} npm run dev`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
