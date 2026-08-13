# Ideias para o back office

Levantamento feito por três agentes, um por área, a ler o código e os dados.
Nenhuma destas ideias está implementada. O documento existe para ser julgado.

---

## Aviso sobre os dados: o que foi medido e o que não foi

**Os dados reais do negócio não são acessíveis a partir deste repositório.** Não
existe ficheiro `.env`, apenas `.env.example` com as chaves por preencher. Em
produção o livro vive num Supabase a que os agentes não chegam.

O que existe em `data/` **nunca foi o livro do negócio**. O conteúdo total, em
toda a história do repositório: um pedido de teste ("Maria Teste", estado
`rejeitado`), uma tarefa chamada `fdkljfdfjdklfj`, e dois ficheiros vazios. É o
rasto de quem testou, não de quem trabalha.

Isto tem uma consequência que atravessa o documento inteiro, sobretudo a secção
**Ecrãs mortos**: dá para medir com certeza se um ecrã é **alcançável** (tem
entrada no menu? está na pesquisa? há código que lá chega?), e não dá para saber
se é **usado**. Todas as recomendações de *remover* neste documento assentam em
inalcançabilidade medida no código, nunca em contagens de registos.

**O primeiro passo antes de apagar seja o que for** é um `select count(*)` por
tabela no Supabase. É um minuto de trabalho e fecha a única dúvida que sobra.

Uma nota de calibração para a área dos Temas: a biblioteca de temas tem **dois
dias de vida** (doze commits entre 28 e 30 de Julho). Nada ali pode honestamente
ser classificado como funcionalidade falhada — não houve tempo para nada falhar.
As ideias dessa secção são sobre o que vai doer ao terceiro mês.

---

## Tabela de resumo

| Ideia | Área | Custo | Desvantagem em cinco palavras |
|---|---|---|---|
| Agendar a verificação de e-mail novo | Resto | 15 min (ou meio dia) | Notifica publicidade como se fosse noivos |
| Dizer de que tema veio a foto | Temas | 0,5–1 dia | Ausência passa a ser ambígua |
| Porta para os Fornecedores onde falta | Resto | Meio dia (ou 10 min) | Cria segundo caminho para o mesmo |
| Selecionar todas as visíveis no tema | Temas | 0,5–1 dia | Apagar em massa fica fácil |
| Resumo diário também por e-mail | Resto | 0,5–1 dia | Mais um e-mail para ignorar |
| Cesto que atravessa temas no seletor | Temas | 1–2 dias | Mais estado para se perder |
| Página do noivo com o que compra | Propostas | 1 dia | Dois desenhos, informação duplicada |
| Gravar o documento da proposta | Propostas | 1–2 dias + SQL | Propostas antigas ficam sempre incompletas |
| Apagar os Modelos de e-mail | Resto | Meio dia | Perde liberdade que nunca teve |
| Histórico do cliente dentro do pedido | Resto | 1–2 dias | Confunde clientes que mudaram e-mail |
| Guardar o nome do ficheiro | Temas | 2–3 dias | Inútil se nomes forem lixo |
| Começar proposta a partir de outra | Propostas | 2–3 dias, depende | Propostas convergem, deixam de personalizar |
| Link do portal no e-mail | Propostas | 0,5–1 dia | Expõe facturas sem contexto nenhum |
| Calendário subscrito, não descarregado | Resto | 2–3 dias | Endereço partilhado impossível de recolher |
| Levar um tema para o disco | Temas | 2–3 dias | Botão permanente para gesto raro |
| Versões numeradas da proposta | Propostas | 2–3 dias, depende | Links antigos deixam de funcionar |
| Etiquetas nas fotos | Temas | 5–8 dias | Cria índice que pode dessincronizar |

---

# 1. Temas

### 1.1 Um cesto que atravessa temas

**Problema.** Para montar o mood board de um casamento de Outono ela quer quatro
fotos de "Terracotta", três de "Itália" e duas de "Branco & Verde". Abre o
seletor, escolhe as quatro, carrega em "Adicionar" — e o diálogo fecha sozinho.
Volta a abrir, muda para Itália, e a mudança de tema **apaga a seleção**. Três
voltas, três carregamentos da grelha, e em nenhum momento vê as nove fotos
juntas. A decisão que está mesmo a tomar — "estas nove combinam?" — é a única
que o ecrã nunca lhe deixa ver.

