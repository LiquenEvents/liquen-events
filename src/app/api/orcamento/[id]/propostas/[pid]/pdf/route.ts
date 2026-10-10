import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getProposal } from "@/lib/proposals-store";
import { chaveDoPdf, PropostaIncompleta } from "@/lib/proposal-pdf-chave";
import { pdfGuardadoEmFluxo } from "@/lib/pdf-do-armazenamento";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import { nomeDoFicheiroDaProposta } from "@/lib/email-proposta-textos";
import { respostaPdf } from "@/lib/pdf-resposta";
import { log } from "@/lib/logger";

// pdf-lib + sharp precisam do runtime Node, e o desenho pode levar o minuto.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF QUE SEGUIU — visto do back office
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «se eu quiser ver as propostas que já mandei não consigo».
 * Nenhum ecrã mostrava o documento de uma proposta enviada: a lista de
 * Propostas levava ao pedido, o pedido ao estúdio, e o estúdio abria no
 * rascunho.
 *
 * É o MESMO caminho do link do casal (`/api/proposta/[token]/pdf`): primeiro o
 * ficheiro guardado no envio (`proposal-pdfs`, pela `chaveDoPdf`), e só se não
 * estiver lá é que se desenha a partir do `doc` guardado. Sem o token do casal
 * — quem pede é ela, com sessão —, e por isso também funciona depois de os
 * links do pedido terem sido cortados.
 *
 * A proposta tem de ser DESTE pedido: um id de outro pedido na mesma sessão é
 * um engano, e responde 404 como se não existisse.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id, pid } = await params;
  try {
    const proposal = await getProposal(pid);
    if (!proposal || proposal.quoteId !== id || !proposal.doc) {
      return NextResponse.json({ error: "Proposta não encontrada" }, { status: 404 });
    }
    const idioma = idiomaDaProposta(proposal);
    const nome = nomeDoFicheiroDaProposta(
      {
        escolhido: proposal.doc.nomeDoFicheiro,
        clientNames: proposal.doc.clientNames,
        eventDate: proposal.doc.eventDate,
        ref: id.replace(/[^A-Za-z0-9_-]/g, ""),
      },
      idioma,
    );
    const guardado = await pdfGuardadoEmFluxo(
      request,
      proposal.id,
      chaveDoPdf(proposal.doc, idioma),
      nome,
    );
    if (guardado) return guardado;

    // O caminho raro: o ficheiro não está guardado (uma proposta anterior a
    // guardar-se o PDF). O desenhador só se carrega aqui — ver a mesma nota na
    // rota do casal.
    const { pdfDaPropostaEmCache } = await import("@/lib/proposal-pdf-cache");
    const pdf = await pdfDaPropostaEmCache(proposal.doc, idioma, true, proposal.id);
    return respostaPdf(request, pdf, { nome });
  } catch (err) {
    if (err instanceof PropostaIncompleta) {
      return NextResponse.json(
        { error: "Uma fotografia desta proposta não está no armazenamento." },
        { status: 503 },
      );
    }
    log.error("propostas/[pid]/pdf falhou", err, { id, pid });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
