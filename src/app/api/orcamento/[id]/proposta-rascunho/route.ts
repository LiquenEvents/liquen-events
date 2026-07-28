import { NextRequest, NextResponse } from "next/server";
import { isAuthed, ADMIN_NAME_COOKIE } from "@/lib/admin-auth";
import {
  getProposalDraft,
  saveProposalDraft,
  clearProposalDraft,
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

    const saved = await saveProposalDraft(id, body.doc, whoIsSaving(request));
    return NextResponse.json({
      ok: true,
      updatedAt: saved.updatedAt,
      overwrote,
      ...(overwrote && current?.savedBy ? { previousBy: current.savedBy } : {}),
    } satisfies { ok: true; updatedAt: string; overwrote: boolean; previousBy?: string });
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
    await clearProposalDraft(id);
    return NextResponse.json({ ok: true } satisfies { ok: true });
  } catch (err) {
    log.error("proposta-rascunho DELETE falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export type { StoredProposalDraft };
