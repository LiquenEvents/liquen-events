import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, nomeVisivel, readSession } from "./admin-auth";
import { isMissingTable } from "./repository";
import {
  guardarNaReciclagem,
  listarReciclagem,
  obterDaReciclagem,
  tirarDaReciclagem,
  type EntradaDaReciclagem,
} from "./reciclagem-store";
import { deleteTask, obterTarefa, reporTarefa } from "./tasks-store";
import { deleteSupplier, obterFornecedor, reporFornecedor } from "./suppliers-store";
import { deleteCalendarEvent, obterEvento, reporEvento } from "./calendar-store";
import { apagarServico, criarServico, obterServico } from "./servicos-catalogo-store";
import { deleteMaterial, getMaterial, reporMaterial } from "./material-store";
import { deleteItem, getItem, reporItem } from "./inventory-store";
import { deleteList, getList, reporList } from "./material-lists-store";
import { listItemsOf, obterLinha, reporLinha } from "./material-list-items-store";
import { deleteRule, listRules, obterRegra, reporRegra } from "./material-rules-store";
import type { CalendarEvent, Supplier, Task } from "./orcamento/types";
import type { ServicoCatalogo } from "./servicos-catalogo-store";
import type { MaterialItem } from "./material-types";
import type { PropItem } from "./inventory-types";
import type { MaterialList, MaterialListItem } from "./material-list-types";
import type { MaterialRule } from "./material-rules";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APAGAR VAI PARA A RECICLAGEM, E A RECICLAGEM REPÕE TAL E QUAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fase R3 de `docs/TUDO-REVERSIVEL.md`. Ela escolheu «Reciclagem 30 dias».
 *
 * Apagar faz três coisas, por esta ordem:
 *   1. o RETRATO — a linha e o que cai com ela (ver «cascatas» abaixo);
 *   2. a entrada na Reciclagem;
 *   3. o apagar de sempre.
 * Se o 3 falhar, a entrada sai — uma coisa na Reciclagem que continua viva
 * seria uma segunda cópia a divergir da primeira.
 *
 * Repor grava as linhas de volta com o MESMO id, e só depois tira a entrada.
 * Antes, confere: se entretanto já existe outra coisa com aquele id, ou se o
 * que ela precisa (a lista de uma regra) já não existe, diz-se — 409 — e não
 * se pisa nada.
 *
 * ── CASCATAS QUE SÓ O SUPABASE FAZ ────────────────────────────────────────
 * Apagar um item de material leva as regras que apontam para ele
 * (`material_rules.item_id … on delete cascade`); apagar uma lista leva as
 * suas regras. Sem as guardar no retrato, «Repor» trazia o item sem as regras
 * — e ninguém daria por isso até à checklist seguinte sair incompleta. No
 * ficheiro local as regras ficam (não há cascata): ao repor, uma linha que já
 * lá está não se escreve duas vezes.
 *
 * ── SEM A TABELA ──────────────────────────────────────────────────────────
 * A tabela nasce de uma migração que ela aprova. Até lá, apagar é o de
 * sempre — definitivo — e devolve `false`, para o ecrã o dizer em vez de
 * prometer uma Reciclagem que não existe.
 */

export const DIAS_NA_RECICLAGEM = 30;

/** Quem apagou — o nome da sessão, como ela o reconhece. Nunca atira: um
 *  «quem» em falta não pode impedir um apagar. */
export function quemApagou(req: NextRequest): string | undefined {
  try {
    const conta = readSession(req.cookies.get(ADMIN_COOKIE)?.value)?.name?.trim();
    return conta ? nomeVisivel(conta) : undefined;
  } catch {
    return undefined;
  }
}
const DIA_MS = 24 * 60 * 60 * 1000;

/** Um retrato: grupos de linhas, na ordem em que se repõem. */
type Retrato = Record<string, unknown[]>;

interface DefinicaoDoTipo {
  /** Como se diz na lista («Tarefa», «Fornecedor»). */
  nome: string;
  capturar(id: string): Promise<{ rotulo: string; retrato: Retrato } | null>;
  apagar(id: string): Promise<void>;
  /** Porque é que não pode voltar agora, ou `null` se pode. */
  conflito(retrato: Retrato): Promise<string | null>;
  repor(retrato: Retrato): Promise<void>;
}

const primeiro = <T>(r: Retrato, grupo: string): T => (r[grupo] ?? [])[0] as T;
const todos = <T>(r: Retrato, grupo: string): T[] => (r[grupo] ?? []) as T[];

/** Repõe uma linha só se ainda lá não estiver (as cascatas do ficheiro local). */
async function reporSeFaltar<T extends { id: string }>(
  linhas: T[],
  obter: (id: string) => Promise<T | null>,
  repor: (l: T) => Promise<void>,
): Promise<void> {
  for (const l of linhas) {
    if (!(await obter(l.id))) await repor(l);
  }
}

