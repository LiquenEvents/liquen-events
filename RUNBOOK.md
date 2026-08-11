# Manual de emergência

O que fazer quando alguma coisa corre mal. Escrito para ser lido com pressa,
por isso cada secção começa pelo que se faz e só depois explica porquê.

Tudo o que está aqui foi verificado contra o código. Onde depende de uma
definição na Vercel ou no Supabase, está dito por extenso — não presumas que
está ligado só porque aparece aqui.

---

## 1. O site está em baixo

**Primeiro: confirma que é o site e não a tua ligação.**

```
https://liquen-events.com/api/health
```

Responde sempre, mesmo com a base de dados em baixo — é essa a intenção. Olha
para o campo `database`:

| Valor | Quer dizer |
|---|---|
| `ok` | O Supabase respondeu. O problema é outro. |
| `down` | O Supabase não respondeu em 4 segundos. Vai à secção 2. |
| `fallback` | Não há Supabase configurado. Em produção isto é um alarme: as variáveis de ambiente desapareceram. |

Se a página nem chega a responder, o problema é do alojamento. Vai a
vercel.com → o projecto → **Deployments**, e vê se o último deploy falhou.

**Para voltar atrás:** na Vercel, abre o último deploy que estava bom, e usa
**⋯ → Promote to Production**. Isso repõe o código anterior em segundos, sem
tocar na base de dados. É a acção mais segura que existe aqui, e não precisa
de programador nenhum.

> Voltar atrás no código **não** desfaz alterações aos dados. Se o problema for
> dados errados, é a secção 3 que interessa, não esta.

---

## 2. A base de dados não responde

Vai a supabase.com → o projecto → e vê se está pausado. Projectos sem uso podem
ser suspensos, e a retoma é um botão.

Enquanto o Supabase estiver em baixo, o site público **continua a funcionar** —
as páginas, as fotografias e a galeria não dependem dele. O que pára é o back
office e a entrada de pedidos de orçamento novos.

---

## 3. Perdi dados / alguém apagou o que não devia

**Não faças nada com pressa.** A reposição escreve por cima de facturas com
numeração fiscal e de contratos aceites por clientes. Ler esta secção inteira
custa dois minutos e é sempre menos do que uma reposição errada.

### 3.1 Antes de tudo — guarda o estado actual

Back office → **Descarregar cópia de segurança**. Guarda o ficheiro com a data
no nome. Mesmo estando "estragado", é o único registo do que lá está agora.

### 3.2 Repor

Back office → **Repor cópia de segurança** → escolhe o ficheiro.

O primeiro passo é sempre um **ENSAIO**: mostra o plano — quantos registos por
conjunto, quantos são substituídos, quantos são criados, e **quantos
desaparecem** — sem escrever nada. Lê a coluna dos que desaparecem. É a que
diz o que vais perder.

Só depois de leres o plano é que escreves a frase de confirmação. O sistema
recusa-se a repor se:

- não conseguir ler o estado actual de algum conjunto;
- a cópia do estado actual sair incompleta;
- o ficheiro não for o mesmo que foi pré-visualizado;
- faltar uma coluna que a cópia traz (nesse caso salta esse conjunto **sem lhe
  tocar**, em vez de o apagar).

O contador de numeração de facturas **só sobe, nunca desce** — repor uma cópia
antiga não reemite números já usados.

> **Nunca fizeste isto?** Então não é hoje, com dados a sério, que se aprende.
> A secção 9 é o ensaio: o mesmo percurso contra uma base de dados de treino,
> onde enganar-se não custa nada.

### 3.3 O que a reposição NÃO recupera

- **As fotografias.** Vivem nos buckets do Supabase Storage e não vão na cópia.
- **Marcadores de funcionamento** (até que email a caixa de entrada já avisou,
  os fechos já enviados à Meta). É de propósito: repô-los faria o robô voltar a
  avisar de emails já avisados. Refazem-se sozinhos.
- Os **rascunhos de propostas por enviar** já VÃO na cópia e voltam com ela —
  estiveram muito tempo de fora, e foi por aí que se perdeu uma proposta
  inteira. Voltam sem as fotos (ver o primeiro ponto): os mood boards apontam
  para imagens que têm de existir no bucket.
