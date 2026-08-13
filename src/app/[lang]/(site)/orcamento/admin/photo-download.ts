import type { ThemeImage } from "@/lib/theme-types";

/**
 * TRANSFERIR FOTOS DA BIBLIOTECA DE TEMAS.
 *
 * Porque não basta um `<a download href={url}>`: os URL das fotos são
 * assinados e apontam para o Storage, ou seja, para OUTRA origem. O atributo
 * `download` é ignorado em ligações cross-origin (regra do browser, não uma
 * particularidade nossa), e o que acontecia era a foto ABRIR num separador em
 * vez de ser guardada. Puxar os bytes e criar um `blob:` da nossa própria
 * origem devolve o comportamento esperado, e de caminho deixa-nos escolher o
 * nome do ficheiro.
 */

/** Nome do ficheiro tal como fica na pasta de transferências. */
export function downloadName(image: ThemeImage, themeName: string, index: number): string {
  const ext = (image.path.match(/\.(\w+)$/)?.[1] || "jpg").toLowerCase();
  // O caminho no Storage é um UUID: não diz nada a quem abre a pasta depois.
  // "italia-03.jpg" diz.
  const slug =
    themeName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "tema";
  return `${slug}-${String(index + 1).padStart(2, "0")}.${ext}`;
}

/** Guarda um blob no disco com o nome dado. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Só depois de o browser ter começado a guardar. Revogar já a seguir
  // cancelava a transferência em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Transfere UMA foto. Devolve `false` se não foi possível (e quem chama avisa),
 * em vez de lançar: num lote de 40, uma falha não pode parar as outras.
 */
export async function downloadOne(url: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    saveBlob(await res.blob(), filename);
    return true;
  } catch {
    return false;
  }
}

export interface BulkProgress {
  done: number;
  total: number;
  failed: number;
}

/**
 * Transfere várias fotos, UMA DE CADA VEZ.
 *
 * Em série de propósito: os navegadores travam downloads disparados em rajada
 * (o Chrome pede confirmação a partir do segundo em simultâneo e chega a
 * descartar os seguintes em silêncio). Uma de cada vez chega toda, e o
 * `onProgress` é o que dá à Catarina a sensação de que aquilo está a andar.
 *
 * `signal` permite desistir a meio; as que já foram guardadas ficam.
 */
export async function downloadMany(
  items: { url: string; filename: string }[],
  onProgress: (p: BulkProgress) => void,
  signal?: AbortSignal,
): Promise<BulkProgress> {
  const p: BulkProgress = { done: 0, total: items.length, failed: 0 };
  for (const item of items) {
    if (signal?.aborted) break;
    const ok = await downloadOne(item.url, item.filename);
    p.done += 1;
    if (!ok) p.failed += 1;
    onProgress({ ...p });
  }
  return p;
}