**Proposta.** Um cesto no fundo do seletor que sobrevive à mudança de tema, com
as miniaturas em fila. Fecha quando ela mandar, e leva tudo de uma vez.

**Custo.** 1 a 2 dias, num ficheiro só (`ThemePicker.tsx`). A rota que copia as
fotos já aceita caminhos de temas diferentes no mesmo pedido — está feita e
ninguém a usa. O que dá trabalho é o Shift+clique e a navegação por teclado, que
assumem que a seleção corresponde à grelha à vista; se isso correr mal, o
Shift+clique passa a apanhar fotos de outro tema que ela nem vê.

**Desvantagem.** O cesto é trabalho que se pode perder: fechar com nove fotos lá
dentro obriga a um aviso, e um aviso é mais um clique. O diálogo passa a ter três
zonas dentro de uma janela que já ocupa 90% do ecrã num portátil — e a que fica
espremida é a grelha, que é onde ela precisa de ver.

### 1.2 Dizer de que tema veio cada foto

**Problema.** Três semanas depois de enviar, a noiva responde: "adorei a terceira
foto do segundo mood board, têm mais assim?". Hoje ela olha para a foto e tem de
a **reconhecer de olho** para se lembrar de que tema veio. Com oito temas de mil
fotos, é um jogo de memória — e o programa já sabe a resposta e não a mostra.

**Proposta.** Cada foto vinda da biblioteca passa a dizer de onde veio, com um
botão "Ver mais deste tema".

**Custo.** Meio dia a um dia. A informação **já está guardada**: o estúdio grava
o caminho de origem de cada foto importada. Falta só o nome do tema, que se
obtém de uma rota que já existe. Cuidado com as propostas anteriores a isto, que
não têm essa memória — a ausência tem de aparecer como "não se sabe".

**Desvantagem.** Mais uma etiqueta num cartão já cheio. E cria uma ambiguidade:
as fotos carregadas à mão nunca terão etiqueta, portanto "sem etiqueta" passa a
querer dizer duas coisas — "carreguei-a eu" e "isto é antigo".

### 1.3 Selecionar todas as visíveis dentro de um tema

**Problema.** Ela larga 300 fotos da quinta com o tema "Itália" aberto e a meio
percebe que era para "Quinta do Lago". Para corrigir: carregar cinco vezes em
"Mostrar mais", clicar na primeira, Shift+clicar na última, e rezar para não
apanhar pelo meio as que já lá estavam. **O seletor de propostas tem um botão
"Selecionar todas as visíveis"; o ecrã do tema não tem** — existe no sítio onde
faz menos falta e falta no sítio onde faz mais.

**Proposta.** O mesmo botão no tema, mais um "Selecionar as que acabaram de
subir" logo a seguir a um carregamento.

**Custo.** Meio dia a um dia, só em `Temas.tsx`. O ecrã já sabe quais foram as
fotos daquele arrasto; essa lista é que é apagada demasiado cedo.

**Desvantagem.** Um "Selecionar todas" ao lado de um "Remover" vermelho é apagar
sessenta fotos com dois cliques. Ou se põe confirmação — e confirmações são o
que torna um ecrã lento quando ela está a arrumar a sério — ou se aceita o risco.

### 1.4 Guardar o nome original do ficheiro

**Problema.** "Itália" tem 1200 fotos. Ela sabe que lá está o arco de eucalipto
do casamento da Rita. Para o encontrar: abrir o tema e carregar em "Mostrar mais"
vinte vezes, a olhar. **Não há procura dentro de um tema** — e não pode haver,
porque no momento em que a foto sobe o nome original é deitado fora.

**Proposta.** Guardar o nome original ao lado do resumo, e um campo de procura
dentro do tema e do seletor.

**Custo.** 2 a 3 dias. Mexe no nome com que as fotos são escritas, na validação
dos caminhos e na leitura do resumo — que é o guarda da detecção de repetidas.
**É aqui que pode partir feio:** se o resumo deixar de ser lido, a detecção de
repetidas deixa de funcionar em silêncio e ela volta a ter tudo a dobrar.

