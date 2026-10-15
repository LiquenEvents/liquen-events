import { describe as describeVitest } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM FICHEIRO DE TESTES GIGANTE, CORRIDO EM PARTES AO MESMO TEMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (15/10): «quero tornar isto mesmo inteligente… se der para chegar a 2
 * minutos, 3 minutos». Medido: o `ProposalStudio.test.tsx` tinha 339 testes e
 * levava sozinho perto de 6 minutos. O vitest reparte o trabalho por FICHEIROS,
 * e um ficheiro corre sempre num só processo — por isso, por mais partes que o
 * CI tivesse, aquele ficheiro era o chão do tempo de todos.
 *
 * Em vez de o partir à mão em seis ficheiros (com o mesmo cabeçalho de 600
 * linhas copiado seis vezes, a divergir ao primeiro conserto), os casos ficam
 * num só `*.casos.test.tsx` (que o vitest não corre sozinho — ver o `exclude`) e cada `*.parte-N.test.tsx` corre uma fatia dos
 * `describe` de topo: o N-ésimo, o N+partes-ésimo, e assim por diante. Os
 * `describe` dentro de outros passam sem filtro.
 *
 * A fatia chega por `globalThis.__PARTE__`, posta pelo ficheiro da parte com um
 * `vi.hoisted` (corre antes dos `import`). Sem ela — o ficheiro de casos
 * importado à mão, para depurar — correm todos.
 */

interface Parte {
  /** Esta parte, a contar de 0. */
  k: number;
  /** Quantas partes há. */
  de: number;
}

let profundidade = 0;
let indice = 0;

const parteActual = () => (globalThis as { __PARTE__?: Parte }).__PARTE__;

/** O `describe` do vitest, que só regista os de topo que são desta parte. */
export const describe = ((nome: string, fn: () => void) => {
  if (profundidade > 0) return describeVitest(nome, fn);
  const parte = parteActual();
  const i = indice++;
  if (parte && i % parte.de !== parte.k) return undefined;
  return describeVitest(nome, () => {
    profundidade++;
    try {
      fn();
    } finally {
      profundidade--;
    }
  });
}) as unknown as typeof describeVitest;
