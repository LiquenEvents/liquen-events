import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTH-GUARD AUDIT — one place that verifies EVERY API route enforces the
 * protection it is supposed to. It is deliberately data-driven so a NEW route
 * (or a new method on an existing one) is only "covered" once it appears in the
 * table below — the table is the contract, and a regression fails loudly here.
 *
 * Three classes of route, each pinned to its intended gate:
 *
 *  1. ADMIN-SESSION  — back-office CRUD. MUST reject an unauthenticated caller
 *                      with 401 *before touching its store*. We invoke the real
 *                      handler with no session and assert (a) 401 and (b) that
 *                      NOT A SINGLE store function ran (no read, no write). The
 *                      request bodies are valid-ish, so a missing guard would let
 *                      the handler fall through into a store write — which the
 *                      empty-call-log assertion catches.
 *
 *  2. PUBLIC         — health, csp-report, the public quote POST, the public
 *                      confirmation GET, admin login/logout. Asserted REACHABLE
 *                      without a session (never 401 for lack of one).
 *
 *  3. TOKEN / SECRET — portal PDFs + the proposal accept POST (signed token,
 *                      404/401 on a bad token), cron (CRON_SECRET, fails closed
 *                      in prod), devproposalpreview (dev-only, 404 in prod).
 *
 * The auth mock mirrors every existing route test: `@/lib/admin-auth` keeps its
 * real exports (cookie names, token signing) but `isAuthed()` returns a flag we
 * control. Every side-effecting module (stores, mail, push, PDF renderers,
 * supabase…) is mocked with logging spies that append "<module>.<fn>" to a shared
 * `calls` array, so "did the handler touch its store?" is a single assertion.
 * Pure modules (validation, tokens, rate-limit, money…) stay real so the gates
 * they implement are exercised for real.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Controls isAuthed(); flipped per-test.
const authed = vi.hoisted(() => ({ ok: false }));

// Shared harness: a call log + a factory that turns a list of export names into
// logging spies (plus literal `extra` exports for constants / sync gates).
const H = vi.hoisted(() => {
  const calls: string[] = [];
  const afn = (label: string, impl?: (...a: unknown[]) => unknown) =>
    vi.fn(async (...a: unknown[]) => {
      calls.push(label);
      return impl ? impl(...a) : undefined;
    });
  const build = (name: string, names: string[], extra: Record<string, unknown> = {}) => {
    const mod: Record<string, unknown> = {};
    for (const n of names) mod[n] = afn(`${name}.${n}`);
    return Object.assign(mod, extra);
  };
  return { calls, afn, build };
});

// ── Auth: keep real module, override only the guard ──────────────────────────
vi.mock("@/lib/admin-auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin-auth")>()),
  isAuthed: () => authed.ok,
}));

