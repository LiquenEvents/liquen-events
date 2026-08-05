import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listAllProposals } from "@/lib/proposals-store";
import { jsonWithEtag } from "@/lib/api-cache";
import { log } from "@/lib/logger";
import type { ProposalDoc } from "@/lib/proposal-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A lista de propostas anteriores, reduzida ao que a escolha precisa.
 *
 * Existe por causa do "Criar a partir de…": para escolher, ela precisa de ver
 * de quem era, quando foi, e o tamanho da coisa. NÃO precisa dos documentos
 * inteiros — que trazem todos os mood boards, todas as condições e as dezenas
 * de caminhos de fotos de cada proposta. Com um ano de trabalho lá dentro, a
 * lista completa passa a ser megabytes descarregados só para desenhar uma
 * lista de nomes. O documento vai buscar-se em `/api/propostas/[id]` quando
 * ela escolher UM.
 */
function resumir(p: Awaited<ReturnType<typeof listAllProposals>>[number]) {
  const doc = p.doc as ProposalDoc | undefined;
  return {
    id: p.id,
    quoteId: p.quoteId,
    clientName: p.clientName,
    createdAt: p.createdAt,
    status: p.status,
    total: p.total,
    // Sem documento não há nada para copiar — uma proposta de linhas antiga
    // aparece na lista mas não pode servir de ponto de partida.
    temDoc: !!doc,
    eventType: doc?.eventType ?? "",
    eventDate: doc?.eventDate ?? "",
    location: doc?.location ?? "",
    guests: doc?.guests ?? "",
    // O «tamanho» da proposta, que é o que diz se vale a pena partir dela.
    grupos: doc?.serviceGroups?.length ?? 0,
    moodBoards: doc?.moodBoards?.length ?? 0,
    linhas: doc?.budgetItems?.length ?? 0,
    fotos:
      (doc?.coverImages ?? []).filter(Boolean).length +
      (doc?.moodBoards ?? []).reduce((n, b) => n + (b.images?.length ?? 0), 0),
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const propostas = await listAllProposals();
    if (new URL(request.url).searchParams.get("resumo") === "1") {
      return jsonWithEtag(request, propostas.map(resumir));
    }
    return jsonWithEtag(request, propostas);
  } catch (err) {
    log.error("propostas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
