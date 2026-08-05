# Logística de evento — proposta de desenho

O que vai nas carrinhas, o que volta, e o que falta repor.

O desenho, **com as quatro decisões já tomadas** (resumo em §9). Onde mudei de
ideias por causa de uma resposta tua, ficou escrito o que propunha e porquê —
saber porque é que uma coisa NÃO é como parecia óbvia vale mais, seis meses
depois, do que a decisão sozinha.

---

## 0. Três coisas que encontrei antes de desenhar

Não parto do zero, e duas delas mudam o desenho.

### 0.1 Já existe um inventário — mas é de OUTRA coisa *(decidido)*

`public.inventory_items`, com o ecrã `Inventario.tsx`, guarda **adereços de
decoração**: *Vasos e Jarras, Castiçais e Velas, Têxteis, Mobiliário,
Iluminação, Estruturas e Arcos, Loiça e Copos, Sinalética*.

Cheguei a propor estendê-lo, por "decoração" aparecer na lista de oito
categorias do pedido. **Ficou decidido que não:** este módulo é do material de
trabalho — bricolage, ferramentas, consumíveis, o que faz a montagem
acontecer. Um berbequim e um vaso não se gerem da mesma maneira, não se
compram pelas mesmas razões e não interessam às mesmas pessoas.

Portanto: **tabela nova, `material_items`**, e o `inventory_items` fica
exactamente como está.

```sql
create table if not exists public.material_items (
  id          text primary key,
  name        text not null,
  category    text not null default 'Ferramentas',
  kind        text not null default 'reutilizavel',  -- consumivel|reutilizavel
  unit        text,                                   -- unidade|metro|rolo|par|caixa
  stock       numeric not null default 0,
  min_stock   numeric,
  notes       text,
  photo_path  text,
  updated_at  timestamptz not null default now()
);

alter table public.material_items
  add constraint material_kind_ck check (kind in ('consumivel','reutilizavel'));

create index if not exists material_items_category_idx on public.material_items (category);
```

Categorias: *Ferramentas, Consumíveis, Estrutura, Iluminação, Limpeza,
Segurança, Escritório*. Sete, não oito — "decoração" sai, porque é o outro
inventário.

#### E a checklist é só de logística *(decidido)*

Cheguei a desenhar a linha da checklist com uma coluna `source`, para poder
puxar adereços do outro inventário — as jarras e os suportes de vela que
apareciam no exemplo dos 120 pax. **Ficou decidido que não: só logística.**
Tirei a coluna. Uma coluna que existe "para o caso de" é uma coluna que ninguém
sabe explicar seis meses depois.

O que isto quer dizer na prática: a checklist responde a *"a carrinha leva o que
é preciso para montar?"*, não a *"leva tudo o que vai para o evento?"*. Os
adereços continuam no ecrã Inventário, onde já estão.

Se um dia quiseres os adereços na mesma lista, é **aditivo** — uma coluna e um
seletor com dois separadores, sem tocar em nada do que já lá estiver. Digo-o
para ficar registado que não é uma porta que estamos a fechar à chave.

### 0.2 Já existe um `EventChecklist` — e não é este

O evento já tem `quote.checklist` (tarefas: "confirmar catering") e
`quote.productionPlan` (fases de atelier). O código traz um aviso escrito de que
partilhar campo entre os dois **levou a perda de dados**.

Por isso a checklist de material **não entra no `quotes`**. Vai em tabelas
próprias. É o mesmo erro à espera de ser repetido.

### 0.3 O service worker exclui o back office de propósito

`public/sw.js`, comentário no topo: *"a API e toda a superfície /orcamento nunca
são tocadas, para nada dinâmico ser servido em versão velha"*.

A vista de carregamento vive em `/orcamento`. Ou seja: **o requisito de
funcionar offline colide com uma decisão de segurança já tomada.**

**Decidido:** fica offline, dentro do `/orcamento`, com uma exceção estreita a
uma rota só — os detalhes em §5.1. O resto do back office continua fora do
cache, como está hoje.

---

## 1. Catálogo de material

`material_items` (esquema em §0.1). Ecrã próprio, ao lado do Inventário de
adereços, não dentro dele.

`unit` tem valores sugeridos (`unidade`, `metro`, `rolo`, `par`, `caixa`) sem
ser fechada — inventar uma unidade nova não pode obrigar a uma migração.

**Importação CSV.** Cabeçalho `nome,categoria,unidade,tipo,stock,minimo,notas`.
Importa em pré-visualização: mostro-te o que vai entrar, o que vai ser
atualizado por nome igual, e o que não percebi, **antes** de escrever. Um
inventário carregado ao contrário custa mais a desfazer do que a fazer.

