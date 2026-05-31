import { NextRequest, NextResponse } from "next/server";
import { listQuotes } from "@/lib/quotes-store";
import { listCalendarEvents } from "@/lib/calendar-store";
import { sendPushToAll } from "@/lib/push";
import { isAuthed } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Smart daily digest. Meant to be hit by a scheduled cron (Vercel Cron or
 * any external scheduler) once a day. Scans everything and pushes a single
 * summary to the team's devices:
 *   · events happening in the next 3 days
 *   · payments due (or overdue) within 7 days
 *   · quotes still awaiting a first reply for 2+ days
 *
 * Protected by CRON_SECRET: the caller must send it as a Bearer token or
 * `?secret=` query param. When CRON_SECRET is unset (dev), it runs freely.
 */
function authorized(req: NextRequest): boolean {
  // A logged-in admin can always trigger it manually (e.g. to test).
  if (isAuthed(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const [quotes, calEvents] = await Promise.all([
      listQuotes().catch(() => []),
      listCalendarEvents().catch(() => []),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const todayKey = key(today);
    const plus = (days: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return key(d);
    };
    const in3 = plus(3);
    const in7 = plus(7);

    // 1. Events in the next 3 days (quotes + calendar entries)
    const upcomingEvents = [
      ...quotes.filter((q) => q.date && q.date >= todayKey && q.date <= in3).map((q) => ({ date: q.date, label: q.name })),
      ...calEvents.filter((e) => e.date >= todayKey && e.date <= in3).map((e) => ({ date: e.date, label: e.title })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    // 2. Payments due (or overdue) within 7 days
    let dueCount = 0;
    let dueSum = 0;
    for (const q of quotes) {
      for (const p of q.payments ?? []) {
        if (!p.paid && p.date && p.date <= in7) {
          dueCount++;
          dueSum += p.amount;
        }
      }
    }

    // 3. Quotes awaiting a first reply for 2+ days
    const twoDaysAgo = Date.now() - 2 * 864e5;
    const awaiting = quotes.filter(
      (q) =>
        (q.status === "pendente" || q.status === "em_revisao") &&
        !(q.messages && q.messages.length > 0) &&
        new Date(q.submittedAt).getTime() < twoDaysAgo
    ).length;

    const lines: string[] = [];
    if (upcomingEvents.length > 0) {
      lines.push(`${upcomingEvents.length} evento${upcomingEvents.length !== 1 ? "s" : ""} nos próximos 3 dias`);
    }
    if (dueCount > 0) {
      lines.push(`${eur(dueSum)} a receber (${dueCount} pagamento${dueCount !== 1 ? "s" : ""})`);
    }
    if (awaiting > 0) {
      lines.push(`${awaiting} pedido${awaiting !== 1 ? "s" : ""} por responder`);
    }

    if (lines.length === 0) {
      return NextResponse.json({ sent: 0, reason: "nada a notificar" });
    }

    const { sent } = await sendPushToAll({
      title: "Resumo Líquen · hoje",
      body: lines.join(" · "),
      url: "/orcamento/admin",
      tag: "resumo-diario",
    });

    return NextResponse.json({ sent, summary: lines });
  } catch (err) {
    console.error("[cron reminders]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
