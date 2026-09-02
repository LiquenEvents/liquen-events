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
 * ── A REGRA QUE ISTO NÃO PODE PARTIR ──────────────────────────────────────
 *
 * Do briefing dela, à letra: «Nenhuma animação pode atrasar uma tarefa». E o
 * pedido desta semana inteira foi «eu quero mesmo que seja logo».
 *
 * O exemplo que ela mandou segura o ecrã 2000 ms fixos e só depois levanta a
 * cortina. Copiado tal e qual, punha dois segundos em cima da página que
 * acabámos de tornar instantânea — e no telemóvel de um casal que já carregou
 * no botão, dois segundos de preto são dois segundos a pensar que não
 * funcionou.
 *
 * Aqui a cortina NUNCA segura nada. Ela dura exactamente o que a página
 * demorar, e nem um milissegundo a mais:
 *
 *  • **Só aparece aos 140 ms.** É um `animation-delay`, não um temporizador.
 *    Se a proposta chega antes disso — e com o trabalho desta semana chega
 *    muitas vezes — a cortina levanta-se sem NUNCA ter sido pintada. O casal
 *    não vê preto nenhum: vê a proposta.
 *
 *  • **Levanta-se quando o documento está lido**, no `DOMContentLoaded`, que
 *    numa página entregue por partes é o instante em que o HTML da proposta
 *    acabou de chegar. Não há espera, não há mínimo, não há 2000 ms.
 *
 * Ou seja: numa ligação boa isto é invisível; numa quinta com 4G fraco — onde
 * a espera existe de qualquer maneira — o casal passa a receber a frase do
 * estúdio em vez de um esqueleto cinzento. Transforma tempo morto em marca,
 * sem criar tempo morto nenhum.
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
 *    cortina aos 3,5 s e o documento só ficou lido depois.
 *  • Se a cortina ainda está invisível (a entrada tem 140 ms de atraso e a
 *    proposta chegou antes), tira-se sem transição nenhuma: animar a saída de
 *    algo que nunca se viu era pintar um piscar de olhos do nada.
 *  • Caso contrário, é a subida — em `transform`, no compositor.
 */
export const GUIAO = `(function(){var c=document.currentScript.previousElementSibling;if(!c||!c.classList.contains("cortina"))return;var fim=function(e){if(!e||e.animationName==="cortina-a-subir")c.remove()};c.addEventListener("animationend",fim);var sair=function(){if(!c.isConnected)return;if(parseFloat(getComputedStyle(c).opacity)<0.02){c.remove();return}c.classList.add("cortina--a-sair")};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",sair,{once:true})}else{sair()}})();`;

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
