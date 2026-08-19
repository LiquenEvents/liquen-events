import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Configuração SÓ PARA MEDIÇÃO (relatório IDEIAS-PDF.md).
 * Não toca na suite do projecto: o `include` aponta para esta pasta.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["medicao/**/*.test.ts"],
    root: fileURLToPath(new URL("..", import.meta.url)),
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
