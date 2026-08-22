"use client";

import { useState } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA IMAGEM QUE SABE CAIR PARA O TAMANHO DE CIMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cartão de um tema pede a derivada mais pequena que serve — 96 px para uma
 * tira, 400 px para a capa. A grelha da revisão de etiquetas pede a miniatura.
 * Essas derivadas podem não existir: nascem no carregamento, e as fotos mais
 * antigas (ou migradas em massa) não as têm.
 *
 * O servidor não consegue saber: assinar um caminho no Supabase Storage NÃO
 * verifica que o ficheiro lá está, e devolve um URL bem formado para um objecto
 * inexistente. Quem descobre é o navegador, com um 404, e até aqui o que
 * acontecia a seguir era nada — ficava a célula vazia. Era isto que deixava os
 * cartões cinzentos.
 *
 * `planoB` é o ORIGINAL, o único que veio da listagem da pasta e portanto o
 * único que existe de certeza. Troca-se UMA vez: se o original também falhar,
 * fica o fundo, porque insistir era um ciclo.
 *
 * Vive num ficheiro só para os dois ecrãs que mostram derivadas (a Biblioteca
 * de Temas e a revisão de etiquetas) partilharem o mesmo plano B — duas cópias
 * eram duas oportunidades de só uma delas o ter.
 */
export default function ImagemComPlanoB({
  src,
  planoB,
  lqip,
  className,
}: {
  src: string;
  planoB?: string;
  /**
   * ── O CARTÃO NÃO NASCE CINZENTO ─────────────────────────────────────────
   *
   * Palavras dela: «placeholder blur por foto — acaba o ecrã de cartões
   * cinzentos».
   *
   * São poucas centenas de bytes que VÊM NO HTML, portanto estão pintadas no
   * primeiro fotograma, antes de qualquer ida à rede. A grelha das fotos e o
   * seletor já o faziam; os CARTÕES, que são a primeira coisa que se vê ao
   * abrir a biblioteca, eram os únicos a ficar cinzentos à espera.
   *
   * Fica por BAIXO e não substitui nada: a fotografia a sério assenta por cima
   * quando chegar, com uma passagem de opacidade. Sem `lqip` (as fotos
   * anteriores à migração) fica o fundo neutro de sempre, como antes.
   */
  lqip?: string;
  className?: string;
}) {
  const [actual, setActual] = useState(src);
  const [pintada, setPintada] = useState(false);
  // Um `src` novo (outra capa escolhida, outra listagem) recomeça do princípio:
  // sem isto, uma imagem que caiu para o original ficava lá presa.
  const [visto, setVisto] = useState(src);
  if (visto !== src) {
    setVisto(src);
    setActual(src);
    setPintada(false);
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={actual}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setPintada(true)}
      onError={() => {
        if (planoB && actual !== planoB) setActual(planoB);
        // Se nem o plano B abriu, o borrão fica: é melhor do que um vazio, e é
        // a única coisa que ainda diz de que cor era a fotografia.
        else setPintada(true);
      }}
      /* O borrão vai no FUNDO do próprio `<img>`, e não num irmão por baixo:
         assim herda o `object-cover` e o arredondamento da célula sem precisar
         de saber nada sobre o desenho de quem o usa — e os cartões, a grelha e
         as tiras têm formas diferentes. */
      style={
        lqip
          ? {
              backgroundImage: `url("${lqip}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
      className={`${className ?? ""} ${
        pintada || !lqip ? "opacity-100" : "opacity-0"
      } motion-safe:transition-opacity motion-safe:duration-elemento`}
    />
  );
}
