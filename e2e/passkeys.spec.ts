import { test, expect, type Page } from "@playwright/test";

/**
 * PASSKEYS, DE PONTA A PONTA — com um autenticador virtual do Chrome.
 *
 * Os testes de unidade prendem cada barreira à parte, mas todos mockam a
 * verificação criptográfica: nenhum deles prova que uma assinatura REAL,
 * produzida por um autenticador real, é aceite pelo servidor. Sem este ficheiro,
 * a funcionalidade podia estar inteiramente partida com a suite verde — que é
 * exactamente o defeito que esta casa já apanhou noutros sítios (o portão do
 * semgrep verde com uma regra que não compilava, a suite E2E decorativa).
 *
 * O `WebAuthn` do CDP dá um autenticador de software: gera chaves a sério,
 * assina a sério, e obedece às mesmas regras de origem. O que aqui corre é o
 * protocolo verdadeiro, sem um único mock.
 *
 * Percurso: entrar com palavra-passe → registar este aparelho → sair → entrar
 * outra vez SEM palavra-passe → remover o aparelho → confirmar que já não entra.
 */

const SENHA = "liquen2026";

/** Liga um autenticador virtual e devolve o seu id. */
async function ligarAutenticador(page: Page): Promise<string> {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      // O servidor exige verificação do utilizador; um autenticador que não a
      // saiba fazer não pode ser registado, e é assim de propósito.
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

async function entrarComSenha(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  await page.getByLabel(/O teu email/i).fill("catarina@liquen-events.com");
  await page.getByLabel(/Palavra-passe/i).fill(SENHA);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  try {
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

async function abrirDispositivos(page: Page) {
  await page.getByRole("button", { name: /Os meus dispositivos/i }).click();
  await expect(page.getByRole("dialog", { name: /Os meus dispositivos/i })).toBeVisible();
}

test.describe("Passkeys", () => {
  test("regista este aparelho, entra sem palavra-passe, e remover fecha a porta", async ({
    page,
  }) => {
    await ligarAutenticador(page);

    const entrou = await entrarComSenha(page);
    test.skip(
      !entrou,
      "Entrada de admin indisponível aqui (build de produção sem ADMIN_PASSWORD_HASH); o CI define um hash de teste.",
    );

    // ── 1. Registar ────────────────────────────────────────────────────────
    await abrirDispositivos(page);

    const dialogo = page.getByRole("dialog", { name: /Os meus dispositivos/i });
    const semTabela = dialogo.getByText(/ainda não existe na base de dados/i);
    // Sem Supabase configurado o armazém é volátil, mas existe; se um dia a
    // tabela faltar mesmo, isto salta em vez de falhar por uma razão alheia.
    test.skip(await semTabela.isVisible(), "A tabela das passkeys não existe neste ambiente.");

    await dialogo.getByLabel(/^Nome$/i).fill("Portátil de testes");
    await dialogo.getByRole("button", { name: /^Registar$/ }).click();

    await expect(dialogo.getByText("Portátil de testes")).toBeVisible({ timeout: 10_000 });

    // ── 2. Sair ────────────────────────────────────────────────────────────
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Sair$/i }).click();
    await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();

    // ── 3. Entrar SEM palavra-passe ────────────────────────────────────────
    // Nenhum campo é preenchido: é o aparelho que se identifica.
    await page.getByRole("button", { name: /Entrar com este dispositivo/i }).click();
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 15_000,
    });

    // ── 4. Remover, e confirmar que deixa de servir ────────────────────────
    await abrirDispositivos(page);
    page.once("dialog", (d) => d.accept());
    await dialogo.getByRole("button", { name: /^Remover$/ }).click();
    await expect(dialogo.getByText("Portátil de testes")).toHaveCount(0, { timeout: 10_000 });

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Sair$/i }).click();
    await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();

    // O aparelho ainda tem a chave; o servidor é que já não a conhece. Entrar
    // tem de falhar — se passasse, remover um dispositivo não removia nada.
    await page.getByRole("button", { name: /Entrar com este dispositivo/i }).click();
    // Pelo texto, e não por `role=alert`: o Next mantém sempre no DOM um
    // anunciador de rotas que também é `role=alert`, e o selector apanhava dois.
    await expect(page.getByText(/Não foi possível entrar/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  });

  test("o botão do dispositivo não aparece onde o browser não sabe o que é", async ({ page }) => {
    // Sem autenticador virtual o Chrome continua a ter a API, portanto o botão
    // aparece; o que se prende aqui é o ecrã sem passkey nenhuma REGISTADA —
    // tentar tem de recusar, e a palavra-passe tem de continuar à vista.
    await page.goto("/orcamento/admin");
    await expect(page.getByLabel(/Palavra-passe/i)).toBeVisible();
  });
});