// ── Stores + side-effecting libs (logging spies) ─────────────────────────────
// A handful of exports get real-ish returns / sync gates so the PUBLIC + SECRET
// happy paths that legitimately run don't crash on `undefined`.
vi.mock("@/lib/quotes-store", () =>
  H.build(
    "quotes-store",
    [
      "createQuote",
      "deleteQuote",
      "generateQuoteId",
      "getQuote",
      "quoteIdFor",
      "updateQuote",
      "updateQuoteWith",
    ],
    { listQuotes: H.afn("quotes-store.listQuotes", async () => []) },
  ),
);
vi.mock("@/lib/proposals-store", () =>
  H.build("proposals-store", [
    "createProposal",
    "getProposal",
    "getProposalByQuote",
    "listAllProposals",
    "listProposalsForQuote",
    "updateProposal",
  ]),
);
vi.mock("@/lib/tasks-store", () =>
  H.build("tasks-store", ["createTask", "deleteTask", "listTasks", "updateTask"]),
);
vi.mock("@/lib/calendar-store", () =>
  H.build("calendar-store", ["createCalendarEvent", "deleteCalendarEvent"], {
    listCalendarEvents: H.afn("calendar-store.listCalendarEvents", async () => []),
  }),
);
vi.mock("@/lib/suppliers-store", () =>
  H.build("suppliers-store", [
    "createSupplier",
    "deleteSupplier",
    "listSuppliers",
    "updateSupplier",
  ]),
);
vi.mock("@/lib/inventory-store", () =>
  H.build("inventory-store", ["createItem", "deleteItem", "listItems", "updateItem"], {
    PROP_CATEGORIES: ["Outro"],
  }),
);
vi.mock("@/lib/invoices-store", () =>
  H.build("invoices-store", [
    "listInvoices",
    "listInvoicesForQuote",
    "createInvoice",
    "updateInvoice",
    "deleteInvoice",
    "getInvoice",
    "nextInvoiceNumber",
    "newInvoiceId",
    "splitThirtySeventy",
    "isUniqueViolation",
  ]),
);
vi.mock("@/lib/contracts-store", () =>
  H.build("contracts-store", [
    "createContractIfAbsent",
    "getAcceptedContractByQuote",
    "getContract",
    "listContracts",
    "newContractId",
  ]),
);
vi.mock("@/lib/email-templates-store", () =>
  H.build("email-templates-store", ["listTemplatesWithDefaults", "upsertTemplate"]),
);
vi.mock("@/lib/message-links-store", () =>
  H.build("message-links-store", [
    "getLink",
    "listLinks",
    "listLinksForQuote",
    "linkToQuote",
    "setArchived",
    "setPinned",
    "toggleLabel",
    "upsertLink",
  ]),
);
vi.mock("@/lib/app-state", () => H.build("app-state", ["getState", "setState"]));
vi.mock("@/lib/followups", () =>
  H.build("followups", ["computeFollowUps", "withInvoiceFollowUps"]),
);
vi.mock("@/lib/mail", () =>
  H.build("mail", ["sendMail"], { esc: (s: string) => s, MAIL_TO: "team@liquen.test" }),
);
vi.mock("@/lib/push", () =>
  H.build("push", ["removeSubscription", "saveSubscription"], {
    pushConfigured: () => false,
    sendPushToAll: H.afn("push.sendPushToAll", async () => ({ sent: 0 })),
  }),
);
vi.mock("@/lib/inbox", () =>
  H.build("inbox", ["listInbox", "getInboxMessage", "setFlags"], { imapConfigured: () => false }),
);
vi.mock("@/lib/proposal-storage", () => H.build("proposal-storage", ["uploadProposalImage"]));
vi.mock("@/lib/supabase", () =>
  H.build("supabase", [], { getSupabase: () => null, isDatabaseConfigured: () => false }),
);
// PDF renderers — mocked so pdf-lib / sharp never load in the audit.
vi.mock("@/lib/contract-pdf", () => H.build("contract-pdf", ["renderContractPdf"]));
vi.mock("@/lib/invoice-pdf", () => H.build("invoice-pdf", ["renderInvoicePdf"]));
vi.mock("@/lib/proposal-pdf", () => H.build("proposal-pdf", ["renderProposalPdf"]));
vi.mock("@/lib/proposal-doc-pdf", () => H.build("proposal-doc-pdf", ["renderProposalDocPdf"]));
vi.mock("@/lib/proposal-doc-render", () =>
  H.build("proposal-doc-render", ["renderStoredProposalDocPdf"]),
);

const { calls } = H;

// A body wide enough that, were a guard missing, the handler would proceed into
// its validation / write path (making the "store untouched" assertion meaningful).
const BODY = {
  title: "Audit",
  name: "Audit",
  key: "audit",
  subject: "Audit",
  body: "Audit",
  message: "Olá",
  to: "cliente@exemplo.pt",
  amount: 100,
  status: "enviada",
  messageId: "<m@x>",
  seen: true,
};

function req(
  method: string,
  path = "/api/x",
  body?: unknown,
  headers: Record<string, string> = {},
  raw = false,
) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== undefined) init.body = raw ? (body as string) : JSON.stringify(body);
  return new NextRequest(`https://liquen.test${path}`, init);
}

// A route context whose params satisfy every dynamic segment used in the tree.
const ctx = () => ({ params: Promise.resolve({ id: "id-1", uid: "1", token: "bad-token" }) });

async function handler(routePath: string, method: string) {
  const mod = (await import(/* @vite-ignore */ routePath)) as Record<
    string,
    (r: NextRequest, c?: unknown) => Promise<Response>
  >;
  return mod[method];
}

