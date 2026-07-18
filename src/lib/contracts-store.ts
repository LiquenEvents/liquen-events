import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { Contract } from "./contract-types";

/**
 * Registo de aceitação dos Termos & Condições — o "contrato" que fica associado
 * a uma proposta quando o cliente a aceita pelo link público. Guarda quem
 * aceitou, quando, de que IP, o nome assinado, a versão dos termos e um snapshot
 * imutável do texto acordado (prova, auditoria).
 *
 * Persistido pelo Repository partilhado — tabela Supabase `contracts` quando
 * configurada, senão o ficheiro JSON de desenvolvimento — tal como
 * proposals-store / invoices-store.
 *
 * O tipo `Contract` e o `ContractStatus` vivem no módulo client-safe
 * `contract-types` (re-exportados aqui) para que os componentes cliente os
 * possam usar sem importar este store server-only.
 */
export type { Contract, ContractStatus } from "./contract-types";

export const mapper: Mapper<Contract> = {
  table: "contracts",
  fileName: "contracts.json",
  getId: (c) => c.id,
  toRow: (c) => ({
    id: c.id,
    quote_id: c.quoteId,
    proposal_id: c.proposalId,
    client_name: c.clientName,
    client_email: c.clientEmail,
    terms_version: c.termsVersion,
    terms_snapshot: c.termsSnapshot,
    status: c.status,
    created_at: c.createdAt,
    accepted_at: c.acceptedAt || null,
    accepted_name: c.acceptedName || null,
    accepted_ip: c.acceptedIp || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    quoteId: String(r.quote_id ?? ""),
    proposalId: String(r.proposal_id ?? ""),
    clientName: String(r.client_name ?? ""),
    clientEmail: String(r.client_email ?? ""),
    termsVersion: String(r.terms_version ?? ""),
    termsSnapshot: String(r.terms_snapshot ?? ""),
    status: (r.status as Contract["status"]) ?? "pendente",
    createdAt: String(r.created_at ?? new Date().toISOString()),
    acceptedAt: (r.accepted_at as string) ?? undefined,
    acceptedName: (r.accepted_name as string) ?? undefined,
    acceptedIp: (r.accepted_ip as string) ?? undefined,
  }),
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
};

const repo = createRepository(mapper);

export const listContracts = (): Promise<Contract[]> => repo.list();
export const getContract = (id: string): Promise<Contract | null> => repo.get(id);
/** Lookup by proposal — the idempotency check (one contract per proposal). */
export const getContractByProposal = (proposalId: string): Promise<Contract | null> =>
  repo
    .where("proposal_id", proposalId, (c) => c.proposalId === proposalId)
    .then((rows) => rows[0] ?? null);
/**
 * Contrato ACEITE mais recente de um pedido — o que o portal do cliente
 * descarrega em PDF. O aceite vive numa proposta (idempotência é por proposta),
 * mas o portal só conhece o pedido; procuramos por `quoteId` e ficamos com o
 * aceite mais recente (as linhas já vêm por `created_at` descendente). Devolve
 * null se o pedido ainda não tem um contrato aceite. Server-only.
 */
export const getAcceptedContractByQuote = (quoteId: string): Promise<Contract | null> =>
  repo
    .where("quote_id", quoteId, (c) => c.quoteId === quoteId)
    .then((rows) => rows.find((c) => c.status === "aceite") ?? null);
export const createContract = (c: Contract): Promise<void> => repo.create(c);
export const updateContract = (id: string, patch: Partial<Contract>): Promise<Contract | null> =>
  repo.update(id, patch);

/**
 * Cria o contrato só se ainda não existir um para a proposta, e devolve se foi
 * ESTA chamada a criá-lo. O contrato é o LOCK do aceite: quem o cria é quem
 * emite o sinal — assim dois aceites concorrentes produzem um só contrato e um
 * só sinal.
 *
 * Defesa em profundidade sobre o índice único `contracts_proposal_id_uk`
 * (db/schema.sql): numa corrida no Supabase/serverless, os dois pedidos passam
 * ambos o `getContractByProposal` (nenhum vê contrato ainda), mas só um vence o
 * índice no insert — o outro apanha o conflito de unicidade aqui, relê o
 * contrato vencedor e sai com `created:false`, por isso NÃO emite um 2.º sinal.
 * (O fallback de ficheiro serializa as escritas, logo esta guarda endurece
 * sobretudo o caminho Supabase — que é o objetivo.)
 */
export async function createContractIfAbsent(
  c: Contract,
): Promise<{ created: boolean; contract: Contract }> {
  // Caminho rápido: já existe ⇒ ninguém cria de novo.
  const existing = await getContractByProposal(c.proposalId);
  if (existing) return { created: false, contract: existing };
  try {
    await createContract(c);
    return { created: true, contract: c };
  } catch (err) {
    // O insert falhou. Se foi o índice único (corrida TOCTOU entre o check e o
    // insert), o contrato do vencedor já lá está: tratamos como "já aceite".
    const raced = await getContractByProposal(c.proposalId);
    if (raced) return { created: false, contract: raced };
    // Não foi unicidade (falha genuína de persistência) — propaga.
    throw err;
  }
}

/** Fresh, unguessable contract id. */
export const newContractId = (): string => randomUUID();
