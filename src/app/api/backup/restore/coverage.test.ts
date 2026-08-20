import { describe, it, expect } from "vitest";
import { BACKUP_DATASETS, SCHEMA_VERSION } from "../route";
import { RESTORE_TARGETS, RESTORE_EXCEPTIONS } from "@/lib/backup-restore";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup-restore-types";

/**
 * A rede de segurança entre as DUAS METADES.
 *
 * `route.coverage.test.ts` já impede que um store novo fique de fora da CÓPIA.
 * Falta o passo seguinte, que é o mesmo erro um ano depois: alguém acrescenta
 * um conjunto à exportação e ninguém decide o que a REPOSIÇÃO lhe faz. O
 * ficheiro passa a levá-lo, a reposição passa a ignorá-lo em silêncio, e no dia
 * do desastre falta esse conjunto sem que nada o tenha dito.
 *
 * Por isso a verdade destes testes vem de FORA da reposição: da lista de
 * conjuntos da exportação, e dos `mapper` verdadeiros dos stores. Nenhuma das
 * duas se atualiza a favor de quem esquece.
 */
describe("cobertura da reposição", () => {
  const backupKeys = BACKUP_DATASETS.map((d) => d.key);
  const restoreKeys = new Set(RESTORE_TARGETS.map((t) => t.key));

  it("as duas listas foram mesmo lidas (senão o resto passa por vazio)", () => {
    expect(backupKeys.length).toBeGreaterThanOrEqual(13);
    expect(RESTORE_TARGETS.length).toBeGreaterThanOrEqual(12);
  });

  it("TODO o conjunto que vai na cópia sabe voltar — ou tem a excepção escrita por extenso", () => {
    const orfaos = backupKeys.filter((k) => !restoreKeys.has(k) && !(k in RESTORE_EXCEPTIONS));
    expect(
      orfaos,
      `Estes conjuntos vão na cópia de segurança mas NINGUÉM decidiu como se repõem. ` +
        `Acrescente-os a RESTORE_TARGETS em src/lib/backup-restore.ts (ou, se não devem ser ` +
        `repostos por substituição, explique porquê em RESTORE_EXCEPTIONS):\n  ${orfaos.join("\n  ")}`,
    ).toEqual([]);
  });

  it("a reposição não inventa conjuntos que a cópia não traz", () => {
    const inventados = [...restoreKeys].filter((k) => !backupKeys.includes(k));
    expect(
      inventados,
      `Conjuntos em RESTORE_TARGETS que não existem em BACKUP_DATASETS: ${inventados.join(", ")}`,
    ).toEqual([]);
  });

  it("cada conjunto é reposto na MESMA tabela de onde foi copiado", () => {
    for (const target of RESTORE_TARGETS) {
      const dataset = BACKUP_DATASETS.find((d) => d.key === target.key)!;
      expect(target.table, `"${target.key}": tabela diferente da da cópia`).toBe(dataset.table);
      // A tabela do alvo vem do `mapper` do store, não de um literal — é isso
      // que garante que a reposição escreve onde a aplicação lê.
      expect(target.mapper.table, `"${target.key}": o mapper aponta para outra tabela`).toBe(
        target.table,
      );
    }
  });

  it("cada conjunto tem nome em português, forma declarada e leitura do estado actual", () => {
    for (const t of RESTORE_TARGETS) {
      expect(t.label, `"${t.key}" sem nome para o ecrã`).toBeTruthy();
      expect(t.label, `"${t.key}": o nome não pode ser a chave técnica`).not.toBe(t.key);
      expect(typeof t.schema.safeParse, `"${t.key}" sem forma declarada`).toBe("function");
      expect(typeof t.current, `"${t.key}" não sabe ler o estado actual`).toBe("function");
      expect(typeof t.stamp, `"${t.key}" não sabe datar um registo`).toBe("function");
      expect(typeof t.mapper.toRow, `"${t.key}" sem conversão do store`).toBe("function");
    }
    const keys = RESTORE_TARGETS.map((t) => t.key);
    expect(new Set(keys).size, "chaves repetidas escondem conjuntos umas das outras").toBe(
      keys.length,
    );
  });

  it("as excepções explicam-se, e não contradizem a lista de conjuntos repostos", () => {
    for (const [key, reason] of Object.entries(RESTORE_EXCEPTIONS)) {
      expect(backupKeys, `RESTORE_EXCEPTIONS fala de "${key}", que nem vai na cópia`).toContain(
        key,
      );
      expect(restoreKeys.has(key), `"${key}" está ao mesmo tempo excluído e reposto`).toBe(false);
      expect(reason.length, `a excepção de "${key}" não explica nada`).toBeGreaterThan(80);
    }
  });

  it("ORDEM DE ESCRITA: os pais entram antes dos filhos (chaves estrangeiras)", () => {
    const at = (key: string) => RESTORE_TARGETS.findIndex((t) => t.key === key);
    // proposals.quote_id → quotes.id
    expect(at("quotes")).toBeLessThan(at("proposals"));
  });

  it("a reposição e a exportação falam a MESMA versão do formato", () => {
    expect(
      BACKUP_SCHEMA_VERSION,
      "o formato do ficheiro mudou de um lado e não do outro — uma cópia acabada de exportar deixaria de se poder repor",
    ).toBe(SCHEMA_VERSION);
  });
});
