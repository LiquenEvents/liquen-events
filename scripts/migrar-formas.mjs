/**
 * A FORMA DAS FOTOS QUE JÁ LÁ ESTÃO — migração, uma vez.
 *
 * As colunas `largura`/`altura` da `biblioteca_fotos` existiam no esquema, eram
 * lidas por três consumidores, e NINGUÉM as escrevia. As rotas de carregamento
 * passaram a escrevê-las; este guião trata das fotos que ficaram para trás —
 * que são, hoje, todas as que existem.
 *
 * Sem ele, só as fotografias NOVAS deixam de saltar: a página do casal continua
 * a desenhar as células sem `aspect-ratio` para tudo o que já está carregado, e
 * é isso que produz o salto de 10 833 px que o cabeçalho do `Inspiracao.tsx`
 * mede.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrar-formas.mjs
 *
 *   --ensaio    não escreve nada; só diz o que faria (por omissão está LIGADO)
 *   --aplicar   escreve mesmo
 *   --bucket X  só um bucket (`theme-assets` ou `proposal-assets`)
 *
 * ── Porque é que o ensaio é o padrão ──────────────────────────────────────
 * Isto escreve numa tabela de produção. Correr primeiro sem escrever, e ver a
 * contagem, custa segundos e evita a única categoria de engano que aqui
 * importa: apontar ao projecto errado. É a mesma decisão do `migrar-lqip.mjs`.
 *
 * ── O que NUNCA faz ───────────────────────────────────────────────────────
 * Não apaga nada, não toca nas fotografias, não escreve no Storage, e não
 * substitui uma forma que já exista. Repetir a execução é seguro — a segunda
 * passagem não tem trabalho, e é assim que se retoma uma execução interrompida.
 *
 * ── Porque é que lê o ORIGINAL e não a miniatura ──────────────────────────
 * Ao contrário do LQIP, aqui o TAMANHO é o dado. A proporção da miniatura é a
 * mesma do original (é feita com `fit: inside`), e para o `aspect-ratio` da
 * página bastaria — mas as «suspeitas» da verificação pré-envio perguntam se a
 * fotografia é PEQUENA DEMAIS para o sítio onde vai ser impressa, e a resposta
 * a essa pergunta só está no original. Ler a miniatura punha essa verificação a
 * dizer que todas as fotos são pequenas.
 *
 * ── E porque é que passa pelo `.rotate()` implícito da leitura ────────────
 * Uma foto de telemóvel ao alto tem largura e altura TROCADAS no cabeçalho,
 * com uma etiqueta de orientação a dizer que se roda ao mostrar. Gravar os
 * números do cabeçalho punha a página a reservar uma caixa deitada para uma
 * fotografia ao alto — o mesmo salto, com mais um passo pelo meio. A troca de
 * eixos aqui é a MESMA regra do `dimensoesReais` em `src/lib/proposal-image.ts`.
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APLICAR = process.argv.includes("--aplicar");
const SO_BUCKET = (() => {
  const i = process.argv.indexOf("--bucket");
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** Os dois sítios de onde nasce uma linha em `biblioteca_fotos`. */
const BUCKETS = ["theme-assets", "proposal-assets"];

