/** Small client-side id generator for checklist/payment items. */
export function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Formatação de euros consolidada em `@/lib/money` (fonte única). Mantemos os
// nomes locais `eur` (sem casas) e `eur2` (2 casas) para os importadores atuais.
export { eur0 as eur, eur as eur2 } from "@/lib/money";

/**
 * How far away an event date is, as a short PT label + a tone for colouring.
 * Returns null when there's no date. `soon` = within a week (and not past).
 */
export function eventCountdown(
  date?: string,
): { label: string; tone: "soon" | "today" | "future" | "past" } | null {
  if (!date) return null;
  // "Today" must be the LOCAL calendar day: the diff below anchors both dates at
  // LOCAL noon, so deriving today from `toISOString()` (a UTC date) mixed offsets
  // and shifted every countdown by a day for viewers east/west of UTC around
  // midnight (e.g. 05:00 in UTC+9, still "yesterday" in UTC, read as Amanhã).
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const ms = new Date(date + "T12:00:00").getTime() - new Date(todayKey + "T12:00:00").getTime();
  const days = Math.round(ms / 86400000);
  // An unparseable date yields NaN days; treat it like "no date" instead of
  // rendering a "faltam NaN meses" label in the UI.
  if (Number.isNaN(days)) return null;
  if (days === 0) return { label: "Hoje", tone: "today" };
  if (days === 1) return { label: "Amanhã", tone: "soon" };
  if (days < 0)
    return { label: `há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`, tone: "past" };
  if (days <= 7) return { label: `faltam ${days} dias`, tone: "soon" };
  if (days <= 30) return { label: `faltam ${days} dias`, tone: "future" };
  const weeks = Math.round(days / 7);
  if (days <= 90) return { label: `faltam ${weeks} semanas`, tone: "future" };
  const months = Math.round(days / 30);
  return { label: `faltam ${months} meses`, tone: "future" };
}
