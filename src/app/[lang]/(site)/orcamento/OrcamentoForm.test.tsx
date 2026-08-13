// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";
import OrcamentoForm from "./OrcamentoForm";

/**
 * O FORMULÁRIO COMPLETO — três defeitos que só se veem em uso real:
 *
 *  1. o `min` do campo da data vinha do BUILD (a página é pré-gerada), a
 *     hidratação divergia e ficava a data do servidor: escolher o mês passado
 *     passava a ser possível;
 *  2. o rascunho guardava treze campos e esquecia os nomes do casal — quem saía
 *     para ler a política de privacidade e voltava perdia-os;
 *  3. o link do WhatsApp não reagia à ordem de grandeza dos convidados, e
 *     levava «Ainda a definir» depois de ela já ter escolhido «100 a 150».
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));

const dict = getDictionary("pt");
const to = dict.orcamento;
const BLUR = "data:image/webp;base64,AAAA";

function Formulario() {
  return (
    <LocaleProvider locale="pt" dict={pickChromeDict(dict)}>
      <OrcamentoForm panelBlur={BLUR} orcamento={to} />
    </LocaleProvider>
  );
}

const montar = () => render(<Formulario />);

/** O dia de hoje e um dia já passado, no formato do campo. */
const hoje = () => new Date().toISOString().slice(0, 10);
const ontem = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "LIQ-AAA-1" }) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrcamentoForm — a data mínima numa página pré-gerada", () => {
  it("o HTML pré-gerado não leva `min` nenhum (é o que divergia na hidratação)", () => {
    const html = renderToStaticMarkup(<Formulario />);
    expect(html).toContain('type="date"');
    expect(html).not.toContain('min="');
  });

  it("já no browser, o campo passa a ter a data de HOJE como mínimo", async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByLabelText(new RegExp(to.labelData, "i"))).toHaveAttribute("min", hoje()),
    );
  });

  it("uma data já passada é recusada no envio, e não só pelo atributo `min`", async () => {
    montar();
    const campo = screen.getByLabelText(new RegExp(to.labelData, "i"));
    await waitFor(() => expect(campo).toHaveAttribute("min", hoje()));
    // O `min` é uma sugestão que se contorna a escrever; aqui escreve-se.
    fireEvent.change(campo, { target: { value: ontem() } });
    fireEvent.blur(campo);

    expect(await screen.findByText(to.errData)).toBeInTheDocument();
    // E o pedido impossível não chega a sair.
    fireEvent.submit(document.querySelector("form")!);
    expect(fetch).not.toHaveBeenCalled();

    // A data de hoje, essa, passa.
    fireEvent.change(campo, { target: { value: hoje() } });
    await waitFor(() => expect(screen.queryByText(to.errData)).toBeNull());
  });
});

describe("OrcamentoForm — o rascunho e os nomes do casal", () => {
  async function escreverNomes() {
    montar();
    await userEvent.click(screen.getByRole("radio", { name: to.eventTypeLabels[0] }));
    await userEvent.type(screen.getByLabelText(new RegExp(`^${to.labelNome}`, "i")), "Ana");
    await userEvent.type(screen.getByLabelText(to.ariaNoivoA), "Ana Dias");
    await userEvent.type(screen.getByLabelText(to.ariaNoivoB), "Rui Sousa");
    // O que acontece quando ela sai da página para ler a política de privacidade.
    window.dispatchEvent(new Event("pagehide"));
  }

  it("o rascunho guarda `noivo` e `noiva`", async () => {
    await escreverNomes();
    const guardado = JSON.parse(sessionStorage.getItem("liquen-orcamento-draft")!) as Record<
      string,
      string
    >;
    expect(guardado.noivo).toBe("Ana Dias");
    expect(guardado.noiva).toBe("Rui Sousa");
  });

  it("e devolve-os quando ela volta", async () => {
    await escreverNomes();
    cleanup();

    montar();
    await waitFor(() => expect(screen.getByLabelText(to.ariaNoivoA)).toHaveValue("Ana Dias"));
    expect(screen.getByLabelText(to.ariaNoivoB)).toHaveValue("Rui Sousa");
  });
});

describe("OrcamentoForm — o link do WhatsApp", () => {
  it("acompanha a ordem de grandeza escolhida depois de «ainda a definir»", async () => {
    montar();
    const link = () => screen.getByRole("link", { name: new RegExp(to.ouWhatsApp, "i") });

    await userEvent.click(screen.getByLabelText(to.guestsFlexibleLabel));
    expect(decodeURIComponent(link().getAttribute("href")!)).toContain(to.guestsFlexibleLabel);

    await userEvent.click(screen.getByRole("button", { name: "100 a 150" }));
    const mensagem = decodeURIComponent(link().getAttribute("href")!);
    expect(mensagem).toContain("~100 a 150");
    // Deixou de mandar para o WhatsApp uma coisa que já não é verdade.
    expect(mensagem).not.toContain(`${to.labelPessoas}: ${to.guestsFlexibleLabel}`);
  });
});
