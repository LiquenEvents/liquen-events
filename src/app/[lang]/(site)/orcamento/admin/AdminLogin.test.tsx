// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/components/LocaleProvider";
import { pickChromeDict } from "@/lib/i18n";
import { pt } from "@/lib/i18n/pt";
import { MARCA_DE_SESSAO } from "./entrada-destino";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PORTA DO BACK OFFICE — o que não pode voltar a estar como estava
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada teste aqui corresponde a uma coisa que foi pedida e que se perde com
 * facilidade numa reorganização do ecrã: a ORDEM (o aparelho primeiro), o
 * caminho de quem trocou de telemóvel (que não existia de todo), e o guarda do
 * regresso à página pedida — esse é o único que, se cair, não se vê no ecrã.
 *
 * O que NÃO se prova aqui é a criptografia das passkeys: isso é o
 * `e2e/passkeys.spec.ts`, com um autenticador a sério. Aqui o módulo do cliente
 * é simulado, porque o que se mede é o ecrã.
 */

const DICT = pickChromeDict(pt);

const passkeys = vi.hoisted(() => ({
  suporta: true,
  autofill: false,
  entrar: vi.fn(async (o?: unknown) => o),
  armado: [] as unknown[],
  desarmado: 0,
}));

vi.mock("@/lib/passkeys-cliente", () => ({
  suportaPasskeys: () => passkeys.suporta,
  suportaAutofillDePasskeys: async () => passkeys.autofill,
  entrarComDispositivo: (o?: unknown) => passkeys.entrar(o),
  cancelarCerimonia: () => {},
  mensagemDeErro: (e: unknown) => (e as { message?: string })?.message ?? "falhou",
  armarEntradaAutomatica: (o: unknown) => {
    passkeys.armado.push(o);
    return () => {
      passkeys.desarmado += 1;
    };
  },
}));

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// O `next/image` faz trabalho que não é o desta suite (o carregador, o
// `srcset`); aqui basta o elemento estar lá para o resto do cartão se desenhar.
vi.mock("next/image", () => ({
  default: (p: Record<string, unknown>) => <span data-logotipo={String(p.alt ?? "")} />,
}));

const AdminLogin = (await import("./AdminLogin")).default;

/** Um `fetch` que regista o que lhe mandaram e responde o que se lhe disser. */
let pedidos: { url: string; body: Record<string, unknown> }[] = [];
function servir(resposta: { ok: boolean; status?: number; body?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      pedidos.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return {
        ok: resposta.ok,
        status: resposta.status ?? (resposta.ok ? 200 : 401),
        json: async () => resposta.body ?? {},
      };
    }),
  );
}

function montar() {
  return render(
    <LocaleProvider locale="pt" dict={DICT}>
      <AdminLogin />
    </LocaleProvider>,
  );
}

/**
 * O campo da palavra-passe, pelo `name`.
 *
 * Não por `getByLabelText(/Palavra-passe/)`: o botão de mostrar/ocultar tem
 * «palavra-passe» no nome acessível — de propósito, é o que o torna utilizável
 * com leitor de ecrã — e o selector apanhava os dois.
 */
function campoDaSenha(): HTMLInputElement {
  return document.querySelector('input[name="password"]')!;
}

