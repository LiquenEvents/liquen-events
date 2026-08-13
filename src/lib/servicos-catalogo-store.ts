import "server-only";
import { createRepository, type Mapper } from "./repository";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BIBLIOTECA DE SERVIÇOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O mesmo serviço aparecia escrito de maneira diferente conforme o dia:
 * "Decoração da cerimónia", "Decoração cerimónia", "Cerimónia — decoração". Não
 * é um problema de arrumação: é o cliente a receber, na proposta, uma descrição
 * escrita à pressa quando existia uma escrita com tempo.
 *
 * ── PT E EN ────────────────────────────────────────────────────────────────
 * Os dois idiomas vivem na mesma linha, e não em duas. Um serviço com a versão
 * portuguesa e sem a inglesa é um serviço incompleto, não dois serviços — e
 * separá-los deixava-os a divergir sem nada a assinalá-lo.
 *
 * ── CONTINUA A PODER ESCREVER À MÃO ────────────────────────────────────────
 * A biblioteca é uma ajuda, não uma gaiola. O que se escreve à mão fica na
 * proposta como sempre ficou, e há um botão para o guardar aqui quando valer a
 * pena — que é como uma biblioteca cresce sem ninguém parar para a alimentar.
 */

export interface ServicoCatalogo {
  id: string;
  /** Nome curto, o que aparece na linha da proposta. */
  nome: string;
  /** A descrição bem escrita, para os grupos de serviços. */
  descricao: string;
  nomeEn: string;
  descricaoEn: string;
  /** Agrupamento livre ("Flores", "Cenografia", "Coordenação"). */
  categoria: string;
  /** Arquivado: continua nas propostas antigas, some do seletor. */
  arquivado?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const mapper: Mapper<ServicoCatalogo> = {
  table: "service_catalog",
  fileName: "service-catalog.json",
  getId: (s) => s.id,
  toRow: (s) => ({
    id: s.id,
    name: s.nome,
    description: s.descricao,
    name_en: s.nomeEn,
    description_en: s.descricaoEn,
    category: s.categoria,
    archived: s.arquivado ?? false,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    nome: String(r.name ?? ""),
    descricao: String(r.description ?? ""),
    nomeEn: String(r.name_en ?? ""),
    descricaoEn: String(r.description_en ?? ""),
    categoria: String(r.category ?? "Outros"),
    arquivado: Boolean(r.archived),
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.nome.localeCompare(b.nome, "pt"),
  touch: true,
  beforeUpdate: (s) => ({ ...s, updatedAt: new Date().toISOString() }),
};

const repo = createRepository(mapper);

export const listarServicos = (): Promise<ServicoCatalogo[]> => repo.list();
export const obterServico = (id: string): Promise<ServicoCatalogo | null> => repo.get(id);
export const criarServico = (s: ServicoCatalogo): Promise<void> => repo.create(s);
export const actualizarServico = (
  id: string,
  patch: Partial<ServicoCatalogo>,
): Promise<ServicoCatalogo | null> => repo.update(id, patch);
export const apagarServico = (id: string): Promise<void> => repo.remove(id);

/**
 * Um serviço já existe na biblioteca com este nome?
 *
 * Compara pela forma normalizada, para "Decoração da Cerimónia" não entrar
 * outra vez ao lado de "decoracao cerimonia" — que é exactamente a desarrumação
 * que a biblioteca vem resolver.
 */
export function jaExiste(nome: string, existentes: ServicoCatalogo[]): ServicoCatalogo | null {
  const chave = normalizar(nome);
  if (!chave) return null;
  return existentes.find((s) => normalizar(s.nome) === chave) ?? null;
}

/**
 * Palavras que não distinguem um serviço de outro. "Decoração da cerimónia" e
 * "Decoração cerimónia" são o mesmo serviço escrito por duas pessoas.
 */
const LIGACOES = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "as",
  "os",
  "em",
  "no",
  "na",
]);

/**
 * Minúsculas, sem acentos, sem pontuação, sem as palavras de ligação.
 *
 * A ORDEM MANTÉM-SE, ao contrário da chave da memória de preços (que ordena as
 * palavras). Aqui os nomes são para LER: "Mesa dos doces" e "Doces da mesa" são
 * dois nomes que ela pode querer distinguir na biblioteca, e juntá-los apagava
 * um deles sem perguntar. Na memória de preços a pergunta é outra — "já cobrei
 * por isto?" — e aí juntar de mais custa menos do que juntar de menos.
 */
export function normalizar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !LIGACOES.has(p))
    .join(" ");
}
