import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { referenciarFotosDaBiblioteca, isThemePath } from "@/lib/theme-storage";
import { isDatabaseConfigured } from "@/lib/supabase";
import { MAX_IMPORT_BATCH } from "@/lib/theme-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
// Sobra de propósito: isto são duas assinaturas em lote, e nem com 40 fotos se
// aproxima dos 10 s por omissão do alojamento. Ficou nos 60 s de quando ainda
// se copiavam bytes — baixá-lo não ganha nada e tira a folga a um Storage lento.
export const maxDuration = 60;

/**
 * Escolhe fotos da Biblioteca de Temas para uma proposta: recebe caminhos do
 * bucket de temas e devolve REFERÊNCIAS (`tema:<caminho>`) já assinadas, no
 * formato que o estúdio usa nos mood boards e na capa.
 *
 * Isto copiava os bytes para a pasta da proposta. Deixou de copiar — a cópia
 * dava à foto uma identidade nova e deitava fora a cache do navegador sobre a
 * foto que ele tinha acabado de descarregar no seletor. O raciocínio está em
 * `theme-ref.ts`, e o que garante que uma proposta enviada continua a não
 * perder fotos está em `theme-materializar.ts`.
 *
 * Corpo: `{ paths: string[] }`. Só admin.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento indisponível — configura o Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).",
      },
      { status: 503 },
    );
  }
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.paths) ? body.paths : null;
  if (!raw || raw.length === 0) {
    return NextResponse.json({ error: "Nenhuma imagem indicada." }, { status: 400 });
  }
  if (raw.length > MAX_IMPORT_BATCH) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_IMPORT_BATCH} imagens de cada vez.` },
      { status: 400 },
    );
  }
  // Só caminhos bem formados do bucket de temas — nunca URLs nem travessias.
  const paths: string[] = raw.filter(isThemePath);
  if (paths.length === 0) {
    return NextResponse.json({ error: "Caminhos inválidos." }, { status: 400 });
  }

  // Todo o lote de uma assentada: duas assinaturas em paralelo para o conjunto
  // inteiro. É UMA ida ao Storage, com uma foto ou com quarenta. A ordem pedida
  // é preservada lá dentro.
  const { images, failed } = await referenciarFotosDaBiblioteca(paths);
  for (const path of failed) {
    log.error("importar: foto da biblioteca não assinada", null, { id, path });
  }

  if (images.length === 0) {
    return NextResponse.json({ error: "Falha ao importar as imagens." }, { status: 502 });
  }
  // Sucesso parcial é reportado com honestidade — o estúdio avisa quantas
  // entraram em vez de fingir que entraram todas.
  return NextResponse.json({ ok: true, images, requested: paths.length, failed });
}