**Desvantagem.** **Isto pode não valer nada.** Só ajuda se os nomes dos ficheiros
dela quiserem dizer alguma coisa; se vierem do Pinterest e do telemóvel,
chamam-se `IMG_4821.JPG` e a procura devolve lixo. **Vale a pena perguntar-lhe
antes de escrever uma linha.** E as fotos já carregadas ficam sem nome para
sempre, portanto a procura arranca com metade da biblioteca invisível.

### 1.5 Levar um tema inteiro para o disco

**Problema.** Para ter as fotos no disco externo — o que fazia naturalmente
quando viviam em pastas — tem de abrir cada tema, carregar em "Mostrar mais" até
ao fim, seleccionar e transferir, tema a tema. E há uma coisa a dizer com todas
as letras: **a cópia de segurança guarda os nomes e as notas dos temas, mas não
guarda as fotos.** Se o Supabase se perder, sobrevivem oito nomes e nem uma
fotografia.

**Proposta.** Um botão que junta as fotos do tema num ficheiro comprimido.

**Custo.** 2 a 3 dias, mais delicado do que parece. Um tema de 3000 fotos são
uns 8 GB: não cabe na memória de uma função de servidor nem nos 60 segundos que
estas rotas têm. Ou se faz no navegador aos poucos, com a janela obrigada a ficar
aberta, ou por lotes.

**Desvantagem.** É a ideia menos usada da lista — pode ser feita uma vez por ano
ou nunca — e acrescenta um botão permanente por causa de um gesto raro. E se o
objectivo real é seguro contra perda, **provavelmente não é isto**: é uma cópia
automática do bucket, que não é trabalho deste ecrã.

### 1.6 Etiquetas nas fotos

**Problema.** O mesmo de 1.4 — encontrar o arco em 1200 fotos — resolvido pelo
lado certo: ela marca as fotos com as palavras que usa mesmo ("mesa", "arco",
"flores"), e montar a proposta passa a ser "Terracotta + mesa" em vez de vinte
cliques em "Mostrar mais".

**Proposta.** Etiquetas aplicáveis a um conjunto de fotos, e filtro por etiqueta.

**Custo.** **5 a 8 dias, e é o mais caro por uma razão de fundo.** Todo o desenho
desta biblioteca assenta numa decisão escrita em `docs/temas.md`: a pasta é a
única fonte de verdade, não há lista na base de dados que possa dessincronizar.
Etiquetas obrigam a essa segunda lista, que tem de ser limpa ao apagar uma foto,
ao apagar um tema, e levada junto ao copiar ou mover — quatro sítios, e falhar um
deixa etiquetas agarradas a fotos que já não existem.

**Desvantagem.** No primeiro dia tudo está sem etiqueta, portanto o filtro parece
avariado; para não parecer, ou se etiqueta no carregamento (que o torna mais
lento) ou ela arruma mil fotos à mão numa tarde. E etiquetas escritas à mão
dividem-se sozinhas ("flor", "flores", "Flores") a menos que se force uma lista
fechada — que é liberdade que se lhe tira.

---

# 2. Propostas

### 2.1 A página onde o noivo decide não diz o que ele está a comprar

**Problema.** O noivo abre a proposta, vê o cabeçalho "Descrição / Quantidade /
Valor", **nada por baixo**, e depois o total. A proposta bonita — capa, mood
boards, serviços — só existe no anexo, e a página não tem sequer uma ligação para
ela.

> A tabela vazia já foi corrigida (o cabeçalho deixou de aparecer sem linhas).
> Falta a outra metade: a página continua a não dizer o que está a ser comprado.

**Proposta.** Mostrar nessa página o resumo que já está no documento — evento,
data, local, grupos de serviços, o que está incluído — e um botão para o PDF.

**Custo.** 1 dia. Toca na página e nos dois dicionários (esquecer o inglês
rebenta em compilação). O botão do PDF depende de 2.2; o resto não depende de
nada. É a página mais cara de partir do produto todo.

**Desvantagem.** Passam a existir dois desenhos da mesma página decididos por um
`if`, e duplica-se no HTML informação que já está no PDF: mudar o texto dos
serviços passa a ser dois sítios a rever. Se os dois divergirem, discute-se qual
vale.

### 2.2 O que foi enviado ao cliente não fica guardado

