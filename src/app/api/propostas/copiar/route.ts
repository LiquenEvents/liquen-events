import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getProposal } from "@/lib/proposals-store";
import { getQuote } from "@/lib/quotes-store";
import { listarModelos } from "@/lib/proposal-templates";
import { copiarParaPedido, trocarFotos } from "@/lib/proposal-copy";
import { duplicarFotosParaPedido } from "@/lib/proposal-storage";
import { isThemePath } from "@/lib/theme-ref";
import { MAX_THEME_COPY_BATCH } from "@/lib/theme-types";
import { log } from "@/lib/logger";
import type { ProposalDoc } from "@/lib/proposal-doc";

export const runtime = "nodejs";
// Copia as fotografias de uma proposta para outra, uma a uma.
export const maxDuration = 60;
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
  const { quoteId, propostaId, modeloId, fotos } = body as Record<string, unknown>;
  if (typeof quoteId !== "string" || !quoteId) {
    return NextResponse.json({ error: "Falta o pedido de destino" }, { status: 400 });
  }

  /**
   * ── SÓ AS FOTOS ─────────────────────────────────────────────────────────
   *
   * Um MODELO PARCIAL de mood board traz caminhos que vivem debaixo do pedido
   * de ONDE foi guardado (`<quoteIdOrigem>/<uuid>.jpg`). Inseri-los tal e qual
   * deixava a proposta nova a apontar para a pasta de outro pedido: as células
   * abrem sem miniatura (a listagem de fotos é por pedido), e no dia em que
   * esse pedido for apagado a proposta — provavelmente já enviada — fica sem
   * imagens, em silêncio. É exactamente o problema que o «Criar a partir de…»
   * já resolvia, e que ao inserir um bloco ninguém resolvia.
   *
   * Vive nesta rota e não numa nova porque é a MESMA operação, com a mesma
   * chave de serviço, o mesmo tecto de tempo e o mesmo melhor esforço — e uma
   * segunda rota a copiar fotos era uma segunda guarda para manter alinhada.
   */
  if (Array.isArray(fotos)) {
    // Tecto e forma, como nas rotas comparáveis (`/api/temas/[id]/imagens/copiar`
    // e o etiquetar da biblioteca): sem eles, uma lista feita à mão punha
    // milhares de cópias de Storage a correr — que nem cabem no `maxDuration`
    // desta rota — e mandava caminhos por validar directos ao bucket. A forma é
    // a mesma de sempre, `<pasta>/<ficheiro>.<ext>`, e é ela que impede uma
    // travessia de diretórios de chegar ao `copy`.
    if (fotos.length > MAX_THEME_COPY_BATCH) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_THEME_COPY_BATCH} fotos por pedido.` },
        { status: 400 },
      );
    }
    const caminhos = [...new Set(fotos.filter(isThemePath))];
    if (caminhos.length === 0) {
      return NextResponse.json({ error: "Nenhuma foto indicada" }, { status: 400 });
    }
    try {
      // O que falhar NÃO aparece no mapa: quem chama mantém o caminho antigo e
      // a proposta continua a funcionar, acoplada à origem, em vez de ficar
      // com um buraco onde estava uma foto.
      const mapa = await duplicarFotosParaPedido(caminhos, quoteId);
      return NextResponse.json({
        fotos: Object.fromEntries(mapa),
        fotosCopiadas: mapa.size,
        fotosPartilhadas: caminhos.filter((p) => !mapa.has(p)).length,
      });
    } catch (err) {
      log.error("copiar fotos falhou", err, { quoteId });
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
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
