"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Stale-while-revalidate cache for the back-office list views.
 *
 * The admin dashboard mounts each API-backed view (Propostas, Tarefas,
 * …) only while it's active, so without a cache every tab switch re-fetches from
 * scratch and re-flashes a skeleton — the biggest "feels slow" drag in daily
 * use. This module-level cache survives unmounts, so:
 *   • first ever visit  → shows the skeleton once, fetches, caches;
 *   • every later visit → renders the cached data INSTANTLY and revalidates in
 *     the background (no skeleton, no flicker) so it stays fresh.
 *
 * `setData` writes through to the cache, so optimistic updates (add/edit/delete
 * a row) persist when you leave the view and come back — no stale reappearance.
 *
 * It's intentionally tiny (no SWR dependency): a Map keyed by a stable string.
 *
 * ── Porque é que revalidar deixou de custar ───────────────────────────────
 * Revalidar em cada montagem é o que mantém a lista de confiança, mas era caro:
 * com 300 pedidos, voltar a Propostas descarregava outra vez ~158 KB para dar,
 * quase sempre, exactamente o mesmo resultado. Agora guardamos também o ETag
 * que a rota devolve e reenviamo-lo em `If-None-Match`; quando nada mudou o
 * servidor responde **304 sem corpo** e nós ficamos com o array que já
 * tínhamos — a MESMA referência, por isso o React nem sequer volta a desenhar
 * as linhas. A frequência da revalidação não mudou; mudou o preço dela.
 *
 * Nada foi desligado para o número ficar bonito: se os dados mudaram, o
 * servidor manda 200 com o corpo completo, como sempre.
 */
interface Entry<T = unknown> {
  data: T;
  /** ETag da última resposta 200, para o pedido condicional seguinte. */
  etag?: string;
}

const cache = new Map<string, Entry>();

/**
 * Quantas escritas LOCAIS já houve nesta chave.
 *
 * É o que distingue "o servidor tem novidades" de "eu tenho novidades que o
 * servidor ainda não viu". Um pedido guarda o número com que partiu; se ele
 * mudou até a resposta chegar, o corpo que chegou descreve o mundo de ANTES
 * dessa escrita e não pode passar por cima dela — a linha apagada voltava ao
 * ecrã, e com o ETag novo agarrado a ela: a revalidação seguinte levava um 304
 * e a ressurreição ficava. Como a cache é partilhada, aparecia em todos os
 * painéis com esta chave.
 *
 * O ramo do 304 já tinha esta regra escrita; o do 200 é que não a tinha.
 */
const escritas = new Map<string, number>();

/**
 * Uma viagem por chave, mesmo quando três sítios pedem ao mesmo tempo.
 *
 * No arranque isto acontece de verdade: o `prefetchList` ocioso do AdminClient
 * e a vista que está a montar pedem a mesma lista com milissegundos de
 * diferença. Sem isto são dois pedidos e duas leituras no servidor, e o
 * primeiro resultado é deitado fora.
 */
const inFlight = new Map<string, Promise<Entry | null>>();

function loadOnce(key: string, url: string): Promise<Entry | null> {
  const running = inFlight.get(key);
  if (running) return running;

  const run = (async (): Promise<Entry | null> => {
    const before = cache.get(key);
    const escritasAoPartir = escritas.get(key) ?? 0;
    const res = await fetch(url, {
      cache: "no-store",
      headers: before?.etag ? { "If-None-Match": before.etag } : undefined,
    });

    if (res.status === 304) {
      // Nada mudou no servidor. Devolvemos o que está AGORA em cache (e não a
      // cópia lida no início do pedido): se entretanto houve uma escrita
      // optimista, é essa que vale — reverter para a versão anterior seria
      // desfazer à frente dos olhos dela uma alteração que já ficou gravada.
      return cache.get(key) ?? before ?? null;
    }
    if (!res.ok) {
      // A MENSAGEM do servidor, quando ele deu uma. É a diferença entre a
      // vista dizer "não foi possível ler" e dizer "falta correr o
      // db/schema.sql" — e essa segunda frase é a que resolve o problema
      // sozinha, sem ninguém ter de ir aos registos.
      const corpo = await res.json().catch(() => null);
      const dito = typeof corpo?.error === "string" ? corpo.error : "";
      throw new Error(dito || String(res.status));
    }

    const corpo = await res.json();

    // Houve uma escrita optimista enquanto isto voava: o corpo que chegou é
    // mais VELHO do que o que ela já vê, e o ETag descreve esse corpo velho.
    // Fica o que está em cache, sem carimbo — a viagem seguinte volta a pedir
    // tudo e é essa que reconcilia.
    if ((escritas.get(key) ?? 0) !== escritasAoPartir) return cache.get(key) ?? null;

    const entry: Entry = { data: corpo, etag: res.headers.get("etag") ?? undefined };
    cache.set(key, entry);
    return entry;
  })();

  inFlight.set(key, run);
  // Limpar a entrada em qualquer desfecho, sem transformar uma falha tratada
  // pelo chamador numa rejeição não-apanhada.
  void run
    .catch(() => {})
    .finally(() => {
      if (inFlight.get(key) === run) inFlight.delete(key);
    });
  return run;
}

