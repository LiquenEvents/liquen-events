/// <reference lib="webworker" />

/**
 * Trabalhador que prepara fotos FORA do fio principal.
 *
 * Porque existe: descodificar, reduzir e reencodar uma foto de 4032×3024 custa
 * ~300 ms de CPU. Feito no fio principal — que é o mesmo que desenha a grelha e
 * responde aos cliques — um lote de 300 fotos deixa a Biblioteca de Temas
 * entaramelada durante minutos. Aqui isso corre num fio à parte, e a
 * `image-prep` mantém uma POOL destes trabalhadores para usar mais do que um
 * núcleo.
 *
 * Este ficheiro é DELIBERADAMENTE autossuficiente: não importa nada da
 * `image-prep` (que é um módulo "use client" com código de DOM lá dentro, e um
 * trabalhador não tem DOM). O preço é ter aqui uma cópia da aritmética de
 * redimensionamento — que a `image-prep.test.ts` fixa contra a versão original
 * (ver "aritmética do trabalhador"), para as duas nunca divergirem em silêncio.
 */

/** O pedido que o fio principal envia. */
export interface WorkerRequest {
  id: number;
  blob: Blob;
  /** Lado maior do original. Ignorado quando `skipOriginal`. */
  maxEdge: number;
  quality: number;
  /** O ficheiro sobe tal e qual; só se quer a miniatura (foto já pequena). */
  skipOriginal: boolean;
  wantThumb: boolean;
  thumbEdge: number;
  thumbQuality: number;
}

/** A resposta. `ok: false` NÃO é um erro fatal — quem chamou tenta o caminho
 *  do fio principal, que sabe descodificar coisas que o trabalhador não sabe
 *  (HEIC no Safari, via `<img>`, que aqui não existe). */
export type WorkerResponse =
  | { id: number; ok: true; blob: Blob | null; thumb: Blob | null }
  | { id: number; ok: false; reason: string };

/** Cópia de `fitWithin` da image-prep (ver nota no cabeçalho). */
export function planResize(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Cópia de `needsThumb` da image-prep (ver nota no cabeçalho). */
export function planThumb(w: number, h: number, thumbEdge: number): boolean {
  return Math.max(w, h) > thumbEdge * 1.25;
}

/** Desenha para um canvas do tamanho pedido, com a interpolação boa. */
function drawTo(source: CanvasImageSource, w: number, h: number): OffscreenCanvas | null {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Reduzir 3000 → 400 px de um salto serrilha nos browsers que usam a
  // interpolação rápida; isto pede explicitamente a boa.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

/**
 * O trabalho de uma foto: UMA descodificação serve o original e a miniatura.
 * Descodificar duas vezes duplicaria o custo de um lote de 300 fotos, que é
 * exatamente o tamanho para que isto está dimensionado.
 */
export async function prepareInWorker(
  req: WorkerRequest,
): Promise<{ blob: Blob | null; thumb: Blob | null }> {
  const bitmap = await createImageBitmap(req.blob);
  try {
    let blob: Blob | null = null;
    // A miniatura sai do canvas JÁ REDUZIDO quando ele existe: dois passos de
    // redução serrilham menos do que um salto de 4032 → 400 px, e desenhar a
    // partir de 2200 px é mais barato do que a partir de 4032 px.
    let base: CanvasImageSource = bitmap;
    let bw = bitmap.width;
    let bh = bitmap.height;

    if (!req.skipOriginal) {
      const { w, h } = planResize(bitmap.width, bitmap.height, req.maxEdge);
      const canvas = drawTo(bitmap, w, h);
      if (!canvas) throw new Error("sem-contexto-2d");
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: req.quality });
      if (!blob) throw new Error("sem-encode");
      base = canvas;
      bw = w;
      bh = h;
    }

    let thumb: Blob | null = null;
    if (req.wantThumb && planThumb(bw, bh, req.thumbEdge)) {
      const t = planResize(bw, bh, req.thumbEdge);
      const canvas = drawTo(base, t.w, t.h);
      // A miniatura é derivada e dispensável: falhar aqui nunca deita fora a
      // foto — a grelha cai no original, como já faz com as fotos antigas.
      if (canvas) {
        thumb = await canvas
          .convertToBlob({ type: "image/jpeg", quality: req.thumbQuality })
          .catch(() => null);
      }
    }

    return { blob, thumb };
  } finally {
    // Só depois de AMBOS os desenhos: fechar a bitmap a seguir ao primeiro
    // deixava a miniatura sem fonte.
    bitmap.close();
  }
}

// Registo do recetor de mensagens. Guardado para este módulo poder ser
// importado por um teste (em Node não há `DedicatedWorkerGlobalScope`).
if (
  typeof DedicatedWorkerGlobalScope !== "undefined" &&
  self instanceof DedicatedWorkerGlobalScope
) {
  self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const req = e.data;
    try {
      const { blob, thumb } = await prepareInWorker(req);
      const res: WorkerResponse = { id: req.id, ok: true, blob, thumb };
      self.postMessage(res);
    } catch (err) {
      const res: WorkerResponse = {
        id: req.id,
        ok: false,
        reason: err instanceof Error ? err.message : "falhou",
      };
      self.postMessage(res);
    }
  };
}
