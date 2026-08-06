/**
 * O LQIP E A MICRO DAS FOTOS QUE JÁ LÁ ESTÃO — migração, uma vez.
 *
 * As fotos carregadas DEPOIS desta funcionalidade já trazem o seu placeholder,
 * gerado no navegador (ver `image-worker.ts`). Este guião trata das que ficaram
 * para trás — que são todas as que existem hoje, incluindo as 104 da
 * biblioteca. Sem ele, a Biblioteca de Temas continua com a caixa cinzenta de
 * 1,8 a 2,2 segundos que a linha de base mediu, e só as fotos NOVAS melhoram.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrar-lqip.mjs
 *
 *   --ensaio    não escreve nada; só diz o que faria (por omissão está LIGADO)
 *   --aplicar   escreve mesmo
 *   --tema X    só uma pasta
 *
 * ── Porque é que o ensaio é o padrão ──────────────────────────────────────
 * Isto escreve numa tabela de produção. Correr primeiro sem escrever, e ver a
 * contagem, custa segundos e evita a única categoria de engano que aqui
 * importa: apontar ao projecto errado.
 *
 * ── O que NUNCA faz ───────────────────────────────────────────────────────
 * Não apaga nada, não toca nas fotografias, não escreve no Storage, e não
 * substitui um LQIP que já exista. Repetir a execução é seguro — a segunda
 * passagem não tem trabalho, e é assim que se retoma uma execução interrompida.
 *
 * ── Porque é que lê a MINIATURA e não o original ──────────────────────────
 * Porque o resultado é indistinguível e o preço não é. Um LQIP tem 16 px: sai
 * igual de uma fonte de 400 px ou de uma de 2200. Ler as miniaturas das 104
 * fotos são ~2 MB; ler os originais seriam ~58 MB, para deitar fora 99,9% dos
 * pixéis. Só se cai no original quando não há miniatura (as fotos anteriores a
 * ELA existirem).
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APLICAR = process.argv.includes("--aplicar");
const SO_TEMA = (() => {
  const i = process.argv.indexOf("--tema");
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** Os mesmos valores que o navegador usa em `image-worker.ts`. Se divergirem,
 *  as fotos migradas ficam com um placeholder diferente das novas — e a
 *  diferença vê-se, porque é a COR que aparece primeiro. */
const LQIP_EDGE = 16;
const LQIP_QUALITY = 40;
/** O mesmo tecto de `src/lib/lqip.ts`. Acima disto não se grava. */
const LQIP_MAX_CHARS = 1200;

/** A derivada de 96 px para as tiras do cartão de tema. Mesmos valores que o
 *  navegador usa em `image-worker.ts` (MICRO_EDGE / MICRO_QUALITY). */
const MICRO_EDGE = 96;
const MICRO_QUALITY = 65;

const ORIGINAIS = "theme-assets";
const MINIATURAS = "theme-thumbs";
const MICRO = "theme-micro";

