import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/supabase";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import {
  valoresSuspeitos,
  contasQueNaoFecham,
  type EntradaParaAuditoria,
} from "@/lib/valores-inflacionados";
import { listProposalDrafts, DRAFT_PREFIX } from "@/lib/proposal-drafts";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Lê os pedidos TODOS e as propostas TODAS, e ambos trazem documentos
 *  inteiros. Com o mínimo da plataforma (10 s) uma base já crescida era morta
 *  a meio — e um 504 do intermediário não traz corpo nenhum de onde tirar uma
 *  frase que se perceba. */
export const maxDuration = 30;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PROPOSTAS QUE FICARAM COM O VALOR INCHADO — SÓ LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * **Esta rota não escreve nada, e é a única coisa que promete.** Palavras dela:
 * «não corrijas dados em base sem me mostrares primeiro o que vai ser
 * alterado. Algumas podem já ter sido enviadas a clientes com o valor errado.»
 *
 * Não há POST aqui, e não é por esquecimento: uma correcção em lote sobre
 * dinheiro que já saiu num PDF para um casal não é uma coisa que se faça com
 * um botão ao lado da lista. Primeiro a lista; o que se faz com ela decide-se
 * depois de ela a ver.
 *
 * O reconhecimento e as suas ressalvas estão em `valores-inflacionados.ts`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Base de dados indisponível." }, { status: 503 });
  }
  try {
    /**
     * ── E OS RASCUNHOS, QUE ERA ONDE O VALOR INCHADO VIVIA ────────────────
     *
     * A leitura examinava só as propostas ENVIADAS. Uma auditoria em produção
     * foi ver os 15 pedidos à mão e encontrou duas com o preço errado; esta
     * rota respondia «Nenhuma das 7 propostas tem a assinatura desta avaria».
     *
     * Falso negativo por três razões, e esta é a terceira: **o valor cresce no
     * RASCUNHO**, muito antes de haver proposta enviada nenhuma. Uma leitura
     * que só olha para o que já saiu chega sempre tarde.
     *
     * Os rascunhos são de melhor esforço declarado: se a varredura falhar (é
     * ela que lança quando não consegue ler tudo), examinam-se as propostas na
     * mesma e diz-se quantos ficaram por ver. Uma lista parcial anunciada é
     * útil; uma lista parcial que se diz completa é o defeito que estamos aqui
     * a fechar.
     */
    const [pedidos, propostas, rascunhos] = await Promise.all([
      listQuotes(),
      listAllProposals(),
      listProposalDrafts().catch((e) => {
        log.error("valores-suspeitos: os rascunhos não puderam ser lidos", e);
        return null;
      }),
    ]);
    const porPedido = new Map(pedidos.map((q) => [q.id, q]));

    const entradas: EntradaParaAuditoria[] = [];
    for (const p of propostas) {
      if (!p.doc) continue;
      const q = porPedido.get(p.quoteId);
      const noivos = [q?.partnerA, q?.partnerB].map((n) => (n ?? "").trim()).filter(Boolean);
      entradas.push({
        quoteId: p.quoteId,
        nome:
          noivos.length === 2
            ? `${noivos[0]} e ${noivos[1]}`
            : noivos[0] || (q?.name ?? "").trim() || p.clientName || p.quoteId,
        estado: p.status,
        // «Enviada» é o carimbo do envio, e não o estado: um estado pode ter
        // sido mudado à mão, e o que decide se é preciso telefonar a alguém é
        // se o PDF chegou a sair.
        enviada: !!p.sentAt,
        quando: p.sentAt ?? p.createdAt,
        quotedPrice: typeof q?.quotedPrice === "number" ? q.quotedPrice : null,
        doc: p.doc,
      });
    }

    /** O nome dos noivos, ou de quem escreveu — para ela reconhecer de quem se
     *  trata. É a mesma composição que as propostas usam acima. */
    const nomeDe = (q: (typeof pedidos)[number] | undefined, alternativa: string) => {
      const noivos = [q?.partnerA, q?.partnerB].map((n) => (n ?? "").trim()).filter(Boolean);
      if (noivos.length === 2) return `${noivos[0]} e ${noivos[1]}`;
      return noivos[0] || (q?.name ?? "").trim() || alternativa;
    };

    const doRascunho: EntradaParaAuditoria[] = [];
    for (const r of rascunhos ?? []) {
      const quoteId = r.key.slice(DRAFT_PREFIX.length);
      // Um rascunho de um pedido que já não existe não tem com que se comparar.
      const q = porPedido.get(quoteId);
      if (!q) continue;
      const doc = r.doc;
      if (!doc || typeof doc !== "object") continue;
      doRascunho.push({
        quoteId,
        nome: nomeDe(q, quoteId),
        estado: q.status ?? "",
        // Um rascunho NÃO é uma proposta enviada. A distinção decide o que se
        // faz a seguir — telefonar a alguém, ou só corrigir antes de sair.
        enviada: false,
        quando: r.updatedAt,
        quotedPrice: typeof q.quotedPrice === "number" ? q.quotedPrice : null,
        doc: doc as EntradaParaAuditoria["doc"],
      });
    }

    const suspeitas = valoresSuspeitos([...entradas, ...doRascunho]);
    /** O reconhecimento novo: as contas que não fecham entre o DOCUMENTO e o
     *  PEDIDO — incluindo a marca dos adicionais por escrever, que é a avaria
     *  que os dois casos reais tinham e que a leitura antiga saltava. */
    const naoFecham = contasQueNaoFecham([...entradas, ...doRascunho]);

    return NextResponse.json({
      ok: true,
      suspeitas,
      naoFecham,
      /** Quantas foram examinadas — sem isto, «nenhuma» tanto pode ser boa
       *  notícia como uma leitura que não leu nada. */
      examinadas: entradas.length + doRascunho.length,
      /** E de que tipo, porque «7 examinadas» sem dizer se os rascunhos lá
       *  estavam era exactamente a frase que dava falsa segurança. */
      propostas: entradas.length,
      rascunhos: doRascunho.length,
      /** `true` quando a varredura dos rascunhos falhou: a lista sai na mesma,
       *  mas anunciada como parcial. */
      rascunhosPorLer: rascunhos === null,
    });
  } catch (e) {
    log.error("valores-suspeitos: leitura falhou", e);
    return NextResponse.json({ error: "Não consegui ler os pedidos." }, { status: 500 });
  }
}
