import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listThemes, createTheme } from "@/lib/themes-store";
import { listThemeFiles, signThemePaths, themeFolder } from "@/lib/theme-storage";
import { isUniqueViolation } from "@/lib/invoices-store";
import {
  MAX_THEME_NAME,
  MAX_THEME_NOTES,
  normalizedThemeName,
  themeNameTakenError,
  type ThemeSummary,
} from "@/lib/theme-types";
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
 * paralelo e SEM assinar nada: assinar é o passo caro, e só as capas — uma por
 * tema — precisam de URL. As assinaturas são pedidas todas de uma vez no fim,
 * num único pedido ao Storage (o bucket é o mesmo, as pastas é que diferem).
 *
 * Uma pasta ilegível não derruba a lista nem se disfarça de "0 fotos": esse
 * tema aparece com `imageCount: null` (o cartão mostra "Fotos indisponíveis")
 * e os outros continuam certos.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const themes = await listThemes();
    const listings = await Promise.all(themes.map((t) => listThemeFiles(t.id)));

    const covers = listings.map(({ names }, i) =>
      names[0] ? `${themeFolder(themes[i].id)}/${names[0]}` : "",
    );
    const urls = await signThemePaths(covers.filter(Boolean));

    const summaries: ThemeSummary[] = themes.map((t, i) => {
      const { names, ok, truncated } = listings[i];
      return {
        ...t,
        imageCount: ok ? names.length : null,
        ...(ok && truncated ? { truncated: true } : {}),
        coverUrl: urls.get(covers[i]),
      };
    });
    return NextResponse.json(summaries);
  } catch (err) {
    log.error("temas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** Cria um tema (só metadados; as fotos entram depois pela rota /imagens). */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  let name = "";
  try {
    const body = await request.json().catch(() => null);
    name = str(body?.name, MAX_THEME_NAME);
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    // Comparação como a equipa lê os nomes — sem acentos nem maiúsculas — para
    // que "Itália" e "Italia" não possam coexistir como temas distintos.
    const existing = await listThemes();
    if (existing.some((t) => normalizedThemeName(t.name) === normalizedThemeName(name))) {
      return NextResponse.json({ error: themeNameTakenError(name) }, { status: 409 });
    }

    const theme = await createTheme({
      name,
      notes: str(body?.notes, MAX_THEME_NOTES) || undefined,
    });
    return NextResponse.json({ ...theme, imageCount: 0 } satisfies ThemeSummary);
  } catch (err) {
    // Backstop de corrida: entre a verificação acima e o insert, uma criação
    // concorrente pode ter registado o mesmo nome — o índice único
    // (db/schema.sql: proposal_themes_name_uk) fá-lo falhar aqui. É um
    // duplicado (409), não um 500.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: themeNameTakenError(name) }, { status: 409 });
    }
    log.error("temas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
