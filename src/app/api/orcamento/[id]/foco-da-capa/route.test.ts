import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => auth.ok }));
vi.mock("@/lib/proposal-doc-render", () => ({
  focoAutomaticoDaCapa: vi.fn(async (c: string) =>
    c.endsWith("nao.jpg") ? null : { x: 0.5, y: 0.2 },
  ),
}));

import { GET } from "./route";

const pedir = (caminho?: string) =>
  GET(
    {
      nextUrl: new URL(
        `https://liquen.test/api/orcamento/q1/foco-da-capa${caminho !== undefined ? `?caminho=${encodeURIComponent(caminho)}` : ""}`,
      ),
    } as unknown as NextRequest,
    { params: Promise.resolve({ id: "q1" }) },
  );

describe("GET foco-da-capa", () => {
  it("devolve o recorte que o PDF faria sozinho", async () => {
    const res = await pedir("q1/capa.jpg");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, foco: { x: 0.5, y: 0.2 } });
  });

  it("sem sessão, 401", async () => {
    auth.ok = false;
    expect((await pedir("q1/capa.jpg")).status).toBe(401);
    auth.ok = true;
  });

  it.each([[""], ["../../etc/passwd"], ["https://outro.sitio/x.jpg"], [undefined]])(
    "um caminho que não é de armazenamento («%s») é recusado",
    async (c) => {
      expect((await pedir(c)).status).toBe(400);
    },
  );

  it("uma fotografia que não se lê dá 404", async () => {
    expect((await pedir("q1/nao.jpg")).status).toBe(404);
  });
});
