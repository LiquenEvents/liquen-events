// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";
import { MARCA_DE_SESSAO } from "./entrada-destino";
import SessaoExpirada, { caminhoDoPedido, ehSessaoExpirada } from "./SessaoExpirada";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SESSÃO CAI A MEIO — E O QUE ESTAVA ESCRITO TEM DE CONTINUAR LÁ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A ferida deste projecto é uma proposta perdida. Estes testes prendem as duas
 * metades da resposta:
 *
 *  · o painel abre onde tem de abrir (uma sessão morta) e NÃO abre onde seria um
 *    susto (uma palavra-passe errada à entrada);
 *  · e ao reautenticar não se desmonta nada — o que estava escrito por trás
 *    continua no DOM, e o trabalho por gravar é gravado a seguir.
 */

const passkeys = vi.hoisted(() => ({
  entrar: vi.fn(async (_opcoes?: unknown) => {}),
  // Ligável por teste: o botão do aparelho só existe onde há passkeys, e a
  // maioria destes testes quer o painel na forma simples, só com a senha.
  suporta: false,
}));
vi.mock("@/lib/passkeys-cliente", () => ({
  suportaPasskeys: () => passkeys.suporta,
  // As opções passam à frente TAL E QUAL: é nelas que viaja o `manterSessao`,
  // e um duplo que as deitasse fora deixava passar o defeito que o teste da
  // validade da sessão apanha mais abaixo.
  entrarComDispositivo: (opcoes?: unknown) => passkeys.entrar(opcoes),
  mensagemDeErro: () => "falhou",
}));

// ── As peças puras ─────────────────────────────────────────────────────────

describe("de que pedido é esta resposta", () => {
  const ORIGEM = "https://liquen-events.com";

  it("percebe as várias formas de dizer um endereço ao `fetch`", () => {
    expect(caminhoDoPedido("/api/tarefas", ORIGEM)).toBe("/api/tarefas");
    expect(caminhoDoPedido(`${ORIGEM}/api/tarefas?x=1`, ORIGEM)).toBe("/api/tarefas");
    expect(caminhoDoPedido(new URL(`${ORIGEM}/api/tarefas`), ORIGEM)).toBe("/api/tarefas");
    expect(caminhoDoPedido({ url: `${ORIGEM}/api/tarefas` }, ORIGEM)).toBe("/api/tarefas");
  });

  it("ignora o que não é nosso", () => {
    // Um 401 de um serviço de terceiros não diz nada sobre a nossa sessão.
    expect(caminhoDoPedido("https://outra-casa.example/api/x", ORIGEM)).toBeNull();
    expect(caminhoDoPedido(undefined, ORIGEM)).toBeNull();
    expect(caminhoDoPedido(123, ORIGEM)).toBeNull();
  });
});

describe("esta resposta quer dizer «a sessão acabou»?", () => {
  it("sim para as rotas do back office", () => {
    expect(ehSessaoExpirada("/api/tarefas", 401)).toBe(true);
    expect(ehSessaoExpirada("/api/propostas/LQ-1", 403)).toBe(true);
  });

  it("NÃO para as rotas de entrada — aí um 401 é uma palavra-passe errada", () => {
    // Sem esta linha, escrever mal a palavra-passe no ecrã de entrada abria um
    // painel a dizer «a tua sessão expirou». É a diferença entre um erro de
    // escrita e uma catástrofe.
    expect(ehSessaoExpirada("/api/admin/login", 401)).toBe(false);
    expect(ehSessaoExpirada("/api/admin/passkeys/entrada", 401)).toBe(false);
    expect(ehSessaoExpirada("/api/admin/recuperar", 401)).toBe(false);
    expect(ehSessaoExpirada("/api/admin/logout", 401)).toBe(false);
  });

  it("NÃO para o resto", () => {
    expect(ehSessaoExpirada("/api/tarefas", 200)).toBe(false);
    expect(ehSessaoExpirada("/api/tarefas", 500)).toBe(false);
    expect(ehSessaoExpirada("/pt/orcamento/admin", 401)).toBe(false);
    expect(ehSessaoExpirada(null, 401)).toBe(false);
    expect(ehSessaoExpirada("/api/tarefas", undefined)).toBe(false);
  });
});

// ── O painel ───────────────────────────────────────────────────────────────

/** Um pedaço de back office com trabalho por trás, para se ver se sobrevive. */
function montar() {
  return render(
    <ToastProvider>
      <RegistoDeGravacoesProvider>
        <textarea defaultValue="o parágrafo que estava a ser escrito" aria-label="Rascunho" />
        <SessaoExpirada />
      </RegistoDeGravacoesProvider>
    </ToastProvider>,
  );
}

