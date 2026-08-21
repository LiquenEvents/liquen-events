# Agente 5 — Navegação e orientação

**Resumo.** O back office tem uma navegação bem pensada e **nenhuma história**. Todo o produto —
dezoito vistas, a gaveta do pedido, os três separadores das ferramentas, os três passos do
estúdio, treze janelas modais e duas lupas de fotografias — vive num só endereço,
`/orcamento/admin`, e move-se por `useState`. Em `src/` inteiro não há **um único**
`history.pushState`, `popstate`, `hashchange` ou `router.push` dentro do back office (o único
sítio do repositório que escreve história é a galeria pública, `GaleriaClient.tsx:1281`). No
iPhone isso não é um detalhe de implementação: o gesto de deslizar da esquerda **é** o botão de
voltar, faz-se por acidente umas quantas vezes por dia com o telemóvel numa mão, e aqui ele não
recua um passo — sai do back office inteiro, para o separador anterior ou para nada. E porque o
manifesto manda o `start_url` para o site público (`src/app/manifest.ts:10`), quem adicionar
isto ao ecrã principal não tem sequer caminho de volta que não seja escrever o endereço à mão.
O caso pior é o mais comum: **com um pedido aberto a 390 px, a barra de baixo sai do ecrã, a
gaveta de detalhe é `w-full z-50` e tapa o cabeçalho onde vive o hambúrguer suplente — fica um
único alvo de saída no ecrã todo, e é um «×» no canto superior direito.** O comentário do
código a duas linhas de distância promete o contrário. Fora isso, a orientação parte em dois
sítios previsíveis: as tiras de fases (5 passos no pedido, 7 no Dossier) são mais largas do que
o ecrã, rolam de lado e **nunca trazem à vista o passo onde se está**, portanto respondem a «que
fases existem» e não à pergunta que se faz; e o cabeçalho fixo diz sempre o nome da VISTA
(«Temas», «Fazer proposta») mesmo quando se está três níveis lá dentro. O estado da vista é o
capítulo mais irregular de todos: o estúdio guarda o rascunho, as dobras das secções e as dobras
dos mood boards no `localStorage` — mas não guarda em que PASSO se estava, e mudar de vista
desmonta tudo e não sobe ao topo, portanto tocar em «Visão Geral» a meio da lista de pedidos
deixa-a a meio da Visão Geral. Nota boa, para não parecer que está tudo mal: o `TabelaOuCartoes`,
o `FolhaOuDialogo`, a folha de acções da fotografia, o `MoodBoardIndice` e a Conferência do passo
3 são adaptações a sério — foram desenhadas para o polegar, não encolhidas. O problema é que só
metade da casa as usa.

---

## Voltar, sair, fechar

[A5-001] [Agente 5] [Todo o back office] [Grave] Nada escreve história — o «voltar» do Safari sai do produto inteiro
     Largura onde falha: todas (mas só dói no toque, portanto 390 / 430)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:1037 (`const [view, setView] = useState<View>("overview")`),
       :1479-1481 e :1497 (a vista vai para o `localStorage`, não para o endereço),
       src/app/[lang]/(site)/orcamento/admin/nav.tsx:39-42
     Observado: a vista, a gaveta do pedido (`selected`), o separador das ferramentas
       (`detailTab`), o passo do estúdio (`step`) e as treze janelas modais são todos estado de
       React. Uma busca por `pushState|replaceState|popstate|hashchange` em `src/` devolve
       resultados só em `GaleriaClient.tsx` — o back office não tem nenhum. Logo, a pilha de
       história tem UMA entrada para tudo o que aqui se faz, e `history.back()` salta para o que
       estava antes de `/orcamento/admin`: um separador em branco, o site público, ou a página
       de onde ela seguiu o link. No iOS o gesto de deslizar da margem esquerda dispara isso, e
       dispara-se sem se querer — é o mesmo gesto de rolar de lado, e o back office está cheio
       de tiras que rolam de lado encostadas à margem (a tira de fases, o índice dos mood
       boards, os filtros de veículo do carregamento).
       Detalhe agravante em `nav.tsx:39-42`: o comentário diz que várias vistas «still render if
       reached by a direct link». Não há link directo nenhum — não existe encaminhamento por
       hash nem por query, e a restauração da vista (`AdminClient.tsx:1480`) filtra por
       `NAV.some(...)`. O comentário descreve uma porta que não foi construída.
     Proposta: uma camada fina de história por cima do que já existe, sem trocar a arquitectura
       de página única. `pushState` em três momentos — mudar de vista, abrir um pedido, mudar de
       passo do estúdio — com o estado no `history.state`, e um `popstate` que o volta a aplicar
       em vez de deixar sair. Isso, sozinho, faz o gesto de voltar recuar um passo em vez de
       fechar a porta, e dá de borla o que falta em `A5-016`: endereços que se guardam nos
       favoritos («o Calendário», «este pedido»). As janelas modais entram na mesma camada — ver
       `A5-003`.
     Equivalente em desktop: existe (o mesmo defeito, mas com rato ninguém carrega no «voltar»
       por engano, e o teclado tem o Escape que aqui não há).

