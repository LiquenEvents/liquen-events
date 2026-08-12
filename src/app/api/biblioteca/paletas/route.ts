import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { aplicarPaletas } from "@/lib/paleta-aplicar";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ~200 fotos, uma escrita por cada. Longe dos 60 s, mas não é instantâneo.
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESCREVER A PALETA NAS FOTOS QUE JÁ CÁ ESTAVAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `GET`  → ENSAIO. Diz o que aconteceria e não escreve nada.
 * `POST` → aplica.
 *
 * Ler é seguro e escrever não é, e por isso são verbos diferentes: um `GET`
 * que escrevesse podia ser disparado por um pré-carregamento do browser. Quem
 * quiser ver antes de mexer — que devia ser toda a gente — usa o `GET`.
 *
 * Admin-only, como tudo o que toca na biblioteca.
 */

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await aplicarPaletas({ ensaio: true })) });
  } catch (err) {
    log.error("paletas: ensaio falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const r = await aplicarPaletas({ ensaio: false });
    log.info("paletas aplicadas", { resumo: r.resumo });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    log.error("paletas: aplicação falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
