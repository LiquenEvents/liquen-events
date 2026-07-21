import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";
import type { CalendarEvent } from "@/lib/orcamento/types";

/**
 * Store-level coverage for the standalone calendar: create/list/delete through an
 * in-memory Repository fake plus the camelCase↔snake_case mapper (empty optionals
 * → null → undefined, kind default, createdAt fallback, event_date ordering).
 *
 * The Repository generic (Supabase/file backends, ordering, locking) is proven in
 * `repository.test.ts`; here we bind the store's OWN mapper to a minimal fake so
 * store logic (uuid + createdAt assignment, delegation, and the `fileCompare`
 * ordering the file backend applies) is tested without disk or Supabase.
 *
 * `list()` mirrors FileBackend.list — it sorts through `mapper.fileCompare` — so
 * the calendar's "event_date ascending" ordering is exercised for real.
 */
const db = vi.hoisted(() => ({ rows: new Map<string, unknown>(), captured: null as unknown }));

vi.mock("./repository", () => ({
  createRepository: (mapper: Mapper<CalendarEvent>) => {
    db.captured = mapper;
    return {
      list: async () => {
        const all = [...db.rows.values()] as CalendarEvent[];
        return mapper.fileCompare ? [...all].sort(mapper.fileCompare) : all;
      },
      get: async (id: string) => db.rows.get(id) ?? null,
      create: async (e: CalendarEvent) => {
        db.rows.set(mapper.getId(e), e);
      },
      remove: async (id: string) => {
        db.rows.delete(id);
      },
    };
  },
}));

import {
  mapper,
  createCalendarEvent,
  listCalendarEvents,
  deleteCalendarEvent,
} from "./calendar-store";

beforeEach(() => {
  db.rows.clear();
  vi.clearAllMocks();
});

const base = (over: Partial<CalendarEvent> = {}): Omit<CalendarEvent, "id" | "createdAt"> => ({
  date: "2026-05-01",
  title: "Reunião com cliente",
  kind: "reuniao",
  time: "10:30",
  note: "Trazer amostras",
  ...over,
});

// Seed a full domain object straight into the fake (bypasses uuid/createdAt
// assignment) so ordering tests can pin exact dates/timestamps.
const seed = (e: CalendarEvent) => db.rows.set(e.id, e);
const evt = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "x",
  date: "2026-05-01",
  title: "t",
  kind: "evento",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("calendar-store create/list/delete", () => {
  it("createCalendarEvent assigns a uuid and a createdAt, and persists", async () => {
    const e = await createCalendarEvent(base());
    expect(e.id).toMatch(/[0-9a-f-]{36}/);
    expect(e.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(e.createdAt))).toBe(false);
    expect((await listCalendarEvents())[0]).toEqual(e);
  });

  it("generates a distinct id per create (no collision on rapid inserts)", async () => {
    const a = await createCalendarEvent(base({ date: "2026-05-01" }));
    const b = await createCalendarEvent(base({ date: "2026-05-01" }));
    expect(a.id).not.toBe(b.id);
    expect(await listCalendarEvents()).toHaveLength(2);
  });

  it("ignores any caller-supplied id (server-assigned uuid only)", async () => {
    const e = await createCalendarEvent({
      ...base(),
      id: "evil",
      createdAt: "1999-01-01",
    } as Omit<CalendarEvent, "id" | "createdAt">);
    expect(e.id).not.toBe("evil");
    expect(e.createdAt).not.toBe("1999-01-01");
  });

  it("preserves every supplied field on the created event", async () => {
    const e = await createCalendarEvent(
      base({ date: "2026-09-09", title: "Bloqueio", kind: "bloqueio", time: "23:59", note: "n" }),
    );
    expect(e).toMatchObject({
      date: "2026-09-09",
      title: "Bloqueio",
      kind: "bloqueio",
      time: "23:59",
      note: "n",
    });
  });

  it("keeps optional time/note as undefined when omitted (no phantom empties)", async () => {
    const e = await createCalendarEvent(base({ time: undefined, note: undefined }));
    expect(e.time).toBeUndefined();
    expect(e.note).toBeUndefined();
  });

  it("listCalendarEvents on an empty store is [] (never null)", async () => {
    const list = await listCalendarEvents();
    expect(list).toEqual([]);
    expect(list).not.toBeNull();
  });

  it("deleteCalendarEvent removes only the target row", async () => {
    const a = await createCalendarEvent(base({ title: "A" }));
    const b = await createCalendarEvent(base({ title: "B" }));
    await deleteCalendarEvent(a.id);
    const rest = await listCalendarEvents();
    expect(rest).toHaveLength(1);
    expect(rest[0].id).toBe(b.id);
  });

  it("deleteCalendarEvent on an unknown id is a silent no-op (no throw)", async () => {
    await createCalendarEvent(base());
    await expect(deleteCalendarEvent("ghost")).resolves.toBeUndefined();
    expect(await listCalendarEvents()).toHaveLength(1);
  });
});

