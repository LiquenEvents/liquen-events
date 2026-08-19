# Sair do Gmail e passar a enviar de `liquen-events.com`

**Levantamento, não é uma alteração.** Nada foi mexido: nem DNS, nem variáveis de
ambiente, nem nada que faça um email sair de sítio diferente de onde sai hoje. A
migração precisa da tua aprovação, e este documento existe para a poderes dar (ou
não) com a informação toda à frente.

Onde não consegui confirmar um número ou um facto, está escrito **«não apurei»**.
Um preço inventado é pior do que um preço em falta.

---

## 1. O que se passa hoje, em duas linhas

Os emails da Líquen saem de `liquen.alentejo@gmail.com`. O nome que aparece é
«Líquen Events», mas o endereço por trás é um Gmail pessoal — e a empresa tem
domínio próprio, `liquen-events.com`.

Quem recebe vê um endereço `@gmail.com`. Os filtros de spam veem a mesma coisa:
uma empresa que manda propostas de vários milhares de euros a partir de uma conta
gratuita, sem nada que ligue o email ao domínio da empresa.

---

## 2. SPF, DKIM e DMARC — em português

Estas três siglas são a resposta a uma pergunta só: **como é que o servidor de
correio do teu cliente sabe que este email é mesmo teu?** Porque, por defeito, o
email não sabe. Qualquer pessoa no mundo pode escrever uma mensagem que diz vir de
`geral@liquen-events.com`. O protocolo é de 1982 e nasceu sem autenticação
nenhuma.

### SPF — «que servidores é que podem enviar em meu nome»

É uma lista, publicada no DNS do teu domínio, dos servidores autorizados a mandar
correio por ti. Pensa numa lista de convidados à porta: chega uma mensagem que diz
vir de `liquen-events.com`, o servidor do destinatário vai ver a lista, e ou o
servidor que a entregou está lá, ou não está.

### DKIM — «este email não foi mexido pelo caminho»

Uma assinatura digital que o teu servidor põe em cada email que sai, e a chave para
a verificar fica publicada no teu DNS. Serve para duas coisas: provar que o email
saiu mesmo de onde diz, e provar que ninguém lhe mexeu no conteúdo entre o teu
servidor e a caixa do cliente. É o selo de lacre do envelope.

### DMARC — «e se não bater certo, façam o quê»

As duas primeiras verificam; esta **diz o que fazer quando falham** — ignorar,
mandar para o spam, ou recusar de vez. E faz mais uma coisa que as outras não
fazem: verifica que o domínio que assinou (DKIM) e o domínio autorizado (SPF) são
o **mesmo** que aparece no «De:» que o cliente lê. É a isso que se chama
*alinhamento*, e é o que impede alguém de assinar corretamente com o domínio dele
e escrever o teu no «De:».

O DMARC manda-te também **relatórios**: quem andou a enviar em nome do teu
domínio, de onde, e se passou ou não. É o único sítio onde se vê a fotografia
completa antes de mexer em seja o que for.

### Porque é que um Gmail pessoal não pode ter isto para o teu domínio

Porque as três verificações se fazem contra o **domínio do remetente**, e o
domínio do remetente é, hoje, `gmail.com`. Esse domínio é da Google. A Google já
tem lá SPF, DKIM e DMARC — muito bem feitos — mas são os **dela**, para `gmail.com`,
e tu não podes publicar nada no DNS da Google.

O teu domínio, `liquen-events.com`, não entra nesta história em lado nenhum: não é
ele que está no «De:», portanto não é ele que é verificado, e a reputação que os
teus emails vão construindo não é dele. Não é uma limitação da conta gratuita nem
uma coisa que se resolva a pagar o Google One — é onde o endereço vive.

