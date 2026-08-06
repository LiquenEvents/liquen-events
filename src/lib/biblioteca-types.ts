/**
 * A BIBLIOTECA VISUAL — os tipos, sem nada de servidor lá dentro.
 *
 * Vive à parte dos stores (que são `server-only`) para que os componentes do
 * back office possam importar as formas sem arrastar o Supabase para o pacote
 * do navegador. Mesma divisão que `theme-types.ts` ↔ `themes-store.ts`.
 *
 * ── O modelo, em três frases ─────────────────────────────────────────────
 * Uma FOTO tem etiquetas em três eixos independentes (tipo, paleta, estilo).
 * Um TEMA é uma pergunta com nome — uma combinação de etiquetas guardada.
 * A mesma foto responde a várias perguntas ao mesmo tempo, sem existir duas
 * vezes, e é isso que torna "seating plans em terracotta" uma pergunta que se
 * pode fazer.
 */

/** Os três eixos. Independentes de propósito: uma foto é um TIPO de peça, numa
 *  PALETA, num ESTILO — e misturá-los num nível só foi o defeito de origem. */
export type Eixo = "tipo" | "paleta" | "estilo";

export const EIXOS: readonly Eixo[] = ["tipo", "paleta", "estilo"] as const;

export function isEixo(v: unknown): v is Eixo {
  return v === "tipo" || v === "paleta" || v === "estilo";
}

/** Um valor de um eixo. O `id` é `<eixo>:<slug>` — legível no SQL Editor e
 *  estável quando o `nome` é corrigido ("Terracota" → "Terracotta"). */
export interface Etiqueta {
  id: string;
  eixo: Eixo;
  nome: string;
  ordem: number;
  createdAt: string;
}

/**
 * Uma foto da biblioteca. O `path` É a identidade (`<pasta>/<ficheiro>.jpg` no
 * bucket `theme-assets`) e nunca muda: nenhum byte se move por causa das
 * etiquetas.
 *
 * ATENÇÃO — isto NÃO decide o que existe. A pasta do bucket continua a ser a
 * única fonte de verdade (ver `theme-storage.ts`): uma linha sem ficheiro é um
 * fantasma, um ficheiro sem linha é uma foto por etiquetar. É a propriedade que
 * impede a biblioteca de se desarrumar, e não se abdica dela por comodidade.
 */
export interface Foto {
  path: string;
  /** A primeira parte do caminho. Depois da migração é só a pasta de ORIGEM —
   *  deixa de significar "tema". Calculada pela base de dados. */
  pasta: string;
  /** Resumo do ficheiro original, quando o nome o traz (ver theme-fingerprint). */
  fingerprint?: string;
  /** MD5 do conteúdo. É o que reconhece a mesma foto carregada em duas pastas. */
  md5?: string;
  largura?: number;
  altura?: number;
  /** Placeholder curto servido inline enquanto a foto não chega (Parte D). */
  lqip?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Quem pôs uma etiqueta numa foto. É o que separa o que a máquina adivinhou do
 * que a equipa confirmou — e sem essa separação a revisão em lote não teria
 * como mostrar "por confirmar" nem a migração como ser desfeita.
 */
export type OrigemEtiqueta = "migracao" | "fusao" | "upload" | "manual";

export interface FotoEtiqueta {
  /** `<path>#<etiqueta_id>` — derivado, nunca escrito à mão. */
  id: string;
  path: string;
  etiquetaId: string;
  origem: OrigemEtiqueta;
  createdAt: string;
}

/**
 * Uma exigência de um eixo dentro da regra de um tema.
 *
 * `modo: "todas"` — a foto tem de ter TODAS as etiquetas listadas. É o normal,
 * e é o que os nomes dizem: "Bouquets Branco e Amarelo" é branco E amarelo.
 * `modo: "qualquer"` — basta uma delas.
 *
 * A diferença não é académica: com "qualquer", as fotos de "Bouquets Branco e
 * Verde" (que também são bouquets brancos) apareciam no tema "Branco e
 * Amarelo", e os dois temas passavam de 14 e 16 fotos para 30 cada.
 */
export interface EixoDaRegra {
  eixo: Eixo;
  modo: "todas" | "qualquer";
  etiquetas: string[];
}

/** A regra de um tema-filtro. E entre eixos; dentro do eixo manda o `modo`.
 *  Um eixo ausente NÃO restringe nada. */
export interface RegraDoTema {
  v: 1;
  eixos: EixoDaRegra[];
}

/** O que um tema é: a sua pasta (como sempre foi), uma pergunta, ou uma lista
 *  de fotos escolhidas à mão. */
export type TipoDeTema = "pasta" | "filtro" | "manual";

/** Lê uma `filter_rule` vinda da base de dados sem confiar nela. Devolve `null`
 *  quando não é uma regra utilizável — e quem chama trata o tema como estava,
 *  em vez de mostrar uma biblioteca inteira por engano. */
export function lerRegra(valor: unknown): RegraDoTema | null {
  if (!valor || typeof valor !== "object") return null;
  const bruto = valor as { v?: unknown; eixos?: unknown };
  if (!Array.isArray(bruto.eixos)) return null;
  const eixos: EixoDaRegra[] = [];
  for (const e of bruto.eixos) {
    if (!e || typeof e !== "object") continue;
    const { eixo, modo, etiquetas } = e as Record<string, unknown>;
    if (!isEixo(eixo) || !Array.isArray(etiquetas)) continue;
    const ids = etiquetas.filter((x): x is string => typeof x === "string" && x.length > 0);
    // Um eixo sem etiquetas nenhumas não é uma exigência vazia: é uma regra
    // partida. Deixá-lo passar fazia o tema aceitar tudo.
    if (ids.length === 0) continue;
    eixos.push({ eixo, modo: modo === "qualquer" ? "qualquer" : "todas", etiquetas: ids });
  }
  return eixos.length > 0 ? { v: 1, eixos } : null;
}

/** Esta foto (o conjunto de etiquetas que tem) cumpre a regra? Puro — é a mesma
 *  conta que o SQL faz, e é o que permite testá-la sem base de dados. */
export function cumpreRegra(etiquetasDaFoto: ReadonlySet<string>, regra: RegraDoTema): boolean {
  return regra.eixos.every((e) =>
    e.modo === "qualquer"
      ? e.etiquetas.some((id) => etiquetasDaFoto.has(id))
      : e.etiquetas.every((id) => etiquetasDaFoto.has(id)),
  );
}
