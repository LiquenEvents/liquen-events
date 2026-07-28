import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme, updateTheme, deleteTheme, listThemes } from "@/lib/themes-store";
import { deleteThemeFolder } from "@/lib/theme-storage";
import { isUniqueViolation } from "@/lib/invoices-store";
import {
  MAX_THEME_NAME,
  MAX_THEME_NOTES,
  normalizedThemeName,
  themeNameTakenError,
} from "@/lib/theme-types";
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
  let name = "";
  try {
    const body = await request.json().catch(() => null);
    const patch: { name?: string; notes?: string } = {};

    if (body?.name !== undefined) {
      name = str(body.name, MAX_THEME_NAME);
      if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
      // Comparação como a equipa lê os nomes — sem acentos nem maiúsculas —
      // para que "Itália" e "Italia" não possam coexistir como temas distintos.
      const existing = await listThemes();
      const taken = existing.some(
        (t) => t.id !== id && normalizedThemeName(t.name) === normalizedThemeName(name),
      );
      if (taken) return NextResponse.json({ error: themeNameTakenError(name) }, { status: 409 });
      patch.name = name;
    }
    if (body?.notes !== undefined) patch.notes = str(body.notes, MAX_THEME_NOTES) || undefined;

    const updated = await updateTheme(id, patch);
    if (!updated) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    // Backstop de corrida: entre a verificação acima e a escrita, outro
    // pedido pode ter registado o mesmo nome — o índice único
    // (db/schema.sql: proposal_themes_name_uk) fá-lo falhar aqui. É um
    // duplicado (409), não um 500.
    if (name && isUniqueViolation(err)) {
      return NextResponse.json({ error: themeNameTakenError(name) }, { status: 409 });
    }
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
    // Storage primeiro, e só avançamos se ele CONFIRMAR a limpeza: apagar os
    // metadados com fotos por apagar deixava-as órfãs e invisíveis, sem forma
    // de lá voltar. Assim o tema continua listado e a ação pode ser repetida.
    const cleaned = await deleteThemeFolder(id);
    if (!cleaned.ok) {
      log.error("temas DELETE: limpeza do Storage falhou", null, { id, removed: cleaned.removed });
      return NextResponse.json(
        {
          error:
            "Não foi possível apagar as fotos do tema. O tema não foi eliminado — tente de novo.",
        },
        { status: 502 },
      );
    }
    await deleteTheme(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("temas DELETE falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
