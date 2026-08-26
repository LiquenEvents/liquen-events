// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminClient from "./AdminClient";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";
import { oQueMudou } from "./rascunho-do-pedido";
import type { CamposDoPedido } from "./rascunho-do-pedido";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR UM PEDIDO NÃO PODE MARCÁ-LO COMO ALTERADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Achado F-08 de uma auditoria em produção: «basta abrir a ficha — sem tocar em
 * nada — para o botão do cabeçalho passar de "Tudo guardado" a
 * "Guardar tudo (1)"».
 *
 * Não é cosmético. Um back office que diz «tens uma alteração por guardar»
 * quando não há nenhuma ensina a ignorar o aviso — e o aviso existe para o dia
 * em que HÁ. Pior: a partir daí, fechar a ficha pergunta sempre «descartar?»,
 * e quem responde a essa pergunta dez vezes por dia responde-lhe sem ler.
 *
 * ── A CAUSA, MEDIDA E NÃO ADIVINHADA ────────────────────────────────────────
 *
 * Sondei DOZE feitios de pedido a abrir na aplicação montada — sem estado, com
 * zero convidados, com preço zero, com a data em texto livre, com a data com
 * hora, sem notas, com o responsável a `null`, e com um espaço a mais em cada
 * um dos campos de texto. Sujavam-se QUATRO, e sempre os mesmos:
 *
 *     nome com espaço no fim     →  Guardar tudo (1)
 *     email com espaço           →  Guardar tudo (1)
 *     telefone com espaço        →  Guardar tudo (1)
 *     local com espaço           →  Guardar tudo (1)
 *
 * Um só defeito, portanto: a comparação aparava o lado do ECRÃ e deixava o lado
 * do SERVIDOR tal e qual — `"Maria".trim()` contra `"Maria "`. Um espaço no fim
 * de um nome é o que acontece a quem cola de um email, e é para sempre.
 *
 * Três hipóteses minhas caíram antes desta, e todas por leitura: as notas não
 * são cortadas do resumo, o preço zero já estava tratado, e a comparação por
 * identidade do pedido já tinha sido resolvida. A sonda é que deu a resposta.
 */

const escritas: { metodo: string; url: string }[] = [];

const r = (b: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ "x-pedido": "completo" }),
    json: async () => b,
  }) as unknown as Response;

/** Um pedido com as marcas de quem colou de um email: espaços nas pontas. */
const COM_ESPACOS = {
  id: "LIQ-8",
  name: "Maria João Fernandes ",
  email: " mj@exemplo.pt",
  phone: "912345678 ",
  location: "Évora ",
  status: "cotado",
  submittedAt: "2026-05-01T10:00:00.000Z",
  payments: [],
  activityLog: [],
} as unknown as Quote;

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

function servidor(q: Quote) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    // Só o que ESCREVE no pedido conta. O `fotos-em-falta` é um POST que
    // pergunta, não que grava, e contá-lo fazia este teste falhar por uma
    // razão que não tem nada a ver com o que ele mede.
    if (["PATCH", "PUT", "DELETE"].includes(metodo)) {
      escritas.push({ metodo, url: String(url) });
    }
    if (String(url).includes("/api/orcamento/LIQ-8") && metodo === "GET") return r(q);
    if (metodo === "GET") return r([]);
    return r({ ok: true, quote: q });
  });
}

beforeEach(() => {
  escritas.length = 0;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function abrir(q: Quote) {
  vi.stubGlobal("fetch", servidor(q));
  render(
    <RegistoDeGravacoesProvider>
      <AdminClient initialQuotes={[q]} userName="Catarina" />
    </RegistoDeGravacoesProvider>,
  );
  const alvos = await screen.findAllByText(String(q.name).trim());
  await userEvent.click(alvos[0]);
  await waitFor(() => expect(screen.queryByText(/a abrir o pedido de/i)).toBeNull());
  // Tempo de sobra para o adiamento da gravação automática correr.
  await new Promise((res) => setTimeout(res, 350));
}

/** O cabeçalho desenha-o duas vezes (barra larga e barra estreita). */
const rotulo = () =>
  screen.getAllByRole("button", { name: /Tudo guardado|Guardar tudo/i })[0].textContent ?? "";

describe("abrir um pedido sem lhe tocar", () => {
  it("um pedido com espaços a mais não acende «Guardar tudo»", async () => {
    await abrir(COM_ESPACOS);
    expect(rotulo()).toMatch(/Tudo guardado/i);
    expect(rotulo()).not.toMatch(/Guardar tudo/i);
  });

  /**
   * Este NÃO cai com a correcção revertida, e é de propósito: os quatro campos
   * do defeito exigem um clique para gravar, portanto nem antes nem depois saía
   * daqui uma escrita. Fica como espaço negativo — guarda que a correcção não
   * ganhou o hábito de gravar sozinha ao abrir, que seria trocar este defeito
   * por um bem pior.
   */
  it("e não manda gravação nenhuma para o servidor", async () => {
    await abrir(COM_ESPACOS);
    expect(escritas).toEqual([]);
  });

  /**
   * O outro achado da sonda, e o mais grave dos dois: um pedido SEM `status`
   * fazia o `oQueMudou` chamar `.trim()` sobre `undefined`, dentro de um
   * efeito — o que ela via não era um campo em branco, era o back office
   * inteiro substituído por «Ocorreu um erro inesperado».
   *
   * E pedidos sem `status` existem: a máquina de estados di-lo por escrito,
   * «há pedidos gravados antes de metade destes campos existirem».
   */
  it("um pedido sem estado abre em vez de rebentar o back office", async () => {
    const semEstado = { ...COM_ESPACOS, status: undefined } as unknown as Quote;
    await abrir(semEstado);
    expect(screen.queryByRole("heading", { name: /Ocorreu um erro inesperado/i })).toBeNull();
    expect(rotulo()).toMatch(/Tudo guardado/i);
  });
});

/**
 * A mesma avaria vista de perto, na função onde ela rebentava. Vale à parte
 * porque é o ÚNICO sítio por onde os dois lados passam: é barato ser aqui que
 * um campo em falta é um campo vazio em vez de um ecrã perdido.
 */
describe("comparar dois lados de que um pode vir incompleto", () => {
  const cheio = {
    preco: "100",
    notas: "",
    estado: "cotado",
    responsavel: "",
    motivoDePerda: "",
    data: "",
    convidados: "",
    local: "",
    nome: "Maria",
    email: "",
    telefone: "",
  } as CamposDoPedido;

  it("um campo em falta não lança — conta como vazio", () => {
    const semEstado = { ...cheio, estado: undefined } as unknown as CamposDoPedido;
    expect(() => oQueMudou(semEstado, cheio)).not.toThrow();
    expect(oQueMudou(semEstado, cheio)).toEqual(["estado"]);
    // E dos dois lados, não só de um.
    expect(() => oQueMudou(cheio, semEstado)).not.toThrow();
  });

  it("dois campos em falta são iguais entre si", () => {
    const a = { ...cheio, estado: undefined } as unknown as CamposDoPedido;
    const b = { ...cheio, estado: "" } as CamposDoPedido;
    expect(oQueMudou(a, b)).toEqual([]);
  });
});
