"use client";

import { useMemo } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import { conferir, temReparos, type Severidade } from "@/lib/orcamento/conferencia";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * A PASSAGEM DE OLHOS ANTES DE ENVIAR.
 *
 * O envio é irreversível: o email sai uma vez. Um erro no nome numa proposta de
 * casamento custa credibilidade inteira — quem recebe uma proposta com o nome
 * mal escrito conclui, e conclui bem, que aquilo foi feito à pressa.
 *
 * ── MOSTRA TAMBÉM O QUE PASSOU ─────────────────────────────────────────────
 * Uma lista só com problemas não diz se as outras verificações foram sequer
 * feitas, e é essa dúvida que faz voltar a conferir tudo à mão — que é o
 * trabalho que isto vem poupar. Os vistos verdes são metade da utilidade.
 *
 * ── NÃO TRAVA NADA ─────────────────────────────────────────────────────────
 * O que trava o envio continua em `proposal-progress.ts`. Uma data diferente da
 * do pedido pode ser a data certa: o casal mudou de ideias e disse-o ao
 * telefone. Quem decide é ela.
 */

const MARCA: Record<Severidade, { simbolo: string; cor: string }> = {
  erro: { simbolo: "✕", cor: "text-[#b5654a]" },
  aviso: { simbolo: "!", cor: "text-[#8a6420]" },
  ok: { simbolo: "✓", cor: "text-[#4d6350]" },
};

interface Props {
  doc: ProposalDoc;
  quote: Quote;
  /** Os outros pedidos, para o padrão de preço. Sem eles não há comparação. */
  quotes?: Quote[];
  totalBruto: number;
  /**
   * A língua em que o PDF vai sair — o mesmo estado do selector do passo
   * anterior. É ela que decide se a lista fala do pedido que veio em inglês ou
   * dos campos que ainda não têm versão inglesa.
   */
  idioma?: IdiomaDaProposta;
}

export default function Conferencia({ doc, quote, quotes = [], totalBruto, idioma }: Props) {
  const verificacoes = useMemo(
    () => conferir({ doc, quote, historico: quotes, totalBruto, idioma }),
    [doc, quote, quotes, totalBruto, idioma],
  );
  const reparos = temReparos(verificacoes);

  return (
    <section
      aria-labelledby="conferencia-titulo"
      className={`mt-5 rounded-2xl border p-4 ${
        reparos
          ? "border-[#c08a3e]/40 bg-[#c08a3e]/[0.05]"
          : "border-[#4d6350]/25 bg-[#4d6350]/[0.04]"
      }`}
    >
      <h3
        id="conferencia-titulo"
        className="text-[11px] font-medium tracking-[0.12em] uppercase text-foreground/70"
      >
        Conferência
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-foreground/55">
        {reparos
          ? "Há coisas a que vale a pena olhar. Nenhuma te impede de enviar."
          : "Está tudo de acordo com o pedido original."}
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {verificacoes.map((v) => {
          const m = MARCA[v.severidade];
          return (
            <li key={v.id} className="flex items-start gap-2 text-xs leading-relaxed">
              <span aria-hidden="true" className={`mt-px font-semibold ${m.cor}`}>
                {m.simbolo}
              </span>
              <span className="min-w-0">
                <span
                  className={v.severidade === "ok" ? "text-foreground/45" : "text-foreground/75"}
                >
                  {v.titulo}
                </span>
                {v.detalhe && <span className="text-foreground/55"> — {v.detalhe}</span>}
                {/* O leitor de ecrã ouve a gravidade, que a cor e o símbolo só
                    dizem a quem vê. */}
                <span className="sr-only">
                  {v.severidade === "ok"
                    ? " (conferido)"
                    : v.severidade === "erro"
                      ? " (erro)"
                      : " (a confirmar)"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
