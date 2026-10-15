// Os casos estão em `montar.casos.test.ts`; esta é a parte 1 de 3 (ver
// `test/em-partes.ts` — o ficheiro inteiro levava sozinho ~2 minutos).
import { vi } from "vitest";

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__PARTE__ = { k: 0, de: 3 };
});

import "./montar.casos.test";
