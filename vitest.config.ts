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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
    },
  },
});
