-- ════════════════════════════════════════════════════════════════
-- Líquen Events — esquema da base de dados (Supabase / PostgreSQL)
-- Como usar:
--   1. Crie um projeto grátis em https://supabase.com
--   2. Abra "SQL Editor" → "New query"
--   3. Cole TODO este ficheiro e clique "Run"
--   4. Copie SUPABASE_URL e SERVICE_ROLE_KEY (Settings → API) para as
--      variáveis de ambiente do Vercel
-- ════════════════════════════════════════════════════════════════

-- ── Pedidos de orçamento (recebidos pelo site) ──────────────────
create table if not exists public.quotes (
  id          text primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  status      text not null default 'pendente',
  name        text,
  email       text,
  data        jsonb not null
);

create index if not exists quotes_created_at_idx on public.quotes (created_at desc);
create index if not exists quotes_status_idx      on public.quotes (status);

-- ── Propostas (criadas internamente pela equipa) ────────────────
create table if not exists public.proposals (
  id          uuid primary key default gen_random_uuid(),
  quote_id    text references public.quotes (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  status      text not null default 'rascunho',  -- rascunho | enviada | aceite | rejeitada
  client_name text,
  client_email text,
  currency    text not null default 'EUR',
  line_items  jsonb not null default '[]'::jsonb, -- [{ description, qty, unitPrice }]
  vat_rate    numeric not null default 0.23,
  subtotal    numeric not null default 0,
  vat         numeric not null default 0,
  total       numeric not null default 0,
  valid_until date,
  notes       text,
  sent_at     timestamptz,
  responded_at timestamptz  -- quando o cliente aceitou/recusou pelo link público
);

-- Migração para instalações existentes (a tabela acima só é criada se não existir).
alter table public.proposals add column if not exists responded_at timestamptz;

-- ── O SELO DO DOCUMENTO ────────────────────────────────────────────────────
-- A impressão digital (SHA-256) do PDF EXACTO que foi enviado ao casal, e o
-- tamanho dele em bytes. Calculada no momento em que a proposta segue — os
-- bytes já estão em memória, portanto não custa nada — e copiada para o
-- contrato quando o casal aceita.
--
-- Para que serve: o aceite já guarda o nome escrito, a hora, o IP e o texto
-- congelado dos termos, o que em Portugal já é uma assinatura electrónica
-- simples. O que faltava era provar QUAL documento foi aceite. Numa discussão
-- do género "o arco não estava incluído", isto é a diferença entre ganhar e
-- ceder — e custa zero.
alter table public.proposals add column if not exists pdf_sha256 text;
alter table public.proposals add column if not exists pdf_bytes integer;

-- Documento do Estúdio de Propostas: o PDF que o casal recebe, em estrutura —
-- capa, mood boards, serviços, orçamento, condições e observações. As fotos NÃO
-- estão aqui: guarda-se o CAMINHO de cada uma no bucket `proposal-assets`.
--
-- Sem esta coluna o `doc` era montado, usado para gerar o PDF do email e
-- deitado fora ao gravar. Consequências medidas: o botão "ver a proposta em
-- PDF" do link do cliente NUNCA podia aparecer (depende de o `doc` existir ao
-- reler), e a proposta ENVIADA não tinha cópia nenhuma do lado do servidor — só
-- o rascunho do estúdio em `app_state`, que a equipa apaga no "Limpar rascunho"
-- e que, na altura, também NÃO ia na cópia de segurança (hoje vai — ver o
-- conjunto `proposalDrafts`). Perdido esse, a proposta que o cliente recebeu
-- deixava de existir em lado nenhum.
--
-- TAMANHO (medido com as formas reais): 4,3 KB só com o texto fixo; ~13 KB numa
-- proposta cheia de 1 mood board; 18,5 KB no tecto de 80 fotos por documento
-- (MAX_IMAGES_PER_DOC, em proposal-doc-render.ts). São caminhos e texto, nunca
-- bytes de imagem — a aplicação recusa acima de 512 KB
-- (MAX_PROPOSAL_DOC_BYTES), o mesmo tecto que o rascunho do estúdio já tinha.
-- Nada disto incomoda o jsonb; onde se sente é na cópia de segurança (ver
-- src/app/api/backup/restore/route.ts, que já a aceita comprimida).
--
-- Idempotente (`if not exists`) e SEM `not null`: as propostas antigas ficam com
-- `doc` a null, que se lê como "não há documento" e é exatamente o que a
-- aplicação já fazia com todas elas — a página do cliente continua a abrir,
-- apenas sem o botão do PDF.
alter table public.proposals add column if not exists doc jsonb;

-- ── O acompanhamento depois de a proposta seguir ───────────────────────────
-- Quando voltar a falar com esta pessoa, e porque é que se perdeu. São dados
-- dela, não derivados: o motivo de recusa de um casamento de 2026 não se
-- reconstrói de mais lado nenhum.
--
-- `follow_up_at` é uma DATE e não um timestamptz de propósito. É "quinta-feira",
-- não "quinta-feira às 14:07 UTC" — guardar hora obrigava a escolher um fuso
-- para a mostrar, e ao pé da meia-noite mostrava o dia errado.
alter table public.proposals add column if not exists follow_up_at date;
alter table public.proposals add column if not exists follow_up_note text;
alter table public.proposals add column if not exists lost_reason text;
alter table public.proposals add column if not exists lost_note text;

-- Qual das duas versões o casal ficou, quando a proposta tinha extras
-- assinalados. Registada à mão por quem recebe a resposta — deduzi-la do valor
-- facturado dava a versão errada em todas as propostas em que se negociou um
-- desconto depois. Ver `orcamento/versoes-da-proposta.ts`.
alter table public.proposals add column if not exists chosen_version text;
alter table public.proposals drop constraint if exists proposals_chosen_version_chk;
alter table public.proposals add constraint proposals_chosen_version_chk
  check (chosen_version is null or chosen_version in ('base','extras')) not valid;

