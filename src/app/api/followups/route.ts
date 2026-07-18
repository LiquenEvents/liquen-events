import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { listInvoices } from "@/lib/invoices-store";
import { computeFollowUps, withInvoiceFollowUps } from "@/lib/followups";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only feed of rule-based follow-ups (proposals gone cold, overdue
 * payments, uncontacted leads, events happening this week). The detection is
 * pure logic in lib/followups.ts; this route just supplies the data + `now`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const [quotes, proposals, invoices] = await Promise.all([
      listQuotes().catch(() => []),
      listAllProposals().catch(() => []),
      // O livro de faturas é a verdade financeira: uma FT emitida e vencida tem
      // de virar lembrete mesmo sem pagamento informal registado.
      listInvoices().catch(() => []),
    ]);
    const now = Date.now();
    const base = computeFollowUps({ quotes, proposals, now });
    // Junta os atrasos do livro de faturas (deduplicando contra os informais do
    // mesmo evento — prevalece o livro) e reordena.
    const followUps = withInvoiceFollowUps({ base, invoices, quotes, now });
    return NextResponse.json(followUps);
  } catch (err) {
    log.error("followups GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
