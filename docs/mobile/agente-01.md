# Agente 1 — Paridade desktop/mobile

O back office já foi trabalhado a sério para o dedo, e isso muda o que esta auditoria
tinha para encontrar. Quase tudo o que se esconde num ecrã estreito esconde-se **de
propósito e com substituto escrito ao lado**: os atalhos de teclado desapareceram porque
todas as acções têm botão (`ServicesEditor.tsx:704`), a barra de fotografias do rato tem
uma folha de acções para o dedo (`ProposalStudio.tsx:9424` e `:9384`), o Kanban trocou o
arrasto por setas, as tabelas viram cartões, e o `com-rato:` está aplicado com uma
consistência rara. As catorze entradas que sobram não são desleixo: são **as três zonas
laterais do computador** — o índice do estúdio, o painel «O que vai sair» e a coluna do
Dossier — mais **um punhado de controlos únicos que ficaram do lado errado de um `sm:`**.

O padrão que se repete, e que vale a pena dizer de uma vez: **as três colunas laterais
foram desenhadas como "extras de ecrã grande" e, uma a uma, isso é verdade — mas somadas
tiram ao telemóvel toda a resposta à pergunta «como é que isto vai ficar e o que é que
ainda me falta».** No computador ela escreve com o estado à esquerda e a folha à direita.
No iPhone escreve às cegas e só descobre o que falta quando chega ao passo 3. Isto num
ecrã que tem cinco ecrãs e meio de scroll.

O segundo padrão é mais barato de corrigir e mais fácil de deixar passar: **um controlo
que só existe numa forma**. O «Exportar» do calendário, a ordenação das propostas, a
reordenação das fotos de um tema, o cabeçalho da tabela que o casal lê. Nenhum destes
custa uma zona nova — custa uma linha.

Onde escrevo uma medida sem a ter medido num ecrã, escrevo **[por confirmar no ecrã]**.

---

[A1-001] [Agente 1] [Fazer proposta · Conteúdo] [Grave] O índice do estúdio — o que já está feito e o que falta — não existe abaixo de 1280 px
     Largura onde falha: 390 / 430 / 768 (tudo abaixo de `xl`)
     Onde: src/app/[lang]/(site)/orcamento/admin/NavEstudio.tsx:110
       (`className="sticky top-4 hidden … xl:block"`), montado em
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:5555.
     Observado:
       Esta coluna é o único sítio onde `estadoDasSeccoes` (ProposalStudio.tsx:5281),
       `oQueFaltaParaEnviar` (:5300) e `traducoesPorSeccao` (:5390) aparecem no passo em
       que se ESCREVE. Abaixo de 1280 px o componente continua montado (é `display:none`,
       por isso o observador que mede o tempo por secção não se parte) mas não se vê nada:
       nem que secções estão preenchidas, nem o que falta, nem os saltos.
       O que sobra no telemóvel é o scroll e as seis secções dobradas. E as secções não
       compensam: o `Section` tem uma marca à direita do título (`nota`,
       ProposalStudio.tsx:9527) e ela só está preenchida numa das seis — a dos mood boards
       (`nota={contagemDosBoards}`, :5995). As outras cinco não dizem estado nenhum.
       A justiça é dizer que a lista do que TRAVA o envio não desaparece: a Conferência do
       passo 3 mostra-a, com o mesmo `oQueFaltaParaEnviar` lá dentro
       (src/lib/orcamento/conferencia.ts:556). O que desaparece é vê-la ENQUANTO se
       escreve, que é quando ela vale.
     Proposta:
       Duas coisas, e a segunda é uma linha:
       1. Uma fila de pastilhas por cima do formulário, uma por secção, com o ponto cheio /
          vazio e um ponto âmbar quando há falta — o mesmo desenho que a casa já usa três
          vezes (a tira do `MoodBoardIndice.tsx:108`, a fila de estados do
          `FazerProposta.tsx:299`, a fila de pastilhas do painel de temas). Rola de lado,
          salta para a secção, e não rouba largura nenhuma.
       2. Passar `nota` a TODAS as secções, alimentada pelo `resumo` que o
          `estadoDasSeccoes` já devolve. O slot existe, está vazio, e é o sítio onde ela
          já olha.
     Equivalente em desktop: existe (é a coluna inteira)