let respostas: number[] = [];
beforeEach(() => {
  respostas = [];
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const status = respostas.shift() ?? 200;
      return { ok: status < 400, status, json: async () => ({}) } as unknown as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o painel de reautenticação", () => {
  it("marca a aba como tendo tido sessão, para o ecrã de entrada saber explicar-se", () => {
    montar();
    expect(sessionStorage.getItem(MARCA_DE_SESSAO)).not.toBeNull();
  });

  it("está calado enquanto a sessão vale", async () => {
    montar();
    await fetch("/api/tarefas");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("abre ao primeiro 401 de uma rota do back office", async () => {
    montar();
    respostas = [401];
    await fetch("/api/tarefas");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/A tua sessão expirou/i)).toBeInTheDocument();
  });

  it("o que estava a ser escrito continua lá enquanto o painel está aberto", async () => {
    montar();
    respostas = [401];
    await fetch("/api/tarefas");
    await screen.findByRole("dialog");
    // É isto, e só isto, que separa este desenho do redireccionamento seco que
    // desmontava o back office inteiro.
    expect(screen.getByLabelText("Rascunho")).toHaveValue("o parágrafo que estava a ser escrito");
  });

  it("entrar outra vez fecha o painel sem mexer no que estava escrito", async () => {
    const u = userEvent.setup();
    montar();
    respostas = [401];
    await fetch("/api/tarefas");
    await screen.findByRole("dialog");

    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(document.querySelector('input[name="password"]')!, "uma-senha-qualquer{Enter}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Rascunho")).toHaveValue("o parágrafo que estava a ser escrito");
  });

  it("uma palavra-passe errada no painel não o fecha nem se cala", async () => {
    const u = userEvent.setup();
    montar();
    respostas = [401];
    await fetch("/api/tarefas");
    await screen.findByRole("dialog");

    respostas = [401];
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(document.querySelector('input[name="password"]')!, "errada{Enter}");
    // Pelo texto e não por `role="alert"`: o `ToastProvider` mantém sempre uma
    // região `alert` vazia no DOM, e o selector apanhava as duas.
    expect(await screen.findByText(/Credenciais incorretas/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sair de propósito apaga a marca — não é uma sessão expirada", async () => {
    montar();
    await fetch("/api/admin/logout", { method: "POST" });
    await waitFor(() => expect(sessionStorage.getItem(MARCA_DE_SESSAO)).toBeNull());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * REAUTENTICAR NÃO PODE PROMOVER A SESSÃO.
 *
 * O servidor lê a AUSÊNCIA de `manterSessao` como `true`, por
 * retrocompatibilidade com separadores antigos. Enquanto este painel não
 * mandava o campo, quem tinha recusado a sessão longa à entrada — que é a
 * omissão — saía daqui com um cookie de 30 dias, no aparelho que anda para
 * fora de casa. Estes testes prendem a escolha nas duas portas: a
 * palavra-passe e o aparelho.
 */
describe("a validade da sessão que sai da reautenticação", () => {
  async function abrirPainel() {
    montar();
    respostas = [401];
    await fetch("/api/tarefas");
    await screen.findByRole("dialog");
  }

  /** O corpo do último `POST /api/admin/login` que o painel enviou. */
  function corpoDaEntrada() {
    const chamadas = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const entrada = [...chamadas].reverse().find((c) => c[0] === "/api/admin/login");
    return JSON.parse(String((entrada?.[1] as { body?: string })?.body ?? "{}"));
  }

  it("por omissão NÃO pede os 30 dias — vai `manterSessao: false`, e não em branco", async () => {
    const u = userEvent.setup();
    await abrirPainel();
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(document.querySelector('input[name="password"]')!, "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Em branco não serve: é precisamente o que o servidor lê como `true`.
    expect(corpoDaEntrada()).toHaveProperty("manterSessao", false);
  });

  it("marcada a caixa, pede-os", async () => {
    const u = userEvent.setup();
    await abrirPainel();
    await u.click(screen.getByRole("checkbox", { name: /Manter a sessão iniciada 30 dias/i }));
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(document.querySelector('input[name="password"]')!, "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(corpoDaEntrada()).toHaveProperty("manterSessao", true);
  });

  it("a mesma escolha vai pela porta do aparelho", async () => {
    const u = userEvent.setup();
    passkeys.entrar.mockClear();
    passkeys.suporta = true;
    try {
      await abrirPainel();
      await u.click(await screen.findByRole("button", { name: /Entrar com este dispositivo/i }));
    } finally {
      passkeys.suporta = false;
    }
    await waitFor(() => expect(passkeys.entrar).toHaveBeenCalled());
    expect(passkeys.entrar).toHaveBeenCalledWith({ manterSessao: false });
  });
});