- Não é atómica entre tabelas: se falhar a meio, alguns conjuntos ficam
  repostos e outros não. O ecrã diz quais.

### 3.4 Se o ficheiro for grande demais

O alojamento recusa corpos acima de ~4,5 MB. A cópia vai comprimida (medido:
6,24 MB → 0,35 MB), o que afasta o problema uma década. Se ainda assim
aparecer um erro de tamanho, a reposição tem de ser feita a partir do servidor
ou do `psql` — não é coisa para fazer sozinha.

---

## 4. Acho que alguém entrou na minha conta

**Faz isto por esta ordem.**

1. **Expulsa toda a gente, imediatamente.** Na Vercel → **Settings → Environment
   Variables** → altera `SESSION_VERSION` para qualquer valor novo (a data serve:
   `2026-07-31b`). Guarda e volta a fazer deploy.

   Isso invalida **todas** as sessões abertas de uma vez, em todos os
   dispositivos, sem trocar a `SESSION_SECRET`. Vais ter de entrar de novo — é
   suposto.

2. **Muda a palavra-passe** (`ADMIN_PASSWORD_HASH`).

3. **Se o segundo factor puder ter sido comprometido**, gera um `ADMIN_TOTP_SECRET`
   novo e volta a emparelhar a aplicação do telemóvel.

4. Vê os registos de entrada na Vercel → **Logs**, à procura de `admin login ok`
   com endereços que não reconheças.

A sessão dura 30 dias e o cookie tem o prefixo `__Host-` em produção, o que
impede que um subdomínio ou uma ligação sem HTTPS o consiga escrever.

---

## 5. Estou a receber muitos pedidos estranhos / o site está lento

Os formulários públicos têm tecto por endereço, e o login tem **dois** tectos:
8 por minuto por endereço, e 20 por hora por conta (este é o mesmo para o mundo
inteiro, portanto rodar endereços não compra tentativas).

