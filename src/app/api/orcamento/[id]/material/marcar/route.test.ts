import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FECHO DO CARREGAMENTO, DO LADO DO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `EventMaterialStatus` tem três valores — «preparada», «carregada»,
 * «devolvida» — e o do meio **nunca era escrito por ninguém**. O botão que o
 * devia escrever não fazia nada, e por isso o estado era, na prática, uma
 * coluna morta.
 *
 * O que aqui se prende:
 *
 *  1. o fecho muda o estado da checklist, e uma vez só — um lote com quarenta
 *     marcações e um fecho não pode dar quarenta escritas no cabeçalho;
 *  2. o fecho fica no registo do evento, como tudo o resto: um facto sobre um
 *     carregamento não pode existir só como um `status` sem autor nem hora;
 *  3. **nunca faz o evento andar para trás.** Um telemóvel que esteve duas
 *     horas sem rede pode chegar com um fecho antigo depois de o material já
 *     ter voltado — e «devolvida» não se desfaz por causa disso.
 */

const authed = vi.hoisted(() => ({ ok: true }));
const base = vi.hoisted(() => ({
  evento: { id: "ev1", quoteId: "q1", status: "preparada" } as Record<string, unknown> | null,
  itens: [] as Record<string, unknown>[],
  actualizacoes: [] as { id: string; patch: Record<string, unknown> }[],
  registos: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/event-material-store", () => ({
  getForQuote: async () => base.evento,
  updateEventMaterial: async (id: string, patch: Record<string, unknown>) => {
    base.actualizacoes.push({ id, patch });
    if (base.evento) base.evento = { ...base.evento, ...patch };
    return base.evento;
  },
}));
vi.mock("@/lib/event-material-items-store", () => ({
  listItemsOfEvent: async () => base.itens,
  updateEventItem: async () => undefined,
}));
vi.mock("@/lib/event-material-log-store", () => ({
  registar: async (l: Record<string, unknown>) => {
    base.registos.push(l);
  },
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { POST } from "./route";

function req(marcacoes: unknown[]): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/material/marcar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marcacoes }),
  }) as unknown as NextRequest;
}

const fecho = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  eventId: "ev1",
  itemId: "",
  accao: "fechado",
  valor: "carregada",
  markedAt: "2026-05-01T18:42:00.000Z",
  actor: "Rita",
  ...over,
});

beforeEach(() => {
  authed.ok = true;
  base.evento = { id: "ev1", quoteId: "q1", status: "preparada" };
  base.itens = [];
  base.actualizacoes = [];
  base.registos = [];
});

describe("/api/orcamento/[id]/material/marcar — o fecho", () => {
  it("recusa quem não entrou", async () => {
    authed.ok = false;
    expect((await POST(req([fecho()]), { params: Promise.resolve({ id: "q1" }) })).status).toBe(
      401,
    );
  });

  it("dar por carregada passa a checklist a «carregada»", async () => {
    const corpo = await (
      await POST(req([fecho()]), { params: Promise.resolve({ id: "q1" }) })
    ).json();

    expect(base.actualizacoes).toEqual([{ id: "ev1", patch: { status: "carregada" } }]);
    expect(corpo.estado).toBe("carregada");
    expect(corpo.aplicadas).toBe(1);
  });

  it("fica no registo, com quem fechou e a que horas", async () => {
    await POST(req([fecho()]), { params: Promise.resolve({ id: "q1" }) });

    expect(base.registos).toHaveLength(1);
    expect(base.registos[0]).toMatchObject({
      eventId: "ev1",
      action: "fechado",
      value: "carregada",
      actor: "Rita",
      markedAt: "2026-05-01T18:42:00.000Z",
    });
  });

  it("reabrir volta a «preparada»", async () => {
    base.evento = { id: "ev1", quoteId: "q1", status: "carregada" };

    const corpo = await (
      await POST(req([fecho({ valor: "preparada" })]), { params: Promise.resolve({ id: "q1" }) })
    ).json();

    expect(corpo.estado).toBe("preparada");
  });

  it("um fecho repetido não volta a escrever o cabeçalho", async () => {
    base.evento = { id: "ev1", quoteId: "q1", status: "carregada" };

    await POST(req([fecho()]), { params: Promise.resolve({ id: "q1" }) });

    expect(base.actualizacoes).toEqual([]);
  });

  it("dois fechos no mesmo lote: ganha o relógio mais recente", async () => {
    await POST(
      req([
        fecho({ id: "b", valor: "preparada", markedAt: "2026-05-01T19:00:00.000Z" }),
        fecho({ id: "a", valor: "carregada", markedAt: "2026-05-01T18:00:00.000Z" }),
      ]),
      { params: Promise.resolve({ id: "q1" }) },
    );

    // Uma escrita só, e é a da marcação mais recente.
    expect(base.actualizacoes).toEqual([]);
    // (o estado já era «preparada», portanto não houve o que escrever)
    expect(base.registos).toHaveLength(2);
  });

  /**
   * ── O QUE PROTEGE UM EVENTO JÁ FECHADO ────────────────────────────────
   *
   * Um telemóvel offline há duas horas chega com o fecho do carregamento
   * DEPOIS de o material já ter sido devolvido no armazém. Aceitá-lo era pôr
   * o evento a dizer que a carrinha está carregada quando ela já foi
   * descarregada.
   */
  it("não faz um evento já devolvido andar para trás", async () => {
    base.evento = { id: "ev1", quoteId: "q1", status: "devolvida" };

    const corpo = await (
      await POST(req([fecho()]), { params: Promise.resolve({ id: "q1" }) })
    ).json();

    expect(base.actualizacoes).toEqual([]);
    expect(corpo.estado).toBe("devolvida");
    // Mas o facto não se perde: fica no registo, com hora e autor.
    expect(base.registos).toHaveLength(1);
  });

  it("um fecho sem hora é ignorado, e não leva o lote atrás", async () => {
    const corpo = await (
      await POST(req([fecho({ markedAt: "" })]), { params: Promise.resolve({ id: "q1" }) })
    ).json();

    expect(corpo.ok).toBe(true);
    expect(corpo.ignoradas).toBe(1);
    expect(base.actualizacoes).toEqual([]);
  });
});
