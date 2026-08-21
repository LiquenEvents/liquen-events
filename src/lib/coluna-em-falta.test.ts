import { describe, it, expect } from "vitest";
import { isMissingTable, nomeDaColunaEmFalta } from "./repository";
import { avisoDeColunasPerdidas, oQueFazerComAsColunas } from "./estado-das-colunas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SABER QUAL É A COLUNA QUE FALTA — E NÃO DEITAR FORA AS OUTRAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O defeito que isto tranca, medido num envio a sério:
 *
 * A coluna `proposals.doc` existe naquela base desde 30 de julho. As do selo
 * da versão nasceram a 20 de agosto. Uma base sem o `db/schema.sql` novo
 * recusava o `versao_selo` — e o resgate do envio, para salvar três colunas
 * que não existiam, deitava fora a única que existia e a única que o casal vê.
 *
 * O que faltava era isto: o erro DIZ qual é a coluna, e ninguém a lia.
 */

/** Como o PostgREST fala. */
const postgrest = (coluna: string) =>
  Object.assign(
    new Error(`Could not find the '${coluna}' column of 'proposals' in the schema cache`),
    {
      code: "PGRST204",
    },
  );

/** Como o Postgres fala, pelos dois caminhos. */
const postgresRelacao = (coluna: string) =>
  Object.assign(new Error(`column "${coluna}" of relation "proposals" does not exist`), {
    code: "42703",
  });
const postgresQualificada = (coluna: string) =>
  Object.assign(new Error(`column proposals.${coluna} does not exist`), { code: "42703" });

describe("o nome da coluna que falta", () => {
  it("lê-se do erro do PostgREST", () => {
    expect(nomeDaColunaEmFalta(postgrest("versao_selo"))).toBe("versao_selo");
  });

  it("e das duas maneiras como o Postgres o diz", () => {
    expect(nomeDaColunaEmFalta(postgresRelacao("versao_selo"))).toBe("versao_selo");
    // «proposals.versao_selo» → «versao_selo»: o nome da tabela já se sabe.
    expect(nomeDaColunaEmFalta(postgresQualificada("pdf_sha256"))).toBe("pdf_sha256");
  });

  /**
   * O QUE NÃO SE ADIVINHA.
   *
   * Uma tabela inteira em falta, uma base em baixo, uma mensagem que não se
   * reconhece: `null`, e quem chama volta ao resgate largo. Devolver um palpite
   * aqui era tirar a coluna errada — que é exactamente o defeito de origem,
   * outra vez, com mais passos.
   */
  it("é `null` quando o erro não nomeia coluna nenhuma", () => {
    expect(nomeDaColunaEmFalta(new Error('relation "proposals" does not exist'))).toBe(null);
    expect(nomeDaColunaEmFalta(new Error("fetch failed"))).toBe(null);
    expect(nomeDaColunaEmFalta(null)).toBe(null);
    expect(nomeDaColunaEmFalta("column x does not exist")).toBe(null);
  });

  /** Controlo positivo: estes erros continuam a ser reconhecidos como «falta
   *  correr o schema», que é a decisão que os põe no caminho do resgate. */
  it("e todos eles continuam a ser reconhecidos como coluna em falta", () => {
    expect(isMissingTable(postgrest("doc"))).toBe(true);
    expect(isMissingTable(postgresRelacao("doc"))).toBe(true);
    expect(isMissingTable(postgresQualificada("doc"))).toBe(true);
  });
});

describe("o que se diz a quem acabou de enviar", () => {
  it("com o documento perdido, a primeira frase é o que o casal vê", () => {
    const frase = avisoDeColunasPerdidas(["doc", "versao_selo"]);
    expect(frase).toMatch(/quadro com o preço/i);
    expect(frase, "tem de nomear o ficheiro a correr").toMatch(/db\/schema\.sql/);
    expect(frase, "e as colunas que faltam").toMatch(/versao_selo/);
  });

  /**
   * E — a metade que interessa depois desta correcção — quando o documento
   * SOBREVIVE, a frase não pode dizer que o casal ficou sem proposta. É a
   * diferença entre um aviso que se lê e um aviso que se aprende a ignorar.
   */
  it("sem o documento perdido, diz o que se perdeu mesmo e mais nada", () => {
    const frase = avisoDeColunasPerdidas(["versao_selo", "versao_numero"]);
    expect(frase).not.toMatch(/quadro com o preço/i);
    expect(frase).toMatch(/O casal vê a proposta na mesma/i);
    expect(frase).toMatch(/db\/schema\.sql/);
  });
});

describe("o que se diz no painel, a frio", () => {
  it("com a `proposals.doc` em falta, diz o que está a acontecer aos links", () => {
    expect(oQueFazerComAsColunas(["proposals.doc"])).toMatch(/quadro com o preço/i);
  });

  it("sem ela, fica-se pelo remédio", () => {
    const frase = oQueFazerComAsColunas(["proposals.versao_selo"]);
    expect(frase).toMatch(/db\/schema\.sql/);
    expect(frase).not.toMatch(/quadro com o preço/i);
  });
});
