/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS QUE NÃO TÊM MINIATURA — contar primeiro, gerar depois
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotos carregadas DEPOIS de as miniaturas existirem trazem as suas: o
 * navegador fabrica-as na mesma descodificação que já faz para encolher o
 * original, e sobem no mesmo pedido. As que ficaram para trás não têm nenhuma,
 * e para essas a grelha cai para o ORIGINAL — 2200 px, ~576 KB, numa célula de
 * 174 px. Sessenta células assim, ao mesmo tempo, é a explicação mais simples
 * para «a biblioteca demora imenso a mostrar as fotos».
 *
 * É uma hipótese, e este guião existe para deixar de o ser: **corre-o sem
 * argumentos e ele diz o número**. Sem esse número, «gerar as derivadas que
 * faltam» é trabalho ao escuro — pode ser tudo, pode ser nada.
 *
 *   node scripts/derivadas-em-falta.mjs              conta (não escreve nada)
 *   node scripts/derivadas-em-falta.mjs --aplicar    gera as que faltam
 *   node scripts/derivadas-em-falta.mjs --tema x     só uma pasta
 *
 * Precisa de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente. **Não os
 * escrevas na linha de comandos onde ficam no histórico** — põe-nos no
 * `.env.local` e usa `set -a; . .env.local; set +a` antes de correr.
 *
 * ── O QUE NUNCA FAZ ───────────────────────────────────────────────────────
 * Não apaga nada, não toca nos originais, não substitui uma derivada que já
 * exista. Repetir é seguro e é assim que se retoma uma execução interrompida: a
 * segunda passagem não tem trabalho.
 *
 * ── PORQUE É QUE O ENSAIO É O PADRÃO ──────────────────────────────────────
 * Isto escreve no Storage de produção. Correr primeiro sem escrever custa
 * segundos e evita a única categoria de engano que aqui importa — apontar ao
 * projecto errado. É a mesma regra do `migrar-lqip.mjs`, e é para manter.
 *
 * ── AS CHAVES SÃO AS MESMAS, DE PROPÓSITO ─────────────────────────────────
 * A derivada de `theme-assets/<pasta>/<x>.jpg` é `theme-thumbs/<pasta>/<x>.jpg`
 * e `theme-micro/<pasta>/<x>.jpg`; a de `proposal-assets/<pedido>/<uuid>.jpg` é
 * `proposal-thumbs/<pedido>/<uuid>.jpg`. Sem índice para manter e sem coluna
 * nova: o caminho do original É o caminho da derivada. É o que faz uma
 * miniatura em falta cair sozinha para o original em vez de partir a página.
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const URL_SB = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APLICAR = process.argv.includes("--aplicar");
const SO_TEMA = (() => {
  const i = process.argv.indexOf("--tema");
  return i >= 0 ? process.argv[i + 1] : null;
})();

if (!URL_SB || !KEY) {
  console.error(
    "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Põe-nos no .env.local e corre:  set -a; . .env.local; set +a; node scripts/derivadas-em-falta.mjs",
  );
  process.exit(1);
}

const sb = createClient(URL_SB, KEY, { auth: { persistSession: false } });

/**
 * As famílias de derivadas, com o lado e a qualidade de cada uma.
 *
 * Os números são os MESMOS que o navegador usa (`image-worker.ts`:
 * `MICRO_EDGE = 96`, miniatura a 400). Se divergirem, uma foto migrada fica
 * diferente de uma foto nova e ninguém percebe porquê — por isso ficam aqui
 * com o sítio de onde vêm escrito ao lado.
 */
const FAMILIAS = [
  {
    origem: "theme-assets",
    derivadas: [
      { bucket: "theme-thumbs", lado: 400, qualidade: 78 },
      { bucket: "theme-micro", lado: 96, qualidade: 65 },
    ],
  },
  {
    origem: "proposal-assets",
    derivadas: [{ bucket: "proposal-thumbs", lado: 400, qualidade: 78 }],
  },
];

/** O Storage devolve no máximo 1000 por página; 500 é o que o resto do código usa. */
const PAGINA = 500;

/** Marcadores de pasta e ficheiros escondidos não são fotografias. */
const ehFoto = (nome) => /\.(jpe?g|png|webp)$/i.test(nome) && !nome.startsWith(".");

/** As pastas de um bucket (os temas, ou os pedidos). */
async function pastas(bucket) {
  const { data, error } = await sb.storage.from(bucket).list("", { limit: PAGINA });
  if (error) throw new Error(`${bucket}: ${error.message}`);
  // Uma "pasta" no Storage é uma entrada sem `id`.
  return (data ?? []).filter((e) => !e.id).map((e) => e.name);
}

