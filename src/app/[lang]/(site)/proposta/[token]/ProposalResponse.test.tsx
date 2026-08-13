// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDictionary } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import ProposalResponse from "./ProposalResponse";

/**
 * PARA QUEM SE ESCREVE QUANDO ISTO CORRE MAL.
 *
 * A proposta expirada e a falha ao responder dizem «fale connosco» e mostram um
 * email. Mostravam o do CLIENTE — o email de quem está a ler — e portanto o
 * único caminho de recurso da página mais cara do produto mandava o casal
 * escrever a si próprio. Tem de ser o do estúdio, o mesmo do rodapé.
 */

const tp = getDictionary("pt").proposta;
/** O email de quem está a ler. Não pode aparecer em lado nenhum como recurso. */
const EMAIL_DO_CLIENTE = "ana@exemplo.pt";

beforeEach(() => {
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProposalResponse — a proposta expirada", () => {
  it("manda escrever para o estúdio, e não para o próprio cliente", () => {
    render(<ProposalResponse token="bom" initialStatus="enviada" expired proposta={tp} />);

    const contacto = screen.getByRole("link", { name: SITE.email });
    expect(contacto).toHaveAttribute("href", `mailto:${SITE.email}`);
    expect(screen.queryByText(EMAIL_DO_CLIENTE)).toBeNull();
    expect(document.querySelector(`a[href="mailto:${EMAIL_DO_CLIENTE}"]`)).toBeNull();
  });
});

describe("ProposalResponse — a falha ao responder", () => {
  it("o aviso de erro aponta para o estúdio, e não para o próprio cliente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "Erro interno" }),
      })),
    );
    render(<ProposalResponse token="bom" initialStatus="enviada" proposta={tp} />);

    await userEvent.click(screen.getByRole("button", { name: tp.response.recusar }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Erro interno");
    const contacto = screen.getByRole("link", { name: tp.response.errorLink });
    expect(contacto).toHaveAttribute("href", `mailto:${SITE.email}`);
    expect(document.querySelector(`a[href="mailto:${EMAIL_DO_CLIENTE}"]`)).toBeNull();
  });
});

/** Preenche o que é preciso para o botão de aceitar não estar inerte. */
async function assinar(nome = "Ana Dias") {
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.type(screen.getByLabelText(tp.terms.nameLabel), nome);
}

/** Uma resposta HTTP como a que o `fetch` do browser devolve. */
const resposta = (over: Partial<{ ok: boolean; status: number; body: unknown }> = {}) => {
  const { ok = true, status = 200, body = { ok: true, status: "rejeitada" } } = over;
  return { ok, status, json: async () => body };
};

describe("ProposalResponse — o que o cliente lê quando algo corre mal", () => {
  /**
   * A MENSAGEM DE ERRO DO BROWSER NÃO É UMA MENSAGEM PARA O CLIENTE.
   *
   * O `catch` mostrava `e.message` de QUALQUER erro que não fosse um abort. Uma
   * rede que cai a meio do aceite é um `TypeError: Failed to fetch` — e era
   * isso, em inglês e sobre XHR, que ficava escrito a vermelho na página onde o
   * casal acabou de decidir gastar milhares de euros. Só a frase que o SERVIDOR
   * escreveu (essa é sobre a proposta, e está na língua da página) é que se
   * mostra; o resto cai na frase genérica.
   */
  it("uma falha de rede não despeja o erro cru do browser na página", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<ProposalResponse token="bom" initialStatus="enviada" proposta={tp} />);

    await userEvent.click(screen.getByRole("button", { name: tp.response.recusar }));

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).not.toMatch(/Failed to fetch/i);
    expect(aviso).toHaveTextContent(tp.response.errorGeneric);
  });

  /**
   * O ACEITE FICOU GRAVADO — E A PÁGINA DIZIA QUE TINHA FALHADO.
   *
   * `res.json()` já vinha protegido com um `.catch(() => null)`, mas a linha
   * seguinte lia `data.status` sem guarda nenhuma: com o corpo ilegível (um
   * proxy a truncar, uma resposta que não é JSON) rebentava ali um TypeError,
   * caía no `catch` e o casal via «Cannot read properties of null» depois de o
   * servidor ter registado o aceite, criado o contrato e emitido o sinal.
   */
  it("um aceite que o servidor REGISTOU não vira erro só porque o corpo veio ilegível", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      })),
    );
    render(<ProposalResponse token="bom" initialStatus="enviada" proposta={tp} />);

    await assinar();
    await userEvent.click(screen.getByRole("button", { name: tp.response.aceitar }));

    expect(await screen.findByText(tp.response.aceiteTitle)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ProposalResponse — o mesmo link aberto duas vezes", () => {
  /**
   * DOIS TELEMÓVEIS, UM LINK.
   *
   * A rota é idempotente e devolve `already: true` com a decisão que já estava
   * gravada. O componente deitava esse sinal fora: quem carregasse em «Recusar»
   * depois de o outro já ter aceite via o ecrã inteiro de festa («Proposta
   * aceite. Obrigado!») e ficava a pensar que tinha sido ele a aceitar. A frase
   * `jaRegistado` existia no dicionário e só aparecia quando a decisão já vinha
   * do servidor no primeiro render.
   */
  it("diz que a resposta JÁ estava registada quando o servidor devolve `already`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta({ body: { ok: true, status: "aceite", already: true } })),
    );
    render(<ProposalResponse token="bom" initialStatus="enviada" proposta={tp} />);

    await userEvent.click(screen.getByRole("button", { name: tp.response.recusar }));

    expect(await screen.findByText(tp.response.aceiteTitle)).toBeTruthy();
    expect(screen.getByText(tp.response.jaRegistado)).toBeTruthy();
  });

  it("uma primeira resposta não diz que já estava registada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta()),
    );
    render(<ProposalResponse token="bom" initialStatus="enviada" proposta={tp} />);

    await userEvent.click(screen.getByRole("button", { name: tp.response.recusar }));

    expect(await screen.findByText(tp.response.rejeitadaTitle)).toBeTruthy();
    expect(screen.queryByText(tp.response.jaRegistado)).toBeNull();
  });
});

