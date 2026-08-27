import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/supabase";
import { listQuotes, updateQuoteWith } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { valoresDiferentesDoEnviado } from "@/lib/orcamento/valor-enviado";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Lê os pedidos todos e as propostas todas. O mínimo da plataforma (10 s)
 *  mata uma base já crescida a meio, e um 504 do intermediário não traz corpo
 *  nenhum de onde tirar uma frase que se perceba. */
export const maxDuration = 30;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VALOR DO PEDIDO PASSA A SER O QUE SAIU NO PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «caso apareça propostas onde os valores não são iguais ao que
 * enviamos, quero que automaticamente se coloque no valor que foi enviado na
 * proposta».
 *
 * O GET lê e não escreve. O POST escreve, e escreve UMA coisa só: o
 * `quotedPrice` do pedido passa a ser o `subtotal` da última proposta ENVIADA
 * desse pedido. A aritmética e as suas ressalvas estão em
 * `lib/orcamento/valor-enviado.ts`.
 *
 * ── PORQUE É QUE ESTA ROTA PODE ESCREVER E A DO LADO NÃO ─────────────────
 *
 * A rota `valores-suspeitos` não tem POST, e o comentário dela explica porquê:
 * ali o valor certo é DEDUZIDO da forma da avaria, e uma dedução não se aplica
 * em lote a dinheiro que já saiu.
 *
 * Aqui não há dedução nenhuma. `Proposal.subtotal` é a fotografia do que o
 * casal recebeu — foi gravado no momento do envio, pela mesma rota que escreveu
 * o preço no pedido, e na mesma base (sem IVA). O que este POST faz é repor uma
 * igualdade que já existiu e que alguma coisa desfez.
 *
 * ── E MESMO ASSIM NÃO CORRIGE SOZINHO ────────────────────────────────────
 *
 * O «automaticamente» dela é sobre o TRABALHO — não querer corrigir linha a
 * linha —, e não sobre a decisão. A regra que ela deu antes continua de pé:
 * «não corrijas dados em base sem me mostrares primeiro o que vai ser
 * alterado». Por isso são dois passos: o GET mostra, o POST aplica, e o POST só
 * acontece quando ela carrega.
 *
 * ── O QUE FICA ESCRITO ───────────────────────────────────────────────────
 *
 * Cada correcção deixa uma entrada no registo do pedido, com os dois números.
 * Um valor de dinheiro que muda sem deixar rasto é a avaria que esta ferramenta
 * existe para fechar — não vale a pena fechá-la abrindo outra igual.
 */

async function lerDivergentes() {
  const [pedidos, propostas] = await Promise.all([listQuotes(), listAllProposals()]);
  return {
    divergentes: valoresDiferentesDoEnviado(pedidos, propostas),
    examinados: pedidos.length,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Base de dados indisponível." }, { status: 503 });
  }
  try {
    const { divergentes, examinados } = await lerDivergentes();
    return NextResponse.json({ ok: true, divergentes, examinados });
  } catch (e) {
    log.error("valor-enviado: leitura falhou", e);
    return NextResponse.json({ error: "Não foi possível ler os pedidos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Base de dados indisponível." }, { status: 503 });
  }
  try {
    /**
     * A lista é RELIDA aqui, e não recebida do ecrã.
     *
     * Entre o «Procurar» e o carregar no botão pode ter passado tempo, e nesse
     * tempo ela pode ter corrigido um valor à mão noutro separador. Escrever a
     * lista que o ecrã traz punha o valor antigo por cima do que ela acabou de
     * escrever — e seria esta ferramenta a criar exactamente o defeito que veio
     * fechar.
     *
     * O corpo do pedido traz apenas QUAIS aplicar; os números vêm sempre de uma
     * leitura fresca.
     */
    const corpo = (await request.json().catch(() => null)) as { quoteIds?: unknown } | null;
    const pedidos = Array.isArray(corpo?.quoteIds)
      ? corpo!.quoteIds.filter((x): x is string => typeof x === "string")
      : null;

    const { divergentes } = await lerDivergentes();
    const aAplicar = pedidos ? divergentes.filter((d) => pedidos.includes(d.quoteId)) : divergentes;

    const feitos: { quoteId: string; de: number | null; para: number }[] = [];
    const falhados: string[] = [];

    for (const d of aAplicar) {
      try {
        await updateQuoteWith(d.quoteId, (actual) => ({
          ...actual,
          quotedPrice: d.enviado,
          activityLog: [
            ...(actual.activityLog ?? []),
            {
              id: `valor-enviado-${d.quoteId}-${d.propostaId}`,
              at: new Date().toISOString(),
              kind: "price_set" as const,
              summary:
                `Valor reposto no que saiu na proposta: ` +
                `${d.noPedido === null ? "sem valor" : d.noPedido.toFixed(2)} → ${d.enviado.toFixed(2)} (sem IVA).`,
            },
          ],
        }));
        feitos.push({ quoteId: d.quoteId, de: d.noPedido, para: d.enviado });
      } catch (e) {
        // Um pedido que falha não pode levar os outros atrás: a lista é de
        // correcções independentes, e parar a meio deixava metade feita sem
        // ninguém saber qual metade.
        log.error("valor-enviado: não foi possível corrigir um pedido", e);
        falhados.push(d.quoteId);
      }
    }

    return NextResponse.json({ ok: true, feitos, falhados });
  } catch (e) {
    log.error("valor-enviado: correcção falhou", e);
    return NextResponse.json({ error: "Não foi possível corrigir os valores." }, { status: 500 });
  }
}
