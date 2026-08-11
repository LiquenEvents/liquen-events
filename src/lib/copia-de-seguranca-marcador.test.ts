import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA CÓPIA QUE NÃO CORRE HÁ SEMANAS É PIOR DO QUE NÃO TER CÓPIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A tarefa agendada da cópia de segurança fecha-se sozinha em produção quando
 * `CRON_SECRET` não está definida: responde 401 todos os dias, sem erro nenhum,
 * sem email nenhum, e ninguém repara. O RESILIENCE.md já o diz por escrito — e
 * dizê-lo num ficheiro do repositório não é dizê-lo a quem precisa de saber.
 *
 * O que é pior do que não haver cópia: haver a CONVICÇÃO de que há. É por isso
 * que este marcador existe. A cópia que corre bem deixa um carimbo; o back
 * office lê o carimbo e, se ele for velho, diz-o onde ela olha.
 *
 * ── E não pode ser um alarme falso ────────────────────────────────────────
 *
 * Dois cuidados, e são a razão dos testes que se seguem:
 *
 *  • um dia falhado não é uma avaria (um deploy à hora da tarefa, um atraso do
 *    agendador). Só se fala ao terceiro dia;
 *  • uma instalação estreada hoje NUNCA teve cópia nenhuma, e gritar-lhe isso
 *    à primeira abertura era o alarme falso perfeito. Por isso a primeira
 *    pergunta deixa um carimbo de «começámos a olhar agora» e só o silêncio
 *    prolongado a partir daí é que avisa.
 */

const st = vi.hoisted(() => ({
  guardado: null as unknown,
  escritas: [] as { chave: string; valor: unknown }[],
}));

vi.mock("./app-state", () => ({
  getState: vi.fn(async () => st.guardado),
  setState: vi.fn(async (chave: string, valor: unknown) => {
    st.escritas.push({ chave, valor });
    st.guardado = valor;
    return { gravado: true, duradouro: true, onde: "servidor" };
  }),
}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  estadoDaCopia,
  registarCopiaEnviada,
  CHAVE_DA_COPIA,
  DIAS_ATE_AVISAR,
} from "./copia-de-seguranca-marcador";

const DIA = 86_400_000;
const AGORA = new Date("2026-08-11T09:00:00.000Z");
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA).toISOString();

beforeEach(() => {
  st.guardado = null;
  st.escritas = [];
});

describe("o carimbo da cópia que correu bem", () => {
  it("a cópia enviada deixa a data, o tamanho e se foi automática", async () => {
    await registarCopiaEnviada({ bytes: 358_000, parcial: false, modo: "automatica" });
    expect(st.escritas).toHaveLength(1);
    expect(st.escritas[0].chave).toBe(CHAVE_DA_COPIA);
    expect(st.escritas[0].valor).toMatchObject({ bytes: 358_000, modo: "automatica" });
    expect((st.escritas[0].valor as { em: string }).em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /** Uma cópia com conjuntos em falta chegou, mas não é a cópia que se pensa
   *  que se tem — e quem a for repor tem de saber. */
  it("uma cópia parcial fica marcada como parcial", async () => {
    await registarCopiaEnviada({ bytes: 10, parcial: true, modo: "automatica" });
    expect(st.escritas[0].valor).toMatchObject({ parcial: true });
  });

  /** O carimbo não pode ser a razão pela qual a cópia falha: ela já foi
   *  enviada quando isto corre. */
  it("nunca lança, mesmo que a gravação do carimbo rebente", async () => {
    const { setState } = await import("./app-state");
    vi.mocked(setState).mockRejectedValueOnce(new Error("app_state em baixo"));
    await expect(
      registarCopiaEnviada({ bytes: 1, parcial: false, modo: "automatica" }),
    ).resolves.toBeUndefined();
  });
});

describe("quando se avisa, e quando NÃO se avisa", () => {
  it("cópia de ontem: nada a dizer", async () => {
    st.guardado = { em: haDias(1) };
    const e = await estadoDaCopia(AGORA);
    expect(e.estado).toBe("ok");
    expect(e.avisar).toBe(false);
  });

  it("um dia falhado não é uma avaria — não se avisa à primeira falta", async () => {
    st.guardado = { em: haDias(DIAS_ATE_AVISAR - 1) };
    expect((await estadoDaCopia(AGORA)).avisar).toBe(false);
  });

  it("três dias sem cópia: diz-se, e diz-se qual é a variável a confirmar", async () => {
    st.guardado = { em: haDias(9) };
    const e = await estadoDaCopia(AGORA);
    expect(e.estado).toBe("atrasada");
    expect(e.avisar).toBe(true);
    expect(e.diasSem).toBe(9);
    // Sem o nome da variável, isto é só mais um vermelho que não resolve nada.
    expect(e.oQueFazer).toMatch(/CRON_SECRET/);
    // E o caminho para não ficar sem cópia enquanto isso não se resolve.
    expect(e.oQueFazer).toMatch(/Definições|descarregar|Descarregar/);
  });
});

/**
 * O caso da instalação nova. Ela nunca teve cópia nenhuma e isso é normal:
 * gritar-lhe à primeira abertura era ensinar-lhe a ignorar este aviso.
 */
describe("a instalação por estrear", () => {
  it("a primeira pergunta não avisa — carimba desde quando se está a olhar", async () => {
    const e = await estadoDaCopia(AGORA);
    expect(e.estado).toBe("por-estrear");
    expect(e.avisar).toBe(false);
    expect(st.escritas).toHaveLength(1);
    expect(st.escritas[0].valor).toMatchObject({ desde: AGORA.toISOString() });
  });

  it("e não volta a carimbar a cada pergunta", async () => {
    await estadoDaCopia(AGORA);
    await estadoDaCopia(AGORA);
    await estadoDaCopia(AGORA);
    expect(st.escritas).toHaveLength(1);
  });

  it("mas passados três dias a olhar sem uma única cópia, isso avisa-se", async () => {
    st.guardado = { desde: haDias(DIAS_ATE_AVISAR + 1) };
    const e = await estadoDaCopia(AGORA);
    expect(e.estado).toBe("nunca");
    expect(e.avisar).toBe(true);
    expect(e.oQueFazer).toMatch(/CRON_SECRET/);
  });

  it("uma cópia que chegue depois apaga o carimbo de vigia", async () => {
    st.guardado = { desde: haDias(10) };
    expect((await estadoDaCopia(AGORA)).avisar).toBe(true);
    await registarCopiaEnviada({ bytes: 1, parcial: false, modo: "manual" });
    expect((await estadoDaCopia(AGORA)).avisar).toBe(false);
  });
});

/** Um marcador ilegível não pode ser lido como «a cópia está em dia»: é
 *  exactamente o silêncio que este módulo existe para não ter. */
describe("um marcador que não se percebe", () => {
  it("não conta como cópia em dia", async () => {
    st.guardado = { em: "não é uma data" };
    const e = await estadoDaCopia(AGORA);
    expect(e.estado).not.toBe("ok");
  });
});