**Problema.** Três semanas depois, o noivo pede que reenviem a proposta. Ela não
tem de onde a ir buscar: o PDF só existe no anexo que saiu, e o botão do portal
**nunca aparece**. O mesmo quando é preciso mudar uma linha e reenviar.

**Custo.** 1 a 2 dias. **Exige que alguém corra SQL no Supabase** — não é só
publicar código. Os testes que hoje *afirmam* que a coluna não existe têm de ser
invertidos, não apagados.

**Proposta.** Gravar o documento da proposta. O código já o monta e já o passa;
perde-se na gravação.

**Desvantagem.** As propostas já enviadas **nunca** o terão: não há como
reconstruí-lo, portanto metade da lista comporta-se de uma maneira e metade de
outra, para sempre. E cria uma segunda cópia da verdade ao lado do rascunho, com
a pergunta permanente de qual manda.

### 2.3 Link do portal no e-mail da proposta

**Problema.** Para o noivo poder acompanhar o contrato e as facturas, ela tem de
ir ao dossier, copiar o link, abrir o e-mail e colar. Nenhum e-mail do sistema o
contém.

**Proposta.** Juntar a ligação ao e-mail que já sai com a proposta.

**Custo.** Meio dia a um dia.

**Desvantagem.** Passa a haver dois links privados no mesmo e-mail, com sentidos
diferentes, e quem reencaminha reencaminha os dois. O portal mostra facturas e
valores: ela passa a ver uma factura em atraso no minuto em que é emitida, sem
contexto nenhum.

### 2.4 Começar uma proposta a partir de outra

**Problema.** Para fazer a proposta seguinte recomeça-se do zero — grupos de
serviços, itens, linhas adicionais — mesmo quando 80% é igual à do mês passado.

**Proposta.** Escolher uma proposta anterior e abrir com o texto já preenchido.

**Custo.** 2 a 3 dias. **Depende inteiramente de 2.2.** As fotos são o caso
complicado: copiar caminhos faz duas propostas apontarem para os mesmos
ficheiros, e apagar uma pode partir a outra. O mais seguro é copiar só o texto —
o que reduz bastante o valor.

**Desvantagem.** Reutilizar faz as propostas convergirem: ao fim de um ano todas
dizem o mesmo, porque ninguém reescreve o que já vem preenchido, e a proposta
deixa de parecer feita para aquele casal — que é o que a distingue. O erro mais
provável é seguir um serviço que ficou do casamento anterior.

### 2.5 Versões numeradas

**Problema.** Quando o casal pede uma alteração e ela reenvia, o sistema cria uma
proposta nova com um link novo. Passado um mês há três linhas do mesmo casamento,
todas com totais diferentes, e nada diz qual vale nem qual é a que o noivo tem
aberta. Os links antigos continuam a aceitar.

**Proposta.** Numerar (v1, v2), marcar as anteriores como substituídas.

**Custo.** 2 a 3 dias, **depende de 2.2**. Risco alto: mexe no caminho do aceite,
que emite contrato, sinal e factura numa só transacção.

**Desvantagem.** Invalidar links antigos é irreversível e vai morder: o casal que
carrega no e-mail de há duas semanas vê um erro e liga a perguntar. E obriga a
decidir o que fazer quando alguém aceita a v1 enquanto a v2 está a ser escrita.

---

# 3. Resto do back office

### 3.1 O e-mail do noivo chega e ela só dá por ele dias depois

**Problema.** Um noivo responde na terça à tarde. Ela está a montar um evento sem
o Gmail aberto. Existe uma rota escrita, testada e a funcionar que verifica a
caixa e avisa o telemóvel. **Essa rota nunca corre** — não está no horário
automático. Ela responde na sexta.

**Proposta.** Agendá-la a cada 15 ou 30 minutos. A rota já trata do resto.

**Custo.** Três linhas, 15 minutos. **Duas condições podem transformar isto num
dia:** o IMAP tem de estar configurado (se não estiver, a rota não faz nada, em
silêncio), e o plano da Vercel tem de permitir mais do que uma tarefa agendada —
no gratuito o mínimo é uma vez por dia, o que estraga a ideia.

**Desvantagem.** Passa a chegar uma notificação por cada e-mail, incluindo
publicidade e facturas da electricidade. A rota não distingue um noivo de uma
newsletter. Ao fim de duas semanas ela desliga as notificações e perde também o
resumo diário.

