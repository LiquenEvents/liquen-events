import { describe, it, expect } from "vitest";

import { isUniqueViolation } from "./invoices-store";

/**
 * O que resta de testar neste módulo.
 *
 * Foi a suite da NUMERAÇÃO FISCAL (`nextInvoiceNumber`): o contador atómico, a
 * recusa de emitir sem base de dados em produção, a sequência sem buracos nem
 * repetições. Saiu inteira com a facturação — esta aplicação já não emite
 * facturas, e o módulo ficou reduzido a leitura para a cópia de segurança (ver
 * o topo de `invoices-store.ts`).
 *
 * `isUniqueViolation` sobreviveu porque nunca foi só das facturas: é o
 * reconhecedor de colisão de índice único que `temas`, `biblioteca/etiquetas` e
 * `overview-settings-store` usam para distinguir «já existe» de «avariou».
 */
describe("isUniqueViolation — the 23505 backstop recogniser", () => {
  it("recognises the Postgres unique-violation SQLSTATE (23505)", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognises the textual message forms (case-insensitive)", () => {
    expect(isUniqueViolation({ message: "duplicate key value violates unique constraint" })).toBe(
      true,
    );
    expect(isUniqueViolation({ message: "UNIQUE CONSTRAINT failed" })).toBe(true);
  });

  it("returns false for unrelated errors and non-objects", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false); // a bare string is not an error object
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // FK violation, not unique
  });
});
