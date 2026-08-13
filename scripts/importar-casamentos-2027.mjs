/**
 * CASAMENTOS DE 2027 → CALENDÁRIO DO BACK OFFICE.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/importar-casamentos-2027.mjs
 *
 *   (por omissão faz ENSAIO — não escreve nada)
 *   --aplicar   escreve mesmo
 *
 * OU, sem terminal, sem chaves e sem instalar nada:
 *   node scripts/importar-casamentos-2027.mjs --sql
 * ...e colar o resultado no SQL Editor do Supabase, onde já se está
 * autenticado. É o caminho mais simples e não precisa do resto deste
 * ficheiro — nem sequer das variáveis de ambiente.
 *
 * ── Porque é que isto é um guião e não foi feito por mim ──────────────────
 * O calendário do back office vive na tabela `calendar_events` do Supabase. A
 * máquina onde este guião foi escrito não tem as chaves do projecto, portanto
 * escrever ali nunca chegaria ao calendário verdadeiro — ficaria num ficheiro
 * local que ninguém vê. Quem tem as chaves é ela; o guião é a forma de o
 * trabalho ficar feito na mesma, e de ser repetível.
 *
 * ── Porque é que o ensaio é o padrão ──────────────────────────────────────
 * Isto escreve no calendário de trabalho. Correr primeiro sem escrever, e ver a
 * lista que sai, custa segundos e evita a única categoria de engano que aqui
 * importa: uma data mal lida de uma fotografia. A mesma razão do guião das
 * miniaturas.
 *
 * ── O que NUNCA faz ───────────────────────────────────────────────────────
 * Não apaga nada e não escreve duas vezes o mesmo casamento: antes de inserir,
 * procura um evento com a MESMA data e o MESMO título. Repetir a execução é
 * seguro — a segunda passagem não tem trabalho.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APLICAR = process.argv.includes("--aplicar");
const SO_SQL = process.argv.includes("--sql");

/**
 * A lista, tal como está na fotografia — e é de propósito que os nomes vão
 * VERBATIM, com as reticências e os parênteses que lá estão. Inventar o que
 * falta ("Catarina e …") seria pôr no calendário um nome que ninguém disse.
 *
 * `confirmado` é o visto amarelo da lista: contrato fechado.
 *
 * ── FALTA A SEGUNDA METADE ────────────────────────────────────────────────
 * A fotografia estava cortada depois de "4 de setembro". Estes são os catorze
 * que se conseguiam ler. Acrescentar os restantes é juntar linhas a esta
 * tabela — não é preciso mexer em mais nada.
 */
const CASAMENTOS = [
  { data: "2027-05-15", nomes: "Maria Silva", local: "Sesimbra", confirmado: false },
  { data: "2027-05-22", nomes: "Maria Carvalho", local: "", confirmado: true },
  // Sem nomes na lista — só o espaço. Fica o espaço como identificação.
  { data: "2027-05-29", nomes: "", local: "Convento do Espinheiro", confirmado: true },
  // ATENÇÃO: é uma QUINTA-FEIRA (todos os outros são sábados). É também o
  // feriado de 10 de Junho, por isso é plausível — mas confirme antes de
  // aplicar, porque uma data mal lida é o engano mais provável aqui.
  { data: "2027-06-10", nomes: "Irina e Hugo", local: "", confirmado: true },
  { data: "2027-06-12", nomes: "Ashley e Bart", local: "Alvito", confirmado: false },
  { data: "2027-06-26", nomes: "João e Sandra", local: "Convento do Espinheiro", confirmado: true },
  {
    data: "2027-06-26",
    nomes: "Ana Margarida Canhoto",
    local: "Herdade da Maridona, Glória",
    confirmado: false,
  },
  { data: "2027-07-03", nomes: "Maria Rebocho e Zé", local: "", confirmado: false },
  {
    data: "2027-07-10",
    nomes: "Catarina e … (amiga Mariana)",
    local: "Morgado do Quintão, Silves",
    confirmado: false,
  },
  {
    data: "2027-07-24",
    nomes: "Rita Cotrim e Ricardo",
    local: "Quinta Gaio de Cima",
    confirmado: true,
  },
  {
    data: "2027-07-31",
    nomes: "Marta Santos",
    local: "Casa de Vilela, Santo Tirso",
    confirmado: false,
  },
  { data: "2027-08-07", nomes: "Inês e Gonçalo", local: "Colina dos Piscos", confirmado: false },
  { data: "2027-08-28", nomes: "Rita Cruz e Jacob", local: "Quinta da Falésia", confirmado: true },
  {
    data: "2027-09-04",
    nomes: "Inês Bragança",
    local: "Herdade do Chafariz",
    confirmado: false,
  },
];

/**
 * O título é o que se lê na célula do mês, e as células são estreitas — por
 * isso é curto e começa pelo que distingue: os nomes.
 *
 * "(por confirmar)" vai no TÍTULO e não só na nota porque é a diferença que
 * ela quer ver de relance, sem abrir o dia. Um contrato fechado e um talvez
 * não podem ter o mesmo aspecto na grelha.
 */
