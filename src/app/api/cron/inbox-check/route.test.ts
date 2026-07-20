import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Adversarial coverage for the inbox-check cron ──────────────────────────
// Focus: the CRON_SECRET Bearer guard, the IMAP-unconfigured no-op, the
// first-run high-water-mark seeding (no historical flood), and dedupe /
// idempotency — a second run over the same mail must NOT push again. The
// marker store is stateful so we can prove the double-send guard end to end.
const cfg = vi.hoisted(() => ({
  imap: true,
  items: [] as { uid: number; from: string; subject: string }[],
  sent: 3,
  authed: false,
}));
const state = vi.hoisted(() => ({ marker: null as number | null }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => cfg.authed }));
vi.mock("@/lib/inbox", () => ({
  imapConfigured: () => cfg.imap,
  listInbox: vi.fn(async () => cfg.items),
}));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: cfg.sent })) }));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async () => state.marker),
  setState: vi.fn(async (_k: string, v: number) => {
    state.marker = v;
  }),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";
import { listInbox } from "@/lib/inbox";
import { sendPushToAll } from "@/lib/push";

const SECRET = "cron-top-secret";

function req(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request("https://liquen.test/api/cron/inbox-check", {
    headers,
  }) as unknown as NextRequest;
}

function mail(uid: number): { uid: number; from: string; subject: string } {
  return { uid, from: `sender${uid}@x.com`, subject: `Assunto ${uid}` };
}

beforeEach(() => {
  cfg.imap = true;
  cfg.items = [];
  cfg.sent = 3;
  cfg.authed = false;
  state.marker = null;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/inbox-check — auth guard", () => {
  it("401s in production when CRON_SECRET is unset (fails closed) and never polls", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listInbox).not.toHaveBeenCalled();
  });

  it("401s with a missing/wrong Bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(listInbox).not.toHaveBeenCalled();
  });

  it("runs with the correct Bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/cron/inbox-check — polling logic", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", ""); // ambient NODE_ENV=test → runs free
  });

  it("no-ops (configured:false) when IMAP is not configured and never lists", async () => {
    cfg.imap = false;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false, sent: 0 });
    expect(listInbox).not.toHaveBeenCalled();
  });

  it("returns sent:0 on an empty inbox", async () => {
    cfg.items = [];
    const res = await GET(req());
    expect(await res.json()).toEqual({ sent: 0, reason: "inbox vazia" });
    expect(sendPushToAll).not.toHaveBeenCalled();
  });

  it("first run only seeds the high-water mark (no historical flood)", async () => {
    cfg.items = [mail(10), mail(12), mail(11)];
    const res = await GET(req());
    expect(await res.json()).toEqual({ sent: 0, initialized: 12 });
    expect(sendPushToAll).not.toHaveBeenCalled();
    expect(state.marker).toBe(12);
  });

  it("notifies about mail newer than the marker and advances it", async () => {
    state.marker = 12;
    cfg.items = [mail(12), mail(13), mail(14)];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 3, novos: 2 });
    expect(sendPushToAll).toHaveBeenCalledTimes(1);
    const push = (sendPushToAll as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as { title: string };
    expect(push.title).toBe("2 novos emails");
    expect(state.marker).toBe(14);
  });

  it("uses the singular title/body for a single new email", async () => {
    state.marker = 5;
    cfg.items = [mail(6)];
    await GET(req());
    const push = (sendPushToAll as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as { title: string; body: string };
    expect(push.title).toBe("Novo email");
    expect(push.body).toBe("sender6@x.com: Assunto 6");
  });

  it("is idempotent: a second run over the same mail does not push again", async () => {
    state.marker = 5;
    cfg.items = [mail(6), mail(7)];
    await GET(req()); // notifies, advances marker to 7
    expect(sendPushToAll).toHaveBeenCalledTimes(1);
    expect(state.marker).toBe(7);

    const res2 = await GET(req()); // same mail, marker already 7
    expect(await res2.json()).toEqual({ sent: 0 });
    expect(sendPushToAll).toHaveBeenCalledTimes(1); // no double send
  });

  it("returns 500 (not a crash) when the inbox listing throws", async () => {
    state.marker = 1;
    (listInbox as unknown as { mockRejectedValueOnce: (e: unknown) => void }).mockRejectedValueOnce(
      new Error("imap boom"),
    );
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(sendPushToAll).not.toHaveBeenCalled();
  });
});
