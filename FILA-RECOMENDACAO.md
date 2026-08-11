# A fila: recomendação, para decidir antes de eu construir

Pediste para ver isto antes de eu implementar. Está aqui o que recomendo, o que
recusei, e — porque me parece a parte mais importante — **o que a medição diz
sobre o tamanho real do problema**, que muda o que vale a pena construir.

---

## Primeiro: o trabalho é muito menor do que parecia

O envio da proposta morria aos 10 segundos, e a leitura natural disso é «o
trabalho é grande demais para um pedido HTTP». Medi, e não é:

| o que | medido |
| --- | --- |
| desenhar o PDF inteiro, 17 fotografias, só CPU | **1,2 s** |
| o mesmo com 50 fotografias | **1,2 s** |
| recortar as duas capas (o pedaço mais caro) | 0,5 s dos 1,2 s |
| ir buscar 80 fotos ao armazenamento, a 150 ms cada | 6,8 s |
| o mesmo com o armazenamento a responder a 300 ms | **10,6 s** |

O que enche o tempo **não é o nosso processamento — é a espera pela rede**. E o
tecto que estava a matar tudo era o de 10 segundos, que já foi corrigido para
60.

Isto tem uma consequência directa na decisão: **uma fila não é precisa para o
trabalho caber.** Com 60 segundos, cabe com folga. O que uma fila compra é
outra coisa, e vale a pena dizê-lo pelo nome:

- o pedido responde num instante, em vez de a pessoa esperar 3 a 10 segundos a
  olhar para um botão a rodar;
- fechar o separador deixa de ser um problema;
- uma repetição retoma no passo que falta em vez de refazer tudo — e nunca
  manda o email duas vezes ao mesmo casal;
- e há um sítio onde se vê o que falhou, quando, e porquê.

São ganhos reais. Mas são de **robustez e de experiência**, não de capacidade.
Quero que decidas com isso à frente, e não a pensar que sem fila o sistema não
aguenta.

---

## O que recomendo: tabela de trabalhos no Supabase + trabalhador no Vercel Cron

**Com um empurrão imediato**, que é o detalhe que faz a diferença entre isto e
uma fila lenta.

Como funciona:

1. «Enviar» escreve uma linha numa tabela `jobs` e responde. Milissegundos.
2. Logo a seguir, e sem esperar pela resposta, a rota chama o trabalhador. O
   trabalho começa **já**, não daqui a um minuto.
3. Se esse empurrão se perder (a função morreu, a rede falhou), o cron que já
   existe passa lá de minuto a minuto e apanha o que ficou por fazer.
4. O back office pergunta pelo estado e mostra-o a evoluir.

### Porque é esta

**Não traz fornecedor novo.** Já tens Supabase e já tens três crons no Vercel a
correr todos os dias. Isto não acrescenta conta nenhuma, dashboard nenhum,
segredo nenhum, nem uma fatura nova. Para uma equipa deste tamanho, a
superfície que é preciso manter conta mais do que a elegância da ferramenta.

**A tabela dá-te os pontos 3 e 4 de borla.** Não é um efeito secundário — é o
mesmo objecto:

```sql
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,              -- 'proposta.enviar', 'aceite', 'backup'…
  chave         text not null unique,       -- IDEMPOTÊNCIA: repetir não duplica
  estado        text not null default 'pendente',
  passo         text,                       -- 'pdf' | 'email' | 'marcada'
  payload       jsonb not null,
  resultado     jsonb,                      -- o que cada passo já produziu
  tentativas    int not null default 0,
  erro_codigo   text,                       -- a taxonomia do ponto 4
  erro_detalhe  text,
  criado_em     timestamptz not null default now(),
  iniciado_em   timestamptz,
  terminado_em  timestamptz
);
create table public.job_tentativas (   -- a auditoria do ponto 3
  job_id uuid references public.jobs(id) on delete cascade,
  n int, passo text, resultado text, codigo text, ms int, em timestamptz default now()
);
```

- a **chave de idempotência** é a coluna `chave`, com um índice único: duas
  tentativas de enviar a mesma proposta são a mesma linha, e a segunda não faz
  nada;
