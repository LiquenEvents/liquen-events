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
import { cn } from "./cn";

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

  it("wraps to the last option with ArrowLeft from the first", () => {
    const onChange = vi.fn();
    render(<Segmented ariaLabel="Vista" value="list" onChange={onChange} options={[...options]} />);
    fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Vista" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("board");
  });

  it("keeps a single tab stop via roving tabindex on the active option", () => {
    render(<Segmented ariaLabel="Vista" value="list" onChange={() => {}} options={[...options]} />);
    expect(screen.getByRole("radio", { name: "Lista" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Quadro" })).toHaveAttribute("tabindex", "-1");
  });

  it("names an icon-only segment via its ariaLabel", () => {
    render(
      <Segmented
        ariaLabel="Vista"
        value="list"
        onChange={() => {}}
        options={[
          { value: "list", label: <svg aria-hidden="true" />, ariaLabel: "Lista" },
          { value: "board", label: <svg aria-hidden="true" />, ariaLabel: "Quadro" },
        ]}
      />,
    );
    // Accessible name comes from aria-label, not from any text child.
    expect(screen.getByRole("radio", { name: "Lista" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Quadro" })).toBeInTheDocument();
  });

  it("does not move selection for unrelated keys", () => {
    const onChange = vi.fn();
    render(<Segmented ariaLabel="Vista" value="list" onChange={onChange} options={[...options]} />);
    fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Vista" }), { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------------- *
 * Extended coverage — added to harden the primitives.                        *
 * ------------------------------------------------------------------------- */

describe("Button (extended)", () => {
  it("applies the variant and size utility classes", () => {
    render(
      <Button variant="primary" size="sm">
        Guardar
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Guardar" });
    // primary → moss-dark fill; sm → h-8 padding scale.
    expect(btn).toHaveClass("bg-[#4d6350]");
    expect(btn).toHaveClass("h-8");
  });

  it("danger variant uses the audited dark-red token", () => {
    render(<Button variant="danger">Eliminar</Button>);
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("bg-[#8a2a22]");
  });

  it("disabled blocks clicks and reflects the disabled attribute", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Guardar" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    // Not busy — disabled is a distinct state from loading.
    expect(btn).not.toHaveAttribute("aria-busy");
  });

  it("forwards onClick and an explicit type=submit when enabled", () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" onClick={onClick}>
        Enviar
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Enviar" });
    expect(btn).toHaveAttribute("type", "submit");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders iconLeft/iconRight when idle but swaps them out while loading", () => {
    const { rerender } = render(
      <Button iconLeft={<span data-testid="left" />} iconRight={<span data-testid="right" />}>
        Guardar
      </Button>,
    );
    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.getByTestId("right")).toBeInTheDocument();

    rerender(
      <Button
        loading
        iconLeft={<span data-testid="left" />}
        iconRight={<span data-testid="right" />}
      >
        Guardar
      </Button>,
    );
    // Spinner replaces iconLeft and the trailing icon is dropped so the row stays calm.
    expect(screen.queryByTestId("left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("right")).not.toBeInTheDocument();
  });

  it("fullWidth stretches the control", () => {
    render(<Button fullWidth>Guardar</Button>);
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveClass("w-full");
  });

  it("merges caller className last without dropping base classes", () => {
    render(<Button className="custom-x">Guardar</Button>);
    const btn = screen.getByRole("button", { name: "Guardar" });
    expect(btn).toHaveClass("custom-x");
    expect(btn).toHaveClass("inline-flex");
  });
});

describe("Card / SectionCard (extended)", () => {
  it("applies the requested padding and drops it for padding=none", () => {
    const { container: withPad } = render(<Card padding="lg">a</Card>);
    expect(withPad.firstElementChild).toHaveClass("p-6");
    cleanup();
    const { container: noPad } = render(<Card padding="none">b</Card>);
    expect(noPad.firstElementChild).not.toHaveClass("p-4");
    expect(noPad.firstElementChild).not.toHaveClass("p-5");
  });

  it("forwards arbitrary DOM props to the Card surface", () => {
    render(
      <Card data-testid="surface" aria-label="Painel">
        x
      </Card>,
    );
    expect(screen.getByTestId("surface")).toHaveAttribute("aria-label", "Painel");
  });

  it("SectionCard renders eyebrow + description alongside the title", () => {
    render(
      <SectionCard eyebrow="Pipeline" title="Pedidos" description="Tudo o que aguarda.">
        corpo
      </SectionCard>,
    );
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Tudo o que aguarda.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Pedidos" })).toBeInTheDocument();
  });

  it("SectionCard renders no heading when it has no header content", () => {
    render(<SectionCard>só corpo</SectionCard>);
    expect(screen.getByText("só corpo")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

describe("Field (extended)", () => {
  it("marks a required field via the native required attribute", () => {
    render(<Field label="Nome" required />);
    const input = screen.getByLabelText(/Nome/);
    // Native `required` carries the implicit aria-required semantics.
    expect(input).toBeRequired();
    // The visual asterisk is decorative and hidden from assistive tech.
    const marker = document.querySelector('span[aria-hidden="true"]');
    expect(marker).toHaveTextContent("*");
  });

  it("renders a textarea when as=textarea and forwards its props", () => {
    render(<Field as="textarea" label="Notas" rows={4} defaultValue="olá" />);
    const ta = screen.getByLabelText("Notas") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta).toHaveAttribute("rows", "4");
    expect(ta.value).toBe("olá");
  });

  it("keeps the label accessible but visually hidden with hideLabel", () => {
    render(<Field label="Pesquisar" hideLabel />);
    const input = screen.getByLabelText("Pesquisar");
    expect(input).toBeInTheDocument();
    // The <label> is still present (sr-only), so the name is exposed to AT.
    const label = document.querySelector("label");
    expect(label).toHaveClass("sr-only");
  });

  it("hides the hint once an error is shown and only describes existing nodes", () => {
    render(<Field label="Email" hint="Só interno." error="Email inválido" />);
    const input = screen.getByLabelText(/Email/);
    // The hint text is suppressed while the error is present.
    expect(screen.queryByText("Só interno.")).not.toBeInTheDocument();
    expect(screen.getByText("Email inválido")).toBeInTheDocument();
    // Every id referenced by aria-describedby must resolve to a real element —
    // no dangling hint IDREF once the hint node is gone.
    const ids = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(document.getElementById(id), `aria-describedby references #${id}`).not.toBeNull();
    }
  });

  it("exposes no aria-describedby when there is neither hint nor error", () => {
    render(<Field label="Nome" />);
    expect(screen.getByLabelText("Nome")).not.toHaveAttribute("aria-describedby");
  });
});

describe("PageHeader (extended)", () => {
  it("renders the title as a level-2 heading when as=h2", () => {
    render(<PageHeader as="h2" title="Secção" />);
    expect(screen.getByRole("heading", { level: 2, name: "Secção" })).toBeInTheDocument();
  });

  it("renders the eyebrow and header actions", () => {
    render(
      <PageHeader eyebrow="Back office" title="Visão geral" actions={<button>Novo</button>} />,
    );
    expect(screen.getByText("Back office")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo" })).toBeInTheDocument();
  });

  it("uses a <header> landmark as the wrapper", () => {
    render(<PageHeader title="Visão geral" />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});

describe("EmptyState (extended)", () => {
  it("renders the title and description text", () => {
    render(<EmptyState title="Sem pedidos" description="Aparecem aqui." />);
    expect(screen.getByText("Sem pedidos")).toBeInTheDocument();
    expect(screen.getByText("Aparecem aqui.")).toBeInTheDocument();
  });

  it("falls back to a decorative default icon when none is passed", () => {
    const { container } = render(<EmptyState title="Sem pedidos" />);
    const svg = container.querySelector("svg[aria-hidden='true']");
    expect(svg).toBeInTheDocument();
  });

  it("fires the secondary action independently of the primary", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <EmptyState
        title="Sem pedidos"
        action={{ label: "Criar", onClick: onPrimary }}
        secondaryAction={{ label: "Importar", onClick: onSecondary }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(onSecondary).toHaveBeenCalledOnce();
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it("renders no action buttons when neither action is provided", () => {
    render(<EmptyState title="Sem pedidos" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // NEEDS DECISION: the title is a plain <p>, not a heading, so an EmptyState
  // contributes nothing to the document outline. Pinning current behaviour here
  // rather than changing it — promoting it to a heading is a judgment call about
  // which level (h2? h3?) is correct in an unknown host context.
  it("pins that the title is currently NOT a heading element", () => {
    render(<EmptyState title="Sem pedidos" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

describe("Toolbar (extended)", () => {
  it("renders children inside the start group", () => {
    render(
      <Toolbar>
        <span>filho</span>
      </Toolbar>,
    );
    expect(screen.getByText("filho")).toBeInTheDocument();
  });

  it("renders with only a start slot", () => {
    render(<Toolbar start={<span>apenas início</span>} />);
    expect(screen.getByText("apenas início")).toBeInTheDocument();
  });

  it("forwards arbitrary props to the wrapper element", () => {
    render(<Toolbar data-testid="bar" end={<span>fim</span>} />);
    expect(screen.getByTestId("bar")).toBeInTheDocument();
    expect(screen.getByText("fim")).toBeInTheDocument();
  });
});

describe("cn", () => {
  it("joins truthy parts with a single space", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("drops every falsy part (false, null, undefined, empty string)", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports the conditional-class idiom", () => {
    const active = true;
    const disabled = false;
    expect(cn("base", active && "on", disabled && "off")).toBe("base on");
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cn(false, null, undefined, "")).toBe("");
  });

  it("does NOT de-duplicate repeated classes (documented join-only behaviour)", () => {
    // cn is a plain joiner, not a Tailwind merge — repeats are preserved and
    // Tailwind's own cascade (last wins) resolves conflicts downstream.
    expect(cn("p-2", "p-2")).toBe("p-2 p-2");
  });
});
