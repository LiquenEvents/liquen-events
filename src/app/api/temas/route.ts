import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listThemes, createTheme } from "@/lib/themes-store";
import { listThemeImages } from "@/lib/theme-storage";
import { MAX_THEME_NAME, MAX_THEME_NOTES, type ThemeSummary } from "@/lib/theme-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Biblioteca de Temas — lista de temas do estúdio, cada um com o nº de fotos e
 * uma capa (a foto mais recente) para o cartão. Só admin.
 *
 * As contagens vêm do Storage (a pasta é a fonte de verdade), pedidas em
 * paralelo; sem Storage configurado cada tema aparece com 0 fotos em vez de a
 * lista inteira falhar.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const themes = await listThemes();
    const summaries: ThemeSummary[] = await Promise.all(
      themes.map(async (t) => {
        const images = await listThemeImages(t.id);
        return { ...t, imageCount: images.length, coverUrl: images[0]?.url };
      }),
    );
    return NextResponse.json(summaries);
  } catch (err) {
    log.error("temas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** Cria um tema (só metadados; as fotos entram depois pela rota /imagens). */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const name = str(body?.name, MAX_THEME_NAME);
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    const existing = await listThemes();
    if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: `Já existe um tema chamado "${name}".` }, { status: 409 });
    }

    const theme = await createTheme({
      name,
      notes: str(body?.notes, MAX_THEME_NOTES) || undefined,
    });
    return NextResponse.json({ ...theme, imageCount: 0 } satisfies ThemeSummary);
  } catch (err) {
    log.error("temas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
