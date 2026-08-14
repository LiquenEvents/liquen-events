import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/admin-auth";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import {
  gravarDefinicao,
  isDefinicaoId,
  listarDefinicoes,
  parametrosDe,
} from "@/lib/proposta-definicoes-store";
import { firstError } from "@/lib/validation";
import { BASE_OMISSAO } from "@/lib/geo/portugal";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Os números com que o estúdio faz contas: o preço do combustível e o resto do
 * custo por quilómetro, e a margem mínima abaixo da qual avisa.
 *
 * GET devolve SEMPRE um conjunto utilizável — o que estiver gravado, com os
 * valores de partida a tapar os buracos —, mais a data em que cada grupo foi
 * definido. É essa data que permite ao ecrã dizer "o gasóleo foi definido há
 * quatro meses" em vez de calcular com um número velho em silêncio.
 */

const NAO_INSTALADO =
  "As definições da proposta ainda não têm tabela na base de dados. No Supabase → SQL Editor, " +
  "cola e corre o ficheiro db/schema.sql (pode repetir-se sem risco) e tenta de novo.";

const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação, por isso as definições não podem ser " +
  "guardadas. Faltam as chaves do Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

/**
 * Os limites não são decorativos: um consumo de 900 l/100 km ou um gasóleo a
 * 40 €/l passam despercebidos num campo e multiplicam a deslocação por dez na
 * proposta seguinte. Recusar aqui é mais barato do que explicar ao cliente.
 */
const deslocacaoSchema = z.object({
  /**
   * O local da sede.
   *
   * OPCIONAL com valor de partida, e não obrigatório, por duas razões: um
   * separador do estúdio aberto antes deste deploy envia os seis números sem
   * base e não pode ficar sem conseguir gravar; e uma linha `deslocacao` já
   * gravada em 2026 não tem esta chave — lê-se com Évora, que é o que ela
   * sempre significou.
   *
   * O `trim` antes do `min(1)` é o que impede uma sede de espaços em branco de
   * passar: com ela, nenhuma proposta voltaria a ter sugestão de quilómetros.
   */
  base: z.string().trim().min(1).max(120).default(BASE_OMISSAO),
  consumoLPor100Km: z.number().finite().min(0).max(100),
  precoLitro: z.number().finite().min(0).max(20),
  portagensPorKm: z.number().finite().min(0).max(5),
  desgastePorKm: z.number().finite().min(0).max(5),
  franquiaKm: z.number().finite().min(0).max(1000),
  idaEVolta: z.boolean(),
});

const margemSchema = z.object({
  minima: z.number().finite().min(0).max(100),
});

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const linhas = await listarDefinicoes();
    return NextResponse.json(parametrosDe(linhas));
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("proposta-definicoes GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const { id, valor } = body as { id?: unknown; valor?: unknown };
    if (!isDefinicaoId(id)) {
      return NextResponse.json({ error: "Definição desconhecida" }, { status: 400 });
    }
    const schema = id === "deslocacao" ? deslocacaoSchema : margemSchema;
    const parsed = schema.safeParse(valor);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }

    await gravarDefinicao(id, parsed.data as Record<string, unknown>);
    // Devolve o conjunto TODO e não só o que se gravou: quem escreveu quer ver
    // o efeito, e o efeito é o conjunto com que o estúdio passa a calcular.
    return NextResponse.json(parametrosDe(await listarDefinicoes()));
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("proposta-definicoes PUT falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