### 3.2 A lista de fornecedores está sempre vazia

**Problema.** Ela abre um evento, vai registar quanto vai pagar ao florista, e
encontra um campo "Do diretório de fornecedores" com uma lista pendente vazia —
e que vai estar vazia para sempre. O ecrã onde se escrevem os fornecedores foi
retirado do menu, não está na pesquisa, e o único caminho que sobrou é um atalho
de teclado escondido. **A funcionalidade está viva e a ser consumida; o que foi
cortado foi a única porta para lá pôr dados.**

**Proposta.** Um botão "Gerir fornecedores" ao lado da lista vazia, no sítio onde
a falta se sente — em vez de devolver o destino ao menu, que ela pediu curto.

**Custo.** Meio dia. (Devolver ao menu são 10 minutos.)

**Desvantagem.** Cria um segundo sítio onde se editam fornecedores, e daqui a um
ano alguém pergunta porque há dois caminhos para a mesma coisa.

### 3.3 O resumo da manhã pode estar a ser deitado fora

**Problema.** Às 07:00 o sistema conta os eventos dos próximos três dias, os
pagamentos a vencer, os pedidos por responder e os seguimentos de hoje — e manda
tudo **exclusivamente** por notificação do browser. Se ela nunca autorizou, se
disse "bloquear" à pressa, se mudou de telemóvel ou limpou o browser, o resumo é
calculado todos os dias e **deitado fora em silêncio**. Ela chega às 9h sem saber
que há uma factura vencida há dez dias.

**Proposta.** Enviar o mesmo resumo também por e-mail.

**Custo.** Meio dia a um dia.

**Desvantagem.** Mais um e-mail por dia na caixa que já é o centro nervoso do
negócio, e que é onde as coisas se perdem. Um resumo que diz "nada a assinalar"
200 dias por ano ensina a apagar sem ler, e no dia em que diz algo importante já
ninguém o abre.

### 3.4 Apagar os Modelos de e-mail

**Problema.** Existe um ecrã inteiro com editor, campos de substituição e tabela
própria. Se ela lá chegar, editar o texto do e-mail "Proposta enviada" e gravar,
o botão diz que gravou. **E não muda absolutamente nada.** A função que aplica os
modelos não é chamada por nenhum código de produção — os sete sítios que enviam
e-mail têm o texto escrito à mão lá dentro.

**Proposta.** Apagar o ecrã, a rota e o store.

**Custo.** Meio dia a apagar. **Ligar a sério seriam 3 a 5 dias** e é pior do que
parece: cada um dos sete caminhos monta um HTML diferente, alguns com anexos, e é
preciso decidir o que acontece quando ela apaga um `{link}` que era obrigatório —
o cliente recebe um e-mail sem forma de aceitar a proposta.

**Desvantagem.** Tira-lhe uma liberdade que, no papel, é apetecível. Se daqui a
seis meses quiser mesmo isso, o trabalho é feito de novo do zero.

### 3.5 Saber se já trabalhou com este cliente

**Problema.** Chega um pedido de um "João Silva" e ela tem a sensação de já lhe
ter feito o batizado da filha — o que muda a conversa e muda o preço. Existe um
ecrã que faz exactamente isso: junta os pedidos pelo mesmo e-mail ou telefone,
soma o que já foi ganho, marca VIP. **Nenhum botão no back office o abre.**

**Proposta.** Uma linha no topo do pedido: "este cliente já teve 3 pedidos, 2
ganhos, 8.400 €", que abre o ecrã nesse cliente.

**Custo.** 1 a 2 dias. A conta está escrita dentro do ecrã e teria de ser
extraída para um sítio partilhado — é refactoring a sério, não é copiar.

**Desvantagem.** A agregação é por e-mail, telefone ou nome. Casais que mudam de
e-mail entre o casamento e o batizado ficam como duas pessoas, e a linha vai
dizer "primeiro pedido" a um cliente antigo — **pior do que não dizer nada,
porque parece informação e não é.**

### 3.6 Calendário subscrito em vez de descarregado

**Problema.** Ela exporta um evento para o telemóvel. Três semanas depois os
noivos adiam de 12 para 19 de Setembro. Ela muda no back office. **O telemóvel
continua a dizer 12.** O ficheiro é uma fotografia do momento, não uma ligação.

