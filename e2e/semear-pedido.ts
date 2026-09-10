import { expect, test, type Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A SEMENTE: UM PEDIDO NA LISTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Meia dúzia de passeios do back office não começam do nada: precisam de UM
 * pedido gravado. O estúdio abre-se a partir de um cartão de cliente, a
 * checklist de carregamento gera-se a partir de um evento, o seletor de temas
 * só existe dentro de uma proposta. Sem pedido nenhum, esses passeios não
 * chegam sequer ao ecrã que dizem medir.
 *
 * O armazém em ficheiro (`data/*.json`) NÃO é versionado — é lixo de execução,
 * não uma fixture —, portanto numa clonagem limpa não existe sequer e a lista
 * de pedidos começa vazia. Logo, quem precisa de um pedido CRIA-O, pela mesma
 * porta por onde entra um pedido verdadeiro: o `POST /api/orcamento` que o
 * formulário público usa. É o molde que o `proposta-fluxos.spec.ts` já seguia;
 * este ficheiro é esse molde partilhado, para não haver seis cópias a divergir.
 *
 * ── PORQUE É QUE ISTO EXIGE UM SERVIDOR QUE GRAVE ─────────────────────────
 * O `Repository.assertWritableInProd()` recusa TODA a escrita num servidor de
 * produção sem Supabase (`src/lib/repository.ts`) — gravar para um ficheiro
 * efémero seria perder dados em silêncio no próximo deploy. O CI arranca
 * `npm run start`, ou seja, produção sem Supabase. Por isso os passeios que
 * usam esta semente correm com config e servidor próprios (ver
 * `playwright.dados.config.ts`), exactamente como as passkeys, os fluxos de
 * proposta e a ergonomia táctil já corriam.
 *
 * ── E PORQUE É QUE FALHA EM VEZ DE SALTAR ─────────────────────────────────
 * Um `test.skip("sem pedidos nesta instalação")` é cobertura imaginária: o
 * passo fica verde e nunca exercitou nada. Foi o que aconteceu durante meses a
 * doze passeios desta suite. Aqui, se não se conseguir semear, o teste FALHA
 * com a razão à vista.
 */

/**
 * Sempre o mesmo `submissionId`: a rota é idempotente por ele
 * (`quoteIdFor(submissionId)`), portanto correr isto mil vezes deixa UM pedido
 * na lista e não mil. Também é o que torna o id previsível entre corridas.
 */
const SUBMISSION_ID = "e2e-semente-de-pedido";

/** O que o formulário público envia. Os campos são os mínimos do schema. */
function payload(nome: string) {
  return {
    form: {
      name: nome,
      email: "semente.e2e@example.pt",
      phone: "912345678",
      category: "particulares",
      eventType: "casamentos",
      eventName: "Casamento",
      date: "2027-06-10",
      guests: 120,
      location: "Herdade da Maridona, Glória",
    },
    // O honeypot vazio — um visitante verdadeiro nunca o preenche.
    website: "",
    submissionId: SUBMISSION_ID,
  };
}

/**
 * O login do back office, com a distinção que o `biblioteca-temas.spec.ts` já
 * fazia e que vale para todos: fora do CI, uma máquina sem `ADMIN_PASSWORD_HASH`
 * não entra e o passeio salta-se — é o que permite corrê-lo à mão sem montar
 * nada. No CI o segredo ESTÁ definido (ver ci.yml), portanto não entrar é uma
 * avaria e não uma condição do ambiente.
 */
export function exigirLogin(entrou: boolean): void {
  if (process.env.CI) {
    expect(entrou, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(true);
  } else {
    test.skip(!entrou, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
  }
}

/**
 * Entra no back office, à prova da hidratação.
 *
 * ── O que isto resolve, e que custou duas corridas a perceber ─────────────
 * Os passeios enchiam o formulário e clicavam mal a página chegava. Só que o
 * HTML chega antes do JavaScript: nessa janela o botão está DESENHADO e não
 * tem manípulo nenhum, e o clique não faz nada — nem sequer um pedido no
 * registo do servidor. O passeio seguia, esperava vinte segundos pelo painel e
 * concluía «não entrou», que se lê como «falta o ADMIN_PASSWORD_HASH» e manda
 * quem lê procurar um problema de configuração que não existe.
 *
 * Esperar por `/api/admin/passkeys/entrada` é a prova de que o cliente já está
 * a correr: esse pedido é feito por um efeito do ecrã de entrada, portanto se
 * ele partiu, o React montou. Só depois se escreve e se clica.
 *
 * Insiste no máximo DUAS vezes, e nunca mais: cada tentativa falhada com
 * credenciais erradas gasta o contador por conta da rota (5 em 5 minutos), e
 * uma suite que insiste é uma suite que se tranca a si própria à porta.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESPERA QUE A CORTINA DE ENTRADA SAIA DA FRENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A cortina («Decoramos eventos, eternizamos memórias.») cobre o ecrã inteiro
 * enquanto a página carrega. Enquanto lá está, TUDO o que está por baixo conta
 * como invisível para o Playwright — e um clique num elemento que existe fica à
 * espera até esgotar o tempo, com a mensagem enganadora «element is not
 * visible».
 *
 * ── PORQUE É QUE ISTO APARECEU AGORA ─────────────────────────────────────
 *
 * O `geometria-dos-alvos` ficou instável: a primeira tentativa morria a
 * esperar por uma linha da tabela, e a REPETIÇÃO passava os onze pontos da
 * rolagem sem uma queixa. Fui ao rasto e li os retratos: aos 85% do percurso a
 * cortina ainda lá estava, inteira. Não era o teste que estava errado — era o
 * ecrã que ainda não tinha sido entregue.
 *
 * A cortina sai quando a sua animação acaba (2,25 s). Só que uma animação de
 * CSS **não progride enquanto a página não está à vista**, e num CI com vários
 * contextos, ou nesta máquina com trabalho a mais, isso acontece. A cortina não
 * está avariada: está à espera da sua vez, e o teste não sabia disso.
 *
 * ── PORQUE É QUE ISTO NÃO ENFRAQUECE TESTE NENHUM ────────────────────────
 *
 * Porque não se salta nada nem se afrouxa uma asserção: espera-se pela MARCA
 * que o próprio `Cortina.tsx` põe na raiz do documento quando se levanta
 * (`data-cortina="fora"`). É o mesmo sinal por que o guarda do vidro já espera,
 * pela mesma razão e depois do mesmo engano — lá, o que ele media era a cortina
 * em vez da barra.
 *
 * Vive aqui, no ajudante que TODOS os passeios usam para entrar, e não num
 * teste só: a espera é boa para todos e o defeito podia aparecer em qualquer um.
 */
export async function esperarQueACortinaSaia(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const c = document.querySelector(".cortina");
        // Sem cortina no documento também não há nada a tapar — é o caso de
        // quem pediu menos movimento, em que ela nem chega a ser desenhada.
        return !c || document.documentElement.getAttribute("data-cortina") === "fora";
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {
      // Não se atira: se ela ficar mesmo presa, quem chamou vai falhar a
      // seguir com a sua própria mensagem, que diz mais do que esta.
    });
}

export async function entrarNoBackOffice(page: Page): Promise<boolean> {
  const painel = page.getByRole("navigation", { name: /Navegação do back office/i });

  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const clienteVivo = page
      .waitForResponse((r) => r.url().includes("/api/admin/passkeys/entrada"), { timeout: 60_000 })
      .catch(() => null);
    await page.goto("/orcamento/admin");
    await esperarQueACortinaSaia(page);

    // Já autenticado (sessão de um passo anterior): o painel abre directo.
    if (
      await painel
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      return true;
    }

    await clienteVivo;

    /*
      ── O FORMULÁRIO PASSOU A ESTAR FECHADO ──────────────────────────────

      O `docs/LOGIN.md` deu ao ecrã de entrada dois estados: por omissão só a
      chave de acesso, e a palavra-passe atrás de um link. É a correcção que
      tira os dois botões de largura total a competir — mas para quem entra por
      aqui muda o percurso: já não se preenche um formulário que está à vista,
      abre-se primeiro.

      O link só existe quando o browser sabe o que é uma chave de acesso. Onde
      não sabe, o formulário é a única porta e já está aberto — daí o `count()`.
    */
    await page
      .getByRole("button", { name: /^Entrar com palavra-passe$/ })
      .click({ timeout: 5_000 })
      .catch(() => {});

    // «Email» e não «O teu email»: o rótulo encurtou na mesma ronda. O `^…$`
    // evita casar com «Email da tua conta», do formulário de recuperação.
    const email = page.getByLabel(/^Email$/i);
    if ((await email.count()) === 0) continue;

    await email.fill("catarina@liquen-events.com");
    // Pelo `name` e não pelo rótulo: «Palavra-passe» é partilhado com o botão
    // de mostrar/ocultar.
    await page.locator('input[name="password"]').fill("liquen2026");
    // «Entrar», e não «Entrar com palavra-passe» — esse nome é agora do link
    // que abre o formulário, e o botão que submete diz só o verbo.
    await page.getByRole("button", { name: /^Entrar$/ }).click();

    const dentro = await painel
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    // A entrada troca de ecrã, e a cortina pode voltar com ele.
    if (dentro) {
      await esperarQueACortinaSaia(page);
      return true;
    }
  }
  return false;
}

/**
 * O primeiro pedido da lista, ou `null` se a lista estiver vazia.
 *
 * `GET /api/orcamento` é só para admin — daí ter de vir sempre depois do login.
 * O `page.request` partilha as cookies do contexto, mas a sessão acabada de
 * nascer demora um instante a lá chegar: medido, uma listagem feita logo a
 * seguir ao login apanha 401. Isso não é «não há pedidos» — é «ainda não sou
 * ninguém» —, e tratá-lo como lista vazia mandava criar um pedido a mais.
 */
async function primeiroPedido(page: Page): Promise<string | null> {
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const res = await page.request.get("/api/orcamento");
    if (res.status() === 401) {
      await page.waitForTimeout(300);
      continue;
    }
    if (!res.ok()) return null;
    const lista: unknown = await res.json();
    if (!Array.isArray(lista) || lista.length === 0) return null;
    const id = (lista[0] as { id?: unknown })?.id;
    return typeof id === "string" && id ? id : null;
  }
  throw new Error(
    "GET /api/orcamento respondeu 401 dez vezes seguidas — a sessão do back office não chegou ao contexto de pedidos.",
  );
}

