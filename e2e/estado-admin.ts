import path from "node:path";

/**
 * ONDE FICA A SESSÃO DE ADMINISTRAÇÃO GUARDADA.
 *
 * Vive num ficheiro só seu, e não dentro do `sessao-admin.setup.ts`, por uma
 * razão prática: as configurações do Playwright importam esta constante, e
 * importar de um ficheiro que chama `setup(...)` faz o Playwright recusar-se a
 * arrancar («did not expect test() to be called here»). Um módulo sem testes
 * dentro pode ser importado de qualquer lado.
 *
 * Está no `.gitignore`: é uma sessão autenticada, não é código.
 */
export const ESTADO_ADMIN = path.join(process.cwd(), "e2e/.auth/admin.json");
