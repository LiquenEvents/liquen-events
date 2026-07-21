import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { MessageLink } from "@/lib/inbox-types";

/**
 * Adversarial QA for the inbox overlay route (message ↔ pedido linking).
 *
 * The store is mocked with a faithful in-memory overlay so the ROUTE's
 * orchestration (which fields it touches, and which it preserves) is exercised
 * end-to-end, exactly like the sibling route.test.ts.
 */
const authState = vi.hoisted(() => ({ authed: true }));
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
  // upsertLink merges a partial patch over the stored row — the real store's
  // read-merge-write semantics (Repository.update = { ...current, ...patch }).
  const upsert = (id: string, patch: Partial<MessageLink>): MessageLink => {
    const next = { ...ensure(id), ...patch };
    db.store.set(id, next);
    return next;
  };
  return {
    getLink: vi.fn(async (id: string) => db.store.get(id) ?? null),
    listLinks: vi.fn(async () => [...db.store.values()]),
    listLinksForQuote: vi.fn(async (q: string) =>
      [...db.store.values()].filter((l) => l.quoteId === q),
    ),
    upsertLink: vi.fn(async (id: string, patch: Partial<MessageLink>) => upsert(id, patch)),
    // Mirrors the real store: linkToQuote ALWAYS writes both keys.
    linkToQuote: vi.fn(async (id: string, quoteId?: string, proposalId?: string) =>
      upsert(id, { quoteId, proposalId }),
    ),
    setPinned: vi.fn(async (id: string, pinned: boolean) => upsert(id, { pinned })),
    setArchived: vi.fn(async (id: string, archived: boolean) =>
      upsert(id, { archivedAt: archived ? "2026-07-01T00:00:00.000Z" : undefined }),
    ),
    toggleLabel: vi.fn(async (id: string, label: string) => {
      const cur = ensure(id);
      const labels = cur.labels.includes(label)
        ? cur.labels.filter((l) => l !== label)
        : [...cur.labels, label];
      return upsert(id, { labels });
    }),
  };
});

import { POST } from "./route";

function post(body: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/inbox/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function seed(link: Partial<MessageLink> & { messageId: string }): void {
  db.store.set(link.messageId, {
    labels: [],
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...link,
  });
}

beforeEach(() => {
  authState.authed = true;
  db.store.clear();
  vi.clearAllMocks();
});

describe("POST /api/inbox/link — a partial link update must not clobber the OTHER link", () => {
  // The schema documents: "null clears the link; a string sets it; absent leaves
  // it untouched." A message can be linked to BOTH a pedido (quoteId) and a
  // proposal (proposalId). Touching one must leave the other intact.

  it("setting quoteId on a message that already has a proposalId preserves proposalId", async () => {
    seed({ messageId: "<both@x>", quoteId: "q-old", proposalId: "p1" });
    const res = await POST(post({ messageId: "<both@x>", quoteId: "q-new" }));
    expect(res.status).toBe(200);
    const link = (await res.json()).link;
    expect(link.quoteId).toBe("q-new");
    // absent proposalId in the body → must remain "p1", not be wiped to undefined.
    expect(link.proposalId).toBe("p1");
  });

  it("setting proposalId on a message that already has a quoteId preserves quoteId", async () => {
    seed({ messageId: "<both2@x>", quoteId: "q1", proposalId: "p-old" });
    const res = await POST(post({ messageId: "<both2@x>", proposalId: "p-new" }));
    const link = (await res.json()).link;
    expect(link.proposalId).toBe("p-new");
    expect(link.quoteId).toBe("q1");
  });

  it("quoteId:null still explicitly clears the quote link (and leaves proposalId)", async () => {
    seed({ messageId: "<clr@x>", quoteId: "q1", proposalId: "p1" });
    const res = await POST(post({ messageId: "<clr@x>", quoteId: null }));
    const link = (await res.json()).link;
    expect(link.quoteId).toBeUndefined();
    expect(link.proposalId).toBe("p1");
  });
});
