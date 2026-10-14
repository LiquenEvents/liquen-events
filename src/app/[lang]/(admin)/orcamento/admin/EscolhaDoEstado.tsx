"use client";

import { useMemo } from "react";
import type { QuoteStatus } from "@/lib/orcamento/types";
import { Escolha, type OpcaoDeEscolha } from "./ui/Escolha";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MENU DO ESTADO — O MESMO NOS TRÊS SÍTIOS ONDE SE MUDA O ESTADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 14/10, com a captura da lista nativa (azul e cinzenta) que
 * a pastilha abria: «coloca isto ao estilo da apple transparente». E, quando
 * lhe perguntei onde: nos TRÊS sítios — a pastilha da lista, o «Marcar
 * selecionados como» e o estado no painel do pedido.
 *
 * Era um `<select>` nativo nos três. Passa a ser o `Escolha` da casa — o
 * material de vidro, o visto na escolha actual, o teclado inteiro — com duas
 * escolhas que os outros campos não fazem:
 *
 *  · `nativoNoToque={false}`: no telemóvel também abre o menu de vidro, e não
 *    a roda do sistema. Foi o que ela pediu, e são cinco opções curtas, que é
 *    o caso em que o menu cabe bem no dedo;
 *  · `noCorpo`: a lista vive no `<body>`. A pastilha está numa tabela com
 *    `overflow-x-auto`, e na última linha a lista era cortada pelo fundo dela.
 *
 * O clique fica AQUI. A linha inteira da tabela abre o pedido, e os eventos do
 * React sobem pela árvore dos componentes mesmo quando a lista está num
 * portal — por isso o invólucro trava-os, para a escolha não abrir a gaveta.
 */

export interface EstadoParaEscolher {
  id: QuoteStatus;
  label: string;
  /** As classes da pastilha deste estado (fundo e tinta). */
  color: string;
}

export function EscolhaDoEstado({
  estados,
  valor,
  aoMudar,
  forma,
  vazio,
  disabled,
  id,
  className,
  containerClassName,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: {
  estados: readonly EstadoParaEscolher[];
  /** O estado actual; `""` deixa o campo vazio (o «Marcar como» começa assim). */
  valor: QuoteStatus | "";
  aoMudar: (estado: QuoteStatus) => void;
  /** `pastilha`: a da lista, com a cor do estado. `campo`: um campo de formulário. */
  forma: "pastilha" | "campo";
  /** O texto do campo vazio. */
  vazio?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  containerClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  const opcoes = useMemo<OpcaoDeEscolha[]>(
    () => estados.map((e) => ({ valor: e.id, rotulo: e.label })),
    [estados],
  );
  const cor =
    forma === "pastilha"
      ? (estados.find((e) => e.id === valor)?.color ?? "bg-[var(--bo-tinta-10)] text-foreground/30")
      : "";

  return (
    // Só o clique: o Escape tem de continuar a subir quando a lista está
    // fechada (fecha a gaveta), e o `Escolha` já o trava quando está aberta.
    <span
      className={`inline-flex ${containerClassName ?? ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Escolha
        opcoes={opcoes}
        valor={valor}
        aoMudar={(v) => v && aoMudar(v as QuoteStatus)}
        vazio={vazio}
        disabled={disabled}
        id={id}
        nativoNoToque={false}
        noCorpo
        compacta={forma === "pastilha"}
        // Nos dois, o desenho fechado é de quem chama: a pastilha tem a cor do
        // estado, e os dois campos já tinham o seu `bo-input` com medidas suas.
        variante="nua"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        containerClassName={containerClassName}
        className={
          forma === "pastilha"
            ? `alvo-toque cursor-pointer rounded-sm py-0.5 pl-2 text-[9px] uppercase tracking-[0.15em] ${cor} ${className ?? ""}`
            : (className ?? "")
        }
      />
    </span>
  );
}