/**
 * Garante que existe um pedido na lista e devolve o id do primeiro.
 *
 * Reaproveita o que já lá está antes de criar: além de ser mais rápido, é o
 * que mantém a suite dentro do tecto de 5 pedidos por minuto por IP que a rota
 * impõe (`rateLimit` em `src/app/api/orcamento/route.ts`) — um tecto que está
 * certo e que não se mexe por causa de testes. Quando vários trabalhadores
 * semeiam ao mesmo tempo e um leva 429, espera-se pelo pedido do vizinho em vez
 * de insistir.
 *
 * TEM de ser chamado depois do login (a listagem é autenticada).
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ID DA SEMENTE — E NÃO O DO PRIMEIRO PEDIDO DA LISTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `garantirPedido` devolve o id do PRIMEIRO pedido da lista, e é isso que o
 * torna barato: reaproveita em vez de criar, e assim a suite não bate no tecto
 * de cinco pedidos por minuto que a rota impõe. Enquanto houver UM pedido só,
 * o primeiro é a semente e ninguém dá pela diferença.
 *
 * Deixou de haver um só. Esta suite tem passeios que criam pedidos próprios (o
 * do nome de 300 caracteres, por exemplo), e com dois na lista o «primeiro»
 * pode ser o outro. O que acontece a partir daí é silencioso e caríssimo de
 * diagnosticar: o passeio ESCREVE num pedido pela API e ABRE outro no ecrã,
 * porque a linha da lista procura-se pelo NOME.
 *
 * Foi assim que o passeio dos guiões apareceu vermelho com uma cara que não era
 * a dele — «Remover 09:00 Montagem» a casar com dois botões. A leitura óbvia
 * era «o modelo está a ser aplicado duas vezes»; a verdade era que a limpeza
 * tinha ido para o pedido errado e nunca chegou ao que estava a ser aberto.
 *
 * Quem escreve pela API e abre pelo nome tem de usar isto, para os dois lados
 * falarem do mesmo pedido — haja um na lista ou vinte.
 */
