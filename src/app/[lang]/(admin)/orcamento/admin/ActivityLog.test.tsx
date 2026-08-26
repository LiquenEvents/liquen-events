// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ActivityLog from "./ActivityLog";
import type { ActivityKind, Quote } from "@/lib/orcamento/types";

/**
 * UMA LINHA MÁ NÃO PODE DERRUBAR O ECRÃ TODO.
 *
 * O histórico pintava cada entrada indexando o mapa com o valor da própria
 * linha — `KIND_META[entry.kind].color`. Um tipo fora do mapa é `undefined`, e
 * como isto é um componente de cliente o erro sobe ao limite de erro e
 * substitui o BACK OFFICE INTEIRO pelo ecrã "Ocorreu um erro inesperado" — não
 * só aquela linha, não só este painel.
 *
 * A API valida os tipos, portanto pelo uso normal não acontece. Acontece com
 * uma linha antiga, uma migração, ou um tipo novo escrito pelo servidor antes
 * de este mapa o conhecer — que é quando ela menos pode dar-se ao luxo de
 * perder o ecrã. O mesmo defeito já tinha sido corrigido nas listas de estados
 * (ver `status-fallback.test.tsx` e `status-meta.ts`); o histórico ficou de
 * fora.
 */

afterEach(cleanup);

const pedido = (activityLog: Quote["activityLog"]) =>
  ({
    id: "q1",
    name: "Ana Marques",
    submittedAt: "2026-01-02T10:00:00.000Z",
    activityLog,
  }) as unknown as Quote;

describe("ActivityLog com um tipo de entrada desconhecido", () => {
  const desconhecida = {
    id: "a1",
    at: "2026-01-03T10:00:00.000Z",
    // O que uma migração, ou um servidor mais novo do que este ecrã, escreve.
    kind: "revisao_pedida" as ActivityKind,
    summary: "Cliente pediu revisão do orçamento",
  };

  it("mostra a linha em vez de rebentar o painel", () => {
    render(<ActivityLog quote={pedido([desconhecida])} />);
    expect(screen.getByText("Cliente pediu revisão do orçamento")).toBeTruthy();
  });

  it("não faz desaparecer as entradas que se sabem ler", () => {
    render(
      <ActivityLog
        quote={pedido([
          desconhecida,
          {
            id: "a2",
            at: "2026-01-04T10:00:00.000Z",
            kind: "proposal_sent",
            summary: "Proposta enviada ao cliente",
          },
        ])}
      />,
    );
    expect(screen.getByText("Proposta enviada ao cliente")).toBeTruthy();
    expect(screen.getByText("Pedido de orçamento submetido")).toBeTruthy();
  });
});
