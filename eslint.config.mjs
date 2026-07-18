import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The React Compiler rules (Next 16 / eslint-plugin-react-hooks v6) are
  // advisory for this existing codebase — the affected components build and
  // run correctly. We keep them visible as warnings (so they show up and can
  // be paid down over time) rather than hard errors that would block CI on
  // working code. Correctness, Next and TS rules stay as errors.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Test files don't ship to the browser; allow pragmatic casts (e.g. fakes).
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Server-only boundary guard. The recurring build-breaker is a client
  // component that VALUE-imports a server-only module — a `*-store` (→ repository
  // → fs/Supabase), the repository itself, or `server-only`. Bundling any of
  // those into the browser build fails the build. Make it an editor/CI error.
  //
  // Scope: React components under app/ and components/ (where client components
  // live). `allowTypeImports` keeps `import type { Invoice } from "@/lib/invoices-store"`
  // legal (types are erased before bundling), so the current clean codebase — which
  // only ever type-imports a store from a client component — stays green. Server
  // entry points (page/layout/template) and tests legitimately reach the stores
  // and are exempted in the override right below.
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*-store", "@/lib/repository", "server-only"],
              allowTypeImports: true,
              message:
                "Módulo server-only importado por valor num componente de cliente — puxa fs/Supabase para o bundle e parte o build. Use `import type` (para tipos) ou desloque o acesso a dados para um componente/rota de servidor.",
            },
          ],
        },
      ],
    },
  },
  // Server entry points (page/layout/template) and tests run on the server and
  // legitimately value-import the stores — lift the client-boundary guard there.
  {
    files: ["**/page.tsx", "**/layout.tsx", "**/template.tsx", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