-- O estado "em_negociacao" nasceu depois da restrição de estados. Numa base já
-- instalada, o `if not exists` mais abaixo não a substitui — é preciso deixá-la
-- cair e voltar a criá-la, senão marcar "em negociação" rebenta com um 23514.
alter table public.proposals drop constraint if exists proposals_status_chk;
alter table public.proposals add constraint proposals_status_chk
  check (status in ('rascunho','enviada','em_negociacao','aceite','rejeitada')) not valid;

-- A mesma lista fechada do lado da aplicação (`MotivoDeRecusa`). Está aqui
-- porque o objetivo é poder CONTAR — "perdi seis por preço" — e texto livre
-- numa coluna que se conta é a maneira de nunca mais se poder contar.
alter table public.proposals drop constraint if exists proposals_lost_reason_chk;
alter table public.proposals add constraint proposals_lost_reason_chk
  check (
    lost_reason is null
    or lost_reason in ('preco','data','escolheram-outro','sem-resposta','outro')
  ) not valid;

create index if not exists proposals_quote_id_idx on public.proposals (quote_id);
create index if not exists proposals_created_at_idx on public.proposals (created_at desc);

-- ── Tarefas internas (back office) ──────────────────────────────
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null,
  done        boolean not null default false,
  priority    text not null default 'normal',  -- baixa | normal | alta
  due_date    date,
  quote_id    text,
  client_name text,
  assignee    text,
  area        text
);

-- If upgrading an existing database, add the new columns:
alter table public.tasks add column if not exists assignee text;
alter table public.tasks add column if not exists area text;

create index if not exists tasks_done_idx on public.tasks (done);
create index if not exists tasks_due_idx  on public.tasks (due_date);

-- ── Fornecedores / parceiros ────────────────────────────────────
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  category    text not null default 'Outro',
  email       text,
  phone       text,
  location    text,
  notes       text
);

create index if not exists suppliers_category_idx on public.suppliers (category);

-- ── Eventos de calendário (entradas próprias, não ligadas a pedidos) ──
create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  event_date  date not null,
  title       text not null,
  kind        text not null default 'evento',  -- reuniao | evento | bloqueio | nota
  event_time  text,
  note        text
);

