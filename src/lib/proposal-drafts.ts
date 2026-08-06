import "server-only";
import { getState, setState } from "./app-state";

/**
 * Rascunhos do estúdio de propostas, guardados NO SERVIDOR.
 *
 * Porquê: até aqui o rascunho — os mood boards, as fotos colocadas, os textos,
 * os valores — vivia só no `localStorage` do navegador. Começar a proposta no
 * portátil e continuá-la no tablet não funcionava, e limpar o histórico
 * apagava trabalho. As FOTOS nunca se perdiam (essas já são copiadas para o
 * Storage quando escolhidas), mas a montagem sim.
 *
 * Onde: na tabela `app_state`, que já existe e é exatamente isto — uma chave
 * para um valor JSON. Deliberadamente NÃO se criou uma tabela nova: um
 * rascunho tem alguns KB (guarda caminhos de fotos, não bytes) e não vale mais
 * um passo manual de SQL numa instalação já a funcionar.
 *
 * Nunca lança: `app-state` regista a falha e devolve null. Sem base de dados o
 * estúdio continua a funcionar com a cópia local do navegador, como antes —
 * degrada para o comportamento antigo em vez de bloquear a edição.
 */

/** O rascunho tal como fica guardado. `doc` é o documento do estúdio. */
export interface StoredProposalDraft {
  doc: unknown;
  /** Quando foi gravado (ISO). É o que permite dizer qual das cópias é a mais
   *  recente quando a mesma proposta é aberta em dois sítios. */
  updatedAt: string;
  /** Quem gravou, para o aviso poder dizer "alterado por…" em vez de só
   *  "alterado noutro sítio". */
  savedBy?: string;
}

/** O espaço de nomes dos rascunhos dentro do `app_state`. Exportado porque há
 *  quem precise de os VARRER e não apenas de ler um: apagar uma foto da
 *  Biblioteca tem de saber que rascunhos a usam (ver `theme-materializar.ts`). */
export const DRAFT_PREFIX = "proposal-draft:";

/** Chave do rascunho de um pedido. O id é saneado para não poder colidir com
 *  outras chaves do `app_state` (nem sair do seu espaço de nomes). */
export function draftKey(quoteId: string): string {
  return `${DRAFT_PREFIX}${quoteId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export async function getProposalDraft(quoteId: string): Promise<StoredProposalDraft | null> {
  const stored = await getState<StoredProposalDraft>(draftKey(quoteId));
  if (!stored || typeof stored !== "object" || !("doc" in stored)) return null;
  return stored;
}

export async function saveProposalDraft(
  quoteId: string,
  doc: unknown,
  savedBy?: string,
): Promise<StoredProposalDraft> {
  const draft: StoredProposalDraft = {
    doc,
    updatedAt: new Date().toISOString(),
    ...(savedBy ? { savedBy } : {}),
  };
  await setState(draftKey(quoteId), draft);
  return draft;
}

/** Apaga o rascunho (proposta enviada, ou a equipa limpou-o à mão).
 *  Grava `null` em vez de remover a linha: `app-state` não tem remoção, e uma
 *  chave a null lê-se exatamente como "não há rascunho". */
export async function clearProposalDraft(quoteId: string): Promise<void> {
  await setState(draftKey(quoteId), null);
}
