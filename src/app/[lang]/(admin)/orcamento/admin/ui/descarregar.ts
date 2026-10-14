"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFimVisivel } from "./EmCurso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DESCARREGAR, DE UMA MANEIRA SÓ — E COM UMA BARRA QUE DIZ A VERDADE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 14/10: «quero melhorar a animação e a rapidez a descarregar
 * qualquer coisa no back office… melhores mesmo muito».
 *
 * A rapidez veio primeiro (#211): o PDF de cada versão desenha-se uma vez, e
 * as rotas passaram a mandar `Content-Length`. Só que nenhum ecrã o lia —
 * todos faziam `res.blob()`, que espera pelo ficheiro inteiro calado. Aqui lê-
 * se o corpo aos pedaços, e cada pedaço avança a barra: com o tamanho sabido,
 * a espera deixa de ser opaca e passa a ser CONTADA («1,2 de 5,1 MB»).
 *
 * Seis sítios descarregavam cada um à sua maneira (o guião, o contrato, a
 * cópia de segurança, a foto, o mapa de mesas, a proposta enviada), e quatro
 * deles sem sinal nenhum. Passam todos por aqui.
 */

export interface Avanco {
  feito: number;
  total: number;
}

/** O nome que a rota pôs no `Content-Disposition` (o `filename*` primeiro). */
export function nomeDoFicheiro(disposicao: string | null): string | null {
  if (!disposicao) return null;
  const estrela = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposicao)?.[1];
  if (estrela) {
    try {
      return decodeURIComponent(estrela.trim().replace(/^"|"$/g, ""));
    } catch {
      /* cai no simples */
    }
  }
  const simples = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(disposicao);
  const nome = (simples?.[2] ?? simples?.[1] ?? "").trim();
  return nome || null;
}

/**
 * A rota respondeu, e disse que não. `daRota` diz se a frase é dela (uma
 * timeline sem horas, um contrato que não existe) ou a genérica desta casa —
 * quem chama pode preferir a sua própria frase genérica.
 */
export class FalhaDaDescarga extends Error {
  constructor(
    message: string,
    readonly daRota: boolean,
    readonly estado: number,
  ) {
    super(message);
    this.name = "FalhaDaDescarga";
  }
}

/** A frase de recusa que a rota escreveu (`{ error }`), ou nada. */
async function recusaDe(res: Response): Promise<string | null> {
  const corpo: unknown = await res.json().catch(() => null);
  const dito = (corpo as { error?: unknown } | null)?.error;
  return typeof dito === "string" && dito ? dito : null;
}

/**
 * Pede o ficheiro e devolve-o inteiro, chamando `aoAvancar` a cada pedaço que
 * chega quando a resposta diz o tamanho. Sem tamanho (ou sem corpo legível
 * aos pedaços) faz o `blob()` de sempre — a barra fica opaca, mas o ficheiro
 * chega igual.
 *
 * Uma resposta que não é 2xx REJEITA com a frase da rota, para quem chama a
 * pôr no ecrã tal e qual (o guião, por exemplo, diz porque é que não há PDF).
 */
export async function descarregar(
  url: string,
  opcoes: { aoAvancar?: (a: Avanco) => void; init?: RequestInit } = {},
): Promise<{ blob: Blob; nome: string | null }> {
  const res = await fetch(url, opcoes.init);
  if (!res.ok) {
    const dito = await recusaDe(res);
    throw new FalhaDaDescarga(
      dito ?? "Não foi possível descarregar. Tenta daqui a bocado.",
      !!dito,
      res.status,
    );
  }
  const nome = nomeDoFicheiro(res.headers.get("Content-Disposition"));
  const total = Number(res.headers.get("Content-Length") ?? "");
  const leitor = total > 0 && opcoes.aoAvancar ? res.body?.getReader() : undefined;
  if (!leitor) return { blob: await res.blob(), nome };

  const tipo = res.headers.get("Content-Type") ?? "application/octet-stream";
  const pedacos: Uint8Array[] = [];
  let feito = 0;
  opcoes.aoAvancar!({ feito, total });
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
    feito += value.byteLength;
    opcoes.aoAvancar!({ feito: Math.min(feito, total), total });
  }
  return { blob: new Blob(pedacos as BlobPart[], { type: tipo }), nome };
}

/**
 * Guarda um blob no disco com o nome dado.
 *
 * O endereço `blob:` só se revoga depois de o browser ter começado a guardar:
 * revogar logo a seguir cancelava a transferência em alguns navegadores.
 */
export function guardarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * O estado de UMA descarga num ecrã, pronto para dar ao `EmCurso`:
 *
 *   const d = useDescarga();
 *   …onClick={() => d.correr(url, "horario.pdf")}
 *   {d.mostrar && <EmCurso titulo="A descarregar o PDF…" pronto="PDF pronto"
 *                   {...d.barra} />}
 *
 * `correr` devolve `true` quando o ficheiro foi guardado e REJEITA com a frase
 * da rota quando não foi — quem chama decide onde a escreve. `obter` faz o
 * mesmo sem guardar (para partilhar o ficheiro, por exemplo).
 */
export function useDescarga() {
  const [aCorrer, setACorrer] = useState(false);
  const [ok, setOk] = useState(false);
  const [avanco, setAvanco] = useState<Avanco | null>(null);
  const emCurso = useRef(false);
  const fim = useFimVisivel(aCorrer, ok);

  const obter = useCallback(
    async (url: string, init?: RequestInit): Promise<{ blob: Blob; nome: string | null }> => {
      if (emCurso.current) throw new Error("Já está a descarregar.");
      emCurso.current = true;
      setOk(false);
      setAvanco(null);
      setACorrer(true);
      try {
        const r = await descarregar(url, { init, aoAvancar: setAvanco });
        setOk(true);
        return r;
      } finally {
        emCurso.current = false;
        setACorrer(false);
      }
    },
    [],
  );

  const correr = useCallback(
    async (url: string, nomeSeFaltar: string, init?: RequestInit): Promise<boolean> => {
      const { blob, nome } = await obter(url, init);
      guardarBlob(blob, nome ?? nomeSeFaltar);
      return true;
    },
    [obter],
  );

  // Um objecto estável enquanto nada muda: quem o põe nas dependências de um
  // `useCallback`/`useMemo` (a paleta de comandos, por exemplo) não refaz o
  // trabalho a cada desenho.
  return useMemo(
    () => ({
      correr,
      obter,
      aCorrer,
      mostrar: fim.mostrar,
      /** O que o `EmCurso` precisa para desenhar esta descarga. */
      barra: {
        concluido: fim.concluido,
        ...(avanco ? { feito: avanco.feito, total: avanco.total, emBytes: true } : {}),
      },
    }),
    [correr, obter, aCorrer, fim.mostrar, fim.concluido, avanco],
  );
}