[A1-002] [Agente 1] [Fazer proposta · Conteúdo] [Grave] A pré-visualização da página existe no telemóvel, mas está enterrada atrás de uma dobra que se chama «Disposição»
     Largura onde falha: 390 / 430 / 768 / 1280 (tudo abaixo de `2xl`)
     Onde: src/app/[lang]/(site)/orcamento/admin/PainelDoEstudio.tsx:164
       (`<aside className="hidden w-[21rem] shrink-0 2xl:block">`); a alternativa em
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:6661
       (`<div className="lg:pt-6 2xl:hidden">`), dentro do `<details>` aberto em :6616,
       cujo rótulo (:6624) diz «Disposição: Mosaico · recorta».
     Observado:
       O painel da direita dá três coisas: a folha grande («O que vai sair»), o separador
       «Todas» com as páginas duas a duas e clicáveis (PainelDoEstudio.tsx:251), e o
       atalho «Escolher fotografias para esta página» (:222).
       Abaixo de 1536 px a folha continua a ser desenhada — e é a mesma `PreviaDaPagina`,
       com a mesma geometria do PDF — mas vive dentro de uma dobra FECHADA por omissão
       cujo título não fala de pré-visualização nenhuma. Quem procura «como é que esta
       página vai sair» não abre uma coisa chamada «Disposição».
       O separador «Todas» tem substituto legítimo em mobile: a `VistaDeConjunto`
       (ProposalStudio.tsx:6826-6832, grelha de duas colunas a 390 px) faz o mesmo e é acessível
       por botão. Essa parte está resolvida.
     Proposta:
       Tirar a `PreviaDaPagina` de dentro do `<details>` e deixá-la solta por baixo da
       grelha de fotos, com o rótulo «A página, como vai sair». A dobra continua a servir
       os seis diagramas de disposição, que é o que ocupa altura de verdade. E, se a altura
       ainda pesar, dobrá-la ela própria com um rótulo que diga o que lá está.
     Equivalente em desktop: existe

[A1-003] [Agente 1] [Fazer proposta · Conteúdo] [Grave] As linhas do orçamento «Organização» têm uma coluna fixa de 10rem sem alternativa no telemóvel — o bloco irmão já foi corrigido a quatro linhas de distância
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7580 (o cabeçalho) e
       :7588 (cada linha) — `grid grid-cols-[minmax(0,1fr)_10rem_auto]`, sem `sm:`.
       O bloco dos «Valores adicionais», logo acima, tem exactamente o remédio:
       :7448 (`hidden sm:grid` no cabeçalho) e :7478
       (`grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[…]`), com o comentário a explicar
       que a 375 px sobravam 22 px para a descrição.
     Observado:
       A coluna do «Valor» está travada em 10rem (160 px) e não encolhe. À descrição sobra
       o que restar — pela minha conta, cerca de 130 px a 390 px, e com os 16 px de letra
       que o `(pointer: coarse)` impõe a todos os campos (globals.css:625-629) isso são
       umas oito letras à vista no campo que dá o nome à rubrica que o casal vai ler.
       O cabeçalho de três colunas também não se esconde: fica lá, a legendar uma grelha
       apertada. [por confirmar no ecrã] — a medida exacta depende do padding da coluna do
       estúdio; o que é certo é que os 10rem não cedem.
     Proposta:
       Copiar o que está quatro linhas acima: `hidden sm:grid` no cabeçalho, e
       `grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_10rem_auto]` na linha,
       com a descrição em `col-span-2 sm:col-span-1`. É a mesma decisão, já tomada e já
       escrita no mesmo ficheiro.
     Equivalente em desktop: existe

