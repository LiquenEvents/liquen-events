import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { MaterialListItem } from "@/lib/material-list-types";

const authed = vi.hoisted(() => ({ ok: true }));
const linhas = vi.hoisted(() => ({
  existentes: [] as MaterialListItem[],
  add: vi.fn(async (input: Record<string, unknown>) => ({ id: "nova", ...input })),
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
  remove: vi.fn(async () => {}),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/material-lists-store", () => ({
  updateList: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
  deleteList: vi.fn(async () => {}),
}));
vi.mock("@/lib/material-list-items-store", () => ({
  addListItem: linhas.add,
  updateListItem: linhas.update,
  removeListItem: linhas.remove,
  listItemsOf: vi.fn(async () => linhas.existentes),
}));

import { PATCH } from "./route";

function patch(id: string, body: unknown) {
  const req = new Request(`https://liquen.test/api/material/listas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return PATCH(req, { params: Promise.resolve({ id }) });
}

function linha(over: Partial<MaterialListItem>): MaterialListItem {
  return {
    id: "l",
    listId: "lista-1",
    itemId: "it",
    qty: 1,
    critical: false,
    position: 0,
    ...over,
  };
}

beforeEach(() => {
  authed.ok = true;
  linhas.existentes = [];
  vi.clearAllMocks();
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LINHA NOVA NASCE NO FIM — SEMPRE, E NÃO EM CIMA DE OUTRA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A posição vinha do NÚMERO de linhas existentes, o que só coincide com o fim
 * enquanto ninguém apagar nada. Numa lista de cinco linhas (0…4) de onde se
 * tirou a do meio ficam quatro linhas com as posições 0, 1, 3 e 4 — e a linha
 * seguinte nascia na 4, empatada com uma que já lá estava. A partir daí a
 * ordem das duas é a que a base de dados quiser dar, e muda entre leituras:
 * quem prepara a carrinha vê a lista por uma ordem, e ao recarregar vê outra.
 */
describe("PATCH /api/material/listas/[id] — posição da linha nova", () => {
  it("não repete a posição de uma linha que já existe depois de se remover do meio", async () => {
    // Cinco linhas (0…4) menos a do meio.
    linhas.existentes = [0, 1, 3, 4].map((p, i) => linha({ id: `l${i}`, position: p }));
    await patch("lista-1", { linha: { itemId: "copo" } });
    expect(linhas.add).toHaveBeenCalledWith(expect.objectContaining({ position: 5 }));
  });

  it("a primeira linha de uma lista vazia fica na posição 0", async () => {
    await patch("lista-1", { linha: { itemId: "copo" } });
    expect(linhas.add).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }));
  });

  it("uma lista reordenada à mão continua a receber a linha nova no fim", async () => {
    // Arrastar linhas deixa posições que não são 0,1,2… — e podem ser negativas
    // ou saltadas. O que conta é o máximo.
    linhas.existentes = [linha({ id: "a", position: 12 }), linha({ id: "b", position: 3 })];
    await patch("lista-1", { linha: { itemId: "copo" } });
    expect(linhas.add).toHaveBeenCalledWith(expect.objectContaining({ position: 13 }));
  });
});

describe("PATCH /api/material/listas/[id] — o resto do contrato", () => {
  it("401 sem sessão, e nada é escrito", async () => {
    authed.ok = false;
    expect((await patch("lista-1", { linha: { itemId: "copo" } })).status).toBe(401);
    expect(linhas.add).not.toHaveBeenCalled();
  });

  it("400 quando a linha vem sem item", async () => {
    expect((await patch("lista-1", { linha: {} })).status).toBe(400);
    expect(linhas.add).not.toHaveBeenCalled();
  });
});