/** Os ficheiros de uma pasta, paginados até ao fim. */
async function ficheiros(bucket, pasta) {
  const out = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await sb.storage.from(bucket).list(pasta, { limit: PAGINA, offset });
    if (error) throw new Error(`${bucket}/${pasta}: ${error.message}`);
    const lote = data ?? [];
    out.push(...lote.filter((e) => ehFoto(e.name)).map((e) => `${pasta}/${e.name}`));
    if (lote.length < PAGINA) return out;
  }
}

/**
 * Gera e guarda uma derivada. Melhor esforço: falhar numa foto não pode parar
 * as outras — uma execução que morre à terceira de quatrocentas obriga a
 * recomeçar, e recomeçar é o que faz ninguém correr isto.
 */
async function gerar(origem, caminho, alvo) {
  try {
    const { data, error } = await sb.storage.from(origem).download(caminho);
    if (error || !data) return { ok: false, porque: error?.message ?? "sem bytes" };
    const bytes = Buffer.from(await data.arrayBuffer());
    const derivada = await sharp(bytes)
      // `withoutEnlargement`: uma foto que já seja menor do que o alvo fica
      // como está. Ampliar produzia uma miniatura MAIOR do que o original, que
      // é o contrário do que isto serve.
      .rotate()
      .resize(alvo.lado, alvo.lado, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: alvo.qualidade, mozjpeg: true })
      .toBuffer();
    const { error: erroSubida } = await sb.storage
      .from(alvo.bucket)
      .upload(caminho, derivada, { contentType: "image/jpeg", upsert: false });
    if (erroSubida) return { ok: false, porque: erroSubida.message };
    return { ok: true, bytes: derivada.length };
  } catch (e) {
    return { ok: false, porque: String(e) };
  }
}

async function main() {
  console.log(APLICAR ? "A GERAR as derivadas em falta.\n" : "ENSAIO — não escreve nada.\n");

  let totalFotos = 0;
  let totalEmFalta = 0;
  let totalGeradas = 0;
  const falhas = [];

  for (const familia of FAMILIAS) {
    let asPastas;
    try {
      asPastas = await pastas(familia.origem);
    } catch (e) {
      console.log(`· ${familia.origem}: não consegui listar (${e.message}). Salto.`);
      continue;
    }
    const alvo = SO_TEMA ? asPastas.filter((p) => p === SO_TEMA) : asPastas;
    if (alvo.length === 0) {
      console.log(`· ${familia.origem}: nada a ver.`);
      continue;
    }

    console.log(`── ${familia.origem} — ${alvo.length} pasta(s)`);
    for (const pasta of alvo) {
      const caminhos = await ficheiros(familia.origem, pasta);
      totalFotos += caminhos.length;
      if (caminhos.length === 0) continue;

      for (const derivada of familia.derivadas) {
        // Listar a pasta INTEIRA da derivada e comparar em memória, em vez de
        // perguntar por ficheiro. São 400 fotos: uma listagem contra 400 idas.
        const jaLa = new Set(await ficheiros(derivada.bucket, pasta).catch(() => []));
        const faltam = caminhos.filter((c) => !jaLa.has(c));
        totalEmFalta += faltam.length;
        const quanto = `${faltam.length}/${caminhos.length}`;
        if (faltam.length === 0) {
          console.log(`   ${pasta} → ${derivada.bucket}: completo (${caminhos.length})`);
          continue;
        }
        console.log(`   ${pasta} → ${derivada.bucket}: FALTAM ${quanto}`);
        if (!APLICAR) continue;

        let feitas = 0;
        for (const caminho of faltam) {
          const r = await gerar(familia.origem, caminho, derivada);
          if (r.ok) {
            feitas += 1;
            totalGeradas += 1;
          } else {
            falhas.push(`${derivada.bucket}/${caminho}: ${r.porque}`);
          }
        }
        console.log(`     geradas ${feitas}/${faltam.length}`);
      }
    }
  }

  console.log("\n────────────────────────────────────────");
  console.log(`fotografias vistas      ${totalFotos}`);
  console.log(`derivadas em falta      ${totalEmFalta}`);
  if (APLICAR) console.log(`derivadas geradas       ${totalGeradas}`);
  if (falhas.length > 0) {
    // As falhas vão TODAS, não uma amostra: uma foto que ficou por gerar é uma
    // foto que continua a servir o original, e saber quais é o que permite
    // voltar a correr só para essas.
    console.log(`\nfalharam ${falhas.length}:`);
    for (const f of falhas) console.log(`  · ${f}`);
  }
  if (!APLICAR && totalEmFalta > 0) {
    console.log("\nPara gerar:  node scripts/derivadas-em-falta.mjs --aplicar");
  }
  // Um código de saída diferente de zero quando ficou trabalho por fazer, para
  // isto poder correr numa rotina sem alguém ler a saída.
  process.exit(falhas.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
