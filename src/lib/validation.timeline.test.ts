import { describe, expect, it } from "vitest";
import { quoteUpdateSchema } from "./validation";
import type { TimelineItem } from "./orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM CAMPO DE UM MOMENTO SE PERDE A CAMINHO DO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `quoteUpdateSchema` corre em `.strip()`. Uma chave que não esteja declarada
 * no `timelineItemSchema` é apagada **em silêncio**: sem erro, sem 400, com 200.
 *
 * Isto já aconteceu duas vezes. A primeira com a `duracao` — e o comentário que
 * ficou no `validation.ts` a avisar não impediu a segunda, com o `local` e as
 * `notas`, três meses depois. Essa custou o dobro, porque fez DUAS coisas:
 *
 *  1. o que ela escrevia desaparecia ao gravar;
 *  2. e a gravação seguinte respondia 409 — o ecrã dizia ter partido de um
 *     guião com esses campos, o servidor tinha um sem eles, e a conferência da
 *     base via duas listas diferentes. Ela via «a timeline mudou noutro sítio»
 *     sem ninguém lhe ter tocado.
 *
 * Um comentário avisa quem o lê. Este ficheiro avisa quem NÃO o leu, que é
 * quem precisa do aviso.
 *
 * ── COMO É QUE ISTO SABE QUAIS SÃO OS CAMPOS ─────────────────────────────
 *
 * O `TimelineItem` é um tipo, e um tipo não existe em tempo de execução. A
 * lista abaixo é escrita à mão, e o `satisfies` é que a obriga a estar
 * completa: acrescentar um campo ao `TimelineItem` sem o acrescentar aqui não
 * compila. Depois este teste leva-o ao esquema.
 */

/** Um valor plausível por cada campo de um momento. */
const MOMENTO = {
  id: "m-1",
  time: "08:30",
  title: "Chegada Icook para montagem",
  owner: "Catarina",
  duracao: 45,
  local: "Adega Fitapreta",
  notas: "enviar táxi",
} satisfies Required<TimelineItem>;

describe("o esquema de um momento da timeline", () => {
  it("deixa passar TODOS os campos, e não apaga nenhum em silêncio", () => {
    const saida = quoteUpdateSchema.parse({ timeline: [MOMENTO] });
    const momento = (saida.timeline as TimelineItem[])[0];

    for (const campo of Object.keys(MOMENTO) as (keyof typeof MOMENTO)[]) {
      expect(
        momento[campo],
        `o campo «${campo}» não está declarado no \`timelineItemSchema\`. ` +
          "O `.strip()` apaga-o com 200 e sem erro: o que ela escrever nesse campo " +
          "desaparece ao gravar, e a gravação a seguir responde 409 porque a base " +
          "que o ecrã declara deixa de ser a que ficou guardada.",
      ).toEqual(MOMENTO[campo]);
    }
  });

  it("um momento sem os campos opcionais continua a passar", () => {
    /* O contrário do caso de cima, e é preciso: declarar um campo como
       obrigatório por engano rejeitava com 400 todos os momentos antigos, que
       são a maioria dos que estão gravados. */
    const saida = quoteUpdateSchema.parse({
      timeline: [{ id: "m-2", time: "17:00", title: "Cerimónia" }],
    });
    expect((saida.timeline as TimelineItem[])[0].title).toBe("Cerimónia");
  });
});
