// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Clientes from "./Clientes";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DOIS CLIENTES SÃO DOIS CLIENTES, MESMO SEM E-MAIL E COM O MESMO NOME
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A agregação junta os pedidos por `email || telefone || nome` — de propósito,
 * porque metade dos pedidos que entram por telefone não trazem e-mail. Mas a
 * lista identificava cada linha por `email || nome`, que é OUTRA identidade:
 * dois pedidos sem e-mail, de duas "Ana Silva" com telefones diferentes,
 * ficavam como dois clientes separados (bem) a partilhar a mesma chave (mal).
 *
 * O que se via: um aviso de chave duplicada do React e, ao abrir uma das
 * fichas, as DUAS sanfonas abriam ao mesmo tempo — o histórico de uma cliente
 * por baixo do nome da outra, que é como se liga à pessoa errada.
 *
 * A chave da linha passa a ser a MESMA identidade com que a agregação as
 * separou, guardada no cliente em vez de reconstruída à mão.
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana Silva",
    email: "",
    phone: "910000000",
    company: "",
    guests: 80,
    status: "pendente",
    submittedAt: "2026-08-10T10:00:00.000Z",
    ...over,
  }) as unknown as Quote;

/** As duas "Ana Silva" sem e-mail, separadas só pelo telefone. */
const DUAS_ANAS = [
  pedido({ id: "LIQ-1", phone: "910000001", submittedAt: "2026-08-11T10:00:00.000Z" }),
  pedido({ id: "LIQ-2", phone: "910000002", submittedAt: "2026-08-10T10:00:00.000Z" }),
];

afterEach(cleanup);

describe("Clientes — a chave da linha é a identidade da agregação", () => {
  it("abrir uma ficha não abre a da homónima", async () => {
    render(<Clientes quotes={DUAS_ANAS} onOpen={() => {}} />);

    const fichas = screen.getAllByRole("button", { expanded: false });
    expect(fichas).toHaveLength(2); // duas clientes, não uma

    await userEvent.click(fichas[0]);

    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
  });

  it("não emite aviso de chave duplicada", () => {
    const avisos: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => avisos.push(args);
    try {
      render(<Clientes quotes={DUAS_ANAS} onOpen={() => {}} />);
    } finally {
      console.error = original;
    }

    expect(avisos.flat().join(" ")).not.toMatch(/same key|chave|duplicate/i);
  });

  it("quem tem e-mail continua a ser agregado pelo e-mail", async () => {
    render(
      <Clientes
        quotes={[
          pedido({ id: "LIQ-3", email: "ana@exemplo.pt", phone: "910000001" }),
          pedido({ id: "LIQ-4", email: "ana@exemplo.pt", phone: "910000002" }),
        ]}
        onOpen={() => {}}
      />,
    );

    const fichas = screen.getAllByRole("button", { expanded: false });
    expect(fichas).toHaveLength(1); // um só cliente, dois pedidos

    await userEvent.click(fichas[0]);
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
  });
});
