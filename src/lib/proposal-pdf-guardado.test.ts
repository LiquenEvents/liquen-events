import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF DO CASAL NÃO SE DESENHA DUAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Na página onde o casal aceita a proposta, o «Ver a proposta completa (PDF)»
 * era um link directo que mandava REDESENHAR o documento — oitenta fotografias
 * pelo `sharp`, num processo que três dias depois do envio está frio. Segundos,
 * atrás de um link que não diz nada enquanto trabalha.
 *
 * O ficheiro já existe: é o que seguiu em anexo. Isto guarda-o.
 *
 * O que estes testes prendem, por ordem de importância:
 *
 *  1. **a chave é o CONTEÚDO.** Uma proposta revista não pode servir o
 *     ficheiro antigo — é o mesmo defeito de que a rota do link já se protege
 *     («a página na versão 2 com um botão que descarrega a 1»);
 *  2. **nada disto pode partir nada.** É memória, não é a verdade: uma escrita
 *     ou uma leitura que falhem custam um desenho a mais, e mais nada. Nenhuma
 *     função deste módulo lança.
 */

const st = vi.hoisted(() => ({
  /** Os ficheiros guardados: caminho → bytes. */
  ficheiros: new Map<string, Buffer>(),
  /** O bucket existe? */
  bucketExiste: true,
  /** Criar o bucket rebenta? */
  criarRebenta: false,
  /** O upload rebenta? */
  subirRebenta: false,
  /** Quantas vezes se tentou criar o bucket. */
  criacoes: 0,
  cliente: null as unknown,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  guardarPdfDaProposta,
  lerPdfDaProposta,
  esquecerBucketDePdfs,
} from "./proposal-pdf-guardado";

function storageFalso() {
  return {
    storage: {
      async getBucket() {
        return st.bucketExiste
          ? { data: { name: "proposal-pdfs" }, error: null }
          : { data: null, error: { message: "Bucket not found" } };
      },
      async createBucket() {
        st.criacoes += 1;
        if (st.criarRebenta) return { error: { message: "sem permissões" } };
        st.bucketExiste = true;
        return { error: null };
      },
      from() {
        return {
          async upload(caminho: string, bytes: Buffer) {
            if (st.subirRebenta) return { error: { message: "quota excedida" } };
            if (st.ficheiros.has(caminho)) return { error: { message: "already exists" } };
            st.ficheiros.set(caminho, bytes);
            return { error: null };
          },
          async download(caminho: string) {
            const b = st.ficheiros.get(caminho);
            if (!b) return { data: null, error: { message: "Object not found" } };
            return { data: new Blob([b]), error: null };
          },
        };
      },
    },
  };
}

const BYTES = Buffer.from("%PDF-1.7 um documento");

beforeEach(() => {
  st.ficheiros = new Map();
  st.bucketExiste = true;
  st.criarRebenta = false;
  st.subirRebenta = false;
  st.criacoes = 0;
  st.cliente = storageFalso();
  esquecerBucketDePdfs();
});

describe("guardar e ler o PDF de uma proposta", () => {
  it("o que se guarda é o que se lê", async () => {
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(true);
    const lido = await lerPdfDaProposta("p-1", "chave-A");
    expect(lido?.toString()).toBe(BYTES.toString());
  });

  /** ── O QUE PROTEGE O CASAL DE VER A VERSÃO ERRADA ─────────────────── */

  it("uma chave diferente — um documento revisto — não encontra o antigo", async () => {
    await guardarPdfDaProposta("p-1", "chave-A", BYTES);
    expect(await lerPdfDaProposta("p-1", "chave-B")).toBeNull();
  });

  it("e uma proposta diferente também não", async () => {
    await guardarPdfDaProposta("p-1", "chave-A", BYTES);
    expect(await lerPdfDaProposta("p-2", "chave-A")).toBeNull();
  });

  it("guardar duas vezes a mesma chave não é uma falha", async () => {
    // A chave é o conteúdo: o que já lá está é byte-a-byte o mesmo ficheiro.
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(true);
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(true);
  });

  /** ── NADA DISTO PODE PARTIR UM ENVIO ──────────────────────────────── */

  it("sem Storage configurado, não lança — devolve que não guardou", async () => {
    st.cliente = null;
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(false);
    expect(await lerPdfDaProposta("p-1", "chave-A")).toBeNull();
  });

  it("uma escrita recusada não lança", async () => {
    st.subirRebenta = true;
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(false);
  });

  it("um bucket que não se consegue criar não lança", async () => {
    st.bucketExiste = false;
    st.criarRebenta = true;
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(false);
  });

  it("uma leitura de um ficheiro que não existe é `null`, não um erro", async () => {
    await expect(lerPdfDaProposta("p-1", "nao-existe")).resolves.toBeNull();
  });

  it("um PDF vazio não se guarda", async () => {
    expect(await guardarPdfDaProposta("p-1", "chave-A", Buffer.alloc(0))).toBe(false);
  });

  it("um ficheiro absurdamente grande não se guarda", async () => {
    // 20 MB é o tecto; uma proposta anda pelos 0,5–4.
    const enorme = Buffer.alloc(21 * 1024 * 1024);
    expect(await guardarPdfDaProposta("p-1", "chave-A", enorme)).toBe(false);
  });

  it("sem id ou sem chave não se faz nada", async () => {
    expect(await guardarPdfDaProposta("", "chave-A", BYTES)).toBe(false);
    expect(await guardarPdfDaProposta("p-1", "", BYTES)).toBe(false);
    expect(await lerPdfDaProposta("", "chave-A")).toBeNull();
  });

  it("o bucket cria-se UMA vez por processo, e não a cada gravação", async () => {
    st.bucketExiste = false;
    await guardarPdfDaProposta("p-1", "a", BYTES);
    await guardarPdfDaProposta("p-1", "b", BYTES);
    await guardarPdfDaProposta("p-1", "c", BYTES);
    expect(st.criacoes).toBe(1);
  });

  it("um id com caracteres estranhos não escapa da pasta", async () => {
    // O caminho é construído aqui; um id vindo de fora não pode subir níveis.
    await guardarPdfDaProposta("../../outra", "chave-A", BYTES);
    expect([...st.ficheiros.keys()].every((c) => !c.includes(".."))).toBe(true);
  });
});
