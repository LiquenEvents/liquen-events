# TEMAS — Parte A: o esquema novo e o plano de migração

**Estado: aprovado.** A semântica está decidida, os seis temas estão mapeados e
o nome *Seatings Plans* é corrigido na própria migração. O que falta é ela
correr — e isso é copiar e colar um ficheiro no SQL Editor do Supabase, porque
esta máquina não tem (nem pode ter) as chaves da tua base de dados.

Ficheiros que acompanham este documento:

| Ficheiro | O que é |
| --- | --- |
| `db/schema.sql` | as tabelas novas, no ficheiro de sempre — repetível sem risco |
| `scripts/migrar-temas.sql` | **a migração**, para colar no SQL Editor |
| `scripts/migrar-temas.mjs` | a mesma coisa por terminal, para quem tiver as chaves |

---

## 1. A mudança, numa frase

Hoje uma foto **está** num tema (vive numa pasta). Depois desta mudança uma foto
**é** um conjunto de etiquetas, e um tema é uma **pergunta com nome** — uma
combinação de etiquetas guardada. A mesma foto responde a várias perguntas ao
mesmo tempo, sem existir duas vezes.

---

## 2. A semântica: **«e» quer dizer «e»**

Um tema é uma lista de exigências, e a foto tem de as cumprir **todas**.

_Bouquets Branco e Amarelo_ = `tipo: bouquet` **e** `paleta: branco` **e**
`paleta: amarelo`. É o que o nome diz, e é o que as fotos são: as margaridas da
capa são brancas **com** miolo amarelo — não é um grupo de brancas ao lado de um
grupo de amarelas.

Isto foi corrigido depois de ver os seis temas juntos, e a correcção não é
cosmética. Com a leitura anterior («branco **ou** amarelo»), as 16 fotos de
_Bouquets Branco e Verde_ — que também são bouquets brancos — passavam a
corresponder ao tema _Branco e Amarelo_, e os dois temas saltavam de 14 e 16
para 30 fotos cada. Uma migração que muda o que vês não é uma migração, é um
acidente.

**O «ou» continua disponível**, por eixo, para o dia em que quiseres um tema que
seja mesmo «branco ou verde». No formato é `"modo": "qualquer"` em vez de
`"todas"`; nenhum dos seis temas de hoje precisa dele.

**Um eixo que não apareça na regra não restringe nada.** _Terracotta_ só diz
`paleta: terracotta`: aceita seating plans, bouquets, centros de mesa — tudo o
que for terracotta. É o que já faz hoje.

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

## 4. O esquema

Três tabelas novas e seis colunas na que já existe. Tudo `if not exists`, tudo
repetível sem risco, no mesmo estilo do `db/schema.sql` que já lá está.

### 4.1 O vocabulário — `biblioteca_etiquetas`

```sql
create table if not exists public.biblioteca_etiquetas (
  id          text primary key,          -- 'paleta:terracotta' — legível no SQL Editor
  eixo        text not null check (eixo in ('tipo','paleta','estilo')),
  nome        text not null,             -- 'terracotta'
  ordem       int  not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists biblioteca_etiquetas_uk
  on public.biblioteca_etiquetas (eixo, lower(btrim(nome)));
```

É uma **tabela** e não uma lista no código porque tu geres o vocabulário:
acrescentar «champanhe» à paleta não pode obrigar a um deploy.

### 4.2 As fotos — `biblioteca_fotos`

