-- ════════════════════════════════════════════════════════════════════════════
-- R3 (tudo reversível, 10/10) — a Reciclagem de 30 dias
-- ════════════════════════════════════════════════════════════════════════════
--
-- NÃO APLICADA. Aplica-se só com a aprovação dela: colar este ficheiro no SQL
-- Editor do Supabase e correr. O mesmo bloco está em db/schema.sql.
--
-- O que muda: apagar deixa de ser definitivo. Antes de apagar, o servidor
-- guarda aqui um retrato do que se apaga (e do que cai com ele, como as regras
-- de um item de material); «Repor» volta a gravar tudo com o MESMO id. Ao fim
-- de 30 dias a limpeza diária (dentro de /api/cron/backup, depois da cópia de
-- segurança) apaga de vez.
--
-- Sem esta tabela o site continua a funcionar como hoje: apagar é definitivo,
-- e o ecrã diz que a Reciclagem ainda não está ligada.
--
-- `if not exists`: pode correr-se mais do que uma vez.

begin;

create table if not exists public.reciclagem (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,            -- 'tarefa' | 'evento' | 'fornecedor' | …
  rotulo      text not null,            -- o nome que se reconhece na lista
  origem_id   text not null,            -- o id do que foi apagado
  apagado_em  timestamptz not null default now(),
  apagado_por text,
  retrato     jsonb not null,           -- o que se apagou, para repor tal e qual
  ficheiros   jsonb not null default '[]'::jsonb  -- fotografias guardadas (fase R3b)
);

create index if not exists reciclagem_apagado_em_idx on public.reciclagem (apagado_em);

-- Sem políticas: só a service_role lá chega, como em todas as outras.
alter table public.reciclagem enable row level security;
revoke all on public.reciclagem from anon, authenticated;

commit;

-- Verificação (deve devolver uma linha, com rowsecurity = true):
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename = 'reciclagem';
