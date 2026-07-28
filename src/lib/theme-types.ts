/**
 * Biblioteca de Temas — tipos partilhados (client-safe).
 *
 * Um "tema" é uma pasta de fotos de inspiração que o estúdio reutiliza de
 * casamento para casamento ("Itália", "Terracotta", "Branco & Verde"…). Em vez
 * de ir ao Pinterest / às pastas do disco a cada proposta, a equipa carrega as
 * fotos UMA vez aqui e depois, no estúdio de propostas, escolhe o tema e
 * insere as imagens diretamente no mood board ou na capa.
 *
 * Os metadados do tema (nome, notas) vivem na tabela `proposal_themes`; as
 * fotos vivem no bucket privado de Storage `theme-assets`, uma pasta por tema
 * (ver `theme-storage.ts`). Este módulo não importa nada de servidor para
 * poder ser usado pelos componentes do back office.
 */

/** Um tema da biblioteca (metadados; as fotos são listadas do Storage). */
export interface ProposalTheme {
  id: string;
  /** Nome mostrado à equipa, ex.: "Terracotta". */
  name: string;
  /** Nota interna opcional ("tons quentes, para espaços de pedra"). */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Uma foto guardada: caminho estável no bucket + URL assinado p/ pré-visualizar. */
export interface ThemeImage {
  path: string;
  url: string;
}

/** O que a lista de temas precisa para desenhar um cartão. */
export interface ThemeSummary extends ProposalTheme {
  /** Nº de fotos na pasta do tema, ou `null` quando a pasta NÃO pôde ser lida
   *  (Storage em baixo). Distinguir os dois casos evita mostrar "0 fotos" —
   *  que a equipa leria como "as minhas fotos desapareceram" — quando o que
   *  aconteceu foi uma falha temporária de leitura. */
  imageCount: number | null;
  /** A contagem é um MÍNIMO: a listagem da pasta bateu no limite por página. */
  truncated?: boolean;
  /** URL assinado da primeira foto, usada como capa do cartão. */
  coverUrl?: string;
}

/** Limites de escrita partilhados entre o formulário e as rotas de API. */
export const MAX_THEME_NAME = 60;
export const MAX_THEME_NOTES = 300;

/** Quantas fotos podem ser importadas para uma proposta de uma só vez. */
export const MAX_IMPORT_BATCH = 40;
