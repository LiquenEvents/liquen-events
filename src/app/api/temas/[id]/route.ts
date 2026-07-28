import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme, updateTheme, deleteTheme, listThemes } from "@/lib/themes-store";
import { deleteThemeFolder } from "@/lib/theme-storage";
import { MAX_THEME_NAME, MAX_THEME_NOTES } from "@/lib/theme-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Renomeia / anota um tema. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    const patch: { name?: string; notes?: string } = {};

    if (body?.name !== undefined) {
      const name = str(body.name, MAX_THEME_NAME);
      if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
      const existing = await listThemes();
      if (existing.some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) {
        return NextResponse.json(
          { error: `Já existe um tema chamado "${name}".` },
          { status: 409 },
        );
      }
      patch.name = name;
    }
    if (body?.notes !== undefined) patch.notes = str(body.notes, MAX_THEME_NOTES) || undefined;

    const updated = await updateTheme(id, patch);
    if (!updated) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    log.error("temas PATCH falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Elimina um tema E as suas fotos. As propostas já feitas não são afetadas:
 * ao escolher fotos da biblioteca, os bytes são copiados para a pasta da
 * própria proposta, por isso não há referências pendentes para aqui.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });
    // Storage primeiro: se a limpeza falhar, o tema continua listado (e a
    // operação pode ser repetida) em vez de deixar fotos órfãs invisíveis.
    await deleteThemeFolder(id);
    await deleteTheme(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("temas DELETE falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
