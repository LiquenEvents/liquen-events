import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { log } from "./logger";

// NOTE: `list()` is intentionally UNBOUNDED by default. A blanket row cap was
// tried but reverted: consumers like the "full backup" export, the admin stats
// pipeline, and the daily digest expect the COMPLETE table, and an ascending-
// ordered table (the calendar) would drop the most-recent/upcoming rows first —
// both are silent data loss the operator can't see. A cap only makes sense with
// real pagination. A per-entity `Mapper.listLimit` opt-in remains for a future
// bounded/paginated reader; when set, hitting it logs a warning (never silent).

/**
 * Unified data-access layer.
 *
 * Every entity is persisted through a single `Repository<T>` that hides the
 * "Supabase when configured, else a local JSON file (dev)" decision and the
 * CRUD plumbing that used to be copy-pasted into each store. The only
 * per-entity logic lives in a small `Mapper<T>`:
 *
 *   - toRow / fromRow  translate between the camelCase domain object and the
 *     snake_case database row (the bug-prone part — unit tested per store).
 *   - order / fileCompare  keep Supabase and the file fallback sorted alike.
 *
 * The Supabase backend handles the database row shape; the file backend stores
 * domain objects verbatim. Both satisfy the same `Backend<T>` contract, so the
 * Repository (and the update read-merge-write) is written and tested once.
 */
export interface Mapper<T> {
  /** Supabase table name. */
  table: string;
  /** JSON file name under data/ for the dev fallback. */
  fileName: string;
  /** Stable identity of an entity. */
  getId(entity: T): string;
  /** Domain object → database row (snake_case columns). */
  toRow(entity: T): Record<string, unknown>;
  /** Database row → domain object. */
  fromRow(row: Record<string, unknown>): T;
  /** Columns to select; defaults to "*". Use "data" for jsonb-blob tables. */
  selectColumns?: string;
  /** Default ordering applied to lists. */
  order?: { column: string; ascending: boolean };
  /**
   * Tecto de linhas para um `list()` sem paginação.
   *
   * Por OMISSÃO NÃO HÁ TECTO: um `list()` traz a tabela inteira. O comentário
   * aqui dizia "defaults to DEFAULT_LIST_LIMIT" e essa constante nunca existiu
   * — quem lesse ficava a pensar que havia uma rede que não há. Hoje nenhum dos
   * 12 stores define este campo, portanto TODAS as leituras são sem tecto.
   *
   * E é de propósito, apesar de parecer o contrário. Um tecto por omissão
   * ESCONDE dados: numa lista de facturas ou de contratos, devolver as
   * primeiras N linhas em silêncio é pior do que devolver muitas — a página
   * fica bonita e falta lá dinheiro. Por isso a truncagem é sempre por adesão
   * explícita e nunca calada (ver o aviso no `list()` abaixo).
   *
   * Quando vale a pena pôr um tecto: numa tabela que cresça sem relação com o
   * número de eventos (registos de auditoria, telemetria), ou quando uma página
   * ganhar paginação a sério. Aí define-se aqui, e o aviso do `list()` avisa
   * quando a página fica cheia — que é o sinal de que a paginação passou a ser
   * mesmo necessária.
   */
  listLimit?: number;
  /** Comparator mirroring `order` for the file backend. */
  fileCompare?: (a: T, b: T) => number;
  /** Set updated_at on Supabase updates (table must have the column). */
  touch?: boolean;
  /** Adjust a merged entity before an update is persisted (e.g. timestamps). */
  beforeUpdate?: (merged: T) => T;
}

/** Storage contract shared by the Supabase and file backends. */
export interface Backend<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  query(column: string, value: unknown, predicate: (e: T) => boolean): Promise<T[]>;
  insert(entity: T): Promise<void>;
  /**
   * Write `merged` over the stored entity. When `cas` (the entity previously
   * returned by `get` on this same backend instance) is provided and the
   * backend can tell the row changed since that read, it throws ConflictError
   * instead of clobbering the concurrent write (optimistic locking).
   */
  persist(id: string, merged: T, cas?: T): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * Houve uma escrita concorrente entre a leitura e a escrita: quem chama tem de
 * reler e voltar a tentar. O `updateWith` faz isso sozinho três vezes; se ainda
 * assim não resolver, este erro sai para fora — e é aí que ele tem de trazer
 * matéria com que se fale a uma pessoa.
 *
 * ── PORQUE É QUE O ERRO TRANSPORTA AS DUAS VERSÕES ────────────────────────
 * Uma colisão não pode acabar em silêncio (o último a gravar apaga o outro) nem
 * em erro cru ("Erro interno", que é o mesmo que silêncio com barulho). Quem
 * gravou tem direito a ver o que o servidor tem AGORA (`current`) ao lado do que
 * ela estava a gravar (`attempted`) e a escolher — que é exactamente o que a
 * rota da Visão Geral já faz com o `StaleWriteError` (409 com a versão do
 * servidor no corpo, ver `src/app/api/visao-geral/route.ts`).
 *
 * O `attempted` é a parte que não se pode cortar: sem ele, a resposta de erro é
 * o sítio onde o trabalho da pessoa desaparece. Com ele, o que ela escreveu
 * continua recuperável mesmo tendo a gravação sido recusada.
 */