```sql
create table if not exists public.biblioteca_fotos (
  path        text primary key,          -- '<pasta>/<ficheiro>.jpg' em theme-assets
  pasta       text generated always as (split_part(path, '/', 1)) stored,
  fingerprint text,                      -- resumo do original, quando o nome o traz
  md5         text,                      -- do eTag da listagem — é o que apanha as repetidas
  largura     int,
  altura      int,
  lqip        text,                      -- placeholder curto (Parte D); nulo por agora
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Não decide o que existe (isso é a pasta); existe para haver onde pendurar
etiquetas — e, de lambuja, para a contagem de cada cartão deixar de custar uma
ida ao Storage.

### 4.3 A ligação — `biblioteca_foto_etiquetas`

```sql
create table if not exists public.biblioteca_foto_etiquetas (
  path        text not null references public.biblioteca_fotos (path) on delete cascade,
  etiqueta_id text not null references public.biblioteca_etiquetas (id) on delete cascade,
  origem      text not null default 'manual'
              check (origem in ('migracao','fusao','upload','manual')),
  created_at  timestamptz not null default now(),
  primary key (path, etiqueta_id)
);
```

`origem` é a coluna mais importante da tabela — diz **quem** pôs a etiqueta:

- `migracao` — adivinhada a partir da pasta onde a foto estava
- `fusao` — herdada de uma cópia byte-a-byte da mesma foto noutra pasta
- `upload` — aplicada ao largar a foto num tema
- `manual` — confirmada ou posta por ti

É o que permite à revisão em lote mostrar «por confirmar», e o que torna a
migração reversível com um único `delete`.

### 4.4 Os temas — a tabela que já existe, alargada

Mantenho `proposal_themes`: é onde já estão os 6 temas, as capas escolhidas e as
ordens manuais, e onde já está o índice único de nome que impede «Itália» ao
lado de «Italia». Renomeá-la seria mover dados reais para ganhar uma palavra.

```sql
alter table public.proposal_themes add column if not exists kind text not null default 'pasta';
alter table public.proposal_themes add column if not exists filter_rule jsonb;
alter table public.proposal_themes add column if not exists manual_paths jsonb;
alter table public.proposal_themes add column if not exists favorito boolean not null default false;
alter table public.proposal_themes add column if not exists arquivado boolean not null default false;
alter table public.proposal_themes add column if not exists ordem int;
```

`kind` é `'pasta'` (como hoje), `'filtro'` (a regra manda) ou `'manual'` (uma
lista de fotos escolhidas à mão manda). O `'pasta'` por omissão é o que garante
que **correr o esquema não muda nada**: até a migração correr, cada tema
continua a ser a sua pasta e a aplicação funciona exactamente como funciona.

### 4.5 A regra de um tema, em `filter_rule`

Uma linha por eixo:

```json
{
  "v": 1,
  "eixos": [
    { "eixo": "tipo",   "modo": "todas", "etiquetas": ["tipo:bouquet"] },
    { "eixo": "paleta", "modo": "todas", "etiquetas": ["paleta:branco", "paleta:amarelo"] }
  ]
}
```

E traduz-se numa pergunta ao Postgres com um `exists` por etiqueta exigida:

```sql
select f.path
  from public.biblioteca_fotos f
 where exists (select 1 from public.biblioteca_foto_etiquetas fe
                where fe.path = f.path and fe.etiqueta_id = 'tipo:bouquet')
   and exists (select 1 from public.biblioteca_foto_etiquetas fe
                where fe.path = f.path and fe.etiqueta_id = 'paleta:branco')
   and exists (select 1 from public.biblioteca_foto_etiquetas fe
                where fe.path = f.path and fe.etiqueta_id = 'paleta:amarelo');
