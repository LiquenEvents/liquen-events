import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { InboxItem } from "@/lib/inbox-types";

const authState = vi.hoisted(() => ({ authed: true }));
const imap = vi.hoisted(() => ({
  configured: true,
  list: vi.fn(async (_opts: unknown): Promise<InboxItem[]> => []),
}));
const overlay = vi.hoisted(() => ({
  listLinks: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/inbox", () => ({
  imapConfigured: () => imap.configured,
  listInbox: imap.list,
}));
vi.mock("@/lib/message-links-store", () => ({ listLinks: overlay.listLinks }));

import { GET } from "./route";

function get(qs = ""): NextRequest {
  return new Request(`https://liquen.test/api/inbox${qs}`) as unknown as NextRequest;
}

function msg(over: Partial<InboxItem> = {}): InboxItem {
  return {
    uid: 1,
    from: "Ana",
    fromAddress: "ana@x.pt",
    subject: "Olá",
    date: "2026-07-01T00:00:00.000Z",
    seen: false,
    messageId: "<m1@x>",
    references: [],
    attachments: [],
    ...over,
  };
}

beforeEach(() => {
  authState.authed = true;
  imap.configured = true;
  imap.list.mockReset();
  imap.list.mockResolvedValue([]);
  overlay.listLinks.mockReset();
  overlay.listLinks.mockResolvedValue([]);
  vi.clearAllMocks();
});

describe("GET /api/inbox", () => {
  it("401 without auth (and never touches IMAP)", async () => {
    authState.authed = false;
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(imap.list).not.toHaveBeenCalled();
  });

  it("returns configured:false, messages:[] when IMAP is not configured (200, no list call)", async () => {
    imap.configured = false;
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false, messages: [] });
    expect(imap.list).not.toHaveBeenCalled();
  });

  it("empty inbox → 200 with configured:true and messages:[]", async () => {
    imap.list.mockResolvedValue([]);
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, messages: [] });
  });

  it("IMAP error → 502 (not 500) and does not throw", async () => {
    imap.list.mockRejectedValue(new Error("IMAP connection refused"));
    const res = await GET(get());
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.messages).toEqual([]);
    expect(json.error).toBeTruthy();
  });

  it("passes q (trimmed) and numeric before to the IMAP layer", async () => {
    imap.list.mockResolvedValue([msg()]);
    await GET(get("?q=%20festa%20&before=42"));
    expect(imap.list).toHaveBeenCalledWith({ limit: 30, q: "festa", before: 42 });
  });

  it("limit boundary: limit=0 falls back to the default 30 (0 is falsy)", async () => {
    await GET(get("?limit=0"));
    expect(imap.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 30 }));
  });

  it("limit boundary: non-numeric limit falls back to the default 30", async () => {
    await GET(get("?limit=abc"));
    expect(imap.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 30 }));
  });

  it("limit boundary: a huge limit is forwarded (the store clamps it, not the route)", async () => {
    await GET(get("?limit=999999"));
    expect(imap.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 999999 }));
  });

  it("empty q string is treated as undefined (no filter)", async () => {
    await GET(get("?q=%20%20"));
    expect(imap.list).toHaveBeenCalledWith(expect.objectContaining({ q: undefined }));
  });

  it("enriches messages with the local overlay link when present", async () => {
    imap.list.mockResolvedValue([msg({ messageId: "<m1@x>" })]);
    overlay.listLinks.mockResolvedValue([
      {
        messageId: "<m1@x>",
        labels: ["urgente"],
        pinned: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const res = await GET(get());
    const json = await res.json();
    expect(json.messages[0].link).toMatchObject({ messageId: "<m1@x>", pinned: true });
  });

  it("overlay-store failure degrades gracefully: still 200 with un-enriched messages", async () => {
    imap.list.mockResolvedValue([msg({ messageId: "<m1@x>" })]);
    overlay.listLinks.mockRejectedValue(new Error("overlay down"));
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toHaveLength(1);
    expect(json.messages[0].link).toBeUndefined();
  });
});
