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
create table if not exists public.app_state (
  key         text primary key,
  value       jsonb,
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

create index if not exists contracts_proposal_id_idx on public.contracts (proposal_id);

-- Um contrato por proposta — garantia de unicidade na própria base de dados.
-- É o lock do aceite: dois aceites concorrentes passam ambos o
-- getContractByProposal (nenhum vê contrato ainda), mas só um vence este índice
-- no insert; o outro apanha o conflito e sai sem emitir um 2.º sinal (ver
-- createContractIfAbsent). Idempotente (IF NOT EXISTS). Os proposal_id nulos não
-- colidem entre si no Postgres, por isso um contrato sem proposta não é bloqueado.
create unique index if not exists contracts_proposal_id_uk on public.contracts (proposal_id);

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
      check (status in ('rascunho','enviada','aceite','rejeitada')) not valid;
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

  if not exists (select 1 from pg_constraint where conname = 'contracts_status_chk') then
    alter table public.contracts add constraint contracts_status_chk
      check (status in ('pendente','aceite')) not valid;
  end if;
end $$;

-- ── Segurança ───────────────────────────────────────────────────
-- Ativamos RLS sem políticas públicas: só o servidor (service_role key,
-- que ignora o RLS) consegue ler/escrever. Os dados ficam privados.
alter table public.quotes    enable row level security;
alter table public.proposals enable row level security;
alter table public.tasks     enable row level security;
alter table public.suppliers enable row level security;
alter table public.calendar_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_state enable row level security;
alter table public.email_templates enable row level security;
alter table public.invoices    enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.inventory_items enable row level security;
alter table public.contracts enable row level security;
