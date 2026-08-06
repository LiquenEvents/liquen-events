import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { ondeJaFoi, type FotoRepetida } from "@/lib/orcamento/fotos-repetidas";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTA FOTO JÁ FOI PARA OUTRO CASAMENTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Duas noivas com o mesmo Pinterest é uma coincidência. Duas propostas da
 * Líquen com o mesmo arco é um descuido — e vê-se de longe no dia em que as
 * duas se encontram no Instagram.
 *
 * A resposta diz, para cada foto da biblioteca já usada, para onde é que ela
 * foi: o nome do casal, a data do casamento e o sítio. É com isso que se
 * decide, porque o que faz a repetição doer não é ela existir: é ser no mesmo
 * mês e a meia hora de distância.
 *
 * ── O PEDIDO ACTUAL FICA DE FORA ───────────────────────────────────────────
 * Uma proposta em revisão reencontra as suas próprias fotos. Se elas contassem,
 * a segunda versão de qualquer proposta abria com um aviso de repetição sobre
 * si mesma — e um aviso que toca sempre deixa de ser lido.
 */

export type { FotoRepetida };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;

  try {
    const [propostas, quotes] = await Promise.all([listAllProposals(), listQuotes()]);
    return NextResponse.json({ ok: true, fotos: ondeJaFoi(id, propostas, quotes) });
  } catch (err) {
    log.error("fotos-repetidas GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
