import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DIZER ANTES, E NÃO DEPOIS DE PERDER TRÊS HORAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O percurso que isto existe para não voltar a acontecer: a tabela `app_state`
 * não estava criada naquela instalação (o `db/schema.sql` por correr), uma
 * proposta inteira foi montada — fotos, mood boards, textos —, cada gravação
 * falhava e ninguém soube. A cadeia que corrige o MOMENTO da gravação já está
 * feita (o `setState` diz onde ficou, a rota responde 503). O que faltava era
 * dizê-lo ANTES de alguém começar a trabalhar.
 *
 * A honestidade desta verificação está em TENTAR: escreve uma chave própria de
 * diagnóstico e volta a lê-la. Adivinhar pela configuração é o que dava o
 * «Supabase configurado ✓» daquela instalação onde nada gravava.
 *
 * Os quatro casos que ela tem de saber distinguir — e são quatro RESOLUÇÕES
 * diferentes, é por isso que vale a pena distingui-los:
 *
 *   1. sem configuração  → faltam as variáveis SUPABASE_*;
 *   2. tabela em falta   → falta correr o `db/schema.sql`;
 *   3. permissão recusada→ a chave em uso é a `anon` e a `app_state` tem RLS;
 *   4. tudo bem          → e então NÃO se diz nada a ninguém (um aviso que
 *                          aparece quando está tudo bem é um aviso que se
 *                          deixa de ler).
 */