[A1-004] [Agente 1] [Propostas] [Grave] No telemóvel não se ordena a lista de propostas — nem por valor, nem por nada
     Largura onde falha: 390 / 430 / 768 (tudo abaixo do `desktop` do `useAdaptativo`)
     Onde: src/app/[lang]/(site)/orcamento/admin/ui/TabelaOuCartoes.tsx:122-149 — o ramo
       dos cartões desenha `ordenados` e não tem controlo nenhum que mexa no estado
       `ordem` (:80). Os botões que ordenam vivem só no `<thead>` da tabela (:204-222).
       Consumido em src/app/[lang]/(site)/orcamento/admin/Propostas.tsx:655-659
       (`ordemInicial={{ chave: "cliente", ascendente: true }}`), com as colunas ordenáveis
       «Cliente» (:665) e «Valor» (:700).
     Observado:
       O ecrã Propostas tem um filtro de estado (`Segmented`, Propostas.tsx:596) e mais
       nada. No computador ordena-se por cliente e por valor; no telemóvel a lista fica
       para sempre por ordem alfabética de cliente. «Qual é a proposta mais alta que ainda
       está por responder?» não se responde num iPhone.
     Proposta:
       No ramo dos cartões do `TabelaOuCartoes`, desenhar um `<select>` com as colunas que
       têm `ordenar` — é o mesmo estado, é uma lista que o componente já tem, e resolve-o
       de uma vez para todas as listas do back office que passam por lá. O ecrã Pedidos já
       provou que o padrão funciona (`AdminClient.tsx:3826`).
     Equivalente em desktop: existe

[A1-005] [Agente 1] [Pedidos] [Menor] Duas ordenações que a tabela tem e o selector do telemóvel não: por nome e por número de convidados
     Largura onde falha: 390 / 430 / 768
     Onde: o selector em src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3826-3840
       (espera · recentes · antigos · valor · seguimentos · data do evento);
       as colunas ordenáveis em :364-366 (`nome`, alfabética) e :444-448 (`pax`).
     Observado:
       Aqui a lacuna é pequena porque o `select` de ordenação existe e funciona no dedo —
       é o contra-exemplo do A1-004. Faltam-lhe duas entradas que a tabela oferece.
       Ordenar por convidados é uma pergunta de logística real (que casamentos precisam de
       mais material?), e alfabética é como se procura um nome quando não se sabe a data.
     Proposta: duas `<option>` novas no mesmo `select` — «Nome (A–Z)» e «Mais convidados».
     Equivalente em desktop: existe

[A1-006] [Agente 1] [Calendário] [Grave] O «Exportar» do calendário desaparece abaixo de 640 px e não tem substituto
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:497
       (`className="hidden sm:inline-flex"` no botão que chama `exportIcs(quotes)`).
     Observado:
       É o único caminho para o `.ics` do calendário inteiro. O `.ics` que sobra no
       telemóvel é o de UM evento, no Dossier
       (evento/[id]/DossierHeader.tsx:374) — outra coisa.
       E é uma acção que faz mais sentido no telemóvel do que no computador: quem quer o
       calendário no telefone quer o `.ics` no telefone.
     Proposta:
       Tirar o `hidden sm:` e deixar o botão ficar só com o ícone abaixo de `sm` — o padrão
       que a casa usa em todo o lado (`MoreMenu.tsx:122`, `NotificationBell.tsx:193`,
       `DossierHeader.tsx:259`): ícone sempre, rótulo `hidden sm:inline`, `alvo-toque` para
       os 44 px. Em alternativa, mandá-lo para um «⋯» ao lado da navegação do mês.
     Equivalente em desktop: existe

[A1-007] [Agente 1] [Calendário] [Menor] No telemóvel nada diz que se pode tocar num dia, e o «+» de cada célula não existe no dedo
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:762
       (a dica «Clica num dia para ver ou adicionar», `hidden sm:inline`) e :674
       (o «+» de cada célula, `hidden sm:flex pointer-coarse:!hidden`).
     Observado:
       A acção continua lá — tocar num dia vazio abre o «adicionar» e num dia com eventos
       abre o painel do dia (:625-628), e isso está bem pensado. O que não há é nada que
       o diga: nem o «+», nem a frase. A célula não parece um botão, e a 390 px o que se
       vê são pontinhos coloridos.
       [por confirmar no ecrã] se o realce de `:active` chega para sugerir o toque.
     Proposta:
       Deixar a mesma frase visível em ecrã estreito (ela cabe — a legenda já é
       `flex-wrap`), com o texto do dedo: «Toca num dia para ver ou adicionar». Custa uma
       linha e é a única instrução do ecrã.
     Equivalente em desktop: existe (a frase e o «+»)