[A5-002] [Agente 5] [Pedido aberto] [Bloqueia] Com o pedido aberto sobra UM alvo de saída no ecrã todo, e está no canto que o polegar não alcança
     Largura onde falha: 390 / 430 (abaixo de 448 px, que é onde `max-w-md` deixa de morder)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4164 (a gaveta:
       `fixed ... right-0 z-50 flex w-full max-w-md`), :3157-3158 (a barra de baixo:
       `selected ? "translate-y-full"`), :3296-3300 (o hambúrguer suplente do cabeçalho),
       :3283 (o cabeçalho: `sticky top-0 z-30`), :4140 (o fundo escuro)
     Observado: três coisas ao mesmo tempo, e é a soma que fecha a porta.
       1. A barra de baixo sai do ecrã enquanto há um pedido aberto (`translate-y-full`).
       2. O cabeçalho, que passa a mostrar o hambúrguer «suplente», é `z-30`; a gaveta é `z-50`,
          `fixed inset-y-0 right-0` e `w-full max-w-md` — a `md` são 448 px, portanto a 390 e a
          430 a gaveta ocupa o ecrã INTEIRO e desenha-se por cima do cabeçalho. O suplente
          renderiza-se e fica debaixo dela.
       3. O fundo escuro (`fixed inset-0 z-40 ... xl:hidden`, que fecha ao toque) fica igualmente
          tapado pela gaveta a toda a largura — não sobra um pixel dele para tocar.
       Resta o «×» de `AdminClient.tsx:4407-4426`, no canto superior direito. E o comentário em
       :3288-3297 diz, com todas as letras, «este aparece exactamente quando a outra sai... 
       continua a haver UM abridor de cada vez» — a intenção está certa e a `z-index` desmente-a.
       Somando o `A5-001`: o gesto que toda a gente faz para sair de um ecrã destes no iPhone
       (deslizar da esquerda) sai do back office, não fecha a gaveta. [por confirmar no ecrã: a
       cobertura do cabeçalho vê-se num instante — abrir um pedido a 390 px e procurar o
       hambúrguer.]
     Proposta: duas linhas e um gesto. (a) O cabeçalho passa a `z-[60]` enquanto o painel é
       sobreposição (ou o suplente sai do cabeçalho e entra na barra da própria gaveta, ao pé do
       «×», que é mais honesto: a gaveta é que é o ecrã). (b) Um botão «‹ Pedidos» à esquerda da
       barra da gaveta, com 44 px, para haver uma saída que não seja um «×» de canto — «voltar»
       e «fechar» não são a mesma promessa. (c) Fechar com o gesto de voltar, via `A5-001`.
     Equivalente em desktop: não existe — a partir de `xl` o painel é uma coluna encostada, o
       cabeçalho está sempre à vista e a barra lateral também.

[A5-003] [Agente 5] [Diálogos e folhas] [Grave] Nenhuma janela fecha com o gesto de voltar — e onze das treze não são folhas
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/LupaDeFotos.tsx:52-68 (só Escape),
       src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:46-51 e :99,
       src/app/[lang]/(site)/orcamento/admin/RestoreDialog.tsx:169 e :275-282,
       src/app/[lang]/(site)/orcamento/admin/ThemePicker.tsx:1437-1454 e :1834,
       src/app/[lang]/(site)/orcamento/admin/PhotoLightbox.tsx:80 e :136-139,
       e ainda CommandPalette, AjudaGlossario, ShortcutsModal, PasskeysDialog, CriarAPartirDe,
       ThemeCopyDialog, SessaoExpirada
     Observado: catorze superfícies com `aria-modal`, e o padrão de saída é um `keydown` de
       Escape — uma tecla que num iPhone não existe. Nenhuma delas ouve `popstate`, portanto
       deslizar da esquerda para fechar a lupa fecha o back office. Pior no `ThemePicker`, que
       tem DUAS camadas empilhadas (a folha da biblioteca e, por cima, a pré-visualização de
       `ThemePicker.tsx:2657`): um gesto deita as duas fora e ainda leva o estúdio atrás.
       E há um segundo problema, de família: só três destas caixas viram folha inferior no
       telemóvel (`ThemePicker`, `ThemeCopyDialog` e o `FolhaOuDialogo` partilhado, que é usado
       exclusivamente pelo `ProposalStudio`). As outras onze são o mesmo diálogo centrado a
       todas as larguras, com o botão de fechar no canto superior direito, que é o ponto mais
       longe do polegar de quem segura o telemóvel. A casa TEM a peça certa — `ui/FolhaOuDialogo.tsx`,
       com pega de arrastar, acções encostadas ao fundo e `env(safe-area-inset-bottom)` — e ela
       está a ser usada num ficheiro só.
     Proposta: um gancho `useVoltarFecha(aberto, onFechar)` que faz `pushState` ao abrir e
       `onFechar` no `popstate`, aplicado uma vez dentro de `FolhaOuDialogo` e do `useFocusTrap`
       (assim apanha as catorze de uma vez, incluindo as que ainda não existem). E migrar as
       onze restantes para `FolhaOuDialogo` — por ordem de uso no telemóvel: `NewQuoteModal`,
       `LupaDeFotos`, `PhotoLightbox`, `CriarAPartirDe`, `AjudaGlossario`, e as outras a seguir.
     Equivalente em desktop: existe (Escape, e o rato chega ao canto sem esforço).

