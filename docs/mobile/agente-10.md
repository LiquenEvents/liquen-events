# Agente 10 — Classificação de tarefas

Este back office tem, na verdade, **dois back offices lá dentro**, e só um deles é que tem
alguma coisa a fazer numa quinta. O primeiro é o back office de **escrever**: o Estúdio de
propostas, o editor de serviços, os mood boards, os modelos de email, as definições, a
importação de CSV. São tarefas de meia hora a duas horas, com dezenas de campos, decisões que
se tomam com o preço à frente e o cliente ao telefone, e quase sempre sentada. O segundo é o
back office de **saber e marcar**: quem é o casal de sábado, a que horas chega o florista, o
que falta na carrinha, o sinal que entrou por MB Way, a tarefa que ficou feita. São tarefas de
dez segundos, de pé, com uma mão, e são precisamente as que hoje só existem em condições **num
único ecrã** — o `carregamento/[eventId]`, que é o único caminho do back office que o service
worker deixa abrir sem rede (`public/sw.js:184-196`). A divisão natural não é «o que cabe a
390 px»: é **quem escreve vai ao computador, quem precisa de saber leva o telemóvel**. E a
consequência prática, que é o que este relatório existe para dizer, é que boa parte do esforço
de adaptação que os outros nove agentes vão propor cai do lado errado dessa linha — aperfeiçoar
para o polegar um formulário de quarenta campos que ela nunca vai preencher de pé é trabalho
que não muda o dia dela.

Há um sinal no próprio repositório de que esta leitura já foi feita uma vez e ficou a meio: o
`Carregamento`, o `ModoDeCarga` e a `CuradoriaDeFotos` estão escritos com a régua certa (linha
inteira como alvo, 56 px, `localStorage` primeiro, fila de saída, gestos), e tudo à volta deles
não. **A dívida aqui não é de CSS: é de decidir o que é que cada tarefa é.**

---

## Tabela mestra

