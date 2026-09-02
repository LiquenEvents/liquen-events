// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Escolhas from "./Escolhas";
import { textosDaPagina } from "./textos-da-pagina";
import type { Escolha } from "@/lib/proposta-escolhas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ÚNICO SÍTIO DA PÁGINA DO CASAL ONDE ELES ESCREVEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas se prendem aqui, e a segunda é a que custa dinheiro:
 *
 *  1. NADA fala com o servidor sem um dedo em cima de uma opção. É a regra
 *     dela — não se regista que a proposta foi aberta.
 *  2. Um envio FALHADO nunca pode aparecer como escolha feita. O casal fecha o
 *     separador convencido de que nos disse, e do lado de cá não há nada.
 */

const ESCOLHAS: Escolha[] = [
  {
    id: "e1",
    titulo: "Paleta da cerimónia",
    nota: "Podemos mudar até 30 dias antes.",
    opcoes: [
      { id: "o1", rotulo: "Verde-oliva e branco", descricao: "Eucalipto, rosa branca" },
      { id: "o2", rotulo: "Terracota e creme" },
    ],
  },
  {
    id: "e2",
    titulo: "Corredor",
    opcoes: [
      { id: "c1", rotulo: "Pétalas" },
      { id: "c2", rotulo: "Velas" },
    ],
  },
];

const emLingua = (escolhas: Escolha[]) => ({
  titulo: Object.fromEntries(escolhas.map((e) => [e.id, e.titulo])),
  nota: Object.fromEntries(escolhas.map((e) => [e.id, e.nota ?? ""])),
  rotulo: Object.fromEntries(escolhas.flatMap((e) => e.opcoes.map((o) => [o.id, o.rotulo]))),
  descricao: Object.fromEntries(
    escolhas.flatMap((e) => e.opcoes.map((o) => [o.id, o.descricao ?? ""])),
  ),
});

let responde: () => Response;
const fetchMock = vi.fn(async () => responde());

const desenhar = (props: Partial<React.ComponentProps<typeof Escolhas>> = {}) =>
  render(
    <Escolhas
      escolhas={ESCOLHAS}
      escolhido={{}}
      fotos={{}}
      token="tok-1"
      textos={textosDaPagina("pt")}
      emLingua={emLingua(ESCOLHAS)}
      {...props}
    />,
  );

beforeEach(() => {
  responde = () => ({ ok: true, json: async () => ({ ok: true }) }) as unknown as Response;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("abrir a página não conta como escolher", () => {
  it("não há um único pedido ao servidor antes de um dedo tocar numa opção", async () => {
    desenhar();
    await screen.findByRole("button", { name: /Verde-oliva e branco/ });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("o que está no ecrã", () => {
  it("mostra o título, a nota e as alternativas", () => {
    desenhar();
    expect(screen.getByText("Paleta da cerimónia")).toBeTruthy();
    expect(screen.getByText("Podemos mudar até 30 dias antes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Terracota e creme/ })).toBeTruthy();
    expect(screen.getByText("Eucalipto, rosa branca")).toBeTruthy();
  });

  it("o que já tinham escolhido vem marcado, sem precisar de rede", () => {
    desenhar({ escolhido: { e1: "o2" } });
    expect(screen.getByRole("button", { name: /Terracota e creme/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Verde-oliva e branco/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("escolher", () => {
  it("manda o par certo para a rota deste token", async () => {
    const user = userEvent.setup();
    desenhar();
    await user.click(screen.getByRole("button", { name: /Terracota e creme/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/proposta/tok-1/escolha");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ escolhaId: "e1", opcaoId: "o2" });
  });

  it("diz que ficámos a saber — e que podem mudar de ideias", async () => {
    // Não é «guardado»: o que interessa ao casal não é o nosso registo.
    const user = userEvent.setup();
    desenhar();
    await user.click(screen.getByRole("button", { name: /Terracota e creme/ }));
    expect(await screen.findByText(/Ficámos a saber/i)).toBeTruthy();
    expect(screen.getByText(/mudar de ideias/i)).toBeTruthy();
  });

  it("responder a uma pergunta não mexe na outra", async () => {
    const user = userEvent.setup();
    desenhar();
    await user.click(screen.getByRole("button", { name: /Velas/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Velas/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Terracota e creme/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("mudar de ideias manda a nova escolha", async () => {
    const user = userEvent.setup();
    desenhar({ escolhido: { e1: "o1" } });
    await user.click(screen.getByRole("button", { name: /Terracota e creme/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)),
    ).toEqual({ escolhaId: "e1", opcaoId: "o2" });
  });
});

describe("quando o envio falha", () => {
  it("a marca VOLTA ATRÁS — a página não finge uma escolha que não seguiu", async () => {
    const user = userEvent.setup();
    responde = () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response;
    desenhar({ escolhido: { e1: "o1" } });
    await user.click(screen.getByRole("button", { name: /Terracota e creme/ }));
    await screen.findByText(/Não foi possível registar/i);
    expect(screen.getByRole("button", { name: /Verde-oliva e branco/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Terracota e creme/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByText(/Ficámos a saber/i)).toBeNull();
  });

  it("sem escolha anterior, não fica marca nenhuma", async () => {
    const user = userEvent.setup();
    responde = () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response;
    desenhar();
    await user.click(screen.getByRole("button", { name: /Terracota e creme/ }));
    await screen.findByText(/Não foi possível registar/i);
    for (const nome of [/Verde-oliva e branco/, /Terracota e creme/]) {
      expect(screen.getByRole("button", { name: nome })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("a rede em baixo (a promessa rejeita) trata-se como qualquer outra falha", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("rede em baixo");
    });
    desenhar();
    await user.click(screen.getByRole("button", { name: /Velas/ }));
    expect(await screen.findByText(/Não foi possível registar/i)).toBeTruthy();
  });

  it("oferece tentar outra vez, e a segunda tentativa vale", async () => {
    const user = userEvent.setup();
    responde = () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response;
    desenhar();
    await user.click(screen.getByRole("button", { name: /Terracota e creme/ }));
    await screen.findByText(/Não foi possível registar/i);
    responde = () => ({ ok: true, json: async () => ({ ok: true }) }) as unknown as Response;
    await user.click(screen.getByRole("button", { name: /Tentar outra vez/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Ficámos a saber/i)).toBeTruthy();
  });

  it("uma falha numa pergunta não apaga a confirmação da outra", async () => {
    // Com um estado só para a página, o casal ficava sem saber qual das duas
    // tinha seguido.
    const user = userEvent.setup();
    desenhar();
    await user.click(screen.getByRole("button", { name: /Velas/ }));
    await screen.findByText(/Ficámos a saber/i);
    responde = () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response;
    await user.click(screen.getByRole("button", { name: /Terracota e creme/ }));
    await screen.findByText(/Não foi possível registar/i);
    expect(screen.getByText(/Ficámos a saber/i)).toBeTruthy();
  });
});

describe("as duas línguas", () => {
  it("desenha o texto que o servidor já resolveu — não decide a língua aqui", async () => {
    desenhar({
      textos: textosDaPagina("en"),
      emLingua: {
        titulo: { e1: "Ceremony palette", e2: "Aisle" },
        nota: { e1: "", e2: "" },
        rotulo: { o1: "Olive and white", o2: "Terracotta and cream", c1: "Petals", c2: "Candles" },
        descricao: { o1: "", o2: "", c1: "", c2: "" },
      },
    });
    expect(screen.getByText("Ceremony palette")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Olive and white/ })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Candles/ }));
    expect(await screen.findByText(/We have got it/i)).toBeTruthy();
  });
});
