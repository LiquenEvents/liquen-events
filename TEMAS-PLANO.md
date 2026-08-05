# TEMAS — Parte A: o esquema novo e o plano de migração

**Estado: à espera da tua aprovação.** Nada foi escrito na base de dados, nada
mudou na aplicação, nenhum ficheiro de código foi tocado. Este documento é a
proposta inteira — o SQL que aqui está é literalmente o SQL que vai correr.

---

## 1. A mudança, numa frase

Hoje uma foto **está** num tema (vive numa pasta). Depois desta mudança uma foto
**é** um conjunto de etiquetas, e um tema é uma **pergunta com nome** — uma
combinação de etiquetas guardada. A mesma foto responde a várias perguntas ao
mesmo tempo, sem existir duas vezes.

---

## 2. A decisão que decide tudo: **E entre eixos, OU dentro do eixo**

É a única regra que tens mesmo de aprovar, porque tudo o resto decorre dela.

Um tema com `tipo: bouquet` + `paleta: branco, amarelo` significa:

> tipo é bouquet **E** (paleta é branco **OU** paleta é amarelo)

E não a outra leitura possível («branco **E** amarelo»). Porquê: o teu tema
_Bouquets Branco e Amarelo_ tem lá bouquets só brancos e bouquets só amarelos.
Com a leitura «E», exigir-se-ia que cada foto tivesse as duas cores ao mesmo
tempo e o tema ficaria quase vazio — a migração «perderia» fotos que estão lá à
vista. Com a leitura «OU dentro do eixo», o tema fica exactamente igual ao que
está hoje.

Um eixo que não apareça na regra **não restringe nada**. _Terracotta_ só diz
`paleta: terracotta`; aceita seating plans, bouquets, centros de mesa — tudo o
que for terracotta. É o que já faz hoje.

O campo para a outra leitura fica reservado no formato (`"modo": "todas"`) para
o dia em que precises de «branco **e** verde na mesma foto», sem ter de migrar
nada outra vez.

---

## 3. O que **não** muda (e é de propósito)

Estas três garantias são o que torna esta migração segura de correr num sábado.

1. **Nenhum byte se move.** As 104 fotos ficam exactamente onde estão, nos
   caminhos onde estão (`<pasta>/<ficheiro>.jpg`, bucket privado
   `theme-assets`). As pastas actuais passam a ser apenas «pasta de origem» —
   deixam de significar «tema», mas continuam a ser o endereço da foto. Uma
   migração que copiasse 104 ficheiros seria uma migração com 104 maneiras de
   correr mal.
2. **A pasta continua a mandar sobre o que EXISTE.** A tabela de fotos nova não
   é uma segunda fonte de verdade: é um sítio onde pendurar etiquetas. Uma
   linha sem ficheiro é um fantasma (ignorada e limpa); um ficheiro sem linha é
   uma foto por etiquetar (a linha nasce sozinha ao listar). Esta é a
   propriedade que hoje impede a biblioteca de se desarrumar e não vou abdicar
   dela.
3. **`cover_path` e `photo_order` continuam a valer.** São caminhos, e os
   caminhos não mudam. As capas que escolheste e as fotos que arrumaste à mão
   sobrevivem sem que a migração lhes toque.

O que muda de sítio são as **fotos novas**: passam a entrar numa pasta neutra
`biblioteca/`, com as etiquetas do tema onde as largaste já aplicadas — em vez
de numa pasta que finge ser um tema.

---

## 4. O esquema proposto

Três tabelas novas e seis colunas na que já existe. Tudo `if not exists`, tudo
repetível sem risco, no mesmo estilo do `db/schema.sql` que já lá está.

### 4.1 O vocabulário — `biblioteca_etiquetas`

