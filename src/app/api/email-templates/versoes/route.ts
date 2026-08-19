import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listarVersoes, reverterPara, type IdiomaDoModelo } from "@/lib/email-templates-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lingua = (v: unknown): IdiomaDoModelo => (v === "en" ? "en" : "pt");

/** O histórico deste modelo nesta língua, do mais recente para o mais antigo. */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const chave = String(searchParams.get("chave") ?? "").trim();
  if (!chave) return NextResponse.json({ error: "Chave obrigatória" }, { status: 400 });
  try {
    return NextResponse.json(await listarVersoes(chave, lingua(searchParams.get("idioma"))));
  } catch (err) {
    log.error("email-templates versões GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Voltar a uma versão.
 *
 * O 404 quando ela já não existe é a resposta certa e não um pormenor: a
 * versão pode ter caído pelo tecto das dez, ou outra pessoa ter gravado
 * entretanto. Repor um texto adivinhado — «o mais parecido» — era pior do que
 * dizer que aquela já não está cá.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const corpo = await request.json().catch(() => null);
    const chave = String(corpo?.chave ?? "").trim();
    const versaoEm = String(corpo?.versaoEm ?? "").trim();
    if (!chave || !versaoEm) {
      return NextResponse.json({ error: "Falta a chave ou a versão" }, { status: 400 });
    }
    const reposto = await reverterPara(chave, lingua(corpo?.idioma), versaoEm);
    if (!reposto) {
      return NextResponse.json(
        { error: "Essa versão já não existe. Actualiza o histórico e escolhe outra." },
        { status: 404 },
      );
    }
    return NextResponse.json(reposto);
  } catch (err) {
    log.error("email-templates reversão falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
