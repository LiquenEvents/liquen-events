import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/supabase";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { valoresSuspeitos, type EntradaParaAuditoria } from "@/lib/valores-inflacionados";
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
    const [pedidos, propostas] = await Promise.all([listQuotes(), listAllProposals()]);
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

    const suspeitas = valoresSuspeitos(entradas);
    return NextResponse.json({
      ok: true,
      suspeitas,
      /** Quantas foram examinadas — sem isto, «nenhuma» tanto pode ser boa
       *  notícia como uma leitura que não leu nada. */
      examinadas: entradas.length,
    });
  } catch (e) {
    log.error("valores-suspeitos: leitura falhou", e);
    return NextResponse.json({ error: "Não consegui ler os pedidos." }, { status: 500 });
  }
}