**Proposta.** Uma morada de subscrição que devolve os eventos sempre
actualizados.

**Custo.** 2 a 3 dias, e não convém arredondar para baixo. O gerador já existe; o
resto é novo — um token não adivinhável, uma forma de o revogar, e sobretudo
identificadores estáveis entre pedidos, senão o telefone apaga e recria tudo a
cada sincronização e ela perde os alertas que tiver posto. **Abre uma porta
pública para os nomes e locais dos clientes protegida só por um token**, o que é
uma decisão de segurança, não uma funcionalidade.

**Desvantagem.** Um endereço destes, uma vez copiado para um telemóvel, é
praticamente impossível de recolher. Telemóvel perdido ou vendido, os eventos
continuam a ser servidos até alguém revogar.

---

# 4. Ecrãs mortos

Classificação assente em **inalcançabilidade medida no código**, não em contagens
de registos. Ver o aviso no topo.

### Caixa de entrada — NUNCA FOI DESCOBERTA · **remover**

Os três componentes só se importam uns aos outros; mais ninguém no repositório os
menciona. Não há entrada no menu, nem atalho, nem registo de carregamento. As
cinco rotas de servidor têm **zero** consumidores. Não foi tentada e abandonada:
**nunca chegou a ser ligada.**

São ~2650 linhas com testes que correm em cada alteração, num back office que já
tem um ficheiro de 3300 linhas. E expô-la significaria pedir-lhe que lesse e-mail
dentro do back office em vez do Gmail — ninguém ganha essa competição.

**Excepção que não é detalhe:** lá dentro há uma peça que vale por si e não
precisa de interface — a verificação que avisa o telemóvel quando entra correio
novo (ideia 3.1). **Manter e agendar essa**, apagar o resto.

### Modelos de e-mail — NUNCA FOI DESCOBERTA, e nunca esteve ligada · **remover**

Inalcançável por qualquer caminho. E expor não resolveria nada: seria dar-lhe um
editor que grava com sucesso e não muda nenhum e-mail. Isso é pior do que não ter
ecrã — é uma promessa falsa que ela descobriria através de um cliente.

### Inventário — NUNCA FOI DESCOBERTA · **perguntar antes de decidir**

Inalcançável, e ao contrário dos Fornecedores não é consumido por nada. São 767
linhas de uma lista isolada.

**A reserva:** uma empresa que aluga arcos, castiçais e viaturas **tem** stock, e
saber o que está onde é um problema real. Não é que a ideia seja má — é que esta
execução não serve, porque uma lista que não fala com os eventos não responde à
única pergunta que interessa: "no sábado 12 tenho estes castiçais livres?".
**Perguntar-lhe se controla adereços em papel ou numa folha.** Se sim, merece ser
refeito ligado aos eventos (uma semana). Se não, apagar.

### Fornecedores — nem uma coisa nem outra · **expor** (ideia 3.2)

Foi descoberta, **é usada por outro ecrã**, e foi escondida por engano. É o
equivalente a tirar a porta da despensa e deixar a receita a dizer "vá buscar a
farinha à despensa".

### Clientes — NUNCA FOI DESCOBERTA · **expor, mas não pelo menu** (ideia 3.5)

Está a meio caminho: tem atalho de teclado e está documentado. Mas um atalho
escondido atrás de `?` não é uma porta para quem não é programadora.

### Botão do PDF no portal do cliente — **nunca pôde aparecer**

Nem falhou nem foi por descobrir. Está no sítio certo, no ecrã certo, com o texto
certo — e a condição que o mostra é sempre falsa, porque o documento da proposta
nunca sobrevive à gravação em produção. Em desenvolvimento funciona, o que
explica como passou. **Expor via 2.2.** Não remover: o código do servidor está
correcto e testado.

### Ordenar fotos à mão (arrastar) — indescoberta, e cobra renda escondida

Existe ordenação manual completa, com coluna própria na base de dados. **Não há
nada que diga que se pode arrastar.** E a partir do momento em que um tema tem
ordem manual, ele fica permanentemente mais lento a abrir, sem aviso e sem forma
óbvia de desfazer. Um arrasto acidental basta. **Expor com um "Voltar à ordem
normal"** — meio dia, resolve as duas coisas.