export async function idDaSemente(page: Page, nome = "Semente E2E"): Promise<string> {
  /**
   * ── E LÊ-SE COM A TEIMOSIA DO `primeiroPedido`, PELA MESMA RAZÃO ──────────
   *
   * Isto lia a lista UMA VEZ. Em local passava sempre; no CI falhava — e a
   * frase que saía («nenhum pedido «Semente E2E» na lista») acusava o produto
   * de não ter um pedido que TEM. O que não existia era a RESPOSTA: esta rota
   * devolve 401 enquanto a sessão não assenta, e o `primeiroPedido`, aqui em
   * cima, já repete por causa disso — este não repetia.
   *
   * É o mesmo engano de tratar uma resposta que ainda não chegou como uma
   * resposta que diz que não. A mensagem de falha continua a listar o que
   * ESTAVA lá, que é o que distingue os dois casos quando voltar a acontecer.
   */
  let nomes: string[] = [];
  for (let tentativa = 0; tentativa < 12; tentativa += 1) {
    const res = await page.request.get("/api/orcamento");
    if (res.ok()) {
      const lista = (await res.json()) as { id?: string; name?: string }[];
      if (Array.isArray(lista)) {
        nomes = lista.map((q) => String(q?.name ?? "?"));
        const semente = lista.find((q) => (q.name ?? "").includes(nome));
        if (semente?.id) return semente.id;
      }
    }
    await page.waitForTimeout(400);
  }
  expect(
    false,
    `nenhum pedido «${nome}» na lista depois de 12 leituras — o que lá estava: ${JSON.stringify(nomes)}`,
  ).toBe(true);
  throw new Error("inalcançável");
}

