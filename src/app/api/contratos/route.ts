import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listContracts } from "@/lib/contracts-store";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { juntarAceites } from "@/lib/orcamento/aceites";
import { jsonWithEtag } from "@/lib/api-cache";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * As Propostas Aceites: cada contrato, e cada pedido ganho ou proposta aceite
 * que ainda não tem contrato (`juntarAceites`, com o porquê inteiro).
 *
 * Continua a ser uma LISTA — os contratos com `tipo: "contrato"`, os outros com
 * `tipo: "sem-contrato"` —, para quem lia só contratos continuar a ler. Os
 * contratos nascem quando a equipa marca «Ganho» ou aceita a proposta
 * (`nascerContratoDoGanho`), ou pelo botão «Criar contrato» (`/criar`).
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const [contratos, pedidos, propostas] = await Promise.all([
      listContracts(),
      listQuotes(),
      listAllProposals(),
    ]);
    return jsonWithEtag(request, juntarAceites(contratos, pedidos, propostas));
  } catch (err) {
    log.error("contratos GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