> ### ⚠️ E a armadilha que parece o atalho óbvio
>
> O sistema tem uma variável (`MAIL_FROM`) que muda o endereço que aparece no
> «De:». É tentador pôr lá `geral@liquen-events.com` e ficar com ar de domínio
> próprio sem migrar nada.
>
> **Isso é o pior dos mundos, e é o caminho mais rápido para a pasta de spam.** O
> email passaria a dizer que vem de `liquen-events.com` mas continuaria a sair
> pelos servidores do Gmail, assinado como `gmail.com`. O alinhamento do DMARC
> falha — e é exatamente esta a assinatura de uma tentativa de falsificação, que é
> o que os filtros estão treinados para caçar. Um email que hoje chega à caixa de
> entrada passaria a ir para o spam.
>
> Isto **não se muda sozinho**. Muda-se no fim da lista do ponto 6, e não antes.

---

## 3. As opções, com o que custam e o que exigem em DNS

O volume de correio conta muito para a escolha, e **não apurei** quantos emails a
Líquen manda por mês. Pelo que o sistema faz (confirmações de pedido, propostas,
mensagens ao cliente), o mais provável é serem dezenas por mês — o que cabe
folgadamente em qualquer uma destas opções, incluindo as gratuitas. Se forem
centenas por dia, é outra conversa.

Os preços abaixo são **indicativos**: as páginas oficiais dos fornecedores estão
bloqueadas a partir do ambiente onde este levantamento foi feito, e os valores
vêm de fontes de terceiros de 2026. **Confirma na página do fornecedor antes de
decidires.** Os valores estão em dólares porque é assim que são publicados; o que
pagas em euros depende do câmbio e do IVA.

### Opção A — Google Workspace

Continuas a usar o Gmail exatamente como hoje — a mesma aplicação, o mesmo
telemóvel — mas a caixa passa a ser `catarina@liquen-events.com`.

- **Custo (indicativo, a confirmar):** Business Starter cerca de **7 USD por
  utilizador/mês** com pagamento anual, ou **8,40 USD** ao mês sem compromisso.
- **DNS:** registos **MX** (passam a apontar para a Google — é o passo que muda
  para onde chega o correio), um **TXT de SPF**, um **TXT de DKIM** (a chave é
  gerada na consola de administração da Google) e um **TXT de DMARC**.
- **Na aplicação:** muda-se `SMTP_USER`, `SMTP_PASS` (uma palavra-passe de
  aplicação, não a tua) e `MAIL_FROM`. O código não muda uma linha.
- **A favor:** é o que já sabes usar, e é a opção com menos coisas novas para
  aprender. Levas o arquivo todo contigo na migração.
- **Contra:** é a mais cara das três, e paga-se por pessoa.

### Opção B — Zoho Mail (ou equivalente mais barato)

A mesma ideia, com outro fornecedor de caixas de correio.

- **Custo (indicativo, a confirmar):** o plano Mail Lite ronda **1 USD por
  utilizador/mês** com pagamento anual (cerca de 1,25 USD ao mês). **Não apurei**
  se o plano gratuito deles continua a servir para domínio próprio nas condições
  atuais.
- **DNS:** exatamente a mesma forma da opção A — MX, SPF, DKIM, DMARC —, com os
  valores do Zoho em vez dos da Google.
- **A favor:** custa uma fração.
- **Contra:** interface e aplicação móvel diferentes do Gmail. Mudas de ferramenta
  de trabalho ao mesmo tempo que mudas de endereço, e são duas mudanças, não uma.

### Opção C — só o correio automático, por um serviço de envio

Aqui separa-se o correio das **pessoas** (o que tu escreves e lês) do correio da
**aplicação** (confirmações e propostas, que saem sozinhas). A caixa fica onde
está; só os emails automáticos passam a sair autenticados pelo domínio.

- **Custo (indicativo, a confirmar):** o **Resend** dá 3 000 emails/mês (limite de
  100 por dia) num domínio, de graça. O **Brevo** dá 300 por dia no plano
  gratuito. Para o volume desta casa, o mais provável é nunca se pagar nada.
- **DNS:** **SPF** e **DKIM** para o domínio (ou, melhor, para um subdomínio como
  `envio.liquen-events.com`), e o **DMARC**. **Não mexe nos MX** — é a diferença
  que interessa: o correio que entra continua a chegar exatamente onde chega hoje.
- **Na aplicação:** o código já envia por SMTP com utilizador e palavra-passe
  (`src/lib/mail.ts`), e estes serviços dão precisamente isso. Muda-se
  `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM`, e mais nada.