export class ConflictError<T = Record<string, unknown>> extends Error {
  /** A linha em causa. */
  readonly id: string;
  /** A tabela, quando quem lançou o erro a conhece — para o registo dizer onde. */
  readonly table?: string;
  /** O que o servidor tem agora. É a versão a mostrar ao lado da da pessoa. */
  readonly current?: T;
  /** O que esta escrita queria gravar. Não pode perder-se com a recusa. */
  readonly attempted?: T;

  constructor(id: string, detalhes?: { table?: string; current?: T; attempted?: T }) {
    super(`Concurrent update on "${id}" — stale read`);
    this.name = "ConflictError";
    this.id = id;
    this.table = detalhes?.table;
    this.current = detalhes?.current;
    this.attempted = detalhes?.attempted;
  }
}

/**
 * O `instanceof` sozinho não chega. Em Next o mesmo módulo pode ser carregado
 * mais do que uma vez (bundles diferentes para rotas, testes que reimportam), e
 * aí `err instanceof ConflictError` dá falso para um erro que É um
 * ConflictError — a colisão voltava a sair como 500 "Erro interno" numa rota e
 * como 409 noutra, consoante o bundle. Reconhecer também pelo `name` é a mesma
 * defesa que `isMissingTable` e `isUniqueViolation` já fazem por código.
 */
export function isConflictError(err: unknown): err is ConflictError {
  return (
    err instanceof ConflictError ||
    (!!err && typeof err === "object" && (err as { name?: unknown }).name === "ConflictError")
  );
}

/**
 * A frase a mostrar quando a repetição não resolveu. Escrita para a pessoa que
 * está a olhar para o ecrã, não para quem lê registos: diz o que aconteceu, diz
 * que o texto dela NÃO ficou gravado (o pior seria deixá-la supor que ficou) e
 * diz o que fazer a seguir.
 */
export const MENSAGEM_DE_CONFLITO =
  "Isto foi alterado por outra pessoa entretanto. O que escreveste NÃO foi gravado — " +
  "vê a versão que está agora no servidor e volta a aplicar a tua alteração.";

/**
 * A tabela — ou uma COLUNA dela — ainda não existe na base de dados, quase
 * sempre porque uma funcionalidade nova foi publicada sem se correr o
 * `db/schema.sql`.
 *
 * Vale a pena distinguir isto de uma avaria: é a diferença entre dizer à equipa
 * "Erro interno" (que não indica caminho nenhum) e "falta correr o schema no
 * Supabase, leva um minuto". O Postgres devolve 42P01 (tabela) e 42703
 * (coluna); o PostgREST responde PGRST205 quando a tabela não está na cache do
 * esquema e PGRST204 quando é a coluna que lá não está.
 *
 * As colunas contam porque o schema cresce por `alter table ... add column if
 * not exists` (ex.: `proposal_themes.cover_path`): quem publicou o código sem
 * correr o ficheiro tem exatamente o mesmo problema e exatamente a mesma
 * solução — e o resto da funcionalidade continua a funcionar sem a coluna.
 */
export function isMissingTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204") {
    return true;
  }
  const msg = (err as { message?: unknown }).message;
  return (
    typeof msg === "string" &&
    /relation .* does not exist|column .* does not exist|could not find the table|could not find the .* column|schema cache/i.test(
      msg,
    )
  );
}

/**
 * A escrita foi RECUSADA por não haver base de dados ligada em produção (ver
 * `assertWritableInProd`): gravar num ficheiro efémero seria perder os dados no
 * deploy seguinte e dizer à equipa que ficaram guardados.
 *
 * Tal como a tabela em falta, isto não é uma avaria — é uma instalação
 * incompleta, e quem está do outro lado merece ouvir isso em vez de "Erro
 * interno".
 */