---

## 2. Listas base

```sql
create table if not exists public.material_lists (
  id          text primary key,
  name        text not null,
  is_default  boolean not null default false,   -- "vai sempre"
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.material_list_items (
  id        text primary key,
  list_id   text not null references public.material_lists(id) on delete cascade,
  item_id   text not null references public.material_items(id) on delete restrict,
  qty       numeric not null default 1,
  -- Escala com convidados: qty_per_pax = 1/50 → um saco por cada 50 pax.
  qty_per_pax numeric,
  critical  boolean not null default false,
  position  integer not null default 0
);

create index if not exists material_list_items_list_idx
  on public.material_list_items (list_id);
```

`on delete restrict` no `item_id` é deliberado: apagar do catálogo um item que
está em listas tem de doer, senão as listas esvaziam-se sozinhas sem ninguém
dar por isso. O ecrã mostra em que listas ele está, antes de recusar.

**"Essenciais de carrinha"** entra como `is_default = true` e é semeada com os
15 itens que enumeraste. Os críticos (escadote, extensões, ferramentas) já vêm
com `critical = true`.

**Quantidade que escala.** `qty_per_pax` guarda a fração; a conta é
`ceil(pax × qty_per_pax)`, com mínimo em `qty`. Sacos do lixo a `1/50` com 120
pax dão 3.

**Duplicar** copia lista e itens com ids novos.

---

## 3. Checklist do evento — o coração

### 3.1 É uma cópia, e é por isso que tem colunas a mais

```sql
create table if not exists public.event_material (
  id           text primary key,
  quote_id     text not null references public.quotes(id) on delete cascade,
  status       text not null default 'preparada',  -- preparada|carregada|devolvida
  generated_at timestamptz not null default now(),
  vehicles     jsonb not null default '[]',        -- [{id,name}]
  notes        text
);

create table if not exists public.event_material_items (
  id          text primary key,
  event_id    text not null references public.event_material(id) on delete cascade,
  item_id     text references public.material_items(id) on delete set null,
  -- O NOME É COPIADO, não lido por junção. Se o catálogo mudar amanhã, a
  -- checklist de um evento já preparado continua a dizer o que ela leu no dia.
  name        text not null,
  category    text not null,
  unit        text,
  kind        text not null,
  qty         numeric not null,
  critical    boolean not null default false,
  -- De onde veio: para se poder explicar no ecrã porque é que isto aqui está.
  origin      text not null,        -- base|regra|manual
  origin_ref  text,                 -- id da lista ou da regra
  vehicle_id  text,
  loaded_at   timestamptz,
  loaded_by   text,
  returned_at timestamptz,
  returned_by text,
  missing     boolean not null default false,
  used_qty    numeric,              -- consumíveis: o que se gastou
  note        text
);

create index if not exists event_material_items_event_idx
  on public.event_material_items (event_id);
```

`item_id` com `on delete set null` **e** nome copiado: a ligação serve para
descontar stock e para relatórios; o nome serve para a checklist sobreviver a
tudo. Se o item for apagado do catálogo, a linha da checklist não desaparece do
dia da montagem.

`origin` existe para o ecrã poder responder a "porque é que isto está aqui?".
Sem isso, uma checklist gerada por regras é uma lista que ninguém percebe e
toda a gente começa a ignorar.

### 3.2 Regras editáveis por ti

```sql
create table if not exists public.material_rules (
  id         text primary key,
  name       text not null,
  enabled    boolean not null default true,
  -- QUANDO: o que procurar na proposta.
  match_kind text not null,         -- servico|texto|template|pax|sempre
  match_value text,                 -- "arco floral", "velas", "iluminação"
  -- ENTÃO: o que acrescentar.
  action     text not null default 'add_list',  -- add_list|add_item
  list_id    text references public.material_lists(id) on delete cascade,
  item_id    text references public.material_items(id) on delete cascade,
  qty        numeric,
  qty_per_pax numeric,
  position   integer not null default 0
);
```

Editas isto num ecrã, em linguagem tua: **"Quando a proposta disser _arco
floral_ → acrescenta a lista _Estrutura e fixação_."** Sem me chamar.

`match_kind = servico` procura nos grupos de serviços da proposta; `texto`
procura no documento todo; `pax` dispara por número de convidados.

**O que deliberadamente NÃO faço, e ficou confirmado:** regras com condições
compostas (E/OU, aninhadas). Isso é uma linguagem de programação com outro
nome, e o sítio onde estas coisas passam a ser impossíveis de depurar. Duas
condições fazem-se com duas regras, e a checklist mostra qual delas disparou.

