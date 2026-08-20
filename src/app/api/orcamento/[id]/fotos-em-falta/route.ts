import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { verificarFotosDaProposta } from "@/lib/proposta-fotos-verificacao";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Lista pastas do Storage — uma ida por pasta, todas em paralelo. Vinte
 *  segundos é folga larga para um documento de quarenta e seis fotografias. */
export const maxDuration = 20;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS QUE FALTAM — PERGUNTADO ANTES DE O LINK SEGUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Verificação automática antes de publicar: se alguma imagem da proposta não
 * resolver, avisar no back office ANTES de o link chegar ao cliente.»
 *
 * ── PORQUE É QUE RECEBE O DOCUMENTO EM VEZ DE O IR BUSCAR ────────────────
 *
 * Porque o documento que interessa é o que está NO ECRÃ DELA, não o que está
 * gravado. O estúdio grava com oitocentos milissegundos de atraso, e a foto
 * que ela acabou de trocar é precisamente a que se quer verificar. Ir buscar o
 * rascunho gravado responderia sobre uma versão anterior — e uma verificação
 * que responde sobre outra coisa é pior do que não haver verificação.
 *
 * É o mesmo desenho da pré-visualização e do envio, que também recebem o
 * documento: quem manda no que sai é o ecrã.
 *
 * ── O QUE ESTA ROTA NÃO FAZ ──────────────────────────────────────────────
 *
 * Não escreve nada, não envia nada e não decide se a proposta pode sair.
 * Responde uma lista. A decisão de enviar continua a ser dela — e é por isso
 * que o aviso do estúdio nomeia as fotos em vez de trancar o botão: uma
 * proposta que tem de sair hoje sai hoje, com uma foto a menos, e ela sabe
 * disso porque leu a lista.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const corpo = await request.json().catch(() => null);
    const doc = (corpo as { doc?: unknown } | null)?.doc;
    if (!doc || typeof doc !== "object") {
      return NextResponse.json({ error: "Falta o documento." }, { status: 400 });
    }
    return NextResponse.json(await verificarFotosDaProposta(doc as Partial<ProposalDoc>), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    log.error("fotos-em-falta: verificação falhou", err, { id });
    /**
     * 200 com `verificou: false`, e não um 5xx.
     *
     * O ecrã tem de saber dizer «não consegui verificar» — que é uma frase
     * diferente de «está tudo bem» e diferente de «erro». Um 5xx aqui deixava
     * o painel sem nada para escrever, e o silêncio lê-se como a primeira.
     */
    return NextResponse.json({ total: 0, emFalta: [], naoVerificaveis: 0, verificou: false });
  }
}