const JA_EXISTE = "Isto já voltou: existe outra vez com o mesmo id, e não se repõe por cima.";

/** Um tipo simples: uma linha, sem cascatas. */
function simples<T extends { id: string }>(o: {
  nome: string;
  rotulo: (e: T) => string;
  obter: (id: string) => Promise<T | null>;
  apagar: (id: string) => Promise<void>;
  repor: (e: T) => Promise<void>;
}): DefinicaoDoTipo {
  return {
    nome: o.nome,
    async capturar(id) {
      const e = await o.obter(id);
      return e ? { rotulo: o.rotulo(e) || o.nome, retrato: { principal: [e] } } : null;
    },
    apagar: o.apagar,
    async conflito(r) {
      const e = primeiro<T>(r, "principal");
      return e && (await o.obter(e.id)) ? JA_EXISTE : null;
    },
    async repor(r) {
      await o.repor(primeiro<T>(r, "principal"));
    },
  };
}

export const TIPOS = {
  tarefa: simples<Task>({
    nome: "Tarefa",
    rotulo: (t) => t.title,
    obter: obterTarefa,
    apagar: deleteTask,
    repor: reporTarefa,
  }),
  evento: simples<CalendarEvent>({
    nome: "Marcação do calendário",
    rotulo: (e) => e.title,
    obter: obterEvento,
    apagar: deleteCalendarEvent,
    repor: reporEvento,
  }),
  fornecedor: simples<Supplier>({
    nome: "Fornecedor",
    rotulo: (s) => s.name,
    obter: obterFornecedor,
    apagar: deleteSupplier,
    repor: reporFornecedor,
  }),
  servico: simples<ServicoCatalogo>({
    nome: "Serviço da biblioteca",
    rotulo: (s) => s.nome,
    obter: obterServico,
    apagar: apagarServico,
    repor: criarServico,
  }),
  inventario: simples<PropItem>({
    nome: "Item do inventário",
    rotulo: (i) => i.name,
    obter: getItem,
    apagar: deleteItem,
    repor: reporItem,
  }),
  regra: simples<MaterialRule>({
    nome: "Regra de material",
    rotulo: (r) => r.name,
    obter: obterRegra,
    apagar: deleteRule,
    repor: reporRegra,
  }),

  /** O item e as regras que apontam para ele (cascata no Supabase). */
  material: {
    nome: "Item do catálogo de material",
    async capturar(id) {
      const item = await getMaterial(id);
      if (!item) return null;
      const regras = (await listRules()).filter((r) => r.itemId === id);
      return { rotulo: item.name, retrato: { principal: [item], regras } };
    },
    apagar: deleteMaterial,
    async conflito(r) {
      const item = primeiro<MaterialItem>(r, "principal");
      return item && (await getMaterial(item.id)) ? JA_EXISTE : null;
    },
    async repor(r) {
      await reporMaterial(primeiro<MaterialItem>(r, "principal"));
      await reporSeFaltar(todos<MaterialRule>(r, "regras"), obterRegra, reporRegra);
    },
  },

  /** A lista, as suas linhas e as regras que a acrescentam. */
  lista: {
    nome: "Lista de material",
    async capturar(id) {
      const lista = await getList(id);
      if (!lista) return null;
      const [linhas, regras] = await Promise.all([
        listItemsOf(id),
        listRules().then((rs) => rs.filter((r) => r.listId === id)),
      ]);
      return { rotulo: lista.name, retrato: { principal: [lista], linhas, regras } };
    },
    apagar: deleteList,
    async conflito(r) {
      const lista = primeiro<MaterialList>(r, "principal");
      if (!lista) return null;
      if (await getList(lista.id)) return JA_EXISTE;
      // Uma linha aponta para um item do catálogo. Se esse item foi apagado
      // entretanto, repor a linha deixava-a a apontar para nada.
      for (const l of todos<MaterialListItem>(r, "linhas")) {
        if (!(await getMaterial(l.itemId))) {
          return "Um dos itens desta lista já não está no catálogo. Repõe-no primeiro (também está na Reciclagem, se foi apagado há menos de 30 dias).";
        }
      }
      return null;
    },
    async repor(r) {
      await reporList(primeiro<MaterialList>(r, "principal"));
      await reporSeFaltar(todos<MaterialListItem>(r, "linhas"), obterLinha, reporLinha);
      await reporSeFaltar(todos<MaterialRule>(r, "regras"), obterRegra, reporRegra);
    },
  },
} satisfies Record<string, DefinicaoDoTipo>;

export type TipoNaReciclagem = keyof typeof TIPOS;

