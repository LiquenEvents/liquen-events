import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/supabase";
import { contarDerivadasEmFalta, gerarLoteDeDerivadas } from "@/lib/derivadas";
import { nomesDasPastas, nomeDeReserva } from "@/lib/pastas-com-nome";
import { THEME_BUCKET } from "@/lib/theme-ref";
import { log } from "@/lib/logger";

// `sharp` precisa do runtime de Node.
export const runtime = "nodejs";
// Um lote são até 25 fotografias, cada uma um download + um encode + um upload.
// Sessenta segundos chega com folga e trava um pedido que tenha ficado preso.
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MINIATURAS QUE FALTAM — contar (GET) e gerar aos poucos (POST)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Há `scripts/derivadas-em-falta.mjs`, que faz o mesmo no terminal. Esta rota
 * existe porque quem precisa disto trabalha no back office e no telemóvel:
 * pedir-lhe um terminal, um `.env.local` e uma variável de ambiente é pedir-lhe
 * que não o faça.
 *
 * **O GET não escreve nada.** É de propósito que contar e gerar são verbos
 * diferentes: ver o número tem de ser uma coisa que se faz sem medo, e um botão
 * que conta e gera ao mesmo tempo é um botão em que se hesita.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  try {
    const contagem = await contarDerivadasEmFalta();
    // O nome vem depois da contagem e à parte dela: `contarDerivadasEmFalta`
    // fala com o Storage e não sabe o que é um tema. Traduzir aqui mantém a
    // contagem ignorante do domínio e o painel legível — e se os nomes não
    // vierem, a contagem sai na mesma com o id.
    const nomes = await nomesDasPastas().catch(() => new Map<string, string>());
    const linhas = contagem.linhas.map((l) => ({
      ...l,
      nome: nomes.get(`${l.origem}/${l.pasta}`) ?? nomeDeReserva(l.pasta),
      /** A biblioteca ou um pedido — o painel diz-lhes coisas diferentes. */
      daBiblioteca: l.origem === THEME_BUCKET,
    }));
    return NextResponse.json({ ok: true, ...contagem, linhas });
  } catch (e) {
    log.error("derivadas: contagem falhou", e);
    return NextResponse.json({ error: "Não consegui contar." }, { status: 500 });
  }
}

/**
 * Gera UM lote e diz quantas ficaram. Quem chama repete até `restantes` dar
 * zero.
 *
 * Aos poucos porque uma função serverless tem minutos e isto pode ter milhares
 * de fotografias pela frente — um pedido que tentasse tudo era morto a meio, e
 * morrer a meio sem dizer onde ia é o que faz ninguém voltar a tentar. Cada
 * lote é uma paragem segura: nada é substituído, portanto retomar é só chamar
 * outra vez.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  try {
    // `?papel=essencial` faz só as miniaturas — as que fazem a grelha puxar o
    // original. Qualquer outro valor (ou nenhum) faz tudo, essenciais
    // primeiro. Validado por igualdade e não passado adiante em bruto: o que
    // vem do pedido nunca escolhe um bucket.
    const pedido = request.nextUrl.searchParams.get("papel");
    const papel = pedido === "essencial" || pedido === "leve" ? pedido : undefined;
    const r = await gerarLoteDeDerivadas(papel);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    log.error("derivadas: geração falhou", e);
    return NextResponse.json({ error: "Não consegui gerar." }, { status: 500 });
  }
}
