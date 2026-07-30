import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BACKUP_DATASETS, NOT_BACKED_UP } from "./route";

/**
 * A rede de segurança da cópia de segurança.
 *
 * O defeito que motivou estes testes não foi um erro de lógica: foi alguém
 * acrescentar as faturas, os contratos, o inventário, os modelos de email e os
 * temas à aplicação e nunca ninguém se lembrar de os acrescentar TAMBÉM ao
 * backup. Um teste que enumerasse à mão os conjuntos esperados não apanhava
 * nada — seria só uma segunda lista a envelhecer ao lado da primeira, e a
 * primeira pessoa a acrescentar um store atualizava as duas ou nenhuma.
 *
 * Por isso a verdade destes testes vem de FORA do código do backup:
 *
 *   1. do disco — todo o `src/lib/*-store.ts` expõe um `mapper.table`, e essa
 *      tabela tem de aparecer na cópia;
 *   2. de `db/schema.sql` — toda a tabela criada lá ou vai na cópia ou está
 *      explicitamente documentada em `NOT_BACKED_UP` com a razão.
 *
 * Nenhuma das duas se atualiza sozinha a favor de quem esquece: acrescentar um
 * store novo, ou uma tabela nova, põe estes testes vermelhos até a decisão ser
 * tomada — levar na cópia, ou justificar por escrito porque não vai.
 */

const REPO_ROOT = process.cwd();
const LIB_DIR = path.join(REPO_ROOT, "src", "lib");

/** Os nomes (sem extensão) dos `*-store.ts` que existem MESMO em src/lib. */
const storeNames: string[] = readdirSync(LIB_DIR)
  .filter((f) => f.endsWith("-store.ts"))
  .map((f) => f.slice(0, -3))
  .sort();

/** Carrega um store pelo nome. O caminho é um literal com uma variável, que o
    transformador resolve como um padrão — nunca uma lista escrita à mão. */
const loadStore = (name: string): Promise<{ mapper?: { table?: string } }> =>
  import(`../../../lib/${name}.ts`);

const backedUpTables = new Set(BACKUP_DATASETS.map((d) => d.table));

describe("cobertura do backup", () => {
  it("os stores são mesmo encontrados no disco", () => {
    // Sem isto, uma leitura que deixasse de encontrar ficheiros tornava os
    // testes seguintes verdes por vazio — a falha mais perigosa possível aqui.
    expect(storeNames.length).toBeGreaterThanOrEqual(11);
    expect(storeNames).toContain("invoices-store");
    expect(storeNames).toContain("contracts-store");
  });

  it("TODO o store de src/lib vai na cópia (lista tirada do disco, não escrita à mão)", async () => {
    const missing: string[] = [];
    for (const name of storeNames) {
      const mod = await loadStore(name);
      const table = mod.mapper?.table;
      expect(
        table,
        `${name}.ts não expõe \`mapper.table\` — o backup não o consegue seguir`,
      ).toBeTruthy();
      if (!backedUpTables.has(table!)) missing.push(`${name}.ts → tabela "${table}"`);
    }
    expect(
      missing,
      `Estes stores guardam dados que NÃO vão na cópia de segurança. ` +
        `Acrescente-os a BACKUP_DATASETS em src/app/api/backup/route.ts ` +
        `(ou, se não devem mesmo ir, explique porquê em NOT_BACKED_UP):\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("cada conjunto da cópia sabe ler-se e tem chave e tabela únicas", () => {
    expect(BACKUP_DATASETS.length).toBeGreaterThan(0);
    for (const d of BACKUP_DATASETS) {
      expect(d.key, "conjunto sem chave").toBeTruthy();
      expect(d.table, `conjunto "${d.key}" sem tabela`).toBeTruthy();
      expect(typeof d.list, `conjunto "${d.key}" sem leitura`).toBe("function");
    }
    const keys = BACKUP_DATASETS.map((d) => d.key);
    expect(new Set(keys).size, "chaves repetidas escondem conjuntos umas das outras").toBe(
      keys.length,
    );
    const tables = BACKUP_DATASETS.map((d) => d.table);
    expect(new Set(tables).size, "tabelas repetidas em BACKUP_DATASETS").toBe(tables.length);
  });

  describe("contra db/schema.sql", () => {
    const sql = readFileSync(path.join(REPO_ROOT, "db", "schema.sql"), "utf-8");
    const schemaTables = [
      ...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi),
    ].map((m) => m[1]);

    it("o schema foi mesmo lido (senão o teste seguinte passa por vazio)", () => {
      expect(schemaTables.length).toBeGreaterThanOrEqual(14);
      expect(schemaTables).toContain("invoices");
    });

    it("toda a tabela do schema ou vai na cópia ou está justificada por escrito", () => {
      const unaccounted = schemaTables.filter(
        (t) => !backedUpTables.has(t) && !(t in NOT_BACKED_UP),
      );
      expect(
        unaccounted,
        `Tabelas em db/schema.sql que ninguém decidiu se vão na cópia: ${unaccounted.join(", ")}. ` +
          `Acrescente-as a BACKUP_DATASETS ou registe a razão em NOT_BACKED_UP.`,
      ).toEqual([]);
    });

    it("nenhuma tabela declarada na cópia é inventada (apanha gralhas nos literais)", () => {
      // `BACKUP_DATASETS.table` é escrito à mão; uma gralha ("invoces") deixaria
      // o store por cobrir no teste acima, mas com uma mensagem enviesada. Aqui
      // aponta-se diretamente ao literal errado.
      const inventadas = BACKUP_DATASETS.map((d) => d.table).filter(
        (t) => !schemaTables.includes(t),
      );
      expect(
        inventadas,
        `Tabelas declaradas em BACKUP_DATASETS que não existem em db/schema.sql: ${inventadas.join(", ")}`,
      ).toEqual([]);
    });

    it("as exclusões continuam a fazer sentido (nada obsoleto nem contraditório)", () => {
      for (const [table, reason] of Object.entries(NOT_BACKED_UP)) {
        expect(
          schemaTables,
          `NOT_BACKED_UP fala de "${table}", que já não existe no schema`,
        ).toContain(table);
        expect(
          backedUpTables.has(table),
          `"${table}" está ao mesmo tempo excluída e na cópia`,
        ).toBe(false);
        expect(reason.length, `a exclusão de "${table}" não explica nada`).toBeGreaterThan(40);
      }
    });
  });
});
