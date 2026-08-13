// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
