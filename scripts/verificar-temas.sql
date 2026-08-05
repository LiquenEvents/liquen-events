-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAR A MIGRAÇÃO DOS TEMAS — só olha, não escreve nada.
--
-- Onde correr: Supabase → SQL Editor. Cola isto inteiro, corre, e manda-me a
-- tabela que sai.
--
-- Pode correr-se as vezes que se quiser, antes ou depois da migração: é uma
-- consulta, não uma alteração.
--
-- SE DER ERRO a dizer que uma tabela não existe: é a resposta — o db/schema.sql
-- ainda não foi corrido nesta base de dados. É o passo 2, e não há mais nada a
-- concluir daqui.
-- ═══════════════════════════════════════════════════════════════════════════

with temas as (
  select id, name, filter_rule
    from public.proposal_themes
   where kind = 'filtro' and filter_rule is not null
),
-- A regra de cada tema, desdobrada numa linha por eixo exigido.
exigencias as (
  select t.id,
         e->>'eixo' as eixo,
         coalesce(e->>'modo', 'todas') as modo,
         array(select jsonb_array_elements_text(e->'etiquetas')) as etiquetas
    from temas t,
         lateral jsonb_array_elements(t.filter_rule->'eixos') e
),
-- Para cada par (tema, foto): a foto cumpre TODAS as exigências do tema?
correspondencia as (
  select t.id as tema_id, t.name as tema, f.path, f.pasta,
         not exists (
           select 1
             from exigencias x
            where x.id = t.id
              and (
                (x.modo = 'todas' and exists (
                   select 1 from unnest(x.etiquetas) el
                    where not exists (select 1 from public.biblioteca_foto_etiquetas fe
                                       where fe.path = f.path and fe.etiqueta_id = el)))
                or
                (x.modo = 'qualquer' and not exists (
                   select 1 from public.biblioteca_foto_etiquetas fe
                    where fe.path = f.path and fe.etiqueta_id = any (x.etiquetas)))
              )
         ) as corresponde
    from temas t
   cross join public.biblioteca_fotos f
)
select '1. vocabulário (esperado 23)'          as verificacao, '—' as tema,
       (select count(*) from public.biblioteca_etiquetas)::text as valor
union all
select '2. fotos na tabela (esperado 104)', '—',
       (select count(*) from public.biblioteca_fotos)::text
union all
select '3. temas convertidos (esperado 6)', '—',
       (select count(*) from public.proposal_themes where kind = 'filtro')::text
union all
select '4. temas ainda por converter', '—',
       (select count(*) from public.proposal_themes where kind <> 'filtro')::text
union all
select '5. etiquetas postas (total)', '—',
       (select count(*) from public.biblioteca_foto_etiquetas)::text
union all
select '6. dessas, adivinhadas pela migração', '—',
       (select count(*) from public.biblioteca_foto_etiquetas where origem = 'migracao')::text
union all
select '7. dessas, herdadas de repetidas', '—',
       (select count(*) from public.biblioteca_foto_etiquetas where origem = 'fusao')::text
union all
-- O NÚMERO QUE DECIDE: uma foto que estava num tema e deixou de lá aparecer.
-- Tem de ser 0 em todos. Qualquer outra coisa é a migração a ter corrido mal.
select '8. PERDIDAS (tem de ser 0)', tema, count(*)::text
  from correspondencia where pasta = tema_id and not corresponde group by tema
union all
-- Sem fusão: 14, 16, 21, 19, 17, 17. Com fusão, alguns sobem — e isso é o
-- objectivo, não um erro.
select '9. fotos que o tema mostra', tema, count(*)::text
  from correspondencia where corresponde group by tema
union all
-- O trabalho que sobra para a revisão em lote. É esperado que não seja zero:
-- a pasta nunca soube dizer se uma foto de "Terracotta" é um bouquet ou um
-- centro de mesa.
select 'A. fotos sem TIPO (a rever)', '—', count(*)::text
  from public.biblioteca_fotos f
 where not exists (select 1 from public.biblioteca_foto_etiquetas fe
                    where fe.path = f.path and fe.etiqueta_id like 'tipo:%')
union all
select 'B. fotos sem PALETA (a rever)', '—', count(*)::text
  from public.biblioteca_fotos f
 where not exists (select 1 from public.biblioteca_foto_etiquetas fe
                    where fe.path = f.path and fe.etiqueta_id like 'paleta:%')
union all
select 'C. nome corrigido?', '—',
       (select coalesce(string_agg(name, ', '), 'nenhum tema com "seating"')
          from public.proposal_themes where name ilike '%seating%')
 order by 1, 2;