| Tarefa | Ecrã | Classificação | Porquê | O que o telemóvel mostra |
|---|---|---|---|---|
| Entrar no back office | `AdminLogin.tsx` | **Mobile nativo** | Um gesto. A passkey com `mediation:"conditional"` (`AdminLogin.tsx:259-260`) é Face ID no iPhone — é ali que ela é melhor que no computador. | — |
| Registar a passkey deste telemóvel | `PasskeysDialog.tsx` | **Mobile nativo** | Só se pode fazer NO aparelho que se quer registar. É a única tarefa que é impossível no computador. | — |
| Ver o painel do dia (funil, próximo evento, agenda) | `Overview.tsx` | **Mobile nativo** | Leitura pura, cinco números e uma lista. É o primeiro ecrã de quem abre o telemóvel no carro. | — |
| Editar a meta de receita | `Overview.tsx:594` | Consulta | Um número que se mexe uma vez por ano. | O valor e a percentagem atingida. «A meta define-se no computador — aqui é para ver onde vais.» |
| Escrever notas da equipa | `Overview.tsx:789-833` | Consulta | Texto livre longo, escrito devagar. Ler no local é útil; escrever não. | As notas em texto corrido. «Lê-se aqui, escreve-se no computador.» |
| Responder «ganhámos ou perdemos?» | `PerguntaDeDesfecho.tsx` | **Mobile nativo** | Duas hipóteses, um toque. Chega quando ela está longe da secretária. | — |
| Percorrer e filtrar a lista de pedidos | `AdminClient.tsx` (`pedidos`) | **Mobile nativo** | Procurar um nome é a coisa mais feita no telemóvel. Já há `TabelaOuCartoes` para isto. | — |
| Ler um pedido (contacto, evento, notas) | gaveta do pedido | **Mobile nativo** | É a razão de ela abrir o telemóvel. O número de telefone tem de ser tocável. | — |
| Editar a gestão do pedido (9 campos + estado) | `AdminClient.tsx:4640-4700` | Desktop | Estado, preço, data, convidados, local, nome, email, telefone, tags, seguimento — e uma barra «Guardar alterações» que já se perdeu abaixo da dobra num 1440×900 (`AdminClient.tsx:1071-1080`). | Os mesmos campos em leitura, mais «Mudar o estado» sozinho. «Isto é a ficha inteira do pedido — mexe-lhe no computador. Aqui podes mudar o estado e pouco mais.» |
| Mudar só o estado de um pedido | idem | **Mobile nativo** | Uma escolha entre cinco. | — |
| Ajustar preço e sinal | `ProposalStudio.tsx:7738-7995`, `AdminClient.tsx:4656-4700` | **Consulta** (ver secção própria) | Dois números pequenos com quatro números derivados atrás deles. | Ver secção própria. |
| Criar um pedido novo | `NewQuoteModal.tsx:176-270` | Consulta / parcial | Onze campos. Mas o caso real — «ligou uma noiva enquanto montava» — precisa de três. | Uma versão curta: nome, telefone, data. «Fica o essencial; o resto preenche-se depois no computador.» |
| Registar uma chamada no histórico | `ActivityLog.tsx`, `CommsZone.tsx` | **Mobile nativo** | Uma linha de texto, logo a seguir ao telefonema. Já trata a recusa do servidor à vista (`DossierClient.tsx:160-190`). | — |
| Selecção múltipla + acções em massa | `AdminClient.tsx` (`selectedIds`, `bulkBusy`) | Desktop | Selecção de N linhas para uma acção irreversível. De pé, é onde se apaga o pedido errado. | Nada. A selecção múltipla simplesmente não aparece abaixo de 640 px. |
| Exportar CSV | `export.ts` | Desktop | O ficheiro vai para um sítio de onde não se faz nada no iPhone. | «Exportar é no computador — é lá que o ficheiro serve para alguma coisa.» |
| Consultar o evento do dia | `evento/[id]` | **Consulta** (ver secção própria) | — | Ver secção própria. |
| Marcar tarefas do evento | `EventTasks.tsx` | **Mobile nativo** | Riscar. É a operação de dez segundos por excelência. | — |
| Marcar a checklist do evento | `EventChecklist.tsx` | **Mobile nativo** para marcar, Desktop para editar | Marcar é um toque; escrever itens novos e apagar concluídos é outra tarefa. Já é otimista com reversão certa (`EventChecklist.tsx:24-35`). | Marcar sim; «+ item» e «limpar concluídos» ficam para o computador. |
| Escrever o plano de produção (atelier) | `ProductionPlan.tsx` | Desktop | Planeia-se antes, não durante. | O plano em leitura, por fases. «O plano faz-se no computador — aqui é para o seguir.» |
| Escrever o cronograma do dia | `EventTimeline.tsx` | Desktop | Horas + descrições, dezenas de linhas. | O cronograma em leitura, com a hora a seguir destacada. Ver secção «evento do dia». |
| Lista de convidados | `GuestList.tsx` | Desktop | Tabela de nomes, mesas, restrições. Editar isto de pé não acontece. | Contagem e mesas em leitura. «A lista abre-se aqui para consultar; alterá-la é no computador.» |
| Ver as escolhas do casal | `EscolhasDoCasal.tsx` | **Mobile nativo** | É a pergunta que ela traz do telefonema. Leitura curta. | — |
| Gerar / rever a checklist de material | `EventMaterial.tsx` | Desktop | «Aqui é onde se prepara» — está escrito no próprio ficheiro (`EventMaterial.tsx:18`). | O total e os críticos, e o botão «Abrir para carregar». |
| **Ver a checklist da carrinha** | `carregamento/[eventId]/Carregamento.tsx` | **Mobile nativo** | Ver secção própria. | — |
| Modo de carga do inventário | `ModoDeCarga.tsx` | **Mobile nativo** | Já está escrito com a régua certa e diz em que aparelho vive (`ModoDeCarga.tsx:240-243`). | — |
| Registar um pagamento / sinal recebido | `PaymentsPanel.tsx` | **Mobile nativo** | Tipo, valor, método, data de hoje. Quatro campos e acontece quando o MB Way apita. | — |
| Escrever custos e fornecedores do evento | `EventCosts.tsx` | Desktop | Tabela de custos com IVA dedutível. Nada disto se decide de pé. | Custos totais e margem em leitura. |
| Ver a margem | `MetricStrip.tsx` | Consulta | Cinco números derivados. Já responde a 2 colunas a 390 px (`MetricStrip.tsx:77`). | — |
| Escolher para quem se faz a proposta | `FazerProposta.tsx` | Consulta | O primeiro passo é escolher; o resto do ecrã é o Estúdio. Sozinho não vale nada. | A lista dos pedidos que esperam proposta, ordenada por urgência. «Aqui vês quem espera proposta. Escrevê-la é no computador.» |
| Escrever o conteúdo da proposta (Evento, Capas, Serviços) | `ProposalStudio.tsx:5664-7727`, `ServicesEditor.tsx` | Desktop | «É o ecrã mais escrito da casa: dezenas de linhas por proposta, muitas vezes com o cliente ao telefone» — `ServicesEditor.tsx:28-31`. A régua declarada é o teclado. | Um resumo do que já lá está e em que passo ficou. «A proposta está a meio e guardada. Continua-a no computador — é lá que o teclado ajuda.» |
| **Montar 7 páginas de mood board com 46 fotos** | `ProposalStudio.tsx:5991-6400`, `ThemePicker.tsx` | **Desktop** | Ver secção própria. | Ver secção própria. |
| Escolher/curar fotos uma a uma | `CuradoriaDeFotos.tsx` | **Mobile nativo** | «Direita inclui, esquerda salta, cima abre em ecrã inteiro» (`CuradoriaDeFotos.tsx:29-33`). Isto é um ecrã de telemóvel escrito por engano dentro de um ecrã de computador. | — |
| Escolher o layout de uma página | `PreviaDaPagina.tsx` | Consulta | Ver a página como sai é útil em qualquer ecrã; escolher entre arranjos exige comparar. | A folha desenhada, para ver. |
| **Rever o PDF antes de enviar** | `ProposalStudio.tsx:4780-4875` | **Desktop** | Ver secção própria. | Ver secção própria. |
| Passar os olhos na Conferência | `Conferencia.tsx` | Consulta | Lista de vistos e reparos, cada linha com um botão que leva ao campo — e o campo é que é desktop. | A lista, para ler. Os botões «ir ao sítio» ficam. |
| Escrever/rever o email do envio | `EmailDoEnvio.tsx` | Desktop | Assunto, corpo, nome do ficheiro, e a confirmação do anexo. | O assunto e as primeiras linhas. |
| Enviar a proposta ao cliente | `ProposalStudio.tsx` (passo 3) | **Desktop** | Irreversível, 60 s de rota (`proposta-doc/route.ts:116`), e a rede da quinta é exactamente a que não aguenta. | «O envio é de uma vez só e demora até um minuto de rede boa. Faz-se no computador — daqui era pedir azar.» |
| Falar com o cliente (mensagem curta) | `ClientMessenger.tsx` | **Mobile nativo** | Escolher um modelo e mandar. É uma mensagem, não um documento. | — |
| Ver a lista de propostas e o estado | `Propostas.tsx` | **Mobile nativo** | Cinco estados, uma cor cada. «Gerada, por enviar» é âmbar de propósito, é a linha que pede alguma coisa hoje (`Propostas.tsx:14-40`). | — |
| Marcar uma proposta aceite / recusada | `Propostas.tsx` | **Mobile nativo** | Uma decisão, um toque, e chega muitas vezes por telefone. | — |
| Copiar o link da proposta | `Propostas.tsx` | **Mobile nativo** | Copiar e colar no WhatsApp é uso de telemóvel puro. | — |
| Ver Propostas Aceites | `Contratos.tsx` | Consulta | Tabela de datas e estados. | A lista em cartões. «Aqui é para ver quem já assinou.» |
| Ver estatísticas | `StatsDashboard.tsx` | Consulta | Gráficos. Lêem-se, não se mexem. | Os três números do mês. «Os gráficos ficam melhores no computador — aqui deixo-te os números.» |
| Ver o calendário do mês / o dia | `Calendario.tsx` | **Mobile nativo** | Saber se o dia 14 está livre, ao telefone, é uso de telemóvel. | — |
| Bloquear uma data / criar nota de agenda | `Calendario.tsx:208-227` | **Mobile nativo** | Título, hora, nota. Três campos, e o pedido chega ao telefone. | — |
| Tarefas gerais | `Tarefas.tsx` | **Mobile nativo** para marcar, Desktop para criar com área/prioridade/prazo | Riscar é um toque. Já tem `Tarefas.telemovel.test.tsx`. | Marcar e ver; criar fica reduzido a título + hoje/amanhã. |
| Biblioteca de Temas: ver temas e fotos | `Temas.tsx` | Consulta | Grelha de miniaturas com LQIP — vê-se bem em qualquer lado (`image-worker.ts:51-64`). | — |
| Biblioteca de Temas: carregar fotos | `Temas.tsx:2882` | **Mobile nativo** (poucas), Desktop (lote) | **As fotos estão no telemóvel.** O `image-prep` já converte HEIC→JPEG no browser precisamente porque «vêm de telemóveis, muitas vezes HEIC no iPhone» (`image-prep.ts:9-16`). Um lote de 300 é outra coisa. | Carregar algumas sim. «Para carregares a sessão toda de uma vez, o computador aguenta melhor.» |
| Catálogo de Material (logística) | `Material.tsx` | Consulta | Ver o que há e o mínimo de stock serve na loja. Editar não. | A lista com quantidade e mínimo. «Consultar aqui, arrumar no computador.» |
| Importar material por CSV | `Material.tsx` | Desktop | Ficheiro + pré-visualização + confirmação. | «A importação precisa de um ficheiro e de uma pré-visualização grande — é no computador.» |
| Regras de material / listas | `MaterialRegras.tsx`, `MaterialListas.tsx` | Desktop | Regras condicionais. Configura-se uma vez. | — |
| Inventário (gerir adereços) | `Inventario.tsx` | Consulta | Gerir é editar quantidades e estados — o próprio `ModoDeCarga` diz que a lista normal «é para GERIR» e por isso é outra coisa (`ModoDeCarga.tsx:10-16`). | A lista e as quantidades. «Ver aqui; para mexer nas quantidades, o computador. Se é para carregar a carrinha, usa o Modo de carga.» |
| Modelos de email (editor rico) | `EmailTemplates.tsx`, `RichEmailEditor.tsx` | Desktop | Editor rico com campos de fusão. Escreve-se uma vez por ano. | O texto que sai, renderizado. «Aqui vês o email como o cliente o recebe; mudá-lo é no computador.» |
| Modelos de email bilingues | `EmailTemplatesBilingue.tsx` | Desktop | Duas colunas de texto lado a lado. Duas colunas a 390 px não existem. | Idem. |
| Definições da proposta (gasóleo, portagens, margem) | `DefinicoesProposta.tsx` | Consulta | Seis números com pré-visualização ao vivo. Consultar «a que preço está o gasóleo na proposta» é útil na estrada. | Os seis números e a idade de cada um. «Estes números mexem-se no computador — aqui ficas a saber com o que a proposta está a contar.» |
| Biblioteca de serviços | `Servicos.tsx`, `BibliotecaServicos.tsx` | Desktop | Catálogo com preços e descrições. | — |
| Restaurar cópia de segurança | `RestoreDialog.tsx` | Desktop | Irreversível e sobre tudo. | «Isto mexe em tudo de uma vez. Só no computador, e com calma.» |
| Imprimir guião do dia / dossier / .ics | `export.ts:358`, `DossierHeader.tsx:317-376` | Desktop (mas ver secção do evento do dia) | `printRunSheet` faz `window.open("", "_blank", "width=820,height=1000")` — no Safari do iPhone as medidas não valem nada e o pop-up é bloqueado com frequência. | O guião **dentro da página**, sem imprimir nada. Ver secção própria. |

