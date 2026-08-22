"use client";

import { useEffect, useRef } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GESTO DE VOLTAR FECHA O QUE ESTÁ ABERTO — E NÃO O BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do registo do audit, e é o primeiro dos oito bloqueios:
 *
 *   «Zero `pushState`/`popstate` em todo o `src/` fora da galeria pública. As
 *   vistas, a gaveta do pedido, os separadores, os sete passos do estúdio e
 *   catorze modais são todos `useState`. No iPhone, deslizar da esquerda **é**
 *   o botão de voltar — portanto isto acontece por acidente, a qualquer
 *   profundidade, e o guarda que devia perguntar "tens alterações por gravar"
 *   nunca chega a correr.»
 *
 * Num telemóvel, «voltar» não é um botão que se escolhe carregar: é o gesto
 * com que se sai de tudo, feito com o polegar da mão que segura o aparelho, e
 * faz-se sem pensar. Numa quinta, com o telemóvel numa mão e uma caixa de
 * flores na outra, faz-se por acidente. Se não houver nada empilhado na
 * história, o Safari sai da aplicação — e o que estava aberto por cima (uma
 * folha, uma gaveta, um diálogo) desaparece com ela, junto com o que lá estava
 * escrito.
 *
 * ── UMA ENTRADA POR CAMADA ABERTA ─────────────────────────────────────────
 *
 * Cada camada que abre empurra uma entrada na história do navegador. O gesto de
 * voltar consome essa entrada, o `popstate` chega aqui, e o que se fecha é a
 * camada — que é exactamente o que a pessoa quis dizer com o gesto.
 *
 * Fechar pelo botão «×» faz o contrário: tira a entrada da história
 * (`history.back()`), para que a história não fique com um degrau a mais. Sem
 * isso, fechar cinco folhas pelo botão deixava cinco entradas mortas, e o gesto
 * de voltar passava a precisar de cinco repetições para sair de facto do ecrã.
 *
 * ── O ERRO CLÁSSICO, E COMO É QUE AQUI SE EVITA ───────────────────────────
 *
 * O `history.back()` que a camada de cima faz ao fechar-se dispara um
 * `popstate` — e as camadas ABAIXO dela também o ouvem. Sem defesa, fechar uma
 * folha pelo botão fechava também a gaveta que estava por baixo, e depois a
 * vista por baixo dessa: um toque no «×» desmontava o ecrã inteiro.
 *
 * A primeira defesa que se escreve para isto é uma bandeira — «fui eu que pedi
 * este `back()`, ignorem» — baixada num temporizador. **Não serve**, e vale a
 * pena dizer porquê: o `popstate` de um `back()` é ASSÍNCRONO, e o momento em
 * que chega não é o momento em que o temporizador dispara. Numa página
 * carregada, com o fio principal ocupado, a bandeira baixa primeiro e o
 * `popstate` chega a seguir — e o que se lê é o ecrã a desmontar-se sozinho, de
 * vez em quando, sem se conseguir reproduzir.
 *
 * A defesa que serve não tem relógio nenhum: cada camada empurra a sua entrada
 * com um NÚMERO, e ao ouvir um `popstate` pergunta se a SUA entrada ainda lá
 * está. Se a história ficou num número menor do que o dela, a entrada dela foi
 * consumida e é ela que fecha; se ficou no número dela ou maior, o que se
 * consumiu foi de outra camada e esta não tem nada a ver com isso.
 *
 * Repare-se no que isto resolve de graça: fechar a de cima pelo botão e fechar
 * a de cima pelo gesto deixam a história EXACTAMENTE no mesmo estado — e as duas
 * situações passam a ter a mesma resposta certa sem se distinguirem uma da
 * outra. Não há caso especial nenhum para acertar.
 */

/**
 * O número da próxima camada. Cresce e não volta atrás.
 *
 * Módulo e não `ref`: a pergunta é sobre a JANELA, e duas camadas abertas
 * partilham uma história só. É o valor que as ordena.
 */
let proximaCamada = 1;

/** A marca que distingue as nossas entradas de qualquer outra da aplicação. */
export const MARCA_DA_CAMADA = "liquenCamada";

/** Em que camada é que a história está agora. Fora das nossas, é o chão. */
function camadaActual(): number {
  if (typeof window === "undefined") return 0;
  const n = (window.history.state as Record<string, unknown> | null)?.[MARCA_DA_CAMADA];
  return typeof n === "number" ? n : 0;
}

/**
 * Enquanto `aberta` for verdade, o gesto de voltar fecha esta camada.
 *
 * `fechar` é lido de uma `ref`: uma função nova a cada desenho — que é o caso
 * normal (`() => setAberto(false)`) — não pode desmontar e voltar a montar a
 * entrada da história a cada tecla escrita lá dentro.
 */
export function useCamadaDeHistoria(aberta: boolean, fechar: () => void): void {
  const fecharRef = useRef(fechar);
  const abertaRef = useRef(aberta);
  useEffect(() => {
    fecharRef.current = fechar;
    abertaRef.current = aberta;
  });

  useEffect(() => {
    if (!aberta || typeof window === "undefined") return;

    /** O número da entrada desta camada. Muda se a camada se rearmar — ver abaixo. */
    let minha = proximaCamada;
    proximaCamada += 1;
    window.history.pushState({ [MARCA_DA_CAMADA]: minha }, "");

    /** A nossa entrada já foi consumida? Então não há nada para tirar. */
    let consumida = false;
    let vivo = true;

    const aoVoltar = () => {
      // A minha entrada ainda lá está: o que se consumiu foi de outra camada.
      if (camadaActual() >= minha) return;
      consumida = true;
      fecharRef.current();

      /* ── E SE A CAMADA RECUSAR FECHAR-SE ────────────────────────────────
         A gaveta de um pedido pergunta «tem alterações por guardar; descartar?»
         antes de fechar, e quem responder «não» fica com ela aberta. A entrada
         da história já foi consumida pelo gesto — e sem isto a camada ficava
         aberta SEM entrada: o deslizar seguinte saía do back office, que é
         exactamente o defeito que este gancho veio fechar, agora só a partir do
         segundo gesto e por isso ainda mais difícil de ver.

         A pergunta faz-se numa tarefa seguinte porque a resposta do guarda pode
         mudar o estado, e o estado só chega à `ref` depois de o React desenhar. */
      setTimeout(() => {
        if (!vivo || !abertaRef.current) return;
        minha = proximaCamada;
        proximaCamada += 1;
        consumida = false;
        window.history.pushState({ [MARCA_DA_CAMADA]: minha }, "");
      }, 0);
    };
    window.addEventListener("popstate", aoVoltar);

    return () => {
      vivo = false;
      // A ordem importa: sair da escuta ANTES de pedir o `back()`, senão esta
      // camada ouvia o seu próprio fecho.
      window.removeEventListener("popstate", aoVoltar);
      if (!consumida && camadaActual() >= minha) window.history.back();
    };
  }, [aberta]);
}
