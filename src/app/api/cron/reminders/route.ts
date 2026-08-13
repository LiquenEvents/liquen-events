import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { listCalendarEvents } from "@/lib/calendar-store";
import { sendPushToAll } from "@/lib/push";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { eur0 as eur } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Smart daily digest. Meant to be hit by a scheduled cron (Vercel Cron or
 * any external scheduler) once a day. Scans everything and pushes a single
 * summary to the team's devices:
 *   · events happening in the next 3 days
 *   · payments due (or overdue) within 7 days
 *   · quotes still awaiting a first reply for 24h+
 *   · follow-ups due today or overdue
 *
 * Protected by CRON_SECRET: the caller must send it as a Bearer token (never a
 * query param — those leak into access logs). When CRON_SECRET is unset it
 * only runs freely outside production (local/preview convenience) — in
 * production a missing secret fails closed instead of leaving the endpoint
 * wide open (see lib/env.ts, which also warns loudly at startup about this).
 */
/**
 * O DIA É O DE LISBOA, e está escrito à mão de propósito.
 *
 * As datas com que este resumo compara — `q.date`, `followUpAt`, a data de um
 * pagamento — são dias do calendário escritos por quem trabalha em Portugal.
 * O servidor corre em UTC, e no Verão Lisboa está uma hora à frente: entre a
 * meia-noite e a uma da manhã o calendário daqui já virou e o de UTC não. Um
 * «hoje» em UTC dava, à 00h30, o dia de ONTEM — o seguimento marcado para hoje
 * não aparecia, a janela dos 3 dias fechava um dia mais cedo e o casamento que
 * já tinha acontecido continuava a ser anunciado como próximo.
 *
 * Nem local (`setHours`) nem UTC, portanto: o fuso do negócio, pelo nome, como
 * já se faz no `EntradaComFotografia` e nas conversões do Ads.
 */
const FUSO = "Europe/Lisbon";
const DIA_EM_LISBOA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function authorized(req: NextRequest): boolean {
  // A logged-in admin can always trigger it manually (e.g. to test).
  if (isAuthed(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  // Constant-time Bearer check: hash both sides to fixed-length digests so
  // neither the length nor the content leaks through comparison timing.
  const provided = createHash("sha256")
    .update(req.headers.get("authorization") ?? "")
    .digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const [allQuotes, calEvents, allProposals] = await Promise.all([
      listQuotes().catch(() => []),
      listCalendarEvents().catch(() => []),
      listAllProposals().catch(() => []),
    ]);
    // Archived quotes are soft-deleted — never worth a notification.
    const quotes = allQuotes.filter((q) => !q.archived);

    // O dia de hoje em Lisboa (ver a nota do `DIA_EM_LISBOA`), e a partir dele
    // a aritmética da janela. Os dias somam-se ao MEIO-DIA em UTC: é o único
    // sítio da hora onde nem uma mudança de hora nem um fuso conseguem empurrar
    // a data para o dia ao lado.
    const todayKey = DIA_EM_LISBOA.format(new Date());
    const plus = (days: number) => {
      const d = new Date(`${todayKey}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const in3 = plus(3);
    const in7 = plus(7);

    // 1. Events in the next 3 days (quotes + calendar entries)
    const upcomingEvents = [
      ...quotes
        .filter((q) => q.date && q.date >= todayKey && q.date <= in3)
        .map((q) => ({ date: q.date, label: q.name })),
      ...calEvents
        .filter((e) => e.date >= todayKey && e.date <= in3)
        .map((e) => ({ date: e.date, label: e.title })),
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

    // 3. Quotes awaiting a first reply for 24h+. Internal follow-up target: the
    //    safety-net digest flags a lead once a day has passed without a reply so
    //    nothing slips — this is a team cadence, not a promise made to clients.
    const oneDayAgo = Date.now() - 864e5;
    const awaiting = quotes.filter(
      (q) =>
        (q.status === "pendente" || q.status === "em_revisao") &&
        !(q.messages && q.messages.length > 0) &&
        new Date(q.submittedAt).getTime() < oneDayAgo,
    ).length;

    /**
     * ════════════════════════════════════════════════════════════════════════
     * 4. SEGUIMENTOS — E HÁ DOIS CAMPOS COM O MESMO NOME
     * ════════════════════════════════════════════════════════════════════════
     *
     * `followUpAt` existe em DOIS sítios: no pedido (`Quote`, types.ts:273) e na
     * proposta (`Proposal`, types.ts:383). Este resumo lia só o do pedido.
     *
     * Só que o botão «Marcar seguimento» que ela usa todos os dias está no
     * painel de Acompanhamento, e esse grava na PROPOSTA. Resultado: ela marcava
     * o seguimento na terça-feira, confiava, e o resumo da manhã seguinte não
     * dizia nada — o telefone nunca tocava. A falha mais silenciosa do percurso,
     * porque não dá erro nenhum: dá esquecimento.
     *
     * Aqui contam-se os dois, deduplicados POR PEDIDO — um seguimento marcado na
     * proposta e outro no pedido do mesmo casal são a mesma chamada a fazer, e
     * contá-los duas vezes só serviria para ela desconfiar do número.
     *
     * As propostas já respondidas não contam: uma proposta aceite ou recusada
     * não tem seguimento nenhum a fazer, tal como já acontecia do lado do pedido.
     */
    const pedidosVivos = new Map(
      quotes
        .filter((q) => q.status !== "aceite" && q.status !== "rejeitado")
        .map((q) => [q.id, q] as const),
    );
    const comSeguimento = new Set<string>();
    for (const q of pedidosVivos.values()) {
      if (q.followUpAt && q.followUpAt <= todayKey) comSeguimento.add(q.id);
    }
    for (const p of allProposals) {
      if (!p.followUpAt || p.followUpAt > todayKey) continue;
      if (p.status === "aceite" || p.status === "rejeitada") continue;
      // Sem pedido vivo por trás, não há a quem telefonar.
      if (p.quoteId && pedidosVivos.has(p.quoteId)) comSeguimento.add(p.quoteId);
    }
    const followUpsDue = comSeguimento.size;

    const lines: string[] = [];
    if (upcomingEvents.length > 0) {
      lines.push(
        `${upcomingEvents.length} evento${upcomingEvents.length !== 1 ? "s" : ""} nos próximos 3 dias`,
      );
    }
    if (dueCount > 0) {
      lines.push(`${eur(dueSum)} a receber (${dueCount} pagamento${dueCount !== 1 ? "s" : ""})`);
    }
    if (awaiting > 0) {
      lines.push(`${awaiting} pedido${awaiting !== 1 ? "s" : ""} por responder`);
    }
    if (followUpsDue > 0) {
      lines.push(`${followUpsDue} seguimento${followUpsDue !== 1 ? "s" : ""} para hoje`);
    }

    if (lines.length === 0) {
      return NextResponse.json({ sent: 0, reason: "nada a notificar" });
    }

    const { sent, failed } = await sendPushToAll({
      title: "Resumo Líquen · hoje",
      body: lines.join(" · "),
      url: "/orcamento/admin",
      tag: "resumo-diario",
    });

    // `falhados` sai na resposta porque HAVIA o que dizer e não chegou a
    // aparelho nenhum — sem isto, quem carrega no sino lê o mesmo `sent: 0` que
    // lê num dia sossegado, e fica descansado por engano.
    return NextResponse.json({ sent, falhados: failed, summary: lines });
  } catch (err) {
    log.error("cron reminders falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