**Contagem:** 22 Mobile nativo · 15 Consulta · 20 Desktop. (Cinco tarefas aparecem partidas em
duas classificações — marcar vs. editar — e estão contadas do lado onde o telemóvel manda.)

---

## As cinco tarefas pedidas por nome

### 1. Montar 7 páginas de mood board com 46 fotos — **Desktop**

Vale a pena fazer a conta, porque é a conta que decide. Sete páginas com `MOOD_BOARD_MAX_IMAGES
= 10` (`proposal-doc.ts:74`) e 46 fotos são: escolher tema na biblioteca, percorrer a grelha,
seleccionar — e o selector leva no máximo `MAX_IMPORT_BATCH = 40` de cada vez
(`theme-types.ts:220`), portanto são **duas rondas obrigatórias, no mínimo**. Depois é
distribuir 46 fotos por 7 caixas, o que são 46 decisões de destino; escolher a foto principal de
cada página (7 decisões); escolher o arranjo de cada página (7 decisões, cada uma com uma
pré-visualização a comparar); e acertar a ordem das páginas entre si, que é uma reordenação de 7
elementos com a `VistaDeConjunto` aberta — a vista que só existe **porque** a pergunta «isto
parece tudo do mesmo casamento?» não se responde sem as folhas todas à mesma distância dos olhos
(`ProposalStudio.tsx:6011-6019`). São ~110 decisões e uma hora de trabalho, em que **metade do
valor está em ver muitas coisas ao mesmo tempo**. Um ecrã de 390 px é, por definição, o
aparelho que não faz isso.