-- ── Subscrições de notificações push (Web Push) ─────────────────
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- ── Estado operacional (marcadores pequenos, ex.: último email notificado) ──
--
-- E, DESDE ENTÃO, mais uma coisa que não é operacional nenhuma: os RASCUNHOS do
-- Estúdio de Propostas, nas chaves `proposal-draft:<pedido>` (ver
-- src/lib/proposal-drafts.ts). Uma proposta por acabar — fotos escolhidas, mood
-- boards, textos — é trabalho de horas que não existe em mais lado nenhum, e é
-- por isso que a cópia de segurança leva ESTE espaço de nomes e deixa de fora o
-- resto da tabela (ver PARTIALLY_BACKED_UP em src/app/api/backup/route.ts).
-- Quem mexer aqui tem as duas naturezas para ter em conta, não uma.
create table if not exists public.app_state (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Visão Geral: notas da equipa e meta de receita ──────────────
-- Uma linha por campo ('notas', 'meta'). Estes dois textos viviam no
-- localStorage do browser que os escrevia — invisíveis nos outros
-- dispositivos e apagados com o histórico. `revision` sobe a cada gravação
-- aceite e é o testemunho do compare-and-set: quem gravar sobre uma revisão
-- antiga é recusado (409) e vê as duas versões, em vez de apagar o texto de
-- outra pessoa sem ninguém dar por isso.
create table if not exists public.overview_settings (
  id          text primary key,          -- notas | meta
  value       text not null default '',
  revision    integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- ── A biblioteca de serviços ──
-- O mesmo serviço aparecia escrito de maneira diferente conforme o dia. Não é
-- um problema de arrumação: é o cliente a receber, na proposta, uma descrição
-- escrita à pressa quando existia uma escrita com tempo.
--
-- Os dois idiomas vivem na MESMA linha. Um serviço com o português feito e o
-- inglês por fazer é um serviço incompleto, não dois serviços — e separá-los
-- deixava-os a divergir sem nada a assinalá-lo.
create table if not exists public.service_catalog (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text not null default '',
  name_en        text not null default '',
  description_en text not null default '',
  category       text not null default 'Outros',
  -- Arquivado sai do seletor e continua nas propostas antigas, que é onde as
  -- palavras dele ainda fazem sentido.
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists service_catalog_name_idx on public.service_catalog (name);

-- ── Os números com que o estúdio faz contas ──
-- O preço do combustível, o resto do custo por quilómetro, e a margem mínima
-- abaixo da qual o estúdio avisa.
--
-- Vivem aqui e não no código pela razão que ela deu: "depende também de que
-- valor está a gasolina". O gasóleo muda todas as semanas e o código muda
-- quando alguém se lembra — um número de 2026 a calcular deslocações de 2027
-- não dá erro nenhum, dá um preço silenciosamente errado, para menos, em todas
-- as propostas.
--
-- `updated_at` é metade do ponto: é o que permite ao ecrã dizer "o preço do
-- gasóleo foi definido há quatro meses" em vez de calcular em silêncio.
create table if not exists public.proposal_settings (
  id          text primary key,          -- deslocacao | margem
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Modelos de email (transacionais, editáveis no back office) ──
create table if not exists public.email_templates (
  id          text primary key,          -- slug: proposta-enviada, sinal-recebido…
  name        text not null,
  subject     text not null,
  body        text not null,             -- HTML com {merge} fields
  updated_at  timestamptz not null default now()
);

-- ── Faturas (livro de faturação, numeração sequencial) ──────────
create table if not exists public.invoices (
  id           text primary key,
  number       text not null,            -- FT 2026/0007
  quote_id     text,
  client_name  text,
  client_email text,
  kind         text not null default 'total',  -- sinal | saldo | total
  amount       numeric not null default 0,     -- com IVA
  vat_rate     numeric not null default 0.23,
  issued_at    date,
  due_at       date,
  paid_at      date,
  status       text not null default 'emitida', -- emitida | paga | anulada
  note         text
);

create index if not exists invoices_quote_id_idx on public.invoices (quote_id);
create index if not exists invoices_status_idx   on public.invoices (status);

-- Backstop de unicidade sinal/saldo (defesa em profundidade sobre a app) ──────
-- Invariante: no máximo UMA fatura de sinal e UMA de saldo NÃO anuladas por
-- pedido. A app já verifica-e-recusa antes de inserir, mas duas emissões
-- concorrentes (dois sinal→paga em simultâneo a auto-emitir o saldo, ou o
-- operador a emitir à mão no mesmo instante) passam ambas a verificação e
-- inserem — TOCTOU. Estes índices parciais únicos fecham a janela na própria
-- base de dados: só uma linha vence, a outra apanha uma violação de unicidade
-- (23505) que a app trata como "já emitido" (ver isUniqueViolation +
-- maybeAutoIssueSaldo + rota /faturas). As faturas anuladas ficam FORA do índice
-- (status <> 'anulada'), para permitir reemitir um saldo/sinal fresco depois de
-- anular o anterior. Os quote_id nulos (faturas manuais sem pedido) não colidem.
--
-- ⚠️ OPERACIONAL: numa instalação que já acumulou sinais/saldos duplicados do
-- bug antigo, a CRIAÇÃO destes índices FALHA. É preciso reconciliar primeiro
-- (anular os duplicados, deixando um único ativo por tipo/pedido) e só depois
-- correr este ficheiro.
create unique index if not exists invoices_one_active_sinal_uk
  on public.invoices (quote_id)
  where kind = 'sinal' and status <> 'anulada';
create unique index if not exists invoices_one_active_saldo_uk
  on public.invoices (quote_id)
  where kind = 'saldo' and status <> 'anulada';

-- ── Contador atómico de numeração de faturas (por ano) ──────────
-- A numeração fiscal portuguesa tem de ser única e estritamente sequencial.
-- Fazer o incremento na aplicação (ler → +1 → gravar, com um `await` no meio)
-- é uma corrida: duas emissões em simultâneo leem o mesmo valor e ambas gravam
-- n+1, produzindo um FT duplicado/saltado. Delegamos o incremento à base de
-- dados. Uma linha por ano — o reset anual fica embutido na chave.
create table if not exists public.invoice_counters (
  year  int primary key,
  n     int not null default 0
);

-- Devolve, de forma atómica, o próximo número de sequência para o ano dado.
-- `insert … on conflict … do update … returning` é UMA só instrução: o lock de
-- linha do Postgres serializa emissões concorrentes, cada uma recebe um `n`
-- distinto e consecutivo, nunca o mesmo. A aplicação formata depois `FT AAAA/NNNN`.
-- Idempotente (create or replace) — seguro correr o ficheiro as vezes que forem.
create or replace function public.next_invoice_seq(p_year int)
returns int
language sql
as $$
  insert into public.invoice_counters (year, n)
  values (p_year, 1)
  on conflict (year) do update set n = public.invoice_counters.n + 1
  returning n;
$$;

-- ── Inventário de adereços / materiais de decoração ─────────────
create table if not exists public.inventory_items (
  id          text primary key,
  name        text not null,
  category    text not null default 'Outro',
  quantity    integer not null default 0,
  unit        text,
  condition   text not null default 'bom',   -- novo | bom | usado | danificado
  location    text,
  notes       text,
  updated_at  timestamptz not null default now()
);

create index if not exists inventory_category_idx on public.inventory_items (category);

-- ── Catálogo de material de LOGÍSTICA ───────────────────────────
-- O que faz a montagem acontecer: escadote, extensões, ferramentas, fita-cola,
-- sacos do lixo, luvas. NÃO são adereços — esses vivem em `inventory_items`,
-- acima, e são outra coisa: um berbequim e um vaso não se gerem da mesma
-- maneira, não se compram pelas mesmas razões e não interessam às mesmas
-- pessoas. As duas tabelas são deliberadamente separadas (ver MATERIAL.md §0.1).
--
-- `kind` é a coluna que decide o comportamento todo:
--   consumivel   → desconta do stock quando é usado, e dispara reposição;
--   reutilizavel → não desconta, mas TEM de voltar, e é isso que o regresso
--                  controla. Esquecer um escadote a 200 km custa horas.
create table if not exists public.material_items (
  id          text primary key,
  name        text not null,
  category    text not null default 'Ferramentas',
  kind        text not null default 'reutilizavel',
  unit        text,                              -- unidade | metro | rolo | par | caixa
  stock       numeric not null default 0,
  -- Abaixo disto entra na lista de compras. Nulo = não vigiar este item.
  min_stock   numeric,
  notes       text,
  photo_path  text,
  updated_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'material_items_kind_ck') then
    alter table public.material_items
      add constraint material_items_kind_ck check (kind in ('consumivel', 'reutilizavel'));
  end if;
end $$;

create index if not exists material_items_category_idx on public.material_items (category);
create index if not exists material_items_kind_idx     on public.material_items (kind);

-- ── Listas base de material (conjuntos reutilizáveis) ───────────
-- "Essenciais de carrinha" (`is_default`) vai SEMPRE, em todos os eventos. As
-- outras são criadas por tipo de montagem e entram por regra ou à mão.
create table if not exists public.material_lists (
  id          text primary key,
  name        text not null,
  is_default  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.material_list_items (
  id          text primary key,
  list_id     text not null references public.material_lists(id) on delete cascade,
  -- `restrict` de propósito: apagar do catálogo um item que está em listas tem
  -- de doer, senão as listas esvaziam-se sozinhas sem ninguém dar por isso.
  item_id     text not null references public.material_items(id) on delete restrict,
  qty         numeric not null default 1,
  -- Escala com o número de convidados: 0.02 (=1/50) → um saco por cada 50 pax.
  -- A conta é ceil(pax × qty_per_pax), nunca abaixo de `qty`.
  qty_per_pax numeric,
  critical    boolean not null default false,
  position    integer not null default 0
);

create index if not exists material_list_items_list_idx
  on public.material_list_items (list_id);

-- ── Regras: o que a PROPOSTA implica em material ────────────────
-- Editáveis pela equipa, de propósito. Uma condição por regra, sem E/OU:
-- condições compostas são uma linguagem de programação com outro nome, e o
-- sítio onde isto deixa de ser depurável. Duas condições fazem-se com duas
-- regras, e a checklist mostra qual delas disparou.
create table if not exists public.material_rules (
  id          text primary key,
  name        text not null,
  enabled     boolean not null default true,
  match_kind  text not null,          -- sempre | servico | texto | pax
  match_value text,
  action      text not null default 'add_list',   -- add_list | add_item
  list_id     text references public.material_lists(id) on delete cascade,
  item_id     text references public.material_items(id) on delete cascade,
  qty         numeric,
  qty_per_pax numeric,
  position    integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- ── Checklist de material POR EVENTO ────────────────────────────
-- É uma CÓPIA das listas base, não uma referência: mudar uma lista base não
-- pode mexer na checklist de um evento já preparado.
create table if not exists public.event_material (
  id           text primary key,
  quote_id     text not null references public.quotes(id) on delete cascade,
  status       text not null default 'preparada',  -- preparada|carregada|devolvida
  generated_at timestamptz not null default now(),
  vehicles     jsonb not null default '[]',
  notes        text,
  updated_at   timestamptz not null default now()
);

-- UMA checklist por evento, imposta pela base de dados e não pela boa vontade
-- de quem chama. Dois pedidos de "gerar" ao mesmo tempo — duas pessoas, ou dois
-- separadores — liam ambos "ainda não há" e criavam ambos; ficavam duas
-- checklists e as marcações dividiam-se entre elas, sem ninguém dar por isso.
create unique index if not exists event_material_quote_uidx
  on public.event_material (quote_id);

create table if not exists public.event_material_items (
  id          text primary key,
  event_id    text not null references public.event_material(id) on delete cascade,
  -- Sem chave estrangeira apertada: a checklist do dia não pode depender de o
  -- item continuar a existir no catálogo. Serve para descontar stock e para
  -- relatórios; o NOME copiado é que faz a lista sobreviver a tudo.
  item_id     text,
  name        text not null,
  category    text not null,
  unit        text,
  kind        text not null,
  qty         numeric not null,
  critical    boolean not null default false,
  -- Para o ecrã poder responder a "porque é que isto está aqui?". Sem isto,
  -- uma lista gerada por regras é uma lista que ninguém percebe e toda a gente
  -- começa a ignorar.
  origin      text not null,          -- base | regra | manual
  origin_ref  text,                   -- id da lista ou da regra
  -- O rótulo legível, copiado como o nome e pela mesma razão: a regra pode ser
  -- renomeada ou apagada, e a checklist do dia tem de continuar a explicar-se.
  origin_label text not null default '',
  vehicle_id  text,
  loaded_at   timestamptz,
  loaded_by   text,
  returned_at timestamptz,
  returned_by text,
  missing     boolean not null default false,
  used_qty    numeric,
  note        text
);

create index if not exists event_material_items_event_idx
  on public.event_material_items (event_id);

-- Quem marcou o quê e quando. Guarda TAMBÉM as marcações que perderam um
-- conflito: uma marcação que desaparece sem rasto é o que faz duas pessoas
-- discutirem sobre quem carregou o escadote.
create table if not exists public.event_material_log (
  id         text primary key,
  event_id   text not null references public.event_material(id) on delete cascade,
  item_id    text not null,
  action     text not null,          -- loaded|unloaded|returned|missing|note|used
  value      text,
  actor      text not null,
  -- Relógio de QUEM MARCOU. Pode vir do passado: o telemóvel esteve offline.
  marked_at  timestamptz not null,
  -- Relógio do servidor, quando a marcação finalmente chegou.
  synced_at  timestamptz not null default now(),
  -- A marcação chegou mas perdeu para uma mais recente. Fica registada.
  superseded boolean not null default false
);

create index if not exists event_material_log_event_idx
  on public.event_material_log (event_id);

-- ── Biblioteca de temas (fotos de inspiração reutilizáveis) ─────
-- Só os METADADOS de cada tema ("Itália", "Terracotta"). As fotos vivem no
-- bucket privado de Storage `theme-assets`, uma pasta por id de tema — a
-- pasta é a única fonte de verdade do que existe, por isso não há aqui
-- nenhuma lista de imagens que possa dessincronizar.
create table if not exists public.proposal_themes (
  id          text primary key,
  name        text not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists proposal_themes_name_idx on public.proposal_themes (name);

-- Foto ESCOLHIDA para o cartão do tema (caminho dentro do bucket,
-- `<id do tema>/<ficheiro>.jpg`). Sem ela o cartão mostra a foto mais recente,
-- que muda sozinha a cada carregamento — com milhares de fotos por tema, a
-- capa passa a ser uma decisão e não um acidente.
-- Coluna adicionada depois da tabela: `if not exists` para o ficheiro poder ser
-- colado outra vez inteiro. Enquanto não correr, a aplicação continua a
-- funcionar (a capa é a foto mais recente) e só escolher uma capa é que
-- responde 503 a pedir este passo.
alter table public.proposal_themes add column if not exists cover_path text;

-- Ordem manual das fotos de um tema: só os caminhos que a equipa ARRUMOU à
-- mão, pela ordem escolhida. A pasta do Storage continua a ser a única fonte
-- de verdade do que existe — isto é a ordem preferida de um prefixo dela, e
-- tudo o que não estiver aqui continua a vir das mais recentes para as mais
-- antigas. Sem a coluna, o tema simplesmente não tem ordem manual.
alter table public.proposal_themes add column if not exists photo_order jsonb;

-- Um tema por nome — a garantia fica na própria base de dados. As rotas
-- POST /api/temas e PATCH /api/temas/[id] já recusam um nome repetido, mas
-- entre essa leitura e a escrita cabe outra criação: só este índice impede
-- que duas fiquem lá as duas. Quem perde apanha um 23505, que as rotas
-- traduzem para o mesmo 409 de nome duplicado.
--
-- Compara lower(btrim(name)) — maiúsculas e espaços à volta não fazem um tema
-- novo. Os ACENTOS não entram aqui (precisaria da extensão `unaccent`, que
-- nem todas as instalações têm): a verificação da aplicação é mais estrita e
-- é ela que impede "Itália" ao lado de "Italia".
--
-- ATENÇÃO: numa base já em uso, este índice NÃO se aplica se já existirem
-- duplicados — a criação falha e o resto do ficheiro não corre. Encontre-os e
-- renomeie/apague primeiro:
--   select lower(btrim(name)) as nome, count(*), array_agg(id)
--     from public.proposal_themes
--    group by 1 having count(*) > 1;
create unique index if not exists proposal_themes_name_uk
  on public.proposal_themes (lower(btrim(name)));

-- ── Contratos / aceitação de Termos & Condições ─────────────────
-- Registo, por proposta, da aceitação das condições pelo cliente ao confirmar
-- a proposta no link público: quem aceitou, quando, de que IP, a versão dos
-- termos e um snapshot imutável do texto acordado (prova/auditoria).
create table if not exists public.contracts (
  id             text primary key,
  quote_id       text,
  proposal_id    text,
  client_name    text,
  client_email   text,
  terms_version  text,
  terms_snapshot text,
  status         text not null default 'pendente',  -- pendente | aceite
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  accepted_name  text,
  accepted_ip    text
);

-- O selo do documento aceite: a impressão digital do PDF que o casal viu,
-- copiada da proposta no momento do aceite. Ver a nota nas colunas homónimas
-- da tabela `proposals`.
alter table public.contracts add column if not exists proposta_pdf_sha256 text;
alter table public.contracts add column if not exists proposta_pdf_bytes integer;

create index if not exists contracts_proposal_id_idx on public.contracts (proposal_id);

-- Um contrato por proposta — garantia de unicidade na própria base de dados.
-- É o lock do aceite: dois aceites concorrentes passam ambos o
-- getContractByProposal (nenhum vê contrato ainda), mas só um vence este índice
-- no insert; o outro apanha o conflito e sai sem emitir um 2.º sinal (ver
-- createContractIfAbsent). Idempotente (IF NOT EXISTS). Os proposal_id nulos não
-- colidem entre si no Postgres, por isso um contrato sem proposta não é bloqueado.
create unique index if not exists contracts_proposal_id_uk on public.contracts (proposal_id);

-- ── Sobreposição local do Inbox (ligações CRM, etiquetas, arquivo) ──
-- Camada de anotação PRÓPRIA sobre os emails, chaveada pelo Message-ID (chave
-- durável — o uid IMAP não é estável). NÃO toca na caixa de correio: o Gmail não
-- persiste keywords personalizadas de forma fiável, e "arquivar"/"apagar" aqui
-- significam ESCONDER (preencher `archived_at`), NUNCA um expunge no IMAP.
-- A coluna `id` guarda o Message-ID (o Repository endereça as linhas por `id`).
create table if not exists public.message_links (
  id           text primary key,          -- Message-ID do email (chave durável)
  quote_id     text references public.quotes (id) on delete set null,
  proposal_id  uuid references public.proposals (id) on delete set null,
  labels       jsonb not null default '[]'::jsonb,
  pinned       boolean not null default false,
  archived_at  timestamptz,               -- arquivo = esconder; nunca um delete real
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create index if not exists message_links_quote_id_idx on public.message_links (quote_id);

-- ── Passkeys (WebAuthn) ─────────────────────────────────────────
-- Uma linha por DISPOSITIVO registado, não por pessoa: quem tem telemóvel e
-- portátil regista os dois, e perder um não fecha a porta ao outro.
--
-- `public_key` é a chave PÚBLICA — não é um segredo. A privada nunca sai do
-- aparelho (fica no Secure Enclave / TEE), e é por isso que uma cópia desta
-- tabela não deixa ninguém entrar.
--
-- `rp_id` é guardado com a credencial e verificado à entrada: uma passkey
-- registada num domínio não serve noutro, nem que a linha seja copiada.
--
-- `counter` é o contador de assinaturas do autenticador. Se um dia vier igual
-- ou menor do que o guardado, é sinal de credencial clonada (ver o store).
create table if not exists public.passkeys (
  id            text primary key,          -- credential ID em base64url
  user_name     text not null,             -- a conta a que o dispositivo pertence
  public_key    text not null,             -- COSE em base64url (não é segredo)
  counter       bigint not null default 0,
  transports    jsonb not null default '[]'::jsonb,
  rp_id         text not null,
  device_label  text not null default '',  -- nome dado por quem registou
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists passkeys_user_name_idx on public.passkeys (lower(user_name));

-- ── Restrições de integridade (CHECK) ───────────────────────────
-- Garantem, na própria base de dados, que os campos de estado/tipo só
-- aceitam os valores que a aplicação conhece e que os montantes não são
-- negativos — mesmo que algo escreva fora da app. Adicionadas de forma
-- idempotente (só se ainda não existirem) e como NOT VALID, para nunca
-- falharem numa instalação já existente com dados antigos: passam a ser
-- aplicadas a partir da próxima escrita, sem varrer as linhas atuais.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_status_chk') then
    alter table public.quotes add constraint quotes_status_chk
      check (status in ('pendente','em_revisao','cotado','aceite','rejeitado')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'proposals_status_chk') then
    alter table public.proposals add constraint proposals_status_chk
      check (status in ('rascunho','enviada','em_negociacao','aceite','rejeitada')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'proposals_amounts_chk') then
    alter table public.proposals add constraint proposals_amounts_chk
      check (vat_rate >= 0 and subtotal >= 0 and vat >= 0 and total >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_chk') then
    alter table public.tasks add constraint tasks_priority_chk
      check (priority in ('baixa','normal','alta')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'calendar_events_kind_chk') then
    alter table public.calendar_events add constraint calendar_events_kind_chk
      check (kind in ('reuniao','evento','bloqueio','nota')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_status_chk') then
    alter table public.invoices add constraint invoices_status_chk
      check (status in ('emitida','paga','anulada')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_kind_chk') then
    alter table public.invoices add constraint invoices_kind_chk
      check (kind in ('sinal','saldo','total')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_amount_chk') then
    alter table public.invoices add constraint invoices_amount_chk
      check (amount >= 0 and vat_rate >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_condition_chk') then
    alter table public.inventory_items add constraint inventory_condition_chk
      check (condition in ('novo','bom','usado','danificado')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'overview_settings_id_chk') then
    alter table public.overview_settings add constraint overview_settings_id_chk
      check (id in ('notas','meta')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'overview_settings_revision_chk') then
    alter table public.overview_settings add constraint overview_settings_revision_chk
      check (revision >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'contracts_status_chk') then
    alter table public.contracts add constraint contracts_status_chk
      check (status in ('pendente','aceite')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'passkeys_counter_chk') then
    alter table public.passkeys add constraint passkeys_counter_chk
      check (counter >= 0) not valid;
  end if;
end $$;

-- ── Biblioteca visual: etiquetas por eixo ───────────────────────
-- O que isto resolve: os temas misturavam três eixos diferentes no mesmo
-- nível — "Bouquets Branco e Amarelo" (tipo + paleta), "Itália" (estilo),
-- "Terracotta" (paleta) — numa estrutura de PASTAS, onde cada foto vive num
-- sítio só. Um seating plan em terracotta tinha de estar em dois temas ao
-- mesmo tempo, e "seating plans em terracotta" era uma pergunta que não se
-- podia fazer.
--
-- A partir daqui: a FOTO tem etiquetas em três eixos independentes, e um TEMA
-- é uma pergunta com nome (ver `filter_rule` mais abaixo). A mesma foto
-- responde a várias perguntas sem existir duas vezes.
--
-- O QUE ISTO NÃO É: uma segunda fonte de verdade sobre o que existe. A pasta
-- do bucket continua a mandar nisso (ver src/lib/theme-storage.ts). Uma linha
-- sem ficheiro é um fantasma; um ficheiro sem linha é uma foto por etiquetar,
-- e a linha nasce sozinha ao listar. Nenhum byte se move por causa disto.

-- Os valores de cada eixo. É uma TABELA e não uma lista no código porque o
-- vocabulário é da equipa: acrescentar "champanhe" à paleta não pode obrigar
-- a um deploy.
create table if not exists public.biblioteca_etiquetas (
  id          text primary key,          -- 'paleta:terracotta' — legível no SQL Editor
  eixo        text not null,             -- 'tipo' | 'paleta' | 'estilo'
  nome        text not null,             -- 'terracotta'
  ordem       int  not null default 0,   -- ordem de apresentação dentro do eixo
  created_at  timestamptz not null default now()
);

-- Um valor por eixo: "Terracotta" e "terracotta" não são duas etiquetas.
create unique index if not exists biblioteca_etiquetas_uk
  on public.biblioteca_etiquetas (eixo, lower(btrim(nome)));

create index if not exists biblioteca_etiquetas_eixo_idx
  on public.biblioteca_etiquetas (eixo, ordem);

-- Uma linha por FICHEIRO do bucket `theme-assets`. Existe para haver onde
-- pendurar etiquetas — e, de lambuja, para a contagem de cada cartão deixar de
-- custar uma ida ao Storage por tema.
create table if not exists public.biblioteca_fotos (
  path        text primary key,          -- '<pasta>/<ficheiro>.jpg' dentro do bucket
  -- A pasta de ORIGEM. Depois da migração deixa de significar "tema" e passa a
  -- ser só a primeira parte do endereço — que é o que sempre foi de facto.
  pasta       text generated always as (split_part(path, '/', 1)) stored,
  fingerprint text,                      -- resumo do original, quando o nome o traz
  -- MD5 do conteúdo, vindo do eTag que a listagem do Storage já devolve. É o
  -- que permite reconhecer a MESMA foto carregada em duas pastas e juntar as
  -- etiquetas das duas sem olhar para a imagem.
  md5         text,
  largura     int,
  altura      int,
  lqip        text,                      -- placeholder curto servido inline (nulo até existir)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists biblioteca_fotos_pasta_idx on public.biblioteca_fotos (pasta);
create index if not exists biblioteca_fotos_md5_idx
  on public.biblioteca_fotos (md5) where md5 is not null;

create table if not exists public.biblioteca_foto_etiquetas (
  path        text not null references public.biblioteca_fotos (path) on delete cascade,
  etiqueta_id text not null references public.biblioteca_etiquetas (id) on delete cascade,
  -- QUEM pôs esta etiqueta — a coluna mais importante da tabela:
  --   'migracao' — adivinhada a partir da pasta onde a foto estava
  --   'fusao'    — herdada de uma cópia byte-a-byte da mesma foto noutra pasta
  --   'upload'   — aplicada ao largar a foto num tema
  --   'manual'   — confirmada ou posta à mão
  -- É o que deixa a revisão em lote mostrar "por confirmar", e o que torna a
  -- migração reversível com um único DELETE.
  origem      text not null default 'manual',
  created_at  timestamptz not null default now(),
  -- A chave é DERIVADA das duas colunas acima, em vez de ser um par
  -- (path, etiqueta_id). Dá exactamente a mesma garantia — a mesma etiqueta
  -- não entra duas vezes na mesma foto — e dá mais uma: a linha passa a ter um
  -- `id` de texto, que é o que o Repository partilhado (src/lib/repository.ts)
  -- e a cópia de segurança precisam para saber ler, repor e apagar isto como
  -- lêem tudo o resto. Sem ele, esta tabela seria a única do sistema que a
  -- reposição não sabia tratar — e é aqui que mora o trabalho à mão de
  -- etiquetar as fotos, que é precisamente o que não se pode perder.
  id          text generated always as (path || '#' || etiqueta_id) stored,
  primary key (id)
);

create index if not exists biblioteca_foto_etiquetas_etiqueta_idx
  on public.biblioteca_foto_etiquetas (etiqueta_id);

-- ── Os temas passam a poder ser filtros ─────────────────────────
-- Colunas acrescentadas à tabela que já existe, em vez de uma tabela nova: é
-- onde já estão os 6 temas, as capas escolhidas, as ordens manuais e o índice
-- único de nome. Trocar de tabela seria mover dados reais para ganhar uma
-- palavra.
--
-- `kind` por omissão é 'pasta' — o comportamento de hoje. Correr este ficheiro
-- NÃO muda nada do que se vê; é a migração (scripts/migrar-temas.sql) que
-- converte os temas em filtros, e só quando for corrida.
alter table public.proposal_themes add column if not exists kind text not null default 'pasta';

-- A regra de um tema-filtro. Uma entrada por EIXO, e a foto tem de cumprir
-- TODAS as entradas (E entre eixos). Dentro de um eixo, `modo` decide:
--   'todas'    — a foto tem de ter todas as etiquetas listadas (o normal:
--                "Bouquets Branco e Amarelo" é branco E amarelo)
--   'qualquer' — basta uma delas
-- Um eixo ausente não restringe nada ("Terracotta" aceita qualquer tipo).
--   {"v":1,"eixos":[{"eixo":"tipo","modo":"todas","etiquetas":["tipo:bouquet"]}]}
alter table public.proposal_themes add column if not exists filter_rule jsonb;

-- Lista de caminhos escolhidos à mão, para os temas que não encaixam em
-- etiqueta nenhuma (`kind = 'manual'`).
alter table public.proposal_themes add column if not exists manual_paths jsonb;

alter table public.proposal_themes add column if not exists favorito boolean not null default false;
alter table public.proposal_themes add column if not exists arquivado boolean not null default false;
alter table public.proposal_themes add column if not exists ordem int;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'biblioteca_etiquetas_eixo_chk') then
    alter table public.biblioteca_etiquetas add constraint biblioteca_etiquetas_eixo_chk
      check (eixo in ('tipo','paleta','estilo')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'biblioteca_foto_etiquetas_origem_chk') then
    alter table public.biblioteca_foto_etiquetas add constraint biblioteca_foto_etiquetas_origem_chk
      check (origem in ('migracao','fusao','upload','manual')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'proposal_themes_kind_chk') then
    alter table public.proposal_themes add constraint proposal_themes_kind_chk
      check (kind in ('pasta','filtro','manual')) not valid;
  end if;
end $$;

-- O vocabulário inicial. `on conflict do nothing` para o ficheiro poder ser
-- colado outra vez sem desfazer o que a equipa entretanto mudou — e note-se
-- que APAGAR uma destas etiquetas na aplicação é definitivo: correr o ficheiro
-- de novo volta a criá-la.
insert into public.biblioteca_etiquetas (id, eixo, nome, ordem) values
  ('tipo:bouquet',        'tipo',   'bouquet',        10),
  ('tipo:seating-plan',   'tipo',   'seating plan',   20),
  ('tipo:centro-de-mesa', 'tipo',   'centro de mesa', 30),
  ('tipo:arco',           'tipo',   'arco',           40),
  ('tipo:cerimonia',      'tipo',   'cerimónia',      50),
  ('tipo:entrada',        'tipo',   'entrada',        60),
  ('tipo:mesa-de-doces',  'tipo',   'mesa de doces',  70),
  ('tipo:papelaria',      'tipo',   'papelaria',      80),
  ('tipo:iluminacao',     'tipo',   'iluminação',     90),
  ('tipo:espaco',         'tipo',   'espaço',        100),
  ('paleta:branco',       'paleta', 'branco',         10),
  ('paleta:amarelo',      'paleta', 'amarelo',        20),
  ('paleta:verde',        'paleta', 'verde',          30),
  ('paleta:terracotta',   'paleta', 'terracotta',     40),
  ('paleta:rosa',         'paleta', 'rosa',           50),
  ('paleta:colorido',     'paleta', 'colorido',       60),
  ('paleta:neutro',       'paleta', 'neutro',         70),
  ('estilo:minimalista',  'estilo', 'minimalista',    10),
  ('estilo:campo',        'estilo', 'campo',          20),
  ('estilo:mediterranico','estilo', 'mediterrânico',  30),
  ('estilo:classico',     'estilo', 'clássico',       40),
  ('estilo:boho',         'estilo', 'boho',           50),
  ('estilo:editorial',    'estilo', 'editorial',      60)
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════
-- ESCREVER POR CIMA DO TRABALHO DE OUTRA PESSOA
-- ════════════════════════════════════════════════════════════════
--
-- A perda que ninguém vê acontecer. Duas pessoas abrem a mesma factura: uma
-- marca-a como paga, a outra corrige a nota a partir de um ecrã que abriu dois
-- minutos antes. A segunda gravação reescreve a LINHA INTEIRA com o estado que
-- ela leu — a factura volta a "emitida", o `paid_at` fica vazio, e não há erro
-- nenhum, nem registo, nem aviso. O livro fiscal passa a dizer que não entrou
-- dinheiro que entrou.
--
-- A aplicação sabe impedir isto desde sempre (src/lib/repository.ts): a escrita
-- leva um `where updated_at = <o que foi lido>` e, se nenhuma linha for
-- afectada, alguém escreveu no meio — relê-se e volta a aplicar-se a alteração
-- por cima do que a outra pessoa gravou. Só que essa comparação precisa de uma
-- coluna onde se apoiar, e a maior parte destas tabelas não a tinha. Estas
-- colunas são essa metade.
--
-- ── AS DUAS METADES TÊM DE ANDAR JUNTAS ─────────────────────────
-- QUEM COMPARA é o `touch: true` no mapper do store; QUEM ESCREVE é esta
-- coluna. Uma sem a outra não é meia protecção:
--   · coluna sem `touch`  → a coluna fica a nulo e não protege nada;
--   · `touch` sem coluna  → TODAS as escritas da tabela falham com
--                           "column updated_at does not exist".
-- Há um teste que prende as duas (src/lib/bloqueio-optimista.test.ts): para
-- cada mapper com `touch`, procura a coluna NESTE ficheiro.
--
-- ── PORQUE É `timestamptz` NULO E NÃO `not null default now()` ──
-- Nulo é a verdade para uma linha que ainda nunca foi actualizada, e a
-- comparação sabe lidar com isso (`is null` na primeira escrita, `= <valor>`
-- daí em diante). Um `default now()` diria que todas as linhas antigas foram
-- tocadas no momento em que este ficheiro correu, o que não aconteceu. É também
-- a forma que `quotes`, `proposals` e `message_links` já usam.
--
-- IDEMPOTENTE: `add column if not exists` — este ficheiro é para ser colado
-- outra vez sempre que for preciso, e correr duas vezes não faz nada na segunda.
-- Correr isto NÃO muda nada do que se vê; só dá à comparação onde se apoiar.
--
-- `proposals` não aparece aqui: a coluna já nasce com a tabela lá em cima (e
-- estava lá desde o primeiro dia sem nunca ser escrita — a protecção montada e
-- desligada). `email_templates` e `proposal_settings` também já a têm, mas por
-- outra razão (mostrar "definido há quatro meses") e continuam sem comparação:
-- as duas escrevem a linha inteira, e nesse caso a repetição chegaria ao mesmo
-- resultado — o que falta ali é o cliente dizer sobre que versão escreveu, como
-- a Visão Geral faz. As tabelas que ficam de fora estão explicadas no mapper de
-- cada store.
alter table public.invoices             add column if not exists updated_at timestamptz;
alter table public.contracts            add column if not exists updated_at timestamptz;
alter table public.tasks                add column if not exists updated_at timestamptz;
alter table public.suppliers            add column if not exists updated_at timestamptz;
alter table public.material_list_items  add column if not exists updated_at timestamptz;
alter table public.event_material_items add column if not exists updated_at timestamptz;
alter table public.biblioteca_etiquetas add column if not exists updated_at timestamptz;

-- ── Segurança ───────────────────────────────────────────────────
-- Ativamos RLS sem políticas públicas: só o servidor (service_role key,
-- que ignora o RLS) consegue ler/escrever. Os dados ficam privados.
alter table public.quotes    enable row level security;
alter table public.proposals enable row level security;
-- Sem políticas: só a service_role lá chega, como em todas as outras.
alter table public.proposal_settings enable row level security;
alter table public.service_catalog enable row level security;
alter table public.tasks     enable row level security;
alter table public.suppliers enable row level security;
alter table public.calendar_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_state enable row level security;
alter table public.email_templates enable row level security;
alter table public.overview_settings enable row level security;
alter table public.invoices    enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.inventory_items enable row level security;
alter table public.material_items  enable row level security;
alter table public.material_lists      enable row level security;
alter table public.material_list_items enable row level security;
alter table public.material_rules        enable row level security;
alter table public.event_material        enable row level security;
alter table public.event_material_items  enable row level security;
alter table public.event_material_log    enable row level security;
alter table public.proposal_themes enable row level security;
alter table public.biblioteca_etiquetas enable row level security;
alter table public.biblioteca_fotos enable row level security;
alter table public.biblioteca_foto_etiquetas enable row level security;
alter table public.contracts enable row level security;
alter table public.message_links enable row level security;
alter table public.passkeys enable row level security;
