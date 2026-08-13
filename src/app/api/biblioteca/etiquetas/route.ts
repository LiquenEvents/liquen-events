import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listEtiquetas, createEtiqueta, etiquetaId } from "@/lib/biblioteca-etiquetas-store";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import { isUniqueViolation } from "@/lib/invoices-store";
import { isEixo } from "@/lib/biblioteca-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O VOCABULÁRIO da biblioteca — os valores de cada eixo (tipo, paleta, estilo).
 *
 * Só admin. É uma tabela e não uma lista no código porque quem gere o
 * vocabulário é a equipa: acrescentar "champanhe" à paleta não pode obrigar a
 * um deploy.
 */

const NAO_INSTALADO =
  "As etiquetas da biblioteca ainda não estão criadas na base de dados. No Supabase → SQL Editor, " +
  "cola e corre o ficheiro db/schema.sql (pode repetir-se sem risco) e tenta de novo.";

const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação, por isso as etiquetas não podem ser guardadas. " +
  "Faltam as chaves do Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

/** Um nome de etiqueta é curto por desenho: é um chip numa grelha, não uma
 *  nota. Cortar em silêncio é preferível a recusar — ninguém perde o trabalho
 *  por ter escrito de mais. */
const MAX_NOME = 40;

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listEtiquetas());
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("biblioteca etiquetas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const eixo = body?.eixo;
    if (!isEixo(eixo)) {
      return NextResponse.json({ error: "Eixo inválido." }, { status: 400 });
    }
    const nome = typeof body?.nome === "string" ? body.nome.trim().slice(0, MAX_NOME) : "";
    if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    // O id é derivado do nome sem acentos: "Terracotta" e "terracota" dariam
    // etiquetas diferentes por um acidente de escrita, e a equipa acabaria com
    // as fotos repartidas entre as duas sem perceber porquê.
    const id = etiquetaId(eixo, nome);
    const existentes = await listEtiquetas();
    const jaLa = existentes.find((e) => e.id === id);
    // Repetir NÃO é um erro: quem escreve o mesmo nome outra vez quer aquela
    // etiqueta, e devolvê-la é o que ele quer que aconteça.
    if (jaLa) return NextResponse.json(jaLa);

    const ordem = existentes.filter((e) => e.eixo === eixo).length * 10 + 10;
    return NextResponse.json(await createEtiqueta({ eixo, nome, ordem }));
  } catch (err) {
    // Corrida: entre a leitura e a escrita, outro pedido criou a mesma. É a
    // etiqueta que existe, não uma avaria — mas já não a temos aqui, e pedir
    // outra vez é mais honesto do que inventar a linha.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "Essa etiqueta acabou de ser criada." }, { status: 409 });
    }
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("biblioteca etiquetas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
