import { NextRequest, NextResponse } from "next/server";
import { ensureBucket as ensureProposalBucket } from "@/lib/proposal-storage";
import { isAuthed } from "@/lib/admin-auth";
import { copyThemeImageToProposal, isThemePath } from "@/lib/theme-storage";
import { isDatabaseConfigured } from "@/lib/supabase";
import { MAX_IMPORT_BATCH } from "@/lib/theme-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
// Um lote são até 40 fotos; mesmo com a cópia a acontecer dentro do Storage,
// 40 pedidos não cabem folgadamente nos 10 s por omissão do alojamento.
export const maxDuration = 60;

/** Cópias em curso ao mesmo tempo: rápido sem afogar o Storage. */
const CONCURRENCY = 5;

/**
 * Importa fotos da Biblioteca de Temas para uma proposta: recebe caminhos do
 * bucket de temas e COPIA os bytes para a pasta desta proposta, devolvendo os
 * novos `path` + `url` no formato que o estúdio já usa nos mood boards e na
 * capa.
 *
 * A cópia (em vez de referenciar o tema) é deliberada: a proposta fica
 * autónoma, por isso apagar ou reorganizar a biblioteca nunca parte uma
 * proposta já enviada, e o gerador de PDF continua a resolver um único bucket.
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
          "Armazenamento indisponível — configure o Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).",
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

  // O bucket de destino é garantido UMA vez por lote, antes de as cópias
  // arrancarem em paralelo (senão as primeiras corriam todas a criá-lo).
  await ensureProposalBucket();

  // Cada cópia escreve na POSIÇÃO que pediu, nunca no fim: a ordem por que a
  // Catarina tocou nas fotos é a ordem por que elas saem no PDF, e um lote
  // paralelo termina fora de ordem.
  const copied = new Array<{ path: string; url: string } | null>(paths.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < paths.length; i = next++) {
      const image = await copyThemeImageToProposal(paths[i], id);
      if (!image) {
        log.error("importar: cópia para a proposta falhou", null, { id, path: paths[i] });
        continue;
      }
      copied[i] = image;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));

  const images = copied.filter((im) => im !== null);
  const failed = paths.filter((_, i) => copied[i] === null);

  if (images.length === 0) {
    return NextResponse.json({ error: "Falha ao importar as imagens." }, { status: 502 });
  }
  // Sucesso parcial é reportado com honestidade — o estúdio avisa quantas
  // entraram em vez de fingir que entraram todas.
  return NextResponse.json({ ok: true, images, requested: paths.length, failed });
}
