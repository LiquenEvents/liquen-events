// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Guest, Quote } from "@/lib/orcamento/types";
import type { MapaDeMesas as Mapa } from "@/lib/orcamento/mapa-de-mesas";
import { ToastProvider } from "./Toast";
import MapaDeMesas from "./MapaDeMesas";
import { __resetListCache } from "./useCachedList";

/**
 * O ecrã do mapa de mesas (14/10). As regras estão provadas em
 * `lib/orcamento/mapa-de-mesas.test.ts`; aqui prova-se o ecrã: escolher o
 * evento, acrescentar mesas, sentar, mover, apagar e anular, a vista em lista,
 * e que a gravação leva a `base` e sobrevive a uma colisão.
 */

const EVENTOS = [
  {
    id: "q1",
    cliente: "TESTE Ana e Rui",
    evento: "Casamento",
    data: "2099-06-20",
    local: "TESTE Quinta",
    aceite: true,
    momentos: [],
  },
];

const CONVIDADOS: Guest[] = [
  { id: "g1", name: "Família Silva", party: 3, rsvp: "confirmado" },
  { id: "g2", name: "Rui Costa", party: 1, rsvp: "confirmado" },
  { id: "g3", name: "Tia Rosa", party: 1, rsvp: "recusado" },
];

let gravados: Record<string, unknown>[] = [];
let respostaAoPatch: (corpo: Record<string, unknown>) => { status: number; json: unknown } = (
  c,
) => ({
  status: 200,
  json: { ...pedido(), ...c },
});

function pedido(mapa?: Mapa): Quote {
  return {
    id: "q1",
    name: "TESTE Ana e Rui",
    date: "2099-06-20",
    guestList: CONVIDADOS,
    ...(mapa ? { mapaDeMesas: mapa } : {}),
  } as Quote;
}

function ligar() {
  gravados = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/guioes")) {
        return new Response(JSON.stringify({ guioes: EVENTOS }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if ((init?.method ?? "GET") === "PATCH") {
        const corpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        gravados.push(corpo);
        const r = respostaAoPatch(corpo);
        return new Response(JSON.stringify(r.json), {
          status: r.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    }),
  );
}

async function abrir(mapa?: Mapa) {
  render(
    <ToastProvider>
      <MapaDeMesas carregarPedido={async () => ({ ok: true, quote: pedido(mapa) })} />
    </ToastProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /TESTE Ana e Rui/ }));
  await screen.findByText("Sentados");
}

/** O contador «Sentados» da barra de cima (a mesa tem um «0/4» igual). */
const sentados = () => within(screen.getByRole("group", { name: "Sentados" }));

