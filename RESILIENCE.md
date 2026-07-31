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
| Alertas | **Escrito, por ligar** — §7 |

---

## 1. Tectos de pedidos

**A premissa "sem tecto = crítico" não se aplica a este projecto.** Das 55
rotas, 11 têm tecto — e são exactamente as que qualquer pessoa pode chamar:

`orcamento` · `orcamento/[id]` · `admin/login` · `proposta` ·
`proposta/[token]/pdf` · `portal/[token]/contrato-pdf` ·
`portal/[token]/proposta-pdf` · `inbox/reply` · `health` · `vitals` ·
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

**IMAP.** `src/lib/inbox.ts` abre e fecha ligação por operação
(`connect()` … `logout()`). É custo real por pedido e não há reutilização de
ligação. Fica **levantado, não resolvido**: a rota está autenticada e com tecto,
e a tarefa agendada corre de 15 em 15 minutos, portanto o volume é conhecido e
pequeno. Passa a valer a pena se a frequência subir.

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
re-datava todas as propostas numa reposição). Um ensaio a sério contra a base
de dados de produção **não foi feito** e precisa de uma base de dados de treino.

**As fotografias não estão em nenhuma cópia.** Vivem nos buckets do Storage. É
a maior lacuna que resta.

---

## 7. Monitorização e alertas

**O código já existe** (`src/lib/logger.ts`), e falta ligá-lo:

| Variável | O que liga |
|---|---|
| `SENTRY_DSN` | Erros para o Sentry, agrupados, com histórico e regras de alerta |
| `ERROR_WEBHOOK_URL` | Cada erro em tempo real para um canal à escolha |
| `CRON_SECRET` | Sem ela as tarefas agendadas param **em silêncio** |

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
alto, mas o que não chega a correr e não se queixa. Está agendada de 15 em 15
minutos, e `agendamento.contrato.test.ts` passa a reprovar qualquer rota de
cron que exista sem agenda — ou qualquer agenda que aponte para uma rota que
não existe.

---

## O que fica por fazer, e de quem depende

| # | O quê | De quem |
|---|---|---|
| 1 | Ligar `SENTRY_DSN` e `ERROR_WEBHOOK_URL` | Dona (Vercel) |
| 2 | Confirmar `CRON_SECRET` definida em produção | Dona (Vercel) |
| 3 | Vigia externo a chamar `/api/health` | Dona (Vercel ou serviço) |
| 4 | Confirmar cópias automáticas do Supabase e a retenção | Dona (Supabase) |
| 5 | Ensaio de restauro contra uma base de treino | Ambos |
| 6 | Cópia de segurança das fotografias dos buckets | Por decidir |
| 7 | Reutilização de ligação IMAP, se a frequência subir | Adiado, com razão |