```

**«seating plan terracotta»** — o teste que hoje é impossível — é a mesma
consulta com `tipo:seating-plan` e `paleta:terracotta`.

### 4.6 Segurança

Como tudo o resto na base: RLS ligado, **sem políticas públicas**. Só o servidor
(chave de serviço) lê e escreve; do lado do cliente estas tabelas não existem.

---

## 5. O vocabulário inicial — as tuas 23 etiquetas

| Eixo | Valores |
| --- | --- |
| **tipo** (10) | bouquet · seating plan · centro de mesa · arco · cerimónia · entrada · mesa de doces · papelaria · iluminação · espaço |
| **paleta** (7) | branco · amarelo · verde · terracotta · rosa · colorido · neutro |
| **estilo** (6) | minimalista · campo · mediterrânico · clássico · boho · editorial |

Exactamente as que escreveste, sem acrescentos meus. Duas notas de leitura, das
quais dependem duas regras:

- **«simples» = `minimalista`** (tema _Simples mas colorido_). Se para ti é
  outra coisa, é uma palavra a mudar numa linha.
- **«Itália» = `mediterrânico`** — o estilo, não o país. O eixo estilo é o único
  onde «Itália» encaixa.

E uma que vale a pena: **cerimónia, papelaria e seating plan são as mesmas
palavras** que o casal já escolhe no formulário de pedido de orçamento (os
pontos de decoração). São vocabulários que se encontram — e é o que abre, mais
à frente, sugerir fotos para a proposta de quem pediu seating plan. Não faz
parte desta migração; faço notar porque é a razão de usar estas palavras e não
sinónimos.

---

## 6. Como fica cada um dos 6 temas

A derivação é mecânica: **toda a foto que está na pasta do tema X recebe as
etiquetas da regra do tema X.** Nada de adivinhação sobre a imagem — só sobre o
nome do tema, que és tu que escreveste.

| Tema hoje | Fotos | Regra depois | Fotos depois |
| --- | ---: | --- | ---: |
| Bouquets Branco e Amarelo | 14 | `tipo: bouquet` · `paleta: branco` · `paleta: amarelo` | **14** |
| Bouquets Branco e Verde | 16 | `tipo: bouquet` · `paleta: branco` · `paleta: verde` | **16** |
| Itália | 21 | `estilo: mediterrânico` | **21** |
| Seatings Plans → **Seating Plans** | 19 | `tipo: seating plan` | **19** |
| Simples mas colorido | 17 | `estilo: minimalista` · `paleta: colorido` | **17** |
| Terracotta | 17 | `paleta: terracotta` | **17** |
| | **104** | | **104** |

Nenhum tema ganha nem perde uma foto. É o resultado do ensaio, não uma previsão.

### O que esta conversão acerta, e o que não

**Acerta** onde o nome do tema é um tipo de peça ou uma paleta pura: _Seating
Plans_ e _Terracotta_ ficam perfeitos, porque «todas as fotos desta pasta são
seating plans» é uma afirmação verdadeira.

**Fica a meio** onde o nome só diz um eixo. Depois da migração, as 17 fotos de
_Terracotta_ têm paleta e **nenhuma tem tipo** — a pasta nunca soube dizer se
aquela foto é um bouquet ou um centro de mesa. As 21 da _Itália_ têm estilo e
mais nada. Ou seja:

> **a migração sozinha ainda não faz a pesquisa «seating plan terracotta»
> devolver resultados.**

Prefiro escrever isto do que deixar-te descobri-lo depois. O que a migração faz
é montar a estrutura e preencher metade das etiquetas de graça; a outra metade é
a **revisão em lote** (ponto 9), que é precisamente por isso que a pediste.

**A tua própria capa da Itália é o exemplo:** é um seating plan, em tons de
terracotta e laranja, dentro do tema _Itália_. A foto que tinha de estar em três
sítios ao mesmo tempo e hoje só está num. Sai da migração com
`estilo: mediterrânico`; assim que na revisão lhe deres `tipo: seating plan`,
aparece sozinha em _Seating Plans_ também — sem duplicares nada. A capa da
_Terracotta_ é o mesmo caso: é um bouquet.

### O único bónus que a máquina consegue dar sozinha: as repetidas

Se a mesma foto foi carregada em duas pastas, os dois ficheiros têm os **mesmos
bytes**, e isso vê-se sem olhar para a imagem (o `md5` que a listagem do Storage
já traz). Nesse caso as duas cópias **juntam as etiquetas das duas** — e uma foto
que esteja em _Terracotta_ e em _Seatings Plans_ fica logo com tipo **e** paleta,
sem escreveres nada. É o passo 5 da migração, marcado `origem = 'fusao'`.

Quantas são, não sei — depende de quantas duplicaste na altura. O ensaio diz o
número exacto antes de escreveres seja o que for.

---

## 7. Como se prova que não se perdeu nada

Duas verificações, dentro da própria transacção. A que decide é a primeira:

- **(A) Nada se perdeu — tem de dar 0.** Para cada tema, quantas fotos que hoje
  estão na sua pasta **deixam de** corresponder à regra nova. Diferente de zero
  = a migração está errada e não se aplica.
- **(B) Quantas fotos cada tema mostra agora.** Sem fusão, tem de dar
  exactamente **14, 16, 21, 19, 17, 17**. Com fusão pode subir nalguns — e isso
  é o objectivo, não um erro; sai listado para poderes olhar.

Mais um total independente: `select count(*) from biblioteca_fotos` tem de dar
**104**.

Por isso a migração corre em duas passagens: `--sem-fusao` primeiro (os números
têm de ser idênticos aos de hoje), e só depois a completa.

---

## 8. Como corre

Esta máquina não tem as chaves do teu Supabase, portanto o que aqui corresse
nunca chegaria à tua base de dados. O caminho que funcionou para os casamentos
de 2027 volta a ser o melhor: **copiar `scripts/migrar-temas.sql` e colar no SQL
Editor do Supabase**, onde já estás autenticada. Sem terminal, sem chaves, sem
instalar nada.

Bónus que só o SQL Editor dá: dentro do Postgres a listagem do bucket é uma
tabela (`storage.objects`). A migração inteira — ler as 104 fotos, etiquetá-las,
converter os temas e **verificar** — cabe numa transacção só, que ou faz tudo ou
não faz nada.

**A ordem:**

1. **Backup.** Duas consultas cujo resultado guardas num ficheiro (o SQL Editor
   exporta em JSON). Estão no topo do `migrar-temas.sql`.
2. **`db/schema.sql`** — cola o ficheiro inteiro, como já fazes. Só acrescenta
   tabelas; não muda nada do que vês.
3. **Ensaio.** `migrar-temas.sql` tal como está: termina em `rollback;` e
   desfaz-se sozinho. Lê as verificações.
4. **A sério.** O mesmo ficheiro com a última linha mudada para `commit;`.

**Reverter, se te arrependeres** — e isto é o que me deixa tranquilo: a migração
nunca apaga nem move nada, só acrescenta. Voltar atrás são duas linhas:

```sql
delete from public.biblioteca_foto_etiquetas where origem in ('migracao','fusao');
update public.proposal_themes set kind = 'pasta', filter_rule = null;
```

E fica tudo exactamente como estava, com as fotos onde sempre estiveram.

---

## 9. A revisão em lote — porque é obrigatória e não um extra

Depois da migração há um ecrã onde:

- filtras por **«sem tipo»**, **«sem paleta»**, **«sem estilo»** e **«por
  confirmar»** (`origem = 'migracao'`, que é como se sabe o que foi adivinhado);
- seleccionas muitas fotos de uma vez (clique, Shift, Cmd) e aplicas ou tiras
  uma etiqueta a todas;
- vês o contador a descer: **_faltam N fotos sem tipo_**.

A conta realista: as 30 fotos dos dois temas de bouquets e as 19 dos seating
plans já vêm com tipo. Faltam as **55** da _Itália_, _Terracotta_ e _Simples mas
colorido_ — umas dezenas de cliques em lote, uma vez na vida. É o que faz a
pesquisa «seating plan terracotta» passar a funcionar de verdade.

---

## 10. Decidido

1. **«e» quer dizer «e»** — dentro do eixo e entre eixos. O «ou» fica disponível
   por eixo, sem migrar nada.
2. **Os seis temas** estão mapeados no ponto 6, com as contagens reais.
3. **_Seatings Plans_ → _Seating Plans_** é feito na própria migração, antes de
   as regras se ligarem aos temas (o nome é a ligação).
4. **«simples» = minimalista** — a única leitura minha na tabela, e a única
   coisa que vale a pena reveres quando vires o resultado.

---

## 11. Duas consequências boas que caem de graça

- **Os cartões deixam de custar idas ao Storage.** Hoje desenhar a página dos
  temas custa uma listagem de pasta por tema; com as fotos numa tabela, a
  contagem é um `count` em SQL. É meio caminho andado para o que pediste na
  Parte D — e é também o que mata o botão «Atualizar» da Parte B1.
- **«Em quantas propostas o tema foi usado»** (Parte B3) passa a ter resposta:
  as fotos importadas para uma proposta guardam o caminho de origem, e o caminho
  agora tem etiquetas.
