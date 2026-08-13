import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { listContracts } from "@/lib/contracts-store";
import { getState, setState } from "@/lib/app-state";
import { construirFechos, relatorio, DIAS_ACEITES } from "@/lib/meta/conversoes-fecho";
import { enviarEventos } from "@/lib/meta/capi";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENVIAR OS CASAMENTOS FECHADOS PARA A META
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   /api/meta/fechos            → o relatório. NÃO envia nada. É o padrão.
 *   /api/meta/fechos?enviar=1   → envia mesmo (POST, ver abaixo)
 *
 * A contrapartida de `/api/admin/conversoes`, que faz o mesmo para a Google.
 * A diferença de forma — ali um CSV para carregar à mão, aqui uma chamada —
 * não é gosto: a Meta descontinuou o carregamento manual de eventos offline e
 * passou tudo pela Conversions API. Ver o cabeçalho de
 * `src/lib/meta/conversoes-fecho.ts`.
 *
 * ── PORQUE É QUE O RELATÓRIO É O PADRÃO ────────────────────────────────────
 * Pela mesma razão que do lado da Google: um envio é difícil de desfazer, e
 * quem abre isto deve ver primeiro quantos negócios há, quanto valem e o que
 * ficou de fora. O envio exige um POST — um GET nunca muda nada, e um endereço
 * que envia conversões ao ser aberto seria disparado por qualquer pré-carga do
 * browser.
 *
 * ── PORQUE É QUE ISTO TEM DE CORRER COM FREQUÊNCIA ─────────────────────────
 * A Meta recusa eventos com mais de {@link DIAS_ACEITES} dias, em silêncio.
 * Um casamento que feche numa segunda-feira e só seja enviado no fim do mês
 * não conta para nada. Correr isto uma vez por semana é o mínimo; a rota é
 * idempotente (guarda o que já enviou), portanto correr mais vezes não faz
 * mal nenhum.
 *
 * PROTEGIDA: os valores dos negócios fechados são informação comercial.
 */

/** Chave onde fica a lista de referências já enviadas. */
const CHAVE_ENVIADOS = "meta-fechos-enviados";

/**
 * Quantas referências se guardam.
 *
 * A lista existe para não enviar o mesmo casamento duas vezes. Não precisa de
 * ser eterna: uma referência que saia da lista só volta a ser candidata se
 * ainda estiver dentro da janela de {@link DIAS_ACEITES} dias, e nessa altura
 * já cá estaria de qualquer forma. Quinhentas cobre anos de operação com
 * folga e impede que o registo cresça sem limite.
 */
const MAX_GUARDADAS = 500;

async function reunir() {
  const [quotes, propostas, contratos, enviados] = await Promise.all([
    listQuotes(),
    listAllProposals(),
    listContracts(),
    getState<string[]>(CHAVE_ENVIADOS),
  ]);

  // A proposta MAIS RECENTE de cada pedido é a que vale: se houve revisão de
  // preço, o valor do negócio é o da última.
  const propostaPorQuote = new Map<string, (typeof propostas)[number]>();
  for (const p of propostas) {
    const atual = propostaPorQuote.get(p.quoteId);
    if (!atual || (p.createdAt ?? "") > (atual.createdAt ?? "")) propostaPorQuote.set(p.quoteId, p);
  }

  // A data de aceitação do contrato é a data com significado legal do fecho.
  const aceiteEmPorQuote = new Map<string, string>();
  for (const c of contratos) {
    if (!c.acceptedAt) continue;
    const atual = aceiteEmPorQuote.get(c.quoteId);
    if (!atual || c.acceptedAt < atual) aceiteEmPorQuote.set(c.quoteId, c.acceptedAt);
  }

  const jaEnviados = new Set(Array.isArray(enviados) ? enviados : []);
  const resultado = construirFechos(
    quotes,
    (id) => propostaPorQuote.get(id) ?? null,
    (id) => aceiteEmPorQuote.get(id),
    jaEnviados,
  );
  const valorTotal = resultado.eventos.reduce((s, e) => s + (e.valor ?? 0), 0);
  return { resultado, valorTotal, jaEnviados };
}

