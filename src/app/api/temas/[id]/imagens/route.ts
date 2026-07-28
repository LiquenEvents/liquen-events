import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme } from "@/lib/themes-store";
import {
  listThemeImagePage,
  uploadThemeImage,
  deleteThemeImage,
  isThemePath,
  themeIdOfPath,
  themeFolder,
  type ThemeThumbInput,
} from "@/lib/theme-storage";
import { THEME_PAGE_SIZE, MAX_THEME_PAGE_SIZE } from "@/lib/theme-types";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB por imagem
/** Uma miniatura acima disto é um erro do cliente, não uma miniatura. É
 *  ignorada (fica a foto sem miniatura), nunca recusa o carregamento. */
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const OK_TYPES = /^image\/(jpe?g|png|webp)$/i;

/**
 * Resposta a uma falha inesperada: se o Storage nem sequer está configurado, a
 * causa é essa (503, e não um "erro interno" que manda a Catarina procurar um
 * problema que não existe); caso contrário é mesmo um 500.
 */
function failed(message: string, err: unknown, id: string) {
  log.error(message, err, { id });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  return NextResponse.json({ error: "Erro interno" }, { status: 500 });
}

/** Um inteiro >= 0 vindo da query string; `fallback` para tudo o resto. */
function num(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

/**
 * UMA PÁGINA das fotos de um tema: `?offset=&limit=`.
 *
 * Devolve `{ ok, images, total, truncated }`. Só a página pedida é assinada —
 * abrir um tema com 3000 fotos custa o mesmo que abrir um com 30. Cada foto
 * traz `url` (o ORIGINAL, que é o que vai para a proposta) e, quando existe,
 * `thumbUrl` — a miniatura, que é o que a grelha deve mostrar. As fotos
 * carregadas antes de as miniaturas existirem vêm sem `thumbUrl`.
 *
 * `ok: false` (com 200) quer dizer "a pasta não pôde ser lida agora", que a UI
 * mostra como "Fotos indisponíveis" — nunca como um tema vazio.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // O tema inexistente é um `return` (404), nunca uma exceção — um 404
    // legítimo não pode sair daqui disfarçado de 500.
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

    const q = request.nextUrl.searchParams;
    // Teto rígido: um `?limit=5000` mandaria assinar a biblioteca inteira num
    // pedido. Corta-se em silêncio (o cliente pagina), não se recusa.
    const limit = Math.min(Math.max(1, num(q.get("limit"), THEME_PAGE_SIZE)), MAX_THEME_PAGE_SIZE);
    const offset = num(q.get("offset"), 0);
    // A ordem arrumada à mão (se existir) manda no início da lista; a pasta
    // continua a mandar no resto. O tema já foi lido acima, não custa nada.
    return NextResponse.json(await listThemeImagePage(id, limit, offset, theme.photoOrder ?? []));
  } catch (err) {
    return failed("temas imagens GET falhou", err, id);
  }
}

/**
 * Recolhe as miniaturas que vieram no formulário, emparelhadas com os
 * ficheiros pela ORDEM (o campo `thumbs` é opcional).
 *
 * Ou os dois campos têm o mesmo comprimento, ou não há emparelhamento
 * possível: pelo índice, uma miniatura a menos passaria a acompanhar a foto
 * errada — uma foto com a miniatura de outra é pior do que foto nenhuma. O
 * cliente que não consiga gerar uma miniatura deve enviar um marcador vazio no
 * lugar dela (`new Blob([])`), que aqui simplesmente não conta.
 */
function pairThumbs(files: File[], form: FormData): (File | null)[] {
  const thumbs = form.getAll("thumbs").filter((f): f is File => f instanceof File);
  if (thumbs.length === 0) return files.map(() => null);
  if (thumbs.length !== files.length) {
    log.warn("temas: miniaturas ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      thumbs: thumbs.length,
    });
    return files.map(() => null);
  }
  return thumbs.map((t) => {
    if (t.size === 0) return null; // marcador: esta foto vem sem miniatura
    if (!OK_TYPES.test(t.type) || t.size > MAX_THUMB_BYTES) {
      log.warn("temas: miniatura descartada", { tipo: t.type, bytes: t.size });
      return null;
    }
    return t;
  });
}

/**
 * Carrega fotos para a pasta de um tema. Aceita multipart/form-data com um ou
 * mais `files` e, opcionalmente, os `thumbs` correspondentes pela mesma ordem —
 * as miniaturas são feitas no navegador, a partir do mesmo bitmap já
 * descodificado para comprimir o original.
 *
 * A miniatura é um acessório: falhar a guardá-la deixa a foto sem miniatura
 * (a grelha mostra o original), nunca faz o carregamento falhar.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento indisponível — configure o Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).",
      },
      { status: 503 },
    );
  }
  const { id } = await params;
  const theme = await getTheme(id);
  if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Nenhuma imagem recebida." }, { status: 400 });
  }
  const thumbs = pairThumbs(files, form);

  const uploaded = [];
  for (const [i, file] of files.entries()) {
    if (!OK_TYPES.test(file.type)) {
      return NextResponse.json(
        { error: `Formato não suportado: ${file.name}. Use JPG, PNG ou WEBP.` },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Imagem demasiado grande: ${file.name} (máx. 12 MB).` },
        { status: 413 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const thumb = thumbs[i];
    const thumbInput: ThemeThumbInput | undefined = thumb
      ? { bytes: Buffer.from(await thumb.arrayBuffer()), contentType: thumb.type }
      : undefined;
    const res = await uploadThemeImage(id, bytes, file.type, thumbInput);
    if (!res) {
      log.error("temas: upload falhou", null, { id, name: file.name });
      return NextResponse.json({ error: "Falha ao guardar a imagem." }, { status: 502 });
    }
    uploaded.push(res);
  }

  return NextResponse.json({ ok: true, images: uploaded });
}

/** Remove UMA foto do tema: `?path=<themeId>/<ficheiro>`. A miniatura sai com
 *  ela (melhor esforço — uma miniatura órfã nunca impede apagar a foto). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const path = request.nextUrl.searchParams.get("path") ?? "";
    // O caminho tem de ser um ficheiro DENTRO da pasta deste tema — nunca de
    // outro tema, nunca com travessia de diretórios.
    if (!isThemePath(path) || themeIdOfPath(path) !== themeFolder(id)) {
      return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
    }
    const ok = await deleteThemeImage(path);
    if (!ok) return NextResponse.json({ error: "Falha ao remover a imagem." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed("temas imagens DELETE falhou", err, id);
  }
}
