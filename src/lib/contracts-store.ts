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
export const createContract = (c: Contract): Promise<void> => repo.create(c);
export const updateContract = (id: string, patch: Partial<Contract>): Promise<Contract | null> =>
  repo.update(id, patch);

/** Fresh, unguessable contract id. */
export const newContractId = (): string => randomUUID();