const st = vi.hoisted(() => ({
  /** O cliente do Supabase — `null` quando não há base de dados configurada. */
  cliente: null as unknown,
  /** O que a escrita de diagnóstico responde. */
  escrita: { gravado: true, duradouro: true, onde: "servidor" } as {
    gravado: boolean;
    duradouro: boolean;
    onde: string;
    motivo?: string;
  },
  /** O que ficou escrito (para a releitura devolver o mesmo). */
  guardado: null as unknown,
  /** Faz a releitura devolver outra coisa — a gravação que ninguém confirma. */
  leituraNaoConfirma: false,
  escritas: 0,
  /** O que o `getBucket` responde, por bucket. */
  buckets: "ok" as "ok" | "por-criar" | "sem-resposta",
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./app-state", async () => {
  // `oFicheiroEhEfemero` é o VERDADEIRO: é a regra de ambiente que decide se o
  // ficheiro conta como sítio, e um duplo aqui deixava de a testar.
  const real = await vi.importActual<typeof import("./app-state")>("./app-state");
  return {
    oFicheiroEhEfemero: real.oFicheiroEhEfemero,
    setState: vi.fn(async (_key: string, value: unknown) => {
      st.escritas++;
      if (st.escrita.gravado) st.guardado = value;
      return st.escrita;
    }),
    getState: vi.fn(async () => (st.leituraNaoConfirma ? { prova: "outra-coisa" } : st.guardado)),
  };
});

import {
  verificarArmazenamento,
  CHAVE_DE_DIAGNOSTICO,
  type DiagnosticoDoArmazenamento,
} from "./estado-do-armazenamento";

/** Um Supabase que responde ao `getBucket` conforme `st.buckets`. */
function supabaseComStorage() {
  return {
    storage: {
      getBucket: async (nome: string) => {
        if (st.buckets === "ok") return { data: { name: nome }, error: null };
        if (st.buckets === "por-criar")
          return { data: null, error: { message: "Bucket not found" } };
        return { data: null, error: { message: "fetch failed" } };
      },
    },
  };
}

beforeEach(() => {
  st.cliente = supabaseComStorage();
  st.escrita = { gravado: true, duradouro: true, onde: "servidor" };
  st.guardado = null;
  st.leituraNaoConfirma = false;
  st.escritas = 0;
  st.buckets = "ok";
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Cada verificação destes testes é uma verificação NOVA — a cache tem o seu
 *  próprio bloco lá em baixo e não pode contaminar os outros casos. */
const verificar = (): Promise<DiagnosticoDoArmazenamento> =>
  verificarArmazenamento({ forcar: true });

describe("a verificação TENTA mesmo escrever", () => {
  it("escreve uma chave de diagnóstico e volta a lê-la", async () => {
    await verificar();
    expect(st.escritas).toBe(1);
    // A chave é própria: não pode passar por um rascunho na varredura da cópia
    // de segurança (`proposal-draft:`) nem por um marcador de operação.
    expect(CHAVE_DE_DIAGNOSTICO).not.toMatch(/^proposal-draft:/);
  });

  it("uma gravação que a releitura não confirma não é um armazenamento a funcionar", async () => {
    st.leituraNaoConfirma = true;
    const d = await verificar();
    expect(d.estado).toBe("leitura-nao-confirma");
    expect(d.avisar).toBe(true);
  });
});

describe("os quatro casos, e o que fazer em cada um", () => {
  it("tudo bem: não se avisa ninguém", async () => {
    const d = await verificar();
    expect(d.estado).toBe("ok");
    expect(d.duradouro).toBe(true);
    // Um aviso que aparece quando está tudo bem é um aviso que se deixa de ler.
    expect(d.avisar).toBe(false);
  });

  it("sem configuração: nomeia as duas variáveis que faltam", async () => {
    st.cliente = null;
    st.escrita = { gravado: true, duradouro: false, onde: "ficheiro-efemero" };
    const d = await verificar();
    expect(d.estado).toBe("sem-configuracao");
    expect(d.duradouro).toBe(false);
    expect(d.avisar).toBe(true);
    expect(d.oQueFazer).toMatch(/SUPABASE_URL/);
    expect(d.oQueFazer).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("tabela em falta: nomeia o ficheiro a correr", async () => {
    st.escrita = { gravado: false, duradouro: false, onde: "nenhures", motivo: "tabela-em-falta" };
    const d = await verificar();
    expect(d.estado).toBe("tabela-em-falta");
    expect(d.avisar).toBe(true);
    expect(d.oQueFazer).toMatch(/db\/schema\.sql/);
  });

  it("permissão recusada: manda confirmar a chave, não o esquema", async () => {
    st.escrita = { gravado: false, duradouro: false, onde: "nenhures", motivo: "sem-permissao" };
    const d = await verificar();
    expect(d.estado).toBe("sem-permissao");
    expect(d.avisar).toBe(true);
    expect(d.oQueFazer).toMatch(/service_role/);
    // Não pode mandar correr o schema: a tabela existe, o problema é a chave.
    expect(d.oQueFazer).not.toMatch(/schema\.sql/);
  });

  it("avaria passageira: diz que pode ser passageira, e não manda mexer em nada", async () => {
    st.escrita = { gravado: false, duradouro: false, onde: "nenhures", motivo: "escrita-recusada" };
    const d = await verificar();
    expect(d.estado).toBe("escrita-recusada");
    expect(d.oQueFazer).toMatch(/passageir/i);
  });

  it("nenhum estado sai daqui sem dizer o que fazer", async () => {
    for (const motivo of ["tabela-em-falta", "sem-permissao", "escrita-recusada"] as const) {
      st.escrita = { gravado: false, duradouro: false, onde: "nenhures", motivo };
      const d = await verificar();
      expect(d.titulo.length).toBeGreaterThan(0);
      expect(d.oQueFazer.length).toBeGreaterThan(20);
      // "Erro de armazenamento" não indica caminho nenhum a ninguém.
      expect(d.oQueFazer).not.toMatch(/^erro/i);
    }
  });
});

/**
 * O ficheiro é legítimo na máquina de alguém — e é lá que a maior parte do
 * trabalho deste repositório acontece. Um aviso vermelho em cada arranque de
 * `next dev` seria exactamente o alarme falso que faz ninguém ler o aviso a
 * sério no dia em que ele aparecer em produção.
 */
describe("em desenvolvimento o ficheiro é legítimo", () => {
  it("sem base de dados fora de produção: não é um problema, e não se avisa", async () => {
    vi.stubEnv("NODE_ENV", "development");
    st.cliente = null;
    st.escrita = { gravado: true, duradouro: true, onde: "ficheiro" };
    const d = await verificar();
    expect(d.estado).toBe("ficheiro-de-desenvolvimento");
    expect(d.avisar).toBe(false);
    expect(d.duradouro).toBe(true);
  });

  it("mas um ficheiro que não se deixa escrever é um problema em qualquer ambiente", async () => {
    vi.stubEnv("NODE_ENV", "development");
    st.cliente = null;
    st.escrita = {
      gravado: false,
      duradouro: false,
      onde: "nenhures",
      motivo: "escrita-recusada",
    };
    const d = await verificar();
    expect(d.avisar).toBe(true);
  });
});

describe("os buckets das fotos", () => {
  it("respondem: nada a dizer", async () => {
    const d = await verificar();
    expect(d.fotos).toBe("ok");
    expect(d.avisar).toBe(false);
  });

  /** Numa instalação nova os buckets ainda não existem — são criados na
   *  primeira fotografia. Chamar a isso uma avaria é o alarme falso clássico. */
  it("ainda não existem: não é avaria, é uma instalação por estrear", async () => {
    st.buckets = "por-criar";
    const d = await verificar();
    expect(d.fotos).toBe("por-criar");
    expect(d.avisar).toBe(false);
  });

  it("não respondem: isso sim avisa-se", async () => {
    st.buckets = "sem-resposta";
    const d = await verificar();
    expect(d.fotos).toBe("sem-resposta");
    expect(d.avisar).toBe(true);
    expect(d.fotosOQueFazer ?? "").toMatch(/SUPABASE_URL|Storage/);
  });
});

/**
 * Isto é perguntado a cada abertura do back office, por cada separador aberto,
 * e a resposta custa uma escrita e uma leitura na base de dados. Sem cache, um
 * dia de trabalho com o portátil e o tablet abertos são centenas de escritas
 * numa tabela partilhada só para dizer «está tudo bem».
 */
describe("barato de correr", () => {
  it("a segunda pergunta no minuto seguinte não volta a escrever", async () => {
    await verificarArmazenamento({ forcar: true });
    await verificarArmazenamento();
    await verificarArmazenamento();
    expect(st.escritas).toBe(1);
  });

  it("três perguntas ao mesmo tempo são UMA verificação", async () => {
    await Promise.all([
      verificarArmazenamento({ forcar: true }),
      verificarArmazenamento(),
      verificarArmazenamento(),
    ]);
    expect(st.escritas).toBe(1);
  });

  it("mas quem acabou de correr o schema.sql pode pedir uma verificação nova", async () => {
    await verificarArmazenamento({ forcar: true });
    await verificarArmazenamento({ forcar: true });
    expect(st.escritas).toBe(2);
  });
});
