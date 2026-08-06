import "server-only";
import { createRepository, type Mapper } from "./repository";
import type { Foto } from "./biblioteca-types";

/**
 * As FOTOS da biblioteca — uma linha por ficheiro do bucket `theme-assets`.
 *
 * ── O que esta tabela NÃO é ──────────────────────────────────────────────
 * Não é a fonte de verdade do que existe. A PASTA continua a mandar nisso (ver
 * `theme-storage.ts`, que lista o bucket): uma linha sem ficheiro é um
 * fantasma, um ficheiro sem linha é uma foto por etiquetar. Esta tabela existe
 * por duas razões, e nenhuma delas é guardar a lista de imagens:
 *
 *   1. as etiquetas precisam de onde se pendurar — não se etiqueta um objeto
 *      do Storage;
 *   2. a contagem de cada cartão deixa de custar uma ida ao Storage por tema.
 *
 * Se alguma vez as duas discordarem, é a pasta que tem razão. É essa regra que
 * impede a biblioteca de se desarrumar, e foi mantida de propósito ao
 * acrescentar as etiquetas.
 *
 * `path` é a identidade e nunca muda: nenhum byte se move por causa disto.
 */

export const mapper: Mapper<Foto> = {
  table: "biblioteca_fotos",
  fileName: "biblioteca-fotos.json",
  getId: (f) => f.path,
  // `pasta` NÃO se escreve: é calculada pela base de dados a partir do `path`
  // (coluna gerada). Escrevê-la seria arriscar duas versões da mesma verdade.
  toRow: (f) => ({
    path: f.path,
    fingerprint: f.fingerprint || null,
    md5: f.md5 || null,
    largura: f.largura ?? null,
    altura: f.altura ?? null,
    lqip: f.lqip || null,
    created_at: f.createdAt || new Date().toISOString(),
    updated_at: f.updatedAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    path: String(r.path),
    // O ficheiro de desenvolvimento não tem colunas geradas; derivar aqui
    // mantém os dois lados a dizer o mesmo.
    pasta: typeof r.pasta === "string" && r.pasta ? r.pasta : String(r.path).split("/")[0],
    ...(typeof r.fingerprint === "string" && r.fingerprint ? { fingerprint: r.fingerprint } : {}),
    ...(typeof r.md5 === "string" && r.md5 ? { md5: r.md5 } : {}),
    ...(typeof r.largura === "number" ? { largura: r.largura } : {}),
    ...(typeof r.altura === "number" ? { altura: r.altura } : {}),
    ...(typeof r.lqip === "string" && r.lqip ? { lqip: r.lqip } : {}),
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => b.createdAt.localeCompare(a.createdAt),
  touch: true,
};

const repo = createRepository(mapper);

export const listFotos = (): Promise<Foto[]> => repo.list();

export const getFoto = (path: string): Promise<Foto | null> => repo.get(path);

/**
 * Garante a linha de uma foto que já está no bucket. Devolve-a sempre — a que
 * já lá estava ou a que acabou de nascer.
 *
 * É assim (e não um `create` que rebenta com duplicados) porque a linha nasce
 * de forma preguiçosa: a primeira vez que alguém listar, etiquetar ou abrir uma
 * foto que ainda não tem linha. Uma biblioteca com fotos anteriores a esta
 * funcionalidade — que é o caso das 104 — tem de poder ser usada sem passos
 * prévios.
 */
export async function garantirFoto(
  path: string,
  dados: Partial<Omit<Foto, "path" | "pasta" | "createdAt" | "updatedAt">> = {},
): Promise<Foto> {
  const existente = await repo.get(path);
  if (existente) return existente;
  const agora = new Date().toISOString();
  const foto: Foto = {
    path,
    pasta: path.split("/")[0],
    ...dados,
    createdAt: agora,
    updatedAt: agora,
  };
  await repo.create(foto);
  return foto;
}

export const updateFoto = (
  path: string,
  patch: Partial<Pick<Foto, "fingerprint" | "md5" | "largura" | "altura" | "lqip">>,
): Promise<Foto | null> => repo.update(path, patch);

/**
 * Os LQIP de um conjunto de caminhos, num pedido só.
 *
 * EM LOTE, e não um por foto: isto corre no caminho de LEITURA da grelha, que é
 * onde a missão diz que não pode haver trabalho. Uma consulta por fotografia
 * seriam 60 idas à base de dados para desenhar uma página — trocava-se um
 * problema de rede por um pior.
 *
 * Uma foto sem linha, ou com `lqip` a nulo, simplesmente não entra no mapa; a
 * célula fica como está hoje. Nunca lança: um placeholder é acessório, e uma
 * base de dados em baixo não pode esconder as fotografias.
 */
export async function lqipsDeCaminhos(paths: readonly string[]): Promise<Map<string, string>> {
  const saida = new Map<string, string>();
  if (paths.length === 0) return saida;
  // Uma consulta por PASTA, não por foto. `pasta` é uma coluna gerada e tem
  // índice (`biblioteca_fotos_pasta_idx`), e a página de um tema costuma vir
  // toda da mesma pasta — na prática é uma ida só. Sessenta consultas para
  // desenhar uma página trocavam um problema de rede por um pior.
  //
  // O QUE ISTO CUSTA, dito: numa pasta de milhares de fotos lêem-se mais linhas
  // do que as 60 que se vão usar. As linhas são pequenas (caminho + ~180
  // caracteres), mas a conta cresce com a PASTA e não com a página — o oposto
  // da promessa deste módulo. A correcção é um `in` no repositório, e o sítio
  // dela é o Pilar 7 (escala), junto com a virtualização.
  const pastas = new Set(paths.map((p) => p.split("/")[0]).filter(Boolean));
  const querido = new Set(paths);
  try {
    const listas = await Promise.all(
      [...pastas].map((pasta) => repo.where("pasta", pasta, (f) => f.pasta === pasta)),
    );
    for (const f of listas.flat()) {
      if (f.lqip && querido.has(f.path)) saida.set(f.path, f.lqip);
    }
  } catch {
    /* sem placeholders — a grelha desenha-se na mesma */
  }
  return saida;
}

/** Apaga a linha (as etiquetas vão atrás, por `on delete cascade`). Chamada
 *  quando a FOTO sai do bucket — nunca ao contrário. */
export const deleteFoto = (path: string): Promise<void> => repo.remove(path);
