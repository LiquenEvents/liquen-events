# Auditoria de resiliência e disponibilidade

Levantamento feito sobre as 55 rotas de `src/app/api/`, a camada de dados, os
limites de pedido e as tarefas agendadas. O objectivo não era invasão: era não
cair.

As procedimentos de emergência estão no [RUNBOOK.md](./RUNBOOK.md). Este
ficheiro é o estado do sistema e o que ficou por fazer.

---

## Sumário

| Área | Estado |
|---|---|
| Tectos de pedidos, rotas públicas | **Coberto** — as 11 rotas com tecto são exactamente as públicas |
| Tectos de pedidos, rotas de admin | **Coberto por autenticação**, não por tecto — ver §1 |
| Segundo factor (TOTP) | **Corrigido** — só tinha tecto por endereço |
| Custo por pedido | Parcial — ver §2 |
| Tectos de leitura na base de dados | **Deliberadamente sem tecto** — ver §3 |
| Cache / CDN | Coberto |
| Tectos de corpo e de upload | Coberto |
| Cópias de segurança e reposição | Coberto no que é da aplicação; **falta confirmar o Supabase** — §6 |
| Fotografias (buckets) | **A LISTA vai na cópia diária**; os BYTES continuam por copiar — §6 |
| Alertas | **Escrito, por ligar** — §7 |

---

## 1. Tectos de pedidos

**A premissa "sem tecto = crítico" não se aplica a este projecto.** Das 55
rotas, 11 têm tecto — e são exactamente as que qualquer pessoa pode chamar:

`orcamento` · `orcamento/[id]` · `admin/login` · `proposta` ·
`proposta/[token]/pdf` · `portal/[token]/contrato-pdf` ·
`portal/[token]/proposta-pdf` · `proposta/[token]/escolha` · `health` ·
`vitals` ·
`security/csp-report`

As restantes 44 estão **todas** atrás de `isAuthed`, com palavra-passe *bcrypt*
e TOTP. Acrescentar-lhes tectos por endereço não compra segurança — quem já
entrou é a dona do negócio — e acrescenta um modo de falha: um dia de trabalho
intenso no back office a bater num 429.

O limitador (`src/lib/rate-limit.ts`) usa Upstash Redis quando configurado e
recua para memória por instância quando não. A extracção do endereço está na
ordem certa: primeiro o cabeçalho que a plataforma escreve e não pode ser
forjado, e só em último o `x-forwarded-for` do cliente. Ao contrário, um bot
rodava "endereços" à vontade.

Falhar **aberto** quando o Redis está em baixo é deliberado: uma cache em baixo
nunca pode fechar os formulários do site.

### Corrigido: o segundo factor só tinha tecto por endereço

O contador era `login:${ip}`, 8 por minuto. Contra quem já tenha a palavra-passe
— reutilizada, apanhada num phishing, saída na fuga de outro serviço — resta um
código de seis dígitos com uma janela de tolerância. E **rodar endereços é
barato: cada endereço novo comprava oito tentativas novas**.

Há agora um segundo contador, `login-conta:${nome}`, 20 por hora, **igual para
todos os endereços do mundo**. Dois pormenores que são o essencial:

- conta a tentativa **antes** de saber se a conta existe — senão o tempo de
  resposta dizia quais os nomes válidos, e os nomes inexistentes ficavam sem
  tecto;
- normaliza maiúsculas — senão alternar `CATARINA`/`Catarina`/`catarina`
  multiplicava o tecto pelo número de grafias.

Cinco testes, três mutações verificadas.

---

## 2. Custo de cada pedido

**IMAP.** Deixou de existir: a caixa de entrada de email foi apagada a pedido
dela (agosto de 2026). O custo que aqui estava descrito — uma ligação IMAP
aberta e fechada por operação — desapareceu com ela, e com ele duas
dependências (`imapflow`, `mailparser`).

**Geração de PDF.** Corre em runtime e é o trabalho mais pesado por pedido. As
rotas públicas que o fazem têm tecto (12/min por endereço nos PDFs por token).

**Imagens.** Já não há geração em runtime: as 2869 derivadas são pré-geradas na
compilação e servidas pela CDN. Era esta a causa das falhas de fotografias.

