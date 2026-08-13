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
  className,
}: {
  src: string;
  planoB?: string;
  className?: string;
}) {
  const [actual, setActual] = useState(src);
  // Um `src` novo (outra capa escolhida, outra listagem) recomeça do princípio:
  // sem isto, uma imagem que caiu para o original ficava lá presa.
  const [visto, setVisto] = useState(src);
  if (visto !== src) {
    setVisto(src);
    setActual(src);
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={actual}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => {
        if (planoB && actual !== planoB) setActual(planoB);
      }}
      className={className}
    />
  );
}