[A5-004] [Agente 5] [Novo pedido] [Menor] O «Novo pedido» fecha ao toque na borda, a meio de escrever, sem perguntar
     Largura onde falha: 390 / 430 (a 16 px de borda tocável de cada lado, `p-4`)
     Onde: src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:99-100
       (`className="fixed inset-0 ... p-4" onClick={onClose}`)
     Observado: o `onClick` está na camada inteira e não há guarda de sujidade nenhuma — ao
       contrário do painel do pedido, que tem o `discardGuard` de `AdminClient.tsx:1790`. Com
       nove campos preenchidos, um toque a 8 px da borda fecha a caixa sem uma palavra.
       Atenuante honesta: o estado (`f`) vive no componente e o componente fica montado
       (`if (!open) return null` em :95), portanto o que estava escrito reaparece ao reabrir. Só
       que nada no ecrã o diz, e quem fecha sem querer conclui que perdeu o trabalho — e volta a
       escrevê-lo por cima.
     Proposta: fechar pela borda só quando os campos estão vazios; com alguma coisa escrita,
       passar pelo mesmo `window.confirm` do painel do pedido. E, quando isto for folha (ver
       `A5-003`), o gesto de arrastar para baixo passa a ser a saída óbvia e o problema
       desaparece sozinho.
     Equivalente em desktop: existe (o mesmo comportamento, com a diferença de que 16 px de
       borda não se tocam por acaso com um rato).

---

## Onde estou, o que falta

[A5-005] [Agente 5] [Pedido aberto · Dossier] [Grave] As duas tiras de fases são mais largas do que o ecrã e nunca mostram onde se está
     Largura onde falha: 390 / 430 (a de 7 fases do Dossier parte bem acima de 768)
     Onde: src/app/[lang]/(site)/orcamento/admin/LifecycleStepper.tsx:108-111 (`overflow-x-auto`)
       e :143 (`whitespace-nowrap`), usada em AdminClient.tsx:4436;
       src/app/[lang]/(site)/orcamento/admin/evento/[id]/DossierHeader.tsx:452-455 (a mesma
       receita com sete fases), rótulos em src/lib/orcamento/dossier.ts:65-73
     Observado: cinco passos («Pedido · Proposta · Contrato · Pagamento · Evento»), cada um
       `shrink-0` com `whitespace-nowrap` e `px-2`, mais quatro traços de `w-6` — a fila pede à
       volta de 450 px num sítio onde sobram ~340. A do Dossier é pior: sete fases, com
       «Proposta enviada» e «Semana do evento» a 16 caracteres cada, facilmente 650-700 px.
       [por confirmar no ecrã: a largura exacta.] O mecanismo, esse, é certo sem medir nada:
       ambas são `overflow-x-auto` e **nenhuma das duas faz `scrollIntoView` do passo actual** —
       não há uma única chamada dessas em nenhum dos dois ficheiros. Portanto a tira abre sempre
       no princípio, e um casamento em «Semana do evento» mostra três bolinhas cinzentas de
       fases já passadas e esconde a única que responde à pergunta. Um indicador de «onde estou»
       que precisa de ser rolado para dizer onde se está é um indicador que não diz nada. Junte-
       -se que no iOS não há barra de scroll visível: nada anuncia que a fila continua.
     Proposta: (a) `useEffect` que traz o passo `aria-current` à vista (`block: "nearest",
       inline: "center"`) ao montar e ao mudar de fase — três linhas em cada ficheiro; (b) abaixo
       de `sm`, uma forma condensada em vez da fila inteira: «Fase 4 de 5 · Pagamento» com os
       cinco pontos por baixo, que cabe em 200 px e diz mais; (c) máscara de desvanecimento à
       direita, para se ver que há mais.
     Equivalente em desktop: existe (a fila cabe e lê-se de uma vez).

[A5-006] [Agente 5] [Estúdio · Conteúdo] [Grave] No passo mais comprido do produto não há nada, no telemóvel, que diga em que secção se está
     Largura onde falha: 390 / 430 / 768 / até 1279 px
     Onde: src/app/[lang]/(site)/orcamento/admin/NavEstudio.tsx:110
       (`sticky top-4 hidden ... xl:block`), usada em ProposalStudio.tsx:5551-5557;
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:9689 (a `StepNav`:
       `className="mb-5 flex flex-wrap ..."` — sem `sticky`)
     Observado: o passo «Conteúdo» tem sete secções (Evento, Capas, Serviços, Mood boards,
       Cronograma, Orçamento, Total e validade) e o próprio cabeçalho do `NavEstudio` mede-lhe
       «dois ecrãs e meio vazio, cinco e meio feito» — num monitor. Num iPhone são bem mais.
       A coluna que responde a «onde estou / o que já está preenchido» só existe a partir de
       1280 px. Abaixo disso ficam duas coisas, e nenhuma faz esse trabalho: a `StepNav`, que
       diz 1/2/3 e não sabe nada das sete secções, e **não é fixa** — vive no topo do formulário
       e desaparece ao primeiro rolar (o comentário em ProposalStudio.tsx:5531 chama-lhe «sempre
       visível», o que é verdade no computador e não no telemóvel); e a barra fixa do fundo
       (ProposalStudio.tsx:8442), que é excelente mas fala de dinheiro e da acção seguinte, não
       de posição.
       Justiça ao código: a metade «o que falta» ESTÁ resolvida — a Conferência
       (`Conferencia.tsx`, no passo 3) mostra o que trava o envio em qualquer largura, e o
       comentário em ProposalStudio.tsx:8388-8399 explica que foi de propósito. O que ficou por
       resolver é a metade «onde estou» enquanto se escreve.
     Proposta: pôr a `StepNav` `sticky top-[altura-do-cabeçalho]` abaixo de `lg` — custa uma
       classe e devolve o «1 · 2 · 3» ao ecrã todo o tempo. E, a seguir, uma tira horizontal de
       secções por baixo dela, com o mesmo desenho da tira do `MoodBoardIndice`
       (`MoodBoardIndice.tsx:108`), que já é a forma da casa para um índice num telemóvel — os
       dados (`seccoes`, `faltas`, `porTraduzir`) já estão calculados e já são passados; falta a
       forma estreita.
     Equivalente em desktop: existe (`NavEstudio`, e é bom).