export function isPersistenceUnavailable(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    typeof (err as { message?: unknown }).message === "string" &&
    (err as { message: string }).message.startsWith("Persistence unavailable")
  );
}

/**
 * Erro de chave duplicada com a FORMA do que o Postgres devolve (SQLSTATE
 * 23505), para o backend de ficheiro poder recusar um id repetido tal como a
 * chave primária o recusa no Supabase.
 *
 * A forma importa: quem chama não olha para o backend, olha para o erro.
 * `saveOverviewField` decide pelo `isUniqueViolation` se aquilo foi um conflito
 * (dois dispositivos a estrear o campo) ou uma avaria; `createContractIfAbsent`
 * conta com o insert a perder a corrida para não emitir um segundo sinal. Se o
 * ficheiro deixasse passar o duplicado, essas decisões mudavam consoante o
 * backend — e é precisamente isso que aqui não pode acontecer.
 */
function duplicateKeyError(table: string, id: string): Error {
  return Object.assign(
    new Error(`duplicate key value violates unique constraint "${table}_pkey" — id "${id}"`),
    { code: "23505" },
  );
}

// ── Supabase backend ──────────────────────────────────────────────────────
export class SupabaseBackend<T> implements Backend<T> {
  constructor(
    private readonly m: Mapper<T>,
    private readonly sb: SupabaseClient,
  ) {}

  private get cols() {
    return this.m.selectColumns ?? "*";
  }

  /** For `touch` tables, `get` also selects updated_at so persist can CAS on it. */
  private get colsWithStamp() {
    if (!this.m.touch || this.cols === "*") return this.cols;
    return `${this.cols}, updated_at`;
  }

  // updated_at as of the read, keyed by the entity object `get` returned.
  // WeakMap: entries vanish with the entities, nothing to clean up.
  private stamps = new WeakMap<object, string | null>();

  private map = (r: unknown) => this.m.fromRow(r as Record<string, unknown>);

  async list(): Promise<T[]> {
    const limit = this.m.listLimit; // undefined ⇒ fetch everything (no cap)
    const base = this.sb.from(this.m.table).select(this.cols);
    const ordered = this.m.order
      ? base.order(this.m.order.column, { ascending: this.m.order.ascending })
      : base;
    const { data, error } = await (limit != null ? ordered.limit(limit) : ordered);
    if (error) throw error;
    const rows = data ?? [];
    // Only an EXPLICIT opt-in limit can truncate — and never silently: a full
    // page is the signal that real pagination is needed.
    if (limit != null && rows.length >= limit) {
      log.warn("list() hit the configured row cap — results may be truncated", {
        table: this.m.table,
        limit,
      });
    }
    return rows.map(this.map);
  }

  async get(id: string): Promise<T | null> {
    const { data, error } = await this.sb
      .from(this.m.table)
      .select(this.colsWithStamp)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const entity = this.map(data);
    if (this.m.touch && entity && typeof entity === "object") {
      const stamp = (data as unknown as Record<string, unknown>).updated_at;
      this.stamps.set(entity as object, typeof stamp === "string" ? stamp : null);
    }
    return entity;
  }

  async query(column: string, value: unknown): Promise<T[]> {
    const base = this.sb.from(this.m.table).select(this.cols).eq(column, value);
    const q = this.m.order
      ? base.order(this.m.order.column, { ascending: this.m.order.ascending })
      : base;
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(this.map);
  }

  async insert(entity: T): Promise<void> {
    const { error } = await this.sb.from(this.m.table).insert(this.m.toRow(entity));
    if (error) throw error;
  }

  async persist(id: string, merged: T, cas?: T): Promise<void> {
    const row = this.m.toRow(merged);
    if (this.m.touch) row.updated_at = new Date().toISOString();

    // Optimistic locking: only write if the row still carries the updated_at
    // we read. Zero rows updated ⇒ someone else wrote in between ⇒ conflict.
    const stamp = cas && typeof cas === "object" ? this.stamps.get(cas as object) : undefined;
    if (stamp !== undefined) {
      const base = this.sb.from(this.m.table).update(row).eq("id", id);
      const guarded = stamp === null ? base.is("updated_at", null) : base.eq("updated_at", stamp);
      const { data, error } = await guarded.select("id");
      if (error) throw error;
      if (!data?.length) throw new ConflictError<T>(id, { table: this.m.table, attempted: merged });
      return;
    }

    const { error } = await this.sb.from(this.m.table).update(row).eq("id", id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from(this.m.table).delete().eq("id", id);
    if (error) throw error;
  }
}

// ── File backend (dev fallback) ───────────────────────────────────────────
export class FileBackend<T> implements Backend<T> {
  private readonly file: string;
  // Serialize mutating ops: each does read → modify → write with an `await` in the
  // middle, so two concurrent inserts would both read the pre-write array and the
  // second write would clobber the first (lost update). Chaining them through this
  // tail makes read-modify-write atomic within the process.
  //
  // A fila vive na INSTÂNCIA, por isso só serializa quem partilha a instância:
  // ver `createRepository`, que guarda um único FileBackend por repositório
  // exactamente por causa disto.
  private tail: Promise<unknown> = Promise.resolve();
  // Instantâneo de cada linha tal como o `get` a devolveu, indexado pela própria
  // entidade. É o que o `updated_at` é para o backend Supabase — aqui a linha
  // inteira, porque o ficheiro não tem coluna de versão. WeakMap: as entradas
  // desaparecem com as entidades, não há nada para limpar.
  private snapshots = new WeakMap<object, string>();

