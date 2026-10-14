import { describe, expect, it, vi } from "vitest";

/**
 * A Reciclagem ANTES da migração: a tabela ainda não existe no Supabase.
 *
 * O código pode entrar no site antes de ela aprovar a migração
 * (`db/migracoes/20261010_r3_reciclagem.sql`). Até lá, apagar tem de
 * continuar a funcionar como sempre — definitivo — e dizê-lo (`false`), para o
 * ecrã não prometer uma Reciclagem que não existe.
 */

const apagadas = vi.hoisted(() => [] as string[]);

vi.mock("./reciclagem-store", () => ({
  guardarNaReciclagem: async () => {
    throw Object.assign(new Error('relation "public.reciclagem" does not exist'), {
      code: "42P01",
    });
  },
  listarReciclagem: async () => [],
  obterDaReciclagem: async () => null,
  tirarDaReciclagem: async () => {},
}));
vi.mock("./tasks-store", () => ({
  obterTarefa: async (id: string) => ({ id, title: "TESTE", priority: "normal" }),
  reporTarefa: async () => {},
  deleteTask: async (id: string) => {
    apagadas.push(id);
  },
}));

import { enviarParaAReciclagem } from "./reciclagem";

describe("sem a tabela da Reciclagem", () => {
  it("apaga como sempre, e devolve `false` para o ecrã o dizer", async () => {
    expect(await enviarParaAReciclagem("tarefa", "t1")).toBe(false);
    expect(apagadas).toEqual(["t1"]);
  });
});
