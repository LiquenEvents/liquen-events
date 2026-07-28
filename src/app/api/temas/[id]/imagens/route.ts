import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme } from "@/lib/themes-store";
import {
  listThemeImages,
  uploadThemeImage,
  deleteThemeImage,
  isThemePath,
  themeIdOfPath,
  themeFolder,
} from "@/lib/theme-storage";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB por imagem
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

/** As fotos de um tema, com URL assinado fresco para pré-visualizar. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // O tema inexistente é um `return` (404), nunca uma exceção — um 404
    // legítimo não pode sair daqui disfarçado de 500.
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, images: await listThemeImages(id) });
  } catch (err) {
    return failed("temas imagens GET falhou", err, id);
  }
}

/**
 * Carrega fotos para a pasta de um tema. Aceita multipart/form-data com um ou
 * mais `files` — o cliente comprime e envia um ficheiro por pedido (o limite de
 * corpo do alojamento é ~4,5 MB), tal como no estúdio de propostas.
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

  const uploaded: { path: string; url: string }[] = [];
  for (const file of files) {
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
    const res = await uploadThemeImage(id, bytes, file.type);
    if (!res) {
      log.error("temas: upload falhou", null, { id, name: file.name });
      return NextResponse.json({ error: "Falha ao guardar a imagem." }, { status: 502 });
    }
    uploaded.push(res);
  }

  return NextResponse.json({ ok: true, images: uploaded });
}

/** Remove UMA foto do tema: `?path=<themeId>/<ficheiro>`. */
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
