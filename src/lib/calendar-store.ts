import { randomUUID } from "node:crypto";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";

export const mapper: Mapper<CalendarEvent> = {
  table: "calendar_events",
  fileName: "calendar-events.json",
  getId: (e) => e.id,
  toRow: (e) => ({
    id: e.id,
    event_date: e.date,
    title: e.title,
    kind: e.kind,
    event_time: e.time || null,
    note: e.note || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    date: String(r.event_date ?? ""),
    title: String(r.title ?? ""),
    kind: (r.kind as CalendarEvent["kind"]) ?? "evento",
    time: (r.event_time as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "event_date", ascending: true },
  fileCompare: (a, b) => a.date.localeCompare(b.date),
};

const repo = createRepository(mapper);

export const listCalendarEvents = (): Promise<CalendarEvent[]> => repo.list();

export async function createCalendarEvent(
  input: Omit<CalendarEvent, "id" | "createdAt">,
): Promise<CalendarEvent> {
  const event: CalendarEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    date: input.date,
    title: input.title,
    kind: input.kind,
    time: input.time,
    note: input.note,
  };
  await repo.create(event);
  return event;
}

export const deleteCalendarEvent = (id: string): Promise<void> => repo.remove(id);