[A5-007] [Agente 5] [Todo o back office] [Grave] O cabeçalho fixo diz sempre o nome da vista, mesmo três níveis lá dentro
     Largura onde falha: 390 / 430 (no computador o contexto vem da coluna da esquerda)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3341-3352 (o `<h1>` sai de
       `VIEW_TITLES[view]`), :2745-2760 (a tabela de títulos);
       src/app/[lang]/(site)/orcamento/admin/Temas.tsx:2831 («← Temas», e não é fixo);
       src/app/[lang]/(site)/orcamento/admin/FazerProposta.tsx:214-235 (o cartão «Proposta para»,
       também não é fixo)
     Observado: o `<h1>` do cabeçalho só conhece a VISTA. Abrir um tema com 300 fotografias
       deixa o cabeçalho a dizer «Temas»; escolher um cliente e escrever cinco ecrãs de proposta
       deixa-o a dizer «Fazer proposta». O que dá contexto — o nome do tema, o nome do casal —
       está num cartão normal que rola e desaparece ao terceiro gesto. Resultado: a única coisa
       permanentemente visível no ecrã é a que menos informação tem, e quem pousa o telemóvel
       para atender uma chamada volta sem saber em que proposta estava. É a mesma queixa em três
       ecrãs.
     Proposta: o `<h1>` passa a aceitar um sufixo de contexto que a vista publica («Temas ·
       Terracota», «Proposta · Ana & Rui»), com `truncate` como já tem. Duas linhas em
       `AdminClient` e uma chamada em cada vista que tenha profundidade interna (Temas,
       FazerProposta, Material). Não muda o computador.
     Equivalente em desktop: existe (a coluna da esquerda marca a vista e o cartão de contexto
       cabe ao lado, sem competir).

[A5-008] [Agente 5] [Fazer proposta] [Menor] Duas contagens de passos no mesmo ecrã, com números diferentes
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/FazerProposta.tsx:263 («Passo 1 de 2») e
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:345-349 (1 · Conteúdo,
       2 · Pré-visualizar, 3 · Enviar)
     Observado: escolher o cliente diz-se «Passo 1 de 2»; assim que se escolhe, o ecrã seguinte
       — que era o «passo 2 de 2» — abre com «1 · Conteúdo» de três. Num ecrã largo lê-se como
       duas escalas; num telemóvel, onde só se vê uma de cada vez, lê-se como um contador que
       andou para trás.
     Proposta: ou uma escala só («1 · Cliente, 2 · Conteúdo, 3 · Pré-visualizar, 4 · Enviar»),
       ou tirar a numeração ao primeiro e chamar-lhe o que ele é — «Para quem é a proposta?» já
       está escrito na linha a seguir e chega.
     Equivalente em desktop: existe (o mesmo, e igualmente confuso).

[A5-009] [Agente 5] [Pedido aberto] [Grave] Os três separadores das ferramentas empilham num bloco alto e o painel abre fora da vista
     Largura onde falha: 390 / 430 / até 639 px
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:5068-5070
       (`role="tablist" className="grid grid-cols-1 gap-3 sm:grid-cols-3"`), :5100 (`onClick`)
     Observado: abaixo de `sm` os três separadores (Produção, Financeiro, Comunicação) empilham
       na vertical, e cada um é um cartão com ícone de 36 px, rótulo, uma linha de dica e uma
       pastilha de contagem — à volta de 110 px cada, mais dois intervalos de 12: uns 355 px de
       separador antes de começar o conteúdo. [por confirmar no ecrã.] Duas consequências: para
       ver qual está activo é preciso rolar os três, e ao tocar em «Produção» nada rola — o
       painel abre POR BAIXO do bloco todo, e o ecrã continua a mostrar exactamente o que
       mostrava. Num telemóvel isso lê-se como um toque que não pegou, e o remédio de quem está
       de pé é tocar outra vez.
     Proposta: abaixo de `sm`, o mesmo trio numa fila de pastilhas que rola de lado — rótulo e
       pastilha de contagem, sem ícone nem dica (a dica é boa num monitor e é ruído num
       telemóvel). E um `scrollIntoView({ block: "start" })` no painel ao trocar de separador,
       para o toque ter resposta visível. Aqui não vale a pena a Escada dos Passos: o
       `TabelaOuCartoes` já provou nesta casa que a forma estreita se escreve à mão.
     Equivalente em desktop: existe (`sm:grid-cols-3` — os três cartões lado a lado e o painel
       logo por baixo, tudo à vista).

---

## Índices e listas laterais

[A5-010] [Agente 5] [Estúdio] [Menor] O painel «O que vai sair» só existe acima de 1536 px, e não tem substituto
     Largura onde falha: 390 / 430 / 768 (tudo abaixo de 1536)
     Onde: src/app/[lang]/(site)/orcamento/admin/PainelDoEstudio.tsx:65 (`(min-width: 1536px)`)
       e :164 (`hidden w-[21rem] shrink-0 2xl:block`)
     Observado: a decisão está bem tomada e bem escrita — o painel rouba largura ao trabalho, e
       `useLarguraQueChega` até evita o custo de o desenhar. Mas o que ele responde («como é que
       esta página vai sair no PDF») não tem, no telemóvel, resposta nenhuma que não seja gerar
       o PDF no passo 2 e descarregá-lo. A `PreviaDaPagina` é um componente puro e barato; o que
       falta é um sítio estreito onde ele caiba.
     Proposta: no cartão de cada mood board, um botão «Ver a folha» que abre a `PreviaDaPagina`
       numa `FolhaOuDialogo` — reaproveita as duas peças que já existem, não ocupa largura
       nenhuma e responde à pergunta no sítio onde ela se faz. Fica como consulta, não como
       painel: é o princípio do `README.md` desta pasta.
     Equivalente em desktop: existe (acima de 1536).