```sql
-- Os valores de cada eixo. É uma TABELA e não uma lista no código porque tu
-- geres o vocabulário: acrescentar "champanhe" à paleta não pode obrigar a um
-- deploy.
create table if not exists public.biblioteca_etiquetas (
  id          text primary key,          -- 'paleta:terracotta' — legível no SQL Editor
  eixo        text not null check (eixo in ('tipo','paleta','estilo')),
  nome        text not null,             -- 'terracotta'
  ordem       int  not null default 0,   -- ordem de apresentação dentro do eixo
  created_at  timestamptz not null default now()
);

-- Um valor por eixo: "Terracotta" e "terracotta" não são duas etiquetas.
create unique index if not exists biblioteca_etiquetas_uk
  on public.biblioteca_etiquetas (eixo, lower(btrim(nome)));

create index if not exists biblioteca_etiquetas_eixo_idx
  on public.biblioteca_etiquetas (eixo, ordem);
```

### 4.2 As fotos — `biblioteca_fotos`

```sql
-- Uma linha por FICHEIRO do bucket. Não decide o que existe (isso é a pasta);
-- existe para haver onde pendurar etiquetas, e para as contagens dos cartões
-- deixarem de custar uma ida ao Storage por tema.
create table if not exists public.biblioteca_fotos (
  path        text primary key,          -- '<pasta>/<ficheiro>.jpg' dentro de theme-assets
  pasta       text generated always as (split_part(path, '/', 1)) stored,
  fingerprint text,                      -- resumo do original, quando o nome o traz
  md5         text,                      -- do eTag da listagem — é o que apanha as repetidas
  largura     int,
  altura      int,
  lqip        text,                      -- placeholder curto (Parte D); nulo por agora
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists biblioteca_fotos_pasta_idx on public.biblioteca_fotos (pasta);
create index if not exists biblioteca_fotos_md5_idx
  on public.biblioteca_fotos (md5) where md5 is not null;
```

### 4.3 A ligação — `biblioteca_foto_etiquetas`

```sql
create table if not exists public.biblioteca_foto_etiquetas (
  path        text not null references public.biblioteca_fotos (path) on delete cascade,
  etiqueta_id text not null references public.biblioteca_etiquetas (id) on delete cascade,
  -- QUEM pôs esta etiqueta. É a coluna mais importante da tabela:
  --   'migracao' — adivinhada a partir da pasta onde a foto estava
  --   'fusao'    — herdada de uma cópia byte-a-byte da mesma foto noutra pasta
  --   'upload'   — aplicada ao largar a foto num tema
  --   'manual'   — confirmada ou posta por ti
  -- É o que permite à revisão em lote mostrar "por confirmar", e o que torna a
  -- migração reversível com um único DELETE.
  origem      text not null default 'manual'
              check (origem in ('migracao','fusao','upload','manual')),
  created_at  timestamptz not null default now(),
  primary key (path, etiqueta_id)
);

create index if not exists biblioteca_foto_etiquetas_etiqueta_idx
  on public.biblioteca_foto_etiquetas (etiqueta_id);
```

### 4.4 Os temas — a tabela que já existe, alargada

Mantenho `proposal_themes` em vez de criar uma tabela `temas` nova: é onde já
estão os 6 temas, as capas escolhidas e as ordens manuais, e é onde já está o
índice único de nome que impede «Itália» ao lado de «Italia». Renomeá-la seria
mover dados reais para ganhar uma palavra.

```sql
-- 'pasta'  = como está hoje (as fotos são as da pasta com o id do tema)
-- 'filtro' = tema é uma pergunta: filter_rule manda
-- 'manual' = tema é uma lista de fotos escolhidas à mão: manual_paths manda
alter table public.proposal_themes add column if not exists kind text not null default 'pasta';
alter table public.proposal_themes add column if not exists filter_rule jsonb;
alter table public.proposal_themes add column if not exists manual_paths jsonb;
alter table public.proposal_themes add column if not exists favorito boolean not null default false;
alter table public.proposal_themes add column if not exists arquivado boolean not null default false;
alter table public.proposal_themes add column if not exists ordem int;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'proposal_themes_kind_chk') then
    alter table public.proposal_themes add constraint proposal_themes_kind_chk
      check (kind in ('pasta','filtro','manual'));
  end if;
end $$;
```

