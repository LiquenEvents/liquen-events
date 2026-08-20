"use client";

import { resolverEscolhas, type Escolha, type RespostaDeEscolha } from "@/lib/proposta-escolhas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O CASAL ESCOLHEU — DO LADO DE CÁ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «A escolha volta ao back office e aparece na ficha do evento.» Isto é a
 * segunda metade dessa frase.
 *
 * ── PORQUE É QUE AS QUE FALTAM APARECEM TAMBÉM ────────────────────────────
 *
 * Uma lista só com as respondidas fazia «ainda não escolheram a paleta»
 * parecer «não havia paleta para escolher» — e são duas conversas muito
 * diferentes de ter ao telefone. A que falta aparece cinzenta, com as
 * alternativas à vista, para ela poder perguntar pelo nome delas.
 *
 * ── E PORQUE É QUE NÃO HÁ AQUI UM BOTÃO PARA ELA ESCOLHER ────────────────
 *
 * Porque a escolha é do casal. Se ela decidir ao telefone, o sítio disso é o
 * registo de actividade («ficou a paleta terracota, falado a 12/05») — uma
 * nota de quem esteve na conversa, e não uma resposta gravada como se tivesse
 * vindo do link deles.
 *
 * ── ZERO RASTREIO, TAMBÉM AQUI ────────────────────────────────────────────
 *
 * Não diz quando abriram, quantas vezes voltaram, nem quanto tempo demoraram a
 * decidir. Diz o que escolheram e o dia. É tudo o que existe gravado, e é de
 * propósito.
 */

/** O dia, em português, sem hora: a hora a que o casal decidiu não é conta nossa. */
function dia(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
}

export default function EscolhasDoCasal({
  escolhas,
  respostas,
}: {
  /** As perguntas, do documento da proposta que o casal tem à frente. */
  escolhas: Escolha[] | undefined;
  /** As respostas, do pedido. */
  respostas: RespostaDeEscolha[] | undefined;
}) {
  const linhas = resolverEscolhas(escolhas, respostas);
  // Sem alternativas escritas não há secção nenhuma: um cartão vazio a dizer
  // «À escolha do casal» num evento onde ela nunca deu alternativas é ruído
  // em todos os eventos para servir alguns.
  if (linhas.length === 0) return null;

  const porResponder = linhas.filter((l) => l.estado.tipo === "por-responder").length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-foreground/70 text-[11px] uppercase tracking-[0.18em]">
          À escolha do casal
        </h3>
        {porResponder > 0 && (
          <span className="text-foreground/40 text-[11px] tabular-nums">
            {porResponder} por responder
          </span>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {linhas.map(({ escolha, estado }) => (
          <li key={escolha.id} className="rounded-lg border border-[var(--bo-hairline)] px-3 py-2.5">
            <p className="text-foreground/75 text-sm">{escolha.titulo}</p>

            {estado.tipo === "escolhida" && (
              <p className="mt-1 text-sm">
                <span className="font-medium text-[#4d6350]">{estado.opcao.rotulo}</span>
                <span className="text-foreground/40"> · {dia(estado.em)}</span>
              </p>
            )}

            {estado.tipo === "por-responder" && (
              <p className="mt-1 text-foreground/45 text-[13px]">
                Ainda não escolheram — {escolha.opcoes.map((o) => o.rotulo).join(" ou ")}.
              </p>
            )}

            {estado.tipo === "opcao-desapareceu" && (
              // Não é «não responderam»: responderam, e a opção que escolheram
              // saiu do documento depois disso. Dizê-lo é o que evita a
              // conversa em que ela jura que eles nunca disseram nada.
              <p className="mt-1 text-[#8a4632] text-[13px] leading-snug">
                Escolheram uma opção que já não está na proposta ({dia(estado.em)}). Vale a pena
                confirmar com eles antes de comprar.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
