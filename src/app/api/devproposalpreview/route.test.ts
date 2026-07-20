import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

const render = vi.hoisted(() => ({ pdf: vi.fn(async () => new Uint8Array([1, 2, 3])) }));

// Keep the heavy PDF renderer and image reads out of the test: we only care
// about the production gate and that dev renders *a* PDF.
vi.mock("@/lib/proposal-doc-pdf", () => ({ renderProposalDocPdf: render.pdf }));
vi.mock("@/lib/proposal-doc", () => ({
  withProposalDefaults: (d: unknown) => d,
}));
vi.mock("node:fs", () => ({ readFileSync: vi.fn(() => Buffer.from("fake-image")) }));

import { GET } from "./route";

function get(qs = ""): NextRequest {
  const url = new URL(`https://liquen.test/api/devproposalpreview${qs}`);
  return { nextUrl: url, url: url.toString() } as unknown as NextRequest;
}

function setNodeEnv(v: string) {
  vi.stubEnv("NODE_ENV", v as "production" | "development" | "test");
}

beforeEach(() => {
  render.pdf.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/devproposalpreview", () => {
  it("SECURITY: returns 404 in production and never renders the sample (no leak)", async () => {
    setNodeEnv("production");
    const res = await GET(get());
    expect(res.status).toBe(404);
    expect(render.pdf).not.toHaveBeenCalled();
    // The dev sample data must not appear in a production response body.
    const body = await res.text();
    expect(body).not.toContain("Sofia");
    expect(body).toBe("Not found");
  });

  it("renders a PDF in development (decoracao template by default)", async () => {
    setNodeEnv("development");
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(render.pdf).toHaveBeenCalledTimes(1);
  });

  it("renders the organizacao template when ?t=org", async () => {
    setNodeEnv("development");
    const res = await GET(get("?t=org"));
    expect(res.status).toBe(200);
    const doc = (render.pdf.mock.calls[0] as unknown[])[0] as { template?: string };
    expect(doc.template).toBe("organizacao");
  });

  it("is gated on NODE_ENV, not on the ?t param — production 404s even with ?t=org", async () => {
    setNodeEnv("production");
    const res = await GET(get("?t=org"));
    expect(res.status).toBe(404);
    expect(render.pdf).not.toHaveBeenCalled();
  });
});
