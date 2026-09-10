import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { horarioEmPdf } from "@/lib/orcamento/horario-pdf";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O HORÁRIO DE UM DIA, EM PDF, PARA DESCARREGAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Quero que haja uma opção no timeline que seja fazer download. E que fique
 * como a foto que mandei num PDF.»
 *
 * ── PORQUE É QUE ISTO É UMA ROTA E NÃO SE FAZ NO BROWSER ─────────────────
 *
 * Porque a fonte pesa. O desenho do horário é geometria e caberia num ficheiro
 * do lado do cliente, mas escrever um nome português num PDF obriga a embutir
 * uma fonte que os aceite (ver a nota no `horario-pdf.ts`), e a Carlito são
 * umas centenas de kilobytes de base64. Mandá-la para o browser de todas as
 * pessoas que abrem o back office, para o caso de alguém carregar em
 * «Descarregar», era pagar o preço sempre para o usar às vezes.
 *
 * Aqui corre no servidor, que já a tem carregada para os PDF das propostas.
 *
 * ── NÃO É PÚBLICA, E A RAZÃO NÃO É O DESENHO ─────────────────────────────
 *
 * Um horário do dia traz o nome do cliente, a data, o local e o nome de cada
 * pessoa da equipa com a hora a que entra ao serviço. É informação interna
 * inteira. `isAuthed` primeiro, e o id só se resolve depois — uma rota que
 * responde «não existe» a quem não entrou já está a dizer o que existe.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const q = await getQuote(id);
    if (!q) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const data = q.date
      ? new Date(`${q.date}T12:00:00`).toLocaleDateString("pt-PT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    const bytes = await horarioEmPdf({
      cliente: q.name ?? "",
      data,
      local: q.location ?? "",
      momentos: q.timeline ?? [],
    });

    // Um horário sem uma única hora legível não dá ficheiro nenhum, e dizê-lo é
    // melhor do que mandar uma folha em branco que parece um defeito.
    if (!bytes) {
      return NextResponse.json(
        { error: "Esta timeline ainda não tem momentos com hora." },
        { status: 409 },
      );
    }

    /**
     * O nome do ficheiro é o que ela vai ver na pasta das transferências daqui
     * a três semanas, portanto diz o que é sem ela ter de o abrir. Sem acentos
     * e sem espaços — um `Content-Disposition` com um «ã» lá dentro chega
     * partido a metade dos browsers, e a metade que o entende não concorda com
     * a outra sobre como.
     */
    const limpo = (q.name ?? "evento")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .toLowerCase();
    const ficheiro = `horario-${limpo || "evento"}${q.date ? `-${q.date}` : ""}.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ficheiro}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    log.error("horário PDF falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
