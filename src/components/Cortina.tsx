import { Fragment } from "react";

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
 * ── VÊ-SE SEMPRE, E «SEMPRE» QUER DIZER TRÊS COISAS ───────────────────────
 *
 * Palavras dela: «abri o sítio e apareceu, mas depois saí e voltei a entrar e
 * já não aparecia. Ou fiz refresh e já não aparece. Eu quero que apareça
 * sempre — ou quando faço refresh, ou quando volto atrás e volto a entrar».
 *
 * Tinha razão, e a culpa era de uma correcção minha. Quando ela se queixou de
 * que voltar para trás no browser deixava isto «um bocado coiso», eu travei a
 * cortina a UMA VEZ POR SEPARADOR. Resolveu o Voltar e apanhou junto o refresh
 * e a re-entrada — um remédio largo de mais para a doença.
 *
 * Sai a trava do sítio e da proposta. Fica no back office, e só lá, porque ali
 * a razão é outra e continua de pé: ela recarrega o painel dezenas de vezes por
 * dia, e 2,2 s a cada vez é um imposto sobre o trabalho dela.
 *
 * Mas tirar a trava não chega, porque «não aparecer» tinha TRÊS causas e só uma
 * era ela:
 *
 *  1. **O refresh e a re-entrada** — a trava. Sai.
 *
 *  2. **VOLTAR PELO HISTÓRICO.** O documento é restaurado inteiro e este guião
 *     NÃO volta a correr (`document.currentScript` só existe durante a
 *     leitura). O que corre é o ouvinte de `pageshow`, que ficou vivo dentro do
 *     documento congelado — e que até aqui fechava a cortina. Passa a
 *     RECOMEÇÁ-LA: tira as classes de saída, congela a animação por um cálculo
 *     de estilo (é a única maneira de uma animação de CSS voltar ao princípio),
 *     e larga-a outra vez. Onde há chave de sessão — o back office — continua a
 *     fechar, que é o que lá faz sentido.
 *
 *  3. **O PRÉ-CARREGAMENTO, que ninguém podia adivinhar.** O sítio manda o
 *     navegador desenhar a página seguinte em segredo mal o dedo se aproxima de
 *     uma ligação (`SpeculationRules.tsx`) — é o que a faz abrir instantânea. Só
 *     que esse documento invisível corre os guiões todos: a cortina fazia lá a
 *     animação inteira, para ninguém, e chegava ao ecrã já gasta. Com a trava
 *     de sessão era pior ainda — o pré-carregamento GASTAVA a chave, e nem um
 *     separador novo a salvava.
 *
 *     A casa já tinha a resposta noutro sítio: o `PlausibleTracker` não conta
 *     uma visita que ainda não aconteceu, e faz isso com `document.prerendering`
 *     e o evento `prerenderingchange`. É o mesmo idioma aqui.
 *
 * ── E NÃO TRANCA O SCROLL ─────────────────────────────────────────────────
 *
 * Trancava. `document.documentElement.style.overflow = "hidden"` enquanto ela
 * estivesse no ecrã, para não se poder arrastar uma página que não se vê.
 *
 * O defeito apareceu quando a cortina passou a durar 2200 ms em vez de 1000:
 * um teste da galeria que desce dois ecrãs e conta as fotografias carregadas
 * passou a encontrar três em vez de quatro. Não era o teste — era que o gesto
 * dele deixou de fazer efeito, porque chegava dentro da tranca. E o que um
 * teste faz ali é o que uma pessoa faz: chegar ao sítio e arrastar para baixo.
 *
 * Uma tranca que engole um gesto não protege ninguém; devolve silêncio a quem
 * pediu alguma coisa, que é precisamente o que o briefing proíbe. Portanto sai.
 *
 * O que fica no lugar é `touch-action: pan-y` na cortina (ver o `globals.css`):
 * o dedo passa a arrastar a página POR BAIXO dela, e o toque continua a ser
 * intercetado — ninguém carrega às cegas num botão que não vê. Quem arrasta
 * durante a cortina fica onde pediu para ficar quando ela sobe.
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
export const GUIAO = `(function(){var c=document.currentScript.previousElementSibling;if(!c||!c.classList.contains("cortina"))return;var t0=Date.now();var MIN=+(c.getAttribute("data-minimo")||1000);var raiz=document.documentElement;var fora=function(){c.classList.add("cortina--fora");raiz.setAttribute("data-cortina","fora")};if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches){fora();return}var chave=c.getAttribute("data-sessao");if(chave){try{if(sessionStorage.getItem(chave)){fora();return}sessionStorage.setItem(chave,"1")}catch(e){}}c.addEventListener("animationend",function(e){if(!e||e.animationName==="cortina-a-subir"||e.animationName==="cortina-a-subir-ja")fora()});var sair=function(){if(c.classList.contains("cortina--fora")||c.classList.contains("cortina--a-sair"))return;var falta=MIN-(Date.now()-t0);if(falta>0){setTimeout(sair,falta);return}c.classList.add("cortina--a-sair");raiz.setAttribute("data-cortina","a-sair");setTimeout(fora,1000)};var arranca=function(){c.classList.remove("cortina--parada");t0=Date.now();if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",sair,{once:true})}else{sair()}};var recomeca=function(){c.classList.remove("cortina--fora","cortina--a-sair");raiz.removeAttribute("data-cortina");c.classList.add("cortina--parada");void c.offsetWidth;arranca()};addEventListener("pageshow",function(e){if(!e||!e.persisted)return;if(chave){fora();return}recomeca()});if(document.prerendering){c.classList.add("cortina--parada");document.addEventListener("prerenderingchange",arranca,{once:true})}else{arranca()}})();`;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FRASE CHEGA LETRA A LETRA — UMAS DE CIMA, OUTRAS DE BAIXO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «a animação está muito depressa e não é a que eu quero. Quero
 * uma animação mais de tipo, as letras deslocam-se, tipo uma cai e a outra
 * entra — e quero que seja mais devagar a entrar».
 *
 * Estava assim: duas LINHAS inteiras, cada uma a subir em bloco, com 60 ms de
 * desencontro entre elas. Dois movimentos, e depressa.
 *
 * Passa a ser uma letra de cada vez, e alternadas: a primeira sobe de baixo, a
 * segunda cai de cima, a terceira sobe outra vez. É literalmente o que ela
 * descreveu — «uma cai e a outra entra» — e é o que faz a frase montar-se à
 * frente de quem olha em vez de aparecer feita.
 *
 * ── O RECORTE É O QUE FAZ ISTO FUNCIONAR ─────────────────────────────────
 *
 * Cada linha corta o que sai dela (`overflow: hidden`), portanto uma letra
 * deslocada de mais do que a sua própria altura está FORA da linha e não se
 * vê. O que se vê é ela a ENTRAR pela borda — de baixo ou de cima —, e não a
 * aparecer do nada, transparente, no sítio onde vai ficar. É a diferença
 * entre uma letra que chega e uma que se revela.
 *
 * ── E PORQUE É QUE AS PALAVRAS CONTINUAM INTEIRAS ─────────────────────────
 *
 * Porque partir a frase em letras parte também as PALAVRAS: um navegador pode
 * mudar de linha entre duas caixas coladas, e `eternizamos memórias.` mede
 * ~252 pt num ecrã de 320 com 32 de respiro de cada lado. Ou seja, está a
 * quatro pontos de quebrar — e quebraria a meio de uma palavra.
 *
 * Daí a camada do meio: linha → palavra → letra. A palavra é uma caixa que não
 * quebra por dentro, e o único sítio por onde a linha pode mudar é o espaço
 * entre duas — que é onde ela já mudava antes de isto existir.
 *
 * ── E CONTINUA A SER SÓ `transform` ──────────────────────────────────────
 *
 * Nenhuma letra mexe na opacidade. São ~39, e 39 opacidades a correr ao mesmo
 * tempo num telemóvel é o que faz uma animação bonita tremer — que foi
 * exactamente a queixa anterior dela.
 */

