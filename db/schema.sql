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
  sent_at     timestamptz
);

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

-- ── Subscrições de notificações push (Web Push) ─────────────────
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- ── Segurança ───────────────────────────────────────────────────
-- Ativamos RLS sem políticas públicas: só o servidor (service_role key,
-- que ignora o RLS) consegue ler/escrever. Os dados ficam privados.
alter table public.quotes    enable row level security;
alter table public.proposals enable row level security;
alter table public.tasks     enable row level security;
alter table public.suppliers enable row level security;
alter table public.push_subscriptions enable row level security;