O `kind = 'pasta'` por omissão é o que garante que correr o esquema **não muda
nada**: até a migração correr, cada tema continua a ser a sua pasta e a
aplicação de hoje continua a funcionar exactamente como funciona.

### 4.5 A regra de um tema, em `filter_rule`

Uma linha por eixo, e é a forma que torna a semântica do ponto 2 óbvia à
leitura:

```json
{
  "v": 1,
  "eixos": [
    { "eixo": "tipo",   "modo": "qualquer", "etiquetas": ["tipo:bouquet"] },
    { "eixo": "paleta", "modo": "qualquer", "etiquetas": ["paleta:branco", "paleta:amarelo"] }
  ]
}
```

E traduz-se numa pergunta ao Postgres com um `exists` por eixo (E entre eles) e
um `any(array)` dentro (OU dentro dele):

```sql
select f.path
  from public.biblioteca_fotos f
 where exists (select 1 from public.biblioteca_foto_etiquetas fe
                where fe.path = f.path
                  and fe.etiqueta_id = any (array['tipo:bouquet']))
   and exists (select 1 from public.biblioteca_foto_etiquetas fe
                where fe.path = f.path
                  and fe.etiqueta_id = any (array['paleta:branco','paleta:amarelo']));
```

**«seating plan terracotta»** — o teste que hoje é impossível — é exactamente
esta consulta com dois eixos diferentes:

```sql
   ... any (array['tipo:seating-plan'])  and  ... any (array['paleta:terracotta'])
```

### 4.6 Segurança

Como tudo o resto na base: RLS ligado, **sem políticas públicas**. Só o servidor
(que usa a chave de serviço) lê e escreve; do lado do cliente a tabela não
existe.

```sql
alter table public.biblioteca_etiquetas       enable row level security;
alter table public.biblioteca_fotos           enable row level security;
alter table public.biblioteca_foto_etiquetas  enable row level security;
```

---

## 5. O vocabulário inicial — as tuas 23 etiquetas

Exactamente as que escreveste, sem acrescentos meus. Podes mudar, apagar e
acrescentar na interface depois.

| Eixo | Valores |
| --- | --- |
| **tipo** (10) | bouquet · seating plan · centro de mesa · arco · cerimónia · entrada · mesa de doces · papelaria · iluminação · espaço |
| **paleta** (7) | branco · amarelo · verde · terracotta · rosa · colorido · neutro |
| **estilo** (6) | minimalista · campo · mediterrânico · clássico · boho · editorial |

Uma nota que vale a pena: **cerimónia, papelaria e seating plan são as mesmas
palavras** que o casal já escolhe no formulário de pedido de orçamento (os
pontos de decoração que acabámos de pôr lá). São vocabulários que se encontram
— e é o que abre, mais à frente, sugerir automaticamente fotos para a proposta
de quem pediu seating plan. Não faz parte desta migração; faço notar porque é a
razão de usar estas palavras e não sinónimos.

---

## 6. Como fica cada um dos 6 temas

A derivação é mecânica: **toda a foto que está na pasta do tema X recebe as
etiquetas da regra do tema X.** Nada de adivinhação sobre a imagem — só sobre o
nome do tema, que és tu que escreveste.

| Tema hoje | Regra depois | Continua a mostrar |
| --- | --- | --- |
| **Bouquets Branco e Amarelo** | `tipo: bouquet` **E** `paleta: branco OU amarelo` | as mesmas fotos |
| **Seatings Plans** → *Seating Plans* | `tipo: seating plan` | as mesmas fotos |
| **Terracotta** | `paleta: terracotta` | as mesmas fotos |
| **Itália** | `estilo: mediterrânico` | as mesmas fotos |
| *(5.º tema)* | a preencher — ver ponto 10 | |
| *(6.º tema)* | a preencher — ver ponto 10 | |

Os quatro de cima são os que tu própria nomeaste na missão; os outros dois não
os tenho aqui e não os vou inventar. O **Bloco 0** do ponto 8 imprime os seis
nomes com as contagens reais, e as duas linhas que faltam são duas linhas de
tabela — não mexem em mais nada.

