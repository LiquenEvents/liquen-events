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
| `/api/cron/reminders` | 07:00 diário | Resumo diário e lembretes |
| `/api/cron/inbox-check` | 08:00 diário | Lê as respostas dos clientes na caixa de correio |

Se pararem, o suspeito nº 1 é o `CRON_SECRET` em falta: as rotas fecham-se em
produção e param **sem dar erro nenhum**.

Para testar à mão, com sessão de administrador aberta, basta abrir a rota no
browser.

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
