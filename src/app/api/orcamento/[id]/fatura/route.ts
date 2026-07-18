import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/quotes-store";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { eur } from "@/lib/money";

export const runtime = "nodejs";

const KIND_LABEL: Record<string, string> = {
  sinal: "Sinal",
  pagamento: "Pagamento",
  saldo: "Saldo final",
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const body = await request.json();
    const amount = Math.min(Number(body.amount) || 0, 100_000_000);
    if (amount <= 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

    // Bound + strip line breaks: `number` feeds the email subject and the
    // attachment filename, so keep it single-line and short.
    const clean = (v: unknown, max: number) =>
      String(v ?? "")
        .replace(/[\r\n]+/g, " ")
        .slice(0, max);
    const kind = clean(body.kind, 40) || "pagamento";
    const vatRate =
      typeof body.vatRate === "number" ? Math.min(Math.max(body.vatRate, 0), 1) : 0.23;
    const number =
      clean(body.number, 60) ||
      `${new Date().getFullYear()}/${id.slice(-4)}-${Math.floor(Math.random() * 900 + 100)}`;
    const dateStr = clean(body.date, 40) || new Date().toISOString().slice(0, 10);
    const paid = !!body.paid;
    const email = !!body.email;

    const pdfBytes = await renderInvoicePdf({
      number,
      date: dateStr,
      clientName: quote.name,
      clientEmail: quote.email,
      clientNif: quote.nif,
      description: String(body.description ?? "").slice(0, 2000),
      amount,
      vatRate,
      kindLabel: KIND_LABEL[kind] ?? "Pagamento",
      paid,
    });
    const pdfBuffer = Buffer.from(pdfBytes);

    let emailed = false;
    if (email) {
      const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="font-size:18px;margin:0 0 12px">Recibo — Líquen Events</h2>
        <p style="font-size:14px;line-height:1.6;color:#333">Olá ${esc(quote.name)},</p>
        <p style="font-size:14px;line-height:1.6;color:#333">Segue em anexo o recibo no valor de <strong style="color:#7c854b">${eur(amount)}</strong>.</p>
        <p style="font-size:13px;color:#777;margin-top:20px">Líquen Events · ${esc(MAIL_TO)} · ${SITE.phoneDisplay}</p>
      </div>`;
      // Plain-text alternative (multipart/alternative): better spam-filter
      // standing and readable by text-only / screen-reader mail clients.
      const text = [
        "Recibo — Líquen Events",
        "",
        `Olá ${quote.name},`,
        "",
        `Segue em anexo o recibo no valor de ${eur(amount)}.`,
        "",
        `Líquen Events · ${MAIL_TO} · ${SITE.phoneDisplay}`,
      ].join("\n");
      const mail = await sendMail({
        to: quote.email,
        replyTo: MAIL_TO,
        subject: `Recibo ${number} — Líquen Events`,
        html,
        text,
        attachments: [
          {
            filename: `Recibo-${number.replace(/\//g, "-")}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });
      emailed = mail.sent;
    }

    return NextResponse.json({
      ok: true,
      number,
      emailed,
      pdfBase64: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    log.error("fatura POST falhou", err);
    return NextResponse.json({ error: "Erro ao gerar o recibo" }, { status: 500 });
  }
}
