"use client";

import type { AnchorHTMLAttributes } from "react";
import { track } from "@/lib/track";

/**
 * Um `<a>` normal que avisa a medição quando é clicado.
 *
 * Existe porque o `TrackedLink` embrulha o `next/link`, que serve para navegar
 * DENTRO do site. Um `tel:` ou um `mailto:` não são navegação: entregam a acção
 * ao sistema operativo, e o `next/link` não tem nada a fazer no meio disso.
 *
 * PORQUE É QUE ISTO IMPORTA MAIS DO QUE PARECE. Um clique no telefone é, neste
 * negócio, um sinal de intenção mais forte do que um formulário: quem liga quer
 * falar hoje. Se a Google não o vir, está a optimizar com metade das conversões
 * escondidas, e as campanhas que geram chamadas em vez de formulários parecem
 * piores do que são. Custa um componente de dez linhas.
 *
 * Fica um pedaço de cliente minúsculo — a página à volta continua no servidor.
 */
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Nome do evento. */
  event: string;
  /** Propriedades extra, por exemplo { origem: "polo:alentejo" }. */
  trackProps?: Record<string, string | number | boolean>;
};

export default function TrackedAnchor({ event, trackProps, onClick, ...rest }: Props) {
  return (
    <a
      {...rest}
      onClick={(e) => {
        track(event, trackProps);
        onClick?.(e);
      }}
    />
  );
}
