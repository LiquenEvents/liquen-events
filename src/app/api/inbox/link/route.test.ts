import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { MessageLink } from "@/lib/inbox-types";

const authState = vi.hoisted(() => ({ authed: true }));
// In-memory overlay so the route's orchestration is tested end-to-end.
const db = vi.hoisted(() => ({ store: new Map<string, MessageLink>() }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

vi.mock("@/lib/message-links-store", () => {
  const ensure = (id: string): MessageLink =>
    db.store.get(id) ?? {
      messageId: id,
      labels: [],
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  return {
    getLink: vi.fn(async (id: string) => db.store.get(id) ?? null),
    listLinks: vi.fn(async () => [...db.store.values()]),
    listLinksForQuote: vi.fn(async (q: string) =>
      [...db.store.values()].filter((l) => l.quoteId === q),
    ),
    upsertLink: vi.fn(async (id: string, patch: Partial<MessageLink>) => {
      const next = { ...ensure(id), ...patch };
      db.store.set(id, next);
      return next;
    }),
    linkToQuote: vi.fn(async (id: string, quoteId?: string, proposalId?: string) => {
      const next = { ...ensure(id), quoteId, proposalId };
      db.store.set(id, next);
      return next;
    }),
    setPinned: vi.fn(async (id: string, pinned: boolean) => {
      const next = { ...ensure(id), pinned };
      db.store.set(id, next);
      return next;
    }),
    setArchived: vi.fn(async (id: string, archived: boolean) => {
      const next = { ...ensure(id), archivedAt: archived ? "2026-07-01T00:00:00.000Z" : undefined };
      db.store.set(id, next);
      return next;
    }),
    toggleLabel: vi.fn(async (id: string, label: string) => {
      const cur = ensure(id);
      const labels = cur.labels.includes(label)
        ? cur.labels.filter((l) => l !== label)
        : [...cur.labels, label];
      const next = { ...cur, labels };
      db.store.set(id, next);
      return next;
    }),
  };
});

import { GET, POST } from "./route";
import { linkToQuote, setArchived } from "@/lib/message-links-store";

function post(body: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/inbox/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}
function get(qs = ""): NextRequest {
  return new Request(`https://liquen.test/api/inbox/link${qs}`) as unknown as NextRequest;
}

beforeEach(() => {
  authState.authed = true;
  db.store.clear();
  vi.clearAllMocks();
});

describe("POST /api/inbox/link", () => {
  it("links a message to a quote", async () => {
    const res = await POST(post({ messageId: "<m1@x>", quoteId: "q1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.link).toMatchObject({ messageId: "<m1@x>", quoteId: "q1" });
    expect(linkToQuote).toHaveBeenCalledWith("<m1@x>", "q1", undefined);
  });

  it("clears the quote link when quoteId is null", async () => {
    db.store.set("<m2@x>", {
      messageId: "<m2@x>",
      quoteId: "q1",
      labels: [],
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const res = await POST(post({ messageId: "<m2@x>", quoteId: null }));
    expect((await res.json()).link.quoteId).toBeUndefined();
    expect(linkToQuote).toHaveBeenCalledWith("<m2@x>", undefined, undefined);
  });

  it("toggles a label", async () => {
    const res = await POST(post({ messageId: "<m3@x>", toggleLabel: "urgente" }));
    expect((await res.json()).link.labels).toEqual(["urgente"]);
  });

  it("archives a message (maps to archivedAt, never a delete)", async () => {
    const res = await POST(post({ messageId: "<m4@x>", archived: true }));
    expect((await res.json()).link.archivedAt).toBeTruthy();
    expect(setArchived).toHaveBeenCalledWith("<m4@x>", true);
  });

  it("returns/creates the overlay when no mutation is provided", async () => {
    const res = await POST(post({ messageId: "<m5@x>" }));
    expect(res.status).toBe(200);
    expect((await res.json()).link).toMatchObject({ messageId: "<m5@x>" });
  });

  it("401 without auth", async () => {
    authState.authed = false;
    expect((await POST(post({ messageId: "<m@x>" }))).status).toBe(401);
  });

  it("400 without a messageId", async () => {
    expect((await POST(post({ quoteId: "q1" }))).status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    expect((await POST(post("{ bad", true))).status).toBe(400);
  });
});

describe("GET /api/inbox/link", () => {
  it("returns one overlay by messageId", async () => {
    db.store.set("<g1@x>", {
      messageId: "<g1@x>",
      quoteId: "q1",
      labels: [],
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const res = await GET(get("?messageId=<g1@x>"));
    expect((await res.json()).link).toMatchObject({ messageId: "<g1@x>" });
  });

  it("lists overlays for a quote", async () => {
    db.store.set("<g2@x>", {
      messageId: "<g2@x>",
      quoteId: "q9",
      labels: [],
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const res = await GET(get("?quoteId=q9"));
    expect((await res.json()).links).toHaveLength(1);
  });

  it("401 without auth", async () => {
    authState.authed = false;
    expect((await GET(get())).status).toBe(401);
  });
});