### O que esta conversão acerta, e o que não

**Acerta** onde o nome do tema é um tipo de peça ou uma paleta pura:
_Seating Plans_ e _Terracotta_ ficam perfeitos, porque a afirmação «todas as
fotos desta pasta são seating plans» é verdadeira.

**Fica a meio** onde o nome só diz um eixo. Depois da migração, as 17 fotos de
_Terracotta_ têm `paleta: terracotta` e **nenhuma tem tipo** — porque a pasta
nunca soube dizer se aquela foto é um bouquet ou um centro de mesa. Ou seja:

> **a migração sozinha ainda não faz a pesquisa «seating plan terracotta»
> devolver resultados.**

Prefiro escrever isto do que deixar-te descobri-lo depois de aprovares. O que a
migração faz é montar a estrutura e preencher metade das etiquetas de graça; a
outra metade é a **revisão em lote** (ponto 9), que é precisamente por isso que
a pediste.

### A única coisa que a máquina consegue adivinhar a mais: as repetidas

Se a mesma foto foi carregada em duas pastas — um seating plan terracotta que
puseste nos dois temas — os dois ficheiros têm os **mesmos bytes**, e isso
consegue-se ver sem olhar para a imagem (o `md5` que a listagem do Storage já
traz). Nesse caso as duas cópias **juntam as etiquetas das duas**, e essa foto
fica logo com `tipo: seating plan` + `paleta: terracotta` sem tu escreveres
nada. É o passo 5 da migração, marcado com `origem = 'fusao'`.

Quantas são, não sei — depende de quantas duplicaste na altura. O ensaio
diz-te o número exacto antes de escreveres seja o que for.

---

## 7. Verificação: como se prova que não se perdeu nada

A tua condição foi «o resultado visível tem de ser idêntico ao actual» e
«verifica contagens depois: 14, 16, 21, 19, 17, 17».

Só que a fusão do ponto anterior faz, de propósito, os números **subirem** nalguns
temas — uma foto de _Terracotta_ que também seja seating plan passa a aparecer
também em _Seating Plans_. Isso é o objectivo, não um erro. Por isso a prova é
feita em duas metades, e a que decide é a primeira:

- **(A) Nada se perdeu — tem de dar 0.** Para cada tema, quantas fotos que hoje
  estão na sua pasta **deixam de** corresponder à regra nova. Se der um número
  diferente de zero, a migração está errada e não se aplica.
- **(B) O que se ganhou — informativo.** Para cada tema, quantas fotos passam a
  corresponder que hoje não estão na pasta. Sai listado foto a foto, para
  poderes olhar.

E, para poderes fazer o teste literal que pediste, há um `--sem-fusao`: salta o
passo 5 e os seis números ficam exactamente 14, 16, 21, 19, 17, 17. Recomendo
correr assim primeiro.

Total independente das duas: `select count(*) from biblioteca_fotos` tem de dar
**104**.

---

## 8. Como isto corre — e porque é SQL e não um botão

Esta máquina não tem (nem pode ter) as chaves do teu Supabase, portanto o que
aqui corresse nunca chegaria à tua base de dados. O caminho que funcionou no
mês passado para os casamentos de 2027 volta a ser o melhor: **copiar e colar
no SQL Editor do Supabase**, onde já estás autenticada. Sem terminal, sem
chaves, sem instalar nada.

Bónus que só o SQL Editor dá: dentro do Postgres, a listagem do bucket é uma
tabela (`storage.objects`). Quer dizer que a migração inteira — ler as 104
fotos, etiquetá-las, converter os temas e **verificar** — cabe numa transacção
só, que ou faz tudo ou não faz nada.

**Bloco 0 — só olhar** (não escreve nada; é o que me dá os dois nomes que faltam):

```sql
select t.name,
       count(o.name) as fotos
  from public.proposal_themes t
  left join storage.objects o
         on o.bucket_id = 'theme-assets'
        and o.name like t.id || '/%'
 group by t.name
 order by t.name;
```

