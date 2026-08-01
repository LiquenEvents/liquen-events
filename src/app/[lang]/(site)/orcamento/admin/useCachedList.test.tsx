// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCachedList, prefetchList, __resetListCache } from "./useCachedList";

/**
 * O que estes testes protegem é a parte que se sente ao clicar: uma
 * revalidação que não mudou nada não pode custar bytes NEM um render, e três
 * sítios a pedir a mesma lista ao mesmo tempo não podem virar três viagens.
 */

interface Reply {
  status: number;
  body?: unknown;
  etag?: string;
}

let replies: Reply[] = [];
let requests: { url: string; ifNoneMatch: string | null }[] = [];

function fetchMock(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers((init?.headers as HeadersInit) ?? {});
  requests.push({ url: String(url), ifNoneMatch: headers.get("If-None-Match") });
  const reply = replies.shift() ?? { status: 200, body: [] };
  const resHeaders = new Headers();
  if (reply.etag) resHeaders.set("etag", reply.etag);
  return Promise.resolve({
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    headers: resHeaders,
    json: async () => reply.body,
  } as unknown as Response);
}

beforeEach(() => {
  __resetListCache();
  replies = [];
  requests = [];
  vi.stubGlobal("fetch", vi.fn(fetchMock));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCachedList — primeira visita", () => {
  it("mostra o esqueleto uma vez, guarda os dados e o ETag", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const { result } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: "a" }]);
    expect(requests[0].ifNoneMatch).toBeNull();
  });

  it("marca erro quando a rota falha, sem deitar fora o esqueleto para sempre", async () => {
    replies = [{ status: 500 }];
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });
});

describe("useCachedList — revalidação condicional", () => {
  it("reenvia o ETag e, num 304, mantém a MESMA referência do array", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const first = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    const arrayFromFirstVisit = first.result.current.data;
    first.unmount();

    // Segunda visita à mesma vista: nada mudou no servidor.
    replies = [{ status: 304 }];
    const second = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));

    // Sem esqueleto: já havia dados em cache.
    expect(second.result.current.loading).toBe(false);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].ifNoneMatch).toBe('W/"v1"');
    // A MESMA referência — é isto que faz o React não redesenhar as linhas.
    expect(second.result.current.data).toBe(arrayFromFirstVisit);
    expect(second.result.current.error).toBe(false);
  });

  it("aceita o corpo novo quando os dados mudaram mesmo", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const first = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();

    replies = [{ status: 200, body: [{ id: "a" }, { id: "b" }], etag: 'W/"v2"' }];
    const second = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(second.result.current.data).toHaveLength(2));

    // E o ETag novo é o que segue à viagem seguinte.
    second.unmount();
    replies = [{ status: 304 }];
    renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].ifNoneMatch).toBe('W/"v2"');
  });
});

describe("useCachedList — pedidos em simultâneo", () => {
  it("o prefetch ocioso e a vista a montar partilham UMA viagem", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    prefetchList("k", "/api/k");
    const { result } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));

    await waitFor(() => expect(result.current.data).toEqual([{ id: "a" }]));
    expect(requests).toHaveLength(1);
  });

  it("duas vistas a pedir a mesma chave ao mesmo tempo também", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const a = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    const b = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(a.result.current.data).toBeDefined());
    await waitFor(() => expect(b.result.current.data).toBeDefined());
    expect(requests).toHaveLength(1);
    expect(a.result.current.data).toBe(b.result.current.data);
  });

  it("o prefetch não repete o que já está em cache", async () => {
    replies = [{ status: 200, body: [], etag: 'W/"v1"' }];
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.data).toBeDefined());
    prefetchList("k", "/api/k");
    expect(requests).toHaveLength(1);
  });
});

describe("useCachedList — escritas optimistas", () => {
  it("uma escrita optimista força um corpo completo na revalidação seguinte", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const { result, unmount } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(result.current.data).toBeDefined());

    act(() => result.current.setData((prev) => [...prev, { id: "b" }]));
    expect(result.current.data).toHaveLength(2);
    unmount();

    replies = [{ status: 200, body: [{ id: "a" }, { id: "b" }], etag: 'W/"v2"' }];
    renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(requests).toHaveLength(2));
    // Sem ETag: o que temos em mão já não é a versão que o servidor carimbou.
    expect(requests[1].ifNoneMatch).toBeNull();
  });

  it("um 304 que chegue atrasado nunca desfaz a escrita optimista", async () => {
    // O pedido parte com o ETag v1; a equipa edita uma linha enquanto ele voa.
    let release: (r: Response) => void = () => {};
    const pending = new Promise<Response>((r) => (release = r));
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];

    const { result, unmount } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(result.current.data).toBeDefined());
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    const second = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    act(() => second.result.current.setData([{ id: "a" }, { id: "editado" }]));

    release({
      ok: false,
      status: 304,
      headers: new Headers(),
      json: async () => undefined,
    } as unknown as Response);

    await waitFor(() => expect(second.result.current.data).toHaveLength(2));
    expect(second.result.current.data).toEqual([{ id: "a" }, { id: "editado" }]);
  });
});

describe("useCachedList — refresh", () => {
  it('"Actualizar" traz dados a sério: sem ETag, com esqueleto', async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const { result } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(result.current.data).toBeDefined());

    replies = [{ status: 200, body: [{ id: "a" }, { id: "b" }], etag: 'W/"v2"' }];
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(requests[1].ifNoneMatch).toBeNull();
  });
});
