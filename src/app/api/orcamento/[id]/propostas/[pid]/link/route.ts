import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getProposal } from "@/lib/proposals-store";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { corteDoPedido } from "@/lib/links-cortados";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O link que o casal recebeu — para «Abrir como o casal vê» e «Copiar link».
 *
 * Só para propostas que SEGUIRAM (`sentAt`): uma por enviar não tem link a
 * mostrar, e emitir um aqui era dar-lhe uma porta que ninguém pediu. Para uma
 * enviada, o código curto já existe e `enderecoDaProposta` reaproveita-o.
 *
 * Se os links do pedido foram cortados, di-lo (`cortado`): o endereço continua
 * a ser este, mas o casal deixou de o conseguir abrir — e ela tem de saber isso
 * antes de o copiar para uma mensagem.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id, pid } = await params;
  try {
    const proposal = await getProposal(pid);
    if (!proposal || proposal.quoteId !== id) {
      return NextResponse.json({ error: "Proposta não encontrada" }, { status: 404 });
    }
    if (!proposal.sentAt) {
      return NextResponse.json({ error: "Esta proposta ainda não seguiu." }, { status: 409 });
    }
    const [url, corte] = await Promise.all([
      enderecoDaProposta(proposal.id, id),
      corteDoPedido(id),
    ]);
    return NextResponse.json({ ok: true, url, cortado: !!corte });
  } catch (err) {
    log.error("propostas/[pid]/link falhou", err, { id, pid });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