[A5-011] [Agente 5] [Estúdio · Mood boards] [Menor] A tira do índice rola de lado e a página onde se está não é trazida à vista
     Largura onde falha: 390 / 430 (com cinco ou mais páginas)
     Onde: src/app/[lang]/(site)/orcamento/admin/MoodBoardIndice.tsx:108
       (`flex gap-1.5 overflow-x-auto ... lg:flex-col`), :198 (`shrink-0`), :264-302
       (`useBoardAVista`, que calcula o activo e não faz nada com o scroll da tira)
     Observado: esta é das melhores adaptações da casa — vira tira horizontal abaixo de `lg`,
       tem a pega de arrasto separada do alvo de saltar, e tem `aria-current`. Só que cada
       entrada é `shrink-0` com número + título truncado + estado, uns 130-150 px, e à sexta
       página a tira já é mais larga do que o ecrã. O observador SABE qual é a página à vista
       (`activo`) e só a pinta; ninguém a rola para dentro do ecrã. É o mesmo defeito do
       `A5-005`, noutro sítio: o «você está aqui» existe e está fora do ecrã.
     Proposta: um `useEffect` sobre `activo` que faça `scrollIntoView({ block: "nearest",
       inline: "center" })` na entrada correspondente. Cinco linhas, e a tira passa a acompanhar
       o rolo do formulário.
     Equivalente em desktop: existe (a partir de `lg` é coluna e vê-se inteira).

[A5-012] [Agente 5] [Página do casal] [Menor] O índice fica no topo e não há caminho de volta a ele
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(privado)/proposta/[token]/Documento.tsx:697-715 (o `<nav>` do índice)
     Observado: a proposta pública tem um índice honesto («Serviços · Inspiração · Orçamento ·
       Condições») e usa âncoras `#...` — que, ao contrário de todo o back office, ESCREVEM
       história: no telemóvel do casal o gesto de voltar funciona ali e leva de volta ao topo.
       O que falta é o caminho para a frente: o índice vive uma vez, no topo, e a partir do
       momento em que se salta para «#orcamento» — que numa proposta a sério fica seis ou sete
       ecrãs abaixo — não há nada fixo que permita mudar de secção. Rola-se para trás com o dedo,
       ou não se muda.
     Proposta: uma volta ao topo discreta, fixa no canto inferior, a aparecer depois do primeiro
       ecrã de rolo. Não uma barra de navegação fixa: o documento é para se ler de cima a baixo
       e uma barra permanente tira-lhe o ar. [por confirmar no ecrã: se o índice em `flex-wrap`
       parte para três linhas a 390 px com os quatro rótulos.]
     Equivalente em desktop: não existe (o mesmo índice, mas com muito menos rolo pelo meio e
       com a roda do rato).

---

## Profundidade de navegação

[A5-013] [Agente 5] [Material · Pedido] [Bloqueia] A checklist da carrinha — a única tarefa que É de telemóvel — está a quatro toques e não tem entrada nenhuma na navegação
     Largura onde falha: todas (mas é uma tarefa que só se faz a 390)
     Onde: src/app/[lang]/(site)/orcamento/admin/EventMaterial.tsx:162-170 (o único link para
       `/orcamento/admin/carregamento/<id>` em todo o repositório), montado em
       AdminClient.tsx:5201 (dentro do painel «Produção», debaixo de `EventTasks` e
       `EventChecklist`); a vista «Material» da gaveta (nav.tsx:61) é o catálogo e as regras, e
       não leva a lado nenhum
     Observado: é a tarefa do enunciado — de pé, ao lado da carrinha, mãos ocupadas, rede fraca
       — e é a que está mais fundo. Caminho normal: barra de baixo → Pedidos (1) → encontrar e
       tocar no pedido (2) → rolar até ao bloco de separadores → «Produção» (3) → rolar por cima
       de duas ferramentas grandes (Tarefas do evento, Checklist) → «Abrir para carregar» (4).
       Melhor caso, quando o evento é o que a Visão Geral destaca e a fase manda em «producao»
       (`AdminClient.tsx:detailNextAction`): dois toques e quatro ecrãs de rolo. A vista
       «Material» da gaveta, que é onde qualquer pessoa iria procurar, não tem um único caminho
       para a checklist de um evento — está grepado, o link existe em um sítio só.
       Ironia amarga: o `sw.js:184-195` põe expressamente esta rota a funcionar offline. A casa
       fez o trabalho difícil (funciona sem rede, guarda as marcações no aparelho, sincroniza
       depois) e deixou por fazer o fácil: pô-la ao alcance do polegar.
     Proposta: uma entrada de primeira classe. Na Visão Geral, no cartão do próximo evento, um
       segundo botão «Carregar a carrinha» quando existe checklist gerada — um toque, sempre.
       E, em `Material`, um separador «Carregamentos» a listar os eventos dos próximos dias com
       a percentagem de cada um. Enquanto `A5-001` não existir, isto é um `<a href>` normal, o
       que já dá o voltar do browser de borla.
     Equivalente em desktop: existe (o mesmo caminho, mas lá o rolo é uma roda e a tarefa nem
       se faz ao computador).

