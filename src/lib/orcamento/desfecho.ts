import type { ActivityEntry, MotivoDeRecusa, Quote, QuoteStatus } from "./types";
import { parseMoney } from "@/app/[lang]/(admin)/orcamento/admin/util";
import { NOME_DO_MOTIVO } from "./analise-de-propostas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O DESFECHO — «eles disseram que sim?»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Não dá para perceber qual é o dinheiro que ganhamos. As
 * propostas que enviamos com aqueles valores, foram aceites ou não?»
 *
 * A Visão Geral já sabe somar. O que lhe falta não são contas — é ENTRADA. O
 * botão que deixava o casal aceitar a proposta online saiu (ver
 * `nada-de-aceitar-por-botao.test.ts`), e a resposta passou a chegar por email,
 * telefone ou WhatsApp. Ninguém a marcava: o pedido ficava eternamente em
 * «Proposta enviada» e o «ganho» ficava a zero com o dinheiro já na conta.
 *
 * Este módulo é a aritmética desse gesto, sem React e sem `fetch`, para poder
 * ser lida e testada sem montar um ecrã. Quem desenha é o
 * `PerguntaDeDesfecho.tsx`; quem grava é o PATCH de `/api/orcamento/[id]`, que
 * já existia e que é quem semeia a produção ao ganhar.
 *
 * ── O VALOR DO NEGÓCIO VIVE NUM SÍTIO SÓ ──────────────────────────────────
 * É o `quotedPrice` do pedido — o mesmo campo que a proposta escreve ao seguir,
 * o mesmo que a Visão Geral soma em «Ganho», o mesmo que o Kanban e as
 * Estatísticas lêem. Confirmar o valor ao marcar «Ganho» é ESCREVER NESSE
 * CAMPO, e não guardar um segundo número ao lado que depois discordasse dele.
 */

/**
 * O estado em que a bola está do lado DELES: a proposta seguiu, e a resposta
 * ainda não foi marcada por ninguém.
 */
export const PROPOSTA_ENVIADA: QuoteStatus = "cotado";

/** As duas únicas saídas. Não há uma terceira, e é isso que a torna um gesto. */
export type Desfecho = "ganho" | "perdido";

/** O estado que cada saída escreve. */
export const ESTADO_DO_DESFECHO: Record<Desfecho, QuoteStatus> = {
  ganho: "aceite",
  perdido: "rejeitado",
};

