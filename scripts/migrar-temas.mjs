/**
 * MIGRAÇÃO DOS TEMAS → ETIQUETAS POR EIXO (versão de terminal).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrar-temas.mjs
 *
 *   (por omissão faz ENSAIO — lê tudo, calcula tudo, imprime a verificação, e
 *   não escreve uma única linha)
 *   --aplicar    escreve mesmo
 *   --com-fusao  junta as etiquetas das fotos repetidas em duas pastas
 *
 * ── O caminho recomendado é o OUTRO ───────────────────────────────────────
 * `scripts/migrar-temas.sql`, colado no SQL Editor do Supabase: não precisa de
 * chaves nem de terminal, e corre dentro de uma transacção — ou faz tudo, ou
 * não faz nada. Este ficheiro existe para quem preferir o terminal e para o
 * trabalho poder ser repetido a partir de uma máquina.
 *
 * ── A diferença que importa entre os dois ─────────────────────────────────
 * Aqui NÃO há transacção: o cliente do Supabase fala por HTTP, uma escrita de
 * cada vez. Por isso o desenho é outro — lê-se tudo, calcula-se tudo em
 * memória, VERIFICA-SE, e só depois se escreve. O ensaio não é uma execução
 * desfeita no fim; é a mesma conta, sem a escrita.
 *
 * ── O que NUNCA faz ───────────────────────────────────────────────────────
 * Não apaga nada, não move nenhum ficheiro, não toca em capas nem em ordens
 * manuais. Só acrescenta linhas. Repetir é seguro: tudo o que escreve tem
 * chave própria e ignora o que já lá está.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APLICAR = process.argv.includes("--aplicar");
const COM_FUSAO = process.argv.includes("--com-fusao");

const BUCKET = "theme-assets";
const PAGINA = 1000;

/**
 * As regras, uma entrada por EIXO de cada tema — as mesmas do
 * `migrar-temas.sql`, e é aqui que se editam se um tema mudar de nome.
 *
 * `modo: "todas"` = a foto tem de ter todas as etiquetas da entrada. É o
 * normal, e é o que o nome dos temas diz: "Bouquets Branco e Amarelo" é branco
 * E amarelo. Com "qualquer" bastava uma — e aí as 16 fotos de "Branco e Verde"
 * (que também são bouquets brancos) apareciam nos dois temas.
 */
const REGRAS = [
  { tema: "Bouquets Branco e Amarelo", eixo: "tipo", modo: "todas", etiquetas: ["tipo:bouquet"] },
  {
    tema: "Bouquets Branco e Amarelo",
    eixo: "paleta",
    modo: "todas",
    etiquetas: ["paleta:branco", "paleta:amarelo"],
  },
  { tema: "Bouquets Branco e Verde", eixo: "tipo", modo: "todas", etiquetas: ["tipo:bouquet"] },
  {
    tema: "Bouquets Branco e Verde",
    eixo: "paleta",
    modo: "todas",
    etiquetas: ["paleta:branco", "paleta:verde"],
  },
  { tema: "Itália", eixo: "estilo", modo: "todas", etiquetas: ["estilo:mediterranico"] },
  { tema: "Seating Plans", eixo: "tipo", modo: "todas", etiquetas: ["tipo:seating-plan"] },
  {
    tema: "Simples mas colorido",
    eixo: "estilo",
    modo: "todas",
    etiquetas: ["estilo:minimalista"],
  },
  { tema: "Simples mas colorido", eixo: "paleta", modo: "todas", etiquetas: ["paleta:colorido"] },
  { tema: "Terracotta", eixo: "paleta", modo: "todas", etiquetas: ["paleta:terracotta"] },
];

/** O nome como se compara — sem maiúsculas nem espaços à volta. */
const chave = (nome) =>
  String(nome ?? "")
    .trim()
    .toLowerCase();

/** As entradas de regra de um tema (vazio = tema sem regra, fica como está). */
const regrasDe = (nome) => REGRAS.filter((r) => chave(r.tema) === chave(nome));

/**
 * O eTag da listagem é o MD5 do conteúdo — mas só quando o é. Um eTag com
 * hífen (upload em várias partes) NÃO é o MD5 do ficheiro, e tomá-lo por um
 * faria duas fotos diferentes passarem por repetidas. Na dúvida, `null`: não
 * se afirma nada e a fusão simplesmente não acontece para essa foto.
 */