[A1-008] [Agente 1] [Temas · tema aberto] [Grave] Reordenar as fotografias de um tema é arrasto HTML5 — que no iOS não dispara. O único substituto é «mover para o início»
     Largura onde falha: todas as de toque (390 / 430 / 768, e portáteis com ecrã táctil)
     Onde: src/app/[lang]/(site)/orcamento/admin/Temas.tsx:3276-3300
       (`draggable` + `onDragStart` / `onDragOver` / `onDrop` a chamar `moveTo`);
       o substituto em :3394-3401 (`onClick={() => moveTo(i, 0)}`, «Mover para o início»).
       O próprio ficheiro assume-o em :3385 — «o arrasto de reordenar é HTML5 e não pega
       no telemóvel».
     Observado:
       Com rato, larga-se uma foto em qualquer posição. Com o dedo, só se manda para o
       início. Pôr a foto 40 na posição 5 são 35 gestos, e cada um deles muda a ordem de
       tudo o resto — ou seja, não é «mais lento», é outra coisa.
       Isto importa porque a ordem do tema é a ordem por que as fotos entram no mood board
       do estúdio: é uma decisão de proposta, não uma arrumação.
     Proposta:
       Trocar o arrasto HTML5 por `@dnd-kit` com `TouchSensor`, exactamente como a casa já
       faz em três sítios com os mesmos limiares (`MoodBoardIndice.tsx:88-89`,
       `MoodBoardFotos.tsx:217-218`, `ServicesEditor.tsx:638-639`: rato aos 4 px, dedo
       depois de 180 ms). O `moveTo(de, para)` já é a acção certa; muda-se quem a chama.
       Se isso for grande de mais para agora, o remendo honesto é um segundo botão «mover
       para o fim» e um modo «mover para aqui» a partir da selecção que a célula já tem.
     Equivalente em desktop: existe

[A1-009] [Agente 1] [Definições · repor cópia de segurança] [Grave] O ensaio da reposição é uma tabela de 34rem dentro de um diálogo de 358 px
     Largura onde falha: 390 / 430 (e 768 para a tabela grande)
     Onde: src/app/[lang]/(site)/orcamento/admin/RestoreDialog.tsx:373
       (`<table className="w-full min-w-[34rem] …">`, cinco colunas) e :567
       (`min-w-[22rem]`, três colunas). O diálogo é `max-w-3xl` com `px-4` à volta (:275,
       :282), portanto a 390 px tem 358 px úteis contra os 544 px que a tabela pede.
     Observado:
       A tabela do ensaio é a peça que responde a «o que é que isto vai apagar» antes de
       uma operação destrutiva e irreversível. A caixa rola de lado, mas quem lê «Na cópia
       / Estão lá / Novos / …» tem de rolar para ver as colunas que decidem — num ecrã onde
       o gesto de rolar de lado dentro de uma caixa compete com o de voltar atrás no
       Safari.
     Proposta:
       Classificar como **computador apenas**, e dizê-lo. É a única tarefa de todo o back
       office onde defendo isso: é rara, é destrutiva, e não se faz de pé numa quinta.
       O aviso deve aparecer DENTRO do diálogo, no lugar do passo de escolher ficheiro
       (RestoreDialog.tsx:327-335), com a frase da casa: «Repor uma cópia faz-se no
       computador — aqui não dá para conferir o que vai ser apagado antes de acontecer.»
       O botão que abre o diálogo pode ficar; o que não pode é o ensaio ser ilegível e a
       reposição seguir na mesma.
     Equivalente em desktop: existe

[A1-010] [Agente 1] [Proposta pública] [Grave] A tabela de rubricas que o casal lê perde o cabeçalho abaixo de 640 px — fica um «2» sem nome
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(privado)/proposta/[token]/page.tsx:527
       (`className="hidden sm:flex …"` no cabeçalho «Descrição / Qt. / Valor»);
       as linhas, que NÃO se reorganizam, em :532-545.
     Observado:
       O cabeçalho esconde-se; as linhas continuam a ser três colunas
       (`flex-1` + `w-12` + `w-28`). O que o casal vê num iPhone é
       «Arranjos de mesa · 2 · 500,00 €». O 2 não tem nome nenhum: tanto pode ser a
       quantidade como uma referência.
       Só afecta as propostas do construtor simples (as do estúdio gravam `lineItems: []`
       e desenham o `Documento`), mas essas são as que têm preço à linha — as que dão mais
       vontade de conferir.
     Proposta:
       Ou o cabeçalho fica (cabe: são três palavras curtas em maiúsculas de 10 px), ou a
       linha empilha em ecrã estreito com o rótulo colado ao número — «Qt. 2» e
       «500,00 €». A segunda é melhor: é a que continua a fazer sentido a 320 px.
     Equivalente em desktop: existe

