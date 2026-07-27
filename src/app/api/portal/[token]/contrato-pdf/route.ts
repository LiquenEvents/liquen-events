import { NextResponse } from "next/server";
import { readPortalToken } from "@/lib/portal-token";
import { getQuote } from "@/lib/quotes-store";
import { getAcceptedContractByQuote } from "@/lib/contracts-store";
import { renderContractPdf } from "@/lib/contract-pdf";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

// pdf-lib precisa do runtime Node.
export const runtime = "nodejs";
// Limita cada render para um documento lento não prender um worker.
export const maxDuration = 20;

/**
 * Contrato assinado do cliente, público-por-token, para o portal. Mesmo modelo
 * de confiança da proposta-pdf: o token de portal assinado É a autorização —
 * sem auth de admin. Devolve o contrato ACEITE mais recente do pedido, inline.
 *
 * 404 (nunca 401/403) para qualquer falha — token inválido/expirado, pedido
 * desconhecido, ou nenhum contrato aceite — para o link nunca revelar se um id
 * existe. Um contrato pendente não conta: só se descarrega o que foi assinado.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Token de 1 ano e reencaminhável: limita por IP para um link não poder ser
  // repetido em ciclo e sobrecarregar a geração de PDF.
  const limited = await rateLimit(`portal-pdf:${clientIp(request)}`, 12, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  const claim = readPortalToken(token);
  if (!claim) return new NextResponse(null, { status: 404 });

  try {
    const quote = await getQuote(claim.quoteId);
    if (!quote) return new NextResponse(null, { status: 404 });

    const contract = await getAcceptedContractByQuote(quote.id);
    if (!contract) return new NextResponse(null, { status: 404 });

    const pdf = await renderContractPdf(contract);
    // Uint8Array (não Buffer) para satisfazer o BodyInit da Response.
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Contrato-Liquen-${quote.id}.pdf"`,
      },
    });
  } catch (err) {
    log.error("portal contrato-pdf GET falhou", err, { quoteId: claim.quoteId });
    return new NextResponse(null, { status: 500 });
  }
}
