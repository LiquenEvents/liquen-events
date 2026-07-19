import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MessageLink } from "./inbox-types";

// In-memory stand-in for the shared Repository so the store logic (upsert,
// toggle, archive) is tested without touching Supabase or the dev data/ file.
const mem = vi.hoisted(() => ({ store: new Map<string, MessageLink>() }));

vi.mock("./repository", () => ({
  createRepository: () => ({
    list: async () => [...mem.store.values()],
    get: async (id: string) => mem.store.get(id) ?? null,
    where: async (_col: string, _val: unknown, predicate: (l: MessageLink) => boolean) =>
      [...mem.store.values()].filter(predicate),
    create: async (e: MessageLink) => {
      mem.store.set(e.messageId, e);
    },
    update: async (id: string, patch: Partial<MessageLink>) => {
      const cur = mem.store.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      mem.store.set(id, next);
      return next;
    },
  }),
}));

import {
  mapper,
  getLink,
  listLinks,
  listLinksForQuote,
  upsertLink,
  linkToQuote,
  setPinned,
  setArchived,
  toggleLabel,
} from "./message-links-store";

beforeEach(() => {
  mem.store.clear();
});

describe("mapper — row round-trip", () => {
  it("stores the Message-ID in the `id` column and round-trips every field", () => {
    const link: MessageLink = {
      messageId: "<abc@x.com>",
      quoteId: "q1",
      proposalId: "p1",
      labels: ["urgente", "cliente"],
      pinned: true,
      archivedAt: "2026-07-01T00:00:00.000Z",
      createdAt: "2026-06-01T00:00:00.000Z",
    };
    const row = mapper.toRow(link);
    expect(row.id).toBe("<abc@x.com>");
    expect(row.quote_id).toBe("q1");
    expect(row.labels).toEqual(["urgente", "cliente"]);
    expect(mapper.fromRow(row)).toEqual(link);
    expect(mapper.getId(link)).toBe("<abc@x.com>");
  });

  it("fromRow defaults labels to [] and coerces missing optionals to undefined", () => {
    const got = mapper.fromRow({ id: "<m@x>", created_at: "2026-01-01T00:00:00.000Z" });
    expect(got).toEqual({
      messageId: "<m@x>",
      quoteId: undefined,
      proposalId: undefined,
      labels: [],
      pinned: false,
      archivedAt: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("upsertLink", () => {
  it("creates a row with defaults on first touch", async () => {
    const link = await upsertLink("<m1@x>", {});
    expect(link).toMatchObject({ messageId: "<m1@x>", labels: [], pinned: false });
    expect(link.createdAt).toBeTruthy();
    expect(await getLink("<m1@x>")).toMatchObject({ messageId: "<m1@x>" });
  });

  it("merges a patch over an existing row without clobbering other fields", async () => {
    await upsertLink("<m2@x>", { pinned: true });
    const updated = await upsertLink("<m2@x>", { quoteId: "q9" });
    expect(updated).toMatchObject({ pinned: true, quoteId: "q9" });
  });
});

describe("toggleLabel", () => {
  it("adds a label when absent and removes it when present", async () => {
    const added = await toggleLabel("<m3@x>", "importante");
    expect(added.labels).toEqual(["importante"]);
    const removed = await toggleLabel("<m3@x>", "importante");
    expect(removed.labels).toEqual([]);
  });
});

describe("setArchived — hide, never delete", () => {
  it("sets archivedAt when archiving and clears it when un-archiving", async () => {
    const archived = await setArchived("<m4@x>", true);
    expect(archived.archivedAt).toBeTruthy();
    const restored = await setArchived("<m4@x>", false);
    expect(restored.archivedAt).toBeUndefined();
  });
});

describe("setPinned / linkToQuote / listLinksForQuote", () => {
  it("pins a message", async () => {
    expect((await setPinned("<m5@x>", true)).pinned).toBe(true);
  });

  it("links to a quote and lists overlays by quote", async () => {
    await linkToQuote("<m6@x>", "quote-7");
    await linkToQuote("<m7@x>", "quote-7");
    await linkToQuote("<m8@x>", "quote-other");
    const forSeven = await listLinksForQuote("quote-7");
    expect(forSeven.map((l) => l.messageId).sort()).toEqual(["<m6@x>", "<m7@x>"]);
    expect(await listLinks()).toHaveLength(3);
  });

  it("unlinks a quote when passed no id", async () => {
    await linkToQuote("<m9@x>", "quote-1");
    const cleared = await linkToQuote("<m9@x>");
    expect(cleared.quoteId).toBeUndefined();
  });
});
