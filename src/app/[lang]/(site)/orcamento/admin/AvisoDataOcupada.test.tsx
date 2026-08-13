// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import AvisoDataOcupada from "./AvisoDataOcupada";

/**
 * O aviso existe para ser LIDO antes de escrever a proposta. Estes testes
 * prendem as três coisas que o tornam útil: aparece só quando há mesmo choque,
 * diz qual é o outro evento e onde é, e não bloqueia nada.
 */

let n = 0;
function pedido(over: Partial<Quote> = {}): Quote {
  n += 1;
  return {
    id: `LQ-${n}`,
    submittedAt: "2026-01-01T10:00:00.000Z",
    lastUpdated: "2026-01-01T10:00:00.000Z",
    status: "pendente",
    name: `Casal ${n}`,
    email: `c${n}@exemplo.pt`,
    phone: "910000000",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    date: "2027-09-18",
    endDate: "",
    location: "Évora",
    locationType: "pequena_cidade",
    guests: 120,
    duration: 8,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    acceptTerms: true,
    acceptMarketing: false,
    ...over,
  } as Quote;
}

afterEach(cleanup);

describe("AvisoDataOcupada", () => {
  it("não desenha nada quando o dia está livre", () => {
    const alvo = pedido();
    const { container } = render(<AvisoDataOcupada quote={alvo} quotes={[alvo]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nomeia o outro evento, o local e a distância", () => {
    const alvo = pedido({ name: "Ana e Rui", location: "Évora" });
    const outro = pedido({
      name: "Marta e João",
      location: "Palmela",
      status: "cotado",
      date: "2027-09-18",
    });

    render(<AvisoDataOcupada quote={alvo} quotes={[alvo, outro]} />);

    expect(screen.getByText("Marta e João")).toBeInTheDocument();
    expect(screen.getByText(/Palmela/)).toBeInTheDocument();
    // A distância aparece sempre com "≈" — nunca como um número exato.
    expect(screen.getByText(/≈ \d+ km daqui/)).toBeInTheDocument();
    expect(screen.getByText(/no mesmo dia/)).toBeInTheDocument();
  });

  it("diz que não impede nada — é informação, não uma tranca", () => {
    const alvo = pedido();
    const outro = pedido({ status: "aceite" });
    render(<AvisoDataOcupada quote={alvo} quotes={[alvo, outro]} />);
    expect(screen.getByText(/Não impede nada/)).toBeInTheDocument();
  });

  it("distingue o que é conciliável do que não é", () => {
    const alvo = pedido({ location: "Évora" });
    const longe = pedido({ location: "Faro", status: "aceite", date: "2027-09-18" });
    render(<AvisoDataOcupada quote={alvo} quotes={[alvo, longe]} />);
    expect(screen.getByText("difícil de conciliar")).toBeInTheDocument();

    cleanup();
    const perto = pedido({ location: "Arraiolos", status: "aceite", date: "2027-09-18" });
    render(<AvisoDataOcupada quote={alvo} quotes={[alvo, perto]} />);
    expect(screen.getByText("conciliável")).toBeInTheDocument();
  });

  it("explica porque é que a véspera conta", () => {
    const alvo = pedido({ date: "2027-09-18" });
    const vespera = pedido({ date: "2027-09-17", status: "aceite" });
    render(<AvisoDataOcupada quote={alvo} quotes={[alvo, vespera]} />);
    expect(screen.getByText(/desmontagem de um cai na montagem do outro/i)).toBeInTheDocument();
  });

  it("deixa abrir o outro pedido sem sair daqui", async () => {
    const alvo = pedido();
    const outro = pedido({ name: "Marta e João", status: "aceite" });
    const abrir = vi.fn();
    render(<AvisoDataOcupada quote={alvo} quotes={[alvo, outro]} onAbrir={abrir} />);

    await userEvent.click(screen.getByRole("button", { name: /Marta e João/ }));
    expect(abrir).toHaveBeenCalledWith(outro.id);
  });

  it("quando não se sabe onde é, diz isso em vez de mostrar zero km", () => {
    const alvo = pedido({ location: "Portugal" });
    const outro = pedido({ status: "aceite", location: "Évora" });
    render(<AvisoDataOcupada quote={alvo} quotes={[alvo, outro]} />);
    expect(screen.getByText(/distância desconhecida/)).toBeInTheDocument();
    expect(screen.queryByText(/≈ 0 km/)).not.toBeInTheDocument();
  });
});