/** Como se diz cada uma, no ecrã e no histórico — sempre a mesma palavra. */
export const PALAVRA_DO_DESFECHO: Record<Desfecho, string> = {
  ganho: "Ganho",
  perdido: "Perdido",
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O MOTIVO DA PERDA É UMA LISTA FECHADA — NÃO UMA CAIXA DE TEXTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este gesto gravava TEXTO LIVRE (`quote.lostReason`), enquanto a contagem de
 * `analise-de-propostas.ts` lê `Proposal.lostReason`, que é a lista fechada
 * `MotivoDeRecusa` — porque «perdi seis por preço este ano» só é uma frase
 * possível se o motivo for sempre a mesma palavra. Os rótulos vêm de
 * `NOME_DO_MOTIVO`, que é onde essa lista já vivia (do lado das propostas), e
 * não se duplicam aqui: uma segunda lista das mesmas cinco palavras é uma
 * lista à espera de divergir da primeira.
 */
export { NOME_DO_MOTIVO } from "./analise-de-propostas";

/** As cinco opções, pela mesma ordem com que `NOME_DO_MOTIVO` as define. */
export const MOTIVOS_DE_PERDA: MotivoDeRecusa[] = Object.keys(NOME_DO_MOTIVO) as MotivoDeRecusa[];

/** É um dos cinco, e não qualquer texto que alguém tenha mandado à mão. */
export function ehMotivoDeRecusa(v: unknown): v is MotivoDeRecusa {
  return typeof v === "string" && (MOTIVOS_DE_PERDA as string[]).includes(v);
}

/**
 * A pergunta faz-se a este pedido?
 *
 * Só a quem tem proposta enviada. Antes disso não há nada a que o casal possa
 * ter dito que sim; depois disso já foi respondida, e voltar a perguntar a um
 * pedido ganho é pedir para o desmarcar por engano. Corrigir um desfecho
 * continua a fazer-se onde sempre se fez — no selector de estado do painel.
 */
export function faltaODesfecho(q: Pick<Quote, "status">): boolean {
  return q.status === PROPOSTA_ENVIADA;
}

/** Qual dos dois lados já foi marcado, se algum. */
export function desfechoJaMarcado(q: Pick<Quote, "status">): Desfecho | null {
  if (q.status === "aceite") return "ganho";
  if (q.status === "rejeitado") return "perdido";
  return null;
}

/**
 * O valor que o campo mostra já preenchido: o da proposta que seguiu.
 *
 * Decisão dela: «se for sempre igual, é um toque; se tiver havido negociação,
 * é um toque e um número».
 */
export function valorDePartida(q: Pick<Quote, "quotedPrice">): number {
  return typeof q.quotedPrice === "number" && Number.isFinite(q.quotedPrice) ? q.quotedPrice : 0;
}

export type ValorLido = { ok: true; valor: number } | { ok: false; porque: string };

/**
 * O número como ela o escreve à mão — «4.600,00», «4600», «4 600,50 €».
 *
 * Usa o `parseMoney` da casa (ponto de milhares, vírgula decimal) em vez de um
 * `parseFloat`, que lê «4.600» como quatro euros e sessenta.
 *
 * ── PORQUE É QUE O VAZIO É RECUSADO E O ZERO NÃO ──────────────────────────
 * Este gesto existe para o número passar a ser verdade. Marcar «Ganho» com o
 * campo vazio punha um negócio na coluna dos ganhos a somar zero — que é
 * exactamente o silêncio que viemos corrigir, só que do outro lado. Um ZERO
 * escrito de propósito é outra coisa: é uma resposta (um favor, uma troca), e
 * uma resposta grava-se.
 */
export function valorConfirmado(escrito: string): ValorLido {
  if (!escrito.trim()) {
    return { ok: false, porque: "Escreve o valor combinado — é ele que conta como ganho." };
  }
  const n = parseMoney(escrito);
  if (n === undefined || !Number.isFinite(n)) {
    return { ok: false, porque: "Não percebi esse valor. Ex.: 4.600 ou 4600,50" };
  }
  if (n < 0) return { ok: false, porque: "O valor não pode ser negativo." };
  return { ok: true, valor: n };
}

/**
 * Desde quando é que esta proposta espera resposta.
 *
 * A data do envio é a do último `proposal_sent` no histórico — é a entrada que
 * a rota do envio escreve quando o email SAI, e por isso é a única que afirma
 * mesmo «isto seguiu». Sem ela (propostas anteriores a esse registo, ou uma
 * marcada à mão como enviada) cai-se no `lastUpdated`: é menos exacto — mexer
 * numa etiqueta rejuvenesce o pedido — mas erra sempre para MENOS dias, ou
 * seja, nunca inventa uma urgência que não existe.
 *
 * `null` para quem não tem proposta enviada: um pedido novo espera por NÓS, e
 * essa espera já tem a sua conta em `espera.ts`.
 */
export function diasSemResposta(q: Quote, hoje: Date = new Date()): number | null {
  if (!faltaODesfecho(q)) return null;
  const envio = (q.activityLog ?? [])
    .filter((e) => e.kind === "proposal_sent")
    .map((e) => new Date(e.at).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a)[0];
  const referencia = envio ?? new Date(q.lastUpdated ?? q.submittedAt).getTime();
  if (Number.isNaN(referencia)) return null;
  const dias = Math.floor((hoje.getTime() - referencia) / 86_400_000);
  return dias < 0 ? 0 : dias;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SETE DIAS — e porquê sete
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um casal não responde a uma proposta de casamento no dia em que a recebe:
 * lêem-na, falam um com o outro, falam com os pais, e isso acontece quase
 * sempre ao fim-de-semana. Uma proposta que segue à terça-feira só tem resposta
 * real depois do domingo — e uma lista que a chamasse «sem resposta» à
 * quinta-feira estaria a gritar por uma coisa que está a correr normalmente.
 *
 * Uma lista que grita por tudo deixa de ser lida, e a seguir deixam de se ver
 * as que interessam. Sete dias garante que o fim-de-semana JÁ PASSOU, seja qual
 * for o dia em que a proposta saiu.
 *
 * É também o corte que a casa já usa para «urgente» no tempo de espera dos
 * pedidos novos (ver `tomDeEspera` em `espera.ts`): o mesmo número para a mesma
 * ideia — «isto já demorou de mais» —, para não haver duas réguas.
 */
export const DIAS_ATE_PERGUNTAR = 7;

export interface LinhaDeEspera {
  quote: Quote;
  /** Dias desde que a proposta seguiu. */
  dias: number;
  /** O valor que está pendurado nesta — o `quotedPrice`, e não outro. */
  valor: number;
}

/**
 * As propostas enviadas há {@link DIAS_ATE_PERGUNTAR} dias ou mais sem resposta
 * marcada, a mais antiga primeiro.
 *
 * O corte é `>=` e não `>`: a constante é o número que a lista ANUNCIA no ecrã
 * («há 7 dias ou mais»), e uma lista que diz sete e mostra a partir de oito é
 * uma lista em que ela deixa de confiar.
 */
export function aEsperaDeResposta(quotes: Quote[], hoje: Date = new Date()): LinhaDeEspera[] {
  const linhas: LinhaDeEspera[] = [];
  for (const q of quotes) {
    const dias = diasSemResposta(q, hoje);
    if (dias === null || dias < DIAS_ATE_PERGUNTAR) continue;
    linhas.push({ quote: q, dias, valor: valorDePartida(q) });
  }
  return linhas.sort((a, b) => b.dias - a.dias);
}

/** Quanto dinheiro está pendurado nestas propostas. */
export function totalPendurado(linhas: LinhaDeEspera[]): number {
  return linhas.reduce((s, l) => s + l.valor, 0);
}

/**
 * O corpo do PATCH que marca o desfecho.
 *
 * Vive aqui, e não dentro do componente, por duas razões: é testável sem DOM, e
 * é a garantia de que a lista e o painel do pedido mandam EXACTAMENTE a mesma
 * coisa — dois caminhos com corpos ligeiramente diferentes divergem com o
 * tempo, e é assim que um deles deixa de semear a produção sem ninguém dar por
 * isso.
 *
 * `status` vai sempre: a rota trata a presença dele como «escolhido à mão» (o
 * que é, é ela a dizer que o casal respondeu) e é isso que dispara a sementeira
 * do plano de produção ao ganhar — a mesma que o botão «Aceitar proposta» do
 * cliente disparava antes de sair.
 */
export function corpoDaMarcacao(opts: {
  desfecho: Desfecho;
  /** Só no ganho: o valor confirmado, que passa a ser o `quotedPrice`. */
  valor?: number;
  /**
   * Só no perdido, e sempre opcional — um dos cinco {@link MOTIVOS_DE_PERDA},
   * nunca texto livre. O texto livre, quando há, vai em `nota`.
   */
  motivo?: MotivoDeRecusa;
  /** O detalhe, quando o motivo sozinho não chega. Só vai junto de `motivo`. */
  nota?: string;
  quem: string;
  quando: string;
  id: () => string;
}): Record<string, unknown> {
  const { desfecho, valor, motivo, nota, quem, quando, id } = opts;
  const entrada: ActivityEntry = {
    id: id(),
    at: quando,
    kind: "status_change",
    actor: quem,
    summary: `Proposta enviada → ${PALAVRA_DO_DESFECHO[desfecho]}`,
  };
  const body: Record<string, unknown> = {
    status: ESTADO_DO_DESFECHO[desfecho],
    activityLogAppend: [entrada],
  };
  if (desfecho === "ganho" && typeof valor === "number") body.quotedPrice = valor;
  // Um motivo em branco NÃO vai: mandá-lo como `null` apagaria um motivo
  // escrito antes, e «Perdido» não interroga ninguém.
  if (desfecho === "perdido" && motivo) {
    body.lostReason = motivo;
    if (nota && nota.trim()) body.lostNote = nota.trim();
  }
  return body;
}

/**
 * O corpo do PATCH que grava só o motivo — o segundo passo, opcional, que vem
 * DEPOIS de marcar «Perdido». Sem `status` e sem entrada no histórico: o
 * desfecho já ficou registado no primeiro passo (`corpoDaMarcacao`), e
 * repeti-lo aqui duplicava a linha «Proposta enviada → Perdido».
 *
 * `motivo` é sempre um dos {@link MOTIVOS_DE_PERDA} — o botão que se carregou,
 * não uma caixa de texto — e `nota` é o texto livre que o acompanha, quando
 * há, exactamente como já acontece do lado das propostas
 * (`Proposal.lostReason` / `Proposal.lostNote`).
 */
export function corpoDoMotivo(motivo: MotivoDeRecusa, nota?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { lostReason: motivo };
  if (nota && nota.trim()) body.lostNote = nota.trim();
  return body;
}