- **A favor:** **é a opção com menos risco de todas.** Não toca no correio que
  entra, portanto o pior que pode acontecer é um email automático não sair — nunca
  é um cliente a escrever-te e a mensagem não chegar. E dá-te painéis a dizer
  quantos emails chegaram, quantos foram abertos e quantos foram recusados, que
  hoje não tens.
- **Contra:** resolve metade do problema. Quando és tu a escrever do telemóvel,
  continua a sair do Gmail. Os clientes veem dois endereços diferentes conforme o
  email.

### O que eu faria (e é uma opinião, não uma recomendação técnica)

**C primeiro, A ou B depois.** A opção C põe o domínio a funcionar, autenticado e
com relatórios, sem tocar no que faz o correio entrar — e é o correio que entra
que não pode falhar nunca. Passadas umas semanas, com os relatórios do DMARC
limpos e a certeza de que está tudo a passar, faz-se a mudança dos MX com muito
menos a adivinhar.

---

## 4. O que se ganha

- **Entregabilidade.** Um email autenticado pelo próprio domínio tem muito menos
  probabilidade de cair no spam ou na aba «Promoções». No email que mais interessa
  — a proposta — isso é a diferença entre ser lido e não ser.
- **Credibilidade.** `catarina@liquen-events.com` num orçamento de casamento diz
  uma coisa; um Gmail diz outra. Não é vaidade: é o que o cliente vê antes de abrir.
- **Reputação que é tua.** Hoje a reputação de envio que vais construindo pertence
  ao `gmail.com`, partilhada com milhões de contas. Com domínio próprio, o
  histórico de bom comportamento é da Líquen e viaja contigo se um dia mudares de
  fornecedor.
- **Visibilidade.** Os relatórios DMARC mostram-te se alguém anda a usar o teu
  domínio para enviar correio em teu nome. Hoje não terias como saber.
- **Continuidade.** Uma conta pessoal gratuita está presa a uma pessoa. Um domínio
  é da empresa.

## 5. O que se arrisca — e isto é o parágrafo importante

**Uma migração mal feita manda os emails para spam.** Não é um risco teórico, é o
resultado normal de fazer os passos pela ordem errada:

- Mudar o «De:» para o domínio **antes** de publicar SPF e DKIM (a armadilha do
  ponto 2) faz falhar o DMARC em todos os emails que saírem. Vão para spam, e não
  há aviso nenhum: continuam a parecer «enviados» do lado de cá.
- Publicar um **DMARC em `p=reject`** logo no primeiro dia faz com que qualquer
  serviço que ainda envie legitimamente em teu nome — um contabilista, uma
  plataforma de faturação, um formulário de outro sítio — passe a ser **recusado
  de vez**, sem chegar sequer ao spam. **Não apurei** se existe algum serviço
  desses a enviar hoje em nome de `liquen-events.com`; os relatórios do DMARC em
  modo de observação são precisamente o que responde a essa pergunta.
- Mudar os **MX** é o passo de não-retorno: a partir daí o correio que entra passa
  a ir para a caixa nova. Se estiver mal configurada, mensagens de clientes
  perdem-se — e uma proposta que não chega é o pior que este sistema pode fazer.
- Um domínio novo a enviar tem **reputação zero**. Mandar de repente muito mais
  correio do que o costume nos primeiros dias é o comportamento típico de spam.
  Com o volume desta casa isto quase não é problema, mas conta-se na mesma.

---

## 6. A ordem segura

Uma coisa de cada vez, e cada uma verificada antes da seguinte. **Nunca na semana
de um evento**, e nunca a uma sexta-feira à tarde.

1. **Ver o que existe hoje.** Que registos de email tem o domínio neste momento e
   quem controla o DNS (o registador, o alojamento, a Vercel). **Não apurei** — as
   consultas de DNS estão bloqueadas a partir daqui. Vê-se em `mxtoolbox.com` ou
   no painel de quem tem o domínio.
2. **Baixar o TTL** dos registos de email para 5 minutos, um dia antes de mexer.
   É o que faz uma correção ser instantânea em vez de demorar horas a propagar-se.
