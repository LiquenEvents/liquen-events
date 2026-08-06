# Bloco 6 — da proposta aceite para a operação

**Isto é um desenho, não código.** Pediste para o ver antes de estar construído,
porque toca em três módulos que já existem e cada um deles tem donos diferentes
dos seus dados. Lê e diz o que muda.

---

## O que acontece hoje quando uma proposta é aceite

O estado do pedido passa a `aceite` e mais nada acontece. A checklist de
material faz-se à mão, o plano de montagem faz-se à mão, as datas metem-se no
calendário à mão, e os pagamentos escrevem-se à mão a partir de um total que
está noutro ecrã. São quatro transcrições do mesmo negócio, cada uma com a sua
oportunidade de erro, todas feitas no dia em que há menos tempo — o dia em que
o casal disse que sim e há dez coisas para responder.

---

## A decisão de fundo: gerar UMA VEZ, e depois largar

O que se gera são **pontos de partida**, não regras vivas.

Depois de gerado, cada artefacto é dela: edita, apaga, acrescenta. O sistema
**não volta a mexer**. Se o número de convidados mudar em dezembro, a checklist
de material não se refaz sozinha — mostra-se um aviso a dizer que os dados de
origem mudaram, e ela decide se quer regenerar.

A alternativa (manter tudo sincronizado com a proposta) parece melhor e não é:
apagaria trabalho manual sem perguntar, e o trabalho manual é precisamente onde
está o conhecimento que a proposta não tem — "nesta quinta não há tomada no
jardim", "esta noiva quer as velas mais baixas".

**Uma tabela regista o que já foi gerado**, para nunca gerar duas vezes e para
poder dizer "gerado a 12 de março, a partir da proposta v3".

---

## Esquema

### 1. `event_generation` — o registo do que já foi gerado

A tabela que torna a geração idempotente e auditável.

```sql
create table if not exists public.event_generation (
  id          uuid primary key default gen_random_uuid(),
  quote_id    text not null references public.quotes (id) on delete cascade,
  -- Que artefacto: material | montagem | calendario | pagamentos
  artefacto   text not null,
  -- Quando foi gerado e a partir de quê.
  generated_at timestamptz not null default now(),
  proposal_id  uuid references public.proposals (id) on delete set null,
  -- Uma impressão digital dos dados de origem (serviços + pax + data + total).
  -- É o que permite dizer "isto foi gerado antes de mudares os convidados".
  source_hash  text not null,
  -- Quantas linhas nasceram. Só para o ecrã poder dizer "12 itens".
  linhas       integer not null default 0
);

create unique index if not exists event_generation_uidx
  on public.event_generation (quote_id, artefacto);
```

O índice único é a trava contra gerar duas vezes — o mesmo defeito que já
apanhei no módulo de logística, onde dois workers do Playwright criaram duas
checklists para o mesmo evento.

`source_hash` é o que permite o aviso *"a checklist foi gerada quando o evento
tinha 120 convidados; agora tem 140"* sem guardar uma cópia dos dados todos.

### 2. Material — **nenhuma tabela nova**

Já existe tudo:

| Tabela | O que é |
|---|---|
| `event_material` | a checklist de um evento |
| `event_material_items` | as linhas dela |
| `material_rules` | as regras que decidem o que entra |
| `material_lists` | as listas base reutilizáveis |

A geração usa o motor de regras que já está escrito (`material-rules.ts`) com
os serviços da proposta como entrada, e chama `obterOuCriarParaPedido`, que já
é idempotente.

**O que muda**: hoje a checklist gera-se a pedido, num botão. Passa a gerar-se
também quando a proposta é aceite. Zero esquema novo.

### 3. Plano de montagem — **nenhuma tabela nova**

`quotes.productionPlan` já existe (`ChecklistItem[]`) e o `ProductionPlan.tsx`
já o edita. A geração escreve lá as tarefas derivadas dos serviços.

**Uma decisão a tomar contigo**: se já houver plano escrito à mão, o que fazer?

- **A proposta**: não substituir. Acrescentar as tarefas que faltam, no fim, e
  dizer quantas foram acrescentadas. Substituir apagaria trabalho.

### 4. Datas-chave — **nenhuma tabela nova**

`calendar_events` já existe, com `kind` (`reuniao | evento | bloqueio | nota`).
As datas-chave entram como eventos normais.

As antecedências ficam nas **definições da proposta** (`proposal_settings`, a
tabela que já criei para o combustível), numa chave nova `datas-chave`:

```jsonc
{
  "reuniaoDeConfirmacao": 30,   // dias antes do evento
  "encomendaDeFlores": 14,
  "montagem": 1,
  "desmontagem": -1             // negativo = depois do evento
}
```

Configuráveis por ti, como o preço do gasóleo, e com a mesma razão: são números
que mudam com a experiência e não com o código.

**Uma decisão a tomar contigo**: se a data-chave cair num dia que já tem um
evento teu, gera-se na mesma? A proposta é **sim, e o aviso de data ocupada que
já existe encarrega-se de o dizer** — bloquear aqui esconderia o conflito em vez
de o mostrar.

### 5. Pagamentos — **nenhuma tabela nova**

`quotes.payments` já existe (`Payment[]`), com `kind: sinal | pagamento | saldo`.
A geração escreve duas linhas a partir do total e da percentagem de sinal que a
proposta já traz:

- sinal, com a data em que a proposta foi aceite;
- saldo, com a data do evento.

Ambas `paid: false`. **Nunca se marca nada como pago automaticamente** — isso é
um facto sobre dinheiro que entrou na conta, e o sistema não sabe.

---

## O que NÃO vou fazer, e porquê

**Não vou criar uma tabela "evento" separada do pedido.** É a mudança que
parece limpa no diagrama e custa uma migração de tudo o que lê `quotes`. O
pedido aceite já é o evento; o que faltava era o que se pendura nele.

**Não vou sincronizar continuamente.** Explicado acima: apagaria trabalho manual.

**Não vou gerar nada sem confirmação.** Marcar como aceite mostra um painel com
o que vai ser gerado e quantas linhas de cada; ela carrega em gerar. A
alternativa — gerar em silêncio ao mudar o estado — é como uma pessoa descobre
que o sistema lhe encheu o calendário de coisas que não pediu.

---

## Resumo do que é novo

| | |
|---|---|
| Tabelas novas | **uma** (`event_generation`) |
| Colunas novas | nenhuma |
| Chaves novas em `proposal_settings` | uma (`datas-chave`) |
| Tabelas reutilizadas | `event_material*`, `calendar_events`, e dois campos de `quotes` |

RLS activo na tabela nova, como em todas as outras: `enable row level security`
sem políticas, só a `service_role` lá chega.

---

## As três perguntas que preciso que respondas

1. **Plano de montagem já escrito à mão**: acrescentar o que falta (proposta) ou
   substituir?
2. **Data-chave em cima de um dia ocupado**: gerar na mesma e avisar (proposta),
   ou saltar?
3. **As antecedências de partida** — reunião 30 dias antes, flores 14, montagem
   na véspera, desmontagem no dia seguinte. Servem como ponto de partida?