E não é falta de carinho com o toque: o arrasto já tem `TouchSensor` com 180 ms e pega própria
(`MoodBoardFotos.tsx:218`, e a explicação em `:58-64`), o índice já vira tira horizontal abaixo
de `lg` (`ProposalStudio.tsx:6045-6048`). O problema é anterior ao gesto — é que a tarefa é de
comparação, e a comparação precisa de área.

**O que o telemóvel mostra:** a `VistaDeConjunto` em modo leitura — as sete folhas, pela ordem
de saída, com a contagem de fotos de cada uma — e um só gesto activo: **trocar a ordem das
páginas**, que é a única decisão desta tarefa que se toma bem numa lista vertical. Mais o que
falta: «faltam 2 fotos na página 4».

> **Aviso:** «As sete páginas estão montadas e guardadas — aqui vês como ficaram e podes trocar
> a ordem. Escolher fotos é para o ecrã grande: são 46 decisões e metade delas é comparar.»

---

### 2. Rever o PDF antes de enviar — **Desktop**

Esta é a que parece Consulta e não é. Hoje a pré-visualização **não se vê no ecrã**: gera-se no
servidor e **descarrega-se**, porque a CSP do site (`object-src 'none'`, sem `frame-src`) bloqueia
mostrar um `blob:` num iframe ou numa aba (`ProposalStudio.tsx:4815-4819`). Ou seja, no iPhone o
que acontece é: espera, o ficheiro cai nas Transferências, o Safari sai do back office para o
leitor de PDF do sistema, e voltar é um gesto que perde o sítio onde ela estava. E ao voltar,
o que ela reviu está numa aplicação e o que ela tem de corrigir está noutra.