export const eTipo = (t: string): t is TipoNaReciclagem => t in TIPOS;

/**
 * O que a rota de apagar devolve:
 *  · `{ id }` — está na Reciclagem, com esta entrada;
 *  · `false` — apagado de vez (a Reciclagem ainda não está ligada);
 *  · `null` — já não existia nada com aquele id.
 */
export type ResultadoDeApagar = { id: string } | false | null;

/**
 * Apaga, passando pela Reciclagem.
 *
 * Devolve `null` quando não há nada com aquele id (a rota responde como
 * sempre respondeu a um apagar de algo que já não existe: `ok`).
 */
export async function enviarParaAReciclagem(
  tipo: TipoNaReciclagem,
  id: string,
  quem?: string,
): Promise<ResultadoDeApagar> {
  const def: DefinicaoDoTipo = TIPOS[tipo];
  const capturado = await def.capturar(id);
  if (!capturado) {
    await def.apagar(id);
    return null;
  }
  const entrada: EntradaDaReciclagem = {
    id: randomUUID(),
    tipo,
    rotulo: capturado.rotulo,
    origemId: id,
    apagadoEm: new Date().toISOString(),
    apagadoPor: quem,
    retrato: capturado.retrato,
    ficheiros: [],
  };
  try {
    await guardarNaReciclagem(entrada);
  } catch (err) {
    // A migração ainda não correu: apaga-se como sempre, e diz-se.
    if (isMissingTable(err)) {
      await def.apagar(id);
      return false;
    }
    throw err;
  }
  try {
    await def.apagar(id);
  } catch (err) {
    await tirarDaReciclagem(entrada.id).catch(() => {});
    throw err;
  }
  return { id: entrada.id };
}

/** O porquê de um «Repor» não poder acontecer — a rota responde 409. */
export class NaoDaParaRepor extends Error {
  readonly status: 404 | 409;
  constructor(mensagem: string, status: 404 | 409 = 409) {
    super(mensagem);
    this.status = status;
  }
}

/** Repõe tal e qual, com o mesmo id, e tira a entrada da Reciclagem. */
export async function reporDaReciclagem(entradaId: string): Promise<EntradaDaReciclagem> {
  const entrada = await obterDaReciclagem(entradaId);
  if (!entrada) throw new NaoDaParaRepor("Isto já não está na Reciclagem.", 404);
  if (!eTipo(entrada.tipo)) {
    throw new NaoDaParaRepor(`Não se sabe repor «${entrada.tipo}».`);
  }
  const def: DefinicaoDoTipo = TIPOS[entrada.tipo];
  const retrato = entrada.retrato as Retrato;
  const porque = await def.conflito(retrato);
  if (porque) throw new NaoDaParaRepor(porque);
  await def.repor(retrato);
  await tirarDaReciclagem(entrada.id);
  return entrada;
}

/** «Apagar de vez»: a entrada sai, e com ela a última cópia. */
export async function apagarDeVez(entradaId: string): Promise<boolean> {
  const entrada = await obterDaReciclagem(entradaId);
  if (!entrada) return false;
  await tirarDaReciclagem(entradaId);
  return true;
}

/** Quando sai sozinha da Reciclagem. */
export function saiEm(entrada: Pick<EntradaDaReciclagem, "apagadoEm">): Date {
  return new Date(new Date(entrada.apagadoEm).getTime() + DIAS_NA_RECICLAGEM * DIA_MS);
}

/** A lista para o ecrã, com o nome do tipo e o dia em que sai. */
export async function oQueEstaNaReciclagem(): Promise<
  (Omit<EntradaDaReciclagem, "retrato" | "ficheiros"> & { tipoNome: string; saiEm: string })[]
> {
  const todas = await listarReciclagem();
  return todas.map(({ retrato: _r, ficheiros: _f, ...e }) => {
    void _r;
    void _f;
    return {
      ...e,
      tipoNome: eTipo(e.tipo) ? TIPOS[e.tipo].nome : e.tipo,
      saiEm: saiEm(e).toISOString(),
    };
  });
}

/**
 * A limpeza dos 30 dias. Corre dentro de `/api/cron/backup`, DEPOIS da cópia
 * de segurança do dia — nada sai da Reciclagem sem ter passado por ela.
 * Em lotes, para caber no tempo da função.
 */
export async function limparExpiradas(
  agora: Date = new Date(),
  lote = 50,
): Promise<{ apagadas: number }> {
  const todas = await listarReciclagem();
  const expiradas = todas.filter((e) => saiEm(e).getTime() <= agora.getTime()).slice(0, lote);
  for (const e of expiradas) await tirarDaReciclagem(e.id);
  return { apagadas: expiradas.length };
}