**Bloco 1 — o esquema** (o ponto 4 inteiro). Idempotente, seguro de repetir,
e por si só **não muda nada** do que vês na aplicação.

**Bloco 2 — o ENSAIO.** É a migração inteira dentro de `begin; … rollback;`.
Corre tudo, imprime as verificações (A) e (B), e desfaz-se sozinha no fim. É
literalmente o mesmo texto do bloco 3, com a última palavra diferente.

**Bloco 3 — a sério.** O mesmo, a terminar em `commit;`. Só depois de leres a
saída do ensaio.

**Antes de qualquer coisa, o backup** — duas consultas cujo resultado guardas
num ficheiro (o SQL Editor exporta em JSON):

```sql
select json_agg(t) from public.proposal_themes t;
select json_agg(x) from (
  select name, metadata->>'eTag' as etag, metadata->>'size' as bytes, created_at
    from storage.objects where bucket_id = 'theme-assets') x;
```

**Reverter, se te arrependeres** — e isto é o que me deixa tranquilo: a migração
nunca apaga nem move nada, só acrescenta. Voltar atrás são duas linhas:

```sql
delete from public.biblioteca_foto_etiquetas where origem in ('migracao','fusao');
update public.proposal_themes set kind = 'pasta', filter_rule = null;
```

E fica tudo exactamente como estava, com as fotos onde sempre estiveram.

### O SQL da migração (o corpo do bloco 2/3)

```sql
begin;

-- A REGRA DE CADA TEMA, uma linha por EIXO. É a única parte que se edita.
create temporary table regras (tema_nome text, eixo text, etiquetas text[]) on commit drop;
insert into regras values
  ('Bouquets Branco e Amarelo', 'tipo',   array['tipo:bouquet']),
  ('Bouquets Branco e Amarelo', 'paleta', array['paleta:branco','paleta:amarelo']),
  ('Seatings Plans',            'tipo',   array['tipo:seating-plan']),
  ('Terracotta',                'paleta', array['paleta:terracotta']),
  ('Itália',                    'estilo', array['estilo:mediterranico']);
  -- + as duas linhas dos temas 5 e 6, depois do Bloco 0

-- 1) As 104 fotos entram na tabela, com o md5 que a listagem já traz.
insert into public.biblioteca_fotos (path, md5, fingerprint, created_at)
select o.name,
       nullif(replace(o.metadata->>'eTag', '"', ''), ''),
       substring(split_part(o.name, '/', 2) from '^([0-9a-f]{32})'),
       o.created_at
  from storage.objects o
 where o.bucket_id = 'theme-assets'
   and o.name like '%/%'
   and split_part(o.name, '/', 2) not like '.%'
on conflict (path) do nothing;

-- 2) As etiquetas derivadas da pasta onde a foto está hoje.
insert into public.biblioteca_foto_etiquetas (path, etiqueta_id, origem)
select f.path, e, 'migracao'
  from regras r
  join public.proposal_themes t on lower(btrim(t.name)) = lower(btrim(r.tema_nome))
  join public.biblioteca_fotos f on f.pasta = t.id
  cross join unnest(r.etiquetas) e
on conflict do nothing;

-- 3) FUSÃO: fotos com os mesmos bytes noutra pasta juntam as etiquetas.
--    (salta este bloco para o teste "números exactamente iguais aos de hoje")
insert into public.biblioteca_foto_etiquetas (path, etiqueta_id, origem)
select b.path, fe.etiqueta_id, 'fusao'
  from public.biblioteca_fotos a
  join public.biblioteca_fotos b on b.md5 = a.md5 and b.path <> a.path
  join public.biblioteca_foto_etiquetas fe on fe.path = a.path
 where a.md5 is not null
on conflict do nothing;

-- 4) Os temas passam a ser filtros, com a regra montada a partir da tabela acima.
update public.proposal_themes t
   set kind = 'filtro',
       filter_rule = jsonb_build_object(
         'v', 1,
         'eixos', (select jsonb_agg(jsonb_build_object(
                            'eixo', r.eixo, 'modo', 'qualquer',
                            'etiquetas', to_jsonb(r.etiquetas)))
                     from regras r
                    where lower(btrim(r.tema_nome)) = lower(btrim(t.name))))
 where exists (select 1 from regras r where lower(btrim(r.tema_nome)) = lower(btrim(t.name)));

-- ── VERIFICAÇÃO (A): tem de vir VAZIA ou toda a zeros ────────────────────
select t.name, count(*) as perdidas
  from public.proposal_themes t
  join public.biblioteca_fotos f on f.pasta = t.id
 where exists (
         select 1 from regras r
          where lower(btrim(r.tema_nome)) = lower(btrim(t.name))
            and not exists (select 1 from public.biblioteca_foto_etiquetas fe
                             where fe.path = f.path and fe.etiqueta_id = any (r.etiquetas)))
 group by t.name;

-- ── VERIFICAÇÃO (B): quantas fotos cada tema mostra agora ────────────────
select t.name, count(*) as fotos_agora
  from public.proposal_themes t
  join public.biblioteca_fotos f on true
 where exists (select 1 from regras r where lower(btrim(r.tema_nome)) = lower(btrim(t.name)))
   and not exists (
         select 1 from regras r
          where lower(btrim(r.tema_nome)) = lower(btrim(t.name))
            and not exists (select 1 from public.biblioteca_foto_etiquetas fe
                             where fe.path = f.path and fe.etiqueta_id = any (r.etiquetas)))
 group by t.name
 order by t.name;

select count(*) as fotos_no_total from public.biblioteca_fotos;  -- tem de dar 104

rollback;   -- ← no bloco 3 isto passa a  commit;
```

