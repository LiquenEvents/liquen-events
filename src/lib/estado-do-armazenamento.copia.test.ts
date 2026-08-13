import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «HÁ CÓPIA DE SEGURANÇA?» — a mesma pergunta, no mesmo sítio
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A verificação de armazenamento já responde a «o que eu gravar agora fica
 * guardado?». Falta-lhe a irmã: «e se isto desaparecer, há de onde voltar?».
 *
 * Vivem juntas porque são a MESMA preocupação vista de dois lados, e porque o
 * sítio onde a resposta tem de aparecer é o mesmo — o topo do back office, onde
 * ela olha. Um segundo painel para a cópia de segurança seria um segundo aviso
 * a competir com o primeiro pela mesma atenção.
 *
 * Os dois cuidados que estes testes prendem:
 *
 *  • numa máquina de desenvolvimento NÃO se fala de cópias. A tarefa agendada
 *    não corre num portátil, e um vermelho por isso em cada `next dev` era o
 *    alarme falso que ensina a ignorar o painel;
 *  • com a base de dados em baixo também não. O carimbo vive nela: não se pode
 *    ler, e mesmo que se lesse a avaria a resolver é a outra. Dois vermelhos
 *    pela mesma causa dividem a atenção em vez de a dirigir.
 */

const st = vi.hoisted(() => ({
  cliente: null as unknown,
  escrita: { gravado: true, duradouro: true, onde: "servidor" } as {
    gravado: boolean;
    duradouro: boolean;
    onde: string;
    motivo?: string;
  },
  guardado: null as unknown,
  /** O que o carimbo da cópia de segurança responde. */
  copia: { estado: "ok", avisar: false } as {
    estado: string;
    avisar: boolean;
    titulo?: string;
    oQueFazer?: string;
  },
  perguntasAoCarimbo: 0,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./app-state", async () => {
  const real = await vi.importActual<typeof import("./app-state")>("./app-state");
  return {
    oFicheiroEhEfemero: real.oFicheiroEhEfemero,
    setState: vi.fn(async (_k: string, valor: unknown) => {
      if (st.escrita.gravado) st.guardado = valor;
      return st.escrita;
    }),
    getState: vi.fn(async () => st.guardado),
  };
});
vi.mock("./copia-de-seguranca-marcador", () => ({
  estadoDaCopia: vi.fn(async () => {
    st.perguntasAoCarimbo++;
    return st.copia;
  }),
}));

import { verificarArmazenamento } from "./estado-do-armazenamento";

function supabaseComStorage() {
  return {
    storage: { getBucket: async (nome: string) => ({ data: { name: nome }, error: null }) },
  };
}

beforeEach(() => {
  st.cliente = supabaseComStorage();
  st.escrita = { gravado: true, duradouro: true, onde: "servidor" };
  st.guardado = null;
  st.copia = { estado: "ok", avisar: false };
  st.perguntasAoCarimbo = 0;
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const verificar = () => verificarArmazenamento({ forcar: true });

describe("a cópia de segurança entra no mesmo diagnóstico", () => {
  it("tudo bem e cópia em dia: continua a não se dizer nada a ninguém", async () => {
    const d = await verificar();
    expect(d.estado).toBe("ok");
    expect(d.copia?.estado).toBe("ok");
    expect(d.avisar).toBe(false);
  });

  it("armazenamento bom mas cópia parada: avisa-se, e é a cópia que fala", async () => {
    st.copia = {
      estado: "atrasada",
      avisar: true,
      titulo: "Não chega uma cópia de segurança há 9 dias.",
      oQueFazer: "Confirme CRON_SECRET.",
    };
    const d = await verificar();
    // O armazenamento continua bom — o que mudou foi haver alguma coisa a fazer.
    expect(d.estado).toBe("ok");
    expect(d.avisar).toBe(true);
    expect(d.copia?.titulo).toMatch(/9 dias/);
  });
});

describe("onde NÃO se fala de cópias", () => {
  it("numa máquina de desenvolvimento não se pergunta sequer", async () => {
    vi.stubEnv("NODE_ENV", "development");
    st.cliente = null;
    st.escrita = { gravado: true, duradouro: true, onde: "ficheiro" };
    const d = await verificar();
    expect(d.estado).toBe("ficheiro-de-desenvolvimento");
    expect(st.perguntasAoCarimbo).toBe(0);
    expect(d.avisar).toBe(false);
  });

  it("com a base de dados em baixo não se pergunta — a avaria a resolver é a outra", async () => {
    st.escrita = { gravado: false, duradouro: false, onde: "nenhures", motivo: "tabela-em-falta" };
    const d = await verificar();
    expect(d.estado).toBe("tabela-em-falta");
    expect(st.perguntasAoCarimbo).toBe(0);
    // O aviso continua a existir — pela causa certa.
    expect(d.avisar).toBe(true);
    expect(d.oQueFazer).toMatch(/db\/schema\.sql/);
  });
});