**Documento de proposta.** Tecto de 512 KB, recusado com 413 **antes** de
desenhar o PDF — a validação acontece antes do trabalho caro, não depois.

---

## 3. Leituras da base de dados

**Não há tecto por omissão, e fica assim.**

`src/lib/repository.ts` tem um campo `listLimit` opcional e nenhum dos 12
stores o define. Um comentário dizia que havia um `DEFAULT_LIST_LIMIT` — essa
constante nunca existiu, e o comentário foi corrigido.

A decisão de não pôr tecto é deliberada: **um tecto por omissão esconde
linhas**. Numa lista de facturas ou de contratos, devolver as primeiras N em
silêncio é pior do que devolver muitas — a página fica bonita e falta lá
dinheiro. O código só trunca por adesão explícita, e quando trunca **regista um
aviso**, porque uma página cheia é o sinal de que passou a ser precisa
paginação a sério.

Quando passa a valer a pena: numa tabela que cresça sem relação com o número de
eventos (auditoria, telemetria), ou quando um ecrã ganhar paginação.

**Nenhum caminho deixa o utilizador controlar o tamanho do resultado** — não há
parâmetro de página ou de limite vindo do exterior em nenhuma das rotas.

---

## 4. Cache

O site público é estático ou regenerado por intervalo; as páginas de serviço
usam `revalidate = 30`. As rotas de API que mudam dados são `force-dynamic`, o
que está correcto. As imagens são ficheiros estáticos servidos pela CDN.

---

## 5. Tectos de corpo e upload

- Documento de proposta: **512 KB**, com 413 antes de qualquer trabalho.
- Imagem importada por URL: **15 MB**, e verifica o `content-length` declarado
  antes de descarregar.
- Reposição da cópia: aceita corpo **comprimido** (6,24 MB → 0,35 MB medidos),
  porque o alojamento recusa acima de ~4,5 MB — sem isso o mecanismo de
  recuperação nascia inutilizável.
- Corpos malformados são recusados com 400 na desserialização.

---

## 6. Cópias de segurança e recuperação

**Do lado da aplicação, coberto.** A cópia leva 13 conjuntos, incluindo o livro
de facturas, os contratos aceites e o contador de numeração fiscal. A reposição
faz ensaio por omissão, valida o ficheiro inteiro antes de escrever, guarda o
estado actual antes de lhe tocar, amarra a confirmação ao ficheiro
pré-visualizado, e o contador de facturas só sobe.

**Por confirmar, e é da conta do Supabase:** se as cópias automáticas do próprio
Supabase estão activas, e com que retenção. Não tenho acesso à consola. Um
projecto no plano gratuito tem retenção curta ou nenhuma — vale a pena
confirmar, porque é a rede que apanha o caso que a cópia da aplicação não
apanha: a base de dados inteira desaparecer.

