import { describe, expect, it } from "vitest";
import { taskUpdateSchema } from "./validation";
import type { Task } from "./orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM CAMPO DE UMA TAREFA SE PERDE A CAMINHO DO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O irmão deste ficheiro é o `validation.timeline.test.ts`, e a razão é a
 * mesma, letra por letra: o `taskUpdateSchema` corre em `.strip()`. Uma chave
 * que não esteja declarada é apagada **em silêncio** — sem erro, sem 400, com
 * 200.
 *
 * Na timeline isso aconteceu duas vezes e a segunda custou o dobro, porque fez
 * DUAS coisas ao mesmo tempo:
 *
 *  1. o que ela escrevia desaparecia ao gravar;
 *  2. e a gravação seguinte respondia 409 — o ecrã dizia ter partido de uma
 *     base com esses campos, o servidor tinha uma sem eles, e a conferência
 *     via, correctamente, duas coisas diferentes. Ela lia «mudou noutro sítio»
 *     sem ninguém lhe ter tocado.
 *
 * A fase 08 acrescenta à tarefa exactamente o tipo de campo que cai nesta
 * armadilha — notas, subtarefas e anexos, tudo escrito num painel e gravado por
 * PATCH —, e a fase 09 acrescenta a `posicao`. Por isso a rede vem antes deles.
 *
 * ── COMO É QUE ISTO SABE QUAIS SÃO OS CAMPOS ─────────────────────────────
 *
 * O `Task` é um tipo, e um tipo não existe em tempo de execução. A lista abaixo
 * é escrita à mão e o `satisfies Required<Task>` é que a obriga a estar
 * completa: acrescentar um campo ao `Task` sem o acrescentar aqui NÃO COMPILA.
 * Depois o teste leva-o ao esquema.
 */

/** Um valor plausível por cada campo de uma tarefa. */
const TAREFA = {
  id: "t-1",
  title: "Confirmar florista para a Quinta do Vale",
  done: false,
  priority: "alta",
  dueDate: "2026-09-11",
  quoteId: "q-7",
  clientName: "Melanie e Sebastien",
  assignee: "Catarina",
  area: "Decoração",
  createdAt: "2026-09-10T08:00:00.000Z",
  notas: "O Miguel leva as jarras na sexta.",
  subtarefas: [{ id: "s-1", titulo: "Pedir orçamento", feita: true }],
  anexos: [{ id: "a-1", nome: "Pasta do casamento", url: "https://exemplo.pt/pasta" }],
  posicao: 2048,
} satisfies Required<Task>;

/**
 * Os campos que o servidor ATRIBUI e que um PATCH nunca pode reescrever. Estão
 * fora do esquema de propósito (ver o `ALLOWED` de `api/tarefas/[id]`), e é por
 * isso que o caso de baixo os salta em vez de os exigir.
 */
const DO_SERVIDOR = new Set(["id", "createdAt"]);

describe("o esquema de actualização de uma tarefa", () => {
  it("deixa passar TODOS os campos editáveis, e não apaga nenhum em silêncio", () => {
    const saida = taskUpdateSchema.parse(TAREFA);

    for (const campo of Object.keys(TAREFA) as (keyof typeof TAREFA)[]) {
      if (DO_SERVIDOR.has(campo)) continue;
      expect(
        saida[campo as keyof typeof saida],
        `o campo «${campo}» não está declarado no \`taskUpdateSchema\`. ` +
          "O `.strip()` apaga-o com 200 e sem erro: o que ela escrever nesse campo " +
          "desaparece ao gravar, e a gravação a seguir responde 409 porque a tarefa " +
          "que o ecrã declara deixa de ser a que ficou guardada.",
      ).toEqual(TAREFA[campo]);
    }
  });

  it("uma tarefa sem nenhum dos campos novos continua a passar", () => {
    /* O contrário do caso de cima, e é preciso: declarar um campo como
       obrigatório por engano rejeitava com 400 todas as tarefas antigas, que
       são a totalidade das que estão gravadas hoje. */
    const saida = taskUpdateSchema.parse({ title: "Rever seating plan", done: false });
    expect(saida.title).toBe("Rever seating plan");
    expect(saida.subtarefas).toBeUndefined();
  });

  it("recusa uma ligação que não seja http(s) — um `javascript:` corria no ecrã dela", () => {
    const mau = taskUpdateSchema.safeParse({
      anexos: [{ id: "a-1", nome: "Inocente", url: "javascript:alert(1)" }],
    });
    expect(mau.success).toBe(false);
  });

  it("uma posição infinita não entra na coluna", () => {
    expect(taskUpdateSchema.safeParse({ posicao: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ posicao: 1536 }).success).toBe(true);
  });
});
