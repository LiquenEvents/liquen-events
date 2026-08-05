import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getProposal } from "@/lib/proposals-store";
import { getQuote } from "@/lib/quotes-store";
import { listarModelos } from "@/lib/proposal-templates";
import { copiarParaPedido, trocarFotos } from "@/lib/proposal-copy";
import { duplicarFotosParaPedido } from "@/lib/proposal-storage";
import { log } from "@/lib/logger";
import type { ProposalDoc } from "@/lib/proposal-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "CRIAR A PARTIR DE…" — o documento de uma proposta anterior (ou de um
 * modelo), adaptado a um pedido novo.
 *
 * Faz-se no SERVIDOR e não no navegador por uma razão só: as fotos. Copiá-las
 * para a pasta do pedido novo precisa da chave de serviço do Storage, que
 * nunca pode chegar ao browser. O resto — decidir o que se copia e o que se
 * substitui — é `proposal-copy.ts`, que é puro e está testado à parte.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const { quoteId, propostaId, modeloId } = body as Record<string, unknown>;
  if (typeof quoteId !== "string" || !quoteId) {
    return NextResponse.json({ error: "Falta o pedido de destino" }, { status: 400 });
  }
  if (!propostaId && !modeloId) {
    return NextResponse.json({ error: "Falta a origem" }, { status: 400 });
  }

  try {
    const quote = await getQuote(quoteId);
    if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    // ── De onde se copia ────────────────────────────────────────────────
    let origem: ProposalDoc | undefined;
    let nomeDaOrigem = "";
    if (typeof propostaId === "string" && propostaId) {
      const p = await getProposal(propostaId);
      if (!p) return NextResponse.json({ error: "Proposta não encontrada" }, { status: 404 });
      origem = p.doc as ProposalDoc | undefined;
      nomeDaOrigem = p.clientName;
    } else if (typeof modeloId === "string" && modeloId) {
      const m = (await listarModelos()).find((x) => x.id === modeloId);
      if (!m) return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 });
      origem = m.doc;
      nomeDaOrigem = m.nome;
    }
    // Uma proposta antiga, das de linhas, não tem documento. Dizê-lo é melhor
    // do que devolver um documento vazio com ar de sucesso.
    if (!origem) {
      return NextResponse.json(
        { error: "Essa proposta não tem documento do estúdio para copiar." },
        { status: 422 },
      );
    }

    // ── Copiar o miolo, substituir a identidade ─────────────────────────
    const { doc, camposAMudar, fotosParaRecopiar } = copiarParaPedido(origem, quote);

    // ── Recopiar as fotos para a pasta deste pedido ─────────────────────
    // Melhor esforço, e é deliberado: se o Storage estiver indisponível, a
    // proposta nova fica a partilhar as fotos com a antiga em vez de abrir sem
    // imagem nenhuma. A resposta diz quantas ficaram partilhadas, para a
    // interface o poder avisar em vez de o esconder.
    const mapa = await duplicarFotosParaPedido(fotosParaRecopiar, quoteId);
    const docFinal = trocarFotos(doc, mapa);
    const partilhadas = fotosParaRecopiar.filter((p) => !mapa.has(p));
    if (partilhadas.length > 0) {
      log.warn("copiar proposta: fotos ficaram na pasta de origem", {
        quoteId,
        quantas: partilhadas.length,
      });
    }

    return NextResponse.json({
      doc: docFinal,
      camposAMudar,
      nomeDaOrigem,
      fotosCopiadas: mapa.size,
      fotosPartilhadas: partilhadas.length,
    });
  } catch (err) {
    log.error("copiar proposta falhou", err, { quoteId });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
