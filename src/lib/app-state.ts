import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getSupabase } from "./supabase";
import { isMissingTable } from "./repository";
import { log } from "./logger";

/**
 * Tiny persistent key-value state for operational markers (e.g. the inbox
 * high-water mark the cron uses for dedupe). Supabase-backed when configured —
 * a local file is EPHEMERAL on serverless, so markers stored there reset on
 * every deploy/instance swap. Falls back to data/app-state.json in dev.
 *
 * Never throws: a broken marker must degrade (worst case, a duplicate
 * notification), not take the caller down. Failures are logged.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MAS «NÃO LANÇA» NUNCA PODE QUERER DIZER «NÃO SE SABE»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `setState` apanhava o erro da escrita, registava-o, e fazia `return` — a
 * mesma coisa, vista de fora, que uma gravação bem sucedida. Enquanto isto
 * guardou apenas marcadores de operação (o UID do inbox, os fechos do Meta) o
 * pior que acontecia era uma notificação repetida, e o desenho estava certo.
 *
 * Deixou de estar no dia em que os RASCUNHOS do estúdio passaram a viver aqui.
 * O percurso, tal como aconteceu: uma colaboradora montou uma proposta inteira
 * — fotos, textos, orçamento —, a tabela `app_state` não existia naquela
 * instalação (o `db/schema.sql` estava por correr), cada gravação falhava, e
 * cada falha era engolida. `saveProposalDraft` devolvia o rascunho como se
 * estivesse guardado, a rota respondia OK, e o estúdio escreveu «guardado às
 * 14:32». Estava mesmo guardado — no `localStorage` daquele portátil. A dona do
 * negócio abriu noutro computador e não estava lá nada.
 *
 * Por isso `setState` passa a DIZER onde é que a coisa ficou. Continua a não
 * lançar (uma edição nunca pode falhar por a gravação ter falhado), e quem só
 * quer disparar e esquecer continua a escrever `await setState(...)` sem olhar
 * para o resultado — o que muda é que quem PRECISA de saber já pode perguntar.
 */
const FILE = path.join(process.cwd(), "data", "app-state.json");

/**
 * Porque é que a escrita não ficou. Não é decoração: cada um destes tem uma
 * resolução DIFERENTE do lado de quem gere a instalação, e é essa a diferença
 * entre um «Erro interno» que não indica caminho nenhum e uma frase que diz o
 * que fazer a seguir.
 *
 *  - `tabela-em-falta`  → falta correr o `db/schema.sql` no Supabase;
 *  - `sem-permissao`    → a tabela existe mas a chave usada não a pode escrever
 *                         (chave `anon` em vez da `service_role`, ou uma
 *                         política de RLS a recusar a linha);
 *  - `escrita-recusada` → tudo o resto: rede, tempo esgotado, avaria.
 */
export type MotivoDeFalha = "tabela-em-falta" | "sem-permissao" | "escrita-recusada";

/** Onde a escrita ficou mesmo. `ficheiro` é o recurso de desenvolvimento —
 *  serve o servidor local, e portanto é visível de qualquer navegador que fale
 *  com ele, mas é efémero em serverless (ver o cabeçalho). */
export type OndeFicou = "servidor" | "ficheiro" | "nenhures";

/**
 * O que aconteceu a uma escrita.
 *
 * `gravado` é a única coisa que a maior parte de quem chama precisa de olhar: é
 * a resposta à pergunta «isto sobrevive a este processo e a este navegador?».
 */
export interface ResultadoDeEscrita {
  gravado: boolean;
  onde: OndeFicou;
  motivo?: MotivoDeFalha;
}

/** Uma escrita recusada por falta de autorização — do Postgres (42501,
 *  `insufficient_privilege`) ou da política de RLS, que o PostgREST devolve com
 *  o mesmo código e a mensagem da política. */
function ehSemPermissao(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ((err as { code?: unknown }).code === "42501") return true;
  const msg = (err as { message?: unknown }).message;
  return (
    typeof msg === "string" &&
    /permission denied|row-level security|insufficient[_ ]privilege|not authorized|jwt/i.test(msg)
  );
}

function motivoDaFalha(err: unknown): MotivoDeFalha {
  if (isMissingTable(err)) return "tabela-em-falta";
  if (ehSemPermissao(err)) return "sem-permissao";
  return "escrita-recusada";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FALHA PASSAGEIRA NÃO PODE CUSTAR UM RASCUNHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mesmo desenho que `proposal-storage.descarregar` já usa para as fotos, e
 * pela mesma razão: uma ligação reciclada do outro lado, um pico no Supabase, e
 * a gravação morria à primeira. Aqui o que morre é a montagem de uma proposta.
 *
 * Duas tentativas extra, com pausa curta e crescente (150 ms, 300 ms), e um
 * tecto de tempo por tentativa — sem ele um pedido pendurado fica com a rota
 * inteira na mão até a plataforma matar a função.
 *
 * O que NÃO se repete: uma tabela em falta e uma permissão recusada. Essas
 * respondem exactamente o mesmo à terceira vez que à primeira, e repeti-las só
 * atrasa o momento em que o ecrã pode dizer a verdade.
 */
const TENTATIVAS = 3;
const PAUSA_MS = 150;
const TEMPO_POR_TENTATIVA_MS = 8000;

async function comTecto<T>(trabalho: PromiseLike<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      trabalho,
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error("tempo esgotado")), ms);
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

