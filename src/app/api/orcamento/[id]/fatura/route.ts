import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/quotes-store";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const KIND_LABEL: Record<string, string> = {
  sinal: "Sinal",
  pagamento: "Pagamento",
  saldo: "Saldo final",
};
const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const body = await request.json();
    const amount = Number(body.amount) || 0;
    if (amount <= 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

    const kind = String(body.kind ?? "pagamento");
    const vatRate = typeof body.vatRate === "number" ? body.vatRate : 0.23;
    const number =
      body.number ||
      `${new Date().getFullYear()}/${id.slice(-4)}-${Math.floor(Math.random() * 900 + 100)}`;
    const dateStr = body.date || new Date().toISOString().slice(0, 10);
    const paid = !!body.paid;
    const email = !!body.email;

    const pdfBytes = await renderInvoicePdf({
      number,
      date: dateStr,
      clientName: quote.name,
      clientEmail: quote.email,
      clientNif: quote.nif,
      description: body.description || "",
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
        <p style="font-size:13px;color:#777;margin-top:20px">Líquen Events · ${esc(MAIL_TO)} · +351 919 259 820</p>
      </div>`;
      const mail = await sendMail({
        to: quote.email,
        replyTo: MAIL_TO,
        subject: `Recibo ${number} — Líquen Events`,
        html,
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
    log.error("[fatura POST]", err);
    return NextResponse.json({ error: "Erro ao gerar o recibo" }, { status: 500 });
  }
}
