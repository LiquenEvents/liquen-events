# Agente 2 — Layout e rutura

Este back office já levou mão pesada em mobile, e vê-se: a barra de destinos publica a
própria altura num token (`--bo-barra-inferior`), a barra de acção do estúdio mede-se a si
mesma com um `ResizeObserver` em vez de reservar 80 px à sorte, o `FolhaOuDialogo` é um
diálogo que vira folha e traz `dvh`, `overscroll-contain` e `env(safe-area-inset-bottom)` de
casa, e a grelha de fotos dos Temas desce a duas colunas abaixo de 26rem com a conta escrita
ao lado. **O que ficou por corrigir não são buracos de desenho — são sítios onde a correcção
já existe no repositório e não foi aplicada.** Cinco das dezasseis entradas abaixo têm o
remédio escrito a menos de dez ficheiros de distância, às vezes no MESMO ficheiro, às vezes
setenta linhas acima.

O padrão repete-se com três feitios. **Primeiro: campos com largura de computador dentro de
filas que passaram a quebrar.** A fila das linhas do orçamento aprendeu a esconder os
cabeçalhos abaixo de 640 px mas não a encolher as colunas — a 390 px a caixa onde se escreve
«Decor Cerimónia» tem 62 px, e com a proposta bilingue ligada tem 27. A mesma doença foi
diagnosticada e curada nas linhas ADICIONAIS setenta linhas mais abaixo («a caixa da
descrição com 22 px», medida a 375), e ninguém voltou atrás para as outras duas filas.
**Segundo: barras coladas ao fundo que não sabem o que está por baixo delas.** O estúdio
sabe (`bottom-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom))]`); a barra de
etiquetagem da biblioteca não sabe, e desaparece por trás da navegação do telemóvel; o pé da
gaveta do pedido — onde vive o «Guardar alterações» — encosta ao fundo do ecrã sem uma
palavra sobre a barra de gestos. **Terceiro: `vh` onde a casa já decidiu `dvh`**, com a razão
escrita por extenso no `FolhaOuDialogo` («com a barra do browser à vista, `100vh` é maior do
que o que se vê, e o rodapé com as acções ficava debaixo dela») — e três diálogos ainda em
`vh`, dois deles folhas inferiores.

A conta de espaço que uso em todo o documento, para as larguras e as alturas não serem
opinião: **390×844, Safari em retrato**. O que se vê com as barras do browser à vista são
749 px (`100svh`); tira-se o cabeçalho encolhido do back office (~48 px) e a barra de
destinos com a área segura (72 + 34 = 106 px) e **sobram ~595 px de trabalho**. É contra
esses 595 que digo quantos itens são precisos para cada lista partir o ecrã. Em largura:
`VIEW_WRAP` dá `px-4`, o `Card` dá `p-5` — **uma fila dentro de um cartão do estúdio tem 318
px, e não 390**.

Duas notas de honestidade. Não tenho browser nem servidor: tudo isto é lido em código, e o
que precisa de olho está marcado `[por confirmar no ecrã]`. E há uma rede que muda o sintoma
de tudo o que passa da margem — `body { overflow-x: clip }` em `src/app/globals.css:750` —
por isso um transbordo horizontal aqui **não** se lê como uma barra de scroll: lê-se como
conteúdo cortado e desaparecido, que é bastante pior de diagnosticar em cima de uma quinta.

---

