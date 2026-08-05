-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO DOS TEMAS → ETIQUETAS POR EIXO
--
-- Onde correr: Supabase → SQL Editor (já estás autenticada; não precisas de
-- terminal, de chaves, nem de instalar nada).
--
-- Antes disto: cola o db/schema.sql inteiro, como já fazes. Ele cria as
-- tabelas novas e NÃO muda nada do que vês — os temas continuam a ser as suas
-- pastas até esta migração correr.
--
-- Como está agora, este ficheiro é um ENSAIO: termina em `rollback;` e desfaz
-- tudo sozinho. Corre, lê a tabela de verificação no fim, e só depois mudas a
-- última linha para `commit;` e corres outra vez.
--
-- O QUE ISTO NUNCA FAZ: apagar uma foto, mover um ficheiro, mexer numa capa ou
-- numa ordem manual. Só acrescenta linhas. Por isso reverter, mesmo depois do
-- commit, são duas linhas — estão no fim do ficheiro.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PASSO 0: BACKUP ────────────────────────────────────────────────────────
-- Corre estas duas ANTES de tudo e guarda o resultado (o SQL Editor exporta em
-- JSON). Não escrevem nada; é a fotografia do antes.
--
--   select json_agg(t) from public.proposal_themes t;
--
--   select json_agg(x) from (
--     select name, metadata->>'eTag' as etag, metadata->>'size' as bytes, created_at
--       from storage.objects where bucket_id = 'theme-assets') x;


begin;

-- ── OPÇÕES ─────────────────────────────────────────────────────────────────
-- `fusao`: juntar as etiquetas das fotos que estão repetidas em duas pastas
-- (mesmos bytes). Faz os números SUBIREM nalguns temas — de propósito.
--
-- Primeira passagem com `false`: os seis temas têm de dar exactamente
-- 14, 16, 21, 19, 17, 17. É a prova de que nada mudou.
-- Segunda passagem com `true`: o ganho.
create temporary table opcoes (fusao boolean) on commit drop;
insert into opcoes values (false);


-- ── O NOME ─────────────────────────────────────────────────────────────────
-- Corrigido AQUI, antes de tudo, porque é o nome que liga cada regra ao seu
-- tema. Se ficasse para depois, a regra abaixo não encontrava o tema.
update public.proposal_themes
   set name = 'Seating Plans', updated_at = now()
 where lower(btrim(name)) = 'seatings plans';


-- ── AS REGRAS ──────────────────────────────────────────────────────────────
-- Uma linha por EIXO de cada tema. É a única parte deste ficheiro que se edita.
--
-- `modo`:
--   'todas'    — a foto tem de ter TODAS as etiquetas da linha. É o normal:
--                "Bouquets Branco e Amarelo" quer dizer branco E amarelo.
--   'qualquer' — basta uma delas.
--
-- Um eixo que não apareça não restringe nada: "Terracotta" aceita bouquets,
-- seating plans, centros de mesa — tudo o que for terracotta.
create temporary table regras (tema_nome text, eixo text, modo text, etiquetas text[])
  on commit drop;

insert into regras values
  ('Bouquets Branco e Amarelo', 'tipo',   'todas', array['tipo:bouquet']),
  ('Bouquets Branco e Amarelo', 'paleta', 'todas', array['paleta:branco','paleta:amarelo']),
  ('Bouquets Branco e Verde',   'tipo',   'todas', array['tipo:bouquet']),
  ('Bouquets Branco e Verde',   'paleta', 'todas', array['paleta:branco','paleta:verde']),
  ('Itália',                    'estilo', 'todas', array['estilo:mediterranico']),
  ('Seating Plans',             'tipo',   'todas', array['tipo:seating-plan']),
  ('Simples mas colorido',      'estilo', 'todas', array['estilo:minimalista']),
  ('Simples mas colorido',      'paleta', 'todas', array['paleta:colorido']),
  ('Terracotta',                'paleta', 'todas', array['paleta:terracotta']);


-- ── PASSO 1: as fotos entram na tabela ─────────────────────────────────────
-- Lidas da própria listagem do bucket. Dentro do Postgres, `storage.objects` é
-- uma tabela a sério — é por isso que a migração inteira cabe numa transacção.
--
-- O `md5` vem do eTag que a listagem já traz: é o que permite reconhecer, sem
-- olhar para a imagem, que dois ficheiros em pastas diferentes são a mesma foto.
insert into public.biblioteca_fotos (path, md5, fingerprint, created_at)
select o.name,
       nullif(replace(o.metadata->>'eTag', '"', ''), ''),
       substring(split_part(o.name, '/', 2) from '^([0-9a-f]{32})'),
       o.created_at
  from storage.objects o
 where o.bucket_id = 'theme-assets'
   and o.name like '%/%'                             -- só ficheiros dentro de pastas
   and split_part(o.name, '/', 2) not like '.%'      -- fora os marcadores de pasta
on conflict (path) do nothing;


