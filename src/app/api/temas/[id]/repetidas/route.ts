import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme } from "@/lib/themes-store";
import { readThemeFingerprints } from "@/lib/theme-storage";
import { isFingerprint } from "@/lib/theme-fingerprint";
import { MAX_DUPLICATE_CHECK } from "@/lib/theme-types";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PRÉ-VERIFICAÇÃO DE REPETIDAS — "destas fotos, quais já estão no tema?"
 *
 * O navegador calcula o resumo do ficheiro ORIGINAL de cada foto ANTES de a
 * preparar (medido em Chromium: 42,9 ms contra 337 ms de preparação, numa foto
 * de 8,1 MB) e pergunta aqui. As que já lá estão nem chegam a ser preparadas
 * nem a subir: num arrasto de 300 com metade repetidas, isso poupa ~16,9 s de
 * CPU dela e ~160 MB que não sobem (≈67 s a 20 Mbit/s).
 *
 * Devolve SÓ as conhecidas (`known`), nunca o índice todo: mandar 4000 resumos
 * para baixo a cada arrasto não faz sentido e tirava a lógica da pasta do lado
 * do servidor, onde ela tem de ficar.
 *
 * SEGURANÇA: o cliente manda uma lista de resumos hexadecimais e mais nada —
 * não há caminho nenhum vindo de fora, e continua a ser preciso sessão de
 * admin como em todas as rotas de temas. O que não for 32 hex é descartado em
 * silêncio (nunca chega ao Storage).
 *
 * `complete: false` diz "a pasta é maior do que o teto de páginas, isto é
 * melhor esforço" — e nesse caso a UI NÃO pode anunciar "12 já estavam". O
 * `upsert: false` da escrita continua a ser o guarda que não falha.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  const { id } = await params;
  try {
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const raw = Array.isArray(body?.hashes) ? body.hashes : null;
    if (!raw || raw.length === 0) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }
    // Teto por PEDIDO — o cliente parte o lote em pedaços. Sem isto, um pedido
    // feito à mão punha-nos a comparar 5000 valores de uma vez.
    if (raw.length > MAX_DUPLICATE_CHECK) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_DUPLICATE_CHECK} fotos por verificação.` },
        { status: 400 },
      );
    }

    const index = await readThemeFingerprints(id);
    // Pasta ilegível: NÃO é "não há repetidas". Diz-se que não se pôde
    // verificar e sobe tudo — dizer "nenhuma repetida" faria a UI prometer uma
    // verificação que não aconteceu.
    if (!index.ok) {
      return NextResponse.json({
        ok: true,
        known: [],
        complete: false,
        legacy: false,
        read: false,
      });
    }

    const known = raw.filter((h: unknown) => isFingerprint(h) && index.hashes.has(h));
    return NextResponse.json({
      ok: true,
      known,
      complete: index.complete,
      // Há fotos sem resumo no nome (a biblioteca anterior a isto). É o que
      // autoriza a UI a dizer, uma vez e sem drama, que nem todas as fotos
      // antigas podem ser reconhecidas.
      legacy: index.legacy,
      read: true,
    });
  } catch (err) {
    log.error("temas repetidas POST falhou", err, { id });
    // Falhar a VERIFICAR não pode travar o carregamento: o cliente lê isto
    // como "não se sabe", sobe tudo, e o `upsert: false` apanha o que houver.
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
