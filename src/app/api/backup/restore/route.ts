import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { RESTORE_CONFIRM_PHRASE } from "@/lib/backup-restore-types";
import { buildBackupPayload } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REPOR UMA CÓPIA DE SEGURANÇA — a operação mais destrutiva do sistema.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `GET /api/backup` sabia exportar e não havia forma nenhuma de repor: o
 * próprio ficheiro dizia "repor exige carregar estas tabelas à mão". Isto é a
 * outra metade — e escreve por cima de faturas com numeração fiscal legalmente
 * relevante, de contratos aceites por clientes e de propostas enviadas.
 *
 * ── O percurso, em dois passos OBRIGATÓRIOS ─────────────────────────────
 *
 *   1. ENSAIO (`POST` sem `confirm`). Valida o ficheiro inteiro, lê a base de
 *      dados e devolve o PLANO: quantos registos por conjunto, quantos já
 *      existem, quantos seriam substituídos, quantos criados, quantos
 *      DESAPARECEM — e os avisos. Não escreve absolutamente nada. É isto que
 *      acontece ao carregar o ficheiro.
 *
 *   2. REPOSIÇÃO (`POST` com `confirm: "REPOR TUDO"` + o `fileHash` que o
 *      ensaio devolveu). O `fileHash` amarra a confirmação AO FICHEIRO que foi
 *      pré-visualizado: trocar de ficheiro entre os dois passos dá 409, nunca
 *      uma reposição do ficheiro errado com o plano do outro.
 *
 * ── O que se recusa a fazer ──────────────────────────────────────────────
 *
 *   · Sem sessão de administrador (401), como todas as rotas do back office.
 *   · Com o ficheiro a falhar validação (400) — e diz o conjunto e a linha.
 *   · Se não conseguir LER o estado actual de algum conjunto (409): sem saber
 *     o que lá está não há cópia de recuo fiável.
 *   · Se a cópia do estado actual sair INCOMPLETA (409): é a rede de segurança
 *     inteira desta operação, e uma rede com um buraco não é uma rede.
 *
 * ── O módulo destrutivo nem sequer é carregado sem sessão ────────────────
 * `@/lib/backup-restore` é importado dinamicamente DEPOIS do `isAuthed`. Além
 * de ser mais uma tranca, mantém os `mapper` dos stores fora do grafo de
 * importação de quem só testa a guarda de autenticação.
 *
 * ── LIMITE CONHECIDO: o tamanho do ficheiro ─────────────────────────────
 * A cópia vai INTEIRA no corpo do pedido. As plataformas de alojamento
 * costumam ter um tecto para o corpo de um pedido (na Vercel são ~4,5 MB), e um
 * ficheiro acima disso é recusado pela infraestrutura ANTES de chegar aqui —
 * a rota nunca corre e a resposta é um 413. Nesse caso a reposição tem de ser
 * feita a partir do servidor (ou do `psql`), e o ecrã diz isso por extenso em
 * vez de deixar o erro passar por "falha de ligação". O que empurra a cópia
 * para cima deste tecto são os `termsSnapshot` dos contratos e os documentos
 * das propostas; uma reposição em pedaços (um conjunto de cada vez) é o passo
 * seguinte se isto começar a acontecer.
 */

/** Corpo aceite. Deliberadamente pequeno: o ficheiro vem em `backup`. */
interface RestoreBody {
  backup?: unknown;
  confirm?: unknown;
  fileHash?: unknown;
}

/** Impressão digital do ficheiro pré-visualizado. Serve só para amarrar a
 *  confirmação ao ensaio — não é uma prova criptográfica de nada. */
