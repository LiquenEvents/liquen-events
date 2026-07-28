import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listThemes, createTheme } from "@/lib/themes-store";
import { listThemeFiles, signThemePaths, themeFolder, isThemePath } from "@/lib/theme-storage";
import { isUniqueViolation } from "@/lib/invoices-store";
import { isMissingTable } from "@/lib/repository";
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

/**
 * A biblioteca só precisa de uma tabela — quando ela falta, dizer o que fazer
 * vale mais do que um 500 mudo. É recuperável (503), não uma avaria.
 */
const NAO_INSTALADO =
  "A Biblioteca de Temas ainda não está criada na base de dados. No Supabase → SQL Editor, " +
  "cole e corra o ficheiro db/schema.sql (pode repetir-se sem risco) e tente de novo.";

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Biblioteca de Temas — lista de temas do estúdio, cada um com o nº de fotos e
 * uma capa para o cartão. Só admin.
 *
 * O CUSTO é o que manda aqui: uma ida ao Storage por TEMA, nunca por foto.
 * Cada tema custa uma listagem de UMA página (sem assinaturas), e as capas de
 * todos os temas são assinadas de uma só vez no fim, num único pedido — o
 * bucket é o mesmo, as pastas é que diferem. Desenhar cartões nunca pode
 * significar ler pastas inteiras: com milhares de fotos por tema, a contagem
 * do cartão é assumidamente um MÍNIMO (`truncated`, que a UI mostra como
 * "500+"); o número exato vive no ecrã do tema, que pagina.
 *
 * A capa é a ESCOLHIDA (`coverPath`) e, se não houver — ou se a escolhida já
 * tiver sido apagada e não puder ser assinada —, a foto mais recente.
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

    // Duas hipóteses por tema — a escolhida e a mais recente —, ambas na mesma
    // assinatura em bloco: se a escolhida já não existir, a segunda responde
    // sem custar outra ida ao Storage.
    const chosen = themes.map((t) =>
      t.coverPath && isThemePath(t.coverPath) && t.coverPath.startsWith(`${themeFolder(t.id)}/`)
        ? t.coverPath
        : "",
    );
    const newest = listings.map(({ names }, i) =>
      names[0] ? `${themeFolder(themes[i].id)}/${names[0]}` : "",
    );
    const urls = await signThemePaths([...new Set([...chosen, ...newest].filter(Boolean))]);

    const summaries: ThemeSummary[] = themes.map((t, i) => {
      const { names, ok, truncated } = listings[i];
      return {
        ...t,
        imageCount: ok ? names.length : null,
        ...(ok && truncated ? { truncated: true } : {}),
        coverUrl: urls.get(chosen[i]) ?? urls.get(newest[i]),
      };
    });
    return NextResponse.json(summaries);
  } catch (err) {
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
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
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("temas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
