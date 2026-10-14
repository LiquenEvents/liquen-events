"use client";

import type { ReactNode } from "react";
import type { PropostaParaContas } from "@/lib/orcamento/dinheiro-dos-pedidos";
import { useCachedList } from "./useCachedList";

/**
 * As propostas que as contas do dinheiro precisam (`dinheiro-dos-pedidos.ts`):
 * a taxa de IVA que o cliente viu, e o total quando o preço final ficou por
 * escrever.
 *
 * É um componente, e não uma chamada no `AdminClient`, para a lista só se pedir
 * quando um ecrã que mostra dinheiro está aberto. Lê a forma leve, sem o
 * documento — a MESMA chave do Acompanhamento e da Análise, por isso quem já lá
 * passou não a descarrega outra vez.
 *
 * Enquanto não chega (ou se falhar), as contas correm sem ela — o `quotedPrice`
 * à taxa da estimativa, que é o que os ecrãs mostravam antes. Um número que
 * espera por uma segunda lista para aparecer é pior do que um que se acerta.
 */
export default function ComPropostasParaContas({
  children,
}: {
  children: (propostas: PropostaParaContas[] | undefined) => ReactNode;
}) {
  const { data } = useCachedList<PropostaParaContas[]>(
    "propostas-leves",
    "/api/propostas?semDoc=1",
  );
  return <>{children(Array.isArray(data) ? data : undefined)}</>;
}
