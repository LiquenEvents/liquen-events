import { describe, it, expect } from "vitest";
import { mapper } from "./themes-store";
import type { ProposalTheme } from "./theme-types";

const THEME: ProposalTheme = {
  id: "t-1",
  name: "Terracotta",
  notes: "tons quentes",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-02T10:00:00.000Z",
};

describe("themes-store mapper", () => {
  it("faz o round-trip domínio → linha → domínio sem perder nada", () => {
    expect(mapper.fromRow(mapper.toRow(THEME))).toEqual(THEME);
  });

  it("escreve null (não undefined) numa nota vazia", () => {
    const row = mapper.toRow({ ...THEME, notes: undefined });
    expect(row.notes).toBeNull();
    expect(mapper.fromRow(row).notes).toBeUndefined();
  });

  it("tolera uma linha antiga sem updated_at (cai para created_at)", () => {
    const t = mapper.fromRow({ id: "t-2", name: "Itália", created_at: "2026-01-01T00:00:00.000Z" });
    expect(t.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(t.notes).toBeUndefined();
  });

  it("coage um nome em falta a string vazia em vez de undefined", () => {
    expect(mapper.fromRow({ id: "t-3" }).name).toBe("");
  });

  it("ordena por nome com regras portuguesas nos dois backends", () => {
    expect(mapper.order).toEqual({ column: "name", ascending: true });
    const names = ["Terracotta", "Ámbar", "Itália"].map((name) => ({ ...THEME, name }));
    expect([...names].sort(mapper.fileCompare!).map((t) => t.name)).toEqual([
      "Ámbar",
      "Itália",
      "Terracotta",
    ]);
  });

  it("carimba updatedAt em cada gravação", () => {
    const merged = mapper.beforeUpdate!({ ...THEME, name: "Terracota" });
    expect(merged.updatedAt).not.toBe(THEME.updatedAt);
    expect(Number.isNaN(Date.parse(merged.updatedAt))).toBe(false);
  });

  it("guarda as fotos fora da base de dados (a pasta do Storage é a fonte de verdade)", () => {
    expect(Object.keys(mapper.toRow(THEME))).toEqual([
      "id",
      "name",
      "notes",
      "created_at",
      "updated_at",
    ]);
  });
});

// ── Capa escolhida ─────────────────────────────────────────────────────────
// A coluna `cover_path` foi acrescentada depois. Numa base onde o
// db/schema.sql ainda não correu ela não existe — e escrevê-la sem necessidade
// partiria até um simples renomear. Daí a regra: só entra na linha quem tem
// (ou está a limpar) uma capa.
describe("themes-store mapper: capa do cartão", () => {
  it("nem menciona cover_path num tema sem capa escolhida", () => {
    expect("cover_path" in mapper.toRow(THEME)).toBe(false);
    expect(mapper.fromRow({ id: "t-1", name: "Itália" }).coverPath).toBeUndefined();
  });

  it("faz o round-trip da capa escolhida", () => {
    const withCover = { ...THEME, coverPath: "t-1/8f14e45f.jpg" };
    const row = mapper.toRow(withCover);
    expect(row.cover_path).toBe("t-1/8f14e45f.jpg");
    expect(mapper.fromRow(row)).toEqual(withCover);
  });

  it("limpar a capa escreve null — e volta a ler-se como 'sem capa'", () => {
    const row = mapper.toRow({ ...THEME, coverPath: "" });
    expect(row.cover_path).toBeNull();
    expect(mapper.fromRow(row).coverPath).toBeUndefined();
  });

  it("uma linha vinda de uma base sem a coluna lê-se sem capa (não rebenta)", () => {
    expect(
      mapper.fromRow({ id: "t-1", name: "Itália", cover_path: null }).coverPath,
    ).toBeUndefined();
  });
});
