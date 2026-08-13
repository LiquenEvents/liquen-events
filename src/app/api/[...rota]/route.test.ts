import { describe, it, expect } from "vitest";
import { GET, POST, DELETE, PUT, PATCH, HEAD, OPTIONS } from "./route";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ENDEREÇO DE API QUE NÃO EXISTE NÃO PODE DEVOLVER UMA PÁGINA WEB
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Medido contra um build de produção antes de esta rota existir:
 * `/api/nao-existe` devolvia **HTTP 200** e o HTML da página de 404 do sítio —
 * menu, rodapé e tipos de letra —, porque o apanha-tudo de PÁGINAS
 * (`[lang]/(site)/[...caminho]`, com `lang` a valer «api») era a única coisa
 * que casava com aquele caminho.
 *
 * Quem está do outro lado é um programa: recebe 200, tenta ler JSON, e falha
 * três linhas à frente com um erro que não diz nada sobre a causa.
 */
describe("o apanha-tudo da API", () => {
  it("responde 404 em JSON, e não uma página", async () => {
    const res = GET();
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    await expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("responde o mesmo a qualquer método — o endereço é que não existe", async () => {
    for (const fn of [GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS]) {
      expect(fn().status, `${fn.name} devia ser 404`).toBe(404);
    }
  });

  it("não enumera a superfície da API a quem bate à porta errada", async () => {
    // É pública e sem sessão: nada de listar endereços nem de sugerir «quis
    // dizer…». O estado e uma frase chegam.
    const corpo = JSON.stringify(await GET().json());
    for (const rota of ["tarefas", "orcamento", "propostas", "admin", "backup"]) {
      expect(corpo).not.toContain(rota);
    }
  });

  it("não é guardada em cache — um endereço pode passar a existir amanhã", async () => {
    expect(GET().headers.get("cache-control")).toMatch(/no-store/);
  });
});