  constructor(
    private readonly m: Mapper<T>,
    baseDir: string,
  ) {
    this.file = path.join(baseDir, m.fileName);
  }

  private serialize<R>(fn: () => Promise<R>): Promise<R> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  private async read(): Promise<T[]> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf-8")) as T[];
    } catch {
      return [];
    }
  }

  private async write(rows: T[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(rows, null, 2));
  }

  // The file backend is a DEV fallback only. In production it means Supabase is
  // unconfigured (env.ts already flags this critical) — so a write would land in
  // an ephemeral file that vanishes on the next deploy, i.e. silent data loss
  // reported to the caller as success. Refuse the write loudly instead: the POST
  // route then treats the lead as un-persisted and falls back to email + an
  // honest error, and the miss reaches alerting via log.error. Reads still work.
  private assertWritableInProd(): void {
    if (process.env.NODE_ENV === "production") {
      log.error(
        "repository: gravação recusada — Supabase não configurado em produção; o fallback para ficheiro é volátil. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
        undefined,
        { file: this.m.fileName },
      );
      throw new Error("Persistence unavailable: Supabase not configured in production");
    }
  }

  async list(): Promise<T[]> {
    const all = await this.read();
    return this.m.fileCompare ? [...all].sort(this.m.fileCompare) : all;
  }

  async get(id: string): Promise<T | null> {
    const found = (await this.read()).find((e) => this.m.getId(e) === id) ?? null;
    // Guarda a linha como estava nesta leitura, para o `persist` poder recusar
    // escrever por cima de uma versão que entretanto mudou.
    if (found && typeof found === "object") {
      this.snapshots.set(found as object, JSON.stringify(found));
    }
    return found;
  }

  async query(_column: string, _value: unknown, predicate: (e: T) => boolean): Promise<T[]> {
    const all = await this.list();
    return all.filter(predicate);
  }

  async insert(entity: T): Promise<void> {
    this.assertWritableInProd();
    const id = this.m.getId(entity);
    return this.serialize(async () => {
      const all = await this.read();
      // A chave primária que o Supabase impõe tem de valer aqui também: sem
      // esta guarda, dois aceites em corrida punham DOIS contratos na mesma
      // proposta (e dois sinais a caminho do cliente), porque o `insert` de
      // ficheiro nunca perdia a corrida que o índice único faz perder.
      if (all.some((e) => this.m.getId(e) === id)) throw duplicateKeyError(this.m.table, id);
      all.push(entity);
      await this.write(all);
    });
  }

  async persist(id: string, merged: T, cas?: T): Promise<void> {
    this.assertWritableInProd();
    const expected = cas && typeof cas === "object" ? this.snapshots.get(cas as object) : undefined;
    return this.serialize(async () => {
      const all = await this.read();
      const idx = all.findIndex((e) => this.m.getId(e) === id);
      if (idx === -1) return;
      // Bloqueio optimista, o mesmo que o backend Supabase faz sobre o
      // `updated_at`: se a linha já não é a que foi lida, alguém escreveu no
      // meio e o `updateWith` tem de reler e voltar a aplicar a alteração —
      // sobrepor aqui apagaria o trabalho dessa pessoa sem ninguém dar por isso.
      if (expected !== undefined && JSON.stringify(all[idx]) !== expected) {
        throw new ConflictError<T>(id, {
          table: this.m.table,
          current: all[idx],
          attempted: merged,
        });
      }
      all[idx] = merged;
      await this.write(all);
    });
  }

  async remove(id: string): Promise<void> {
    this.assertWritableInProd();
    return this.serialize(async () => {
      const all = await this.read();
      await this.write(all.filter((e) => this.m.getId(e) !== id));
    });
  }
}

