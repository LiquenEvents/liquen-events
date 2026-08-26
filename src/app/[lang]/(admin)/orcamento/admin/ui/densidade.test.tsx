// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Card } from "./Card";
import { PageHeader } from "./PageHeader";
import { EmptyState } from "./EmptyState";
import EmptyStateAntigo from "../EmptyState";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS TRÊS PRIMITIVOS QUE ABREM UM ECRÃ — DOIS DEGRAUS, NÃO UM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O cartão, o cabeçalho da vista e o estado vazio são o que ela vê primeiro em
 * qualquer ecrã do back office. Serviam a MESMA medida a 375 px e a 1440:
 *
 *   · `Card padding="md"` (o padrão) — 20 px de cada lado, em todo o lado
 *   · `PageHeader` — eyebrow + título + subtítulo + `pb-6` = ~111 px de topo
 *   · `EmptyState` — `py-16`, 128 px de ar para dizer que não há nada
 *
 * Num iPhone SE (375×667) o cabeçalho fixo e a barra de baixo já levaram 137 px
 * antes de haver conteúdo; o resto não tem como pagar estes números.
 *
 * ── PORQUE É QUE ESTE TESTE OLHA PARA CLASSES ────────────────────────────
 *
 * O jsdom não faz layout: não há aqui píxeis para medir. A geometria está
 * medida no browser. O que se guarda aqui é a DECISÃO — um degrau apertado por
 * omissão e um degrau largo a partir de 640 —, como já fazem o
 * `adaptativo.test.tsx` e o `Overview.movel.test.tsx`.
 *
 * A régua ao contrário conta tanto como a régua: cada asserção de aperto tem a
 * sua companheira `sm:`, porque um aperto sem o par de cima não é densidade —
 * é o computador a ficar pior.
 */

afterEach(cleanup);

describe("o cartão", () => {
  it("aperta o telemóvel pelo token, e não por um número escrito aqui", () => {
    const { container } = render(<Card>conteúdo</Card>);
    const superficie = container.firstElementChild!;
    // `--bo-p-cartao`: 14 px abaixo de 640, 24 a partir daí.
    expect(superficie).toHaveClass("p-[var(--bo-p-cartao)]");
    // Os 20 px fixos de que se veio.
    expect(superficie.className).not.toMatch(/(^|\s)p-5(\s|$)/);
  });

  it("o degrau `lg` continua um degrau acima, e guarda a folga do computador", () => {
    const { container } = render(<Card padding="lg">conteúdo</Card>);
    const superficie = container.firstElementChild!;
    // 16 px no telemóvel (eram 24) e os 32 de sempre a partir de 640. Não lê o
    // token de propósito: com ele, `lg` e `md` ficavam iguais abaixo de 640.
    expect(superficie).toHaveClass("p-4", "sm:p-8");
    expect(superficie.className).not.toMatch(/(^|\s)p-6(\s|$)/);
  });

  it("`padding=none` continua a não pôr nada", () => {
    const { container } = render(<Card padding="none">conteúdo</Card>);
    expect(container.firstElementChild!.className).not.toMatch(/\bp-/);
  });
});

describe("o cabeçalho de uma vista", () => {
  const desenhar = () =>
    render(
      <PageHeader
        eyebrow="Back office"
        title="Visão geral"
        subtitle="O estado de todos os trabalhos, num relance."
        actions={<button type="button">Novo pedido</button>}
      />,
    );

  it("encolhe o respiro de baixo e a folga das acções abaixo de 640", () => {
    const { container } = desenhar();
    const cabecalho = container.querySelector("header")!;
    expect(cabecalho).toHaveClass("gap-2.5", "pb-4");
    // E devolve-os inteiros no computador.
    expect(cabecalho).toHaveClass("sm:gap-4", "sm:pb-6");
  });

  it("encolhe também as margens de dentro — eyebrow e subtítulo", () => {
    desenhar();
    const eyebrow = screen.getByText("Back office");
    expect(eyebrow).toHaveClass("mb-1.5", "sm:mb-2.5");
    const subtitulo = screen.getByText(/num relance/);
    expect(subtitulo).toHaveClass("mt-1.5", "sm:mt-2");
  });

  it("não mexe no título, que já sabia encolher", () => {
    desenhar();
    // `text-2xl … sm:text-3xl` já estava certo antes deste trabalho.
    const titulo = screen.getByRole("heading", { level: 1, name: "Visão geral" });
    expect(titulo).toHaveClass("text-2xl", "sm:text-3xl");
  });
});

describe("os estados vazios", () => {
  it("o de `ui/` mede-se pelo token do vazio", () => {
    const { container } = render(<EmptyState title="Ainda não há pedidos" />);
    const caixa = container.firstElementChild!;
    expect(caixa).toHaveClass("py-[var(--bo-p-vazio)]");
    // Os 128 px de que se veio.
    expect(caixa.className).not.toMatch(/(^|\s)py-16(\s|$)/);
  });

  /**
   * ── HÁ DOIS, E ISSO NÃO É UM ENGANO DESTE TESTE ──────────────────────────
   * `admin/EmptyState.tsx` é o antigo (importado pelo `AdminClient`) e
   * `admin/ui/EmptyState.tsx` é o do redesenho (importado por uma dúzia de
   * painéis). O comentário do segundo diz «Nothing imports it yet», o que
   * deixou de ser verdade — a migração ficou a meio e nenhum dos dois é morto.
   * Enquanto forem dois, medem o mesmo: é a única coisa que este teste pode
   * garantir sem apagar código de outra pessoa.
   */
  it("o antigo mede exactamente como o novo", () => {
    const { container } = render(<EmptyStateAntigo title="Ainda não há pedidos" />);
    expect(container.firstElementChild!).toHaveClass("py-[var(--bo-p-vazio)]");
  });

  it("o botão da folha vazia continua a ser um alvo de dedo", () => {
    // A densidade vem de espaço, letra e molduras — nunca de alvos de toque.
    render(<EmptyStateAntigo title="Sem pedidos" action={{ label: "Criar", onClick: () => {} }} />);
    expect(screen.getByRole("button", { name: "Criar" })).toHaveClass("alvo-toque");
  });
});