### 3.3 Notas do espaço

Não precisa de tabela nova. `quotes.location` já existe; ao gerar a checklist,
procuro eventos anteriores com o mesmo `location` e mostro as `note` que
ficaram nos itens e no `event_material.notes`. "Portão estreito, levar carrinho
de mão" aparece por ter sido escrito lá, não por alguém se ter lembrado de a
copiar.

---

## 4. Exemplo concreto — casamento de 120 pax

**Proposta:** Quinta do Freixo, 120 convidados, template Decoração.
Serviços: *arco floral na cerimónia*, *centros de mesa com velas*,
*iluminação de jardim*, *plano de mesas*.

Regras que disparam:

| regra | porque disparou | acrescenta |
|---|---|---|
| sempre | — | **Essenciais de carrinha** (15 itens) |
| `arco floral` | serviço "Arco floral cerimónia" | lista **Estrutura e fixação** |
| `velas` | serviço "Centros de mesa com velas" | isqueiros ×2, apagadores ×2 |
| `iluminação` | serviço "Iluminação de jardim" | extensões ×3, fita sinalização ×1 |
| pax | 120 | sacos do lixo ×3 *(1 por 50)* |

Checklist gerada — **33 itens**:

```
FERRAMENTAS                                    origem
  ▲ Escadote 3 degraus            1 un        essenciais
  ▲ Caixa de ferramentas          1 un        essenciais
    X-ato + lâminas               2 un        essenciais
    Tesouras                      2 un        essenciais
  ▲ Berbequim + brocas            1 un        estrutura e fixação
    Chave de fendas               1 jogo      estrutura e fixação
    Fita métrica                  1 un        estrutura e fixação
    Nível de bolha                1 un        estrutura e fixação

ELÉTRICO / ILUMINAÇÃO
  ▲ Extensão 20 m                 2 un        essenciais
  ▲ Extensão 20 m                 3 un        regra: iluminação
    Ficha tripla                  3 un        essenciais
    Carregadores                  2 un        essenciais
    Pilhas AA                     8 un        essenciais

ESTRUTURA
    Barras de suporte             4 un        estrutura e fixação
    Bases com peso                4 un        estrutura e fixação
    Abraçadeiras (saco 100)       1 saco      essenciais
    Arame floral                  2 rolo      estrutura e fixação

CONSUMÍVEIS
    Fita-cola dupla face          3 rolo      essenciais
    Fita-cola americana           2 rolo      essenciais
    Fita de sinalização           1 rolo      regra: iluminação
    Sacos do lixo 100 L           3 un        regra: 120 pax ÷ 50
    Isqueiros                     2 un        regra: velas

LIMPEZA
    Panos microfibra              6 un        essenciais
    Vassoura + pá                 1 un        essenciais
    Spray multiusos               1 un        essenciais

SEGURANÇA
  ▲ Colete refletor               2 un        essenciais
    Luvas de trabalho             2 par       essenciais
    Primeiros socorros            1 caixa     essenciais
    Água 1,5 L                    6 un        essenciais

ESCRITÓRIO
    Marcadores                    2 un        essenciais
    Etiquetas                     1 rolo      essenciais
    Plano de mesas impresso       1 un        manual (Catarina)

▲ = crítico (7 itens)
```

**Nota do espaço, de um evento anterior na Quinta do Freixo:**
> "Portão estreito — o carrinho de mão grande não passa. Levar o pequeno."

---

## 5. O dia da montagem — offline a sério

### 5.1 O problema real

O service worker atual **não toca em `/orcamento`**, de propósito (§0.3).

**Decidido:** exceção de **uma rota só**,
`/orcamento/admin/carregamento/[eventId]`. Nessa rota, e só nessa:

- o HTML é *network-first* com fallback a cache (como o site público);
- os dados vêm de **IndexedDB**, não do cache HTTP.

O resto do back office fica exatamente como está. Nada de dinâmico passa a ser
servido em versão velha fora desta rota.

### 5.2 Como as marcações sobrevivem

- **IndexedDB** guarda a checklist inteira ao abrir (é pequena: 33 linhas).
- Marcar escreve **primeiro no IndexedDB**, e só depois tenta a rede. O dedo
  nunca espera pela rede — no meio de uma quinta, esperar é perder a marcação.
- O que não chegou ao servidor fica numa **fila de saída** (outbox), reenviada
  quando `navigator.onLine` voltar e ao reabrir a página.
