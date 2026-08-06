import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote, listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import {
  historicoDe,
  linhasCobradas,
  oQueCostumaIncluir,
  type Historico,
  type Omissao,
} from "@/lib/orcamento/memoria-de-precos";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE JÁ COBRASTE POR ISTO, PARA UM EVENTO COMO ESTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A memória vive em duzentos documentos que ninguém relê. A conta que a
 * transforma numa resposta ("já cobrou entre 800 e 1.200, mediana 950, em sete
 * propostas") está em `memoria-de-precos.ts`; esta rota é o que a alimenta.
 *
 * ── PORQUE A CONTA É FEITA CÁ ──────────────────────────────────────────────
 * Porque a alternativa era mandar os documentos todos para o browser: duzentas
 * propostas a 13 KB são quase três megabytes para desenhar meia dúzia de linhas
 * de texto — e três megabytes de preços, custos e notas de OUTROS clientes a
 * viajar para um portátil por causa de uma sugestão. Daqui sai só o resultado.
 *
 * ── O QUE COSTUMA INCLUIR VEM TODO, E FILTRA-SE LÁ ─────────────────────────
 * O aviso de omissão precisa de saber o que já está na proposta que se está a
 * escrever — e isso está no rascunho, no browser, ainda por gravar. Por isso a
 * rota devolve os serviços habituais TODOS e o estúdio tira os que já lá tem
 * (com o mesmo `chaveDoServico`, que é puro e corre dos dois lados). Uma rota
 * que precisasse do rascunho no corpo tinha de ser um POST e voltava a pedir a
 * conta a cada tecla.
 */

export interface MemoriaResposta {
  /** O histórico de cada serviço com casos que cheguem, para este evento. */
  historico: Historico[];
  /** O que costuma entrar em propostas comparáveis. Por filtrar. */
  habituais: Omissao[];
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;

  try {
    const [quote, quotes, propostas] = await Promise.all([
      getQuote(id),
      listQuotes(),
      listAllProposals(),
    ]);
    if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const contexto = { guests: quote.guests, location: quote.location };
    const linhas = linhasCobradas(propostas, quotes);

    // Um histórico por serviço DISTINTO. A chave agrupa as variações de escrita
    // ("Decoração da cerimónia" e "decoração cerimónia" são o mesmo serviço);
    // o nome que se guarda é o da linha, e `historicoDe` escolhe o da proposta
    // mais recente para a resposta.
    const vistos = new Map<string, string>();
    for (const l of linhas) if (!vistos.has(l.chave)) vistos.set(l.chave, l.nome);

    const historico: Historico[] = [];
    for (const nome of vistos.values()) {
      const h = historicoDe(nome, contexto, linhas);
      // `null` = casos a menos. Não entra: uma sugestão baseada numa proposta
      // única de 2024 tem a mesma aparência de autoridade que uma baseada em
      // vinte, e é o contrário de ajudar.
      if (h) historico.push(h);
    }

    return NextResponse.json({
      historico,
      habituais: oQueCostumaIncluir([], contexto, propostas, quotes),
    } satisfies MemoriaResposta);
  } catch (err) {
    log.error("memoria GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