Se quiseres que os tectos valham entre instâncias e não apenas dentro de cada
uma, define `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. Sem elas o
limitador funciona na mesma, mas cada instância conta por si.

Se o Redis falhar, o limitador **deixa passar** em vez de bloquear. É
deliberado: uma cache em baixo nunca pode deitar abaixo os formulários do site.

---

## 6. Ninguém me avisa quando algo corre mal

O código para avisar **já está escrito**. Só faltam variáveis de ambiente:

| Variável | O que liga |
|---|---|
| `SENTRY_DSN` | Todos os erros vão para o Sentry, agrupados e com histórico. É onde se definem as regras de alerta. |
| `ERROR_WEBHOOK_URL` | Cada erro é enviado em tempo real para um endereço à escolha — um canal de Slack, por exemplo. |
| `CRON_SECRET` | Sem ela, **as tarefas agendadas param em silêncio** em produção. |

**Limite honesto, e é importante:** nada disto deteta o site em baixo por
inteiro. Se o servidor não corre, também não corre o código que avisaria. Para
saber que o site caiu às 3 da manhã é preciso alguém **de fora** a bater à
porta: os alertas da própria Vercel, ou um serviço de vigia gratuito a chamar
`/api/health` de cinco em cinco minutos e a enviar email quando não responde.
Isso configura-se na Vercel e no serviço, não neste repositório.

---

## 7. Uma tarefa agendada deixou de correr

As tarefas estão em `vercel.json`:

| Rota | Quando | O que faz |
|---|---|---|
| `/api/cron/backup` | 04:00 diário | Envia a cópia de segurança por email (dados + a lista das fotografias) |
| `/api/cron/reminders` | 07:00 diário | Resumo diário e lembretes |
| `/api/cron/inbox-check` | 08:00 diário | Lê as respostas dos clientes na caixa de correio |

Se pararem, o suspeito nº 1 é o `CRON_SECRET` em falta: as rotas fecham-se em
produção e param **sem dar erro nenhum**.

Para testar à mão, com sessão de administrador aberta, basta abrir a rota no
browser.

> **Como é que se dá por isso?** Da cópia de segurança já se dá: cada envio bem
> sucedido deixa um carimbo, e passados três dias sem nenhum o back office
> escreve, no topo, há quanto tempo é que não chega uma cópia e qual é a
> variável a confirmar. Descarregar uma cópia à mão também carimba, portanto o
> aviso não persegue quem já fez o que ele pede.
>
> As outras duas continuam sem sinal nenhum: se o resumo diário deixar de
> chegar, a falta do email é o único sintoma.

> **Uma vez por dia é pouco, e é uma limitação do plano, não uma escolha.** O
> plano Hobby da Vercel só permite tarefas diárias — tentar de 15 em 15 minutos
> faz o deploy ser RECUSADO, com esta mensagem:
>
> > *Hobby accounts are limited to daily cron jobs.*
>
> Na prática: **a resposta de um cliente pode esperar até 24 horas** para ser
> lida automaticamente. Enquanto isso não mudar, vale a pena olhar para a caixa
> de correio à mão. Passar a Pro permite de 15 em 15 minutos — é uma linha no
> `vercel.json` (e apagar o teste que guarda o limite diário, que diz onde).

---

## 8. Depois de qualquer incidente

- Descarrega uma cópia de segurança nova.
- Confirma que o CI está verde no ramo publicado.
- Se o incidente tiver sido causado por algo que os testes não apanharam,
  escreve o teste antes de fechar o assunto. É a regra que este projecto tem
  seguido e é a razão de a mesma coisa não acontecer duas vezes.

---

## 9. Ensaio de reposição (contra uma base de dados de treino)

**Isto não se corre contra nada de verdade.** A reposição escreve por cima de
facturas com numeração fiscal e de contratos aceites por clientes — o ensaio
existe precisamente para que a primeira vez que alguém faz isto não seja no dia
mau, com pressa e com os dados a sério à frente.

O caminho da aplicação tem teste automático de ida e volta, e esse teste já
apanhou um defeito real (o `created_at` não era escrito, o que re-datava todas
as propostas numa reposição). O que nunca foi feito foi o ensaio COMPLETO, de
ponta a ponta, com uma pessoa a carregar nos botões. É o que está aqui.

Demora cerca de uma hora. Vale a pena repeti-lo uma vez por ano e sempre que o
formato do ficheiro mudar (`schemaVersion` no topo da cópia).

### 9.0 O que é preciso ter à mão

| O quê | Onde se arranja |
|---|---|
| Um projecto Supabase **novo e vazio** (o de treino) | supabase.com → New project. O plano gratuito chega. |
| Uma cópia de segurança recente | O `.json.gz` que chega por email às 04:00, ou Back office → Descarregar cópia |
| A aplicação a correr contra o projecto de treino | `.env.local` com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **do treino** |

> **A regra que não se quebra:** antes de começar, abre o `.env.local` e
> confirma com os olhos que o `SUPABASE_URL` é o do projecto de TREINO. Todo o
> resto deste ensaio é seguro; enganar-se aqui não é. Se o URL for o de
> produção, pára — não há passo seguinte que corrija isso.

### 9.1 Preparar a base de treino

1. No projecto de treino, abre **SQL Editor** e cola o `db/schema.sql` inteiro.
   Corre. É idempotente e não apaga nada.
2. **Verificar:** em **Table Editor** aparecem as tabelas (`quotes`,
   `proposals`, `invoices`, `invoice_counters`, `contracts`, `app_state`…), todas
   vazias.
3. Arranca a aplicação (`npm run dev`) com o `.env.local` do treino e entra no
   back office.
4. **Verificar:** o back office abre vazio — zero pedidos, zero facturas — e
   **não** aparece o aviso vermelho de armazenamento no topo. Se aparecer, lê o
   que ele diz e resolve isso primeiro: é a mesma frase que apareceria em
   produção, e este ensaio também serve para a ver funcionar.

### 9.2 Pôr alguma coisa lá dentro (para haver o que perder)

Isto é o que torna o ensaio honesto: a reposição tem de ser vista a APAGAR
coisas, não só a criar.

1. Cria **um pedido** pelo formulário público do site (`/orcamento`).
2. Cria **uma tarefa** e **um fornecedor** no back office.
3. Emite **uma factura** de total (valor pequeno, cliente inventado).
4. **Verificar:** anota o número que saiu — deve ser `FT <ano>/0001`. Anota-o
   num papel; vai ser preciso no passo 9.5.

### 9.3 O ensaio propriamente dito — o passo que não escreve nada

1. Back office → **Repor cópia de segurança** → escolhe o ficheiro `.json.gz`
   (ou `.json`) da cópia de produção.
2. **Verificar, no plano que aparece, e sem carregar em mais nada:**

   | Coluna | O que tem de acontecer |
   |---|---|
   | **Entram** | Números grandes — são os dados de produção que a base de treino não tem |
   | **Substituídos** | Zero ou quase (só se algum id coincidir) |
   | **Desaparecem** | O pedido, a tarefa, o fornecedor e a factura do passo 9.2 |
   | Avisos a vermelho | Lê-os todos. Um conjunto `saltado` traz a razão por extenso |

3. **Verificar que nada foi escrito:** abre outro separador do back office e
   confirma que o pedido do passo 9.2 ainda lá está. O ensaio não escreve —
   este passo prova-o.
4. Fecha o diálogo **sem confirmar**. O ensaio tem de poder ser abandonado.

### 9.4 A reposição a sério

1. Repete o passo 9.3 e, desta vez, escreve à mão a frase de confirmação:
   **`REPOR TUDO`**. (É pedida só na reposição real; o ensaio nunca a pede.)
2. **Verificar imediatamente a seguir:**
   - a aplicação entregou uma **cópia do estado anterior** — guarda-a, é a rede
     de segurança desta operação;
   - o ecrã diz, conjunto a conjunto, o que foi reposto;
   - se algum conjunto falhou, ele aparece nomeado. Não é atómico entre
     tabelas: uns podem ficar repostos e outros não, e o ecrã diz quais.

### 9.5 Verificar que a reposição fez o que devia

Este é o passo que ninguém tem paciência para fazer e é o único que prova
alguma coisa. Um por um:

| Verificar | Onde | O que tem de estar |
|---|---|---|
| Os pedidos voltaram | Pedidos | O número bate certo com o `counts.quotes` do ficheiro |
| **As datas não mudaram** | Pedidos | Um pedido antigo continua com a data ANTIGA. Foi aqui que apareceu o defeito do `created_at` |
| As propostas voltaram | Propostas | Abre uma proposta enviada: o texto e os valores estão lá |
| **As fotografias NÃO voltaram** | Uma proposta com mood board | As imagens aparecem partidas. **É o esperado** — ver 3.3 |
| Os contratos aceites | Contratos | A data de aceitação e o `termsSnapshot` estão lá |
| O livro de facturas | Facturas | Todas as facturas da cópia, com os números originais |
| **A numeração não recuou** | Emite uma factura nova | O número tem de ser **maior** do que o mais alto do livro — e não `FT <ano>/0002`, que era o que seguia à do passo 9.2 |
| Os rascunhos por enviar | Estúdio, num pedido que tinha rascunho | O rascunho volta, com os textos. Sem as fotos |
| Os marcadores NÃO voltaram | — | É de propósito: repô-los faria o robô da caixa de entrada voltar a avisar de emails já avisados |

Se algum destes falhar, **escreve o que viste antes de mexer em mais nada** — é
a única altura em que a informação existe. E escreve o teste antes de fechar o
assunto (secção 8).

### 9.6 Arrumar

1. Volta a pôr o `.env.local` a apontar para produção (ou apaga-o).
2. **Verificar:** o back office volta a mostrar os dados de verdade.
3. O projecto de treino pode ficar como está — serve para o ensaio do ano
   seguinte. Se ficar meses sem uso, o Supabase suspende-o, e retomá-lo é um
   botão.

### 9.7 O que este ensaio NÃO prova

- **Que as fotografias voltam.** Não voltam: não estão em cópia nenhuma. O que
  existe é a LISTA delas — o manifesto que vai no email diário (segundo anexo,
  `liquen-fotografias-<data>.json.gz`), e que serve para saber o que se perdeu,
  não para o devolver. Ver `RESILIENCE.md` §6.
- **Que uma cópia de há dois meses serve.** Prova que o mecanismo funciona. O
  que se perde entre a data da cópia e hoje continua perdido.
- **Que a base de dados de produção aguenta a operação.** O treino está vazio;
  produção não. O tecto do corpo do pedido (~4,5 MB no alojamento) é o limite
  que aparece primeiro, e a cópia vai comprimida precisamente por isso (3.4).