function irPara(url: string) {
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  pedidos = [];
  passkeys.suporta = true;
  passkeys.autofill = false;
  passkeys.armado = [];
  passkeys.desarmado = 0;
  passkeys.entrar.mockClear();
  router.replace.mockClear();
  router.refresh.mockClear();
  sessionStorage.clear();
  irPara("/pt/orcamento/admin");
  servir({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── Bloco 2: o aparelho é o caminho principal ──────────────────────────────

describe("a ordem dos dois caminhos", () => {
  it("o aparelho vem ANTES da palavra-passe no documento", () => {
    montar();
    const aparelho = screen.getByRole("button", { name: /Entrar com este dispositivo/i });
    const senha = screen.getByRole("button", { name: /Entrar com palavra-passe/i });
    // `DOCUMENT_POSITION_FOLLOWING` = o segundo vem depois do primeiro. É a
    // ordem do DOM, que é a que manda para o teclado e para o leitor de ecrã —
    // e não a ordem visual, que uma folha de estilos pode desmentir.
    expect(aparelho.compareDocumentPosition(senha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o botão do aparelho é o principal e o da palavra-passe o secundário", () => {
    montar();
    const aparelho = screen.getByRole("button", { name: /Entrar com este dispositivo/i });
    const senha = screen.getByRole("button", { name: /Entrar com palavra-passe/i });
    // A cor cheia (`bg-[#4d6350]`) é o peso de primário desta casa; a
    // alternativa fica com o contorno.
    expect(aparelho.className).toContain("bg-[#4d6350]");
    // 28% e não 15%: a 15% o contorno lia-se como DESACTIVADO (o estado
    // desactivado é este mesmo desenho com `opacity-45` por cima). Ver a nota
    // no `Button.tsx`.
    expect(senha.className).toContain("border-foreground/28");
  });

  it("sem passkeys no browser, a palavra-passe volta a ser o botão principal", () => {
    passkeys.suporta = false;
    montar();
    expect(
      screen.queryByRole("button", { name: /Entrar com este dispositivo/i }),
    ).not.toBeInTheDocument();
    // É a única porta que resta: não pode estar desenhada como alternativa de
    // coisa nenhuma.
    expect(screen.getByRole("button", { name: /Entrar com palavra-passe/i }).className).toContain(
      "bg-[#4d6350]",
    );
  });

  it("a explicação do aparelho cabe numa linha", () => {
    montar();
    const linha = screen.getByText(/Com o rosto, a impressão digital ou o PIN/i);
    // Eram três frases. O tecto aqui é do TAMANHO do texto, que é a medida que
    // não depende de quem o escreve.
    expect(linha.textContent!.length).toBeLessThan(70);
  });
});

describe("a passkey proposta sem se carregar em nada", () => {
  it("o campo do email convida o autofill do WebAuthn", () => {
    montar();
    // `webauthn` TEM de ser o último valor: fora do fim, a norma manda o browser
    // ignorá-lo, e a proposta nunca aparece.
    expect(screen.getByLabelText(/O teu email/i)).toHaveAttribute(
      "autocomplete",
      "username webauthn",
    );
  });

  it("arma a entrada automática onde o browser a sabe fazer", async () => {
    passkeys.autofill = true;
    montar();
    await waitFor(() => expect(passkeys.armado).toHaveLength(1));
  });

  it("não arma nada onde o browser não a sabe fazer", async () => {
    passkeys.autofill = false;
    montar();
    await waitFor(() => expect(screen.getByLabelText(/O teu email/i)).toBeInTheDocument());
    expect(passkeys.armado).toHaveLength(0);
  });
});

describe("o caminho inverso: registar um aparelho novo", () => {
  it("a página de entrada diz como se regista um telemóvel novo", () => {
    montar();
    expect(screen.getByText(/Mudaste de telemóvel ou de computador/i)).toBeInTheDocument();
    // As duas metades da resposta: entra-se pela palavra-passe, e o sítio tem
    // nome. Sem a segunda, «entra e regista» não diz onde.
    const bloco = screen.getByText(/Mudaste de telemóvel/i).parentElement!;
    expect(bloco.textContent).toMatch(/palavra-passe/i);
    expect(bloco.textContent).toMatch(/Os meus dispositivos/i);
  });
});

// ── Bloco 3: o formulário ──────────────────────────────────────────────────

describe("o formulário", () => {
  it("os dois campos obrigatórios estão marcados como obrigatórios", () => {
    montar();
    // Era só a palavra-passe a ter asterisco, com os dois a serem obrigatórios.
    expect(screen.getByLabelText(/O teu email/i)).toBeRequired();
    expect(campoDaSenha()).toBeRequired();
  });

  it("mostrar/ocultar troca o tipo do campo da palavra-passe", async () => {
    const u = userEvent.setup();
    montar();
    const campo = campoDaSenha();
    expect(campo).toHaveAttribute("type", "password");
    await u.click(screen.getByRole("button", { name: /Mostrar a palavra-passe/i }));
    expect(campo).toHaveAttribute("type", "text");
    await u.click(screen.getByRole("button", { name: /Ocultar a palavra-passe/i }));
    expect(campo).toHaveAttribute("type", "password");
  });

  it("o foco começa no primeiro campo", () => {
    montar();
    expect(document.activeElement).toBe(screen.getByLabelText(/O teu email/i));
  });

  it("o Enter no campo do email submete", async () => {
    const u = userEvent.setup();
    montar();
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer");
    // De volta ao PRIMEIRO campo, e Enter dali: é o gesto de quem corrige o
    // email depois de escrever tudo.
    screen.getByLabelText(/O teu email/i).focus();
    await u.keyboard("{Enter}");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].url).toBe("/api/admin/login");
  });

  it("dois Enter seguidos não fazem dois envios", async () => {
    const u = userEvent.setup();
    // Uma resposta que nunca chega: é durante a espera que o duplo envio
    // acontece na vida real.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        pedidos.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return new Promise(() => {});
      }),
    );
    montar();
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    await u.keyboard("{Enter}");
    expect(pedidos).toHaveLength(1);
    expect(screen.getByRole("button", { name: /A verificar/i })).toBeDisabled();
  });
});

// ── Bloco 6: depois de entrar ──────────────────────────────────────────────