/** Warm the cache for a view without rendering it (idle prefetch). No-op if
 *  already cached or in flight. */
export function prefetchList(key: string, url: string): void {
  if (cache.has(key) || inFlight.has(key)) return;
  void loadOnce(key, url).catch(() => {});
}

export interface CachedList<T> {
  data: T | undefined;
  /** Update the list AND the cache (use for optimistic add/edit/delete). */
  setData: (updater: T | ((prev: T) => T)) => void;
  loading: boolean;
  error: boolean;
  /** O que o servidor disse, quando disse alguma coisa. Vazio se a falha não
   *  trouxe explicação (rede em baixo, 500 mudo). */
  errorMessage: string;
  /** Force a foreground refresh (shows loading). */
  refresh: () => void;
}

export function useCachedList<T>(key: string, url: string): CachedList<T> {
  const cached = cache.get(key) as Entry<T> | undefined;
  const [data, setDataState] = useState<T | undefined>(cached?.data);
  // Only the true first load (nothing cached) shows the skeleton.
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const revalidate = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const entry = await loadOnce(key, url);
        // Num 304 isto é a MESMA referência que já está no estado, por isso o
        // React descarta a actualização e não há render nenhum.
        if (entry) setDataState(entry.data as T);
        setError(false);
        setErrorMessage("");
      } catch (e) {
        setError(true);
        setErrorMessage(e instanceof Error ? e.message : "");
      } finally {
        setLoading(false);
      }
    },
    [key, url],
  );

  useEffect(() => {
    // Silent revalidation when we already have cached data (no skeleton). The
    // setState happens asynchronously inside revalidate() after the fetch — this
    // is the intended stale-while-revalidate flow, not a synchronous cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    revalidate(cache.has(key));
  }, [revalidate, key]);

  const setData = useCallback(
    (updater: T | ((prev: T) => T)) => {
      // Marcada AQUI, e não dentro do actualizador: este corre no render
      // seguinte, e o que interessa é o instante em que ela mexeu na lista —
      // qualquer resposta que ainda esteja no ar já é anterior a isto.
      escritas.set(key, (escritas.get(key) ?? 0) + 1);
      setDataState((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(prev as T) : updater;
        // Sem ETag: o que temos em mão já não é a versão que o servidor
        // carimbou, portanto a revalidação seguinte tem de trazer o corpo todo
        // em vez de aceitar um 304 que descrevia a versão anterior.
        cache.set(key, { data: next });
        return next;
      });
    },
    [key],
  );

  const refresh = useCallback(() => {
    // "Actualizar" tem de trazer dados a sério: deitar fora o ETag garante um
    // corpo completo, mesmo que o servidor considere que nada mudou.
    const entry = cache.get(key);
    if (entry) cache.set(key, { data: entry.data });
    void revalidate(false);
  }, [key, revalidate]);

  return { data, setData, loading, error, errorMessage, refresh };
}

/** Esquece tudo o que está em cache. Só para testes — o produto não precisa. */
export function __resetListCache(): void {
  cache.clear();
  inFlight.clear();
  escritas.clear();
}
