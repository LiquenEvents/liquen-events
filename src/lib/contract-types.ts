/**
 * Client-safe contract types.
 *
 * Split out from `contracts-store.ts` (which imports `server-only` via the
 * Repository → `fs`) so client components — the public proposal page's accept
 * flow — can `import type` these without pulling the server-only store into the
 * client bundle, which would break the build. Mirrors the
 * `inventory-types.ts` / `inventory-store.ts` split.
 */

/** Lifecycle of the studio's Termos & Condições acceptance for a proposal. */
export type ContractStatus = "pendente" | "aceite";

export interface Contract {
  id: string;
  /** The quote this acceptance belongs to (denormalised for the ledger link). */
  quoteId: string;
  /** The proposal the client accepted — the idempotency key (one per proposal). */
  proposalId: string;
  clientName: string;
  clientEmail: string;
  /** Version of the terms the client agreed to (e.g. "2026-01"). */
  termsVersion: string;
  /** Full plain-text snapshot of the terms AS SHOWN, frozen at acceptance so a
   *  later edit to DEFAULT_TERMS can never rewrite what was agreed. */
  termsSnapshot: string;
  status: ContractStatus;
  createdAt: string;
  /** When the client accepted (ISO). Absent while status is "pendente". */
  acceptedAt?: string;
  /** The full name the client typed to sign the acceptance. */
  acceptedName?: string;
  /** Best-effort client IP captured at acceptance (audit trail). */
  acceptedIp?: string;
}
