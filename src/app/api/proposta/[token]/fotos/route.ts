import { NextResponse } from "next/server";
import { readProposalToken } from "@/lib/proposal-token";
import { getProposal } from "@/lib/proposals-store";
import { fotosDaProposta } from "@/lib/proposta-fotos";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DA PROPOSTA, ASSINADAS PARA QUEM TEM O TOKEN
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Até aqui só o BACK OFFICE conseguia assinar uma fotografia de proposta
 * (`/api/orcamento/[id]/assets`, atrás de `isAuthed`). O casal via as suas
 * fotografias por um caminho só: embutidas no PDF. Esta rota é a que falta
 * para a página viva as poder mostrar em ecrã inteiro.
 *
 * ── O MODELO DE CONFIANÇA ─────────────────────────────────────────────────
 *
 * O token HMAC É a autorização, como no PDF da mesma pasta: ele só abre a
 * proposta para a qual foi emitido, não há nada a enumerar nem a forjar, e ver
 * as fotografias é estritamente MENOS do que o PDF já entrega (que leva os
 * mesmos ficheiros embutidos, em tamanho de impressão).
 *
 * 404 para tudo o que falhe — token inválido, expirado, proposta apagada,
 * proposta sem documento —, nunca 401 nem 403: um link privado não pode
 * revelar, pela resposta, se um identificador existe.
 *
 * ── AS TRÊS REGRAS, E ONDE CADA UMA VIVE ──────────────────────────────────
 *
 *  1. **Nunca um caminho de bucket, só endereços assinados.** É o
 *     `proposta-fotos.ts` que garante isto, e esta rota devolve o que ele
 *     devolve, sem acrescentar campo nenhum. Ver o cabeçalho de lá.
 *
 *  2. **Só se assinam os caminhos DAQUELE documento.** Não é uma validação: é
 *     a forma da rota. Ela não lê caminho nenhum do pedido — nem da query, nem
 *     do corpo, nem de um cabeçalho. O único parâmetro é o token, e o que se
 *     assina sai do `proposal.doc` que o token abre. Não há aqui uma torneira
 *     para fechar porque não há torneira: uma rota que recebesse caminhos
 *     assinaria, com o token de um casal, qualquer ficheiro da Biblioteca de
 *     Temas — que é o activo do estúdio inteiro.
 *
 *  3. **Limite de taxa.** O token vive meses na caixa de correio do casal e é
 *     reencaminhável. Sem tecto, um link na mão de alguém era uma fábrica de
 *     URLs assinados — e cada volta custa quatro idas ao Storage. 20 por
 *     minuto por IP: uma página abre com UM pedido, portanto 20 é uma margem
 *     larga para recarregar, mudar de rede e voltar a abrir, e continua a
 *     fechar a porta a um ciclo.
 *
 * ── PORQUE É QUE ISTO EXISTE SE A PÁGINA JÁ RENDERIZA COM OS URLs ─────────
 *
 * A página é `force-dynamic` e assina ao desenhar, portanto a primeira pintura
 * não paga round-trip nenhum — não há cascata. Esta rota é para DEPOIS: os
 * URLs da Biblioteca de Temas valem 6 horas ({@link THEME_SIGNED_TTL}), e um
 * separador deixado aberto durante uma tarde fica com fotografias mortas e sem
 * forma de as ressuscitar sem recarregar a página inteira e voltar a pagar
 * tudo. Com isto, a grelha volta a pedir a assinatura e mais nada.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const limited = await rateLimit(`proposta-fotos:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  const claim = readProposalToken(token);
  if (!claim) return new NextResponse(null, { status: 404 });

  try {
    const proposal = await getProposal(claim.proposalId);
    // Sem documento não há fotografias nenhumas — é o caso das propostas
    // anteriores à coluna `proposals.doc` e das propostas de linhas do back
    // office. A página esconde a galeria nesse caso; isto fecha a mesma porta
    // do lado do servidor.
    if (!proposal?.doc) return new NextResponse(null, { status: 404 });

    const fotos = await fotosDaProposta(proposal.doc);
    return NextResponse.json(
      { ok: true, fotos },
      {
        headers: {
          /**
           * A resposta leva URLs assinados de um casal. `private, no-store` é o
           * que impede um cache partilhado — a CDN, o proxy de uma empresa — de
           * a guardar e a servir a quem pedir o mesmo caminho. É a mesma regra
           * que a página já segue.
           */
          "Cache-Control": "private, no-store, must-revalidate",
        },
      },
    );
  } catch (err) {
    log.error("proposta fotos GET falhou", err, { proposalId: claim.proposalId });
    return new NextResponse(null, { status: 500 });
  }
}