Depois há o peso. O modelo do repositório dá ~190 KB por foto (`custo-do-pdf.ts:63`): 46 fotos
são **perto de 9 MB** para descarregar em 4G fraca — e é mais do que o `LIMITE_DE_ANEXO` de
8 MB (`custo-do-pdf.ts:60`), o que quer dizer que rever este PDF no telemóvel custa mais rede
do que enviá-lo custaria. E a geração é de 14 a 20 s do lado do servidor, encostada ao tecto da
rota (`custo-do-pdf.ts:198-206`).

E há a razão que não é técnica: **rever é comparar com o que se queria**. Uma gralha num nome,
uma legenda trocada, uma moldura vazia — apanham-se com a página inteira à vista, não numa
coluna de 390 px em que uma página A4 deitada fica com 6 pt de corpo.

**O que o telemóvel mostra:** a **Conferência** (`Conferencia.tsx`) e a **verificação de fotos**
(`FotosEmFalta.tsx`) — que respondem, sem descarregar nada, às perguntas «falta alguma coisa?» e
«as fotos estão mesmo lá?» —, mais as sete folhas da `PreviaDaPagina` em miniatura, que já são
desenhadas em coordenadas de PDF a sério e não num desenho parecido (`PreviaDaPagina.tsx:26-34`).
É consulta a sério: dá para dizer «está bom» ou «falta qualquer coisa». O que não dá é para
assinar por baixo.

