"use client";

import { Button } from "./ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * "NÃO CONSEGUI LER" — o painel que uma lista mostra quando a leitura FALHOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O problema que isto resolve ───────────────────────────────────────────
 * O `useCachedList` devolve `data` indefinido tanto quando a lista está mesmo
 * vazia como quando o pedido rebentou. Um ecrã que só olha para `data.length`
 * confunde as duas coisas e diz, com toda a confiança, "Catálogo vazio" — uma
 * frase que ACUSA a utilizadora de não ter carregado nada quando o que se
 * passou foi o servidor não ter respondido. Foi exactamente assim que o ecrã
 * Material apareceu vazio durante dias: as tabelas nem sequer existiam.
 *
 * Um estado vazio convida a começar. Um estado de falha tem de fazer outra
 * coisa: dizer o que se passou, e dar o passo seguinte. São painéis
 * diferentes porque são situações diferentes.
 *
 * ── Porque é que a MENSAGEM DO SERVIDOR aparece tal e qual ────────────────
 * Quando a rota sabe o que se passa — "falta correr o db/schema.sql" — essa
 * frase resolve o problema sozinha. Traduzi-la para um "ocorreu um erro"
 * genérico deitava fora a única informação útil. Quando o servidor não disse
 * nada (rede em baixo, 500 mudo), fica a frase de reserva, que é honesta
 * quanto ao que não se sabe.
 */
export function AvisoDeFalha({
  titulo = "Não foi possível ler",
  mensagem,
  aoTentarDeNovo,
}: {
  /** O que falhou, na linguagem do ecrã: "Não foi possível ler o material". */
  titulo?: string;
  /** O que o servidor disse. Vazio quando não disse nada. */
  mensagem?: string;
  /** Volta a pedir. Normalmente o `refresh` do `useCachedList`. */
  aoTentarDeNovo?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-xl border border-[#a03a1a]/25 bg-[#f6e6df]/50 px-4 py-4 text-sm"
    >
      <p className="font-medium text-[#a03a1a]">{titulo}</p>
      <p className="bo-text-muted mt-1">
        {mensagem || "O servidor não respondeu. Verifica a ligação e tenta outra vez."}
      </p>
      {aoTentarDeNovo && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      )}
    </div>
  );
}
