"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SAÍDA DE UMA EDIÇÃO EM LINHA, PARA QUEM NÃO TEM TECLADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do registo do audit, e é um dos oito bloqueios:
 *
 *   «Uma edição em linha começada não se consegue abandonar: a única saída é o
 *   Escape. O guião do dia, a checklist e o inventário editam-se tocando no
 *   texto, que se troca por um `<input>` com `autoFocus`. O campo tem
 *   `onBlur={commitEdit}` e um `onKeyDown` com duas teclas: Enter grava, Escape
 *   desiste. Num telemóvel não há Escape. Ou seja: tocou-se por engano na hora
 *   errada, escreveu-se "1" a mais, e a partir daí não há gesto nenhum que
 *   devolva o valor anterior — tocar noutro sítio dispara o `onBlur` e grava,
 *   fechar o teclado dispara o `onBlur` e grava, rolar a lista pode disparar o
 *   `onBlur` e gravar.»
 *
 * É o ecrã que ela usa de pé numa quinta, a corrigir o guião no local, com o
 * polegar. O comentário do próprio `EventTimeline` diz textualmente «o guião do
 * dia é lido e corrigido no local, de pé» — o alvo de toque foi corrigido para
 * 44 px, a saída não.
 *
 * ── PORQUE É QUE O `onPointerDown` LEVA UM `preventDefault` ───────────────
 *
 * Porque sem ele este botão não funciona uma única vez, e a falha é invisível:
 * pousar o dedo tira o foco ao campo, o `onBlur` GRAVA, o campo fecha, e o
 * clique aterra onde já não há botão nenhum. Ou seja — o botão de desistir
 * gravaria. `preventDefault` no `pointerdown` impede a mudança de foco, e o
 * campo continua vivo até o clique chegar.
 *
 * ── E porque é que não há um ✓ ao lado ────────────────────────────────────
 *
 * Porque gravar já tem dois caminhos que ninguém precisa de descobrir: o Enter
 * e o próprio `onBlur` — tocar noutro sítio grava, que é o que se espera. O que
 * faltava era o contrário, e é só isso que aqui se acrescenta. Dois botões onde
 * um chega é uma linha mais estreita para o texto, e a largura desta linha já é
 * o problema de outro relatório.
 */
export function DesistirDaEdicao({
  onDesistir,
  oQue,
  className = "",
}: {
  onDesistir: () => void;
  /** «a hora», «o momento» — entra na frase que quem não vê o ecrã ouve. */
  oQue: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onDesistir}
      aria-label={`Desistir de editar ${oQue}`}
      title="Desistir"
      className={`alvo-toque flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm leading-none text-foreground/40 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/70 ${className}`}
    >
      <span aria-hidden="true">✕</span>
    </button>
  );
}
