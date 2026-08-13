/**
 * MINIATURAS EM FALTA NAS PROPOSTAS — migração, uma vez.
 *
 * As fotos carregadas DEPOIS das miniaturas existirem já trazem a sua. Este
 * guião trata das que ficaram para trás: percorre `proposal-assets`, vê quais
 * não têm par em `proposal-thumbs`, e gera-as.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/gerar-miniaturas-propostas.mjs
 *
 *   --ensaio    não escreve nada; só diz o que faria (por omissão está LIGADO)
 *   --aplicar   escreve mesmo
 *   --pedido X  só a pasta de um pedido
 *
 * ── Porque é que o ensaio é o padrão ──────────────────────────────────────
 * Isto escreve num bucket de dados de clientes. Correr primeiro sem escrever, e
 * ver a contagem, custa segundos e evita a única categoria de engano que aqui
 * importa: apontar ao projecto errado. A mesma razão pela qual a reposição da
 * cópia de segurança pede uma frase escrita à mão.
 *
 * ── O que NUNCA faz ───────────────────────────────────────────────────────
 * Não apaga nada, não toca nos originais, e não substitui uma miniatura que já
 * exista. Repetir a execução é seguro — a segunda passagem não tem trabalho.
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APLICAR = process.argv.includes("--aplicar");
const SO_PEDIDO = (() => {
  const i = process.argv.indexOf("--pedido");
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** Os mesmos valores que o browser usa em `image-prep.ts`. */
const THUMB_EDGE = 400;
const THUMB_QUALITY = 72;

const ORIGINAIS = "proposal-assets";
const MINIATURAS = "proposal-thumbs";

if (!URL || !KEY) {
  console.error(
    "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Encontra-as no Supabase → Project Settings → API.",
  );
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

/** As pastas de primeiro nível do bucket — uma por pedido. */
async function pastas() {
  if (SO_PEDIDO) return [SO_PEDIDO];
  const { data, error } = await sb.storage.from(ORIGINAIS).list("", { limit: 1000 });
  if (error) throw new Error(`não deu para listar as pastas: ${error.message}`);
  // Uma pasta no Storage aparece sem `id`; os ficheiros soltos têm.
  return (data ?? []).filter((o) => !o.id).map((o) => o.name);
}

async function ficheiros(bucket, pasta) {
  const { data, error } = await sb.storage.from(bucket).list(pasta, { limit: 1000 });
  if (error) return [];
  return (data ?? []).filter((o) => o.id && !o.name.startsWith(".")).map((o) => o.name);
}

async function main() {
  if (!APLICAR) {
    console.log("ENSAIO — nada será escrito. Junte --aplicar para escrever mesmo.\n");
  }

  let vistas = 0;
  let jaTinham = 0;
  let geradas = 0;
  let falhadas = 0;

  for (const pasta of await pastas()) {
    const originais = await ficheiros(ORIGINAIS, pasta);
    if (originais.length === 0) continue;
    const existentes = new Set(await ficheiros(MINIATURAS, pasta));

    const emFalta = originais.filter((n) => !existentes.has(n));
    vistas += originais.length;
    jaTinham += originais.length - emFalta.length;
    if (emFalta.length === 0) continue;

    console.log(`${pasta}: ${emFalta.length} em falta de ${originais.length}`);
    if (!APLICAR) continue;

    for (const nome of emFalta) {
      const caminho = `${pasta}/${nome}`;
      try {
        const { data, error } = await sb.storage.from(ORIGINAIS).download(caminho);
        if (error || !data) throw new Error(error?.message ?? "descarga vazia");
        const bytes = Buffer.from(await data.arrayBuffer());
        const thumb = await sharp(bytes)
          .rotate() // a orientação EXIF, senão as fotos de telemóvel saem deitadas
          .resize(THUMB_EDGE, THUMB_EDGE, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: THUMB_QUALITY })
          .toBuffer();
        const { error: erroUp } = await sb.storage
          .from(MINIATURAS)
          .upload(caminho, thumb, { contentType: "image/jpeg", upsert: false });
        if (erroUp) throw new Error(erroUp.message);
        geradas++;
      } catch (e) {
        // Uma foto que não se consegue tratar não pára a migração: fica sem
        // miniatura, a grelha cai para o original, e o nome aparece aqui.
        falhadas++;
        console.warn(`  ✗ ${caminho}: ${e.message}`);
      }
    }
  }

  console.log(
    `\nfotos vistas: ${vistas}\n` +
      `já tinham miniatura: ${jaTinham}\n` +
      `${APLICAR ? "geradas" : "por gerar"}: ${APLICAR ? geradas : vistas - jaTinham}\n` +
      (falhadas ? `falhadas: ${falhadas}\n` : ""),
  );

  if (!APLICAR && vistas - jaTinham > 0) {
    console.log("Para escrever mesmo, repita com --aplicar.");
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