Vai também um `scripts/migrar-temas.mjs` com as mesmas três fases
(`--ensaio` por omissão, `--aplicar`, `--sem-fusao`) para quem tiver as chaves e
preferir o terminal — mas o caminho recomendado é o de cima.

---

## 9. A revisão em lote — porque é obrigatória e não um extra

Depois da migração há um ecrã onde:

- filtras por **«sem tipo»**, **«sem paleta»**, **«sem estilo»** e **«por
  confirmar»** (`origem = 'migracao'`, que é como se sabe o que foi adivinhado);
- seleccionas muitas fotos de uma vez (clique, Shift, Cmd) e aplicas ou tiras
  uma etiqueta a todas;
- vês o contador a descer: **_faltam N fotos sem tipo_**.

A conta realista: as fotos de _Seating Plans_ e _Bouquets_ já vêm com tipo; as
de _Terracotta_ e _Itália_ (34 fotos, se forem os temas de 17) precisam que lhes
digas o tipo. Umas dezenas de cliques em lote, uma vez na vida — e é o que faz
a pesquisa «seating plan terracotta» passar a funcionar de verdade.

---

## 10. O que preciso de ti para avançar

1. **A semântica do ponto 2** — «E entre eixos, OU dentro do eixo». É a única
   decisão irreversível-ish aqui.
2. **A saída do Bloco 0** (a consulta de olhar, do ponto 8) — dá-me os seis
   nomes com as contagens reais, e com isso escrevo as duas linhas de regra que
   faltam. Se preferires, diz-me só os dois nomes que faltam e eu proponho a
   regra.
3. **Se queres que _Seatings Plans_ passe a _Seating Plans_ já na migração**
   (é um `update` ao nome, e o nome é o que liga a regra ao tema — mais limpo
   fazer no mesmo momento do que depois).

Depois disso avanço para as Partes B, C, D e E sem voltar a perguntar, como
combinámos.

---

## 11. Duas consequências boas que caem de graça

- **Os cartões deixam de custar idas ao Storage.** Hoje desenhar a página dos
  temas custa uma listagem de pasta por tema; com as fotos numa tabela, a
  contagem de cada tema é um `count` em SQL. É meio caminho andado para o que
  pediste na Parte D.
- **«Em quantas propostas o tema foi usado»** (Parte B3) passa a ter resposta:
  as fotos importadas para uma proposta guardam o caminho de origem, e o caminho
  agora tem etiquetas.
