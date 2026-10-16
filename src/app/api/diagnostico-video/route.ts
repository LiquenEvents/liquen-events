import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setState } from "@/lib/app-state";
import { clientIp, rateLimit, sweep } from "@/lib/rate-limit";
import { NAVEGADORES, chaveDoDiagnostico, diagnosticoLigado } from "@/lib/diagnostico-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O registo anónimo do vídeo da entrada (ver `src/lib/diagnostico-video.ts`).
 *
 * Ela (16/10, iPhone): «continua a parar». Daqui não há iPhone, e os registos
 * da Vercel não se lêem com o acesso desta casa — por isso o que o iPhone dela
 * conta fica no `app_state` (a tabela que já existe: sem migração), numa chave
 * por página aberta: `diagnostico-video:<dia>:<sessão>`. Cada página só escreve
 * a sua, e cada envio substitui o anterior com o estado inteiro.
 *
 * Pública por necessidade (o browser de quem visita manda isto), por isso:
 *  - só aceita números, textos curtos de listas fechadas e listas pequenas
 *    (`zod`, estrito) — nada de texto livre, nada que identifique alguém;
 *  - corpo de 8 KB no máximo, e 20 envios por minuto por origem;
 *  - não guarda o IP (só o usa para o limite de ritmo, em memória);
 *  - nunca devolve nada (204), nem quando recusa;
 *  - e desliga-se sozinha em `DIAGNOSTICO_ATE`.
 */

const MAX_BYTES = 8 * 1024;

const num = z.number().finite();
const Acontecimento = z
  .object({
    t: num,
    k: z.string().regex(/^[a-z-]{1,16}$/),
    v: z.number().int().min(-1).max(9).optional(),
  })
  .strict();
const Estado = z
  .object({
    take: z.number().int().min(0).max(9),
    ct: num,
    dur: num.nullable(),
    rs: z.number().int().min(0).max(4),
    ns: z.number().int().min(0).max(3),
    paused: z.boolean(),
    ended: z.boolean(),
    fonte: z.enum(["blob", "rede", "source", "nenhuma"]),
    formato: z.enum(["hevc", "av1", "mp4", "webm", "blob"]).nullable(),
    leve: z.boolean(),
    aPassar: z.boolean(),
    aFrente: num,
  })
  .strict();
const Corpo = z
  .object({
    v: z.literal(1),
    sessao: z.string().regex(/^[a-z0-9]{8,16}$/),
    motivo: z.enum(["paragem", "saida"]),
    aparelho: z
      .object({
        ios: z
          .string()
          .regex(/^\d{1,2}\.\d{1,2}$/)
          .nullable(),
        nav: z.enum(NAVEGADORES),
        movel: z.boolean(),
        ecra: z.string().regex(/^\d{1,5}x\d{1,5}@[\d.]{1,4}$/),
        alto: z.boolean(),
        ligacao: z
          .string()
          .regex(/^[a-z0-9-]{1,8}$/)
          .nullable(),
      })
      .strict(),
    desde: num,
    paragens: z
      .array(
        z
          .object({
            inicio: num,
            ms: num.nullable(),
            estado: Estado,
            antes: z.array(Acontecimento).max(10),
          })
          .strict(),
      )
      .max(20),
    contadores: z
      .record(z.string().regex(/^[a-z-]{1,16}$/), z.number().int().min(0).max(1_000_000))
      .refine((o) => Object.keys(o).length <= 24),
    qualidade: z
      .object({ perdidos: z.number().int().min(0), total: z.number().int().min(0) })
      .strict()
      .nullable(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const nada = new NextResponse(null, { status: 204 });
  if (!diagnosticoLigado()) return nada;
  sweep();
  if (!(await rateLimit(`diagnostico-video:${clientIp(req)}`, 20, 60_000)).ok) return nada;
  try {
    const texto = await req.text();
    if (texto.length > MAX_BYTES) return nada;
    const parsed = Corpo.safeParse(JSON.parse(texto));
    if (!parsed.success) return nada;
    const corpo = parsed.data;
    await setState(chaveDoDiagnostico(corpo.sessao), {
      ...corpo,
      recebidoEm: new Date().toISOString(),
    });
  } catch {
    /* um corpo estragado não é um erro de ninguém */
  }
  return nada;
}