- os **passos com estado** são `passo` + `resultado`: o PDF fica guardado no
  resultado, portanto uma repetição que já tenha o PDF salta directa para o
  email;
- a **auditoria** é a segunda tabela, uma linha por tentativa, com o passo, o
  código e o tempo;
- o **alerta** é uma consulta: um trabalho com três tentativas falhadas manda um
  aviso pelo mesmo caminho que o resumo diário já usa.

**Corre onde o código já corre.** O gerador de PDF é Node com `sharp` e
`pdf-lib`. Isso é decisivo, e elimina uma das opções sozinho (ver abaixo).

### O que custa

- a latência do plano B é de até um minuto (o cron do Vercel não desce daí) —
  mas só quando o empurrão imediato falha, que é o caso raro;
- o trabalhador continua a ter 60 segundos por invocação. Com 1,2 s de CPU
  medidos, é folga a mais; se um dia não for, o trabalho parte-se em passos e
  cada passo tem os seus 60 s;
- reclamar um trabalho sem dois trabalhadores lhe pegarem ao mesmo tempo exige
  um `update … where estado='pendente' returning *`, que o Postgres faz bem.
  É a única parte que é preciso escrever com cuidado.

---

## O que recusei, e porquê

**Supabase Edge Functions + pg_cron — não dá.** As Edge Functions são Deno. O
`sharp` é um binário nativo e o desenho do PDF é Node. O trabalhador teria de
ser na mesma uma rota no Vercel, e o Supabase ficava só a disparar — ou seja,
todo o custo de uma peça nova sem nenhuma das vantagens. Fica de fora por
incompatibilidade, não por gosto.

**Inngest — melhor ferramenta, peça a mais.** É genuinamente bom no que tu
pediste: os passos com retoma são o núcleo do produto (`step.run`), a
idempotência e as repetições vêm feitas, e há um painel para ver o que falhou.
Se a Líquen tivesse uma equipa de engenharia, era o que eu escolhia.

Não é o caso. É um fornecedor novo, com conta, faturação, segredos e um serviço
externo que tem de conseguir chegar ao vosso deployment — e mais um sítio onde
alguém tem de ir ver quando algo corre mal. Para o volume que isto tem (umas
dezenas de propostas por mês, não milhares por hora), é cara em manutenção e
não em dinheiro.

**Vercel Queues — não construo o envio em cima do que não posso verificar.**
Não confirmei que está disponível no vosso plano nem em que estado de
maturidade. Isto é o caminho por onde as propostas seguem para os casais; se
mais tarde se confirmar que está estável e incluído, a migração a partir da
tabela é pequena — o desenho fica igual, muda quem guarda a linha.

---

## Se avançares, a ordem que proponho

1. **A tabela e o trabalhador**, com um só tipo de trabalho: `proposta.enviar`.
   O botão passa a responder num instante e o ecrã mostra o estado. Nada mais
   muda.
2. **Os passos e a idempotência** nesse trabalho, com a auditoria. É aqui que
   deixa de haver hipótese de o mesmo casal receber dois emails.
3. **A taxonomia de erros** (ponto 4), que é onde a tabela começa a pagar-se: um
   `erro_codigo` por causa, a frase certa no ecrã, e o alerta quando falha.
4. **Os outros trabalhos** — aceite, cópia de segurança, reposição, importação,
   cópia de fotos — um a um, reusando tudo.
5. Só no fim, se fizer sentido, **trocar o motor** por Queues ou Inngest.

O primeiro ponto é o que muda o dia a dia. Os outros quatro são o que faz isto
não ter de ser revisitado.

---

## Uma coisa que faria antes de qualquer fila

Terminar o ponto 2. Medido: a derivada com o tamanho exacto da caixa faz o
recorte da capa passar de **250 ms a 0,1 ms**, e o mecanismo que o permite já
está feito. Falta gerar as derivadas no carregamento.

Isso não é uma alternativa à fila — é o que faz o trabalho encolher antes de se
decidir onde o pôr a correr. E é bastante menos código.