[A1-011] [Agente 1] [Formulário público de orçamento] [Grave] A frase que explica o que vai acontecer só existe no painel de imagem, que é `hidden lg:block`
     Largura onde falha: 390 / 430 / 768 (tudo abaixo de 1024 px)
     Onde: src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx:876
       (`<aside className="relative hidden lg:block overflow-hidden">`), com o texto em
       :915 (`{to.lead}`) e :917 (`{to.processHint}`).
       As frases em src/lib/i18n/pt.ts:452-453 — «Ouvimos a sua visão e respondemos com uma
       proposta à medida para o seu evento.» e «Pedido → Proposta → Reunião».
     Observado:
       O painel esquerdo é decorativo e esconde-se bem. O que ele leva consigo não é
       decorativo: é a única promessa da página sobre o que acontece depois de carregar em
       Enviar, e o único sítio onde se lê que há uma reunião no fim. No telemóvel — que é
       onde entra a maior parte de quem chega por Instagram — o visitante vê o título e
       cai direito nos campos.
       Do lado do formulário fica o `h1` (`lg:sr-only`, :944) e a nota dos campos
       obrigatórios (:958). Mais nada.
     Proposta:
       Trazer as duas frases para a coluna do formulário, por baixo do `h1`, marcadas
       `lg:hidden` — o mesmo par que o link «← Início» já usa duas linhas acima (:935).
       São duas linhas de texto e é o argumento de venda da página que paga a casa.
     Equivalente em desktop: existe

[A1-012] [Agente 1] [Dossier do evento] [Grave] O contacto do cliente é a última coisa da página no telemóvel — depois de Finanças, Produção e Comunicação
     Largura onde falha: 390 / 430 / 768 / 1280 (tudo abaixo de `xl`)
     Onde: src/app/[lang]/(site)/orcamento/admin/evento/[id]/DossierClient.tsx:193
       (`grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]`) e :212
       (`<aside className="xl:sticky xl:top-40 min-w-0">`), com o cartão «Contacto» em
       DossierAside.tsx:39-91 (email, telefone, WhatsApp).
     Observado:
       No computador o telefone está no canto superior direito, ao nível dos olhos, preso
       (`xl:sticky`). Abaixo de 1280 px a coluna cai para debaixo de três zonas grandes:
       `FinanceZone`, `ProductionZone` e `CommsZone`.
       É o caso de uso desta auditoria, ponto por ponto: de pé numa quinta, uma mão, a
       precisar do número do casal. São vários ecrãs de scroll até lá.
     Proposta:
       Em ecrã estreito, uma fila compacta de contacto logo a seguir ao `MetricStrip` —
       telefone, WhatsApp, email como três alvos de 44 px, sem o resto do cartão. Marcada
       `xl:hidden`, para o computador não ficar com a informação duas vezes. O `DossierAside`
       fica onde está, com o detalhe.
       (Também serve, e é ainda mais barato: pôr os mesmos três atalhos na barra de acções
       do `DossierHeader.tsx:216`, que já está no topo e já é `flex-wrap`.)
     Equivalente em desktop: existe

[A1-013] [Agente 1] [Tarefas] [Menor] O responsável de cada tarefa desaparece abaixo de 640 px
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/Tarefas.tsx:170-179
       (`<span className="hidden sm:flex …">` com a inicial e o nome do responsável).
     Observado:
       O filtro por pessoa continua a funcionar no telemóvel (Tarefas.tsx:453-467), e
       atribuir também (o campo está no editor da tarefa, :519). O que não se vê é de quem
       é cada tarefa quando a lista está em «Todos» — que é a vista por omissão.
       A linha do cartão já quebra para uma segunda fila em ecrã estreito
       (`sm:contents`, :169), portanto há onde o pôr.
     Proposta:
       Na segunda fila, ao lado da etiqueta de prioridade, deixar só a bolinha com a
       inicial (20 px, decorativa) e o nome no `aria-label` da linha. Diz de quem é sem
       gastar largura.
     Equivalente em desktop: existe