async function readFileState(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf-8"));
  } catch {
    return {};
  }
}

export async function getState<T>(key: string): Promise<T | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("app_state")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return (data?.value as T) ?? null;
    } catch (err) {
      log.error("app-state: leitura falhou (a tabela app_state existe? ver db/schema.sql)", err, {
        key,
      });
      return null;
    }
  }
  const all = await readFileState();
  return (all[key] as T) ?? null;
}

/**
 * Todas as entradas cuja chave começa por `prefix`.
 *
 * Existe por causa de UMA pergunta que não se conseguia responder de outra
 * maneira: *quais os rascunhos do estúdio que usam esta foto da Biblioteca?*
 * Os rascunhos vivem aqui, com a chave `proposal-draft:<pedido>` (ver
 * `proposal-drafts.ts`), e apagar uma foto sem saber quem a usa é a única
 * forma de a referência — em vez da cópia — poder perder trabalho.
 *
 * Não é para o caminho de leitura de nada: é uma varredura, chamada quando ela
 * apaga uma foto ou um tema. Por isso tem tecto, e o tecto é reportado a quem
 * chama em vez de ser escondido — uma varredura truncada não pode passar por
 * uma varredura completa numa decisão sobre perder fotos.
 */
export async function listStateByPrefix<T>(
  prefix: string,
  limite = 2000,
): Promise<{ entradas: { key: string; value: T }[]; completa: boolean }> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("app_state")
        .select("key, value")
        // `%` e `_` são curingas do LIKE: escapá-los impede que um prefixo com
        // um deles varra mais do que devia.
        .like("key", `${prefix.replace(/([%_\\])/g, "\\$1")}%`)
        .limit(limite + 1);
      if (error) throw error;
      const linhas = (data ?? []) as { key: string; value: T }[];
      return { entradas: linhas.slice(0, limite), completa: linhas.length <= limite };
    } catch (err) {
      log.error("app-state: varredura por prefixo falhou", err, { prefix });
      // Devolver "vazio e completo" faria quem chama concluir que ninguém usa a
      // foto. Vazio e INCOMPLETO é a verdade: não se sabe.
      return { entradas: [], completa: false };
    }
  }
  const all = await readFileState();
  const entradas = Object.entries(all)
    .filter(([k]) => k.startsWith(prefix))
    .map(([key, value]) => ({ key, value: value as T }));
  return { entradas: entradas.slice(0, limite), completa: entradas.length <= limite };
}

/**
 * Grava, e DIZ se gravou.
 *
 * Continua a não lançar — quem chama pode ignorar o resultado exactamente como
 * ignorava o `void`, e nada do que já existia muda de comportamento. Quem
 * escreve trabalho de uma pessoa (os rascunhos do estúdio) tem, agora, como
 * saber que não escreveu.
 */
export async function setState<T>(key: string, value: T): Promise<ResultadoDeEscrita> {
  const sb = getSupabase();
  if (sb) {
    let ultimoErro: unknown = null;
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        const { error } = await comTecto(
          sb.from("app_state").upsert({ key, value, updated_at: new Date().toISOString() }),
          TEMPO_POR_TENTATIVA_MS,
        );
        if (!error) return { gravado: true, onde: "servidor" };
        ultimoErro = error;
      } catch (err) {
        ultimoErro = err;
      }
      // Instalação incompleta: repetir dá a mesma resposta e só atrasa o aviso.
      if (motivoDaFalha(ultimoErro) !== "escrita-recusada") break;
      if (tentativa < TENTATIVAS) {
        await new Promise((r) => setTimeout(r, PAUSA_MS * tentativa));
      }
    }
    const motivo = motivoDaFalha(ultimoErro);
    log.error(
      "app-state: escrita falhou (a tabela app_state existe? ver db/schema.sql)",
      ultimoErro,
      {
        key,
        motivo,
      },
    );
    return { gravado: false, onde: "nenhures", motivo };
  }
  try {
    const all = await readFileState();
    all[key] = value;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2));
    return { gravado: true, onde: "ficheiro" };
  } catch (err) {
    log.error("app-state: escrita em ficheiro falhou", err, { key });
    return { gravado: false, onde: "nenhures", motivo: "escrita-recusada" };
  }
}
