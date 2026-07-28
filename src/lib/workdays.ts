import type { Locale } from "./i18n/config";

/**
 * Date helpers shared by the confirmation page and the confirmation email.
 *
 * The working-day/reply-by maths that used to live here is gone with the
 * turnaround promise itself: the site no longer states one, so nothing was
 * calling it.
 */

const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "pt-PT");

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
