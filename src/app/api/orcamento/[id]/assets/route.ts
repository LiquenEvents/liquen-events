import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { uploadProposalImage } from "@/lib/proposal-storage";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB per image
const OK_TYPES = /^image\/(jpe?g|png|webp)$/i;

/**
 * Admin-only upload of proposal mood-board / cover images to Supabase Storage.
 * Accepts multipart/form-data with one or more `files`; returns the stored
 * `path` + a signed `url` for each. Paths are persisted on the proposal doc so
 * the studio can re-open and re-edit a proposal without re-uploading.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
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
    const res = await uploadProposalImage(id, bytes, file.type);
    if (!res) {
      log.error("assets: upload falhou", null, { id, name: file.name });
      return NextResponse.json({ error: "Falha ao guardar a imagem." }, { status: 502 });
    }
    uploaded.push(res);
  }

  return NextResponse.json({ ok: true, images: uploaded });
}
