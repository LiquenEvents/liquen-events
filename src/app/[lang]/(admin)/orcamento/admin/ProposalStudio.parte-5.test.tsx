// @vitest-environment jsdom
// Os casos do estúdio estão em `ProposalStudio.casos.test.tsx`; esta é a parte 5 de 6
// (ver `test/em-partes.ts` — o ficheiro inteiro levava sozinho ~6 minutos).
import { vi } from "vitest";

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__PARTE__ = { k: 4, de: 6 };
});

import "./ProposalStudio.casos.test";
