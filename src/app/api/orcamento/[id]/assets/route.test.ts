import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Adversarial coverage for the proposal-asset upload ─────────────────────
// Focus: the admin guard, the storage-not-configured 503, and strict payload
// validation — malformed multipart (400, not 500), no files (400), bad MIME
// (415), oversized (413), storage failure (502). We mock the storage layer so
// no Supabase is touched and assert it is only called for accepted files.
const st = vi.hoisted(() => ({
  authed: false,
  dbConfigured: true,
  upload: vi.fn(async (id: string) => ({ path: `${id}/x.jpg`, url: "https://signed/x.jpg" })),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/proposal-storage", () => ({ uploadProposalImage: st.upload }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "./route";

const MAX_BYTES = 12 * 1024 * 1024;

function file(name: string, type: string, size = 8): File {
  return new File([new Uint8Array(size)], name, { type });
}

function uploadReq(files: File[], id = "q-1"): [NextRequest, { params: Promise<{ id: string }> }] {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const req = new Request(`https://liquen.test/api/orcamento/${id}/assets`, {
    method: "POST",
    body: fd,
  }) as unknown as NextRequest;
  return [req, { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/assets", () => {
  it("401s the unauthenticated and never uploads", async () => {
    st.authed = false;
    const [req, ctx] = uploadReq([file("a.jpg", "image/jpeg")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("503s when storage (Supabase) is not configured", async () => {
    st.dbConfigured = false;
    const [req, ctx] = uploadReq([file("a.jpg", "image/jpeg")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(503);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("400 (not 500) on a malformed / non-multipart body", async () => {
    const req = new Request("https://liquen.test/api/orcamento/q-1/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not multipart",
    }) as unknown as NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: "q-1" }) });
    expect(res.status).toBe(400);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("400 when no files are present in the form", async () => {
    const [req, ctx] = uploadReq([]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("415 on an unsupported file type (e.g. a PDF or SVG), before any upload", async () => {
    const [req, ctx] = uploadReq([file("evil.svg", "image/svg+xml")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(415);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("413 on an oversized image (> 12 MB) without reading it into storage", async () => {
    const [req, ctx] = uploadReq([file("huge.jpg", "image/jpeg", MAX_BYTES + 1)]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(413);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("accepts JPG/PNG/WEBP and returns the stored path + signed url", async () => {
    const [req, ctx] = uploadReq([
      file("a.jpg", "image/jpeg"),
      file("b.png", "image/png"),
      file("c.webp", "image/webp"),
    ]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.images).toHaveLength(3);
    expect(st.upload).toHaveBeenCalledTimes(3);
    expect(st.upload).toHaveBeenCalledWith("q-1", expect.any(Buffer), "image/jpeg");
  });

  it("rejects the whole batch (415) as soon as one file has a bad type, before uploading the good one", async () => {
    const [req, ctx] = uploadReq([file("bad.gif", "image/gif"), file("ok.png", "image/png")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(415);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("502 when the storage layer fails to persist an image", async () => {
    st.upload.mockResolvedValueOnce(null as unknown as { path: string; url: string });
    const [req, ctx] = uploadReq([file("a.jpg", "image/jpeg")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(502);
  });
});
