/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE UMA VERIFICAÇÃO DE FOTOGRAFIAS RESPONDE — sem servidor nenhum
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Separado do `proposta-fotos-verificacao.ts` (que importa `server-only`, o
 * Storage e o registo) para o PAINEL DO ESTÚDIO poder ler os tipos e as frases
 * sem arrastar o Supabase para dentro do pacote do browser. É a mesma divisão
 * do `contract-types.ts` / `contracts-store.ts`, e há um teste da casa a
 * prendê-la — foi ele que a exigiu.
 */

/** Porque é que uma fotografia do documento não vai aparecer. */
export type MotivoDeFalta =
  /** O caminho está no documento e o ficheiro não está no bucket do pedido. */
  | "nao-esta-no-bucket"
  /** `tema:…` que já não existe na Biblioteca (apagada sem materializar). */
  | "saiu-da-biblioteca"
  /** `pending:` — o lugar foi reservado e a cópia nunca chegou a acontecer. */
  | "por-copiar";

export interface FotoEmFalta {
  /** O id opaco da fotografia neste documento (`b0f2`), como em `proposta-fotos`. */
  id: string;
  /** Onde ela está, em português: «Mood board «Lapelas» · foto 1». */
  onde: string;
  motivo: MotivoDeFalta;
}

export interface VerificacaoDeFotos {
  /** Quantas fotografias o documento declara. */
  total: number;
  emFalta: FotoEmFalta[];
  /**
   * Endereços que não se conseguem verificar daqui: `http(s)` escritos à mão.
   * Não são um defeito — são um «não sei», e dizê-lo é melhor do que os contar
   * como bons ou como maus.
   */
  naoVerificaveis: number;
  /**
   * A verificação CORREU? `false` quando não há Storage configurado (o
   * ambiente local, uma pré-visualização) — e aí `emFalta` vazio quer dizer
   * «não se sabe», nunca «está tudo bem». Quem mostra isto no ecrã TEM de
   * distinguir as duas coisas: um «tudo bem» dado por uma verificação que não
   * correu é exactamente a mentira que este módulo existe para acabar.
   */
  verificou: boolean;
}

/** O que cada motivo quer dizer, para quem lê o aviso no back office. */
export const PORQUE_FALTA: Readonly<Record<MotivoDeFalta, string>> = {
  "nao-esta-no-bucket":
    "o ficheiro não está no armazenamento deste pedido — foi apagado, ou o carregamento não chegou ao fim",
  "saiu-da-biblioteca":
    "veio da Biblioteca de Temas e já lá não está — foi apagada sem passar por aqui",
  "por-copiar": "a foto foi escolhida e a cópia nunca chegou a acontecer",
};