describe("ProposalResponse — a decisão é anunciada, não só pintada", () => {
  /**
   * QUEM DECIDE SEM VER O ECRÃ FICAVA SEM SABER O QUE ACONTECEU.
   *
   * O formulário é DESMONTADO e substituído pelo painel do resultado. O botão
   * que tinha o foco desaparece com ele, portanto o foco cai no `<body>`: um
   * leitor de ecrã ficava no topo do documento, e um `role="status"` inserido
   * inteiro (região e conteúdo ao mesmo tempo) não é anunciado de forma fiável.
   * Levar o foco ao painel resolve as duas coisas de uma vez.
   */
  it("leva o foco ao painel do resultado depois de responder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta()),
    );
    render(<ProposalResponse token="bom" initialStatus="enviada" proposta={tp} />);

    await userEvent.click(screen.getByRole("button", { name: tp.response.recusar }));

    const painel = await screen.findByRole("status");
    await waitFor(() => expect(document.activeElement).toBe(painel));
  });

  /**
   * O reverso: numa proposta JÁ decidida a página abre com o painel logo à
   * vista. Roubar o foco no arranque saltava por cima da proposta inteira e
   * levava o casal direto ao fundo da página sem eles terem feito nada.
   */
  it("NÃO rouba o foco quando a decisão já vinha registada do servidor", async () => {
    render(<ProposalResponse token="bom" initialStatus="aceite" proposta={tp} />);

    expect(screen.getByRole("status")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(document.body));
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O BOTÃO QUE FICAVA SÓ COM RETICÊNCIAS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Enquanto o pedido está a correr, cada botão troca o rótulo pelo seu par
 * «…Sending». O do aceitar dizia «A registar…»; o do recusar dizia, à letra,
 * `"…"` — três pontos e mais nada, nas DUAS línguas.
 *
 * O que o casal via: carregava em «Recusar», confirmava, e o botão ficava um
 * quadrado com reticências enquanto a resposta viajava. Sem palavra nenhuma
 * não há como saber se está a acontecer alguma coisa — e num telemóvel com
 * rede fraca isso é vários segundos a olhar para «…». Quem lê com um leitor de
 * ecrã ouve o botão anunciar-se como «reticências».
 *
 * Passa a dizer o mesmo que o irmão, que é o que está mesmo a acontecer: a
 * resposta está a ser registada.
 */
describe("ProposalResponse — o que os botões dizem enquanto esperam", () => {
  it("o botão de recusar diz o que está a fazer, não «…»", () => {
    for (const lingua of ["pt", "en"] as const) {
      const d = getDictionary(lingua).proposta.response;
      expect(d.recusarSending, `[${lingua}] um rótulo sem palavras`).not.toBe("…");
      expect(d.recusarSending.replace(/[….\s]/g, "").length, `[${lingua}]`).toBeGreaterThan(0);
      // E diz o MESMO que o do aceitar: as duas respostas são registadas igual.
      expect(d.recusarSending).toBe(d.aceitarSending);
    }
  });

  it("e é esse rótulo que aparece no botão enquanto o pedido corre", async () => {
    let libertar: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((r) => {
            libertar = r;
          }),
      ),
    );
    render(<ProposalResponse token="bom" initialStatus="enviada" proposta={tp} />);
    await userEvent.click(screen.getByRole("button", { name: tp.response.recusar }));
    expect(await screen.findByRole("button", { name: tp.response.recusarSending })).toBeTruthy();
    libertar({ ok: true, json: async () => ({ status: "rejeitada" }) });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DOIS BOTÕES «RECUSAR» NO MESMO ECRÃ
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Medido num telemóvel (390×844, a página servida em dev), com o Playwright a
 * recusar-se a carregar por ambiguidade:
 *
 *     strict mode violation: getByRole('button', { name: 'Recusar' })
 *       resolved to 2 elements:
 *       1) <button …>Recusar</button>            ← recusa a PROPOSTA
 *       2) <button …>Recusar</button>            ← recusa os COOKIES
 *
 * O aviso de cookies (`ConsentBanner`) é fixo ao fundo do ecrã e acompanha o
 * scroll: enquanto ninguém lhe tocar, os dois «Recusar» estão à vista ao mesmo
 * tempo, no ecrã onde o casal decide um casamento. O lado do aceitar já estava
 * desambiguado — «Aceitar proposta →» contra «Aceitar» — e só o do recusar é
 * que não estava.
 *
 * Recusar uma proposta é irreversível do lado do cliente (a rota é idempotente:
 * a segunda resposta devolve a primeira). Um toque no botão errado não se
 * desfaz — por isso o rótulo diz O QUE se recusa, como o do lado de cima.
 */
describe("ProposalResponse — o botão de recusar nomeia o que recusa", () => {
  it("não se confunde com o «Recusar» do aviso de cookies", () => {
    for (const lingua of ["pt", "en"] as const) {
      const d = getDictionary(lingua).proposta.response;
      // O rótulo do banner de cookies (ver `ConsentBanner`) é a palavra sozinha.
      const doBanner = lingua === "pt" ? "Recusar" : "Decline";
      expect(d.recusar, `[${lingua}]`).not.toBe(doBanner);
      expect(d.recusar.length, `[${lingua}] tem de nomear o objecto`).toBeGreaterThan(
        doBanner.length,
      );
    }
  });
});
