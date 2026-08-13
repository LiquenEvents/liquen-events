# O back office, auditado — o que corrigir, o que melhorar, o que não fazer

Seis agentes especializados sobre 135 ficheiros (~47 mil linhas) e 84 rotas de
API, em leitura apenas. **Nada foi alterado.** Este documento existe para ser
decidido, não para ser executado.

Os seis mandatos: defeitos a sério · sistema de propostas ponta a ponta ·
telemóvel · segurança e integridade dos dados · rapidez · o que falta e faria
diferença.

Regra imposta a todos: **um achado só entra se souber dizer como se reproduz e o
que a dona vê acontecer**. E nada de propor o que já existe — todos leram
primeiro os relatórios anteriores (`MOBILE-AUDIT`, `TOUCH-AUDIT`, `SECURITY-AUDIT`,
`PROPOSTA-AFTER`, `docs/desempenho.md`) e marcaram "já feito".

**Verificado por mim, linha a linha, antes de entrar aqui:** os pontos 1, 2, 3,
4, 5, 6 e 12. O resto vem dos agentes com a referência de ficheiro que eles
próprios citaram.

---

## O que fazer primeiro, se for para escolher pouco

Cinco coisas. Todas de esforço pequeno, e as cinco fecham dinheiro, prova ou
perda de trabalho:

| | o que é | porque agora |
|---|---|---|
| **1** | A fatura sai 23 % abaixo quando é preenchida a partir do evento | é dinheiro que não foi cobrado |
| **2** | O casal aceita e não recebe nada | é o momento em que ela ganha ou perde a impressão de profissionalismo |
| **3** | Cópia de segurança automática | hoje só existe se ela se lembrar do botão |
| **4** | O seguimento marcado não chega aos lembretes | propostas que morrem por esquecimento, não por preço |
| **5** | Selar o aceite (guardar o PDF exacto que o casal viu) | custo zero, e é a prova numa discussão |

---

## 1. DINHEIRO — o que está errado nas contas

