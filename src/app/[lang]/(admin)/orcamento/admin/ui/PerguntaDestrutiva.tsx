"use client";

import { useState, type ReactNode } from "react";
import { FolhaOuDialogo } from "./FolhaOuDialogo";
import { Button } from "./Button";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «TENS A CERTEZA?» NÃO É UMA PERGUNTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do inventário: **63 acções irreversíveis, e 39 sem uma pergunta que diga o
 * que se perde.** Apagar um pedido pergunta — e **não diz qual**. Apagar em
 * lote diz quantos, nunca quais.
 *
 * Uma pergunta que não nomeia nada não é uma salvaguarda: é um passo a mais
 * que se aprende a saltar. Quem carrega em «Apagar» já decidiu apagar; o que a
 * pergunta tem de acrescentar é a informação que ele NÃO tinha — o nome da
 * coisa e o que vai atrás dela.
 *
 * A diferença é concreta. Isto:
 *
 *     Apagar definitivamente este pedido? Esta ação não pode ser anulada.
 *
 * contra isto:
 *
 *     Apagar o pedido de Ana e João?
 *       · 3 propostas, uma delas enviada ao casal
 *       · 2 pagamentos registados, 4.500,00 €
 *       · 148 convidados
 *     Não pode ser anulado.                      [Cancelar] [Apagar o pedido]
 *
 * A primeira só se pode responder com fé. A segunda responde-se a olhar.
 *
 * ── PORQUE É QUE NÃO É O `window.confirm` ─────────────────────────────────
 *
 * Porque num telemóvel de 375 px o `confirm()` é uma caixa do sistema: não
 * cabe uma lista lá dentro, não leva negrito, não se traduz, e os botões
 * dizem «OK» e «Cancelar» — «OK» é a última palavra que se quer debaixo de um
 * gesto que apaga um casamento inteiro. E é síncrono, portanto obriga o resto
 * do código a decidir antes de saber o que está em jogo.
 *
 * ── O RÓTULO DO BOTÃO REPETE O VERBO ──────────────────────────────────────
 *
 * «Apagar o pedido», não «Confirmar». Quem chega ao botão vindo de outra
 * janela — e chega, porque a pergunta pode ficar aberta enquanto se vai ver
 * outra coisa — tem de conseguir ler ali o que está prestes a fazer, sem
 * voltar ao título.
 */
export interface PerguntaDestrutivaProps {
  aberto: boolean;
  onFechar: () => void;
  /**
   * A pergunta, com o NOME da coisa lá dentro: «Apagar o pedido de Ana e
   * João?». Nunca «Tens a certeza?».
   */
  titulo: string;
  /**
   * O que desaparece com isto, uma linha por coisa e cada uma com o seu
   * número. É esta lista que faz a pergunta valer a pena — sem ela, mais vale
   * não perguntar.
   *
   * Vazia quando não há nada a enumerar (apagar um item solto): aí a pergunta
   * é só o título e o aviso, e continua a ser melhor do que «tens a certeza».
   */
  oQueSePerde?: ReactNode[];
  /** A frase por baixo da lista. «Não pode ser anulado.» é a mais comum. */
  aviso?: ReactNode;
  /** O verbo, repetido: «Apagar o pedido», «Remover a página». */
  rotuloConfirmar: string;
  onConfirmar: () => void | Promise<void>;
}

export function PerguntaDestrutiva({
  aberto,
  onFechar,
  titulo,
  oQueSePerde = [],
  aviso,
  rotuloConfirmar,
  onConfirmar,
}: PerguntaDestrutivaProps) {
  const [aTratar, setATratar] = useState(false);

  async function confirmar() {
    if (aTratar) return;
    setATratar(true);
    try {
      await onConfirmar();
    } finally {
      // Sem `setATratar(false)` a caixa ficava presa em «A apagar…» quando
      // quem chama a mantém aberta para mostrar uma falha.
      setATratar(false);
    }
  }

  return (
    <FolhaOuDialogo
      aberto={aberto}
      onFechar={aTratar ? () => {} : onFechar}
      titulo={titulo}
      largura="sm"
      accoes={
        <>
          {/* Cancelar PRIMEIRO e à esquerda: num gesto destrutivo, a saída é o
              caminho por omissão, e é onde o polegar cai. */}
          <Button variant="ghost" onClick={onFechar} disabled={aTratar}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirmar} loading={aTratar}>
            {rotuloConfirmar}
          </Button>
        </>
      }
    >
      {oQueSePerde.length > 0 && (
        <>
          <p className="text-sm text-foreground/70">Desaparece com isto:</p>
          <ul className="mt-2 space-y-1 text-sm">
            {oQueSePerde.map((linha, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-foreground/35">
                  ·
                </span>
                <span>{linha}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {aviso && (
        <p className={`text-sm text-[#8a2a22] ${oQueSePerde.length > 0 ? "mt-3" : ""}`}>{aviso}</p>
      )}
    </FolhaOuDialogo>
  );
}