function md5DoETag(etag) {
  const limpo = String(etag ?? "")
    .replace(/"/g, "")
    .trim();
  return /^[0-9a-f]{32}$/i.test(limpo) ? limpo.toLowerCase() : null;
}

/** Lista uma pasta inteira do bucket, por páginas. */
async function listarPasta(sb, pasta) {
  const objetos = [];
  for (let p = 0; ; p++) {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .list(pasta, { limit: PAGINA, offset: p * PAGINA });
    if (error) throw new Error(`não consegui ler a pasta ${pasta}: ${error.message}`);
    const ficheiros = (data ?? []).filter((o) => o.id && !o.name.startsWith("."));
    for (const o of ficheiros) {
      objetos.push({
        path: `${pasta}/${o.name}`,
        md5: md5DoETag(o.metadata?.eTag),
        fingerprint: /^([0-9a-f]{32})/i.exec(o.name)?.[1]?.toLowerCase() ?? null,
        created_at: o.created_at ?? new Date().toISOString(),
      });
    }
    if ((data ?? []).length < PAGINA) return objetos;
  }
}

/** A foto (o conjunto de etiquetas que tem) cumpre esta entrada de regra? */
function cumpre(etiquetasDaFoto, entrada) {
  return entrada.modo === "qualquer"
    ? entrada.etiquetas.some((e) => etiquetasDaFoto.has(e))
    : entrada.etiquetas.every((e) => etiquetasDaFoto.has(e));
}

function tabela(linhas) {
  const largura = linhas.reduce((m, l) => Math.max(m, l[0].length), 0);
  for (const [rotulo, valor] of linhas) console.log(`  ${rotulo.padEnd(largura)}  ${valor}`);
}

async function main() {
  if (!URL || !KEY) {
    console.error(
      "Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Sem chaves, use antes scripts/migrar-temas.sql no SQL Editor do Supabase.",
    );
    process.exit(1);
  }
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });

  // ── LER ──────────────────────────────────────────────────────────────────
  const { data: temas, error: erroTemas } = await sb
    .from("proposal_themes")
    .select("id, name, kind")
    .order("name");
  if (erroTemas) throw new Error(`não consegui ler os temas: ${erroTemas.message}`);

  // O nome corrigido conta como o nome novo já a partir daqui — é ele que liga
  // cada regra ao seu tema.
  const renomear = temas.filter((t) => chave(t.name) === "seatings plans");
  for (const t of renomear) t.name = "Seating Plans";

  const fotos = new Map(); // path → { md5, fingerprint, created_at, pasta, etiquetas:Set }
  for (const t of temas) {
    for (const o of await listarPasta(sb, t.id)) {
      fotos.set(o.path, { ...o, pasta: t.id, etiquetas: new Set() });
    }
  }

  // ── CALCULAR ─────────────────────────────────────────────────────────────
  // 1) Etiquetas derivadas da pasta onde a foto está hoje.
  const porPasta = new Map(temas.map((t) => [t.id, regrasDe(t.name).flatMap((r) => r.etiquetas)]));
  for (const foto of fotos.values()) {
    for (const e of porPasta.get(foto.pasta) ?? []) foto.etiquetas.add(e);
  }
  const derivadas = [...fotos.values()].reduce((n, f) => n + f.etiquetas.size, 0);

  // 2) Fusão: bytes iguais em pastas diferentes são a mesma foto.
  const porMd5 = new Map();
  for (const [path, f] of fotos) {
    if (!f.md5) continue;
    if (!porMd5.has(f.md5)) porMd5.set(f.md5, []);
    porMd5.get(f.md5).push(path);
  }
  const repetidas = [...porMd5.values()].filter((g) => g.length > 1);
  const fusao = new Map(); // path → Set de etiquetas ganhas por fusão
  for (const grupo of repetidas) {
    const juntas = new Set(grupo.flatMap((p) => [...fotos.get(p).etiquetas]));
    for (const p of grupo) {
      const ganhas = [...juntas].filter((e) => !fotos.get(p).etiquetas.has(e));
      if (ganhas.length) fusao.set(p, new Set(ganhas));
    }
  }
  if (COM_FUSAO) {
    for (const [path, ganhas] of fusao) for (const e of ganhas) fotos.get(path).etiquetas.add(e);
  }

  // ── VERIFICAR ────────────────────────────────────────────────────────────
  const listaFotos = [...fotos.values()];
  let perdidasTotal = 0;
  const porTema = temas
    .filter((t) => regrasDe(t.name).length > 0)
    .map((t) => {
      const regra = regrasDe(t.name);
      const corresponde = (f) => regra.every((r) => cumpre(f.etiquetas, r));
      const antes = listaFotos.filter((f) => f.pasta === t.id);
      const perdidas = antes.filter((f) => !corresponde(f)).length;
      perdidasTotal += perdidas;
      return {
        nome: t.name,
        antes: antes.length,
        agora: listaFotos.filter(corresponde).length,
        perdidas,
      };
    });

  console.log(
    `\n${APLICAR ? "APLICAR" : "ENSAIO"} — fusão ${COM_FUSAO ? "ligada" : "desligada"}\n`,
  );
  console.log("  tema                          antes   agora   perdidas");
  for (const t of porTema) {
    console.log(
      `  ${t.nome.padEnd(28)}  ${String(t.antes).padStart(5)}   ${String(t.agora).padStart(5)}   ${String(t.perdidas).padStart(8)}`,
    );
  }
  console.log("");
  tabela([
    ["fotos no total", listaFotos.length],
    ["etiquetas derivadas da pasta", derivadas],
    ["fotos repetidas (bytes iguais)", repetidas.reduce((n, g) => n + g.length, 0)],
    ["etiquetas que a fusão acrescenta", [...fusao.values()].reduce((n, s) => n + s.size, 0)],
    [
      "fotos que ficam SEM tipo",
      listaFotos.filter((f) => ![...f.etiquetas].some((e) => e.startsWith("tipo:"))).length,
    ],
  ]);

  if (perdidasTotal > 0) {
    console.error(
      `\nPARADO: ${perdidasTotal} foto(s) deixariam de aparecer no seu tema.\n` +
        "Isto não se aplica — as regras estão erradas. Não foi escrito nada.",
    );
    process.exit(1);
  }
  if (!APLICAR) {
    console.log(
      "\nEnsaio. Nada foi escrito. Repita com --aplicar quando os números baterem certo.\n",
    );
    return;
  }

  // ── ESCREVER ─────────────────────────────────────────────────────────────
  // Por esta ordem, e cada passo repetível: se algo falhar a meio, correr outra
  // vez continua de onde ficou em vez de duplicar.
  for (const t of renomear) {
    const { error } = await sb
      .from("proposal_themes")
      .update({ name: "Seating Plans", updated_at: new Date().toISOString() })
      .eq("id", t.id);
    if (error) throw new Error(`renomear falhou: ${error.message}`);
  }

  const linhasFotos = listaFotos.map((f) => ({
    path: f.path,
    md5: f.md5,
    fingerprint: f.fingerprint,
    created_at: f.created_at,
  }));
  for (let i = 0; i < linhasFotos.length; i += 500) {
    const { error } = await sb
      .from("biblioteca_fotos")
      .upsert(linhasFotos.slice(i, i + 500), { onConflict: "path", ignoreDuplicates: true });
    if (error) throw new Error(`gravar fotos falhou: ${error.message}`);
  }

  // As ligações NÃO se escrevem por `upsert`: a chave desta tabela é uma coluna
  // GERADA (`path || '#' || etiqueta_id`), e uma coluna gerada não se manda —
  // não há alvo de conflito para declarar. Lê-se o que já lá está e insere-se
  // só o que falta, o que também é o que torna repetir seguro por construção.
  const { data: jaLa, error: erroLigacoes } = await sb
    .from("biblioteca_foto_etiquetas")
    .select("path, etiqueta_id");
  if (erroLigacoes) throw new Error(`não consegui ler as etiquetas: ${erroLigacoes.message}`);
  const existentes = new Set((jaLa ?? []).map((l) => `${l.path}#${l.etiqueta_id}`));

  const linhasEtiquetas = listaFotos
    .flatMap((f) =>
      [...f.etiquetas].map((e) => ({
        path: f.path,
        etiqueta_id: e,
        origem: fusao.get(f.path)?.has(e) ? "fusao" : "migracao",
      })),
    )
    .filter((l) => !existentes.has(`${l.path}#${l.etiqueta_id}`));
  for (let i = 0; i < linhasEtiquetas.length; i += 500) {
    const { error } = await sb
      .from("biblioteca_foto_etiquetas")
      .insert(linhasEtiquetas.slice(i, i + 500));
    if (error) throw new Error(`gravar etiquetas falhou: ${error.message}`);
  }

  for (const t of temas) {
    const regra = regrasDe(t.name);
    if (regra.length === 0) continue;
    const { error } = await sb
      .from("proposal_themes")
      .update({
        kind: "filtro",
        filter_rule: {
          v: 1,
          eixos: regra.map((r) => ({ eixo: r.eixo, modo: r.modo, etiquetas: r.etiquetas })),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", t.id);
    if (error) throw new Error(`converter "${t.name}" falhou: ${error.message}`);
  }

  console.log(
    `\nFeito: ${listaFotos.length} fotos, ${linhasEtiquetas.length} etiquetas, ` +
      `${porTema.length} temas convertidos em filtros.\n`,
  );
}

main().catch((e) => {
  console.error(`\n${e.message}\nNada foi escrito a partir do ponto onde falhou.\n`);
  process.exit(1);
});