[A1-014] [Agente 1] [Fazer proposta · Conteúdo] [Menor] Com a proposta bilingue ligada, o telemóvel paga o dobro da altura e não tem nada que a alivie
     Largura onde falha: 390 / 430 / 768 / 1280 (tudo abaixo de `xl`)
     Onde: src/app/[lang]/(site)/orcamento/admin/CaixaInglesa.tsx:174
       (`aoLado ? "xl:mt-0 xl:min-w-[12rem] xl:flex-1 xl:basis-0" : ""`), com a decisão
       explicada em :80-100; o interruptor em ProposalStudio.tsx:5589.
     Observado:
       Empilhar é a decisão certa e está bem argumentada — duas caixas de texto lado a
       lado num ecrã estreito são duas caixas onde não cabe uma frase. O que fica por
       resolver é a consequência que o próprio ficheiro mede: «cerca de dez mil píxeis de
       altura, e a proposta bilingue paga o dobro em cada campo».
       No computador esses dez mil píxeis têm um índice ao lado que os torna navegáveis.
       No telemóvel não têm (ver A1-001) — os dois defeitos multiplicam-se em vez de se
       somarem.
     Proposta:
       Uma caixa inglesa JÁ PREENCHIDA e sem a marca de desactualizada não precisa de
       estar aberta enquanto se escreve o português. Dobrá-la para uma linha
       («EN: Ceremony décor ✎») abaixo de `xl`, que abre ao toque, devolve metade da
       altura sem tirar nada — a revisão faz-se no passo 3, onde o `PorTraduzir` já vive.
       Não mexer nas vazias: essas são a falta, e a falta tem de se ver.
     Equivalente em desktop: existe (lado a lado a partir de 1280 px)

---

## Tabela de paridade

| Funcionalidade | Existe em desktop | Existe em mobile | Proposta |
|---|---|---|---|
| **Navegação entre ecrãs** | Coluna lateral com tudo | Sim — barra de baixo (4 destinos) + gaveta (o resto), sem repetir (`nav.tsx:93`) | — |
| **Pesquisa / paleta de comandos** | ⌘K e botão | Sim — botão sempre visível (`AdminClient.tsx:3399`), paleta com botão de fechar e sem rodapé de teclas | — |
| **Atalhos de teclado** | Sim, com folha de atalhos | Não aplicável — todas as acções têm botão; a folha esconde-se em `pointer-coarse` (`AdminClient.tsx:3052`) | — (correcto) |
| **Lista de pedidos** | Tabela de 7 colunas, ordenável pelos cabeçalhos | Sim — cartões (`QuoteCard`) + `select` de ordenação | Faltam duas ordens: nome e convidados (**A1-005**) |
| **Filtros dos pedidos** | Fila sempre aberta | Sim — botão «Filtros» com contador (`AdminClient.tsx:3702`) | — |
| **Detalhe de um pedido** | Painel preso na grelha | Sim — gaveta por cima, com armadilha de foco (`AdminClient.tsx:4142`) | — |
| **Lista de propostas** | Tabela ordenável por cliente e valor | Cartões, **sem ordenação nenhuma** | `select` de ordenação no ramo dos cartões (**A1-004**) |
| **Estúdio · índice de secções e o que falta** | Coluna `NavEstudio`, ≥1280 px | **Não** (a lista do que trava só reaparece no passo 3) | Fila de pastilhas + `nota` em todas as secções (**A1-001**) |
| **Estúdio · pré-visualização da página** | Painel «O que vai sair», ≥1536 px | Existe, mas dentro de uma dobra chamada «Disposição» | Tirar da dobra e nomear (**A1-002**) |
| **Estúdio · todas as páginas lado a lado** | Separador «Todas» do painel | Sim — `VistaDeConjunto`, grelha de 2 colunas | — |
| **Estúdio · índice das páginas de inspiração** | Coluna `sticky` a partir de `lg` | Sim — tira horizontal que rola, com arrasto por `TouchSensor` (`MoodBoardIndice.tsx:108`) | — |
| **Estúdio · reordenar mood boards / linhas de serviço** | Arrasto | Sim — setas ↑↓ sempre visíveis (`ServicesEditor.tsx:1233`) | — |
| **Estúdio · acções de uma fotografia** | Barra ao passar o rato | Sim — folha de acções ao toque (`ProposalStudio.tsx:9384`) | — |
| **Estúdio · campos PT/EN** | Lado a lado ≥1280 px | Sim, empilhados (por decisão) | Dobrar as inglesas já preenchidas (**A1-014**) |
| **Estúdio · linhas do orçamento (Organização)** | Três colunas | Coluna de 10rem que não cede | Copiar o `sm:` do bloco irmão (**A1-003**) |
| **Estúdio · conferência antes de enviar** | Lista única | Sim — mesma lista, mesmo sítio (`Conferencia.tsx`) | — |
| **Calendário · ver o mês** | Pastilhas com nomes | Sim — pontos coloridos + painel do dia com tudo (`Calendario.tsx:767`) | — |
| **Calendário · adicionar num dia** | «+» ao passar o rato | Sim — toque no dia | Falta dizê-lo (**A1-007**) |
| **Calendário · exportar `.ics`** | Botão «Exportar» | **Não** | Ícone sem rótulo (**A1-006**) |
| **Temas · grelha e pesquisa** | 4–6 colunas | Sim — 2 colunas, com ordenação e procura (`Temas.tsx:313`) | — |
| **Temas · reordenar fotos** | Arrasto para qualquer posição | Só «mover para o início» | `@dnd-kit` com `TouchSensor` (**A1-008**) |
| **Temas · biblioteca no estúdio** | Painel | Sim — refeito nos PR #79/#80 | — |
| **Estatísticas · números nos gráficos** | Ao passar o rato | Sim — sempre à vista em toque (`StatsDashboard.tsx:119`) | — |
| **Estatísticas / Pedidos · exportar CSV** | Botão | Sim | — |
| **Modelos de email · editor + pré-visualização** | Lado a lado ≥1280 px | Sim, empilhados (iframe de 420 px) | — |
| **Definições · repor cópia de segurança** | Ensaio em tabela de 5 colunas | Tabela a rolar de lado, ilegível | **Computador apenas**, com aviso no diálogo (**A1-009**) |
| **Dossier · contacto do cliente** | Coluna presa, canto superior direito | No fim da página, depois de 3 zonas | Fila de contacto por baixo do `MetricStrip` (**A1-012**) |
| **Dossier · imprimir / guião / `.ics`** | Botões com rótulo | Sim — ícones com `alvo-toque` (`DossierHeader.tsx:216`) | — |
| **Tarefas · responsável** | Bolinha + nome | **Não** (o filtro por pessoa fica) | Só a bolinha na 2.ª fila (**A1-013**) |
| **Formulário público · promessa do processo** | Painel de imagem | **Não** | Trazer as duas frases para a coluna do formulário (**A1-011**) |
| **Proposta pública · rubricas** | Cabeçalho de colunas | **Não** | Empilhar com rótulo colado (**A1-010**) |
| **Proposta pública · fotos e escolhas** | Grelha | Sim — `grid-cols-1 sm:grid-cols-2` | — |