function hashOf(backup: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(backup) ?? "")
    .digest("hex")
    .slice(0, 32);
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { validateBackupFile, planRestore, applyRestore } = await import("@/lib/backup-restore");

  try {
    const body = (await request.json().catch(() => null)) as RestoreBody | null;
    if (!body || typeof body !== "object" || body.backup === undefined) {
      return NextResponse.json(
        { error: "Falta o ficheiro da cópia de segurança (campo `backup`)." },
        { status: 400 },
      );
    }

    // ── Passo 0: validar o ficheiro INTEIRO. Nada é escrito antes disto. ──
    const validation = validateBackupFile(body.backup);
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "A cópia de segurança não passou na validação — nada foi alterado.",
          errors: validation.errors,
        },
        { status: 400 },
      );
    }
    const file = validation.file;
    const fileHash = hashOf(body.backup);

    // ── Passo 1: o ensaio. Lê tudo, escreve nada. ──
    const plan = await planRestore(file);

    const confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";
    if (!confirm) {
      return NextResponse.json({ dryRun: true, fileHash, plan });
    }

    // ── Daqui para baixo é a reposição REAL. Todas as trancas antes de escrever. ──
    if (confirm.toUpperCase() !== RESTORE_CONFIRM_PHRASE) {
      return NextResponse.json(
        {
          error: `Para repor tem de escrever exatamente “${RESTORE_CONFIRM_PHRASE}”. Nada foi alterado.`,
          fileHash,
          plan,
        },
        { status: 400 },
      );
    }

    if (body.fileHash !== fileHash) {
      return NextResponse.json(
        {
          error:
            "O ficheiro não é o mesmo que foi pré-visualizado. Volte a carregá-lo e reveja o ensaio antes de repor. Nada foi alterado.",
          fileHash,
          plan,
        },
        { status: 409 },
      );
    }

    if (plan.unreadable.length) {
      return NextResponse.json(
        {
          error:
            "Reposição RECUSADA: não foi possível ler o estado actual de " +
            `${plan.unreadable.map((u) => u.label).join(", ")}. Sem isso não há cópia fiável do que está lá agora. Nada foi alterado.`,
          plan,
        },
        { status: 409 },
      );
    }

    // ── Passo 2: a cópia do estado ACTUAL, antes de lhe tocar. ──
    // É o que torna uma reposição feita por engano reversível. Se sair
    // incompleta, desiste-se: apagar dados sem rede é o que esta rota existe
    // para não fazer.
    let snapshotBefore: Awaited<ReturnType<typeof buildBackupPayload>>;
    try {
      snapshotBefore = await buildBackupPayload();
    } catch (err) {
      log.error("restauro: a cópia do estado actual falhou — reposição CANCELADA", err);
      return NextResponse.json(
        {
          error:
            "Reposição CANCELADA: não foi possível fazer a cópia do estado actual, e sem ela isto não seria reversível. Nada foi alterado.",
        },
        { status: 409 },
      );
    }
    if (snapshotBefore.incomplete.length) {
      log.error("restauro: cópia do estado actual INCOMPLETA — reposição CANCELADA", undefined, {
        incomplete: snapshotBefore.incomplete,
      });
      return NextResponse.json(
        {
          error:
            "Reposição CANCELADA: a cópia do estado actual ficou incompleta em " +
            `${snapshotBefore.incomplete.join(", ")}. Sem uma cópia completa, uma reposição por engano não teria volta. Nada foi alterado.`,
          incomplete: snapshotBefore.incomplete,
        },
        { status: 409 },
      );
    }

    // ── Passo 3: escrever. ──
    log.info("restauro: a repor cópia de segurança", {
      exportedAt: file.exportedAt,
      registosActuais: plan.totals.current,
      registosNaCopia: plan.totals.incoming,
    });
    const result = await applyRestore(file, plan);

    const failed = [...result.failed, ...result.countersFailed];
    if (failed.length) {
      log.error("restauro: terminou com conjuntos POR REPOR", undefined, {
        failed: failed.map((f) => f.key),
      });
    }

    return NextResponse.json(
      {
        dryRun: false,
        ok: failed.length === 0,
        plan,
        applied: result.applied,
        failed,
        counters: result.counters,
        snapshotBefore,
      },
      // 207: uma reposição em que algum conjunto ficou por repor não é um
      // sucesso, e um 200 diria que foi. O corpo diz quais, pelo nome.
      { status: failed.length ? 207 : 200 },
    );
  } catch (err) {
    log.error("restauro POST falhou", err);
    return NextResponse.json(
      { error: "Erro interno ao repor a cópia de segurança." },
      { status: 500 },
    );
  }
}
