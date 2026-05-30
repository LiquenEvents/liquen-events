import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import type { CalendarEvent } from "@/app/orcamento/types";
import { getSupabase } from "./supabase";

const TABLE = "calendar_events";
const DATA_FILE = path.join(process.cwd(), "data", "calendar-events.json");

async function fileRead(): Promise<CalendarEvent[]> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}
async function fileWrite(events: CalendarEvent[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(events, null, 2));
}

function rowToEvent(r: Record<string, unknown>): CalendarEvent {
  return {
    id: String(r.id),
    date: String(r.event_date ?? ""),
    title: String(r.title ?? ""),
    kind: (r.kind as CalendarEvent["kind"]) ?? "evento",
    time: (r.event_time as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from(TABLE).select("*").order("event_date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToEvent);
  }
  const all = await fileRead();
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export async function createCalendarEvent(
  input: Omit<CalendarEvent, "id" | "createdAt">
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
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from(TABLE).insert({
      id: event.id,
      event_date: event.date,
      title: event.title,
      kind: event.kind,
      event_time: event.time || null,
      note: event.note || null,
    });
    if (error) throw error;
    return event;
  }
  const all = await fileRead();
  all.push(event);
  await fileWrite(all);
  return event;
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const all = await fileRead();
  await fileWrite(all.filter((e) => e.id !== id));
}
