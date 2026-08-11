import "server-only";
import { getState, setState, type MotivoDeFalha, type ResultadoDeEscrita } from "./app-state";

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
 *
 * ── E DEGRADAR EM SILÊNCIO É QUE NÃO ───────────────────────────────────────
 *
 * Esta última frase estava aqui escrita antes de isto acontecer, e estava
 * incompleta. «Degrada para o comportamento antigo» é verdade; o que faltava
 * dizer é que degradava sem NINGUÉM saber — a gravação falhava, `saveProposalDraft`
 * devolvia o rascunho na mesma, a rota respondia OK e o estúdio escrevia
 * «guardado às 14:32». Uma proposta inteira ficou presa no `localStorage` de um
 * portátil e não existia em mais lado nenhum; quem a foi ver noutro computador
 * encontrou o ecrã vazio.
 *
 * Uma degradação anunciada é uma degradação. Uma degradação em silêncio é uma
 * perda. Por isso `saveProposalDraft` devolve, agora, ONDE é que o rascunho
 * ficou — e a rota e o ecrã levam essa verdade até à pessoa que está a
 * trabalhar, que é a única que pode fazer alguma coisa com ela (não fechar o
 * portátil, avisar quem gere a instalação).
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

/**
 * O resultado de uma gravação: o rascunho tal como ficaria, e se ficou mesmo.
 *
 * Devolve-se o `draft` mesmo quando `persistencia.gravado` é `false` — de
 * propósito. A marca de tempo é útil ao estúdio (é o que ele compara com a
 * cópia local) e a gravação falhada NÃO é uma edição falhada: o trabalho está
 * no ecrã e na cópia local do navegador. O que muda é o que se DIZ.
 */
export interface RascunhoGravado {
  draft: StoredProposalDraft;
  persistencia: ResultadoDeEscrita;
}

export async function saveProposalDraft(
  quoteId: string,
  doc: unknown,
  savedBy?: string,
): Promise<RascunhoGravado> {
  const draft: StoredProposalDraft = {
    doc,
    updatedAt: new Date().toISOString(),
    ...(savedBy ? { savedBy } : {}),
  };
  const persistencia = await setState(draftKey(quoteId), draft);
  return { draft, persistencia };
}

/** Apaga o rascunho (proposta enviada, ou a equipa limpou-o à mão).
 *  Grava `null` em vez de remover a linha: `app-state` não tem remoção, e uma
 *  chave a null lê-se exatamente como "não há rascunho".
 *
 *  Devolve se a limpeza chegou mesmo ao servidor. Falhar aqui não perde
 *  trabalho — perde-se o contrário, o rascunho fica onde estava e volta a
 *  aparecer —, mas quem chama merece saber, e a rota di-lo. */
export async function clearProposalDraft(quoteId: string): Promise<ResultadoDeEscrita> {
  return setState(draftKey(quoteId), null);
}

/**
 * A frase que se diz a quem está a trabalhar quando o rascunho não chegou ao
 * servidor.
 *
 * Mora aqui e não na rota nem no ecrã porque é a mesma frase nos dois sítios, e
 * porque a diferença entre os motivos é a única coisa que transforma «não deu»
 * numa acção: a tabela em falta resolve-se com um ficheiro de SQL, a permissão
 * com a chave certa, e uma avaria de rede resolve-se sozinha (por isso, nessa,
 * o que se diz é para não fechar o portátil).
 */
export function porqueNaoGuardou(motivo: MotivoDeFalha | undefined): string {
  if (motivo === "tabela-em-falta") {
    return "A base de dados não tem a tabela dos rascunhos (falta correr o db/schema.sql no Supabase).";
  }
  if (motivo === "sem-permissao") {
    return "A base de dados recusou a gravação por falta de permissões.";
  }
  return "Não foi possível falar com a base de dados.";
}

/** Repetir muda alguma coisa? Uma tabela que não existe e uma permissão
 *  recusada respondem o mesmo à terceira vez que à primeira — quem tenta outra
 *  vez está só a adiar o aviso. */
export function ehFalhaPermanente(motivo: MotivoDeFalha | undefined): boolean {
  return motivo === "tabela-em-falta" || motivo === "sem-permissao";
}