3. **Publicar SPF e DKIM** do fornecedor escolhido. **Ainda não sai nenhum email
   pelo endereço novo** — só se acrescentam registos, e acrescentar não parte nada
   do que já funciona.
4. **Publicar o DMARC em modo de observação** (`p=none`) com um endereço para
   receber os relatórios. Esperar **duas semanas** e lê-los. É aqui que se
   descobre quem mais anda a enviar em nome do domínio, antes de isso passar a ser
   um problema.
5. **Mandar emails de teste** pelo caminho novo, para o Gmail, para o Outlook e
   para um endereço de empresa. Verificar (ponto 7) antes de mandar a primeira
   coisa a sério.
6. **Só agora**: mudar `MAIL_FROM`, `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS` no
   alojamento, e mandar uma proposta de teste a ti própria. O `Reply-To` continua
   a apontar para a caixa que lê as respostas — que não pode ficar sem ninguém a
   olhar por ela.
7. **Se — e só se — fores para a opção A ou B: mudar os MX.** Uma manhã de
   segunda-feira, fora de época alta. Manter a caixa antiga a reencaminhar durante
   pelo menos três meses, e não a apagar.
8. **Apertar o DMARC devagar**: de `p=none` para `p=quarantine`, e semanas depois
   para `p=reject`, sempre a ler os relatórios entre os passos. Quem salta direto
   ao `reject` descobre o que partiu por um cliente a telefonar a perguntar porque
   é que não respondeste.

## 7. Como se verifica que ficou bem — antes de mandar correio a sério

- **A prova dos nove, e é gratuita:** manda um email pelo caminho novo para uma
  conta Gmail tua. Abre-o lá, nos três pontinhos escolhe **«Mostrar original»**.
  Tem de dizer, nas três linhas de cima:

  ```
  SPF:   PASS   com o domínio liquen-events.com
  DKIM:  PASS   com o domínio liquen-events.com
  DMARC: PASS
  ```

  O que interessa não é só o **PASS** — é o **domínio ao lado ser o teu**. Se disser
  `gmail.com`, está autenticado, mas não está autenticado como Líquen, e é
  exatamente aí que a migração ainda não está feita.
- **`mail-tester.com`**: manda um email para o endereço que o sítio te dá e ele
  devolve uma nota de 0 a 10, com a lista do que falta. Abaixo de 8, não avances.
- **Google Postmaster Tools**: liga o domínio e passas a ver, ao longo do tempo,
  quantos dos teus emails o Gmail está a marcar como spam.
- **Não te esqueças do correio que ENTRA**: se mudaste os MX, manda um email de
  fora para o endereço novo e confirma que chega — e confirma que o antigo
  continua a reencaminhar.
- **Uma proposta a sério, primeiro para ti.** O último teste é o próprio produto:
  gerar uma proposta do sistema com o teu email no pedido, e ver como ela chega.

---

## 8. O que ficou por apurar

- Os registos de DNS que o domínio tem **hoje** (SPF, DKIM, DMARC, MX) — consultas
  de DNS bloqueadas no ambiente onde isto foi escrito.
- Quem controla o DNS de `liquen-events.com` (registador, alojamento, Vercel).
- Se a variável `MAIL_FROM` está ou não definida em produção, e com que valor.
- O volume real de correio por mês.
- Se algum outro serviço envia hoje em nome do domínio (faturação, contabilidade,
  formulários noutro sítio).
- Os preços **nas páginas oficiais** dos fornecedores: `workspace.google.com` e
  `www.zoho.com` estão bloqueados a partir daqui, e os números do ponto 3 vêm de
  fontes de terceiros. Confirma-os antes de contratar.

Fontes consultadas para os preços indicativos (terceiros, não os fornecedores):
[Google Workspace](https://www.emailvendorselection.com/google-workspace-pricing/) ·
[Zoho Mail](https://www.g2.com/products/zoho-mail/pricing) ·
[Resend](https://nuntly.com/resend-pricing) ·
[Brevo](https://www.brevo.com/free-smtp-server/)