[A5-014] [Agente 5] [Carregamento] [Grave] A rota do carregamento não tem porta de saída
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:232-260
       (o cabeçalho fixo: título, contador, barra de progresso — e mais nada), :374-415 (a barra
       fixa de baixo: só «Dar por carregada»)
     Observado: o ecrã é bom — cabeçalho fixo com o contador, alvos grandes, funciona sem rede,
       a acção de fecho está sempre ao alcance do polegar. E não tem um único link ou botão que
       leve de volta ao pedido, ao Material ou ao back office. Compare-se com o Dossier, que
       resolveu exactamente este problema e escreveu porquê
       (`evento/[id]/DossierHeader.tsx:160-188`: «A ÚNICA SAÍDA DESTE ECRÃ, e media 65×16 px»).
       Aqui não há sequer o alvo pequeno: não há nenhum. A saída é o gesto de voltar — que aqui
       até funciona, porque se chegou por navegação de documento — só que devolve ao back office
       com a gaveta do pedido fechada e a lista no topo (ver `A5-018`), portanto é preciso
       encontrar o pedido outra vez.
     Proposta: o mesmo «← Pedido» do Dossier, com `alvo-toque`, no cabeçalho fixo, a apontar
       para o pedido de onde se veio (o `quoteId` já está em mão — `Carregamento.tsx:46`). E, no
       fim do carregamento, mandar de volta para lá em vez de deixar o ecrã parado a dizer
       «Carrinha carregada».
     Equivalente em desktop: não existe (é a mesma rota, com a mesma ausência).

[A5-015] [Agente 5] [Inventário] [Grave] O «Modo de carga» não é alcançável por caminho nenhum
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/ModoDeCarga.tsx (o ecrã),
       src/app/[lang]/(site)/orcamento/admin/Inventario.tsx:340 (o único sítio que o monta),
       src/app/[lang]/(site)/orcamento/admin/nav.tsx:44-47 (a vista `inventario` foi tirada do
       menu a pedido dela), AdminClient.tsx:1771-1776 (a paleta só oferece o que está em `NAV`),
       :265-275 (os acordes de teclado não têm `i`), :1480 (a restauração filtra por `NAV`)
     Observado: o `ModoDeCarga` é, pelo cabeçalho dele, o ecrã mais bem desenhado para o telemóvel
       de toda a aplicação — «a LINHA INTEIRA é o alvo», funciona sem rede, sobrevive a fechar o
       browser. E não há forma de lá chegar: vive dentro da vista `Inventário`, que foi retirada
       do `NAV`; e como a paleta de comandos só lista `NAV`, e não existe encaminhamento por
       hash nem por query (ver `A5-001`), a vista não tem porta. Nem escrevendo a chave à mão no
       `localStorage`, porque a restauração valida contra `NAV`. É código vivo, mantido e
       inalcançável.
       (Vale o mesmo, com menos peso, para `clientes`, `kanban`, `fornecedores`,
       `modelos-email`, `servicos` e `acompanhamento`.)
     Proposta: decidir. Ou o Modo de Carga é adoptado pela vista `Material` — que é onde ela o
       procuraria — e passa a ter entrada; ou o `Inventário` volta ao `MORE_NAV`; ou, se
       realmente não é para existir, apaga-se e apaga-se o comentário do `nav.tsx` que promete
       um «direct link» que não há. O estado de hoje é o pior dos três: paga-se a manutenção e
       não se recebe o uso.
     Equivalente em desktop: não existe (é inalcançável em qualquer largura).

[A5-016] [Agente 5] [Entrada no back office] [Grave] Instalar no ecrã principal dá acesso ao site público, não ao back office
     Largura onde falha: todas (mas só existe em telemóvel)
     Onde: src/app/manifest.ts:10-11 (`start_url: "/"`, `display: "standalone"`)
     Observado: o `start_url` é a página de marketing. Quem fizer «Adicionar ao ecrã principal»
       a partir do back office fica com um ícone que abre... o site público — de onde o back
       office não está ligado (é `noindex` e está fora do `robots`), portanto o caminho é
       escrever `/orcamento/admin` no endereço, dentro de uma janela `standalone` que no iOS nem
       barra de endereço tem. E `display: standalone` tira o botão de voltar do Safari, o que
       transforma o `A5-001` de «sai do back office» em «sai para lado nenhum e fica-se preso».
       Nota separada, no mesmo ficheiro: não há `shortcuts`, que é exactamente o mecanismo com
       que se resolveria o `A5-013` — um toque longo no ícone e «Carregar a carrinha».
     Proposta: um manifesto próprio para o back office (`/orcamento/admin/manifest.webmanifest`)
       com `start_url: "/orcamento/admin"`, `scope: "/orcamento/admin"`, `id` próprio e dois ou
       três `shortcuts` (Pedidos, Fazer proposta, Carregamento). O manifesto público fica como
       está — são dois produtos e devem ser dois ícones.
     Equivalente em desktop: não existe (no computador chega-se pelos favoritos).