### 1.1 A fatura sai 23 % abaixo do devido · CRÍTICO · pequeno
`Faturas.tsx:276` pré-preenche o valor com `q.quotedPrice`.
`dossier.ts:138` diz, no próprio código: *«o `quotedPrice` é o campo "Preço final
(sem IVA)", logo SEM IVA»*. `invoice-pdf.ts:22` declara: *`amount: number; //
valor com IVA`*.

Um casamento de 10.000 € + IVA gera uma fatura de 10.000 € **com IVA incluído**:
base 8.130 € + IVA 1.870 €. **Faltam 2.300 €**, e o PDF fica internamente
coerente, por isso nada acusa. Na mesma linha, o `?? q.priceBreakdown?.total`
é bruto — os dois ramos do mesmo `??` estão em unidades diferentes.

*Correcção:* usar `contractedAmounts(q).gross` e rotular "Total do evento (€, com IVA)".
*A fazer hoje, sem código:* rever as faturas emitidas a partir da caixa "Evento".

### 1.2 «Faturado total» e «Recebido» não olham para as faturas · alto · médio
`Overview.tsx:850`, `StatsDashboard.tsx:584` somam só pagamentos escritos à mão.
Emitir uma fatura, marcá-la paga, e a Visão Geral diz **0 €**. O dossiê do evento
diz outra coisa, porque usa `combinedPaidTotal` (`dossier.ts:227`).

### 1.3 «Ganho este mês» dá números diferentes em dois ecrãs · médio · médio
`Overview.tsx:866` atribui ao mês do aceite; `StatsDashboard.tsx:295` ao mês de
entrada do pedido. Os dois somam sem IVA, enquanto o dossiê e as faturas
trabalham com IVA — qualquer comparação com o dinheiro real cai ~23 %.

### 1.4 O contrato diz 30 % e a fatura pode cobrar 40 % · alto · pequeno
A percentagem do sinal é configurável e **o dinheiro respeita-a em todo o lado**.
O **texto** não: `contract-terms.ts:37` e `:41` e `proposal-doc.ts:411-412` têm
"30 %" e "70 %" escritos à mão. O próprio código avisa deste risco em
`proposal-doc.ts:319` — e cai nele. É a única contradição do sistema que sai em
papel assinado.

### 1.5 As faturas podem sair com a data de ontem · médio · pequeno
`Faturas.tsx:48` usa `toISOString()` (UTC) e calcula a data **uma vez, à
montagem**. Separador aberto de um dia para o outro, ou emissão entre a meia-noite
e a 01:00 no horário de Verão: documento fiscal com a data errada.

---

## 2. TRABALHO QUE PODE DESAPARECER

### 2.1 Duas abas apagam trabalho uma da outra · alto · médio
`PaymentsPanel.tsx:288` envia o array `payments` inteiro; `api/orcamento/[id]:81`
não tem guarda de versão. Registar o sinal no telemóvel e o saldo no portátil faz
**o sinal evaporar-se**. Vale igual para checklist, convidados e custos.
*Correcção:* `baseUpdatedAt` + 409, o padrão que o rascunho de proposta já usa bem.

### 2.2 Nos Fornecedores, o que ela escreve pode nunca chegar · alto · pequeno
`Fornecedores.tsx:61-107`: guardar, apagar e editar não verificam a resposta. O
painel fecha, a lista mostra o valor novo, e ao recarregar está tudo como antes.
É a **única** vista assim — Inventário, Tarefas e Propostas revertem e avisam.

### 2.3 O preço final pode não chegar ao pedido, em silêncio · alto · médio
`ProposalStudio.tsx:878-900`: `catch { }`. O Estúdio e o PDF mostram 9.500 €; o
cartão do pedido, a margem, as Estatísticas e as faturas ficam em 8.000 €. O
comentário diz "a gravação seguinte volta a tentar" — mas só há gravação seguinte
se ela voltar a escrever no campo.

### 2.4 O rascunho pode ficar só neste computador · médio · pequeno
`ProposalStudio.tsx:775`: `if (!res.ok) return;`. Diz "Guardado às 14:32" na
mesma. No dia seguinte, noutro computador, o trabalho da tarde não está lá.

### 2.5 A mensagem ao casal, escrita no telemóvel e perdida · médio · pequeno
`ClientMessenger.tsx:40-64`: sem cópia local. O iOS deita fora o separador quando
ela sai para a câmara, e o texto vai com ele.

### 2.6 Uma alteração que a rede engole · alto · grande
Sem detecção de rede, sem fila, sem nova tentativa. E a peça certa **já existe e
está testada** para outro ecrã: `lib/material-offline.ts` (fila em `localStorage`,
resolução por relógio, só limpa o que o servidor confirmou).

---

## 3. O PERCURSO DA PROPOSTA

### 3.1 O casal aceita e não recebe nada · alto · pequeno
`api/proposta/route.ts:373`: `to: MAIL_TO`. Grava contrato, fatura de sinal e
plano de produção — e avisa **só para dentro**. Ao casal, uma frase no ecrã. Sem
contrato, sem valor do sinal, sem IBAN, sem link do portal.

### 3.2 O seguimento marcado não chega aos lembretes · alto · pequeno
Há **dois campos com o mesmo nome**: `types.ts:273` (pedido) e `:383` (proposta).
O botão escreve num; os lembretes, a agenda e o kanban lêem o outro.

### 3.3 Rever uma proposta baixa a taxa de fecho · médio · pequeno/médio
Cada revisão cria uma proposta nova e a antiga fica "enviada" para sempre. O
painel conta as duas como abertas; a análise conta as duas como enviadas.

### 3.4 O portal existe e o casal não sabe que existe · médio · pequeno
O link só nasce num botão "Copiar link" dentro do dossiê. Nenhum email o contém.

### 3.5 Os quatro modelos de email nunca foram enviados a ninguém · médio · médio
`email-templates-store.ts:62-131` tem quatro modelos escritos com cuidado, e o
ecrã diz "Enviado ao cliente quando a proposta segue". **Nada os lê.** O email que
sai a sério está escrito à mão dentro da rota.

### 3.6 A fatura de sinal nasce sem prazo e ninguém a envia · médio · pequeno
Uma fatura sem vencimento não pode estar atrasada — e por isso nunca aparece em
lista nenhuma de cobranças.

### 3.7 Uma proposta que expira não se pode reactivar · médio · pequeno
O `validUntil` não está nos campos que o PATCH aceita. Único caminho: enviar tudo
de novo — que cria outra proposta e agrava o 3.3.

### 3.8 O casal não escolhe os extras · médio · médio
A proposta já sabe fazer base/extras com um único total escrito. O casal recebe um
total só e dois botões; qual das versões ficaram descobre-se ao telefone.

### 3.9 Os custos escritos na proposta desaparecem no aceite · médio · médio
`doc.budgetCosts` não é lido fora do Estúdio. Depois do aceite, a margem faz-se
outra vez noutro formato. Ela estima duas vezes e o sistema nunca compara
estimativa com real — que é a pergunta que decide os preços do ano seguinte.

---

## 4. SEGURANÇA, DADOS E O QUE SE PODE PERDER

### 4.1 A cópia de segurança só existe se ela carregar no botão · CRÍTICO · médio
As duas tarefas agendadas são lembretes e caixa de correio. **Nenhuma faz cópia.**
A rota é excelente (13 conjuntos, livro de faturas, contratos, contador fiscal) e
dispara à mão. No dia em que algo se apagar, o que existe é o ficheiro do dia em
que ela se lembrou.

### 4.2 Apagar uma proposta aceite é um clique e não tem volta · alto · pequeno
`api/propostas/[id]:66-79` chama `deleteProposal(id)` sem verificar estado nem
contrato. O contrato assinado e a fatura ficam órfãos; o portal do casal fica a
zero. O apagamento de um *pedido* foi pensado com arquivo reversível — o da
proposta, que é o documento comercial, não.

### 4.3 O link do portal vale um ano e não há como o cancelar · alto · médio
Mostra nome, evento, data, local, valor, quem assinou e as faturas. Reencaminhar é
trivial. A única alavanca hoje parte **todos** os portais de **todos** os clientes.

### 4.4 A política de privacidade promete apagar o que nunca é apagado · alto · pequeno+médio
Está publicado que os pedidos sem contrato são eliminados em 12 meses. Não há nada
que o faça. A exposição não é "não apagaram" — é "prometeram por escrito".

### 4.5 Se ela perder o telemóvel, quem a põe lá dentro é a Vercel · alto · pequeno
Sem códigos de recuperação. Se a conta da Vercel estiver protegida pelo mesmo
telemóvel, fica fechada de fora do próprio negócio.
*A fazer hoje, sem código:* registar um segundo aparelho em "Os meus dispositivos".

### 4.6 As fotografias não estão em cópia nenhuma · médio · médio
E, do outro lado, apagar um casal deixa as fotos dele no armazenamento para sempre.

### 4.7 `data/*.json` está no Git e não está ignorado · médio · pequeno
Hoje só tem um registo de exemplo — **não há fuga agora**. É uma armadilha armada:
no dia em que a aplicação correr sem base de dados, os pedidos reais passam a ser
escritos ali e o próximo commit publica-os.

### 4.8 O histórico de atividade pode ser reescrito · médio · pequeno
Existe o caminho seguro que só acrescenta, mas o campo cru continua a ser aceite ao
lado. E apagar não deixa rasto nenhum.

---

## 5. TELEMÓVEL

### 5.1 Escrever "1250,50" no valor dá «Indique um valor válido» · alto · pequeno
`Faturas.tsx:568`: `type="number"` com `placeholder="0,00"`. O ecrã **ensina** a
vírgula e depois **recusa-a**. O padrão certo está dois ficheiros ao lado
(`PaymentsPanel.tsx:702`, `inputMode="decimal"`).

### 5.2 500–700 px de filtros antes do primeiro pedido · alto · médio
A 375 px, entre o cabeçalho e o primeiro cartão: procura, "atribuídos a mim", seis
selectores, exportar, fila de estados e fila de etiquetas. Nada disto falha as
regras de toque — o problema é a **ordem**. O primitivo que resolve isto
(`ui/FolhaOuDialogo.tsx`) tem **zero utilizações** fora da própria pasta.

### 5.3 O livro de faturas dentro do pedido não cabe no ecrã · médio · médio
Duas tabelas de sete e seis colunas, letra de 9 px, arrastar na horizontal com o
polegar. O auditor não as acusa por desenho — e aqui a regra está errada.

### 5.4 Aos 768 px voltam as tabelas · médio · médio
Contra a regra escrita da casa (`md:` e `xl:` não se usam no back office). Um iPad
em retrato tem exactamente 768. E os dois layouts estão **sempre** no DOM.

### 5.5 O teclado da procura trabalha contra ela · médio · pequeno
Sem `type="search"`, sem `enterKeyHint`, com autocapitalização e autocorrecção
ligadas — e uma dica de tecla (`( / )`) escrita num ecrã sem teclas.

### 5.6 Cinco fotos, duas falharam, e não se sabe quais · médio · médio
Um aviso que desaparece sozinho, com o primeiro erro só, e sem repetir. O ecrã dos
Temas já faz isto bem: nomes dos ficheiros e botão de tentar outra vez.

### 5.7 O botão que abre o ecrã da carrinha tem 32 px · médio · pequeno
`EventMaterial.tsx:93` — o alvo mais pequeno do percurso é a porta do único ecrã
desenhado de propósito para o telemóvel.

### 5.8 O calendário do mês são pontos sem nome · médio · médio
Para saber de quem é o ponto, um toque e um scroll por dia. O componente certo já
existe (`Agenda.tsx`), usado só dentro da Visão Geral.

---

## 6. RAPIDEZ

### 6.1 Abrir um pedido monta os três separadores de uma vez · alto · pequeno
~11 800 linhas de componente por abertura; **1 695 (14 %) são as que ela vê**.
Medido: **615 ms**, a interacção mais cara e mais repetida do dia.

### 6.2 A lista de Propostas descarrega o documento inteiro de cada uma · alto · pequeno
**156 KB** medidos com 194 propostas — a maior resposta do back office. Os
consumidores lêem 11 campos. O resumo **já existe** na rota (`?resumo=1`) e é
usado por outros dois ecrãs.

### 6.3 As 300 linhas do dia viajam inteiras dentro do HTML · alto · médio
Medido: HTML **112,6 KB** com 1 pedido → **501,2 KB** com 300. Primeiro clique
456 → 1 173 ms. TBT 4 → 305 ms. Nenhum dos campos pesados é lido pelas linhas da
lista.

### 6.4 Três vistas desenham a lista duas vezes · médio · pequeno
~2 700 elementos com 167 faturas, metade invisível para sempre. Bate certo com a
tarefa longa medida de **223 ms** na vista Faturas.

### 6.5 Reminders e Agenda pedem as mesmas listas fora da cache · médio · pequeno
3× `/api/tarefas` e 2× `/api/calendario` por arranque: **63 KB** pedidos e
deitados fora, na janela em que o ecrã ainda não responde ao clique.

### 6.6 Nenhuma lista tem paginação nem virtualização · médio · médio
Zero ocorrências em 135 ficheiros. Só os Pedidos paginam. E **nunca ninguém mediu
acima de 300 pedidos / 194 propostas / 167 faturas** — este é o único ponto da
auditoria que é opinião, e é por isso que o 6.8 existe.

### 6.7 Contar as miniaturas em falta · alto · um clique
Entre **2,6 MB e 270 MB** na grelha da biblioteca, conforme o número. O botão está
em Definições, não escreve nada, e nunca foi carregado. É o único item que se
resolve sem código.

### 6.8 Não há régua permanente para nada disto · — · pequeno/médio
`bench-back-office.mjs` existe, é excelente, e não está no `package.json` nem em
workflow nenhum. O `/api/vitals` só aceita métricas de carregamento de página — e
o back office é uma página só, portanto mudar de vista e abrir um pedido são
**invisíveis** ao único instrumento que corre em produção.

---

## 7. O QUE FALTA E FARIA DIFERENÇA

Por ordem de valor a dividir pelo esforço. As três primeiras não dependem de
ninguém de fora.

### 7.1 Selar o aceite · pequeno · custo zero
Guardar o PDF exacto que o casal viu e a impressão digital dele. O aceite já
regista nome, IP, hora e o texto congelado dos termos — **isto já é uma assinatura
electrónica simples válida em Portugal**. Falta provar *qual* proposta foi aceite.
Numa discussão sobre "o arco não estava incluído", é a diferença entre ganhar e
ceder.

### 7.2 O calendário dela no telemóvel, sempre certo · pequeno
Um endereço secreto que o Google Calendar e o iPhone subscrevem. Hoje é um ficheiro
que se descarrega — uma fotografia de um dia, que envelhece na hora seguinte. O
gerador de iCalendar já está escrito e testado; não precisa de OAuth.

### 7.3 Quem vê o quê · médio
Três perfis: ela, assistente, montador. Hoje **qualquer conta vê tudo** — margens,
faturas, o que os outros casais pagaram. É isto que a impede de delegar. As contas
individuais com 2FA já existem; falta o papel, e falta decidir rota a rota **no
servidor** (esconder no ecrã e deixar aberto na API é pior do que não fazer nada).

### 7.4 Receber o sinal no momento do «sim» · médio · ~25 € por sinal de 3.600 €
MB WAY / Multibanco / cartão na página do aceite, com entrada automática no livro.
Hoje a fatura nasce e o dinheiro fica à espera de uma transferência que o casal faz
"amanhã". Depende de conta ifthenpay ou EuPago, e de resolver primeiro o 7.5.

### 7.5 Faturas que a AT aceita · médio · 15–30 €/mês · **DECISÃO SUA E DO CONTABILISTA**
O sistema imprime **"FATURA"** com numeração fiscal própria (`FT 2026/0007`) e
**não tem ATCUD, nem QR, nem certificação** — a pesquisa por `ATCUD` ou `QR` em
todo o código de faturação dá **zero ocorrências**. Acima de 50.000 € de facturação
o software certificado é obrigatório, e a falta de QR são 200 € a 1.000 € **por
fatura**. Isto não é uma funcionalidade em falta: é uma exposição.
*As duas saídas:* deixar de chamar "fatura" a este documento, ou emitir através de
um certificado (InvoiceXpress, Moloni, Vendus) que devolve número, ATCUD, QR e PDF.
A estrutura de dados já está bem modelada para isso.

### 7.6 O dossiê do evento offline · médio
Timeline, checklist, contactos e plano acessíveis numa quinta sem rede. O padrão
difícil já está resolvido e testado para o material.

### 7.7 A primeira versão da resposta, escrita · médio
Um rascunho da resposta e o esqueleto da proposta, a partir do pedido. Aqui a IA
**não inventa preços**: a memória de preços já dá o intervalo e a mediana do que
ela cobrou, e o catálogo tem os serviços. Regra inegociável: nunca envia sozinho.

### 7.8 O mood board que o casal comenta · médio
As imagens já vão na proposta; a conversa sobre elas acontece por WhatsApp, em
bocados, e perde-se. Uma foto marcada com "adorámos" é meia venda de um extra.

### 7.9 Quantos sábados ainda estão por vender · médio
Sábados ocupados e livres por mês da época, com o valor médio de um sábado de Maio.
É a única coisa desta lista que muda decisões de meses, não de dias. Precisa de
dois anos de histórico para valer.

### 7.10 A galeria privada depois do evento · médio
O único momento em que o casal está mais contente com ela do que alguma vez estará
— é aí que se pede o testemunho e a autorização de imagem. **A cláusula de imagem
tem de vir antes da galeria**: os termos actuais têm nove secções e nenhuma sobre
fotografia.

### 7.11 Encomendar aos fornecedores de dentro · médio
O que se esquece nunca é o pedido — é a **confirmação**. Um florista que não
confirmou é uma quinta às sete da manhã sem flores.

### 7.12 Planta de mesas com os convidados · grande
A lista de convidados já cá está. Falta o desenho. **Só depois de tudo o resto** —
é fácil gastar aqui o esforço dos pontos 1 a 5 juntos e ter uma ferramenta bonita
usada duas vezes por ano. Começaria pela versão sem desenho: mesas numeradas,
convidados atribuídos, lista impressa.

---

## O QUE EU NÃO FARIA

**WhatsApp Business API.** Aprovação da Meta, número dedicado que deixa de
funcionar na app normal do telemóvel dela, modelos pré-aprovados, pagamento por
conversa. Para dez a trinta casamentos por ano é montar uma central telefónica para
atender três chamadas. *Em vez disso:* links `wa.me` pré-preenchidos espalhados
pelo back office — o padrão já existe e funciona, custa uma tarde, apanha 90 % do
valor, e a conversa fica no telemóvel dela, que é onde ela a quer.

**Assinatura digital qualificada (Chave Móvel Digital, DocuSign).** Um contrato de
decoração não tem forma legal obrigatória. A assinatura simples que já existe é
admissível. Pagar 20–40 €/mês e obrigar o casal a instalar uma app para assinar é
atrito na única página onde não pode haver atrito: a do "sim". Faça-se o 7.1, que
custa nada.

**Certificar este software junto da AT.** Meses de trabalho e, depois, cada
alteração ao código volta a ser um problema regulatório. Integrar com um
certificado custa 20 €/mês.

**IA a ler faturas de fornecedores.** O volume não justifica, e traz um erro de
leitura silencioso para dentro da contabilidade — o pior sítio para um erro
silencioso.

**Resumir a caixa de entrada com IA.** São poucos emails por dia. Resumir dez
emails que ela lê em cinco minutos é tecnologia à procura de um problema. Escrever
a resposta (7.7) é outra coisa.

**Um portal onde o montador ou o fornecedor faz login.** Ninguém vai fazer login. O
que funciona é um link que abre e mostra o que interessa, com validade.

**RSVP público dos convidados.** É trabalho de wedding planner. Gerir setecentas
respostas é entrar num negócio diferente com um produto pior do que os que já
existem.

---

## O QUE JÁ ESTÁ BEM — e não se toca

Os agentes foram instruídos a reconhecer o que está feito, e a lista é longa. O
essencial:

- **As guardas das 84 rotas estão fechadas**, com um teste que lê a árvore do disco
  e **reprova qualquer rota nova** sem guarda — e prova que nem uma função de
  armazenamento correu antes do 401.
- **O carregamento de ficheiros**: caminho construído no servidor, limites gravados
  no próprio bucket, verificação de bomba de descompressão, buckets privados, lista
  branca anti-SSRF.
- **A reposição da cópia de segurança**: ensaio antes de escrever, cópia do estado
  actual primeiro, contador fiscal que só sobe. Mais cuidado do que a maioria dos
  produtos pagos.
- **A aritmética do dinheiro** onde é feita a sério: o saldo obtém-se por
  subtracção para as parcelas fecharem o total; IVA real da proposta e não um 0,23
  fixo; duplo sinal bloqueado em três camadas, até índice único na base de dados.
- **O ecrã de carregamento de material, offline a sério**: fila persistente,
  resolução por relógio, servido pelo service worker sem rede.
- **Alvos de toque, campos a 16 px, uma só navegação, zero dependência de teclado** —
  o trabalho do `TOUCH-AUDIT` e do `NO-KEYBOARD` está feito e testado no CI.
- **Optimista com reversão e mensagem** em Tarefas, Inventário, Propostas,
  Pagamentos e Custos — o defeito 2.2 dos Fornecedores é a excepção, não a regra.
- **Cache com ETag e deduplicação de pedidos em voo**, `memo()` onde foi medido que
  valia (68 ms por tecla no livro de faturas), e cinco optimizações já descartadas
  **com medição** — que é o que impede alguém de as voltar a tentar.

---

## O que decidir

1. **Faturação** (7.5) — é a única que precisa do contabilista, e a única com
   consequência legal. Nada acontece aqui sem si.
2. **Ordem de ataque** — a minha recomendação está no topo: as cinco de esforço
   pequeno que fecham dinheiro, prova e perda de trabalho.
3. **Delegar** (7.3) — se quer dar acesso a alguém este ano, isto sobe na lista.
4. **Pagamentos online** (7.4) — depende de 7.5 e de abrir conta num prestador.

Duas coisas que pode fazer **hoje, sem eu tocar em nada**: carregar no botão da
cópia de segurança e guardar o ficheiro fora do computador de trabalho; e registar
um segundo aparelho em "Os meus dispositivos".
