import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getContract } from "@/lib/contracts-store";
import { renderContractPdf } from "@/lib/contract-pdf";
import { log } from "@/lib/logger";

// pdf-lib precisa do runtime Node.
export const runtime = "nodejs";

/**
 * PDF do contrato para o back office — a prova em papel do aceite. Autenticado
 * (mesmo modelo de leitura que /api/contratos): só a equipa acede. Devolve o
 * documento renderizado inline; 404 se o contrato não existir.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const contract = await getContract(id);
    if (!contract) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    const pdf = await renderContractPdf(contract);
    // Uint8Array (não Buffer) para satisfazer o BodyInit da Response.
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Contrato-Liquen-${contract.quoteId || contract.id}.pdf"`,
      },
    });
  } catch (err) {
    log.error("contrato PDF GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
