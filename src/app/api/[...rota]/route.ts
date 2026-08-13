import { NextResponse } from "next/server";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UM ENDEREÇO DE API QUE NÃO EXISTE RESPONDE COMO API, E NÃO COM UMA PÁGINA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O QUE ACONTECIA. O layout de raiz deste projecto vive num segmento dinâmico
 * (`app/[lang]/…`), e há um apanha-tudo de páginas por baixo dele
 * (`[lang]/(site)/[...caminho]`). Para o encaminhador, `/api/isto-nao-existe`
 * casa com esse apanha-tudo — `lang` fica a valer «api» — e a resposta era a
 * PÁGINA DE MARKETING do 404: menu, rodapé, tipos de letra, dezenas de
 * quilobytes de HTML, com estado **200**.
 *
 * Quem está do outro lado de uma chamada de API é um programa. Um programa que
 * peça JSON e receba `<!DOCTYPE html>` com 200 não falha onde devia: falha três
 * linhas mais à frente, a tentar ler um campo de um documento que é uma página
 * web. É o género de resposta que custa uma tarde a diagnosticar — e o próprio
 * `fetch` do back office já tem uma armadilha para isto (o painel de sessão
 * expirada lê o estado das respostas), que um 200 atravessa sem tocar.
 *
 * PORQUE É QUE ISTO NÃO ROUBA NENHUMA ROTA VERDADEIRA. Um apanha-tudo é a
 * correspondência MENOS específica que o Next tem: qualquer segmento literal
 * (`/api/tarefas`) ou dinâmico (`/api/orcamento/[id]`) ganha-lhe sempre. Só
 * recebe o que já não tinha destino nenhum.
 *
 * E PORQUE É QUE NÃO DIZ MAIS DO QUE ISTO. Nada de listar os endereços que
 * existem, nem de sugerir «quis dizer…»: esta rota é pública e não tem sessão,
 * e enumerar a superfície da API a quem bate à porta errada é dar um mapa de
 * graça. O estado e uma frase chegam.
 */

/** A mesma resposta para todos os métodos: o endereço é que não existe. */
function naoExiste() {
  return NextResponse.json(
    { error: "Este endereço de API não existe." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = naoExiste;
export const POST = naoExiste;
export const PUT = naoExiste;
export const PATCH = naoExiste;
export const DELETE = naoExiste;
export const HEAD = naoExiste;
export const OPTIONS = naoExiste;
