import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { listSuppliers } from "@/lib/suppliers-store";
import { listTasks } from "@/lib/tasks-store";
import { listCalendarEvents } from "@/lib/calendar-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full data backup (quotes, proposals, suppliers, tasks, calendar) as one JSON file. */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const [quotes, proposals, suppliers, tasks, calendarEvents] = await Promise.all([
      listQuotes().catch(() => []),
      listAllProposals().catch(() => []),
      listSuppliers().catch(() => []),
      listTasks().catch(() => []),
      listCalendarEvents().catch(() => []),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      counts: {
        quotes: quotes.length,
        proposals: proposals.length,
        suppliers: suppliers.length,
        tasks: tasks.length,
        calendarEvents: calendarEvents.length,
      },
      quotes,
      proposals,
      suppliers,
      tasks,
      calendarEvents,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="liquen-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    log.error("backup GET falhou", err);
    return NextResponse.json({ error: "Erro ao gerar backup" }, { status: 500 });
  }
}