### Deixar estar

Kanban, Seguimentos, Estatísticas, Facturas, Contratos e Temas estão no grupo
"Mais", alcançáveis e na pesquisa. Não são ecrãs mortos, e **não há como saber
daqui se ela os usa**.

---

# 5. O que eu não faria

**Reconstruir a caixa de entrada com interface.** Estão 2650 linhas escritas e
testadas, mas ela tem o Gmail com pesquisa, filtros e anexos melhores do que
qualquer coisa feita aqui. Um cliente de e-mail meio bom dentro do back office é
pior do que um bom fora dele, e é mais uma coisa a manter para sempre.

**Sincronização nos dois sentidos com o Google Calendar.** Uma a duas semanas:
autenticação, credenciais que caducam sem avisar, e decidir quem ganha quando os
dois lados mudam a mesma coisa. Sincronizações bidireccionais falham em silêncio.
A subscrição num só sentido resolve 80% por 15% do custo.

**Contas separadas para a equipa.** A autenticação é uma palavra-passe única
partilhada; mudar isso mexe em todas as rotas. Uma semana, com risco de a fechar
fora do próprio back office, para um problema que só existe se houver mais gente
lá dentro.

**Uma vista de "dia do evento" para o telemóvel.** Já existe: a impressão do
dossier e do guião fazem exactamente isso, e um papel no bolso funciona numa
quinta no Alentejo sem rede melhor do que qualquer ecrã.

**Pré-visualização da proposta em HTML no back office.** Obriga a manter um
segundo desenhador ao lado do que gera o PDF. Os dois divergem em três meses e
ela passa a confiar numa pré-visualização que mente — exactamente a classe de
problema que já a magoou.

**Partir o ficheiro do estúdio de propostas em componentes.** 2045 linhas
desconfortáveis de ler, mas a funcionar, cheias de comentários que explicam
decisões pagas com defeitos reais. Nenhuma tarefa dela fica melhor no fim.

**Lembretes automáticos de propostas a expirar.** O módulo de Seguimentos já
existe e é o sítio deste trabalho. Um segundo mecanismo dá dois sítios a desligar
quando ela se fartar dos avisos.

**Comentários do cliente na proposta.** Cria um canal de conversa fora do e-mail,
que é onde ela responde de facto — e passa a haver mensagens de noivos num sítio
que ninguém abre.

**Detectar fotos repetidas entre temas.** A mesma mesa fotografada em Itália deve
mesmo estar nos dois temas: um tema é uma etiqueta, não uma gaveta exclusiva.
Avisar seria o programa a discutir com ela uma decisão que é dela.

**Contagem exacta nos cartões dos temas em vez de "500+".** O "500+" existe
porque contar a sério faria a lista de temas demorar a abrir, e essa é a que ela
abre mais vezes. Trocar velocidade de todos os dias por um número consultado uma
vez por mês é mau negócio.

**Pastas dentro de temas.** Uma árvore é uma coisa que se arruma para sempre.
Etiquetas resolvem o mesmo por menos, porque uma foto pode ter três etiquetas e
não pode estar em três pastas.

**Uma capa automática "inteligente".** Ela já pode escolher a capa, e escolher é
melhor: a capa é como ela reconhece o tema, e uma capa que muda sozinha é a única
coisa pior do que uma capa feia.

---

# 6. O que não vale a pena

Três ideias deste documento provavelmente não compensam, e é melhor dizê-lo do
que enfeitá-las:

**1.4 (guardar o nome do ficheiro)** depende inteiramente de uma pergunta que
ainda ninguém lhe fez: os teus ficheiros têm nomes que dizem alguma coisa? Se
vierem do Pinterest e do telemóvel, isto não vale nada.

**1.5 (levar um tema para o disco)** não é bem um problema deste ecrã — é um
problema de cópias de segurança disfarçado de botão. A resposta certa é uma cópia
automática do bucket.

**2.5 (versões numeradas)** é caro, mexe no caminho que emite contratos e
facturas, e resolve um problema que ela talvez ainda não tenha. Confirmar com ela
que reenvia propostas com frequência antes de considerar.

E **2.4 (começar a partir de outra)** tem o custo mal disfarçado: sem resolver a
partilha de fotos entre propostas, entrega bastante menos do que promete.
