import { NextRequest, NextResponse } from "next/server";
import { isAuthed, ADMIN_NAME_COOKIE } from "@/lib/admin-auth";
import {
  getProposalDraft,
  saveProposalDraft,
  clearProposalDraft,
  ehFalhaPermanente,
  porqueNaoGuardou,
  type StoredProposalDraft,
} from "@/lib/proposal-drafts";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Teto do tamanho de um rascunho. Um documento do estúdio são alguns KB
 * (caminhos de fotos, textos e números — nunca bytes de imagem). 512 KB é
 * folgado para o maior casamento e trava, na mesma, um cliente avariado a
 * tentar guardar meio megabyte de lixo a cada meio segundo.
 */
const MAX_DRAFT_BYTES = 512 * 1024;

/** Quem está a gravar, para o aviso poder dizer "alterado pela Catarina" em vez
 *  de "alterado noutro sítio". É só um nome escrito no login — não é
 *  identidade nem autorização (isso é o `isAuthed`), por isso limita-se o
 *  tamanho e mais nada. */
function whoIsSaving(request: NextRequest): string | undefined {
  // Defensivo de propósito: é um enfeite da mensagem de aviso. Se o nome não
  // estiver ao alcance, o rascunho grava-se na mesma — falhar uma gravação por
  // causa de uma etiqueta seria trocar o essencial pelo acessório.
  const raw = request.cookies?.get?.(ADMIN_NAME_COOKIE)?.value?.trim();
  return raw ? raw.slice(0, 40) : undefined;
}

/** O rascunho guardado no servidor para este pedido (null se não houver). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ ok: true, draft: await getProposalDraft(id) });
  } catch (err) {
    log.error("proposta-rascunho GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Grava o rascunho. Última escrita vence — o estúdio é usado por uma equipa
 * pequena e bloquear a edição seria pior do que o problema. Mas a escrita não
 * é cega: quem grava manda o `baseUpdatedAt` que leu, e se entretanto alguém
 * gravou por cima a resposta di-lo (`overwrote`), para o estúdio poder avisar
 * em vez de a alteração desaparecer em silêncio.
 *
 * ── E QUANDO A GRAVAÇÃO NÃO ACONTECE ──────────────────────────────────────
 *
 * Esta rota respondia `{ ok: true }` mesmo quando o `app_state` recusava a
 * escrita — porque `saveProposalDraft` devolvia o rascunho na mesma e não havia
 * como saber. O estúdio escrevia «guardado às 14:32» e o trabalho ficava só no
 * `localStorage` daquele portátil. Foi assim que uma proposta inteira
 * desapareceu para quem a foi ver noutro computador.
 *
 * Agora responde **503 com `guardado: false`**, e não 500: isto não é uma
 * avaria do pedido — o pedido foi entendido, o rascunho é válido, e a edição
 * continua a poder seguir. É o ARMAZENAMENTO que não está disponível, e é
 * exactamente isso que o 503 diz. `permanente` diz ao estúdio se vale a pena
 * tentar outra vez (rede) ou se é a instalação que está incompleta.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("doc" in body)) {
      return NextResponse.json({ error: "Rascunho em falta." }, { status: 400 });
    }
    const serialised = JSON.stringify(body.doc ?? null);
    if (serialised.length > MAX_DRAFT_BYTES) {
      return NextResponse.json({ error: "Rascunho demasiado grande." }, { status: 413 });
    }

    const current = await getProposalDraft(id);
    const base = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : null;
    const overwrote = Boolean(current && base && current.updatedAt !== base);

    const { draft: saved, persistencia } = await saveProposalDraft(
      id,
      body.doc,
      whoIsSaving(request),
    );
    if (!persistencia.gravado) {
      const motivo = persistencia.motivo;
      log.error("proposta-rascunho: NÃO guardado — o trabalho ficou só no navegador", null, {
        id,
        motivo,
      });
      return NextResponse.json(
        {
          ok: false,
          guardado: false,
          motivo,
          permanente: ehFalhaPermanente(motivo),
          erro: porqueNaoGuardou(motivo),
        },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      guardado: true,
      updatedAt: saved.updatedAt,
      overwrote,
      ...(overwrote && current?.savedBy ? { previousBy: current.savedBy } : {}),
    } satisfies {
      ok: true;
      guardado: true;
      updatedAt: string;
      overwrote: boolean;
      previousBy?: string;
    });
  } catch (err) {
    log.error("proposta-rascunho PUT falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** Descarta o rascunho (proposta enviada, ou limpo à mão no estúdio). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // Falhar a limpeza não perde trabalho — perde-se o contrário: o rascunho
    // fica onde estava e volta a aparecer na próxima abertura. Por isso continua
    // a ser 200. Mas o `apagado` diz a verdade, para o estúdio não prometer uma
    // limpeza que não houve.
    const { gravado } = await clearProposalDraft(id);
    return NextResponse.json({ ok: true, apagado: gravado } satisfies {
      ok: true;
      apagado: boolean;
    });
  } catch (err) {
    log.error("proposta-rascunho DELETE falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export type { StoredProposalDraft };
