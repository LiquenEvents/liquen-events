// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventCosts from "./EventCosts";
import type { EventSupplier, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS PESSOAS NOS MESMOS CUSTOS, E AS DUAS RECEBIAM 200
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista de custos é copiada UMA vez, ao montar, e ao gravar vai INTEIRA: a
 * gravação é «substitui os custos por estes», e não «muda o real deste
 * fornecedor».
 *
 * O CENÁRIO: ele recebe a factura do catering e escreve o custo real, 4 200 €.
 * Ela tem o painel aberto desde a manhã e, à tarde, muda o estado da florista
 * — e manda a lista de manhã, onde o catering ainda só tem o orçado. O real
 * desaparecia e a margem do evento subia sozinha, com as duas gravações a
 * responder 200. É por esse número que se decide se o evento valeu a pena.
 *
 * A correcção é o ecrã DIZER de onde copiou (`base`) e o servidor recusar com
 * 409. E o 409 não pode deitar fora o gesto nem o que está escrito por gravar.
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const FORNECEDORES: EventSupplier[] = [
  {
    id: "f1",
    name: "Flores da Vila",
    category: "Floristas",
    estimatedCost: 400,
    status: "contactado",
  },
  {
    id: "f2",
    name: "Som & Luz",
    category: "Audiovisual",
    estimatedCost: 250,
    status: "contactado",
  },
];

/** O que ELE lançou no portátil enquanto este painel estava aberto. */
const DELE: EventSupplier[] = [
  { ...FORNECEDORES[0], actualCost: 4200 },
  FORNECEDORES[1],
  {
    id: "f9",
    name: "Catering Zé",
    category: "Catering",
    estimatedCost: 3000,
    status: "confirmado",
  },
];

const quoteCom = (eventSuppliers: EventSupplier[]) =>
  ({ id: "q1", name: "Casamento Ana & Rui", eventSuppliers, quotedPrice: 5000 }) as Quote;

function montar(
  eventSuppliers: EventSupplier[] = FORNECEDORES,
  onChange: (s: EventSupplier[]) => void = () => {},
) {
  return render(
    <ToastProvider>
      <EventCosts quote={quoteCom(eventSuppliers)} onChange={onChange} />
    </ToastProvider>,
  );
}

const linhaDe = (nome: string) => screen.getByText(nome).closest("div.group") as HTMLElement;
const estadoDe = (nome: string) =>
  within(linhaDe(nome)).getByTitle("Clica para mudar o estado") as HTMLButtonElement;

/** Os corpos dos PATCH ao orçamento (o diretório é lido pelo mesmo `fetch`). */
function corpos(): {
  eventSuppliers: EventSupplier[];
  base?: { eventSuppliers?: EventSupplier[] };
}[] {
  const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return f.mock.calls
    .filter((c) => String(c[0]).startsWith("/api/orcamento/"))
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Custos do evento — de onde a lista foi copiada", () => {
  it("manda a versão de que partiu, e a seguinte declara o que a anterior deixou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar();

    await user.click(estadoDe("Flores da Vila"));
    await waitFor(() => expect(corpos()).toHaveLength(1));
    expect(corpos()[0].base?.eventSuppliers).toEqual(FORNECEDORES);

    await user.click(estadoDe("Som & Luz"));
    await waitFor(() => expect(corpos()).toHaveLength(2));
    // A base avança ao ENVIAR: dois toques seguidos põem dois PATCH no ar e o
    // segundo já leva o primeiro dentro.
    expect(corpos()[1].base?.eventSuppliers).toEqual(corpos()[0].eventSuppliers);
  });
});

describe("Custos do evento — um 409 com trabalho por gravar no ecrã", () => {
  const colide = () =>
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/orcamento/")
        ? reply(409, { error: "mudou", current: { eventSuppliers: DELE } })
        : reply(200, []),
    );

  it("adopta a lista do servidor sem apagar o fornecedor que ela estava a escrever", async () => {
    vi.stubGlobal("fetch", colide());
    const user = userEvent.setup();
    montar();

    // Trabalho por gravar: o fornecedor seguinte, meio escrito no formulário.
    await user.click(screen.getByRole("button", { name: /Adicionar fornecedor ao evento/ }));
    await user.type(screen.getByLabelText("Nome do fornecedor"), "Padaria do Largo");
    // E, no meio disso, um gesto que colide.
    await user.click(estadoDe("Flores da Vila"));

    // A lista do servidor entra no ecrã — incluindo o que ele lançou.
    expect(await screen.findByText("Catering Zé")).toBeTruthy();
    expect(
      estadoDe("Flores da Vila").textContent,
      "o estado recusado ficou no ecrã como se tivesse sido gravado",
    ).toMatch(/Contactado/i);
    // E o que ela estava a escrever continua no formulário.
    expect((screen.getByLabelText("Nome do fornecedor") as HTMLInputElement).value).toBe(
      "Padaria do Largo",
    );
    // O aviso fica no ecrã (um toast desaparecia) e NOMEIA o gesto travado.
    expect(screen.getByText(/marcar «Flores da Vila» como confirmado/)).toBeTruthy();
  });

  it("«Voltar a aplicar» muda o estado POR CIMA do que ele lançou, sem apagar o custo real", async () => {
    const fetchMock = colide();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    montar();

    await user.click(estadoDe("Flores da Vila"));
    await screen.findByRole("button", { name: "Voltar a aplicar" });

    fetchMock.mockImplementation(async () => reply(200));
    await user.click(screen.getByRole("button", { name: "Voltar a aplicar" }));
    await waitFor(() => expect(corpos()).toHaveLength(2));

    const gravado = corpos()[1].eventSuppliers;
    const florista = gravado.find((s) => s.id === "f1");
    expect(florista?.status).toBe("confirmado");
    // O custo real que ele lançou continua lá, e o fornecedor novo dele também.
    expect(florista?.actualCost).toBe(4200);
    expect(gravado.some((s) => s.id === "f9")).toBe(true);
    expect(corpos()[1].base?.eventSuppliers).toEqual(DELE);
    expect(screen.queryByRole("button", { name: "Voltar a aplicar" })).toBeNull();
  });

  it("o caso feliz continua mudo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar();

    await user.click(estadoDe("Flores da Vila"));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByRole("button", { name: "Voltar a aplicar" })).toBeNull();
    expect(screen.queryByText(/mudaram noutro sítio/i)).toBeNull();
  });
});
