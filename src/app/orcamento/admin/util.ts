/** Small client-side id generator for checklist/payment items. */
export function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

export const eur2 = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

/**
 * How far away an event date is, as a short PT label + a tone for colouring.
 * Returns null when there's no date. `soon` = within a week (and not past).
 */
export function eventCountdown(
  date?: string,
): { label: string; tone: "soon" | "today" | "future" | "past" } | null {
  if (!date) return null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const ms = new Date(date + "T12:00:00").getTime() - new Date(todayKey + "T12:00:00").getTime();
  const days = Math.round(ms / 86400000);
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
