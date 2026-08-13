import { notFound } from "next/navigation";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUALQUER ENDEREÇO QUE NÃO EXISTA CAI AQUI — E SAI DAQUI PELO 404 DO SÍTIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O QUE ESTAVA ANTES. Um endereço sem rota — uma ligação partida, um marcador
 * do sítio anterior que não está na lista de redireccionamentos do
 * next.config.ts, um erro de escrita — era servido pela página de erro do
 * PRÓPRIO Next. Medido no HTML construído (`.next/server/app/_not-found.html`,
 * 8,6 KB): «404 / This page could not be found.», em inglês, sem uma única
 * ligação, sem folha de estilo do sítio, sem menu e sem rodapé. Quem lá
 * chegasse não tinha por onde continuar.
 *
 * E não era por falta de página: o `NotFoundView` — 404 desenhado, na língua
 * do visitante, com seis caminhos de volta — está ao lado deste ficheiro desde
 * sempre. O que faltava era ELE SER CHAMADO.
 *
 * PORQUE É QUE NÃO ERA. Um `not-found.tsx` aninhado só responde ao
 * `notFound()` chamado DENTRO do seu ramo — é o que já acontecia em
 * `/servicos/inexistente`. Os endereços que não casam com rota nenhuma são
 * tratados pelo `not-found` da RAIZ do `app/`, e este projecto não pode ter
 * um: o layout de raiz vive num segmento dinâmico (`app/[lang]/layout.tsx`),
 * por isso um `app/not-found.tsx` ficaria sem layout e o build morre com
 * "doesn't have a root layout" (next-app-loader só injecta o layout de recurso
 * enquanto o not-found for o do próprio Next). A documentação nomeia este caso
 * — «your root layout is defined using top-level dynamic segments» — e aponta
 * para `global-not-found.js`, que exige uma bandeira experimental na
 * configuração.
 *
 * O QUE ESTA ROTA FAZ. Passa a HAVER rota para o que não existe, e o `404`
 * volta a ser tratado dentro do ramo `(site)`: com o layout do sítio (menu e
 * rodapé), com a língua que vem do segmento `[lang]`, e com o `NotFoundView`.
 * O estado HTTP continua a ser 404 — quem o devolve é o `notFound()`, não nós.
 *
 * PORQUE É QUE ISTO NÃO ROUBA NENHUMA PÁGINA VERDADEIRA. O apanha-tudo é a
 * forma de correspondência MENOS específica que o Next tem: um segmento
 * literal (`/servicos`) ou dinâmico (`/casamentos/[polo]`) ganha-lhe sempre.
 * Só recebe o que já não tinha destino.
 */
export default async function CaminhoInexistente() {
  // `return` e não só a chamada: `notFound()` devolve `never`, e devolvê-lo faz
  // esta página satisfazer a assinatura que o Next gera para um `page.tsx`
  // (que espera um nó de React, não `void`).
  return notFound();
}