[A5-017] [Agente 5] [Dossier] [Menor] O «← Pedidos» devolve à lista e perde o pedido de onde se veio
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/evento/[id]/DossierHeader.tsx:173-188
       (`href={/${lang}/orcamento/admin}`), AdminClient.tsx:1479-1481 (a vista restaurada) e
       :1037 (`selected` começa sempre a `null`)
     Observado: o alvo está bem dimensionado e a intenção está escrita — é a única saída do
       ecrã. Só que devolve à raiz do back office, que restaura a VISTA do `localStorage` e
       nunca o pedido: chega-se à lista, no topo, com a gaveta fechada, e é preciso encontrar
       outra vez o casamento de onde se saiu. E o rótulo promete «Pedidos» quando o que abre é
       a última vista guardada — quase sempre «pedidos», porque `openQuote` (`AdminClient.tsx:1877`)
       força essa vista, mas não é uma garantia.
     Proposta: assim que houver a camada de história do `A5-001`, isto deixa de ser um link e
       passa a ser `history.back()`, que devolve exactamente ao sítio de onde se veio. Até lá, um
       parâmetro que reabra o pedido (`?pedido=<id>`) é a versão barata e resolve o essencial.
     Equivalente em desktop: existe (mesmo defeito; custa menos porque a lista se varre com os
       olhos).

---

## Estado da vista

[A5-018] [Agente 5] [Todo o back office] [Grave] Mudar de vista não sobe ao topo, e nenhuma vista guarda a posição do rolo
     Largura onde falha: 390 / 430 (no computador as vistas cabem quase sempre)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:2821 (`-mt-24 min-h-screen
       bg-surface flex` — o rolo é o da janela, não há contentor com `overflow-y-auto`),
       :3474 em diante (cada vista é `{view === "x" && <div className={VIEW_WRAP + " view-in"}>}`,
       portanto desmonta), :3179-3186 (a barra de baixo faz só `setView`)
     Observado: duas metades do mesmo buraco.
       (a) **Não sobe.** Tocar em «Visão Geral» a 2000 px de rolo dentro da lista de pedidos
       troca o conteúdo e deixa o `scrollY` onde estava — cai-se a meio da Visão Geral, com o
       cabeçalho já encolhido (`desceu`), a parecer uma página já lida. Não há um `scrollTo` em
       lado nenhum do `AdminClient` (só medições, :1696).
       (b) **Não volta.** Como a vista desmonta, voltar a ela recomeça do princípio: rolo,
       filtros internos, tudo. Nada guarda posição — a única `scrollRestoration` de toda a
       aplicação vive na galeria pública (`GaleriaClient.tsx:644,767`), onde alguém já resolveu
       este problema com cuidado. O back office não aproveita nada disso.
     Proposta: subir ao topo em cada `setView` (uma linha, e resolve a metade que hoje parece
       avaria), e guardar `scrollY` por vista num `Map` em memória, restaurando-o no
       `useLayoutEffect` da vista que volta. Não precisa de `localStorage`: o que se quer é
       sobreviver a ir ver o calendário e voltar, não a recarregar a página.
     Equivalente em desktop: existe (o mesmo, com menos rolo e portanto menos dano).

[A5-019] [Agente 5] [Estúdio] [Grave] Sair do estúdio e voltar devolve ao passo «Conteúdo» e ao topo
     Largura onde falha: todas (dói a 390, onde o rolo é dez vezes maior)
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1375
       (`const [step, setStep] = useState<Step>("conteudo")`), :952-953 (`DRAFT_KEY`, `SIDE_KEY`),
       :2300-2320 (o que vai para o `SIDE_KEY` — e o `step` não vai),
       AdminClient.tsx:3520-3543 (a vista desmonta ao trocar)
     Observado: o inventário do que sobrevive a ir ao Calendário e voltar é surpreendentemente
       bom e surpreendentemente incompleto. **Sobrevive:** o rascunho inteiro (`DRAFT_KEY`), os
       URLs e planos B das fotos, a mensagem ao cliente (`SIDE_KEY`), as secções dobradas
       (`liquen-estudio-secoes`, :8888), as dobras dos mood boards por proposta
       (`liquen-estudio-boards`, :8929), o cliente escolhido (`propostaPara`, que subiu para o
       pai de propósito — AdminClient.tsx:1048, e a razão está bem escrita). **Não sobrevive:**
       em que PASSO se estava. Quem está no passo 3, a rever a Conferência antes de enviar, vai
       confirmar uma data ao Calendário e volta — e volta ao passo 1, no topo de sete secções,
       com o botão de enviar cinco ecrãs abaixo. O comentário de `AdminClient.tsx:1048` diz «o
       conteúdo da proposta em si não se perde — o estúdio grava rascunho», e é verdade; o que
       se perde é o lugar.
     Proposta: o `step` junta-se ao `SIDE_KEY`, que é exactamente o sítio para «coisas de
       trabalho que não são conteúdo do documento» e onde já vivem o `refEdited` e a mensagem.
       Uma chave, uma leitura na montagem. Com o `A5-018` feito, a posição do rolo dentro do
       passo vem por acréscimo.
     Equivalente em desktop: existe (o mesmo; com um monitor, «passo 1, no topo» são dois
       gestos de roda em vez de dez).

