import "server-only";
import { createRepository, type Mapper } from "./repository";
import type { FotoEtiqueta, OrigemEtiqueta } from "./biblioteca-types";

/**
 * A LIGAÇÃO entre uma foto e uma etiqueta — e, com ela, o trabalho à mão de
 * arrumar a biblioteca. É a tabela mais valiosa das três: as fotos
 * reconstroem-se do bucket em segundos e o vocabulário são 23 linhas, mas
 * "esta foto é um seating plan em terracotta" só existe porque alguém o disse.
 *
 * `origem` diz QUEM o disse:
 *   migracao — adivinhado a partir da pasta onde a foto estava
 *   fusao    — herdado de uma cópia byte-a-byte da mesma foto noutra pasta
 *   upload   — aplicado ao largar a foto num tema
 *   manual   — confirmado ou posto à mão
 *
 * Sem esta coluna a revisão em lote não conseguia mostrar "por confirmar" e a
 * migração não se conseguia desfazer sem levar atrás o trabalho verdadeiro.
 *
 * O `id` é derivado (`<path>#<etiqueta_id>`, coluna gerada na base): dá a mesma
 * garantia de um par único e ainda deixa esta tabela ser lida, reposta e
 * apagada pelo mesmo Repository que trata de tudo o resto.
 */

export const idDaLigacao = (path: string, etiquetaId: string): string => `${path}#${etiquetaId}`;

export const mapper: Mapper<FotoEtiqueta> = {
  table: "biblioteca_foto_etiquetas",
  fileName: "biblioteca-foto-etiquetas.json",
  getId: (l) => l.id,
  // `id` NÃO se escreve: é gerado pela base a partir das outras duas colunas.
  // Mandá-lo daria erro de coluna gerada — e, pior, seria uma segunda versão
  // da mesma verdade.
  toRow: (l) => ({
    path: l.path,
    etiqueta_id: l.etiquetaId,
    origem: l.origem,
    created_at: l.createdAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    // O ficheiro de desenvolvimento não tem colunas geradas — derivar aqui
    // mantém os dois lados a dizer o mesmo.
    id:
      typeof r.id === "string" && r.id ? r.id : idDaLigacao(String(r.path), String(r.etiqueta_id)),
    path: String(r.path),
    etiquetaId: String(r.etiqueta_id),
    origem: lerOrigem(r.origem),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "created_at", ascending: true },
  fileCompare: (a, b) => a.createdAt.localeCompare(b.createdAt),
};

/** Uma origem que não reconheçamos conta como `manual` — o lado seguro: nunca
 *  apagada por engano pela reversão da migração, que só leva `migracao` e
 *  `fusao`. */
function lerOrigem(v: unknown): OrigemEtiqueta {
  return v === "migracao" || v === "fusao" || v === "upload" ? v : "manual";
}

const repo = createRepository(mapper);

export const listFotoEtiquetas = (): Promise<FotoEtiqueta[]> => repo.list();

/** As etiquetas de UMA foto. */
export const etiquetasDaFoto = (path: string): Promise<FotoEtiqueta[]> =>
  repo.where("path", path, (l) => l.path === path);

/** As fotos que têm UMA etiqueta. */
export const fotosComEtiqueta = (etiquetaId: string): Promise<FotoEtiqueta[]> =>
  repo.where("etiqueta_id", etiquetaId, (l) => l.etiquetaId === etiquetaId);

/**
 * Põe uma etiqueta numa foto. Repetir não faz nada e NÃO é um erro: aplicar
 * "terracotta" a 30 fotos das quais 8 já a tinham é a operação normal da
 * revisão em lote, não uma falha a meio.
 *
 * A `origem` de uma etiqueta que já lá está NÃO é actualizada: uma que a
 * equipa confirmou (`manual`) não pode voltar a `migracao` por a migração ter
 * sido corrida outra vez.
 */
export async function etiquetar(
  path: string,
  etiquetaId: string,
  origem: OrigemEtiqueta = "manual",
): Promise<{ ligacao: FotoEtiqueta; criada: boolean }> {
  const id = idDaLigacao(path, etiquetaId);
  const existente = await repo.get(id);
  if (existente) return { ligacao: existente, criada: false };
  const ligacao: FotoEtiqueta = {
    id,
    path,
    etiquetaId,
    origem,
    createdAt: new Date().toISOString(),
  };
  await repo.create(ligacao);
  return { ligacao, criada: true };
}

/**
 * Tira uma etiqueta de uma foto. Tirar o que já não estava é um sucesso — o
 * `false` diz só que não havia nada para tirar.
 *
 * O `criada`/`removida` existe para a mensagem poder ser honesta: aplicar uma
 * etiqueta a 30 fotos das quais 8 já a tinham deve dizer "22 fotos
 * etiquetadas", não 30.
 */
export async function desetiquetar(path: string, etiquetaId: string): Promise<boolean> {
  const id = idDaLigacao(path, etiquetaId);
  if (!(await repo.get(id))) return false;
  await repo.remove(id);
  return true;
}
