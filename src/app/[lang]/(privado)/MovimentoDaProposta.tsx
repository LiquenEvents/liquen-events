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
 */
export const GUIAO_DO_MOVIMENTO = `(function(){
try{
if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
if(!("IntersectionObserver" in window))return;
var arranca=function(){
var els=document.querySelectorAll("[data-sobe]");
if(!els.length)return;
var obs=new IntersectionObserver(function(es){
for(var i=0;i<es.length;i++){if(es[i].isIntersecting){es[i].target.classList.add("subiu");obs.unobserve(es[i].target)}}
},{rootMargin:"0px 0px -12% 0px"});
var dobra=window.innerHeight*0.9;
for(var i=0;i<els.length;i++){
if(els[i].getBoundingClientRect().top>dobra){els[i].classList.add("por-subir");obs.observe(els[i])}}
};
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",arranca,{once:true})}else{arranca()}
}catch(e){}
})();`;
