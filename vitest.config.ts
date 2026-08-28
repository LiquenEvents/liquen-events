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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "e2e/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
    },
  },
});
