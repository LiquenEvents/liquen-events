import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listThemes, createTheme } from "@/lib/themes-store";
import { listThemeFiles, signThemePaths, themeFolder, isThemePath } from "@/lib/theme-storage";
import { isUniqueViolation } from "@/lib/invoices-store";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import {
  MAX_THEME_NAME,
  MAX_THEME_NOTES,
  normalizedThemeName,
  themeNameTakenError,
  type ThemeSummary,
} from "@/lib/theme-types";
import { lerRegra } from "@/lib/biblioteca-types";
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

/** A base de dados não está sequer ligada — outra instalação incompleta, com
 *  outra resolução (as chaves do Supabase), por isso outra frase. */
const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação, por isso os temas não podem ser guardados. " +
  "Faltam as chaves do Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

/** Quantas fotos, além da capa, o cartão de um tema mostra empilhadas. Três
 *  chegam para dar uma ideia do conjunto sem transformar o cartão numa grelha. */
const PREVIEWS_POR_CARTAO = 3;

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
    // Mais algumas fotos por tema, para o cartão poder mostrar o CONJUNTO.
    // Continua a ser UMA assinatura em bloco para todos os temas — só com mais
    // caminhos lá dentro —, e os nomes já vinham na listagem que se fez acima:
    // não há aqui nem mais uma ida ao Storage.
    const extras = listings.map(({ names }, i) =>
      names.slice(0, PREVIEWS_POR_CARTAO + 1).map((n) => `${themeFolder(themes[i].id)}/${n}`),
    );
    const urls = await signThemePaths([
      ...new Set([...chosen, ...newest, ...extras.flat()].filter(Boolean)),
    ]);

    const summaries: ThemeSummary[] = themes.map((t, i) => {
      const { names, ok, truncated } = listings[i];
      const coverUrl = urls.get(chosen[i]) ?? urls.get(newest[i]);
      // A capa nunca se repete nas pré-visualizações: no cartão ela já está
      // à frente, e vê-la outra vez na pilha lê-se como um tema com fotos
      // repetidas.
      const previewUrls = extras[i]
        .map((p) => urls.get(p))
        .filter((u): u is string => Boolean(u) && u !== coverUrl)
        .slice(0, PREVIEWS_POR_CARTAO);
      return {
        ...t,
        imageCount: ok ? names.length : null,
        ...(ok && truncated ? { truncated: true } : {}),
        coverUrl,
        ...(previewUrls.length ? { previewUrls } : {}),
      };
    });
    return NextResponse.json(summaries);
  } catch (err) {
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
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

    // Um tema pode nascer como PERGUNTA GUARDADA: a equipa filtra a biblioteca
    // por etiquetas, gosta do resultado, e dá-lhe um nome. Uma regra que não
    // seja utilizável é recusada em vez de gravada como null — um tema-filtro
    // sem regra mostraria a biblioteca inteira, e ninguém perceberia porquê.
    const regra = lerRegra(body?.filterRule);
    if (body?.filterRule !== undefined && !regra) {
      return NextResponse.json({ error: "Filtro inválido." }, { status: 400 });
    }

    const theme = await createTheme({
      name,
      notes: str(body?.notes, MAX_THEME_NOTES) || undefined,
      ...(regra ? { kind: "filtro" as const, filterRule: regra } : {}),
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
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("temas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
