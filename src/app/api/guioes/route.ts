import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listQuotes } from "@/lib/quotes-store";
import { eventTagLabel } from "@/lib/orcamento/data";
import { jsonWithEtag } from "@/lib/api-cache";
import { log } from "@/lib/logger";
import type { ResumoDeGuiao } from "@/lib/orcamento/guioes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS GUIÕES DOS EVENTOS TODOS, NUMA VIAGEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── PORQUE É QUE ESTA ROTA TEVE DE EXISTIR ────────────────────────────────
 *
 * A lista de pedidos que o back office carrega vem em RESUMO, e o `timeline` é
 * um dos cinco campos que o resumo deixa cair de propósito (ver
 * `CAMPOS_SO_DO_DETALHE`): com trezentos pedidos, era o cronograma que enchia o
 * HTML da página de administração. A vista «Timelines» precisa exactamente
 * do campo que foi cortado — e para TODOS os eventos, que é a pergunta que ela
 * existe para responder.
 *
 * A alternativa era ir buscar o pedido inteiro de cada evento, um a um: trinta
 * eventos, trinta viagens, e trinta blobs completos (fotos, propostas,
 * pagamentos, convidados) para ler doze linhas de horas. Esta rota devolve os
 * MOMENTOS e mais nada — uns 60 bytes por momento.
 *
 * ── E PORQUE É QUE DEVOLVE OS MOMENTOS E NÃO A ANÁLISE ────────────────────
 *
 * Porque a análise já existe e corre no cliente: é o `analisarODia`, a mesma
 * função que o `EventTimeline` usa para desenhar a régua de um evento. Cozinhar
 * aqui um resumo («2 choques, 1 buraco») era escrever uma SEGUNDA
 * implementação da mesma pergunta, e as duas divergem no dia em que alguém
 * afinar uma delas — com a lista a dizer «pronto» sobre um dia que o ecrã do
 * evento marca a vermelho.
 */

/**
 * Quantos eventos, no máximo.
 *
 * Um estúdio com sete anos de histórico tem centenas de eventos com data, e
 * todos eles têm um guião possível. O que ela precisa de ver é a vizinhança do
 * dia de hoje: o que aí vem e o que acabou de passar. O tecto escolhe por
 * PROXIMIDADE e não por ordem de gravação — cortar os mais antigos parecia o
 * mesmo e não é: o evento de daqui a dois anos é tão relevante como o da
 * semana passada, e ambos ficam de fora se o corte for pela data de submissão.
 */
const MAX_EVENTOS = 200;

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const hoje = Date.now();
    const guioes: ResumoDeGuiao[] = (await listQuotes())
      // ── SÓ O QUE JÁ É TRABALHO ────────────────────────────────────────
      //
      // «Nos timelines quero que o sistema seja inteligente o suficiente para
      // dar para fazer timelines apenas das propostas que já foram aceites.»
      //
      // Três condições, e cada uma tira uma coisa diferente:
      //
      //  · `!q.archived` — arquivado é «isto já não conta». Já cá estava.
      //  · a data — um evento sem dia não tem horas para pôr numa grelha.
      //  · **`q.status === "aceite"`** — o novo. Um guião do dia é a folha por
      //    que a equipa se rege no dia; fazê-la para um pedido que ainda está
      //    a ser pensado é planear um dia que pode não acontecer. A lista dela
      //    tinha quinze eventos e treze diziam «Sem timeline» — não por
      //    esquecimento, mas porque a maior parte ainda eram propostas por
      //    responder.
      //
      // `aceite` é o topo da escada do `estado-do-pedido.ts`, e chega-se lá
      // por três caminhos — ela marca a proposta como aceite, entra um
      // pagamento, ou regista-se o contrato. Qualquer um deles quer dizer a
      // mesma coisa: isto vai acontecer.
      .filter(
        (q) => !q.archived && q.status === "aceite" && /^\d{4}-\d{2}-\d{2}$/.test(q.date ?? ""),
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(`${a.date}T12:00:00`) - hoje) -
          Math.abs(Date.parse(`${b.date}T12:00:00`) - hoje),
      )
      .slice(0, MAX_EVENTOS)
      .map((q) => ({
        id: q.id,
        cliente: q.name ?? "",
        evento: eventTagLabel(q),
        data: q.date,
        local: q.location ?? "",
        momentos: q.timeline ?? [],
      }));

    return jsonWithEtag(request, { guioes });
  } catch (err) {
    log.error("guiões GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
