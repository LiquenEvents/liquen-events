import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { garantirFoto } from "@/lib/biblioteca-fotos-store";
import { etiquetar, desetiquetar } from "@/lib/biblioteca-foto-etiquetas-store";
import { listEtiquetas } from "@/lib/biblioteca-etiquetas-store";
import { isThemePath } from "@/lib/theme-storage";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Um lote são até `MAX_POR_PEDIDO` fotos, em série e com duas idas à base de
 *  dados por foto (`garantirFoto` + `etiquetar`); os 10 s por omissão do
 *  alojamento matavam a revisão a meio, com metade das etiquetas postas. */
export const maxDuration = 60;

/**
 * ETIQUETAR EM LOTE — pôr ou tirar uma etiqueta a muitas fotos de uma vez.
 *
 * É a operação central da revisão que a migração deixa por fazer: as 55 fotos
 * que ficaram sem tipo arrumam-se aqui, aos vinte e aos trinta, não uma a uma.
 *
 * Corpo: `{ paths: string[], etiquetaId: string, accao: "por" | "tirar" }`
 *
 * ── Porque é que repetir não é erro ──────────────────────────────────────
 * Aplicar "terracotta" a 30 fotos das quais 8 já a tinham é o uso NORMAL: quem
 * selecciona à vista não vai conferir uma a uma. Por isso pôr o que já lá está
 * conta como sucesso, e tirar o que já não está também. O que se devolve é
 * quantas MUDARAM mesmo, para a mensagem poder ser honesta ("22 fotos
 * etiquetadas") em vez de dizer 30.
 */

const NAO_INSTALADO =
  "As etiquetas da biblioteca ainda não estão criadas na base de dados. No Supabase → SQL Editor, " +
  "cola e corre o ficheiro db/schema.sql (pode repetir-se sem risco) e tenta de novo.";

const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação. Faltam as chaves do Supabase " +
  "(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

/**
 * Fotos por pedido. Não é uma limitação da base de dados — é o que impede que
 * um "seleccionar tudo" numa biblioteca de milhares se transforme num pedido
 * que demora um minuto e não se consegue cancelar. A UI parte em lotes.
 */
const MAX_POR_PEDIDO = 500;

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const accao = body?.accao;
    if (accao !== "por" && accao !== "tirar") {
      return NextResponse.json({ error: "Acção inválida." }, { status: 400 });
    }
    const etiquetaId = typeof body?.etiquetaId === "string" ? body.etiquetaId.trim() : "";
    if (!etiquetaId) return NextResponse.json({ error: "Etiqueta obrigatória." }, { status: 400 });

    // Os caminhos vêm do cliente: só se aceitam caminhos bem formados do
    // bucket da biblioteca. É o mesmo guarda da cópia e da remoção de fotos.
    if (!Array.isArray(body?.paths)) {
      return NextResponse.json({ error: "Fotos em falta." }, { status: 400 });
    }
    const paths: string[] = [...new Set((body.paths as unknown[]).filter(isThemePath))].slice(
      0,
      MAX_POR_PEDIDO,
    );
    if (paths.length === 0) {
      return NextResponse.json({ error: "Nenhuma foto válida." }, { status: 400 });
    }

    if (accao === "por") {
      // A etiqueta tem de existir MESMO. Sem esta verificação, uma gralha no
      // cliente criava ligações para um id que ninguém mostra — trabalho que se
      // perde em silêncio, que é o pior resultado possível numa revisão.
      const vocabulario = await listEtiquetas();
      if (!vocabulario.some((e) => e.id === etiquetaId)) {
        return NextResponse.json({ error: "Essa etiqueta não existe." }, { status: 400 });
      }
    }

    let mudadas = 0;
    for (const path of paths) {
      if (accao === "tirar") {
        if (await desetiquetar(path, etiquetaId)) mudadas++;
        continue;
      }
      // A linha da foto pode ainda não existir: as fotos são anteriores a estas
      // tabelas, e a linha nasce de forma preguiçosa (ver `garantirFoto`).
      // Etiquetar é precisamente um dos momentos em que ela tem de nascer.
      await garantirFoto(path);
      const { criada } = await etiquetar(path, etiquetaId, "manual");
      if (criada) mudadas++;
    }

    return NextResponse.json({ ok: true, pedidas: paths.length, mudadas });
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("biblioteca etiquetar POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