---

## O que classifico como «computador apenas»

Uma só: **repor uma cópia de segurança** (A1-009). É rara, é irreversível, e a peça que a
torna segura — o ensaio do que vai ser apagado — não cabe num telemóvel sem deixar de ser
legível. O aviso deve estar dentro do diálogo, no passo de escolher o ficheiro, e não a
esconder o botão que o abre.

Tudo o resto se faz, ou passa a fazer-se com as catorze correcções acima.

## O que NÃO cobri

Não medi nada num ecrã: tudo aqui saiu da leitura das classes e da geometria declarada.
Não passei pelo Inventário, Fornecedores, Clientes nem pelo Kanban com o mesmo cuidado —
os quatro estão escondidos da navegação a pedido dela (`nav.tsx:41-47`) e só se chegam por
link directo; o que vi neles (cartões `md:hidden`, setas em vez de arrasto no Kanban) tem
bom aspecto. Também não abri o portal do cliente nem o contrato.

## Avisos para quem corrigir

- **Nada foi alterado.** O repositório está exactamente como estava; o único ficheiro
  escrito é este.
- **A1-001 e A1-014 multiplicam-se.** Corrigir só um deixa o outro pior do que parece na
  contagem: são a mesma queixa — o formulário mais escrito da casa não tem mapa no
  telemóvel.
- **A1-003 e A1-010** são o mesmo defeito em dois sítios (uma grelha de colunas fixas sem
  ponto de quebra). Vale a pena corrigi-los na mesma passagem, com a mesma forma.
- **A1-004 corrige-se uma vez para todos.** O `select` de ordenação vai dentro do
  `TabelaOuCartoes`, não dentro do ecrã Propostas — todas as listas do back office passam
  por lá.
