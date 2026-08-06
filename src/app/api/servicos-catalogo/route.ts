import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/admin-auth";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import {
  criarServico,
  jaExiste,
  listarServicos,
  type ServicoCatalogo,
} from "@/lib/servicos-catalogo-store";
import { firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A biblioteca de serviços: ler a lista, e acrescentar um.
 *
 * O que se escreve à mão na proposta continua a ser gravado na proposta; isto é
 * o sítio onde a boa redacção fica guardada para a próxima vez.
 */

const NAO_INSTALADO =
  "A biblioteca de serviços ainda não tem tabela na base de dados. No Supabase → SQL Editor, " +
  "cole e corra o ficheiro db/schema.sql (pode repetir-se sem risco) e tente de novo.";

const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação, por isso a biblioteca não pode ser " +
  "guardada. Faltam as chaves do Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

const servicoSchema = z.object({
  nome: z.string().trim().min(1, "O serviço precisa de um nome.").max(200),
  descricao: z.string().max(2_000).default(""),
  // O inglês pode ficar por escrever: um serviço com o português feito e o
  // inglês por fazer é útil, e exigir os dois garantia que não se guardava
  // nenhum a meio de uma proposta.
  nomeEn: z.string().max(200).default(""),
  descricaoEn: z.string().max(2_000).default(""),
  categoria: z.string().max(120).default("Outros"),
});

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listarServicos());
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("servicos-catalogo GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const parsed = servicoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }

    // Guardar o mesmo serviço duas vezes com grafias diferentes é exactamente a
    // desarrumação que a biblioteca existe para resolver. Devolve-se o que já lá
    // está, com 200: quem carregou no botão queria o serviço na biblioteca, e
    // ele está — dizer "erro" seria uma resposta tecnicamente certa e inútil.
    const existentes = await listarServicos();
    const repetido = jaExiste(parsed.data.nome, existentes);
    if (repetido) return NextResponse.json(repetido);

    const agora = new Date().toISOString();
    const servico: ServicoCatalogo = {
      id: crypto.randomUUID(),
      ...parsed.data,
      createdAt: agora,
      updatedAt: agora,
    };
    await criarServico(servico);
    return NextResponse.json(servico, { status: 201 });
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("servicos-catalogo POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