[A5-020] [Agente 5] [Propostas · Calendário · Tarefas · Material · Temas] [Menor] Os filtros de cada vista morrem ao sair dela
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/Propostas.tsx:179 (`filter`, sem persistência),
       Calendario.tsx:248 (`cursor` — o mês — e :263 `selectedDay`),
       Tarefas.tsx:302 (`who`) e :290 (`showDone`),
       Material.tsx:118 (`aba`: catálogo / listas / regras) e :154 (`search`),
       Temas.tsx:578 (`search`)
     Observado: a casa já sabe fazer isto e fá-lo em três sítios — o filtro e a ordenação dos
       Pedidos (`AdminClient.tsx:1503-1529`), a ordem e a densidade dos Temas
       (`Temas.tsx:192,282`), o tema recente do seletor (`ThemePicker.tsx:96`). O resto não. Num
       computador é um clique a repetir; num telemóvel é o filtro a repor-se em «Todos» sempre
       que se vai ver outra coisa, e o Calendário a saltar para o mês de hoje quando ela estava
       a olhar para Setembro. O `Material` é o caso mais visível: o separador «Listas», que é
       para onde se vai trabalhar, volta sempre a «Catálogo».
     Proposta: a mesma receita das três que já funcionam, com um gancho partilhado
       `useEstadoPorDispositivo(chave, valorInicial)` para não haver seis cópias do
       `try/localStorage/catch`. Prioridade pelo uso: `Material.aba`, `Calendario.cursor`,
       `Propostas.filter`, `Tarefas.who`.
     Equivalente em desktop: existe (o mesmo esquecimento, custo menor).

[A5-021] [Agente 5] [Pedido aberto] [Menor] O separador do pedido volta sempre ao que a fase manda, mesmo quando se acabou de o mudar à mão
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:1905-1908
       (`abrirPrimeiroDetailTab(detailNextAction(q).tab)`), :1020-1023 (recomeça a lista de
       visitados)
     Observado: a escolha de abrir no separador que a fase do pedido sugere é boa — é a que
       poupa um toque na maioria das vezes. O que falta é a memória de curtíssimo prazo: quem
       abre um pedido, muda para «Financeiro», fecha para ir confirmar um valor noutro lado e
       reabre o MESMO pedido, volta a cair em «Produção». Num telemóvel, onde fechar a gaveta é
       a única forma de voltar à lista (`A5-002`), isso acontece muitas vezes seguidas.
     Proposta: guardar o último separador por `quote.id` em memória (um `Map` no `AdminClient`,
       não precisa de disco) e usá-lo em vez da sugestão quando ele existe. A sugestão continua
       a mandar na primeira abertura de cada pedido, que é onde ela vale.
     Equivalente em desktop: existe (o painel é coluna e fecha-se muito menos, portanto quase
       não se nota).

---

## Custo em toques

Contado a partir do **ecrã inicial** — que é a última vista, restaurada do `localStorage`
(`AdminClient.tsx:1479`); onde a contagem depende disso, está dito. «Rolo» é rolagem de dedo, e
conta-se à parte porque não é um toque mas é tempo, e de pé é o que mais custa.

| Tarefa | Toques hoje | Rolo pelo meio | Deviam ser | Porquê |
|---|---|---|---|---|
| **O evento de hoje** (abrir o pedido) | **1** — cartão «Evento hoje» na Visão Geral | nenhum, o cartão está acima da dobra | 1 | ✔ está certo — desde que a Visão Geral seja a vista aberta e o evento esteja a ≤30 dias (`Overview.tsx:1429`) |
| … se a última vista não for a Visão Geral | **2** — barra de baixo + cartão | nenhum | 1 | `openQuote` grava `pedidos` como última vista (`AdminClient.tsx:1877`), portanto este é o caso normal |
| … chegar ao **Dossier** desse evento | **2–3** — + «Dossier» no topo da gaveta | nenhum | 2 | `AdminClient.tsx:4203` |
| **A checklist da carrinha** (melhor caso) | **2** — cartão do evento + «Abrir para carregar» | ~4 ecrãs dentro do painel «Produção» | 1 | A5-013 · o link vive num sítio só, no fundo de um painel |
| **A checklist da carrinha** (caso normal) | **4** — Pedidos + pedido + «Produção» + «Abrir para carregar» | ~2 ecrãs para encontrar o pedido, ~4 dentro dele | 1 | A5-013 · a vista «Material» não leva lá |
| **O preço de uma proposta** | **1** — «Propostas» na barra de baixo | quanto baste até encontrar o cliente | 1 | ✔ o valor está no cartão do telemóvel (`Propostas.tsx:735-738`). Fica a nota: não há campo de procura, só pastilhas de estado |
| **Uma foto de um mood board** (na biblioteca) | **4** — «Mais» + Temas + tema + foto | pouco | 3 | «Temas» está na gaveta, não na barra (`nav.tsx:61,95`) |
| **Uma foto de um mood board** (numa proposta) | **4** — Fazer proposta + cliente + «⋯» na célula + «Ver em grande» | ~5 ecrãs até à secção Inspiração | 2 (tocar na foto) | A5-006 · tocar na miniatura não faz nada; ampliar passa por uma folha de sete acções (`ProposalStudio.tsx:6500`) |
| … se o mood board estiver dobrado | **5** | idem | 2 | `ProposalStudio.tsx:4175-4184` |
| **Sair de um pedido aberto** | **1** — e só existe um alvo, o «×» do canto superior direito | — | 1, com dois caminhos | A5-002 · a barra de baixo saiu, o hambúrguer está tapado, o fundo escuro está tapado |
| **O Modo de Carga** (inventário) | **impossível** | — | 1–2 | A5-015 · fora do `NAV`, fora da paleta, sem link directo |
| **Voltar um passo, em qualquer sítio** | **impossível** — o gesto de voltar sai do back office | — | 1 gesto | A5-001 · não há história nenhuma escrita |

---

*Auditoria por leitura de código, sem browser. O que precisa de olho está marcado
`[por confirmar no ecrã]` — sobretudo as larguras exactas em `A5-005`, `A5-009` e `A5-012`, e a
cobertura do cabeçalho pela gaveta em `A5-002`, que se vê num segundo e é o achado mais grave
desta passagem.*