describe("calendar-store list ordering (event_date ascending)", () => {
  it("sorts by event_date ascending regardless of insertion order", async () => {
    seed(evt({ id: "c", date: "2026-12-31" }));
    seed(evt({ id: "a", date: "2026-01-01" }));
    seed(evt({ id: "b", date: "2026-06-15" }));
    expect((await listCalendarEvents()).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps insertion order for same-date ties (stable sort)", async () => {
    seed(evt({ id: "first", date: "2026-03-03" }));
    seed(evt({ id: "second", date: "2026-03-03" }));
    seed(evt({ id: "third", date: "2026-03-03" }));
    expect((await listCalendarEvents()).map((e) => e.id)).toEqual(["first", "second", "third"]);
  });

  it("orders an empty date-string ahead of real dates (localeCompare)", async () => {
    seed(evt({ id: "dated", date: "2026-01-01" }));
    seed(evt({ id: "blank", date: "" }));
    expect((await listCalendarEvents()).map((e) => e.id)).toEqual(["blank", "dated"]);
  });

  it("orders lexically-comparable ISO date strings correctly across months", async () => {
    seed(evt({ id: "sep", date: "2026-09-01" }));
    seed(evt({ id: "oct", date: "2026-10-01" }));
    seed(evt({ id: "aug", date: "2026-08-31" }));
    expect((await listCalendarEvents()).map((e) => e.id)).toEqual(["aug", "sep", "oct"]);
  });
});

describe("calendar mapper (camelCase ↔ snake_case)", () => {
  it("round-trips a fully-populated event", () => {
    const event: CalendarEvent = {
      id: "e1",
      date: "2026-05-01",
      title: "Reunião",
      kind: "reuniao",
      time: "10:30",
      note: "Amostras",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    // toRow deliberately omits created_at (the DB default fills it); inject it
    // back exactly as the file backend would have stored it.
    const row = { ...mapper.toRow(event), created_at: event.createdAt };
    expect(mapper.fromRow(row)).toEqual(event);
    expect(mapper.getId(event)).toBe("e1");
  });

  it("toRow does not project created_at (column is DB-defaulted, not written)", () => {
    const row = mapper.toRow({
      id: "e2",
      date: "2026-05-01",
      title: "t",
      kind: "evento",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(row).not.toHaveProperty("created_at");
  });

  it("empty time/note persist as null and read back as undefined (not '')", () => {
    const row = mapper.toRow({
      id: "e3",
      date: "2026-05-01",
      title: "Sem hora",
      kind: "evento",
      time: "",
      note: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(row.event_time).toBeNull();
    expect(row.note).toBeNull();
    const back = mapper.fromRow({ ...row, created_at: "2026-01-01T00:00:00.000Z" });
    expect(back.time).toBeUndefined();
    expect(back.note).toBeUndefined();
  });

  it("reads a null time/note column back as undefined", () => {
    const back = mapper.fromRow({
      id: "e4",
      event_date: "2026-05-01",
      title: "t",
      kind: "evento",
      event_time: null,
      note: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(back.time).toBeUndefined();
    expect(back.note).toBeUndefined();
  });

  it("defaults kind to 'evento' and date/title to '' on a bare row, with a createdAt fallback", () => {
    const back = mapper.fromRow({ id: "e5" });
    expect(back.date).toBe("");
    expect(back.title).toBe("");
    expect(back.kind).toBe("evento");
    expect(back.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(back.createdAt))).toBe(false);
  });

  it("coerces non-string id/date/title columns to strings", () => {
    const back = mapper.fromRow({ id: 42, event_date: 20260501, title: 7 });
    expect(back.id).toBe("42");
    expect(back.date).toBe("20260501");
    expect(back.title).toBe("7");
  });

  it("preserves a valid time that only looks falsy-adjacent ('00:00')", () => {
    const row = mapper.toRow({
      id: "e6",
      date: "2026-05-01",
      title: "Meia-noite",
      kind: "evento",
      time: "00:00",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    // "00:00" is a truthy string, so `e.time || null` keeps it.
    expect(row.event_time).toBe("00:00");
    expect(mapper.fromRow({ ...row, created_at: "x" }).time).toBe("00:00");
  });

  // NEEDS DECISION (pinned): fromRow only nullish-coalesces `kind`, so an
  // unknown/garbage value is passed THROUGH unchanged rather than snapped back
  // to "evento". The POST route validates kind against KINDS, but a row written
  // out-of-band (migration, manual edit, future enum value) surfaces verbatim.
  it("passes an unknown `kind` through unchanged (documents current behavior)", () => {
    const back = mapper.fromRow({
      id: "e7",
      event_date: "2026-05-01",
      title: "t",
      kind: "not-a-kind",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(back.kind).toBe("not-a-kind");
  });
});