**Teste de restauro:** o caminho da aplicação tem teste de ida-e-volta
automatizado (apanhou um defeito real — `created_at` não era escrito, o que
re-datava todas as propostas numa reposição). Um ensaio a sério **continua por
fazer** — mas deixou de ser um ensaio por inventar: está escrito passo a passo
no [RUNBOOK §9](./RUNBOOK.md#9-ensaio-de-reposição-contra-uma-base-de-dados-de-treino),
contra uma base de treino, com o que verificar em cada passo (incluindo os
três que costumam falhar em silêncio: as datas dos pedidos, a numeração de
facturas não recuar, e as fotografias NÃO voltarem). Falta alguém correr o
procedimento; é uma hora.

### As fotografias — o que passou a existir e o que continua a faltar

**Continuam a não estar em cópia nenhuma.** Vivem nos buckets do Storage
(`proposal-assets` e `theme-assets`), a cópia diária leva os CAMINHOS e não os
ficheiros, e uma reposição devolve propostas e mood boards a apontar para
imagens que têm de já existir. É a maior lacuna que resta, e é uma lacuna de
BYTES.

**O que passou a existir: o manifesto.** A cópia diária leva agora um segundo
anexo, `liquen-fotografias-<data>.json.gz` — a lista dos originais com chave,
tamanho, assinatura (`eTag`) e data. Não transfere um único byte:
`src/lib/manifesto-de-fotografias.ts` lê o que a própria listagem do Storage já
devolve, o que custa uma chamada por pasta.

Porque é que vale a pena sem os bytes: o dia mau começa sempre pela mesma
pergunta — *o que é que faltou?* — e até aqui não havia como responder. Com o
manifesto, comparar o bucket com o ficheiro de ontem é uma diferença de duas
listas, e o que se perdeu fica com nome, tamanho e data. Sem ele, uma proposta
reposta aponta para `LIQ-3/mood-2.jpg` e ninguém sabe sequer se essa foto
existiu.

O que o manifesto **não** faz, dito para ninguém prometer o que ele não dá: não
devolve uma fotografia. E o `eTag` só é o MD5 do conteúdo para ficheiros
enviados de uma vez — em envios em partes é uma assinatura composta (sufixo
`-N`) que não se recalcula com um `md5sum` local. Serve para dizer se o ficheiro
de hoje é o mesmo de ontem; não serve para provar a integridade de uma cópia
feita à mão.

As **derivadas** (`proposal-thumbs`, `theme-thumbs`, `theme-micro`,
`proposal-capas`, `theme-capas`) ficam de fora do manifesto de propósito:
refazem-se dos originais num botão (Definições → Miniaturas). Insubstituível é o
original.

### E os bytes? — recomendação, com o custo

Copiar os bytes **não deve ser feito por esta aplicação**, e a razão não é
preguiça: uma cópia guardada pelo mesmo servidor que já tem acesso de escrita
aos buckets não protege contra o caso que interessa (uma chave comprometida, um
`delete` errado, o projecto suspenso). E uma função serverless com 60 segundos
não copia gigabytes.

As três hipóteses, por ordem de recomendação:

| Hipótese | Custo real | O que protege | O que não protege |
|---|---|---|---|
| **1. Cópias do próprio Supabase** (Point-in-Time Recovery / backups do projecto) | Exige plano **Pro** (~25 USD/mês). Zero trabalho de código | O Storage inteiro, com retenção. É a opção certa | Não protege contra "a conta Supabase desapareceu" |
| **2. Descarregamento periódico para fora** (um `rclone`/guião no computador dela ou num NAS, contra o manifesto) | Zero em dinheiro; ~1 h a montar; a primeira cópia é a única lenta (as seguintes só levam o que o manifesto diz que é novo) | Tudo, incluindo o fim da conta | Depende de alguém se lembrar de o ligar — o defeito que este repositório já apanhou duas vezes |
| **3. Segundo bucket noutro fornecedor, escrito pela aplicação** | Uma dependência nova, uma conta nova, chaves novas, e o dobro do custo de armazenamento | Pouco mais do que a 1 | **Não recomendado.** Fica dentro do alcance da mesma aplicação, que é o que o dia mau costuma comprometer |

**Recomendação: 1, e a 2 como reforço** enquanto o plano for o gratuito. O
manifesto já resolve a parte que o dinheiro não compra: saber o que se perdeu.

**O que só ela pode fazer** está em [ONDE-FICA-GUARDADO.md](./ONDE-FICA-GUARDADO.md)
e na tabela final deste ficheiro.

---

## 7. Monitorização e alertas

**O código já existe** (`src/lib/logger.ts`), e falta ligá-lo:

| Variável | O que liga |
|---|---|
| `SENTRY_DSN` | Erros para o Sentry, agrupados, com histórico e regras de alerta |
| `ERROR_WEBHOOK_URL` | Cada erro em tempo real para um canal à escolha |
| `CRON_SECRET` | Sem ela as tarefas agendadas param **em silêncio** |

### Corrigido: o silêncio do `CRON_SECRET` deixou de ser silêncio

Sem `CRON_SECRET`, `/api/cron/backup` responde 401 todos os dias: não envia
email nenhum, não regista erro nenhum, e ninguém repara. Uma cópia que não corre
há semanas é **pior** do que não ter cópia, porque dá a certeza de estar salvo a
quem já não está — e essa certeza só se desfaz no dia em que se precisa dela.

Cada cópia bem sucedida passa a deixar um carimbo
(`src/lib/copia-de-seguranca-marcador.ts`, chave `copia-de-seguranca:ultima` no
`app_state`), e a verificação de armazenamento lê-o. Passados **três dias** sem
cópia, o painel do back office escreve há quanto tempo é que não chega uma e
nomeia a variável a confirmar.

Os três cuidados que fazem disto um aviso e não um alarme falso:

- **um dia falhado não é uma avaria** (um deploy à hora da tarefa, um atraso do
  agendador): só se fala ao terceiro;
- **uma instalação estreada hoje nunca teve cópia**, e gritar-lhe isso à
  primeira abertura era o alarme falso perfeito. A primeira pergunta carimba
  «começámos a olhar agora» e só o silêncio a partir daí é que avisa;
- **não se pergunta em desenvolvimento** (a tarefa não corre num portátil) **nem
  com a base de dados em baixo** (o carimbo vive lá, e a avaria a resolver é a
  outra — dois vermelhos pela mesma causa dividem a atenção).

Descarregar uma cópia à mão também carimba: o aviso não persegue quem acabou de
fazer o que ele pede.

**O que continua sem sinal:** o resumo diário e a leitura da caixa de entrada. Se
pararem, a falta do email é o único sintoma.

**O que isto não resolve, dito sem rodeios:** nada disto deteta o site em baixo
por inteiro, porque o código que avisaria também não corre. Para isso é preciso
alguém de fora a bater à porta — os alertas da Vercel, ou um serviço de vigia a
chamar `/api/health` de poucos em poucos minutos.

`/api/health` já responde ao que é preciso: sonda a base de dados com timeout
de 4 segundos e responde mesmo com ela em baixo.

### Corrigido: uma tarefa agendada que nunca corria

`/api/cron/inbox-check` existia, estava testada e protegida — e **não estava no
`vercel.json`**. Só lá estava o `reminders`. A verificação das respostas dos
clientes nunca corria sozinha, e o repositório dizia o contrário em dois sítios.

É a família de defeito que mais aparece neste projecto: não o código que falha
alto, mas o que não chega a correr e não se queixa. O guarda que ficou —
`agendamento.contrato.test.ts` — recusa uma rota de cron que ninguém agendou, e
continua de pé. (A caixa de entrada foi apagada em agosto de 2026, a pedido
dela; o guarda não era sobre ela.)

Está agendada — mas **uma vez por dia, e isso é pouco**. Tentei de 15 em 15
minutos e a Vercel RECUSOU o deploy: *"Hobby accounts are limited to daily cron
jobs."* Eu tinha assumido plano Pro por o projecto viver numa equipa, e assumi
mal. Consequência prática, dita por extenso: **a resposta de um cliente pode
esperar até 24 horas** para ser lida automaticamente. Passar a Pro resolve, e é
uma linha.

`agendamento.contrato.test.ts` passa a reprovar três coisas: uma rota de cron
que exista sem agenda, uma agenda a apontar para uma rota que não existe, e uma
agenda que corra mais do que uma vez por dia — esta última para que o limite do
plano seja apanhado por um teste em vez de por uma publicação falhada.

---

## O que fica por fazer, e de quem depende

| # | O quê | De quem |
|---|---|---|
| 1 | Ligar `SENTRY_DSN` e `ERROR_WEBHOOK_URL` | Dona (Vercel) |
| 2 | Confirmar `CRON_SECRET` definida em produção | Dona (Vercel) — **agora com sinal**: sem ela o back office avisa ao terceiro dia |
| 3 | Vigia externo a chamar `/api/health` | Dona (Vercel ou serviço) |
| 4 | Confirmar cópias automáticas do Supabase e a retenção | Dona (Supabase) — é a **hipótese 1** do §6, a recomendada para as fotografias |
| 5 | Ensaio de restauro contra uma base de treino | Dona, com o procedimento escrito ([RUNBOOK §9](./RUNBOOK.md)) — ~1 h |
| 6 | Cópia dos BYTES das fotografias | Dona (Supabase Pro, ou descarregamento periódico). A LISTA já vai na cópia diária |
| 7 | Reutilização de ligação IMAP, se a frequência subir | Adiado, com razão |
| 8 | Recurso a ficheiro sem guarda de produção | **Fechado** — `push.ts` era o último; recusa e diz porquê |
| 9 | Contador de facturas a reiniciar num deploy | **Fechado** — sem base de dados em produção, recusa emitir |
