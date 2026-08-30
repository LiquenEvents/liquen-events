import "server-only";
import { getState, setState } from "./app-state";
import { log } from "@/lib/logger";
import type { ResultadoDeEscrita } from "./app-state";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CORTAR OS LINKS QUE JÁ SEGUIRAM PARA UM CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `proposta-link-curto.ts` escreveu, quando nasceu, exactamente o que
 * faltava — e vale a pena citá-lo, porque é o desenho deste ficheiro:
 *
 *   «A alavanca NÃO existe ainda, e não bastava escrevê-la aqui: enquanto o
 *    token assinado continuar a abrir a mesma proposta, cortar o código curto
 *    não fecha porta nenhuma — quem tem o email antigo entra à mesma. Cortar a
 *    sério é uma decisão sobre as DUAS portas ao mesmo tempo.»
 *
 * É isso que isto faz. E faz num sítio só, porque as duas portas já se juntam
 * num sítio só: o `propostaDoLink`.
 *
 * ── PORQUE É POR PEDIDO E NÃO POR PROPOSTA ────────────────────────────────
 *
 * Nesta casa, uma revisão é uma PROPOSTA NOVA — está escrito na rota do
 * estúdio: «uma proposta que já seguiu para o casal nunca é reescrita». E o
 * link do casal segue o pedido, não a linha: o `propostaDoLink` salta da
 * proposta do token para a irmã mais recente do mesmo pedido.
 *
 * Cortar «a proposta» deixaria portanto as irmãs abertas — e como o salto é
 * automático, um link cortado numa versão continuaria a abrir a seguinte. Um
 * corte que não corta é pior do que não haver corte nenhum, porque quem o
 * carrega fica a pensar que fechou a porta.
 *
 * ── PORQUE É UM CARIMBO DE TEMPO E NÃO UM INTERRUPTOR ─────────────────────
 *
 * Um `cortado: true` teria de ser desligado à mão antes do envio seguinte, e
 * quem se esquecesse mandava ao casal um endereço morto — o pior desfecho
 * possível para o gesto mais importante da casa.
 *
 * Com um carimbo, a regra é uma frase: **morre o que foi emitido ANTES do
 * corte.** O endereço que ela cunhar a seguir é posterior e nasce vivo, sem
 * ninguém ter de se lembrar de nada. E o corte fica registado — saber que um
 * link foi cortado, e quando, vale mais do que a linha desaparecer.
 *
 * ── MELHOR ESFORÇO NA LEITURA, E DE PROPÓSITO ─────────────────────────────
 *
 * Se a leitura do carimbo falhar (base em baixo, tabela por criar), o link
 * ABRE. É a escolha certa entre as duas erradas: um casal que não consegue ver
 * a proposta por causa de uma avaria nossa é um problema imediato e visível;
 * um link cortado que sobrevive a uma avaria é uma janela pequena e, no caso
 * de uso real — «enviei o preço errado» —, o que está do outro lado é a
 * proposta antiga dela, não um segredo. A escrita, essa, tem de ser conhecida:
 * quem corta tem de saber se cortou.
 */

/** O carimbo de corte de um pedido. */
const PREFIXO = "links-cortados:";

/** A chave, saneada para não sair do seu espaço de nomes. */
function chave(pedidoId: string): string {
  return `${PREFIXO}${String(pedidoId ?? "")
    .trim()
    .replace(/[^0-9A-Za-z_-]/g, "")
    .slice(0, 64)}`;
}

interface Corte {
  /** ISO. Tudo o que tiver sido emitido antes disto deixa de abrir. */
  cortadoEm: string;
  /** Quem cortou, quando se sabe. É um nome de login, não identidade. */
  por?: string;
}

/**
 * Corta todos os links já enviados deste pedido.
 *
 * Devolve o resultado da escrita — e não um `boolean` — porque quem carrega no
 * botão tem de poder distinguir «cortei» de «não consegui cortar». Dizer que
 * se cortou um link que continua a abrir seria a pior mentira que este
 * ficheiro podia contar.
 */
export async function cortarLinksDoPedido(
  pedidoId: string,
  por?: string,
): Promise<{ corte: Corte; persistencia: ResultadoDeEscrita }> {
  const corte: Corte = {
    cortadoEm: new Date().toISOString(),
    ...(por ? { por: por.slice(0, 40) } : {}),
  };
  const persistencia = await setState(chave(pedidoId), corte);
  if (!persistencia.gravado) {
    log.error("links-cortados: o corte NÃO ficou gravado — os links continuam a abrir", null, {
      pedido: pedidoId,
      motivo: persistencia.motivo,
    });
  }
  return { corte, persistencia };
}

/**
 * Quando é que os links deste pedido foram cortados, em milissegundos.
 *
 * `null` quando nunca foram — e também quando a leitura falha, pelo que está
 * escrito no cabeçalho.
 */
export async function linksCortadosEm(pedidoId: string): Promise<number | null> {
  const id = String(pedidoId ?? "").trim();
  if (!id) return null;
  try {
    const corte = await getState<Corte>(chave(id));
    if (!corte?.cortadoEm) return null;
    const quando = Date.parse(corte.cortadoEm);
    return Number.isFinite(quando) ? quando : null;
  } catch (e) {
    log.warn("links-cortados: leitura falhou — o link abre", { pedido: id, erro: String(e) });
    return null;
  }
}

/** O corte deste pedido, para o back office poder dizer quando e por quem. */
export async function corteDoPedido(pedidoId: string): Promise<Corte | null> {
  const id = String(pedidoId ?? "").trim();
  if (!id) return null;
  try {
    const corte = await getState<Corte>(chave(id));
    return corte?.cortadoEm ? corte : null;
  } catch {
    return null;
  }
}

/**
 * Este link ainda abre, sabendo quando foi emitido e quando houve corte?
 *
 * Uma função pequena e exportada de propósito: é a regra inteira do corte, num
 * sítio só, e é o que os testes apontam. `emitidoEm` desconhecido (`undefined`)
 * conta como ANTERIOR ao corte — um link cuja idade não se sabe, depois de
 * alguém ter mandado cortar, é exactamente o que se quis cortar.
 */
export function aindaAbre(emitidoEm: number | undefined, cortadoEm: number | null): boolean {
  if (cortadoEm === null) return true;
  if (typeof emitidoEm !== "number" || !Number.isFinite(emitidoEm)) return false;
  return emitidoEm > cortadoEm;
}