export async function GET(req: NextRequest) {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const { resultado, valorTotal } = await reunir();
    const rodape =
      "\nPara enviar mesmo:\n" +
      "    curl -X POST -b <cookie de sessao> .../api/meta/fechos\n" +
      `\nA Meta recusa eventos com mais de ${DIAS_ACEITES} dias. Corre isto pelo menos\n` +
      "uma vez por semana, ou os casamentos que fecharem entretanto nao contam.\n";
    return new NextResponse(relatorio(resultado, valorTotal) + rodape, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    // O relatório lê meia dúzia de stores; qualquer uma em baixo saía daqui
    // como 500 anónimo e sem registo, e quem abre isto não fica a saber se o
    // que falhou foi a leitura ou se não há mesmo negócios para enviar.
    log.error("meta/fechos: relatório falhou", err);
    return NextResponse.json({ error: "Não foi possível reunir os fechos." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  // Antes de a Meta ver seja o que for: falhar a reunir é só não enviar nada.
  const reunido = await reunir().catch((err) => {
    log.error("meta/fechos: reunião falhou", err);
    return null;
  });
  if (!reunido) {
    return NextResponse.json({ error: "Não foi possível reunir os fechos." }, { status: 500 });
  }
  const { resultado, valorTotal, jaEnviados } = reunido;
  if (resultado.eventos.length === 0) {
    return NextResponse.json({ enviados: 0, valorTotal: 0, examinados: resultado.examinados });
  }

  const r = await enviarEventos(resultado.eventos, { tempoLimiteMs: 8000 });
  if (!r.enviado) {
    log.error("meta/fechos: envio falhou", undefined, { motivo: r.motivo, detalhe: r.detalhe });
    return NextResponse.json(
      { enviados: 0, motivo: r.motivo, detalhe: r.detalhe },
      // 200: quem chama é o back office, e um 5xx aqui só faria a interface
      // mostrar "erro" sem dizer o quê. O motivo vai no corpo.
      { status: 200 },
    );
  }

  // Só se marca como enviado DEPOIS de a Meta confirmar. Marcar antes e falhar
  // o envio seria perder a conversão para sempre — a referência nunca mais
  // voltaria a ser candidata, e ninguém daria por isso.
  const refs = resultado.eventos.map((e) => (e.contexto ?? "").replace("casamento-fechado:", ""));
  const lista = [...jaEnviados, ...refs].slice(-MAX_GUARDADAS);
  /**
   * ESTA FALHA NÃO PODE SUBIR — a Meta JÁ recebeu os eventos.
   *
   * Se o `setState` atirasse daqui para fora, a resposta era 500 e a lista de
   * enviados ficava por actualizar: as mesmas conversões voltavam a ser
   * candidatas na corrida seguinte e a Meta recebia-as OUTRA VEZ, a inflar o
   * valor dos negócios fechados. Um envio duplicado é pior do que um erro
   * visível, por isso a falha vai no CORPO, com o que é preciso saber para a
   * remendar à mão, e o envio conta como o que foi: feito.
   */
  let guardado = true;
  try {
    await setState(CHAVE_ENVIADOS, lista);
  } catch (err) {
    guardado = false;
    log.error("meta/fechos: enviados mas a lista não ficou gravada", err, { refs });
  }

  log.info("meta/fechos: enviados", {
    eventos: resultado.eventos.length,
    recebidos: r.recebidos,
    valorTotal,
  });
  return NextResponse.json({
    enviados: resultado.eventos.length,
    recebidos: r.recebidos,
    valorTotal,
    examinados: resultado.examinados,
    ...(guardado
      ? {}
      : {
          registoGuardado: false,
          aviso:
            "Os eventos foram aceites pela Meta, mas a lista de enviados não ficou gravada. " +
            "Não voltes a correr isto sem verificar, ou estas conversões são contadas duas vezes.",
          referencias: refs,
        }),
  });
}
