import { PHOTOS, type Label } from "@/app/[lang]/(site)/galeria/photos-data";

/**
 * FOTOS DIFERENTES A CADA VISITA, MAS SEMPRE DO SERVIÇO CERTO.
 *
 * A secção "Momentos que criámos" mostrava seis fotos fixas, escritas à mão em
 * `services-data.ts`. Quem voltasse à página via sempre as mesmas seis, e o
 * portefólio parecia mais pequeno do que é: só a etiqueta "Casamento" tem 333
 * fotografias.
 *
 * Aqui as seis são tiradas ao acaso do conjunto que corresponde ÀQUELA página,
 * usando as etiquetas que a galeria já mantém. Não há uma segunda lista para
 * manter em dia: acrescentar uma foto à galeria põe-na automaticamente a
 * circular na página de serviço certa.
 */

/** Etiquetas da galeria que servem cada página de serviço. */
const POOLS: Record<string, Label[]> = {
  casamentos: ["Casamento"],
  "eventos-corporativos": ["Corporativo", "Conferência"],
  "festas-e-aniversarios": ["Evento"],
  "batizados-e-comunhoes": ["Evento"],
  // `aluguer-de-viaturas-classicas` não está aqui de propósito: não existe
  // etiqueta para as viaturas, e sortear do conjunto dos casamentos encheria a
  // página de mesas postas sem um único carro. Fica com a lista escolhida à mão
  // até haver fotos etiquetadas.
};

/** Quantas fotos a secção mostra (a grelha tem seis posições). */
export const SERVICE_GALLERY_SIZE = 6;

/**
 * `n` fotos ao acaso do conjunto deste serviço, sem repetições.
 *
 * Devolve `null` quando o serviço não tem conjunto próprio ou quando o conjunto
 * é pequeno de mais para encher a grelha — nesse caso quem chama fica com a
 * lista escolhida à mão, que é melhor do que uma grelha com buracos.
 */
export function pickServiceGallery(slug: string, n = SERVICE_GALLERY_SIZE): string[] | null {
  const labels = POOLS[slug];
  if (!labels) return null;

  const pool = PHOTOS.filter((p) => labels.includes(p.label)).map((p) => p.src);
  if (pool.length < n) return null;

  // Fisher-Yates parcial: baralha só as `n` primeiras posições, que é tudo o
  // que se lê. Numa lista de 333 evita baralhar 333 para usar 6.
  const copy = pool.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
