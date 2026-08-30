import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mirror the "@/..." path alias from tsconfig so tests can import app code.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` is a compile-time marker Next resolves via its webpack
      // layers (a no-op on the server, a hard error in a Client Component).
      // Under vitest (node, no `react-server` condition) the bare specifier is
      // unresolvable, so map it to Next's own no-op stub — same behaviour Next's
      // testing docs prescribe (jest maps it to an empty mock).
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
      // `next/font/google` é o mesmo caso, e apareceu no dia em que um layout
      // passou a carregar uma letra: as funções (`Inter`, `Geist`, …) só
      // existem depois de o compilador do Next as substituir. Num teste que
      // monta esse layout, a chamada rebenta com «Geist is not a function» —
      // um erro que não tem nada que ver com o que o teste mede. O duplo tem a
      // forma do verdadeiro; ver a nota no ficheiro.
      "next/font/google": fileURLToPath(new URL("./test/next-font-google.ts", import.meta.url)),
    },
  },
  test: {
    // Default to node; component tests opt into jsdom per-file with the
    // `// @vitest-environment jsdom` directive so the fast lib tests stay lean.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    /**
     * ── E OS AJUDANTES DO `e2e/` TAMBÉM ──────────────────────────────────
     *
     * Os PASSEIOS do Playwright são `*.spec.ts` e continuam de fora — correm
     * num browser e não aqui. O que passa a entrar são os `*.test.ts` do `e2e/`:
     * os ajudantes partilhados que os passeios importam são código normal, e
     * até agora não havia sítio nenhum onde os pôr à prova.
     *
     * Não é zelo: um deles montava um padrão errado e custou três minutos de
     * espera por passagem antes de alguém perceber porquê (ver
     * `caca/harness.rotulos.test.ts`).
     */
    /**
     * ── E O `test/`, QUE É ONDE VIVEM OS DUPLOS ───────────────────────────
     *
     * O `test/next-font-google.ts` substitui um marcador de compilação, e tem
     * uma lista de famílias escrita à mão que se desactualiza sozinha. O aviso
     * que a guarda vive ao lado dele; sem esta linha, esse aviso nunca corria
     * — um teste que não corre é pior do que um teste que não existe, porque
     * dá a impressão de que alguém está a tomar conta.
     */
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "e2e/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
    },
  },
});
