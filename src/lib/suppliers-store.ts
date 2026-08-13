import "server-only";
import { randomUUID } from "node:crypto";
import type { Supplier } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";

export const mapper: Mapper<Supplier> = {
  table: "suppliers",
  fileName: "suppliers.json",
  getId: (s) => s.id,
  toRow: (s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    email: s.email || null,
    phone: s.phone || null,
    location: s.location || null,
    notes: s.notes || null,
    /**
     * ── ISTO ESTEVE DE FORA E PARECIA DE PROPÓSITO ────────────────────────
     * As estrelas e o "preferido" são aceites pelo tipo `Supplier`, pela rota
     * PATCH e pelo `supplierUpdateSchema`, e o ecrã de Fornecedores filtra e
     * ordena por eles. Só que as colunas não existiam em `db/schema.sql`, pelo
     * que projectá-los faria rebentar todas as escritas — e a saída foi
     * deitá-los fora aqui. Em desenvolvimento nada se notava (o backend de
     * ficheiro guarda o objecto de domínio tal e qual); com Supabase, avaliar
     * uma florista com 5 estrelas respondia 200 e no recarregamento seguinte
     * estava tudo apagado, sem erro nenhum.
     *
     * As colunas passaram a existir (`db/schema.sql`, migração idempotente ao
     * lado da tabela), por isso o par fecha-se aqui. Uma metade sem a outra
     * parte: sem colunas, `column "rating" does not exist` em cada gravação.
     *
     * Nulo e não zero: um fornecedor POR AVALIAR não é um fornecedor de zero
     * estrelas — é a mesma distinção que a rota faz ao aceitar `rating: null`
     * para desavaliar e recusar `rating: 0`.
     */
    rating: s.rating ?? null,
    preferred: s.preferred ?? false,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    category: String(r.category ?? "Outro"),
    email: (r.email as string) ?? undefined,
    phone: (r.phone as string) ?? undefined,
    location: (r.location as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    // `undefined` (e não 0/false) quando a linha nada diz, como os contactos
    // vazios acima — assim uma ficha por avaliar continua a distinguir-se de
    // uma avaliada com a nota mínima.
    rating: typeof r.rating === "number" ? r.rating : undefined,
    preferred: r.preferred === true ? true : undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.name.localeCompare(b.name),
  /**
   * Compare-and-set sobre o `updated_at`.
   *
   * A ficha do fornecedor é uma caderneta de contactos que várias pessoas
   * corrigem à medida que descobrem coisas — o telefone novo da florista numa
   * semana, uma nota sobre prazos noutra. Cada correcção manda o seu campo, mas
   * o `update` reescreve a linha toda: quem tivesse a ficha aberta desde antes
   * do telefone novo apagava-o ao gravar a nota, e o contacto certo voltava a
   * ser o antigo sem ninguém dar por isso.
   */
  touch: true,
};

const repo = createRepository(mapper);

export const listSuppliers = (): Promise<Supplier[]> => repo.list();

export async function createSupplier(input: Omit<Supplier, "id" | "createdAt">): Promise<Supplier> {
  const supplier: Supplier = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  await repo.create(supplier);
  return supplier;
}

export const updateSupplier = (id: string, updates: Partial<Supplier>): Promise<Supplier | null> =>
  repo.update(id, updates);

export const deleteSupplier = (id: string): Promise<void> => repo.remove(id);