- **Resolução de conflito: a última marcação ganha**, por `marked_at` do
  relógio de quem marcou, e a que perde **fica registada** — não desaparece.

```sql
create table if not exists public.event_material_log (
  id         text primary key,
  event_id   text not null references public.event_material(id) on delete cascade,
  item_id    text not null,
  action     text not null,        -- loaded|unloaded|returned|missing|note|used
  value      text,
  actor      text not null,
  marked_at  timestamptz not null, -- relógio de quem marcou (pode vir do passado)
  synced_at  timestamptz not null default now()
);
```

Duas horas de rede que não existe são 40 marcações na fila. Se uma se perder,
o escadote fica para trás — por isso a fila é persistente, não memória.

### 5.3 O ecrã, desenhado para 375px e para um polegar

- Agrupado por categoria, colapsável.
- **A linha inteira é o alvo de toque**, 56px de altura (pediste 44px mínimo;
  56 é o que dá para acertar com a carrinha a abanar). A caixa é um desenho,
  não o alvo.
- Contador fixo no topo: **"27 de 33 carregados"**.
- Críticos por marcar → o botão "Carrinha carregada" **avisa antes**, a dizer
  quais: *"Faltam 2 itens críticos: Escadote, Colete refletor."* Não bloqueia —
  às vezes há razão — mas obriga a confirmar.
- Nota rápida por item, num toque longo.
- **Várias carrinhas:** cada linha pode ser atribuída a um veículo; filtro no
  topo mostra "só a Carrinha 1". Sem veículos definidos, o filtro nem aparece.

---

## 6. O regresso

- Gerada a partir dos `kind = reutilizavel` que saíram. Consumíveis não entram —
  ninguém traz sacos do lixo de volta.
- O que não voltar → `missing = true`, guardando **evento e espaço**. O ecrã de
  material em falta agrupa por espaço, e é aí que se vê o padrão ("três coisas
  perdidas na mesma quinta").
- Consumíveis: pergunta-se quanto se gastou (com o previsto pré-preenchido) e
  desconta-se do stock numa transação só.
- Abaixo do `min_stock` → entra na **lista de compras**, consolidada de todos os
  eventos, exportável.

---

## 7. Avisos

- **Painel principal:** eventos nos próximos 7 dias sem checklist preparada.
- **Conflito de material:** dois eventos com datas sobrepostas que pedem o mesmo
  item reutilizável acima do stock. A conta é por item e por janela de datas.
  Aviso, não bloqueio.
- **Compras:** tudo abaixo do mínimo, num sítio só.

---

## 8. Técnico

| requisito | como |
|---|---|
| RLS | `enable row level security` **sem políticas**, como as 15 tabelas atuais: só o `service_role` do servidor lê e escreve |
| i18n | strings novas em `pt.ts` e `en.ts` |
| PDF / impressão | reaproveita o gerador que já existe |
| Registo | `event_material_log`, com `actor` |
| Mobile-first | 375px primeiro |

---

## 9. As quatro decisões — todas tomadas

| | decisão |
|---|---|
| 1 | **Tabela nova, `material_items`.** É material de trabalho (bricolage, ferramentas, consumíveis), não adereços. O `inventory_items` fica intocado. |
| 2 | **Offline dentro do `/orcamento`**, com exceção a uma rota só no service worker. |
| 3 | **Só logística.** Nem categorias de decoração no catálogo, nem adereços na checklist. |
| 4 | **Regras de uma condição.** Sem E/OU. |

Uma consequência da 1 + 3 que vale a pena estar escrita: a checklist responde a
*"a carrinha leva o que é preciso para montar?"*, não a *"leva tudo o que vai
para o evento?"*. As jarras e os castiçais que saíram do exemplo dos 120 pax
continuam a ser geridos no ecrã Inventário. Se um dia os quiseres na mesma
lista, é aditivo.

## 10. Ordem de construção

1. **Catálogo** — tabela, ecrã, pesquisa e filtro, importação CSV com
   pré-visualização.
2. **Listas base** — "Essenciais de carrinha" semeada, duplicar, quantidades
   que escalam com os convidados.
3. **Geração da checklist** — motor de regras editável, derivação da proposta,
   itens à mão, notas do espaço.
4. **Vista de carregamento** — 375px, IndexedDB, fila de saída, críticos,
   veículos.
5. **Regresso e avisos** — em falta por espaço, desconto de consumíveis, lista
   de compras, conflito de material.

Testes Playwright em viewport móvel a acompanhar cada bloco, e o modo offline
coberto no 4. Começo pelo 1.