// ── Repository ─────────────────────────────────────────────────────────────
export class Repository<T> {
  /** `getBackend` is a thunk so backend selection stays lazy (per call), matching the previous getSupabase()-per-method behaviour. */
  constructor(
    private readonly mapper: Mapper<T>,
    private readonly getBackend: () => Backend<T>,
  ) {}

  list(): Promise<T[]> {
    return this.getBackend().list();
  }

  get(id: string): Promise<T | null> {
    return this.getBackend().get(id);
  }

  /** Filtered list. `column` is the snake_case DB column; `predicate` is the equivalent for the file backend. */
  where(column: string, value: unknown, predicate: (e: T) => boolean): Promise<T[]> {
    return this.getBackend().query(column, value, predicate);
  }

  create(entity: T): Promise<void> {
    return this.getBackend().insert(entity);
  }

  /** Read-merge-write update. Returns the merged entity, or null if not found. */
  update(id: string, updates: Partial<T>): Promise<T | null> {
    return this.updateWith(id, (current) => ({ ...current, ...updates }) as T);
  }

  /**
   * Read-mutate-write update with optimistic locking. `mutate` derives the new
   * entity from the freshly-read current one (the right tool for appends —
   * activity log, payments — where spreading a stale copy would drop a
   * concurrent write). On conflict the read+mutate is retried, so the change
   * is always applied on top of the latest state.
   */
  async updateWith(id: string, mutate: (current: T) => T): Promise<T | null> {
    const backend = this.getBackend();
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; ; attempt++) {
      const current = await backend.get(id);
      if (!current) return null;
      let merged = mutate(current);
      if (this.mapper.beforeUpdate) merged = this.mapper.beforeUpdate(merged);
      try {
        await backend.persist(id, merged, current);
        return merged;
      } catch (err) {
        if (!isConflictError(err)) throw err;
        if (attempt >= MAX_ATTEMPTS) {
          // Três voltas e o registo continua a mudar debaixo dos pés. Isto já
          // não é uma corrida entre dois cliques — é gente a trabalhar sobre a
          // mesma linha ao mesmo tempo, e a resposta certa é dizê-lo, não
          // insistir até uma das versões vencer por sorte.
          //
          // Relemos de propósito antes de desistir: o `current` desta volta já
          // é velho (foi por isso que a escrita falhou), e quem vai mostrar as
          // duas versões lado a lado precisa da do servidor, não de uma
          // terceira. Se a releitura falhar, vale a que temos — nunca ficamos
          // sem `current`.
          const doServidor = await backend.get(id).catch(() => null);
          throw new ConflictError<T>(id, {
            table: this.mapper.table,
            current: doServidor ?? current,
            attempted: merged,
          });
        }
        // Uma pausa curta e desigual entre tentativas. Sem ela as três voltas
        // acontecem no mesmo instante e disputam a mesma janela: quem perdeu a
        // primeira perde as três, e o conflito sobe sem ter havido repetição
        // nenhuma na prática. O acaso separa duas escritas que arrancaram
        // juntas (dois separadores, dois telemóveis na mesma checklist).
        await new Promise((r) => setTimeout(r, attempt * 5 + Math.random() * 10));
      }
    }
  }

  remove(id: string): Promise<void> {
    return this.getBackend().remove(id);
  }
}

/** Build a repository that targets Supabase when configured, else the dev file. */
export function createRepository<T>(mapper: Mapper<T>): Repository<T> {
  const baseDir = path.join(process.cwd(), "data");
  // UM só FileBackend por repositório. A fila de escrita e os instantâneos do
  // bloqueio optimista vivem na instância: dar uma instância nova a cada
  // chamada — como se fazia aqui — dava a cada operação uma fila vazia e uma
  // memória em branco, e as duas protecções ficavam a não fazer nada. Duas
  // criações em simultâneo liam ambas o mesmo array e a segunda escrita
  // apagava a primeira, que é precisamente o que a fila existe para impedir.
  //
  // A ESCOLHA do backend continua a ser feita a cada chamada: o Supabase pode
  // passar a estar configurado a meio da vida do processo.
  let fileBackend: FileBackend<T> | null = null;
  return new Repository<T>(mapper, () => {
    const sb = getSupabase();
    if (sb) return new SupabaseBackend<T>(mapper, sb);
    return (fileBackend ??= new FileBackend<T>(mapper, baseDir));
  });
}