> **Aviso:** «Aqui consegues ver as páginas e o que a conferência apanhou. Para ler o PDF a
> sério — nomes, legendas, o que ficou de fora — vale mesmo a pena o computador: são nove
> megas e uma folha A4 deitada.»

---

### 3. Ajustar preço e sinal — **Consulta**

O gesto é mínimo e a consequência não é. O preço tem **um** campo (`ProposalStudio.tsx:7738-7753`)
e o sinal tem **um** — mas o do sinal é um `input type="number"` de `w-16 px-1.5 py-0.5 text-xs`
metido dentro do rótulo de uma linha de totais (`ProposalStudio.tsx:7963-7976`). Isso é um alvo
de cerca de 64 × 20 px: bem abaixo dos 44 px que a própria casa fixou (`globals.css:677`,
`nada-invisivel-ao-toque.test.ts`), e com setas de incremento do iOS ainda mais pequenas por
cima. Um polegar num carro acerta ali por sorte.

Mas o alvo é o menor dos problemas. Mexer nestes dois números move **quatro coisas ao mesmo
tempo**: o total sem IVA, o IVA, o sinal e o saldo (`ProposalStudio.tsx:7936-7982`) — e o campo
do preço é o MESMO número do «Preço final» do pedido, com escrita nos dois sentidos («escrever
aqui altera-o lá, e alterá-lo lá aparece aqui», `ProposalStudio.tsx:7730-7734`). Baixar o preço
sem ver a margem é a decisão que este ecrã foi desenhado para impedir: o `PainelInterno` está ali
ao lado exactamente porque «a decisão de baixar (ou não) o preço toma-se AQUI, com o total à
frente» (`ProposalStudio.tsx:7990-7995`). E a percentagem do sinal viaja para a facturação
(`percentagem-do-sinal.ts:9-19`) — foi já uma vez a origem de um «Em falta» errado numa proposta
de 50%.

Há uma nuance que vale a pena não perder: **registar um sinal RECEBIDO** (o MB Way que apita)
é `PaymentsPanel` e é **Mobile nativo**. O que é Consulta é **decidir** a percentagem e o preço.
São duas tarefas com o mesmo nome.

**O que o telemóvel mostra:** os quatro números em leitura — total sem IVA, IVA, sinal (com a
percentagem), saldo — mais a margem do `PainelInterno` na mesma vista. E o registo do pagamento
recebido, esse sim editável.