describe("manter a sessão iniciada", () => {
  /**
   * VEM DESLIGADA, e é isso que este bloco prende.
   *
   * A razão está no `MANTER_SESSAO_POR_OMISSAO`, no componente: uma caixa
   * pré-marcada não é uma escolha, e com a passkey o custo de voltar a entrar
   * passou a ser um toque. O teste existe para a omissão não voltar a ligar-se
   * por acidente — numa ferramenta com dados de clientes, isso é uma alteração
   * de segurança que tem de ser deliberada e não um efeito lateral.
   */
  it("vem DESLIGADA, com a duração escrita por extenso", () => {
    montar();
    const caixa = screen.getByRole("checkbox", { name: /Manter a sessão iniciada/i });
    expect(caixa).not.toBeChecked();
    // O número, e não «manter-me com sessão iniciada» — uma promessa sem número
    // é lida por cada pessoa como lhe apetecer.
    expect(screen.getByText(/Manter a sessão iniciada 30 dias/i)).toBeInTheDocument();
  });

  it("explica o que se escolhe, e só isso — a omissão não gasta linhas", async () => {
    const u = userEvent.setup();
    montar();
    // Desligada é a omissão: não leva explicação nenhuma. As linhas custam
    // ~36 px, e o botão de submeter está a 831 px de uma dobra de 844 no
    // telemóvel — ver a nota no componente.
    expect(screen.queryByText(/um mês é muito tempo/i)).not.toBeInTheDocument();
    // Ligá-la é a escolha, e é a que tem consequência.
    await u.click(screen.getByRole("checkbox", { name: /Manter a sessão iniciada/i }));
    expect(screen.getByText(/um mês é muito tempo/i)).toBeInTheDocument();
  });

  it("desligada, é isso que vai no pedido de entrada", async () => {
    const u = userEvent.setup();
    montar();
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].body.manterSessao).toBe(false);
  });

  it("ligá-la vai no pedido de entrada", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("checkbox", { name: /Manter a sessão iniciada/i }));
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].body.manterSessao).toBe(true);
  });

  it("e vale também na entrada pelo aparelho", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: /Entrar com este dispositivo/i }));
    await waitFor(() => expect(passkeys.entrar).toHaveBeenCalled());
    expect(passkeys.entrar).toHaveBeenCalledWith({ manterSessao: false });
  });
});

describe("voltar à página que se tentava abrir", () => {
  it("segue um destino interno do back office", async () => {
    const u = userEvent.setup();
    irPara("/pt/orcamento/admin?destino=%2Fpt%2Forcamento%2Fadmin%2Fevento%2FLQ-7");
    montar();
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith("/pt/orcamento/admin/evento/LQ-7");
  });

  it("NÃO segue um destino para fora desta casa", async () => {
    const u = userEvent.setup();
    // Este é o teste que interessa: se ele cair, o ecrã de entrada passa a ser
    // um trampolim de phishing e nada no ecrã o denuncia.
    irPara("/pt/orcamento/admin?destino=https%3A%2F%2Fliquen-eventos.com%2Fentrar");
    montar();
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sem destino, fica onde está e volta a pedir a página ao servidor", async () => {
    const u = userEvent.setup();
    montar();
    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("a sessão que expirou", () => {
  it("explica-se, em vez de aparecer um formulário sem razão", () => {
    sessionStorage.setItem(MARCA_DE_SESSAO, "1");
    montar();
    expect(screen.getByText(/A tua sessão expirou/i)).toBeInTheDocument();
    // E a marca é gasta: recarregar a página outra vez não repete o susto.
    expect(sessionStorage.getItem(MARCA_DE_SESSAO)).toBeNull();
  });

  it("quem chega de fresco não leva com aviso nenhum", () => {
    montar();
    expect(screen.queryByText(/A tua sessão expirou/i)).not.toBeInTheDocument();
  });
});

// ── Bloco 1: o que não pode ter sido desfeito ──────────────────────────────

describe("o que o Bloco 1 deixou, e continua de pé", () => {
  it("a frase de recusa é a do servidor, sem a tornar mais específica", async () => {
    const u = userEvent.setup();
    servir({ ok: false, status: 401, body: { error: "Credenciais incorretas" } });
    montar();
    await u.type(screen.getByLabelText(/O teu email/i), "ninguem@exemplo.pt");
    await u.type(campoDaSenha(), "errada-de-certeza{Enter}");
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Credenciais incorretas");
    expect(aviso.textContent).not.toMatch(/conta|existe|email/i);
  });

  it("o painel de recuperação continua FORA do formulário de entrada", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: /Esqueceste-te da palavra-passe/i }));
    const campo = await screen.findByLabelText(/Email da tua conta/i);
    const formularioDaRecuperacao = campo.closest("form")!;
    const campoDaEntrada = screen.getByLabelText(/O teu email/i);
    // Formulários encaixados são HTML inválido, e o Enter submetia a coisa
    // errada. São dois `<form>` irmãos, e têm de continuar a sê-lo.
    expect(formularioDaRecuperacao).not.toBe(campoDaEntrada.closest("form"));
    expect(formularioDaRecuperacao.querySelector("form")).toBeNull();
  });
});
