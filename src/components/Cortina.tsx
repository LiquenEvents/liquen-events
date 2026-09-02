import { getDictionary, type Locale } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CORTINA — O QUE O CASAL VÊ ENQUANTO A PROPOSTA VEM A CAMINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com o CSS de referência ao lado: «eu quero fazer isto quando
 * a pessoa carrega na proposta online a partir do email mas adaptada à
 * Líquen». E a leitura dela do efeito, que é a parte que interessa: «o truque
 * não é o fade — é a frase estar partida em grupos de palavras, cada um a
 * subir de uma distância diferente. Isso cria uma leve profundidade em camadas
 * que um fade único não dá».
 *
 * ── QUANTO TEMPO ELA FICA, E PORQUE É QUE ISSO MUDOU ─────────────────────
 *
 * A primeira versão desta cortina estava construída para uma proposta rápida
 * NUNCA a chegar a mostrar: nascia invisível, só começava a aparecer aos 140 ms,
 * e levantava-se assim que o documento estivesse lido. Zero atraso, sempre.
 *
 * E funcionou bem de mais. Ela abriu a proposta no telemóvel e disse: «não me
 * aparece aquela animação». Não era uma avaria — era o desenho a fazer
 * exactamente o que lhe tinham mandado fazer. Numa ligação boa a página chega
 * antes dos 140 ms e a cortina levantava-se sem nunca ter sido pintada.
 *
 * Mas uma peça de marca que só se vê quando a rede está má não é uma peça de
 * marca: é um ecrã de avaria bonito. Posta a escolha, ela escolheu vê-la
 * sempre.
 *
 * Portanto agora a cortina tem um MÍNIMO: fica no ecrã ~1 s (o `MIN` do
 * guião), dos quais ~600 ms com a frase completamente legível — que é o tempo
 * que ela própria descreveu no que me mandou. Antes disso não sai, mesmo que a
 * proposta já esteja pronta.
 *
 * ── O QUE ISTO CUSTA, DITO SEM ROUPA ─────────────────────────────────────
 *
 * Numa ligação boa, a proposta passa a aparecer 0,6 a 0,8 s mais tarde do que
 * apareceria. Isso é um atraso, e o briefing dela diz «nenhuma animação pode
 * atrasar uma tarefa».
 *
 * Fica escrito aqui que a regra foi afastada A PEDIDO, com o custo em cima da
 * mesa, e não por distracção de quem escreveu isto. Quem vier a seguir e achar
 * que encontrou um atraso por corrigir: não encontrou. Encontrou uma decisão.
 *
 * O que NÃO mudou, e não pode mudar:
 *
 *  • O mínimo é um CHÃO, não uma espera fixa. Se a proposta demorar 3 s, a
 *    cortina sai aos 3 s — não aos 3 s mais um segundo. Ela cobre o tempo que
 *    a página demora e só acrescenta alguma coisa quando a página é mais
 *    rápida do que a frase.
 *
 *  • É UM segundo, e não os 2 s do exemplo. Dois segundos depois de já se ter
 *    carregado no botão lêem-se como «não funcionou», e isso não é marca
 *    nenhuma.
 *
 * ── E NUNCA, NUNCA PRENDE NINGUÉM ─────────────────────────────────────────
 *
 * Uma cortina que dependa de JavaScript para sair é uma maneira de deixar um
 * casal a olhar para um ecrã preto com a proposta por baixo. Portanto tem duas
 * saídas independentes:
 *
 *  1. O guião aqui em baixo, que a levanta assim que o documento está lido.
 *  2. Uma animação de CSS que a levanta aos 3,5 s **sem JavaScript nenhum** —
 *     bloqueado, falhado, desligado, é igual. O CSS não precisa de ninguém.
 *
 * Se a segunda disparar primeiro (guião bloqueado), a cortina sai à mesma e
 * remove-se no `animationend`. Se a primeira disparar depois disso, encontra o
 * elemento já fora do documento e não faz nada — nunca uma segunda subida a
 * piscar no ecrã.
 *
 * ── QUEM PEDIU MENOS MOVIMENTO NÃO LEVA CORTINA ───────────────────────────
 *
 * Com `prefers-reduced-motion: reduce` isto é `display: none`. Não é uma
 * versão mais calma: é nenhuma. O ecrã de espera que já existe (`loading.tsx`)
 * continua a dizer que algo está a acontecer, que é a regra dela — «nunca um
 * estado de espera sem nome» —, e quem pediu menos movimento não recebe uma
 * cortina a deslizar por cima da proposta.
 *
 * ── SÓ `transform` E `opacity` ────────────────────────────────────────────
 *
 * O CSS de referência anima também a `color` (de `transparent` para branco a
 * 35%), para o texto «materializar-se» em vez de simplesmente aparecer. O
 * efeito mantém-se; o meio muda. `color` é pintura, e a regra desta casa são
 * 60 fps num iPhone em 4G — «só `transform` e `opacity`». A opacidade a subir
 * ao longo dos primeiros 35% dá exactamente a mesma leitura e corre no
 * compositor, sem repintar texto a cada fotograma.
 *
 * ── A FRASE É A DELA, E JÁ ESTAVA ESCRITA ─────────────────────────────────
 *
 * «Decoramos eventos, / eternizamos memórias.» — o lema da Líquen, o mesmo do
 * rodapé do sítio e o mesmo que já vai impresso na contracapa do PDF
 * (`proposal-doc-pdf.ts`). Vem do dicionário, portanto um casal inglês lê «We
 * decorate events, / we make memories last.» e não português.
 *
 * Não inventei uma frase nova: um casal que abre a proposta e depois vê o
 * sítio tem de encontrar a MESMA casa. E o lema já vem partido no sítio certo
 * — a vírgula —, que é onde a frase respira. São dois degraus e não três
 * porque a frase dela tem duas partes; forçar um terceiro obrigava a cortar
 * «eternizamos memórias» ao meio, e o degrau não vale uma frase partida.
 */

