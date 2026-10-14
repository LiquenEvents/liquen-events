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
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Família Silva/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tia Rosa/ })).toBeNull();
  });

  it("acrescentar uma mesa redonda desenha-a e grava, com a base", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "+ Redonda" }));
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
    expect(await screen.findByText("3/4")).toBeInTheDocument();
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
    expect(await screen.findByText("3/4")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "+ Quadrada" }));
    await waitFor(() => expect(gravados).toHaveLength(2), { timeout: 3000 });
    const final = (gravados[1] as { mapaDeMesas: Mapa }).mapaDeMesas;
    expect(final.mesas.map((m) => m.id)).toEqual(expect.arrayContaining(["m1", "m2"]));
    expect(final.mesas).toHaveLength(3);
  });
});
