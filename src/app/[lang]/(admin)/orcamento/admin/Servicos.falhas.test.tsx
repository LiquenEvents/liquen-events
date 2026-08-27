// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import Servicos from "./Servicos";
import type { ServicoDaBiblioteca } from "./BibliotecaServicos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ARQUIVAR RECUSADO NÃO PODE DESARQUIVAR O OUTRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `gravar` desta biblioteca guardava a LISTA INTEIRA antes de partir e
 * mexia-lhe de duas maneiras: repunha-a inteira no erro, e no sucesso escrevia
 * `antes.map(…)` — a lista velha com uma linha trocada. Arquivar dois serviços
 * seguidos põe dois PATCH no ar, e em qualquer das ordens ficava um serviço a
 * aparecer no seletor do estúdio depois de ela o ter arquivado.
 *
 * E isto não fica neste ecrã: o seletor da proposta lê a mesma biblioteca, e o
 * serviço que ela julga arquivado volta a ser oferecido ao escrever a proposta
 * seguinte.
 *
 * O que se toca agora é a LINHA em causa, e por função (`prev => …`), que é o
 * que impede uma gravação de escrever por cima da outra.
 */

const CERIMONIA: ServicoDaBiblioteca = {
  id: "s1",
  nome: "Decoração da cerimónia",
  descricao: "Arco e coluna de flores",
  nomeEn: "Ceremony styling",
  descricaoEn: "",
  categoria: "Flores",
};
const FOTOGRAFIA: ServicoDaBiblioteca = {
  id: "s2",
  nome: "Reportagem fotográfica",
  descricao: "Oito horas de cobertura",
  nomeEn: "",
  descricaoEn: "",
  categoria: "Imagem",
};

const resposta = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as Response;

let recusarACerimonia: () => void;

beforeEach(() => {
  const patchDaCerimonia = new Promise<Response>((resolve) => {
    recusarACerimonia = () => resolve(resposta(500, { error: "Erro interno" }));
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return Promise.resolve(resposta(200, [CERIMONIA, FOTOGRAFIA]));
      }
      // O PATCH da cerimónia fica pendente até o teste o recusar.
      if (String(url).endsWith("/s1")) return patchDaCerimonia;
      return Promise.resolve(resposta(200, { ...FOTOGRAFIA, arquivado: true }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** O botão «Arquivar» DESTE serviço — há um por linha. */
function arquivarDe(nome: string) {
  const linha = screen.getByText(nome).closest("li");
  if (!linha) throw new Error(`Sem linha para "${nome}"`);
  return within(linha as HTMLElement).getByRole("button", { name: "Arquivar" });
}

async function montar() {
  render(
    <ToastProvider>
      <Servicos />
    </ToastProvider>,
  );
  await screen.findByText("Decoração da cerimónia");
}

describe("Biblioteca de serviços — um arquivar que o servidor recusa", () => {
  it("o serviço que ficou mesmo arquivado não volta ao seletor", async () => {
    const user = userEvent.setup();
    await montar();

    // O arquivar lento da cerimónia parte primeiro…
    await user.click(arquivarDe("Decoração da cerimónia"));
    // … e, à espera dele, a reportagem é arquivada com sucesso (sai da lista,
    // que por omissão só mostra o que não está arquivado).
    await user.click(arquivarDe("Reportagem fotográfica"));
    await waitFor(() =>
      expect(screen.queryByText("Reportagem fotográfica")).not.toBeInTheDocument(),
    );

    // Só agora o servidor recusa o primeiro.
    recusarACerimonia();

    // A cerimónia volta à lista — é a reposição a fazer o seu trabalho.
    expect(await screen.findByText("Decoração da cerimónia")).toBeInTheDocument();
    // A reportagem está arquivada na base de dados: devolvê-la ao ecrã é
    // devolvê-la ao seletor das propostas.
    expect(screen.queryByText("Reportagem fotográfica")).not.toBeInTheDocument();
  });

  it("e a frase diz qual serviço, porquê e o que fazer", async () => {
    const user = userEvent.setup();
    await montar();

    await user.click(arquivarDe("Decoração da cerimónia"));
    recusarACerimonia();

    const aviso = await screen.findByText(/não está a aceitar gravações/);
    expect(aviso).toHaveTextContent("Decoração da cerimónia");
    expect(aviso).toHaveTextContent(/repete/i);
  });
});