/**
 * O guião que levanta a cortina. Exportado por uma razão: para haver um teste
 * que o CORRE, e não apenas um que lhe lê a letra.
 *
 * Lê-se assim, por ordem:
 *
 *  • Agarra o elemento anterior a si próprio (`currentScript` corre durante a
 *    leitura do documento, portanto o irmão de cima é a cortina) e confirma
 *    que é mesmo ela antes de lhe tocar.
 *  • Fica à espera do `animationend`: quando a subida acabar — venha ela do
 *    guião ou da rede de segurança do CSS —, o elemento sai do documento.
 *  • `sair()` não faz nada se a cortina já não estiver no documento. É o que
 *    impede uma segunda subida a piscar no ecrã quando o CSS levantou a
 *    cortina aos 4 s e o documento só ficou lido depois.
 *  • E, se ainda não passou o mínimo, `sair()` REMARCA-SE para o que falta em
 *    vez de sair. É por isso que o `setTimeout` existe aqui, e é a única coisa
 *    neste ficheiro que acrescenta tempo — de propósito, e a pedido dela.
 *
 * O `MIN` é o tempo TOTAL no ecrã, contado desde que este guião corre — que é
 * durante a leitura do documento, praticamente no primeiro instante em que a
 * cortina existe. Não é somado ao carregamento: é comparado com ele.
 */
export const GUIAO = `(function(){var c=document.currentScript.previousElementSibling;if(!c||!c.classList.contains("cortina"))return;var t0=Date.now();var MIN=+(c.getAttribute("data-minimo")||1000);var raiz=document.documentElement;var scrollAntes=raiz.style.overflow;var fora=function(){c.classList.add("cortina--fora");raiz.style.overflow=scrollAntes};if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches){fora();return}var chave=c.getAttribute("data-sessao");if(chave){try{if(sessionStorage.getItem(chave)){fora();return}sessionStorage.setItem(chave,"1")}catch(e){}}raiz.style.overflow="hidden";c.addEventListener("animationend",function(e){if(!e||e.animationName==="cortina-a-subir"||e.animationName==="cortina-a-subir-ja")fora()});addEventListener("pageshow",function(e){if(e&&e.persisted)fora()});var sair=function(){if(c.classList.contains("cortina--fora")||c.classList.contains("cortina--a-sair"))return;var falta=MIN-(Date.now()-t0);if(falta>0){setTimeout(sair,falta);return}c.classList.add("cortina--a-sair");setTimeout(fora,1000)};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",sair,{once:true})}else{sair()}})();`;

/** Os degraus: cada grupo sobe de mais longe e sai pelo mesmo, ao contrário. */
const DEGRAUS = ["14px", "28px"] as const;
/** O desencontro entre grupos. O segundo arranca um piscar depois do primeiro. */
const ATRASOS = ["0ms", "60ms"] as const;

/**
 * Quanto tempo a cortina fica no ecrã, no mínimo.
 *
 * ~400 ms a subir mais ~600 ms com a frase legível — o tempo que ela
 * descreveu. Duas linhas para LER pedem-no, e é o mesmo em todo o lado,
 * porque em todo o lado é a mesma frase.
 */