/** Entre uma letra e a seguinte. */
const ATRASO_POR_LETRA = 24;
/** O que cada letra demora a entrar. */
const DURACAO_DA_LETRA = 700;

/**
 * Quanto tempo a cortina fica no ecrã, no mínimo.
 *
 * A conta, e não um palpite: a frase tem 37 letras em português e 36 em
 * inglês (os espaços não entram na contagem porque não se vêem a entrar). A
 * última arranca aos 36 × 24 = 864 ms e demora 700 a chegar — ou seja, a frase
 * só está COMPLETA aos ~1,57 s. Abaixo disso a cortina saía a meio da própria
 * animação, que é o defeito que ela apanhou à vista desarmada.
 *
 * 2200 dá ~630 ms com a frase inteira parada e legível depois de montada, que
 * é o tempo que ela descreveu desde o princípio.
 *
 * Era 1000. Ela pediu «mais devagar a entrar», e isto é o dobro — o custo está
 * dito: numa ligação boa, a proposta e o sítio aparecem ~1,2 s mais tarde do
 * que apareciam ontem. Numa lenta não custa nada, porque o mínimo é um chão e
 * não uma espera.
 */
const MINIMO = 2200;

export function Cortina({
  locale,
  chaveDeSessao,
}: {
  locale: Locale;
  /**
   * Quando presente, esta cortina só se vê UMA VEZ por sessão do separador.
   *
   * Existe para o BACK OFFICE, e só para ele. A diferença é de quem está do
   * outro lado: um casal abre a proposta uma vez, talvez duas, e cada vez é a
   * primeira impressão de um estúdio; ela abre e recarrega o painel dezenas de
   * vezes por dia, e 2,2 s de cortina a cada vez é um imposto sobre o trabalho
   * dela, não uma marca.
   *
   * Houve um dia em que o sítio e a proposta também a tinham. Foi um erro meu,
   * e ela apanhou-o: «fiz refresh e já não aparece». O porquê inteiro está no
   * cabeçalho deste ficheiro.
   *
   * Guardado no `sessionStorage`, ou seja: uma vez por separador, e esquecido
   * quando ela o fecha. Numa janela privada o acesso pode rebentar — daí o
   * `try` no guião —, e nesse caso vê-se sempre, que é o lado certo de falhar.
   */
  chaveDeSessao?: string;
}) {
  const t = getDictionary(locale);

  /**
   * A frase, partida em linhas → palavras → letras, com o instante de entrada
   * de cada letra já contado.
   *
   * O contador atravessa as DUAS linhas. Se cada uma recomeçasse do zero, as
   * duas primeiras letras entravam ao mesmo tempo e a frase lia-se como duas
   * frases; a contagem contínua é o que a faz ler-se como uma só.
   *
   * A conta é feita AQUI, no servidor, e não no navegador: o que chega ao
   * telemóvel é HTML já com os tempos escritos, e a animação arranca no
   * primeiro fotograma, sem esperar por JavaScript nenhum.
   */
  let n = 0;
  const linhas = [t.footer.sloganLine1, t.footer.sloganLine2].map((linha) =>
    linha.split(" ").map((palavra) => [...palavra].map((letra) => ({ letra, indice: n++ }))),
  );

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
         * Onde ela aparece há sempre, por baixo, quem já nomeia a espera: o
         * `aria-busy` do `loading.tsx` na proposta, e no sítio a própria página,
         * que chega inteira. Anunciar por cima disso o lema do estúdio seria
         * ler publicidade a quem está à espera. A cortina é para os olhos.
         */
        aria-hidden="true"
      >
        <p className="cortina__lema">
          {linhas.map((palavras, i) => (
            <span key={i} className="cortina__linha">
              {palavras.map((letras, p) => (
                <Fragment key={p}>
                  {/* O espaço vai FORA da palavra, e é um espaço a sério: é
                      ele, e só ele, que dá à linha um sítio por onde mudar. */}
                  {p > 0 ? " " : null}
                  <span className="cortina__palavra">
                    {letras.map(({ letra, indice }) => (
                      <span
                        key={indice}
                        className="cortina__letra"
                        style={
                          {
                            animationDelay: `${indice * ATRASO_POR_LETRA}ms`,
                            animationDuration: `${DURACAO_DA_LETRA}ms`,
                            /* Uma cai, a seguinte sobe. São as palavras dela:
                               «uma cai e a outra entra». Os 135% são a altura
                               da letra mais o respiro do recorte — abaixo
                               disso via-se-lhe uma fatia antes de entrar. */
                            "--de": indice % 2 === 0 ? "135%" : "-135%",
                          } as React.CSSProperties
                        }
                      >
                        {letra}
                      </span>
                    ))}
                  </span>
                </Fragment>
              ))}
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