function tituloDe(c) {
  const quem = c.nomes || c.local || "Casamento";
  return c.confirmado ? `Casamento — ${quem}` : `Casamento — ${quem} (por confirmar)`;
}

function notaDe(c) {
  const partes = [];
  if (c.local) partes.push(c.local);
  partes.push(c.confirmado ? "Confirmado" : "Por confirmar");
  return partes.join(" · ");
}

/**
 * O mesmo trabalho, em SQL para colar no editor do Supabase.
 *
 * Existe porque a alternativa — terminal, Node, dependências instaladas, e uma
 * chave `service_role` copiada para a linha de comandos — é muito pedir para
 * catorze linhas. No SQL Editor já se está autenticado: cola-se e carrega-se
 * em Run.
 *
 * Sai da MESMA tabela `CASAMENTOS` daqui de cima, portanto os dois caminhos
 * nunca podem discordar.
 *
 * `where not exists` faz o mesmo que a deduplicação do guião: correr duas
 * vezes não duplica nada.
 */
function comoSql() {
  const esc = (t) => String(t).replace(/'/g, "''");
  const linhas = [...CASAMENTOS]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((c) => {
      const title = esc(tituloDe(c));
      const note = esc(notaDe(c));
      return (
        `insert into public.calendar_events (event_date, title, kind, note)\n` +
        `select date '${c.data}', '${title}', 'evento', '${note}'\n` +
        `where not exists (\n` +
        `  select 1 from public.calendar_events\n` +
        `  where event_date = date '${c.data}' and title = '${title}'\n` +
        `);`
      );
    });
  return (
    `-- Casamentos de 2027 no calendário do back office.\n` +
    `-- Colar no SQL Editor do Supabase e carregar em Run.\n` +
    `-- Correr duas vezes é seguro: cada linha só entra se ainda não existir.\n\n` +
    linhas.join("\n\n") +
    `\n\n-- Para conferir depois:\n` +
    `-- select event_date, title, note from public.calendar_events\n` +
    `--  where event_date between date '2027-01-01' and date '2027-12-31'\n` +
    `--  order by event_date;\n`
  );
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const diaDaSemana = (iso) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

// O caminho do SQL não toca na rede nem precisa de chave nenhuma — por isso
// responde antes de tudo o resto.
if (SO_SQL) {
  console.log(comoSql());
  process.exit(0);
}

if (!URL || !KEY) {
  console.error(
    "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Encontra-as no Supabase → Project Settings → API.",
  );
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  if (!APLICAR) {
    console.log("ENSAIO — nada será escrito. Junte --aplicar para escrever mesmo.\n");
  }

  // Tudo o que já lá está para estas datas, numa leitura só.
  const datas = [...new Set(CASAMENTOS.map((c) => c.data))];
  const { data: existentes, error } = await sb
    .from("calendar_events")
    .select("event_date,title")
    .in("event_date", datas);
  if (error) {
    console.error(`não deu para ler o calendário: ${error.message}`);
    process.exit(1);
  }
  const jaLa = new Set((existentes ?? []).map((e) => `${e.event_date}|${e.title}`));

  const agora = new Date().toISOString();
  const porInserir = [];
  let repetidos = 0;

  for (const c of [...CASAMENTOS].sort((a, b) => a.data.localeCompare(b.data))) {
    const title = tituloDe(c);
    const marca = `${c.data}|${title}`;
    const dia = diaDaSemana(c.data);
    const aviso = dia !== "sábado" ? `  ⚠ ${dia}` : "";
    if (jaLa.has(marca)) {
      repetidos++;
      console.log(`  = ${c.data}  ${title}   (já lá estava)`);
      continue;
    }
    console.log(`  + ${c.data}  ${title}${aviso}`);
    // Os nomes das colunas são os da tabela (`db/schema.sql`), não os do tipo
    // `CalendarEvent` do TypeScript: ali é `event_date`, não `date`. Escrever
    // `date` passava no ensaio e rebentava ao aplicar.
    porInserir.push({
      id: randomUUID(),
      event_date: c.data,
      title,
      kind: "evento",
      note: notaDe(c),
      created_at: agora,
    });
  }

  console.log(
    `\ncasamentos na lista: ${CASAMENTOS.length}\n` +
      `já no calendário: ${repetidos}\n` +
      `${APLICAR ? "a inserir" : "por inserir"}: ${porInserir.length}\n`,
  );

  if (!APLICAR) {
    if (porInserir.length > 0) console.log("Para escrever mesmo, repita com --aplicar.");
    return;
  }
  if (porInserir.length === 0) return;

  const { error: erroIns } = await sb.from("calendar_events").insert(porInserir);
  if (erroIns) {
    console.error(`falhou a inserir: ${erroIns.message}`);
    process.exit(1);
  }
  console.log(`${porInserir.length} casamentos inseridos no calendário.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