-- ── PASSO 2: as etiquetas derivadas da pasta ───────────────────────────────
-- Toda a foto que está na pasta do tema X recebe as etiquetas da regra de X.
-- Nada de adivinhação sobre a imagem — só sobre o nome do tema.
insert into public.biblioteca_foto_etiquetas (path, etiqueta_id, origem)
select f.path, e, 'migracao'
  from regras r
  join public.proposal_themes t on lower(btrim(t.name)) = lower(btrim(r.tema_nome))
  join public.biblioteca_fotos f on f.pasta = t.id
  cross join unnest(r.etiquetas) e
on conflict do nothing;


-- ── PASSO 3: fusão das repetidas ───────────────────────────────────────────
-- A mesma foto carregada em duas pastas junta as etiquetas das duas. É o único
-- acerto que a máquina consegue fazer sozinha, e é seguro: bytes iguais são a
-- mesma foto.
insert into public.biblioteca_foto_etiquetas (path, etiqueta_id, origem)
select b.path, fe.etiqueta_id, 'fusao'
  from public.biblioteca_fotos a
  join public.biblioteca_fotos b on b.md5 = a.md5 and b.path <> a.path
  join public.biblioteca_foto_etiquetas fe on fe.path = a.path
 where a.md5 is not null
   and (select fusao from opcoes)
on conflict do nothing;


-- ── PASSO 4: os temas passam a ser filtros ─────────────────────────────────
update public.proposal_themes t
   set kind = 'filtro',
       filter_rule = jsonb_build_object(
         'v', 1,
         'eixos', (select jsonb_agg(jsonb_build_object(
                            'eixo',      r.eixo,
                            'modo',      r.modo,
                            'etiquetas', to_jsonb(r.etiquetas))
                          order by r.eixo)
                     from regras r
                    where lower(btrim(r.tema_nome)) = lower(btrim(t.name)))),
       updated_at = now()
 where exists (select 1 from regras r where lower(btrim(r.tema_nome)) = lower(btrim(t.name)));


-- ── VERIFICAÇÃO ────────────────────────────────────────────────────────────
-- Sai tudo numa tabela só porque o SQL Editor mostra o resultado da ÚLTIMA
-- consulta — separadas, só se via a última.
--
-- COMO LER:
--   A) perdidas ......... TEM de ser 0 em todos os temas. Diferente de zero
--                         significa que uma foto que hoje está no tema deixou
--                         de lá estar: NÃO apliques, avisa-me.
--   B) fotos agora ...... sem fusão tem de dar 14, 16, 21, 19, 17, 17.
--   total de fotos ...... 104.
--   por etiquetar ....... quantas fotos ficaram sem tipo — o trabalho que
--                         sobra para a revisão em lote. É esperado.
with temas as (
  select t.id, t.name
    from public.proposal_themes t
   where exists (select 1 from regras r where lower(btrim(r.tema_nome)) = lower(btrim(t.name)))
),
correspondencia as (
  select tm.id as tema_id, tm.name as tema, f.path, f.pasta,
         not exists (
           select 1
             from regras r
            where lower(btrim(r.tema_nome)) = lower(btrim(tm.name))
              and (
                (r.modo = 'todas' and exists (
                   select 1 from unnest(r.etiquetas) e
                    where not exists (select 1 from public.biblioteca_foto_etiquetas fe
                                       where fe.path = f.path and fe.etiqueta_id = e)))
                or
                (r.modo = 'qualquer' and not exists (
                   select 1 from public.biblioteca_foto_etiquetas fe
                    where fe.path = f.path and fe.etiqueta_id = any (r.etiquetas)))
              )
         ) as corresponde
    from temas tm
   cross join public.biblioteca_fotos f
)
select 'A) perdidas (tem de ser 0)' as verificacao, tema, count(*) as valor
  from correspondencia
 where pasta = tema_id and not corresponde
 group by tema
union all
select 'B) fotos agora', tema, count(*)
  from correspondencia
 where corresponde
 group by tema
union all
select 'total de fotos (tem de ser 104)', '—', count(*) from public.biblioteca_fotos
union all
select 'por etiquetar: sem tipo', '—', count(*)
  from public.biblioteca_fotos f
 where not exists (select 1 from public.biblioteca_foto_etiquetas fe
                    where fe.path = f.path and fe.etiqueta_id like 'tipo:%')
union all
select 'repetidas encontradas (bytes iguais)', '—', count(*)
  from (select md5 from public.biblioteca_fotos
         where md5 is not null group by md5 having count(*) > 1) d
 order by 1, 2;


-- ↓↓↓ MUDA PARA `commit;` QUANDO OS NÚMEROS ESTIVEREM CERTOS ↓↓↓
rollback;


-- ═══════════════════════════════════════════════════════════════════════════
-- REVERTER (mesmo depois do commit)
--
-- A migração nunca apagou nem moveu nada, por isso voltar atrás é isto — e
-- fica tudo exactamente como estava, com as fotos onde sempre estiveram:
--
--   delete from public.biblioteca_foto_etiquetas where origem in ('migracao','fusao');
--   update public.proposal_themes set kind = 'pasta', filter_rule = null;
--
-- (O nome "Seating Plans" fica corrigido — essa é para manter.)
-- ═══════════════════════════════════════════════════════════════════════════
