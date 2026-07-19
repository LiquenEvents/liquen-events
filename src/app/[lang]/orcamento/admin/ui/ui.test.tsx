// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Button } from "./Button";
import { Card, SectionCard } from "./Card";
import { Field } from "./Field";
import { PageHeader } from "./PageHeader";
import { EmptyState } from "./EmptyState";
import { Toolbar } from "./Toolbar";
import { Segmented } from "./Segmented";

/**
 * Isolated coverage for the new UI primitives — asserts the accessibility wiring
 * and interactive contracts a redesign wave will rely on. No app state, no
 * stores; these are pure presentational components.
 */

afterEach(cleanup);

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveAttribute("type", "button");
  });

  it("blocks clicks and marks aria-busy while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Guardar" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Card / SectionCard", () => {
  it("renders children in a bare Card", () => {
    render(<Card>conteúdo</Card>);
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("SectionCard renders a heading and actions", () => {
    render(
      <SectionCard title="Pedidos" actions={<button>Novo</button>}>
        corpo
      </SectionCard>,
    );
    expect(screen.getByRole("heading", { name: "Pedidos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo" })).toBeInTheDocument();
    expect(screen.getByText("corpo")).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("wires label→control and hint via aria-describedby", () => {
    render(<Field label="Nome" hint="Só interno." placeholder="Maria" />);
    const input = screen.getByLabelText("Nome") as HTMLInputElement;
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(document.getElementById(describedBy!)).toHaveTextContent("Só interno.");
  });

  it("sets aria-invalid and shows the error message when in error", () => {
    render(<Field label="Email" error="Email inválido" />);
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)).toHaveTextContent("Email inválido");
  });

  it("renders a select with forwarded options", () => {
    render(
      <Field as="select" label="Estado" defaultValue="novo">
        <option value="novo">Novo</option>
        <option value="cotado">Proposta enviada</option>
      </Field>,
    );
    const select = screen.getByLabelText("Estado") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("novo");
  });
});

describe("PageHeader", () => {
  it("renders the title as a level-1 heading by default", () => {
    render(<PageHeader title="Visão geral" subtitle="Tudo num relance." />);
    expect(screen.getByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getByText("Tudo num relance.")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("shows the CTA and fires its handler", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Sem pedidos"
        description="Aparecem aqui."
        action={{ label: "Criar", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Toolbar", () => {
  it("renders start and end slots", () => {
    render(<Toolbar start={<span>filtros</span>} end={<span>ações</span>} />);
    expect(screen.getByText("filtros")).toBeInTheDocument();
    expect(screen.getByText("ações")).toBeInTheDocument();
  });
});

describe("Segmented", () => {
  const options = [
    { value: "list", label: "Lista" },
    { value: "board", label: "Quadro" },
  ] as const;

  it("exposes radiogroup semantics with the active option checked", () => {
    render(<Segmented ariaLabel="Vista" value="list" onChange={() => {}} options={[...options]} />);
    expect(screen.getByRole("radiogroup", { name: "Vista" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Lista" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Quadro" })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange when a segment is clicked", () => {
    const onChange = vi.fn();
    render(<Segmented ariaLabel="Vista" value="list" onChange={onChange} options={[...options]} />);
    fireEvent.click(screen.getByRole("radio", { name: "Quadro" }));
    expect(onChange).toHaveBeenCalledWith("board");
  });

  it("moves selection with arrow keys", () => {
    const onChange = vi.fn();
    render(<Segmented ariaLabel="Vista" value="list" onChange={onChange} options={[...options]} />);
    fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Vista" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("board");
  });
});