> **Aviso:** «O preço e a percentagem do sinal ficam para o computador — mexer num muda quatro
> números e a margem, e isso quer-se com tudo à frente. Se o que queres é registar um sinal que
> já entrou, é aqui em baixo.»

---

### 4. Consultar o evento do dia durante uma montagem — **Consulta, e é a tarefa mais mal servida do repositório**

É a tarefa para que este back office **devia** ter uma resposta óbvia e não tem. Hoje o caminho
é: abrir a Visão Geral, encontrar o cartão do próximo evento (que só aparece se faltarem 30 dias
ou menos, `Overview.tsx:1430`), tocar, e cair no dossiê — uma página desenhada no servidor com
`FinanceZone` + `ProductionZone` + `CommsZone` empilhadas numa coluna
(`evento/[id]/DossierClient.tsx:192-207`), com a coluna lateral do contacto a ir para o fundo de
tudo abaixo de `xl`. As informações que ela quer numa montagem — **a que horas chega quem, o que
falta, o telefone do florista, o que o casal escolheu** — estão espalhadas por cinco componentes
carregados por `dynamic()`, um a um, numa rede de quinta.

E o atalho que existiria — o **Guião do dia** — é `printRunSheet`, que faz
`window.open("", "_blank", "width=820,height=1000")` (`export.ts:358-360`). No Safari do iPhone
as dimensões não querem dizer nada e o pop-up é bloqueado com frequência: o botão não faz nada,
sem explicação. Repare-se que o guião **já contém exactamente o que é preciso**: tipo, pacote,
convidados, duração, local, cliente, telefone, email, e o cronograma ordenado
(`export.ts:374-388`). O conteúdo certo existe; o que está errado é a única porta que leva a ele.

E nada disto abre sem rede. O service worker exclui todo o back office menos o `carregamento`
(`public/sw.js:184-196`), e a cache das listas é um `Map` de módulo (`useCachedList.ts:39`) que
morre ao recarregar a página. Numa quinta sem rede, o evento do dia não existe.

**O que o telemóvel mostra:** o **Guião do dia como página**, não como impressão — o mesmo
conteúdo do `printRunSheet` desenhado no ecrã, com o cronograma em cima e a hora seguinte
destacada, os telefones tocáveis, os críticos por carregar, e as escolhas do casal. Uma rota
própria (`.../evento/[id]/dia`), e — pela mesma razão e com o mesmo desenho do `Carregamento` —
**dentro da lista do service worker**, porque uma quinta sem rede é o sítio onde esta página é
precisa.

> **Aviso:** (não é aviso, é convite) «Guião do dia — horas, contactos e o que falta. Abre
> mesmo sem rede.» E, quando abrir de uma cópia: «Isto é o que estava guardado às 08:14. Mal
> apanhes rede, actualizo.»

---

### 5. Ver a checklist da carrinha — **Mobile nativo. E é o único ecrã que já está certo.**

Este não precisa de análise, precisa de ser apontado como a régua. O `Carregamento` faz tudo o
que os outros ecrãs deviam fazer e não fazem:

- a **linha inteira** é o alvo, com 56 px de altura, e a caixa é um desenho e não o alvo
  (`carregamento/[eventId]/Carregamento.tsx:22-26`, `:333-335`);
- marcar escreve **primeiro no `localStorage`** e o dedo nunca espera pela rede (`:24-26`, `:180`),
  com fila de saída própria (`material-offline.ts`);
- os **críticos por marcar** travam o «carrinha carregada» com um aviso que diz **quais** — e não
  bloqueia, porque às vezes há razão (`:27-30`);
- distingue «não há checklist» de «não consegui perguntar», que não são a mesma coisa (`:48-56`);
- e é a **única** rota do back office que o service worker deixa abrir sem rede, com a razão
  escrita ao lado: «esquecer um escadote a 200 km custa horas» (`public/sw.js:184-187`);
