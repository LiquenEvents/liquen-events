import "server-only";
import { createRepository, type Mapper } from "./repository";
import { isEixo, type Etiqueta, type Eixo } from "./biblioteca-types";

/**
 * O VOCABULÁRIO da biblioteca — os valores de cada eixo (tipo, paleta, estilo).
 *
 * É uma tabela e não uma lista no código porque o vocabulário é da equipa:
 * acrescentar "champanhe" à paleta não pode obrigar a um deploy. `db/schema.sql`
 * semeia os 23 valores iniciais com `on conflict do nothing`, portanto colar o
 * ficheiro outra vez nunca desfaz o que a equipa entretanto mudou.
 */

export const mapper: Mapper<Etiqueta> = {
  table: "biblioteca_etiquetas",
  fileName: "biblioteca-etiquetas.json",
  getId: (e) => e.id,
  toRow: (e) => ({
    id: e.id,
    eixo: e.eixo,
    nome: e.nome,
    ordem: e.ordem,
    created_at: e.createdAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    id: String(r.id),
    // Um eixo que não reconhecemos vira "tipo" em vez de partir a leitura da
    // tabela inteira. A restrição da base impede que aconteça; isto é a rede
    // para o dia em que alguém acrescentar um eixo e publicar o código depois.
    eixo: isEixo(r.eixo) ? r.eixo : "tipo",
    nome: String(r.nome ?? ""),
    ordem: Number(r.ordem ?? 0),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "ordem", ascending: true },
  fileCompare: (a, b) => a.eixo.localeCompare(b.eixo) || a.ordem - b.ordem,
};

const repo = createRepository(mapper);

export const listEtiquetas = (): Promise<Etiqueta[]> => repo.list();

export const getEtiqueta = (id: string): Promise<Etiqueta | null> => repo.get(id);

/** O id é derivado do nome, e é ESTÁVEL: corrigir "Terracota" para "Terracotta"
 *  muda o rótulo sem desligar as fotos que já lá estavam. */
export function etiquetaId(eixo: Eixo, nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${eixo}:${slug}`;
}

export async function createEtiqueta(input: {
  eixo: Eixo;
  nome: string;
  ordem?: number;
}): Promise<Etiqueta> {
  const etiqueta: Etiqueta = {
    id: etiquetaId(input.eixo, input.nome),
    eixo: input.eixo,
    nome: input.nome.trim(),
    ordem: input.ordem ?? 0,
    createdAt: new Date().toISOString(),
  };
  await repo.create(etiqueta);
  return etiqueta;
}

/** Renomear ou reordenar. O `id` não se toca — é o que liga a etiqueta às fotos. */
export const updateEtiqueta = (
  id: string,
  patch: Partial<Pick<Etiqueta, "nome" | "ordem">>,
): Promise<Etiqueta | null> => repo.update(id, patch);

/**
 * Apaga uma etiqueta do vocabulário. A base de dados leva atrás as ligações às
 * fotos (`on delete cascade`) — de propósito: uma etiqueta apagada que
 * continuasse pendurada em 40 fotos seria trabalho invisível a acumular.
 */
export const deleteEtiqueta = (id: string): Promise<void> => repo.remove(id);
