import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MINIATURA A PEDIDO — o guarda, e o que acontece quando não dá
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta rota existe porque a grelha do estúdio caía para o ORIGINAL nas fotos
 * anteriores às miniaturas: medido a 1,6 Mbps com 24 células, 1099 KB por
 * célula (26,4 MB nas 24) para caixas de 174 px, e a primeira fotografia
 * pintada aos 34,0 s.
 *
 * Dois riscos, e é sobre eles que estes casos são escritos:
 *
 *  1. **passar a ser uma porta para a pasta de outro pedido.** O endereço leva
 *     um caminho de Storage no `?ref=`; uma sessão de admin não pode ser
 *     autorização para ler QUALQUER pasta a partir do id de outra;
 *  2. **transformar uma miniatura em falta numa fotografia que desaparece.**
 *     Falhar aqui tem de dar 404 — a célula cai para o original sozinha —, e
 *     nunca um erro que ela veja.
 */
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  miniatura: vi.fn(async (): Promise<Buffer | null> => Buffer.from("bytes-jpeg")),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/derivadas", () => ({ miniaturaAPedido: st.miniatura }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";

function pedido(ref: string, id = "q-1"): [NextRequest, { params: Promise<{ id: string }> }] {
  const url = `https://liquen.test/api/orcamento/${id}/miniatura?ref=${encodeURIComponent(ref)}`;
  // A rota lê o `?ref=` pelo `nextUrl`, que um `Request` cru não tem.
  const req = Object.assign(new Request(url), { nextUrl: new URL(url) }) as unknown as NextRequest;
  return [req, { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  vi.clearAllMocks();
});

describe("GET /api/orcamento/[id]/miniatura", () => {
  it("401 a quem não entrou, e não vai buscar nada", async () => {
    st.authed = false;
    const res = await GET(...pedido("q-1/a.jpg"));
    expect(res.status).toBe(401);
    expect(st.miniatura).not.toHaveBeenCalled();
  });

  it("503 sem Storage configurado", async () => {
    st.dbConfigured = false;
    const res = await GET(...pedido("q-1/a.jpg"));
    expect(res.status).toBe(503);
    expect(st.miniatura).not.toHaveBeenCalled();
  });

  it("serve a miniatura da pasta DESTE pedido", async () => {
    const res = await GET(...pedido("q-1/a.jpg", "q-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    // `immutable`: o caminho tem um UUID, aqueles bytes nunca mudam. `private`
    // porque é o back office — nenhuma cache partilhada fica com a fotografia.
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(st.miniatura).toHaveBeenCalledWith("q-1/a.jpg");
  });

  /**
   * A Biblioteca de Temas é partilhada por todas as propostas: uma referência
   * `tema:` é legítima a partir de qualquer pedido, e é por isso que ela não
   * cai no guarda da pasta.
   */
  it("aceita uma referência à Biblioteca de Temas a partir de qualquer pedido", async () => {
    const res = await GET(...pedido("tema:terracotta/x.jpg", "q-outro"));
    expect(res.status).toBe(200);
  });

  it("403 a um caminho da pasta de OUTRO pedido", async () => {
    const res = await GET(...pedido("q-2/segredo.jpg", "q-1"));
    expect(res.status).toBe(403);
    expect(st.miniatura).not.toHaveBeenCalled();
  });

  it("400 a um caminho com `..`", async () => {
    const res = await GET(...pedido("q-1/../q-2/segredo.jpg", "q-1"));
    expect(res.status).toBe(400);
    expect(st.miniatura).not.toHaveBeenCalled();
  });

  it("400 sem `ref`", async () => {
    const url = "https://liquen.test/api/orcamento/q-1/miniatura";
    const req = Object.assign(new Request(url), {
      nextUrl: new URL(url),
    }) as unknown as NextRequest;
    const res = await GET(req, { params: Promise.resolve({ id: "q-1" }) });
    expect(res.status).toBe(400);
  });

  /**
   * «Não deu» tem de ser 404 e não 500: a célula tem plano B e cai para o
   * original — que é o comportamento de antes desta rota existir. Um 500 aqui
   * seria uma fotografia guardada a desaparecer do ecrã por causa de uma
   * derivada que é, por definição, descartável.
   */
  it("404 quando a miniatura não deu — a célula cai para o original", async () => {
    st.miniatura.mockResolvedValueOnce(null);
    const res = await GET(...pedido("q-1/a.jpg"));
    expect(res.status).toBe(404);
  });

  it("um `sharp` que rebenta também dá 404, e fica registado", async () => {
    const { log } = await import("@/lib/logger");
    st.miniatura.mockRejectedValueOnce(new Error("sharp em baixo"));
    const res = await GET(...pedido("q-1/a.jpg"));
    expect(res.status).toBe(404);
    expect(log.error).toHaveBeenCalled();
  });
});
