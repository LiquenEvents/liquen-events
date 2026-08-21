import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA TABELA CRIA-SE ANTES DE SE LHE MEXER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `db/schema.sql` é corrido À MÃO, no editor de SQL do Supabase, e é a única
 * peça deste repositório que ninguém executa em CI. Uma linha fora de ordem lá
 * dentro não parte teste nenhum — parte a instalação de alguém, semanas depois,
 * e parte a meio: metade do esquema criado, um erro no ecrã, e nenhuma pista
 * sobre o que ficou por criar.
 *
 * ── O QUE ISTO APANHOU DA PRIMEIRA VEZ ────────────────────────────────────
 *
 * Sete `alter table public.contracts` estavam 550 linhas ACIMA do `create table
 * public.contracts`. Numa base que já tinha a tabela — a dela, e a de qualquer
 * pessoa que tenha corrido o ficheiro alguma vez — corria sem se notar. Numa
 * instalação de raiz, o ficheiro parava ali.
 *
 * Não foi encontrado por ninguém a ler: foi encontrado a preparar o ficheiro
 * para ela o colar, com o mesmo género de leitura que este teste faz.
 *
 * ── O QUE SE VERIFICA, E O QUE NÃO SE VERIFICA ────────────────────────────
 *
 * Isto NÃO é um analisador de SQL, e não tenta ser: lê o ficheiro por linhas e
 * pergunta uma coisa só — cada referência a `public.X` aparece depois de `X`
 * ser criada? É o suficiente para a família de defeitos que existe aqui (o
 * ficheiro cresce por acrescento no fim ou no meio, secção a secção), e é
 * pouco o bastante para não haver um analisador a manter.
 */

const ESQUEMA = readFileSync(join(process.cwd(), "db/schema.sql"), "utf8");

/** `create table if not exists public.quotes (` → `public.quotes` */
const CRIA = /^\s*create table if not exists (public\.\w+)/;
/**
 * As formas de tocar numa tabela que EXIGEM que ela já exista.
 *
 * `create index … on public.X` entra pela mesma razão; `references public.X`
 * também, porque uma chave estrangeira para uma tabela que ainda não nasceu é
 * o mesmo erro por outra porta.
 */
/*
 * O `\b` no princípio não é decoração: sem ele, o `on` casava com o fim de
 * «function», e `create or replace function public.next_invoice_seq` entrava na
 * lista como se estivesse a mexer numa tabela chamada `next_invoice_seq`. Um
 * teste com um falso positivo dentro é um teste que se aprende a ignorar.
 */
const TOCA = /\b(?:alter table|insert into|update|delete from|references|on)\s+(public\.\w+)/g;

describe("db/schema.sql", () => {
  it("nunca mexe numa tabela antes de a criar", () => {
    const linhas = ESQUEMA.split("\n");
    const criadaNaLinha = new Map<string, number>();
    const fora: string[] = [];

    linhas.forEach((linha, i) => {
      const nova = CRIA.exec(linha);
      if (nova) {
        // `setdefault`: vale a PRIMEIRA criação. Um `create table if not
        // exists` repetido mais abaixo não muda o momento em que a tabela
        // passou a existir.
        if (!criadaNaLinha.has(nova[1])) criadaNaLinha.set(nova[1], i + 1);
        return;
      }
      for (const m of linha.matchAll(TOCA)) {
        const tabela = m[1];
        const nasceu = criadaNaLinha.get(tabela);
        if (nasceu === undefined || nasceu > i + 1) {
          fora.push(`linha ${i + 1}: ${tabela} — ${linha.trim().slice(0, 80)}`);
        }
      }
    });

    expect(
      fora,
      "Estas linhas mexem numa tabela que ainda não foi criada. Numa base que " +
        "já tem tudo isto corre sem se notar; numa instalação de raiz o ficheiro " +
        "pára aqui, a meio, com metade do esquema criado:\n  " +
        fora.join("\n  "),
    ).toEqual([]);
  });

  /**
   * CONTROLO POSITIVO. Sem isto, o teste de cima passava por a expressão nunca
   * reconhecer nada — e um teste que não sabe falhar não prova coisa nenhuma.
   */
  it("e sabe reconhecer uma tabela fora de ordem", () => {
    const inventado = [
      "alter table public.contracts add column if not exists idioma text;",
      "create table if not exists public.contracts (id text primary key);",
    ];
    const criada = new Map<string, number>();
    const fora: string[] = [];
    inventado.forEach((linha, i) => {
      const nova = CRIA.exec(linha);
      if (nova) {
        if (!criada.has(nova[1])) criada.set(nova[1], i + 1);
        return;
      }
      for (const m of linha.matchAll(TOCA)) {
        const nasceu = criada.get(m[1]);
        if (nasceu === undefined || nasceu > i + 1) fora.push(m[1]);
      }
    });
    expect(fora).toEqual(["public.contracts"]);
  });

  /** E que o ficheiro que se está a ler é mesmo o esquema, e não um vazio. */
  it("o ficheiro tem as tabelas que a casa usa", () => {
    for (const tabela of ["public.quotes", "public.proposals", "public.contracts"]) {
      expect(ESQUEMA).toContain(`create table if not exists ${tabela}`);
    }
  });

  /**
   * ── E A COLUNA QUE CUSTOU UMA PROPOSTA ──────────────────────────────────
   *
   * A `proposals.doc` é onde o documento que o casal abre é guardado. Sem ela,
   * o link mostra um quadro com o preço. Está aqui pelo nome porque é a coluna
   * de que este esquema não pode ficar sem — e porque foi a que se perdeu.
   */
  it("cria as colunas de que a página do casal depende", () => {
    for (const coluna of ["doc jsonb", "versao_selo text", "versao_numero integer"]) {
      expect(ESQUEMA, `falta a coluna ${coluna}`).toContain(
        `alter table public.proposals add column if not exists ${coluna};`,
      );
    }
  });
});
