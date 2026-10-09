"use client";
import { useEffect, useState } from "react";

/**
 * Os pixéis do ORIGINAL de uma fotografia, medidos no navegador.
 *
 * A miniatura do estúdio diz a forma, mas não o tamanho — tem sempre 400 px.
 * Para a capa o tamanho conta: o desenho novo estica-a à folha inteira, e uma
 * fotografia pequena ali vê-se o grão (`regra-da-capa.ts`). É UMA fotografia,
 * por isso pedir o original vale a ida.
 *
 * Até se saber, devolve `null` — e quem avisa não avisa: não saber é não saber.
 */
export function useTamanhoDoOriginal(url: string | undefined): { w: number; h: number } | null {
  const [medido, setMedido] = useState<{ url: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      if (vivo && img.naturalWidth > 0) {
        setMedido({ url, w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.src = url;
    return () => {
      vivo = false;
      img.onload = null;
    };
  }, [url]);
  return medido && medido.url === url ? medido : null;
}
