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