beforeEach(() => {
  authed.ok = false;
  calls.length = 0;
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. ADMIN-SESSION routes: route → guarded methods. (params = dynamic segment.)
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN: Array<{ path: string; methods: string[] }> = [
  { path: "./backup/route", methods: ["GET"] },
  { path: "./calendario/route", methods: ["GET", "POST"] },
  { path: "./calendario/[id]/route", methods: ["DELETE"] },
  { path: "./contratos/route", methods: ["GET"] },
  { path: "./contratos/[id]/pdf/route", methods: ["GET"] },
  { path: "./email-templates/route", methods: ["GET", "POST", "PUT"] },
  { path: "./faturas/route", methods: ["GET", "POST"] },
  { path: "./faturas/[id]/route", methods: ["GET", "PATCH", "DELETE"] },
  { path: "./followups/route", methods: ["GET"] },
  { path: "./fornecedores/route", methods: ["GET", "POST"] },
  { path: "./fornecedores/[id]/route", methods: ["PATCH", "DELETE"] },
  { path: "./inbox/route", methods: ["GET"] },
  { path: "./inbox/[uid]/route", methods: ["GET"] },
  { path: "./inbox/[uid]/flags/route", methods: ["POST"] },
  { path: "./inbox/link/route", methods: ["GET", "POST"] },
  { path: "./inbox/reply/route", methods: ["POST"] },
  { path: "./inventario/route", methods: ["GET", "POST"] },
  { path: "./inventario/[id]/route", methods: ["PATCH", "DELETE"] },
  { path: "./orcamento/route", methods: ["GET"] }, // POST = PUBLIC quote form (below)
  { path: "./orcamento/[id]/route", methods: ["PATCH", "DELETE"] }, // GET partly public (below)
  { path: "./orcamento/[id]/assets/route", methods: ["POST"] },
  { path: "./orcamento/[id]/fatura/route", methods: ["POST"] },
  { path: "./orcamento/[id]/mensagem/route", methods: ["POST"] },
  { path: "./orcamento/[id]/proposta/route", methods: ["GET", "POST"] },
  { path: "./orcamento/[id]/proposta-doc/route", methods: ["POST"] },
  { path: "./orcamento/manual/route", methods: ["POST"] },
  { path: "./propostas/route", methods: ["GET"] },
  { path: "./propostas/[id]/route", methods: ["PATCH"] },
  { path: "./push/subscribe/route", methods: ["GET", "POST", "DELETE"] },
  { path: "./tarefas/route", methods: ["GET", "POST"] },
  { path: "./tarefas/[id]/route", methods: ["PATCH", "DELETE"] },
];

describe("ADMIN-SESSION routes reject the unauthenticated before touching the store", () => {
  for (const route of ADMIN) {
    for (const method of route.methods) {
      it(`${method} ${route.path} → 401 and no store access`, async () => {
        const fn = await handler(route.path, method);
        expect(fn, `${method} ${route.path} is not exported`).toBeTypeOf("function");
        const hasBody = method !== "GET" && method !== "DELETE";
        const res = await fn(req(method, "/api/x", hasBody ? BODY : undefined), ctx());
        expect(res.status, `${method} ${route.path} must be 401 without a session`).toBe(401);
        // The guard runs first, so nothing in the data layer should have executed.
        expect(calls, `${method} ${route.path} reached its store while unauthenticated`).toEqual(
          [],
        );
      });
    }
  }

  // Guard-sanity: prove the 401s above are truly gated on auth, not a blanket
  // failure. With a session, the same handlers proceed INTO their store.
  it("GET /api/tarefas passes the guard for an authenticated admin (reaches the store)", async () => {
    authed.ok = true;
    const fn = await handler("./tarefas/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
    expect(calls).toContain("tasks-store.listTasks");
  });

  it("GET /api/calendario passes the guard for an authenticated admin (reaches the store)", async () => {
    authed.ok = true;
    const fn = await handler("./calendario/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
    expect(calls).toContain("calendar-store.listCalendarEvents");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PUBLIC routes: reachable WITHOUT a session (never 401 for lack of one).
// ─────────────────────────────────────────────────────────────────────────────
describe("PUBLIC routes stay reachable without a session", () => {
  it("GET /api/health responds 200 (no session required)", async () => {
    const fn = await handler("./health/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).toBe(200);
  });

  it("POST /api/security/csp-report accepts a report unauthenticated", async () => {
    const fn = await handler("./security/csp-report/route", "POST");
    const res = await fn(req("POST", "/api/security/csp-report", { "csp-report": {} }), ctx());
    // Public report sink: 204 accepted (or 429 if rate-limited) — never an auth wall.
    expect([204, 429]).toContain(res.status);
  });

  it("POST /api/orcamento (public quote form) is processed, not auth-gated", async () => {
    const fn = await handler("./orcamento/route", "POST");
    // A structurally-invalid payload → 400 from validation, proving the route is
    // reachable without a session (a 401 here would mean it got locked).
    const res = await fn(req("POST", "/api/orcamento", { junk: true }), ctx());
    expect(res.status).toBe(400);
    expect(calls).not.toContain("quotes-store.createQuote");
  });

  it("GET /api/orcamento/[id] serves the public confirmation view unauthenticated", async () => {
    const fn = await handler("./orcamento/[id]/route", "GET");
    const res = await fn(req("GET"), ctx());
    // getQuote is mocked → undefined → 404 (not found), but crucially NOT 401:
    // the endpoint is reachable by reference id without a session.
    expect(res.status).not.toBe(401);
    expect(calls).toContain("quotes-store.getQuote");
  });

  it("POST /api/admin/login is reachable without a session (malformed body → 400)", async () => {
    const fn = await handler("./admin/login/route", "POST");
    const res = await fn(req("POST", "/api/admin/login", "{ not json", {}, true), ctx());
    expect(res.status).toBe(400);
  });

  it("POST /api/admin/logout always succeeds (clears the cookie, no session needed)", async () => {
    const fn = await handler("./admin/logout/route", "POST");
    const res = await fn(req("POST"), ctx());
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TOKEN-guarded routes: a bad token must NOT resolve (404/401), never a leak.
// ─────────────────────────────────────────────────────────────────────────────
describe("TOKEN-guarded routes deny a bad token", () => {
  it("GET /api/portal/[token]/proposta-pdf → 404 on a bad token", async () => {
    const fn = await handler("./portal/[token]/proposta-pdf/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).toBe(404);
    expect(calls).toEqual([]); // never reached the quote / proposal store
  });

  it("GET /api/portal/[token]/contrato-pdf → 404 on a bad token", async () => {
    const fn = await handler("./portal/[token]/contrato-pdf/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("POST /api/proposta (accept link) → 401 on a bad/forged token, no mutation", async () => {
    const fn = await handler("./proposta/route", "POST");
    const res = await fn(
      req("POST", "/api/proposta", { token: "bad-token", action: "aceitar" }),
      ctx(),
    );
    expect(res.status).toBe(401);
    expect(calls).not.toContain("proposals-store.updateProposal");
    expect(calls).not.toContain("contracts-store.createContractIfAbsent");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SECRET / DEV-gated routes.
// ─────────────────────────────────────────────────────────────────────────────
describe("SECRET-guarded cron routes fail closed", () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const path of ["./cron/reminders/route", "./cron/inbox-check/route"]) {
    it(`GET ${path} → 401 in production with no CRON_SECRET, and never scans`, async () => {
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("NODE_ENV", "production");
      const fn = await handler(path, "GET");
      const res = await fn(req("GET", "/api/cron"), ctx());
      expect(res.status).toBe(401);
      expect(calls).toEqual([]);
    });

    it(`GET ${path} → not 401 with the correct Bearer secret`, async () => {
      vi.stubEnv("CRON_SECRET", "top-secret");
      const fn = await handler(path, "GET");
      const res = await fn(
        req("GET", "/api/cron", undefined, { authorization: "Bearer top-secret" }),
        ctx(),
      );
      expect(res.status).not.toBe(401);
    });
  }

  it("a logged-in admin may trigger cron without any secret header", async () => {
    vi.stubEnv("CRON_SECRET", "top-secret");
    authed.ok = true;
    const fn = await handler("./cron/reminders/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
  });
});

describe("DEV-only preview is not exposed in production", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("GET /api/devproposalpreview → 404 in production (never renders the sample)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fn = await handler("./devproposalpreview/route", "GET");
    const url = new URL("https://liquen.test/api/devproposalpreview");
    const res = await fn({ nextUrl: url, url: url.toString() } as unknown as NextRequest, ctx());
    expect(res.status).toBe(404);
    expect(calls).not.toContain("proposal-doc-pdf.renderProposalDocPdf");
  });
});
