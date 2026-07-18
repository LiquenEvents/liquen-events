import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Contract } from "@/lib/contract-types";

// ── Mock auth + data + the heavy PDF renderer; keep the route logic real ──
const authed = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.value }));
vi.mock("@/lib/contracts-store", () => ({
  getContract: vi.fn(
    async (id: string): Promise<Contract | null> =>
      id === "c-1"
        ? {
            id: "c-1",
            quoteId: "q-1",
            proposalId: "p-1",
            clientName: "Maria",
            clientEmail: "m@example.com",
            termsVersion: "2026-01",
            termsSnapshot: "1. Objeto\nTexto.",
            status: "aceite",
            createdAt: "2026-07-01T10:00:00.000Z",
          }
        : null,
  ),
}));
vi.mock("@/lib/contract-pdf", () => ({
  renderContractPdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
}));

import { GET } from "./route";

const req = () =>
  new Request("https://liquen.test/api/contratos/c-1/pdf") as unknown as NextRequest;

beforeEach(() => {
  authed.value = false;
  vi.clearAllMocks();
});

describe("GET /api/contratos/[id]/pdf", () => {
  it("401s without an admin session", async () => {
    const res = await GET(req(), { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(401);
  });

  it("404s for an unknown contract when authed", async () => {
    authed.value = true;
    const res = await GET(req(), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("serves the PDF inline when authed", async () => {
    authed.value = true;
    const res = await GET(req(), { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
  });
});