const MINIMO = 1000;

export function Cortina({
  locale,
  chaveDeSessao,
}: {
  locale: Locale;
  /**
   * Quando presente, esta cortina só se vê UMA VEZ por sessão do separador.
   *
   * Existe para o back office e não para a proposta, e a diferença é de quem
   * está do outro lado. Um casal abre a proposta uma vez, talvez duas — cada
   * vez é a primeira impressão de um estúdio. Ela abre e recarrega o back
   * office dezenas de vezes por dia, e um segundo de cortina a cada vez é um
   * imposto sobre o trabalho dela, não uma marca.
   *
   * Guardado no `sessionStorage`, ou seja: uma vez por separador, e esquecido
   * quando ela o fecha. Numa janela privada o acesso pode rebentar — daí o
   * `try` no guião —, e nesse caso vê-se sempre, que é o lado certo de falhar.
   */
  chaveDeSessao?: string;
}) {
  const t = getDictionary(locale);
  const grupos = [t.footer.sloganLine1, t.footer.sloganLine2];

  return (
    <>
      <div
        className="cortina"
        data-sessao={chaveDeSessao}
        data-minimo={MINIMO}
        /**
         * ── PORQUE É QUE ISTO PRECISA DE EXISTIR ──────────────────────────
         *
         * O guião corre durante a leitura do documento, ANTES da hidratação, e
         * o seu trabalho é mudar a classe deste elemento. Quando o React chega,
         * encontra uma classe que não foi ele a escrever, e queixa-se:
         *
         *     A tree hydrated but some attributes of the server rendered HTML
         *     didn't match the client properties. This won't be patched up.
         *
         * Não é um aviso a apanhar um defeito — é um aviso a apanhar uma coisa
         * que se faz DE PROPÓSITO, e que o próprio React diz que não vai
         * desfazer («won't be patched up»). É o mesmo padrão dos guiões de tema
         * que escolhem claro ou escuro antes do primeiro pixel, e a mesma
         * resposta que a documentação do React dá para eles.
         *
         * ── COMO É QUE ISTO APARECEU ──────────────────────────────────────
         *
         * Não apareceu a olho: apareceu no E2E, e só depois de a cortina
         * chegar ao back office com a `chaveDeSessao`. É preciso uma SEGUNDA
         * entrada no mesmo separador para o guião esconder a cortina já no
         * primeiro instante — e é aí que a classe do servidor e a do React
         * deixam de bater certo. A primeira entrada nunca falha.
         *
         * Reproduzido com `next dev` (o React só é explícito em
         * desenvolvimento): 1.ª entrada limpa, 2.ª e 3.ª com o erro.
         *
         * O `suppressHydrationWarning` vale só para ESTE elemento e só para os
         * seus atributos e texto — não cala nada mais na página.
         */
        suppressHydrationWarning
        /**
         * Escondida de quem ouve o ecrã, e de propósito.
         *
         * O `aria-busy` do `loading.tsx` já diz «isto está a carregar», e
         * di-lo na língua do leitor de ecrã. Anunciar por cima disso o lema do
         * estúdio seria ler publicidade a alguém que está à espera da
         * proposta. A cortina é para os olhos; a espera já tem nome.
         */
        /**
         * Escondida de quem ouve o ecrã, e de propósito.
         *
         * Onde ela aparece há sempre, por baixo, quem já nomeia a espera: o
         * `aria-busy` do `loading.tsx` na proposta, e no sítio a própria página,
         * que chega inteira. Anunciar por cima disso o lema do estúdio seria
         * ler publicidade a quem está à espera. A cortina é para os olhos.
         */
        aria-hidden="true"
      >
        <p className="cortina__lema">
          {grupos.map((grupo, i) => (
            <span
              key={i}
              style={{ "--degrau": DEGRAUS[i], animationDelay: ATRASOS[i] } as React.CSSProperties}
            >
              {grupo}
            </span>
          ))}
        </p>
      </div>
      {/*
        O guião vai INLINE e a seguir ao elemento, de propósito: corre durante a
        leitura do documento, muito antes de qualquer hidratação, que é quando
        isto tem de estar a postos. Um componente de cliente só ganhava vida
        depois de o JavaScript da página chegar — tarde de mais para uma peça
        cujo trabalho é justamente cobrir o tempo até lá.

        O `unsafe-inline` do `script-src` já está declarado no `next.config.ts`,
        com a medição ao lado; isto não abre nada de novo.
      */}
      <script dangerouslySetInnerHTML={{ __html: GUIAO }} />
    </>
  );
}