/** «Adicionar ▾» e uma das linhas do menu. */
async function adicionar(rotulo: string) {
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${rotulo}`) }));
}

const COM_UMA_MESA: Mapa = {
  versao: 1,
  mesas: [{ id: "m1", nome: "Mesa 1", forma: "redonda", x: 200, y: 200, lugares: 4 }],
  elementos: [],
  lugares: {},
};

/** Um ecrã de computador: a lista de espera ao lado da sala, e o inspector numa
 *  coluna (no telemóvel são folhas, e uma folha aberta tapa o resto). */
function comoComputador() {
  vi.stubGlobal("matchMedia", (mq: string) => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    return {
      matches: min ? 1440 >= Number(min[1]) : mq.includes("hover: hover"),
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

beforeEach(() => {
  __resetListCache();
  comoComputador();
  respostaAoPatch = (c) => ({ status: 200, json: { ...pedido(), ...c } });
  ligar();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o mapa de mesas", () => {
  it("abre o evento e conta quem há para sentar, sem os recusados", async () => {
    await abrir();
    expect(sentados().getByText("0/4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Família Silva/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tia Rosa/ })).toBeNull();
  });

  it("acrescentar uma mesa redonda desenha-a e grava, com a base", async () => {
    await abrir();
    await adicionar("Mesa redonda");
    expect(
      await screen.findByRole("button", { name: /^Mesa 1, redonda, 8 lugares, 0 ocupados/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(gravados).toHaveLength(1), { timeout: 2000 });
    const enviado = gravados[0] as { mapaDeMesas: Mapa; base: unknown };
    expect(enviado.mapaDeMesas.mesas).toHaveLength(1);
    expect(enviado).toHaveProperty("base");
  });

  it("escolher o grupo e tocar num lugar senta o grupo inteiro, junto", async () => {
    await abrir(COM_UMA_MESA);
    fireEvent.click(screen.getByRole("button", { name: /Família Silva/ }));
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Lugar 2 da Mesa 1: livre", hidden: true }),
      { key: "Enter" },
    );
    await waitFor(() => expect(sentados().getByText("3/4")).toBeInTheDocument());
    expect(
      screen.getByRole("button", { name: "Lugar 2 da Mesa 1: Família Silva 1/3", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lugar 4 da Mesa 1: Família Silva 3/3", hidden: true }),
    ).toBeInTheDocument();
  });

  it("um grupo maior do que a mesa: diz quantos ficaram e oferece lugares a mais", async () => {
    await abrir({ ...COM_UMA_MESA, mesas: [{ ...COM_UMA_MESA.mesas[0], lugares: 2 }] });
    fireEvent.click(screen.getByRole("button", { name: /Família Silva/ }));
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Lugar 1 da Mesa 1: livre", hidden: true }),
      { key: "Enter" },
    );
    expect(await screen.findByText(/Ficou 1 pessoa/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar 1 lugar à Mesa 1" }));
    await waitFor(() => expect(sentados().getByText("3/4")).toBeInTheDocument());
  });

  it("as setas movem a mesa", async () => {
    await abrir(COM_UMA_MESA);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Mesa 1, redonda/ }), {
      key: "ArrowRight",
      shiftKey: true,
    });
    await waitFor(() => expect(gravados).toHaveLength(1), { timeout: 2000 });
    expect((gravados[0] as { mapaDeMesas: Mapa }).mapaDeMesas.mesas[0].x).toBe(250);
  });

  it("apagar a mesa leva as pessoas para a lista de espera, e anula-se", async () => {
    await abrir({ ...COM_UMA_MESA, lugares: { "m1:0": { convidadoId: "g2", n: 1 } } });
    fireEvent.keyDown(screen.getByRole("button", { name: /^Mesa 1, redonda/ }), { key: "Delete" });
    expect(screen.queryByRole("button", { name: /^Mesa 1, redonda/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Rui Costa/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    expect(
      await screen.findByRole("button", { name: /^Mesa 1, redonda, 4 lugares, 1 ocupados/ }),
    ).toBeInTheDocument();
  });

  it("na vista em lista, «Mudar para…» leva a pessoa à lista de espera", async () => {
    const user = userEvent.setup();
    await abrir({ ...COM_UMA_MESA, lugares: { "m1:0": { convidadoId: "g2", n: 1 } } });
    await user.click(screen.getByRole("radio", { name: "Lista" }));
    const mesa = screen.getByRole("region", { name: "Mesa 1" });
    await user.selectOptions(
      within(mesa).getByRole("combobox", { name: "Mudar Rui Costa para…" }),
      "",
    );
    expect(within(mesa).getByText("Ninguém sentado.")).toBeInTheDocument();
  });

  it("uma colisão (409) junta o gesto daqui ao mapa que lá estava", async () => {
    const outraMesa = {
      id: "m2",
      nome: "Mesa 2",
      forma: "quadrada" as const,
      x: 600,
      y: 200,
      lugares: 4,
    };
    let primeira = true;
    respostaAoPatch = (c) => {
      if (primeira) {
        primeira = false;
        return {
          status: 409,
          json: {
            error: "x",
            current: {
              mapaDeMesas: { ...COM_UMA_MESA, mesas: [...COM_UMA_MESA.mesas, outraMesa] },
            },
          },
        };
      }
      return { status: 200, json: { ...pedido(), ...c } };
    };
    await abrir(COM_UMA_MESA);
    await adicionar("Mesa quadrada");
    await waitFor(() => expect(gravados).toHaveLength(2), { timeout: 3000 });
    const final = (gravados[1] as { mapaDeMesas: Mapa }).mapaDeMesas;
    expect(final.mesas.map((m) => m.id)).toEqual(expect.arrayContaining(["m1", "m2"]));
    expect(final.mesas).toHaveLength(3);
  });
});

/**
 * O ecrã de trabalho (14/10): «que dê para trabalhar num espaço mais amplo»,
 * «adicionar uma mesa, adicionar um lugar», e a lista dos eventos melhor.
 */
describe("o ecrã de trabalho", () => {
  it("abrir um evento põe a sala no ecrã inteiro, e o Escape volta à lista", async () => {
    await abrir(COM_UMA_MESA);
    const ecra = screen.getByRole("region", { name: "Mapa de mesas de TESTE Ana e Rui" });
    expect(ecra.className).toMatch(/fixed inset-0/);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Mapa de mesas de TESTE Ana e Rui" })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: /TESTE Ana e Rui/ })).toBeInTheDocument();
  });

  it("o Escape primeiro larga a mesa escolhida, e só depois sai", async () => {
    await abrir(COM_UMA_MESA);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Mesa 1, redonda/ }), { key: "Enter" });
    expect(screen.getByRole("toolbar", { name: /Mesa 1/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("toolbar", { name: /Mesa 1/ })).toBeNull();
    expect(screen.getByRole("region", { name: /Mapa de mesas de/ })).toBeInTheDocument();
  });

  it("«Adicionar» também traz os elementos da sala", async () => {
    await abrir();
    await adicionar("Pista de dança");
    expect(await screen.findByRole("button", { name: /^Pista de dança\./ })).toBeInTheDocument();
  });

  it("a barrinha junto da mesa acrescenta e tira cadeiras, no desenho", async () => {
    await abrir(COM_UMA_MESA);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Mesa 1, redonda/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar uma cadeira à Mesa 1" }));
    expect(screen.getByRole("button", { name: /^Mesa 1, redonda, 5 lugares/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tirar uma cadeira da Mesa 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Tirar uma cadeira da Mesa 1" }));
    expect(screen.getByRole("button", { name: /^Mesa 1, redonda, 3 lugares/ })).toBeInTheDocument();
  });

  it("duplicar a mesa dá uma igual ao lado, com o nome seguinte", async () => {
    await abrir(COM_UMA_MESA);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Mesa 1, redonda/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Duplicar a Mesa 1" }));
    expect(
      screen.getByRole("button", { name: /^Mesa 2, redonda, 4 lugares, 0 ocupados/ }),
    ).toBeInTheDocument();
  });

  it("⌘Z anula o último passo e ⇧⌘Z refá-lo", async () => {
    await abrir(COM_UMA_MESA);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Mesa 1, redonda/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar uma cadeira à Mesa 1" }));
    expect(screen.getByRole("button", { name: /^Mesa 1, redonda, 5 lugares/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(screen.getByRole("button", { name: /^Mesa 1, redonda, 4 lugares/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(screen.getByRole("button", { name: /^Mesa 1, redonda, 5 lugares/ })).toBeInTheDocument();
    // E o botão da barra faz o mesmo.
    fireEvent.click(screen.getByRole("button", { name: "Anular o último passo" }));
    expect(screen.getByRole("button", { name: /^Mesa 1, redonda, 4 lugares/ })).toBeInTheDocument();
  });

  it("escrever o nome de uma mesa é UM passo de anular, e não um por letra", async () => {
    await abrir(COM_UMA_MESA);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Mesa 1, redonda/ }), { key: "Enter" });
    const nome = screen.getByLabelText("Nome da mesa");
    for (const v of ["Mesa 1 N", "Mesa 1 No", "Mesa 1 Noi"])
      fireEvent.change(nome, { target: { value: v } });
    expect(screen.getByRole("button", { name: /^Mesa 1 Noi, redonda/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anular o último passo" }));
    expect(screen.getByRole("button", { name: /^Mesa 1, redonda/ })).toBeInTheDocument();
  });

  it("arrastar um convidado da lista para uma cadeira senta-o lá", async () => {
    await abrir(COM_UMA_MESA);
    const cadeira = screen.getByRole("button", { name: "Lugar 3 da Mesa 1: livre", hidden: true });
    const antes = document.elementFromPoint;
    document.elementFromPoint = () => cadeira as unknown as Element;
    try {
      fireEvent.pointerDown(screen.getByRole("button", { name: /Rui Costa/ }), {
        button: 0,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
      fireEvent.pointerUp(window, { clientX: 200, clientY: 200 });
    } finally {
      document.elementFromPoint = antes;
    }
    expect(
      await screen.findByRole("button", { name: "Lugar 3 da Mesa 1: Rui Costa", hidden: true }),
    ).toBeInTheDocument();
  });
});

describe("a lista dos eventos", () => {
  it("cada cartão diz em que pé está o mapa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              guioes: [
                { ...EVENTOS[0], mesas: { mesas: 8, sentados: 64, pessoas: 74 } },
                { ...EVENTOS[0], id: "q2", cliente: "TESTE Rita", data: "2099-07-01", mesas: null },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    render(
      <ToastProvider>
        <MapaDeMesas carregarPedido={async () => ({ ok: true, quote: pedido() })} />
      </ToastProvider>,
    );
    expect(await screen.findByText("8 mesas · 64/74 sentados")).toBeInTheDocument();
    expect(screen.getByText("Sem mapa ainda")).toBeInTheDocument();
    // O próximo vai à cabeça.
    expect(screen.getByText("Próximo evento")).toBeInTheDocument();
  });

  it("a procura filtra pelo nome", async () => {
    render(
      <ToastProvider>
        <MapaDeMesas carregarPedido={async () => ({ ok: true, quote: pedido() })} />
      </ToastProvider>,
    );
    await screen.findByRole("button", { name: /TESTE Ana e Rui/ });
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar eventos" }), {
      target: { value: "ninguém" },
    });
    expect(await screen.findByText("Nenhum evento com esse nome")).toBeInTheDocument();
  });
});
