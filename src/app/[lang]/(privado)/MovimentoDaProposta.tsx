/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE PÕE A PROPOSTA A MEXER — E O QUE O IMPEDE DE A APAGAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações pelo PDF todo, nas fotos, nos textos — quero
 * que aquilo fique espetacularmente bom».
 *
 * O documento já tinha um mecanismo (`prop-chega`, no `globals.css`) e ele
 * estava em UM elemento só — e depende do `animation-timeline: view()`, que é
 * recente. Num Safari mais antigo não corre nada. Este funciona em todo o
 * lado.
 *
 * ── A REGRA QUE MANDA EM TUDO ────────────────────────────────────────────
 *
 * O estado escondido NÃO EXISTE até este guião o pôr, elemento a elemento.
 * Sem JavaScript, com um erro aqui, sem `IntersectionObserver`: nenhum
 * elemento leva `por-subir`, nada sai do sítio, e o casal lê a proposta
 * inteira. É o padrão que a casa já usa nos logótipos dos clientes.
 *
 * O contrário — esconder tudo e revelar com JavaScript — é a maneira de
 * servir um documento de vinte mil euros em branco. Não se faz.
 *
 * ── E PORQUE É QUE SÓ ARMA O QUE AINDA NÃO SE VÊ ─────────────────────────
 *
 * Porque armar um elemento que JÁ está no ecrã fá-lo saltar para baixo e
 * subir outra vez, à frente de quem está a olhar. O guião mede cada um: o que
 * está abaixo da dobra é armado e fica à espera da sua vez; o que já está à
 * vista fica exactamente onde está.
 *
 * ── SÓ `transform`, E NUNCA A OPACIDADE ──────────────────────────────────
 *
 * A regra dos 60 fps num iPhone em 4G. E há uma segunda razão, específica
 * desta página: as fotografias têm um borrão de pré-visualização por baixo,
 * que é a chegada delas. Uma rampa de opacidade por cima esconderia
 * precisamente o que ele existe para mostrar.
 */
export function MovimentoDaProposta() {
  return <script dangerouslySetInnerHTML={{ __html: GUIAO_DO_MOVIMENTO }} />;
}

/**
 * ── E PORQUE É QUE ELE ESPERA PELO FOTOGRAMA EM QUE HÁ ALGO PARA MEDIR ────
 *
 * Isto corria UMA vez, no `DOMContentLoaded`, e não armava nada — nunca, em
 * visita nenhuma. A razão está no cabeçalho do `(privado)/layout.tsx`, que já
 * a dizia sem que ninguém ligasse os pontos: o documento do casal «sai num
 * jacto POSTERIOR ao deste layout». O guião vem no primeiro jacto; a proposta
 * vem no segundo, aterra dentro de um `<div>` com `display: none` e só depois
 * é revelada.
 *
 * MEDIDO num Chromium a 390×844, contra o servidor de PRODUÇÃO, com uma
 * proposta real de 24 fotografias e 34 peças marcadas:
 *
 *     no instante em que o guião media    altura   779 px   tops 0,0,0,0,0,…
 *     depois de a página ser revelada     altura 13 009 px  tops 498,1350,1444,…
 *
 * Com toda a gente em `top: 0` ninguém está abaixo da dobra, portanto
 * armavam-se ZERO de 34. A página crescia a seguir e o guião já tinha
 * corrido. Palavras dela, a olhar para a proposta publicada: «não há
 * animações nenhumas».
 *
 * A espera é um ciclo de fotogramas com fim (300 ≈ 5 s a 60 fps): enquanto
 * TODAS as peças estiverem em altura zero E topo zero — a assinatura exacta
 * de uma árvore que não está a ser desenhada — não há nada a medir e tenta-se
 * outra vez. Ao fim das tentativas desiste, e desistir é seguro por
 * construção: o estado escondido só existe quando este guião o põe, portanto
 * um guião que desiste deixa a proposta exactamente como ela veio do
 * servidor. É a mesma regra de sempre, aplicada ao caso novo.
 *
 * A ordem ler-tudo-antes-de-escrever mantém-se dentro de cada tentativa: a
 * volta que decide se há forma é a MESMA que guarda as caixas, portanto
 * continua a haver uma leitura e uma escrita, e não 34 de cada.
 */
/**
 * Exportado para haver um teste que o CORRE, e não apenas um que lhe lê a
 * letra. Lê-se assim:
 *
 *  • Quem pediu menos movimento não leva nenhum, e sai à primeira linha —
 *    antes de armar seja o que for, portanto nada fica fora do sítio.
 *  • Sem `IntersectionObserver` (um browser antigo de mais), também sai. A
 *    proposta fica parada e legível.
 *  • Arma só o que está abaixo da dobra, e larga cada elemento assim que ele
 *    chega — um observador para a página toda, não um por fotografia.
 *  • A margem negativa de 12% faz o movimento acabar ANTES de o elemento
 *    estar no sítio onde se lê. Uma coisa a mexer-se debaixo do polegar
 *    enquanto se tenta ler não é elegância, é ruído.
 *
 *  • E LÊ TUDO ANTES DE ESCREVER SEJA O QUE FOR. Estava a alternar — medir
 *    um, armá-lo, medir o seguinte — e cada armação invalida o estilo, o que
 *    obriga o browser a recalcular a página antes de responder à medição
 *    seguinte. CONTADO num arnês que instrumenta as duas chamadas: com os 57
 *    elementos que o documento marca hoje, 50 paragens forçadas; com os 65 a
 *    que os grupos de serviços e as fases do cronograma o levam, 58. Duas
 *    voltas em vez de uma: a primeira só mede, a segunda só escreve — zero.
 *
 *    E é seguro por uma razão exacta, não por sorte: o que se escreve é
 *    `transform`, que não mexe no layout de ninguém. Nenhum `top` medido na
 *    primeira volta pode ser alterado pelo que a segunda escreve.
 */
export const GUIAO_DO_MOVIMENTO = `(function(){
try{
if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
if(!("IntersectionObserver" in window))return;
var arranca=function(){
var els=document.querySelectorAll("[data-sobe]");
if(!els.length)return false;
var caixas=[];var temForma=false;
for(var i=0;i<els.length;i++){var c=els[i].getBoundingClientRect();caixas.push(c);if(c.height>0||c.top>0)temForma=true}
if(!temForma)return false;
var obs=new IntersectionObserver(function(es){
for(var i=0;i<es.length;i++){if(es[i].isIntersecting){es[i].target.classList.add("subiu");obs.unobserve(es[i].target)}}
},{rootMargin:"0px 0px -12% 0px"});
var dobra=window.innerHeight*0.9;
var arma=[];
for(var i=0;i<caixas.length;i++){if(caixas[i].top>dobra)arma.push(els[i])}
for(var j=0;j<arma.length;j++){arma[j].classList.add("por-subir");obs.observe(arma[j])}
return true;
};
var restam=300;
var tenta=function(){
if(arranca())return;
if(--restam<=0)return;
requestAnimationFrame(tenta);
};
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",tenta,{once:true})}else{tenta()}
}catch(e){}
})();`;