if (!URL || !KEY) {
  console.error(
    "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Encontra-as no Supabase → Project Settings → API.",
  );
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

/** As pastas de primeiro nível do bucket — uma por tema. */
async function pastas() {
  if (SO_TEMA) return [SO_TEMA];
  const { data, error } = await sb.storage.from(ORIGINAIS).list("", { limit: 1000 });
  if (error) throw new Error(`não deu para listar as pastas: ${error.message}`);
  // Uma pasta no Storage aparece sem `id`; os ficheiros soltos têm.
  return (data ?? []).filter((o) => !o.id).map((o) => o.name);
}

/** Todos os ficheiros de uma pasta, por páginas. */
async function ficheiros(pasta) {
  const nomes = [];
  for (let pagina = 0; pagina < 40; pagina++) {
    const { data, error } = await sb.storage
      .from(ORIGINAIS)
      .list(pasta, { limit: 500, offset: pagina * 500 });
    if (error) throw new Error(`não deu para listar "${pasta}": ${error.message}`);
    const lote = (data ?? []).filter((o) => o.id && !o.name.startsWith("."));
    nomes.push(...lote.map((o) => o.name));
    if ((data ?? []).length < 500) break;
  }
  return nomes;
}

/** Os caminhos que já têm MICRO no bucket. */
async function jaTemMicro(pasta, nomes) {
  const feitos = new Set();
  for (let pagina = 0; pagina < 40; pagina++) {
    const { data, error } = await sb.storage
      .from(MICRO)
      .list(pasta, { limit: 500, offset: pagina * 500 });
    // Um bucket que ainda não existe não é um erro: quer dizer "nenhuma feita".
    if (error) return feitos;
    for (const o of data ?? []) if (o.id) feitos.add(`${pasta}/${o.name}`);
    if ((data ?? []).length < 500) break;
  }
  void nomes;
  return feitos;
}

/** Os caminhos que JÁ têm LQIP — para não voltar a fazer o trabalho. */
async function jaTem(caminhos) {
  const feitos = new Set();
  // Aos pedaços: um `in` com 5000 caminhos rebenta o limite do URL do PostgREST.
  for (let i = 0; i < caminhos.length; i += 200) {
    const { data, error } = await sb
      .from("biblioteca_fotos")
      .select("path,lqip")
      .in("path", caminhos.slice(i, i + 200));
    if (error) throw new Error(`não deu para ler biblioteca_fotos: ${error.message}`);
    for (const r of data ?? []) if (r.lqip) feitos.add(r.path);
  }
  return feitos;
}

/** Descarrega os bytes de um caminho, preferindo a miniatura. */
async function bytesDe(caminho) {
  for (const bucket of [MINIATURAS, ORIGINAIS]) {
    const { data, error } = await sb.storage.from(bucket).download(caminho);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }
  return null;
}

/** A micro de uns bytes — 96 px. `null` quando não dá; nunca lança. */
async function microDe(bytes) {
  try {
    return await sharp(bytes)
      .rotate()
      .resize({ width: MICRO_EDGE, height: MICRO_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: MICRO_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
}

/** O LQIP de uns bytes. `null` quando não dá — nunca lança. */
async function lqipDe(bytes) {
  try {
    const buf = await sharp(bytes)
      .rotate()
      .resize({ width: LQIP_EDGE, height: LQIP_EDGE, fit: "inside" })
      .webp({ quality: LQIP_QUALITY })
      .toBuffer();
    const uri = `data:image/webp;base64,${buf.toString("base64")}`;
    return uri.length <= LQIP_MAX_CHARS ? uri : null;
  } catch {
    return null;
  }
}

async function gravar(caminho, lqip) {
  // `upsert` porque a linha pode não existir: em `biblioteca_fotos` ela nasce
  // de forma preguiçosa (só quando alguém etiqueta a foto), e a esmagadora
  // maioria das 104 nunca foi etiquetada.
  const { error } = await sb
    .from("biblioteca_fotos")
    .upsert({ path: caminho, lqip, updated_at: new Date().toISOString() }, { onConflict: "path" });
  if (error) throw new Error(error.message);
}

/** Guarda a micro no bucket, com a MESMA chave do original. */
async function gravarMicro(caminho, bytes) {
  const { error } = await sb.storage
    .from(MICRO)
    .upload(caminho, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
}

async function main() {
  console.log(APLICAR ? "A APLICAR — escreve mesmo.\n" : "ENSAIO — não escreve nada.\n");

  const listaPastas = await pastas();
  let total = 0;
  let feitos = 0;
  let saltados = 0;
  const falhados = [];

  for (const pasta of listaPastas) {
    const nomes = await ficheiros(pasta);
    if (nomes.length === 0) continue;
    const caminhos = nomes.map((n) => `${pasta}/${n}`);
    total += caminhos.length;

    const [comLqip, comMicro] = await Promise.all([jaTem(caminhos), jaTemMicro(pasta, nomes)]);
    // Uma foto entra no trabalho se lhe faltar QUALQUER uma das duas.
    const porFazer = caminhos.filter((c) => !comLqip.has(c) || !comMicro.has(c));
    saltados += caminhos.length - porFazer.length;

    process.stdout.write(`${pasta}: ${caminhos.length} fotos, ${porFazer.length} por fazer... `);

    let daPasta = 0;
    // Em série, de propósito: são ~20 KB cada e o que importa aqui é não
    // atropelar o Storage nem a base de dados com 300 pedidos ao mesmo tempo.
    // Isto corre uma vez.
    for (const caminho of porFazer) {
      const bytes = await bytesDe(caminho);
      if (!bytes) {
        falhados.push({ caminho, motivo: "não deu para descarregar" });
        continue;
      }
      // As duas do MESMO descarregamento — os bytes já cá estão.
      const [lqip, micro] = await Promise.all([lqipDe(bytes), microDe(bytes)]);
      if (!lqip && !micro) {
        falhados.push({ caminho, motivo: "não deu para gerar" });
        continue;
      }
      if (APLICAR) {
        try {
          if (lqip && !comLqip.has(caminho)) await gravar(caminho, lqip);
          if (micro && !comMicro.has(caminho)) await gravarMicro(caminho, micro);
        } catch (e) {
          falhados.push({ caminho, motivo: `não deu para gravar: ${e.message}` });
          continue;
        }
      }
      daPasta += 1;
      feitos += 1;
    }
    console.log(`${daPasta} ${APLICAR ? "gravados" : "prontos"}`);
  }

  console.log(
    `\n${total} fotos · ${feitos} ${APLICAR ? "com LQIP novo" : "prontas a receber LQIP"} · ` +
      `${saltados} já tinham · ${falhados.length} falhadas`,
  );

  if (falhados.length > 0) {
    console.log("\nFalhadas:");
    for (const f of falhados.slice(0, 20)) console.log(`  ${f.caminho} — ${f.motivo}`);
    if (falhados.length > 20) console.log(`  … e mais ${falhados.length - 20}`);
    console.log(
      "\nUma foto falhada fica sem placeholder — a célula comporta-se como hoje.\n" +
        "Voltar a correr tenta só essas.",
    );
  }

  if (!APLICAR && feitos > 0) {
    console.log("\nPara escrever mesmo:  node scripts/migrar-lqip.mjs --aplicar");
  }
}

main().catch((e) => {
  console.error(`\nParou: ${e.message}`);
  process.exit(1);
});
