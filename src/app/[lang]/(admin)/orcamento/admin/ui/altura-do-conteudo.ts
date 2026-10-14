import { useEffect, useLayoutEffect, type RefObject } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA CAIXA QUE CRESCE COM O TEXTO — MEDIDA SÓ QUANDO SE VÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A 14/10 ela mandou uma fotografia dos Serviços com as caixas espremidas: o
 * texto cortado a meio da letra, numa faixa de meia linha. As quatro caixas
 * que crescem com o texto (os serviços, as caixas em inglês, as notas internas
 * e a descrição das escolhas) mediam-se quando o texto mudava — e se nesse
 * momento a caixa estava ESCONDIDA (uma secção fechada, outro passo, outra
 * vista do back office), o browser responde «zero» a todas as medidas. A
 * altura ficava escrita a zero e não voltava a ser medida quando a caixa
 * aparecia, porque o texto não tinha mudado.
 *
 * Agora: uma caixa escondida não se mede (fica com a altura natural de uma
 * linha), e mede-se outra vez quando a LARGURA muda — que é o que acontece
 * quando aparece (de 0 para a largura dela) e quando o ecrã muda de tamanho
 * e o texto passa a ocupar outro número de linhas.
 */
export function useAlturaDoConteudo(
  ref: RefObject<HTMLTextAreaElement | null>,
  valor: unknown,
  opcoes: { maximo?: number; vaziaSemAltura?: boolean } = {},
): void {
  const { maximo, vaziaSemAltura = false } = opcoes;

  const medir = () => {
    const el = ref.current;
    if (!el) return;
    // Escondida (nenhuma caixa desenhada): qualquer medida seria zero.
    if (el.getClientRects().length === 0) return;
    // Vazia, o `placeholder` conta para o `scrollHeight` no Chrome (ver a
    // descrição das escolhas, no estúdio): sem altura escrita, manda o `rows`.
    if (vaziaSemAltura && el.value === "") {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    // `scrollHeight` conta o conteúdo e o `padding`, e NÃO a borda; com o
    // `box-sizing: border-box`, somam-se as bordas (`offsetHeight - clientHeight`).
    const altura = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    el.style.height = `${maximo ? Math.min(altura, maximo) : altura}px`;
  };

  // Depois de o texto estar no nó e antes de o browser pintar: com um
  // `useEffect` a caixa aparecia com uma linha e saltava à frente de quem escreve.
  useLayoutEffect(medir, [valor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let largura = el.getBoundingClientRect().width;
    const observador = new ResizeObserver(() => {
      const agora = el.getBoundingClientRect().width;
      // Só a LARGURA: a altura muda porque nós a mudamos, e medir por isso
      // era um ciclo sem fim.
      if (agora === largura) return;
      largura = agora;
      medir();
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
