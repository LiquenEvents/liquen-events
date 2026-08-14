import type { Metadata } from "next";
import NotFoundView from "../NotFoundView";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

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
 *
 * ⚠ Aqui dizia-se «o estado HTTP continua a ser 404 — quem o devolve é o
 * `notFound()`, não nós». NÃO ERA VERDADE, e não era por causa desta rota: a
 * resposta vai em streaming e o Next não pode mudar o estado depois de o
 * cabeçalho seguir. Medido: 200. O bloco antes do `generateMetadata`, mais
 * abaixo, conta a medição inteira e o que se fez com ela.
 *
 * PORQUE É QUE ISTO NÃO ROUBA NENHUMA PÁGINA VERDADEIRA. O apanha-tudo é a
 * forma de correspondência MENOS específica que o Next tem: um segmento
 * literal (`/servicos`) ou dinâmico (`/casamentos/[polo]`) ganha-lhe sempre.
 * Só recebe o que já não tinha destino.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE É QUE ISTO DESENHA O 404 EM VEZ DE CHAMAR `notFound()`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Aqui estava `return notFound()`, e o comentário acima prometia três coisas
 * que MEDIDAS não se cumpriam (ver `e2e/endereco-que-nao-existe.spec.ts`, que
 * as mede uma a uma):
 *
 *  1. SEM JAVASCRIPT A PÁGINA ERA BRANCA. `/nao-existe-esta-pagina` a 390×844
 *     com o JS desligado: `<main>` com 844 px, `innerText` vazio, zero `<h1>`,
 *     e a palavra «404» ausente do que se via. Barra em cima, rodapé em baixo,
 *     um ecrã inteiro de nada pelo meio.
 *
 *     A razão está na documentação do Next (loading.md, «Status Codes»): a
 *     resposta vai em streaming — o `loading.tsx` do grupo (site) é uma
 *     fronteira `<Suspense>` —, e um `notFound()` atirado DENTRO da fronteira
 *     não deixa HTML nenhum atrás de si. Medido no HTML servido, a gaveta do
 *     React vinha vazia (`<div hidden=""><!--$--><!--/$--></div>`) e sem o
 *     `id="S:0"` de que a regra de `globals.css` precisa para a revelar a quem
 *     não tem JavaScript. O texto do `NotFoundView` só existia dentro do
 *     payload RSC, num `<script>` — não havia nada para revelar.
 *
 *  2. O `<title>` ERA O DA PÁGINA INICIAL («Decoração de Casamentos e Eventos
 *     | Líquen Events»), porque o cabeçalho já tinha sido despachado quando o
 *     `notFound()` rebentou. O `title: "404 | Líquen Events"` do
 *     `not-found.tsx` nunca chegava ao documento — e uma ligação partida
 *     partilhada numa conversa pré-visualizava como se fosse a página inicial.
 *
 *  3. SAÍAM DOIS `<meta name="robots">` CONTRADITÓRIOS: primeiro o
 *     `index, follow` do sítio, e só depois o `noindex` que o Next injecta
 *     como rede de segurança. O `robots: { index: false, follow: false }` que
 *     o `not-found.tsx` declara nunca ganhava o primeiro lugar.
 *
 * A SAÍDA é deixar de atirar e passar a DESENHAR: o `NotFoundView` é o
 * conteúdo desta rota, como o de qualquer outra página. Assim o cabeçalho sai
 * dos metadados DESTA rota (título certo, um só `robots`, e esse a dizer
 * `noindex`) e o corpo é HTML de servidor a sério, que se lê sem JavaScript.
 *
 * O ESTADO HTTP CONTINUA A SER 200, e é preciso dizê-lo por extenso porque o
 * comentário antigo afirmava o contrário: já era 200 antes desta mudança
 * (medido), pela mesma razão de streaming que a documentação explica — «the
 * status code of the response cannot be updated». O que o Next põe nesse caso
 * para o 200 não custar indexação é precisamente o `noindex`, e é ele que esta
 * rota passa a declarar de sua conta, sem contradição. Devolver mesmo um 404
 * exige verificar a rota no `proxy`, antes de a resposta começar a correr — é
 * o que a documentação aponta, e fica por fazer.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return {
    // Sem « | Líquen Events» à mão: o layout de raiz tem o molde
    // `template: "%s | Líquen Events"`, e escrevê-lo aqui dava-lhe a marca
    // duas vezes («Página não encontrada | Líquen Events | Líquen Events»).
    title: t.errors.notFoundEyebrow,
    // Um endereço que não existe não se indexa — e agora é esta a ÚNICA
    // etiqueta `robots` do documento, em vez de ser a segunda de duas a
    // dizerem o contrário uma da outra.
    robots: { index: false, follow: false },
  };
}

export default function CaminhoInexistente() {
  // Sem `async` e sem `await`: esta rota não espera por nada, para não ser ela
  // a abrir a fronteira de streaming que estragava o cabeçalho.
  return <NotFoundView />;
}
