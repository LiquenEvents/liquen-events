/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA MEMÓRIA COM TECTO EM BYTES, QUE ESQUECE PRIMEIRO O QUE SE USOU HÁ MAIS TEMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É o mesmo desenho do `proposal-pdf-cache.ts` — o tecto por BYTES e não por
 * número de entradas, porque numa função do servidor é a memória que acaba, e
 * o `Map` a dar a ordem de uso sem estrutura nenhuma —, posto à parte para as
 * duas memórias das descargas mais rápidas o poderem partilhar: o PDF final de
 * cada versão (`proposal-preview-cache.ts`) e as fotografias já reduzidas
 * (`proposal-doc-render.ts`).
 *
 * Vive por processo: um arranque a frio começa vazio, e isso está certo. Nada
 * do que se guarda aqui é a verdade de coisa nenhuma — é só a diferença entre
 * fazer o trabalho uma vez ou várias dentro do mesmo processo.
 */
export interface CachePorBytes<T> {
  ler(chave: string): T | undefined;
  guardar(chave: string, valor: T): void;
  esvaziar(): void;
  estado(): { entradas: number; bytes: number };
}

export function criarCachePorBytes<T>(opcoes: {
  /** O total que a memória pode ocupar. */
  tecto: number;
  /** Uma entrada maior do que isto não fica (serve-se à mesma, só não se
   *  guarda) — para uma só não expulsar todas as outras. */
  maximoPorEntrada: number;
  /** Quanto pesa um valor. */
  tamanho: (valor: T) => number;
}): CachePorBytes<T> {
  const mapa = new Map<string, { valor: T; bytes: number }>();
  let total = 0;
  return {
    ler(chave) {
      const e = mapa.get(chave);
      if (!e) return undefined;
      // Reinserir manda a entrada para o fim da fila: foi usada agora.
      mapa.delete(chave);
      mapa.set(chave, e);
      return e.valor;
    },
    guardar(chave, valor) {
      const bytes = opcoes.tamanho(valor);
      if (bytes > opcoes.maximoPorEntrada) return;
      const antes = mapa.get(chave);
      if (antes) {
        mapa.delete(chave);
        total -= antes.bytes;
      }
      mapa.set(chave, { valor, bytes });
      total += bytes;
      while (total > opcoes.tecto) {
        const maisAntiga = mapa.keys().next();
        if (maisAntiga.done) break;
        total -= mapa.get(maisAntiga.value)!.bytes;
        mapa.delete(maisAntiga.value);
      }
    },
    esvaziar() {
      mapa.clear();
      total = 0;
    },
    estado() {
      return { entradas: mapa.size, bytes: total };
    },
  };
}
