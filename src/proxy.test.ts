import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function req(path: string, method = "GET"): NextRequest {
  return new NextRequest(new URL(`https://liquen.test${path}`), { method });
}

describe("proxy — /admin short link", () => {
  it("redirects /admin → /orcamento/admin (307, so it isn't hard-cached)", () => {
    const res = proxy(req("/admin"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/orcamento/admin");
  });

  it("redirects the trailing-slash variant /admin/ too", () => {
    const res = proxy(req("/admin/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/orcamento/admin");
  });

  it("does not hijack the /api/admin/* endpoints (handled by the api branch)", () => {
    const res = proxy(req("/api/admin/login", "POST"));
    // No Origin header → CSRF check passes; this must NOT become a /admin redirect.
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves an unrelated path like /administracao to the normal locale rewrite", () => {
    const res = proxy(req("/administracao"));
    // Rewrite (not a redirect) onto the internal /{lang} segment.
    expect(res.headers.get("location")).toBeNull();
  });
});