export async function garantirPedido(page: Page, nome = "Semente E2E"): Promise<string> {
  const existente = await primeiroPedido(page);
  if (existente) return existente;

  const res = await page.request.post("/api/orcamento", { data: payload(nome) });
  if (res.ok()) {
    const id = (await res.json())?.id;
    expect(typeof id === "string" && id.length > 0, "o POST /api/orcamento devolveu um id").toBe(
      true,
    );
    // ── E RECARREGAR, QUE NÃO É DETALHE ────────────────────────────────────
    // O back office lê a lista de pedidos UMA VEZ, ao montar. Quem chamou isto
    // já entrou, portanto já tem uma lista pintada — e essa lista não sabe do
    // pedido que acabou de nascer. Sem recarregar, o ecrã diz «Ainda não há
    // pedidos» com o pedido gravado em disco, e o passeio falha num seletor que
    // está certo (`li button` não encontrado), a apontar para o sítio errado.
    // Foi exactamente esta a primeira falha da suite depois de passar a semear.
    if (!page.url().startsWith("about:")) await page.reload();
    return id as string;
  }

  // Não gravou. Ou outro trabalhador esgotou o tecto de pedidos no mesmo
  // minuto (e o pedido dele serve-nos), ou o servidor recusa escritas.
  const corpo = await res.text().catch(() => "");
  for (let tentativa = 0; tentativa < 30; tentativa += 1) {
    await page.waitForTimeout(1000);
    const tardio = await primeiroPedido(page);
    if (tardio) return tardio;
  }

  throw new Error(
    `Não foi possível semear um pedido: POST /api/orcamento respondeu ${res.status()}.\n` +
      `Resposta: ${corpo.slice(0, 300)}\n\n` +
      `A causa habitual é o servidor ser um build de PRODUÇÃO sem Supabase: o ` +
      `Repository recusa toda a escrita (assertWritableInProd, src/lib/repository.ts). ` +
      `Estes passeios correm com servidor próprio — ver playwright.dados.config.ts.`,
  );
}