if (!URL || !KEY) {
  console.error(
    "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Encontra-as no Supabase → Project Settings → API.",
  );
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

/** As pastas de primeiro nível de um bucket. */
async function pastas(bucket) {
  const { data, error } = await sb.storage.from(bucket).list("", { limit: 1000 });
  if (error) throw new Error(`não deu para listar "${bucket}": ${error.message}`);
  // Uma pasta no Storage aparece sem `id`; os ficheiros soltos têm.
  return (data ?? []).filter((o) => !o.id).map((o) => o.name);
}

/** Todos os ficheiros de uma pasta, por páginas. */
async function ficheiros(bucket, pasta) {
  const nomes = [];
  for (let pagina = 0; pagina < 40; pagina++) {
    const { data, error } = await sb.storage
      .from(bucket)
      .list(pasta, { limit: 500, offset: pagina * 500 });
    if (error) throw new Error(`não deu para listar "${pasta}": ${error.message}`);
    nomes.push(...(data ?? []).filter((o) => o.id && !o.name.startsWith(".")).map((o) => o.name));
    if ((data ?? []).length < 500) break;
  }
  return nomes;
}

/** Os caminhos que JÁ têm forma — para não voltar a fazer o trabalho. */
async function jaTem(caminhos) {
  const feitos = new Set();
  // Aos pedaços: um `in` com milhares de caminhos rebenta o limite do URL do
  // PostgREST. É o mesmo cuidado do `migrar-lqip.mjs`.
  for (let i = 0; i < caminhos.length; i += 200) {
    const { data, error } = await sb
      .from("biblioteca_fotos")
      .select("path,largura,altura")
      .in("path", caminhos.slice(i, i + 200));
    if (error) throw new Error(`não deu para ler biblioteca_fotos: ${error.message}`);
    for (const r of data ?? []) if (r.largura && r.altura) feitos.add(r.path);
  }
  return feitos;
}

/**
 * A forma real de uns bytes — DEPOIS da orientação EXIF. `null` quando nem o
 * sharp os lê; nunca lança. Gémea do `dimensoesReais` do lado da aplicação.
 */
async function formaDe(bytes) {
  try {
    const m = await sharp(bytes, { failOn: "none" }).metadata();
    if (!m.width || !m.height) return null;
    const deitada = typeof m.orientation === "number" && m.orientation >= 5;
    return deitada
      ? { largura: m.height, altura: m.width }
      : { largura: m.width, altura: m.height };
  } catch {
    return null;
  }
}

async function gravar(caminho, forma) {
  // `upsert` porque a linha pode não existir: em `biblioteca_fotos` ela nasce
  // de forma preguiçosa (só quando alguém etiqueta a foto, ou quando o
  // carregamento lhe grava a cor).
  const { error } = await sb
    .from("biblioteca_fotos")
    .upsert(
      { path: caminho, ...forma, updated_at: new Date().toISOString() },
      { onConflict: "path" },
    );
  if (error) throw new Error(error.message);
}

async function main() {
  console.log(APLICAR ? "A APLICAR — escreve mesmo.\n" : "ENSAIO — não escreve nada.\n");

  let total = 0;
  let feitos = 0;
  let saltados = 0;
  const falhados = [];

  for (const bucket of SO_BUCKET ? [SO_BUCKET] : BUCKETS) {
    let listaPastas;
    try {
      listaPastas = await pastas(bucket);
    } catch (e) {
      // Um bucket que ainda não existe nesta instalação não é um erro.
      console.log(`  ${bucket}: ignorado (${e.message})`);
      continue;
    }
    for (const pasta of listaPastas) {
      const nomes = await ficheiros(bucket, pasta);
      if (nomes.length === 0) continue;
      const caminhos = nomes.map((n) => `${pasta}/${n}`);
      total += caminhos.length;

      const comForma = await jaTem(caminhos);
      const porFazer = caminhos.filter((c) => !comForma.has(c));
      saltados += caminhos.length - porFazer.length;
      if (porFazer.length === 0) continue;

      console.log(`${bucket}/${pasta}: ${porFazer.length} por fazer`);
      for (const caminho of porFazer) {
        const { data, error } = await sb.storage.from(bucket).download(caminho);
        if (error || !data) {
          falhados.push(`${caminho} (não descarregou)`);
          continue;
        }
        const forma = await formaDe(Buffer.from(await data.arrayBuffer()));
        if (!forma) {
          falhados.push(`${caminho} (o sharp não lê)`);
          continue;
        }
        if (APLICAR) await gravar(caminho, forma);
        feitos++;
      }
    }
  }

  console.log(
    `\n${total} fotografias · ${feitos} ${APLICAR ? "gravadas" : "por gravar"} · ` +
      `${saltados} já tinham forma · ${falhados.length} falhadas`,
  );
  for (const f of falhados) console.log(`  ✗ ${f}`);
  if (!APLICAR && feitos > 0) console.log("\nPara escrever mesmo: --aplicar");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