[A2-001] [Agente 2] [Fazer proposta · Conteúdo · Orçamento Proposto] [Bloqueia] A caixa do nome da linha do orçamento tem 62 px — 27 com a proposta bilingue ligada
     Largura onde falha: 390 / 430 — parte a partir de 520 px para baixo
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7073 (a fila: `flex flex-wrap items-center gap-2`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7075 (`${INPUT_SM} flex-1` — e `INPUT_SM` traz `min-w-0`, linha 209)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7087 (a caixa inglesa, também `flex-1`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7098 (`select` `w-32 shrink-0`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7110 (`span` `w-28 shrink-0`, o preço)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7034 (o cabeçalho das colunas, esse sim `hidden … sm:flex`)
     Observado:
       A fila tem 318 px dentro do cartão. As colunas fixas somam 240 (`w-32` da escala +
       `w-28` do preço) e, com os `gap-2`, a linha enche-se com 264 px antes de chegar ao
       «Extra» — que quebra para a fila de baixo. Sobram **54 px** para os campos de texto.
       Como os dois campos de nome são `flex-1` com `flex-basis: 0` e `min-w-0` escrito à
       mão, eles **não quebram: encolhem**. Sem bilingue, o nome da linha fica com ~62 px;
       com bilingue, 27 px cada. Escrever «Decoração da Cerimónia» numa caixa de 62 px é
       escrever às cegas — e o que se escreve ali é o texto que o casal lê no PDF.
       A conta do ponto de rutura: para o campo chegar aos 192 px que a própria casa fixou
       como mínimo (`min-w-[12rem]`), a fila precisa de 448 px, ou seja **520 px de ecrã**.
       A 430 (iPhone Max) ainda são só 102 px. Não há largura de telemóvel onde isto esteja
       bem.
     Proposta:
       Trocar `flex-1` por `min-w-[12rem] flex-1` nos dois campos de texto — é literalmente
       o que a fase do cronograma faz cento e trinta linhas acima, no mesmo ficheiro
       (`ProposalStudio.tsx:6944`), e o que o `ServicesEditor.tsx:763` faz nos títulos de
       grupo. Com um mínimo, o `flex-wrap` que já lá está passa a fazer o que existe para
       fazer: o nome fica sozinho numa fila inteira e a escala, o preço e o «Extra» descem
       para a de baixo. Alternativa igualmente da casa: copiar o desenho já corrigido das
       linhas adicionais (`ProposalStudio.tsx:7478`) — `grid-cols-[minmax(0,1fr)_auto]` no
       telemóvel, a grelha de computador só a partir de `sm`.
     Equivalente em desktop: existe (a partir de 640 px a fila é a de sempre e os cabeçalhos
     voltam)

[A2-002] [Agente 2] [Temas · Rever biblioteca] [Bloqueia] A barra que aplica etiquetas fica por trás da barra de destinos do telemóvel
     Largura onde falha: 390 / 430 / 768 — tudo abaixo de `lg` (1024 px)
     Onde:
       src/app/[lang]/(site)/orcamento/admin/BibliotecaRevisao.tsx:438 (`sticky bottom-0 z-20`)
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3157 (a barra de destinos: `fixed bottom-0 … z-30`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:8440 (o mesmo problema, já resolvido)
     Observado:
       A barra de acções da revisão é `sticky bottom-0` — cola-se ao fundo do que rola, que
       aqui é a janela. Por cima dela, e no plano seguinte, está a navegação de baixo do back
       office: `fixed bottom-0`, `z-30`, 72 px de altura mais a área segura (34) = **106 px
       de faixa opaca**. O `pb` que o `AdminClient` põe no conteúdo (linha 3255) não salva
       nada: um elemento `sticky` posiciona-se contra o scrollport e não contra o padding do
       pai, portanto vai parar exactamente debaixo da navegação.
       A barra tem `p-3` e `flex-wrap`, e a 390 px o conteúdo («N fotos escolhidas», «limpar»,
       «escolher as N do ecrã», e os dois `select` de pôr e tirar etiqueta) quebra em cerca
       de quatro filas — ~200 px. Os 106 px de baixo levam com as duas últimas, e as duas
       últimas são precisamente os `select`: **a única forma de aplicar ou tirar uma etiqueta
       depois de escolher fotos.** Escolhe-se e não se etiqueta. `[por confirmar no ecrã]` a
       ordem exacta em que as quatro filas caem.
       O estúdio já resolveu isto, e a nota está escrita lá: «esta barra pousa EM CIMA da
       barra de destinos do telemóvel, portanto a sua distância ao fundo é a altura dessa
       barra».
     Proposta:
       Trocar `bottom-0` por
       `bottom-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom))] lg:bottom-0`,
       copiado do `ProposalStudio.tsx:8440` sem uma vírgula de diferença. Enquanto lá estiver,
       vale a pena o teste que impede a terceira cópia: qualquer `sticky bottom-0` ou `fixed
       bottom-0` dentro de `orcamento/admin/` tem de nomear o token ou a área segura.
     Equivalente em desktop: existe (a partir de `lg` a navegação passa a coluna lateral e a
     barra fica no sítio)

[A2-003] [Agente 2] [Fazer proposta · Conteúdo · mood boards] [Grave] Dois alvos de 44 px empilhados no mesmo canto de uma célula de 93×78 — sobrepõem-se 16 px
     Largura onde falha: 390 / 430 — a grelha só desanuvia a partir de 640 px
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:6464 (`grid grid-cols-3 sm:grid-cols-4 gap-2`)
       src/app/[lang]/(site)/orcamento/admin/MoodBoardFotos.tsx:507 (a pega de arrastar: `alvo-toque … absolute top-1 right-1 z-20 h-6 w-6`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:9375 (o «⋯» das acções: `alvo-toque … absolute right-0.5 bottom-0.5 z-20 h-11 w-11`)
       src/app/[lang]/(site)/orcamento/admin/MoodBoardFotos.tsx:477 (a tira do historial, `truncate`, `z-10`)
       src/app/[lang]/(site)/orcamento/admin/Temas.tsx:345 (`GRELHA_DE_FOTOS` — a mesma conta, já feita, com outro desfecho)
     Observado:
       Três colunas dentro de um cartão de board dentro de um cartão de secção: a célula
       fica com ~93 px de largura e ~78 de altura a 390 px (o comentário do próprio ficheiro
       fala de «uma célula de 84×72», medida mais abaixo). Lá dentro vivem **dois** alvos que
       `.alvo-toque` leva a 44×44 sob `(pointer: coarse)`: a pega ⠿ ancorada em `top-1
       right-1` (ocupa y 4→48) e o «⋯» ancorado em `bottom-0.5 right-0.5` (y 32→76). **São
       16 px de sobreposição**, os dois no mesmo plano `z-20`, e quem ganha é o que vem
       depois no DOM — o «⋯». Sobra à pega uma faixa tocável de 28 px de altura, contra os
       44 que a casa exige, e **zero** píxeis de intervalo, contra os 8 do mínimo. Juntos
       tapam 47 % da largura e 92 % da altura da metade direita da fotografia.
       Efeito colateral no mesmo sítio: a tira do historial é `absolute inset-x-0 bottom-0`
       com `z-10` e o «⋯» de 44 px senta-se em cima da sua metade direita — sobram ~49 px a
       8 px de letra, umas nove letras. O texto foi encurtado para «2× nesta proposta» por
       causa da largura da célula (o comentário está em `ProposalStudio.tsx:2878`) sem contar
       com o botão que lhe fica por cima; sai «2× nesta…».
       A biblioteca de Temas fez esta mesma conta e tirou a conclusão oposta: desceu a duas
       colunas abaixo de 26rem porque «pô-los nos 44 px que a casa exige não cabia em 98 px:
       os dois de baixo ficariam a 2 px um do outro e a foto desaparecia debaixo dos botões».
     Proposta:
       Reutilizar `GRELHA_DE_FOTOS` (ou a sua regra) também aqui:
       `grid-cols-2 min-[26rem]:grid-cols-3 sm:grid-cols-4`. Com duas colunas a célula passa
       a ~151 px e os dois alvos deixam de se tocar. E, já que a folha de acções existe,
       fazer a pega ⠿ entrar nela como uma linha («mover esta fotografia») em vez de ser um
       segundo alvo em cima do primeiro — o arrasto HTML5 não pega no telemóvel de qualquer
       maneira, que é o argumento escrito no próprio ficheiro para as acções soltas.
     Equivalente em desktop: existe (com rato os controlos são de 24 px e aparecem em hover;
     nada se sobrepõe)

[A2-004] [Agente 2] [Fazer proposta · Conteúdo · Orçamento (modelo Organização)] [Grave] A descrição da linha fica com 122 px numa grelha que não tem variante de telemóvel
     Largura onde falha: 390 / 430 — abaixo de ~530 px
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7588
     Observado:
       `grid-cols-[minmax(0,1fr)_10rem_auto]`, sem `sm:` nem nada. As duas colunas fixas
       (160 px do valor + ~20 do botão de remover) mais os `gap-2` comem 196 dos 318 px da
       fila: à descrição sobram **122 px**. É o irmão mais sortudo do A2-001 — dá para ler
       três palavras em vez de uma — mas é a mesma omissão, no mesmo ecrã, e vale a mesma
       correcção.
     Proposta:
       `grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_10rem_auto]`, com a caixa
       da descrição em `col-span-2 sm:col-span-1` — exactamente o que as linhas adicionais
       fazem em `ProposalStudio.tsx:7478`.
     Equivalente em desktop: existe

[A2-005] [Agente 2] [Pedidos · gaveta de um pedido] [Grave] O «Guardar alterações» encosta ao fundo do ecrã sem contar com a barra de gestos
     Largura onde falha: 390 / 430 / 768 — em toda a largura onde a gaveta é sobreposição
     Onde:
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:5571 (o pé: `shrink-0 border-t … bg-white`)
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:5575 (`px-5 py-3 sm:px-7` — e nada mais)
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4165 (a gaveta: `fixed inset-y-0 right-0 … max-h-[100dvh]`)
     Observado:
       A gaveta é `inset-y-0` com `max-h-[100dvh]`: a aresta de baixo do pé é a aresta de
       baixo do viewport. O pé só tem `py-3` — 12 px — e o indicador de gestos do iPhone come
       34. O botão «Guardar alterações», que é o gesto que fecha a edição de um pedido
       inteiro, fica com a metade de baixo dentro da faixa que o sistema reserva para o
       gesto de sair da aplicação. `[por confirmar no ecrã]` quanto exactamente sobra do
       alvo, mas a falta é estrutural e não de medida.
       A casa faz isto bem em dois sítios a poucos ficheiros daqui: a barra de destinos leva
       `paddingBottom: env(safe-area-inset-bottom)` (`AdminClient.tsx:3160`) e o rodapé da
       folha leva `pb-[max(0.75rem,env(safe-area-inset-bottom))]`
       (`ui/FolhaOuDialogo.tsx:180`).
     Proposta:
       No pé, `pb-[max(0.75rem,env(safe-area-inset-bottom))]`, copiado do `FolhaOuDialogo`.
       De caminho, dar `min-w-0` ao `<p>` do estado da gravação (`AdminClient.tsx:5576`): a
       fila é `justify-between` sem quebra, e uma mensagem longa de falha empurra a linha
       para quatro filas em vez de partir onde deve.
     Equivalente em desktop: existe (a partir de `xl` a gaveta é um painel na grelha, sem
     aresta encostada ao ecrã)

[A2-006] [Agente 2] [Carregamento da carrinha] [Grave] A barra fixa não conta com a barra de gestos, e a folga por baixo é um número escrito à mão que fica curto
     Largura onde falha: todas (é um ecrã só de telemóvel)
     Onde:
       src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:377 (`fixed inset-x-0 bottom-0 … p-4`, sem `env(safe-area-inset-bottom)`)
       src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:233 (`pb-28` — 112 px reservados)
       src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:236 (o cabeçalho `sticky top-0`, sem `pt-safe`)
     Observado:
       Duas coisas, na mesma barra. **Uma:** `p-4` e mais nada — os 34 px do indicador de
       gestos ficam por cima do botão «Dar por carregada», que tem `min-h-[52px]` e é o
       único gesto que fecha este ecrã. Este é o ecrã que se usa de pé, com uma mão, à porta
       da carrinha; é onde a área segura menos se pode esquecer.
       **Duas:** a folga por baixo do conteúdo é `pb-28`, 112 px fixos. No estado normal a
       barra mede ~84 px (16+52+16) e sobra folga. No estado de confirmação — o que aparece
       quando faltam itens críticos — a barra passa a ter uma frase que a 390 px ocupa três
       linhas (~60 px), mais `mt-3` e dois botões de 48: **~152 px**. São 40 px de lista
       tapados exactamente no momento em que ela está a verificar o que falta.
       É a mesma armadilha que o estúdio já tinha e resolveu medindo a barra com um
       `ResizeObserver` («um número que se mede não pode ficar desactualizado por alguém
       acrescentar um botão» — `ProposalStudio.tsx:5546`, com o `ResizeObserver` em
       `:3163-3172` e a folga aplicada em `:5553`).
       O cabeçalho `sticky top-0` sem `pt-safe` só se nota fora do Safari com barras à vista
       (ecrã cheio, ou instalado no ecrã principal) — `[por confirmar no ecrã]`.
     Proposta:
       `padding-bottom: calc(1rem + env(safe-area-inset-bottom))` na barra; e a folga do
       conteúdo a sair da altura medida da barra em vez de `pb-28`, como o estúdio faz. Se
       medir parecer de mais para este ecrã, ao menos reservar o pior caso (a barra de
       confirmação) e não o melhor.
     Equivalente em desktop: não existe (este ecrã é só de telemóvel)

[A2-007] [Agente 2] [Temas · Copiar fotos para outro tema] [Grave] Uma folha inferior sem área segura e com `vh` em vez de `dvh` — o «Copiar» fica debaixo das barras
     Largura onde falha: 390 / 430 — abaixo de 640 px, que é onde vira folha
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ThemeCopyDialog.tsx:237 (`fixed inset-0 flex items-end … sm:items-center`)
       src/app/[lang]/(site)/orcamento/admin/ThemeCopyDialog.tsx:249 (`max-h-[90vh]`)
       src/app/[lang]/(site)/orcamento/admin/ThemeCopyDialog.tsx:422 (o rodapé: `px-5 py-4`, sem área segura)
     Observado:
       Abaixo de `sm` isto é uma folha inferior — `items-end`, `rounded-t-2xl` — mas escrita
       à mão em vez de usar o `FolhaOuDialogo`, e por isso ficou sem as duas coisas que ele
       traz. Sem `env(safe-area-inset-bottom)`, o rodapé com o «Copiar N fotos» encosta à
       aresta e leva com o indicador de gestos. E `90vh`, num iPhone, é 90 % do viewport
       GRANDE: a 390×844 são 760 px contra os ~749 que se vêem com as barras do Safari à
       vista; num iPhone SE (375×667) são 600 contra ~559 — **41 px do rodapé por baixo da
       barra do browser**. É exactamente o que o `FolhaOuDialogo` documenta ao escolher
       `dvh`: «com a barra do browser à vista, `100vh` é maior do que o que se vê, e o rodapé
       com as acções ficava debaixo dela».
     Proposta:
       Passar este diálogo para o `ui/FolhaOuDialogo` — é para isto que ele existe, e traz de
       borla a armadilha de foco, o Escape, o trinco do scroll e o gesto de arrastar para
       fechar. Se a migração for para depois: `max-h-[88dvh]` e
       `pb-[max(1rem,env(safe-area-inset-bottom))]` no rodapé, já.
     Equivalente em desktop: existe (a partir de `sm` é um diálogo centrado com folga dos
     dois lados)

[A2-008] [Agente 2] [Calendário · Adicionar ao calendário] [Grave] O único diálogo do back office sem tecto de altura nem scroll próprio
     Largura onde falha: 390 / 430 — e qualquer largura com o teclado aberto
     Onde:
       src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:161 (`fixed inset-0 flex items-center justify-center p-4` — sem `overflow-y-auto`)
       src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:167 (a caixa: `relative w-full max-w-md … p-6` — sem `max-h`)
     Observado:
       Todos os outros diálogos da casa têm tecto: `max-h-[88dvh]` no `RestoreDialog` e no
       `PasskeysDialog`, `max-h-[90dvh]` no `NewQuoteModal`, `max-h-[88dvh]` na
       `SessaoExpirada`, `max-h-[52dvh]` na lista da `CommandPalette`. Este não tem nenhum, e
       o contentor à volta também não rola. Enquanto o conteúdo couber (são ~430 px: fila de
       tipos, título, hora + nota, botão) não se nota — mas o campo «Título» tem `autoFocus`,
       e a caixa está centrada com `items-center` dentro de um `fixed`, que no iOS não encolhe
       com o teclado. Com o teclado aberto sobram ~508 px de altura visível e o botão
       «Adicionar ao calendário» cai no terço de baixo, ou seja **por trás do teclado, num
       diálogo que não rola**. `[por confirmar no ecrã]` — é o género de coisa que só a
       captura resolve, mas a ausência de tecto é objectiva e é a causa.
     Proposta:
       O mínimo: `max-h-[88dvh]` na caixa e `overflow-y-auto overscroll-contain` no corpo,
       como os irmãos. O certo, e mais barato a prazo: `FolhaOuDialogo` — é um formulário
       curto com uma acção principal, que é literalmente o caso de uso para que a folha foi
       desenhada («as acções ficam em baixo, onde o polegar está»).
     Equivalente em desktop: existe

[A2-009] [Agente 2] [Fazer proposta · Conteúdo e Enviar] [Grave] «O que falta para enviar» só existe a partir de 1280 px, e o motivo de o botão estar travado vive num `title`
     Largura onde falha: 390 / 430 / 768 — tudo abaixo de `xl`
     Onde:
       src/app/[lang]/(site)/orcamento/admin/NavEstudio.tsx:107 (`sticky … hidden … xl:block`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:5555 (o único sítio onde `faltas` é desenhado)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:8790 (o motivo, só em `title=`)
       src/app/[lang]/(site)/orcamento/admin/PainelDoEstudio.tsx:164 (`hidden w-[21rem] … 2xl:block` — «O que vai sair»)
     Observado:
       `oQueFaltaParaEnviar` é chamado uma vez (linha 5300) e o resultado vai a um único
       sítio: a coluna lateral, que está `hidden` até `xl`. Abaixo de 1280 px a lista «Falta
       para enviar» **não é desenhada em lado nenhum** — nem o índice das secções, nem as
       traduções em falta por secção.
       No passo Enviar, o botão «Gerar e enviar ao cliente» aparece desactivado e a razão
       («Preenche clientes, referência e um total maior que 0 antes de enviar», ou «Há fotos
       ainda a entrar na proposta») está só no atributo `title`. Num ecrã de toque não há
       hover: **o botão está cinzento e não há forma de saber porquê.** Fica-se a rolar cinco
       ecrãs de proposta à procura do campo que falta.
       A decisão de esconder a coluna está bem argumentada («uma coluna lateral num ecrã de
       375px é uma coluna a roubar metade da largura ao trabalho») — o que falta é o destino
       alternativo para o conteúdo dela, não a coluna.
     Proposta:
       Duas peças, e a segunda é barata. (a) A razão do travão passa a texto visível ao lado
       do botão desactivado, na barra de acção que já mede a própria altura — cabe, e a barra
       já quebra (`flex-wrap`). (b) As `faltas` ganham uma casa no telemóvel: ou uma linha
       dobrável no topo do passo Conteúdo («faltam 3 coisas para enviar»), ou uma folha
       aberta a partir da mesma barra — a `FolhaOuDialogo` já é usada aqui ao lado para as
       acções de uma fotografia.
     Equivalente em desktop: existe (é o desktop que tem a coluna; é o telemóvel que não tem
     nada)

[A2-010] [Agente 2] [Painel da biblioteca de temas] [Menor] O painel refeito no #79/#80 ficou com `max-h-[90vh]` em vez de `dvh`
     Largura onde falha: 390 / 430 — abaixo de 640 px, onde é folha inferior
     Onde: src/app/[lang]/(site)/orcamento/admin/ThemePicker.tsx:1844
     Observado:
       O resto do trabalho está feito e está bom: o rodapé quebra em `flex-wrap`, a contagem
       fica numa linha inteira, `paddingBottom: calc(1rem + env(safe-area-inset-bottom))`
       (linha 2420), a fila de fotos rola na horizontal com `snap-x`. Ficou o tecto: `90vh`,
       e não `dvh`. A 390×844 são 760 px contra ~749 visíveis — **11 px** do rodapé por
       baixo da barra do Safari, ou seja um quarto da altura do alvo de 44. Num iPhone SE
       são 41 px. É o resto do mesmo problema do A2-007, e sobrevive à correcção que já foi
       feita neste ficheiro.
     Proposta: `max-h-[88dvh]`, o mesmo número do `FolhaOuDialogo`.
     Equivalente em desktop: existe

[A2-011] [Agente 2] [Fazer proposta · Enviar] [Menor] O aviso dos cortes cresce dentro da barra de acção e pode ficar com metade do ecrã
     Largura onde falha: 390 / 430
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:8739 (`cortesPorConfirmar.map`, sem tecto)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:8735 (a caixa, `max-w-lg`, dentro da barra `sticky`)
     Observado:
       A barra de acção é `sticky` e mede-se a si mesma, portanto não tapa nada — o problema
       é outro: com quatro ou cinco cortes, o aviso ocupa ~330 px dos ~595 de trabalho.
       Cada `fraseDeCorte` quebra em duas ou três linhas a 390 px, mais o título, mais o
       parágrafo de fecho, mais duas filas de botões. Fica-se com **mais de metade do ecrã
       ocupado por uma barra**, e a pré-visualização que se está a decidir escondida por
       trás dela.
     Proposta:
       Tecto na lista (`max-h-[9rem] overflow-y-auto` chega para três frases inteiras) ou,
       melhor, mandar o aviso para a folha em vez de o pôr na barra: é uma decisão com
       leitura, não um controlo.
     Equivalente em desktop: existe (num ecrã de 900 px de altura, 330 px de barra ainda
     deixam a proposta à vista)

[A2-012] [Agente 2] [Temas · tema aberto] [Menor] A marca «Capa» fica invisível no telemóvel — o botão de ampliar senta-se em cima dela
     Largura onde falha: todas (em qualquer ecrã de toque)
     Onde:
       src/app/[lang]/(site)/orcamento/admin/Temas.tsx:3363 (a marca: `absolute bottom-1 left-1`, sem plano)
       src/app/[lang]/(site)/orcamento/admin/Temas.tsx:3414 (o ⤢: `alvo-toque absolute left-1 bottom-1 z-10`)
     Observado:
       Mesmo canto, mesma célula. Com rato, o ⤢ está em `opacity-0` até se passar por cima,
       e a «Capa» lê-se; com dedo, o `com-rato:` não se aplica e o botão está sempre a 100 %
       — e como leva `z-10` e a marca não leva plano nenhum, tapa-a por inteiro. Sob
       `(pointer: coarse)` o `.alvo-toque` ainda o leva a 44×44, portanto tapa mais do que o
       desenho sugere. Resultado: **no telemóvel não há maneira de ver qual das fotos é a
       capa do tema.**
     Proposta:
       Mudar a marca para o canto que sobra — `top-1 left-1` já é do visto de selecção, mas
       `bottom-1` ao centro fica livre —, ou trocá-la por uma moldura na célula, que não
       compete com botão nenhum.
     Equivalente em desktop: existe

[A2-013] [Agente 2] [Fotografia em grande — três ecrãs] [Menor] As três lupas não conhecem a área segura; em paisagem as setas caem no entalhe
     Largura onde falha: todas, e sobretudo em paisagem
     Onde:
       src/app/[lang]/(site)/orcamento/admin/PhotoLightbox.tsx:139 e 171
       src/app/[lang]/(site)/orcamento/admin/LupaDeFotos.tsx:79, 101 e 128
       src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx:840, 884 e 932
     Observado:
       As três são `fixed inset-0 flex flex-col`, com o cabeçalho em `px-4 py-3` e as setas
       em `absolute left-2` / `right-2`. Nenhuma menciona `env(safe-area-inset-*)`. Ver uma
       fotografia em grande é a coisa que mais se faz com o telemóvel deitado, e é aí que o
       entalhe come `safe-area-inset-left` (~59 px num iPhone com entalhe): a seta de
       «anterior», a 8 px da margem, fica lá dentro. Em retrato, o `pb-4` de 16 px é menos
       do que os 34 do indicador de gestos.
       A terceira é a que se vê de fora: é a lupa da página que o casal abre.
       `[por confirmar no ecrã]` a medida exacta por aparelho.
     Proposta:
       Uma classe partilhada com `padding: env(safe-area-inset-top) env(safe-area-inset-right)
       env(safe-area-inset-bottom) env(safe-area-inset-left)` na moldura das três — as setas
       e o fecho passam a viver dentro dela sem mais nenhuma mudança. As três são o mesmo
       desenho escrito três vezes; se alguma vez se juntarem num componente, é este o momento.
     Equivalente em desktop: existe

[A2-014] [Agente 2] [Página pública da proposta — formato antigo] [Menor] O quadro de linhas esconde os cabeçalhos no telemóvel mas mantém as colunas de computador
     Largura onde falha: 390 / 430 — abaixo de 640 px
     Onde:
       src/app/[lang]/(privado)/proposta/[token]/page.tsx:526 (o cabeçalho: `hidden sm:flex`)
       src/app/[lang]/(privado)/proposta/[token]/page.tsx:533 (a fila, sem variante)
     Observado:
       O cabeçalho «Descrição / Quantidade / Valor» desaparece abaixo de 640 px, mas a fila
       por baixo mantém `w-12` e `w-28`: a 390 px sobram ~126 px para a descrição, que quebra
       em quatro ou cinco linhas ao lado de **duas colunas de números sem nome nenhum**. Só
       apanha as propostas antigas (as do estúdio trazem `doc` e desenham o `Documento`), mas
       são as que estão em cima da mesa de quem recebeu proposta o ano passado.
     Proposta:
       Abaixo de `sm`, a descrição em cima e «qt × valor» numa linha discreta por baixo, com
       os rótulos por extenso — é o mesmo movimento das linhas adicionais do estúdio.
     Equivalente em desktop: existe

[A2-015] [Agente 2] [Definições · Modelos de email] [Menor] A lista de modelos empilha inteira por cima do editor, que começa abaixo do fold
     Largura onde falha: 390 / 430 / 768 — abaixo de `lg`
     Onde:
       src/app/[lang]/(site)/orcamento/admin/EmailTemplates.tsx:607 (`grid grid-cols-1 lg:grid-cols-[220px_1fr]`)
       src/app/[lang]/(site)/orcamento/admin/EmailTemplates.tsx:614 (`templates.map`, sem tecto)
     Observado:
       Duas colunas viram duas filas, e a fila de cima é a lista toda: cada modelo é um botão
       de ~70 px (nome, marca «por publicar», descrição de duas linhas). Com oito modelos são
       ~560 px — quase os 595 de trabalho — antes de o editor aparecer. **Escolher um modelo
       e vê-lo são duas coisas que nunca estão no mesmo ecrã**, e não há nada que traga a
       vista para baixo depois de escolher.
     Proposta:
       Ou tecto na lista (`max-h-[45vh] overflow-y-auto`, como a `BibliotecaServicos.tsx:126`
       faz), ou — melhor para este ecrã — a lista a colapsar assim que há um modelo escolhido,
       com uma linha «Modelos (8)» que a volta a abrir.
     Equivalente em desktop: existe

[A2-016] [Agente 2] [Fazer proposta · «O que vai sair»] [Menor] A pré-visualização em miniatura só existe a partir de 1536 px
     Largura onde falha: 390 / 430 / 768 — tudo abaixo de `2xl`
     Onde: src/app/[lang]/(site)/orcamento/admin/PainelDoEstudio.tsx:164 (`hidden w-[21rem] shrink-0 2xl:block`)
     Observado:
       O painel que mostra as páginas que a proposta vai gerar está escondido em tudo o que
       não seja um monitor grande. É a mesma decisão do A2-009 e é defensável — 21rem num
       telemóvel não existe. Fica registado por paridade: no telemóvel, saber o que vai sair
       obriga a ir ao passo 2 e gerar. Não é um bug de rutura; é uma funcionalidade que não
       tem porta no telemóvel.
     Proposta:
       Nada urgente. Se um dia se resolver o A2-009 com uma folha, esta cabe lá dentro pelo
       mesmo caminho.
     Equivalente em desktop: existe

---

## Listas sem tecto

Vale a pena tratar isto como uma classe e não como dezasseis correcções, porque **a casa já
tem as duas curas escritas** e usa-as em oito sítios: o tecto com scroll
(`Reminders.tsx:241` → `max-h-[340px] overflow-y-auto`, `CommandPalette.tsx:226`,
`Agenda.tsx:179`, `ClientMessenger.tsx:134`, `Contratos.tsx:552`, `BibliotecaServicos.tsx:126`,
`ModelosParciais.tsx:219`, `Kanban.tsx:483`) e a paginação com «Mostrar mais»
(`AdminClient.tsx:4125` com `LIST_PAGE_SIZE`, `Temas.tsx:3437`). O que falta é aplicá-las às
outras.

A conta é sempre a mesma: **~595 px de trabalho a 390×844**, e a altura de cada linha já com
os alvos de 44 px que o `.alvo-toque` impõe no dedo. Onde a lista está por cima de outra
coisa, o custo não é rolar — é a coisa de baixo passar a estar a N ecrãs de distância.

| Onde | Ficheiro:linha | Altura por item | Parte o ecrã a partir de | O que fica empurrado |
| --- | --- | --- | --- | --- |
| Convidados | `GuestList.tsx:238` | ~104 px (quebra em duas filas) | **6 convidados** | tudo o que vem depois na aba; um casamento de 120 são ~12 500 px, 21 ecrãs |
| Linhas do orçamento (Decoração) | `ProposalStudio.tsx:7068` | ~100 px (~150 com bilingue) | **6 linhas** (4 bilingues) | o total, os adicionais, o «Adicionar linha» |
| Pagamentos | `PaymentsPanel.tsx:773` | ~100 px (a grelha cai a 2 colunas) | **6 pagamentos** | os Custos do Evento, logo a seguir |
| Registo de actividade | `ActivityLog.tsx:269` | ~56 px | **11 entradas** | nada (é o último da aba) — por isso é o menos urgente |
| Tarefas do evento | `EventTasks.tsx:271` | ~76 px | **8 tarefas** | a checklist e o material, que vêm logo abaixo |
| Checklist de produção | `EventChecklist.tsx:259` | ~60 px | **10 itens** | o material da carrinha |
| Material do evento | `EventMaterial.tsx:194` e `:200` | ~48 px por linha, mais o título de cada categoria | **12 linhas** | o `<details>` do plano e do dia |
| Guião do dia | `EventTimeline.tsx:200` | ~60 px | **10 momentos** | o resto do `<details>` |
| Plano de produção | `ProductionPlan.tsx:197` e `:217` | ~48 px por item | **12 itens** | os fornecedores, no fim |
| Cronograma (fases e itens) | `ProposalStudio.tsx:6937` e `:6971` | ~120 px por fase + 52 por item | **4 fases de 3 itens** | a secção do orçamento |
| Versões enviadas | `Versoes.tsx:286` e `:324` | ~90 px por versão, mais uma linha por mudança | **6 versões** | o resto do painel |
| Dia escolhido no calendário | `Calendario.tsx:788` e `:813` | ~64 px | **9 registos no mesmo dia** | os «Próximos eventos» (esses estão bem: `slice(0, 6)`) |
| Modelos de email | `EmailTemplates.tsx:614` | ~70 px | **8 modelos** | o editor inteiro — ver A2-015 |
| Cortes por confirmar | `ProposalStudio.tsx:8739` | ~48 px por corte, dentro da barra `sticky` | **4 cortes** | a pré-visualização — ver A2-011 |
| Nomes por arrumar | `NomesPorArrumar.tsx:101` | ~56 px | **10 nomes** | a grelha de temas |
| Propostas por registar | `Acompanhamento.tsx:315` | ~90 px (quebra) | **6 propostas** | a lista de seguimento, que é o assunto do ecrã |
| Contas que não fecham | `ProposalStudio.tsx:8005` | ~34 px | **17 motivos** (na prática nunca acontece) | — só por completude |

Fora da tabela, e de propósito: `Clientes.tsx:313`, `Fornecedores.tsx:483`,
`Inventario.tsx:600`, `Material.tsx:611`, `MaterialListas.tsx:259` e `Tarefas.tsx:696` também
não têm tecto, mas são **listas que são o ecrã inteiro** — aí crescer para baixo é o que uma
lista faz, e o remédio certo é o «Mostrar mais» dos Pedidos, não um scroll dentro do scroll.
Uma lista com scroll próprio dentro de uma página que também rola é das poucas coisas que no
telemóvel se lê como avaria.

**A ordem por que eu atacaria:** `GuestList` e `PaymentsPanel` primeiro, porque estão no meio
de abas com trabalho por baixo; as linhas do orçamento a seguir, que já vão ser mexidas pelo
A2-001; `EmailTemplates` depois, que é uma linha de CSS; e o resto por tecto simples.

---

## Resumo

1. **16 entradas: 2 Bloqueia, 7 Graves, 7 Menores** — mais o inventário de 17 listas sem tecto.
2. As três piores: **A2-001** (a caixa do nome de uma linha de orçamento com 62 px, 27 com
   bilingue — o texto que o casal vai ler escrito às cegas), **A2-002** (a barra de
   etiquetagem da biblioteca escondida por trás da navegação: escolhe-se e não se etiqueta) e
   **A2-009** (abaixo de 1280 px não há «o que falta para enviar», e o motivo de o botão estar
   travado vive num `title` que o dedo não sabe abrir).
3. Nada disto é desenho novo: **cinco das dezasseis já têm a correcção escrita no repositório**
   — `ProposalStudio.tsx:7478` para o A2-001 e o A2-004, `ProposalStudio.tsx:8440` para o
   A2-002, `FolhaOuDialogo.tsx:180` para o A2-005 e o A2-007, `Temas.tsx:345` para o A2-003.
4. Três diálogos ainda em `vh` onde a casa decidiu `dvh` (A2-007, A2-010, e o `80vh` do
   `CriarAPartirDe.tsx:239`, esse ainda dentro da folga).
5. Seis sítios com barras coladas ao fundo; **três** contam com a área segura e a barra de
   destinos, três não.
6. O painel da biblioteca do #79/#80 **está bom** salvo o tecto em `vh` (A2-010) — a fila de
   pastilhas, a lupa com `.alvo-invisivel` e o rodapé em `flex-wrap` aguentam.
7. Larguras: nada transborda para o lado de forma visível, mas isso é a rede
   `body { overflow-x: clip }` a fazer o seu trabalho — o preço é que o transbordo aparece
   como conteúdo cortado em vez de scroll, e num iPhone anterior ao iOS 16 nem essa rede
   existe (a nota está em `globals.css:753`).
8. As tabelas estão todas resolvidas (`TabelaOuCartoes`, `hidden md:block` + cartões) e o
   calendário troca as etiquetas por pontos abaixo de `sm`. Não há nada a dizer aí.
9. O que **não** consegui verificar sem ecrã está marcado `[por confirmar no ecrã]`: o
   comportamento com o teclado aberto no A2-008, a ordem exacta em que a barra do A2-002
   quebra, e as medidas de área segura por aparelho no A2-005, A2-006 e A2-013.
10. Recomendação de sequência: A2-001 e A2-002 primeiro (são as duas que impedem uma tarefa),
    depois o lote da área segura (A2-005, A2-006, A2-007, A2-013 — quatro correcções de uma
    linha cada), depois o A2-009, que é o único que precisa de desenho novo.
