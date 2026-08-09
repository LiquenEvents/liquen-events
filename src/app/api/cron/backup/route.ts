import { createHash, timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { buildBackupPayload } from "@/app/api/backup/route";
import { isAuthed } from "@/lib/admin-auth";
import { sendMail, MAIL_TO } from "@/lib/mail";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CÓPIA DE SEGURANÇA DEIXA DE DEPENDER DE ALGUÉM SE LEMBRAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A cópia já existia e é boa — 13 conjuntos, livro de facturas, contratos,
 * contador fiscal, com um `readme` lá dentro e os conjuntos que falharam
 * REGISTADOS em vez de saírem vazios em silêncio. O que faltava era o gatilho:
 * `/api/backup` só corre quando ela carrega no botão em Definições.
 *
 * Numa semana com três montagens ninguém carrega em botão nenhum. Passam-se
 * dois meses, e no dia em que uma proposta se apaga por engano — ou em que o
 * projecto de base de dados é suspenso — o que existe é o ficheiro de há dois
 * meses: todas as propostas, contratos e facturas desde então desaparecem.
 *
 * ── PORQUÊ POR EMAIL, E NÃO PARA UM BUCKET ────────────────────────────────
 *
 * Porque uma cópia guardada no mesmo sítio que os dados não é uma cópia. O que
 * protege contra "o projecto Supabase deixou de existir" é o ficheiro estar
 * NOUTRO lado — e a caixa de correio dela é o outro lado que já existe, sem
 * contas novas, sem custos e sem configuração. Chega lá comprimido, com a data
 * no nome, e fica no histórico do email a servir de arquivo.
 *
 * ── O QUE ESTE FICHEIRO NÃO FAZ ───────────────────────────────────────────
 *
 * Não copia as FOTOGRAFIAS (vivem no Storage, são gigabytes, não cabem num
 * email). A cópia leva os CAMINHOS delas, portanto uma reposição devolve as
 * propostas e os moodboards a apontar para imagens que têm de existir. Isso
 * continua a ser a maior lacuna, está dito no `RESILIENCE.md`, e resolve-se com
 * um descarregamento dos buckets à mão de vez em quando.
 *
 * Também não substitui as cópias automáticas do próprio Supabase — é uma
 * segunda linha, deliberadamente noutra tecnologia e noutro fornecedor.
 */

/**
 * Mesmo guarda do resumo diário: Bearer com `CRON_SECRET`, comparado em tempo
 * constante, e a falhar fechado em produção quando o segredo não está posto.
 * Uma sessão de administração também serve, para ela poder disparar à mão.
 */
function authorized(req: NextRequest): boolean {
  if (isAuthed(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const provided = createHash("sha256")
    .update(req.headers.get("authorization") ?? "")
    .digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

/** 20 MB — abaixo do limite prático de anexo da esmagadora maioria dos servidores. */
const TECTO_ANEXO = 20 * 1024 * 1024;

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const payload = await buildBackupPayload();
    const dia = payload.exportedAt.slice(0, 10);
    const cru = Buffer.from(JSON.stringify(payload), "utf8");
    const comprimido = gzipSync(cru);

    /**
     * O ASSUNTO DIZ O ESTADO, PORQUE É O QUE ELA VÊ SEM ABRIR.
     *
     * Se algum conjunto falhou, `incomplete` traz o nome. Uma cópia parcial que
     * chega com ar de cópia boa é pior do que não chegar nenhuma: ela deixa de
     * desconfiar exactamente no dia em que devia.
     */
    const falhados = payload.incomplete ?? [];
    const parcial = falhados.length > 0;
    const linhas = Object.entries(payload.counts ?? {})
      .map(([k, n]) => `${k}: ${n}`)
      .join(" · ");

    if (comprimido.byteLength > TECTO_ANEXO) {
      // Não mandar nada seria pior: pelo menos avisa-se que a cópia deixou de
      // caber, para ela poder passar ao descarregamento manual.
      log.error("cron backup: a cópia excedeu o tecto do anexo", null, {
        bytes: comprimido.byteLength,
      });
      await sendMail({
        subject: `Cópia de segurança de ${dia} — grande demais para email`,
        html:
          `<p>A cópia de hoje tem ${(comprimido.byteLength / 1048576).toFixed(1)} MB ` +
          `comprimidos e já não cabe num anexo.</p>` +
          `<p>Descarregue-a no back office, em <b>Definições → Cópia de segurança</b>, ` +
          `e guarde-a fora do computador de trabalho.</p><p>${linhas}</p>`,
        headers: { "Auto-Submitted": "auto-generated" },
      });
      return NextResponse.json({
        ok: false,
        reason: "grande demais",
        bytes: comprimido.byteLength,
      });
    }

    const { sent } = await sendMail({
      to: MAIL_TO,
      subject: parcial
        ? `⚠ Cópia de segurança de ${dia} — INCOMPLETA (${falhados.join(", ")})`
        : `Cópia de segurança de ${dia}`,
      html:
        (parcial
          ? `<p><b>Atenção:</b> estes conjuntos não puderam ser lidos e vão vazios: ` +
            `<b>${falhados.join(", ")}</b>. Não reponha esta cópia sem falar com quem a fez.</p>`
          : `<p>Cópia automática do dia. Guarde-a — é a que serve se alguma coisa se perder.</p>`) +
        `<p style="color:#666;font-size:13px">${linhas}</p>` +
        `<p style="color:#666;font-size:13px">Não inclui as fotografias: a cópia leva os ` +
        `caminhos delas, não os ficheiros.</p>`,
      attachments: [
        {
          filename: `liquen-backup-${dia}.json.gz`,
          content: comprimido,
          contentType: "application/gzip",
        },
      ],
      headers: { "Auto-Submitted": "auto-generated" },
    });

    log.info("cron backup enviado", { dia, bytes: comprimido.byteLength, sent, parcial });
    return NextResponse.json({
      ok: true,
      sent,
      dia,
      bytes: comprimido.byteLength,
      incomplete: falhados,
    });
  } catch (err) {
    log.error("cron backup falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