- o `[eventId]` é o id da checklist e não o do pedido, para se poder dar a quem vai carregar sem
  lhe dar acesso ao pedido inteiro (`carregamento/[eventId]/page.tsx:11-16`).

**O que falta**, e é pouco: chegar lá. Hoje a única porta é um `<a>` de texto dentro do painel
`EventMaterial`, que vive dentro do separador Produção, dentro da gaveta do pedido
(`EventMaterial.tsx:163-169`). Quatro níveis de profundidade para o ecrã mais de telemóvel da
casa. Devia estar no guião do dia e na Visão Geral, no dia do evento.

---

## O que isto orienta

Esta secção é a que poupa trabalho. **Não vale a pena aperfeiçoar em mobile uma tarefa que não
devia acontecer em mobile** — e há categorias inteiras de correcção que os outros agentes vão
propor, com razão de layout, que caem em tarefas Desktop e devem ser fechadas como «não se
corrige, avisa-se».

**Deixa de valer a pena:**

1. **Tudo o que for sobre o editor de Serviços a 390 px** (Agente de formulários, Agente de
   layout). O `ServicesEditor` declara-se, com todas as letras, como um ecrã de teclado
   (`ServicesEditor.tsx:28-36`): Enter para linha nova, Alt+↑/↓ para mover, Cmd+Z para anular.
   Um telemóvel não tem nada disso. Apertar as colunas, empilhar os campos e engordar os alvos
   dá uma versão *usável* de uma tarefa que ela não vai fazer ali — e custa a manutenção de dois
   layouts para sempre. **Fecha-se com um aviso e um resumo em leitura.**
2. **Tudo o que for sobre o arrasto de fotos entre mood boards no telemóvel** (Agente de toque).
   O `TouchSensor`, a pega, a tolerância — está bem feito e deve ficar como está para o tablet,
   que é largo E de toque (a distinção já existe e está escrita em `ui/adaptativo.ts:16-25`). O
   que **não** se deve fazer é investir mais aí: a tarefa é Desktop e o tablet já está servido.
3. **Tudo o que for sobre os editores de modelos de email a duas colunas** (Agente de layout).
   O `EmailTemplatesBilingue` já tem um `.movel.test.tsx`; a resposta certa não é fazer as duas
   colunas caberem, é mostrar o email renderizado e mandar a edição para o computador.
4. **Tudo o que for sobre a barra «Guardar alterações» do painel de gestão do pedido**
   (Agente de layout). Há um comentário de 30 linhas sobre ela ter nascido 229 px abaixo da dobra
   num 1440×900 (`AdminClient.tsx:1064-1085`). Se o formulário inteiro é Desktop, o problema no
   telemóvel resolve-se removendo o formulário, não perseguindo a barra.
5. **Tudo o que for sobre mostrar o PDF da pré-visualização num iframe** (Agente de rede/CSP).
   Vai aparecer como «a CSP bloqueia, muda a CSP». Não se mexe na CSP por uma tarefa que é
   Desktop. A resposta é a Conferência mais as miniaturas — que não precisam de CSP nenhuma.

**Passa a valer o dobro:**

6. **O «Guião do dia» como página, e no service worker.** É a maior falha deste back office em
   mobile e não é um defeito de layout — é uma tarefa que não tem ecrã. O conteúdo já existe
   inteiro em `export.ts:358-388`; o que falta é deixar de o entregar por um `window.open` que o
   Safari bloqueia.
7. **O alvo de toque da percentagem do sinal** (`ProposalStudio.tsx:7963-7976`) corrige-se na
   mesma, apesar de a tarefa ser Consulta — porque 64 × 20 px também é mau com um rato, e porque
   é o número que viaja para a facturação.
8. **Levar o `Carregamento` mais acima.** Está a quatro níveis de profundidade
   (`EventMaterial.tsx:163-169`) o único ecrã da casa desenhado para uma quinta.
