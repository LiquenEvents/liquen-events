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
export const GUIAO = `(function(){var c=document.currentScript.previousElementSibling;if(!c||!c.classList.contains("cortina"))return;var t0=Date.now();var MIN=1000;var fim=function(e){if(!e||e.animationName==="cortina-a-subir")c.remove()};c.addEventListener("animationend",fim);var sair=function(){if(!c.isConnected)return;var falta=MIN-(Date.now()-t0);if(falta>0){setTimeout(sair,falta);return}c.classList.add("cortina--a-sair")};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",sair,{once:true})}else{sair()}})();`;

/** Os degraus: cada grupo sobe de mais longe e sai pelo mesmo, ao contrário. */
const DEGRAUS = ["14px", "28px"] as const;
/** O desencontro entre grupos. O segundo arranca um piscar depois do primeiro. */
const ATRASOS = ["0ms", "60ms"] as const;

export function CortinaDaProposta({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).footer;
  const grupos = [t.sloganLine1, t.sloganLine2];

  return (
    <>
      <div
        className="cortina"
        /**
         * Escondida de quem ouve o ecrã, e de propósito.
         *
         * O `aria-busy` do `loading.tsx` já diz «isto está a carregar», e
         * di-lo na língua do leitor de ecrã. Anunciar por cima disso o lema do
         * estúdio seria ler publicidade a alguém que está à espera da
         * proposta. A cortina é para os olhos; a espera já tem nome.
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
