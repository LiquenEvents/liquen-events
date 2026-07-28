import type { Locale } from "./i18n/config";

/**
 * Portuguese working days + the reply-by promise.
 *
 * Shared by the client confirmation EMAIL and the confirmation PAGE so the two
 * can never promise different dates for the same submission — the client sees
 * both within seconds of each other, and a mismatch would read as sloppy.
 */

// Fixed Portuguese national holidays (month-day). The moveable feasts (Carnaval,
// Sexta-feira Santa, Páscoa, Corpo de Deus) aren't covered — the promise is
// phrased as "até" so a rare extra day still keeps it honest.
const PT_HOLIDAYS = new Set([
  "1-1",
  "4-25",
  "5-1",
  "6-10",
  "8-15",
  "10-5",
  "11-1",
  "12-1",
  "12-8",
  "12-25",
]);

export function isWorkday(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !PT_HOLIDAYS.has(`${d.getMonth() + 1}-${d.getDate()}`);
}

const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "pt-PT");

/**
 * Two working days from `from`, as a written-out date. A concrete date is a
 * promise; a duration ("48 horas úteis") is a disclaimer — and it's genuinely
 * ambiguous in Portuguese (two days, or six?).
 */
export function replyByOn(from: Date): Date {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < 2) {
    d.setDate(d.getDate() + 1);
    if (isWorkday(d)) added++;
  }
  return d;
}

export function replyByDate(from: Date, locale: Locale): string {
  return replyByOn(from).toLocaleDateString(tag(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Lisbon",
  });
}

/** "2027-02-23" → "23 de fevereiro de 2027" / "23 February 2027". */
export function longDate(iso: string, locale: Locale): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(tag(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Whole days from today until the event — used to reframe the wait ("faltam
 * 214 dias" makes two working days feel like nothing). Null when the date is
 * absent, malformed or already past.
 */
export function daysUntil(iso: string, from: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = Math.round((target - today) / 86_400_000);
  return diff > 0 ? diff : null;
}

/**
 * High season in the Alentejo — May to October, when Saturdays go first. Drives
 * the gentle "vale a pena não demorar" note, which is true rather than a
 * manufactured urgency tactic.
 */
export function isHighSeason(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const month = Number(iso.split("-")[1]);
  return month >= 5 && month <= 10;
}
