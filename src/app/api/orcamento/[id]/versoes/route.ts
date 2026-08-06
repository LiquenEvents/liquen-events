import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listProposalsForQuote } from "@/lib/proposals-store";
import { diferencas, resumo, type Mudanca } from "@/lib/orcamento/diferencas";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O HISTÓRICO DE VERSÕES JÁ EXISTIA — FALTAVA ALGUÉM PERGUNTAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Não há tabela nova aqui, e é de propósito. Cada envio já cria uma linha em
 * `proposals` com o documento inteiro na coluna `doc` — é assim desde que o
 * cliente passou a poder abrir o PDF pelo link. Ou seja: as versões de uma
 * proposta são as propostas enviadas para aquele pedido, por ordem. Criar uma
 * `proposal_versions` a copiar o mesmo `doc` para outro sítio dava duas
 * verdades sobre o mesmo envio e, no dia em que discordassem, nenhuma forma de
 * saber qual valia.
 *
 * ── O QUE VAI NA RESPOSTA, E O QUE NÃO VAI ─────────────────────────────────
 * Vai o que se lê de relance: quando, quanto, e o que mudou desde a anterior,
 * em frases. NÃO vão os documentos — cada um chega aos 18 KB, e a lista é para
 * ser vista, não para ser reposta. O documento vai só quando alguém pede UM,
 * para restaurar (`?doc=<id>`), e aí vai um só.
 *
 * ── AS DIFERENÇAS CALCULAM-SE AQUI ─────────────────────────────────────────
 * Podiam ir para o browser, mas então os documentos todos tinham de viajar —
 * meio megabyte para mostrar seis linhas de texto. Compara-se cá, viaja o
 * resultado.
 */

export interface VersaoDaProposta {
  id: string;
  /** Quando seguiu para o cliente. */
  enviadaEm: string;
  /** O total bruto que ia nessa versão. */
  total: number;
  /** Em que estado ficou (aceite, rejeitada, enviada…). */
  estado: string;
  /** O que mudou em relação à versão ANTERIOR. Vazio na primeira. */
  mudancas: Mudanca[];
  /** Uma frase para a lista. */
  resumo: string;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;

  try {
    const propostas = await listProposalsForQuote(id);
    // Só as que TÊM documento. Uma proposta de linhas (a antiga, feita em
    // /api/propostas) não é uma versão de nada — não há documento para comparar
    // nem para restaurar, e metê-la na lista dava uma entrada que não abre.
    const comDoc = propostas.filter((p) => p.doc && typeof p.doc === "object");

    // Pedido de UM documento, para restaurar.
    const querDoc = request.nextUrl.searchParams.get("doc");
    if (querDoc) {
      const encontrada = comDoc.find((p) => p.id === querDoc);
      if (!encontrada)
        return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 });
      return NextResponse.json({ ok: true, id: encontrada.id, doc: encontrada.doc });
    }

    // `listProposalsForQuote` vem da mais recente para a mais antiga. Para
    // comparar precisa-se da ordem do tempo, senão cada versão era comparada
    // com a que veio DEPOIS dela e as frases saíam ao contrário ("passou de
    // 9500 € para 8000 €" quando o preço subiu).
    const cronologica = [...comDoc].reverse();

    const versoes: VersaoDaProposta[] = cronologica.map((p, i) => {
      const anterior = cronologica[i - 1];
      const mudancas = anterior
        ? diferencas(anterior.doc as ProposalDoc, p.doc as ProposalDoc)
        : [];
      return {
        id: p.id,
        enviadaEm: p.sentAt || p.createdAt,
        total: p.total,
        estado: p.status,
        mudancas,
        // A primeira não mudou nada em relação a nada: dizer "sem alterações"
        // seria mentira por omissão do contexto.
        resumo: anterior ? resumo(mudancas) : "Primeira versão enviada",
      };
    });

    // Devolve-se da mais recente para a mais antiga — é a ordem por que se lê.
    return NextResponse.json({ ok: true, versoes: versoes.reverse() });
  } catch (err) {
    log.error("versoes GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
