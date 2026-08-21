# Agente 3 — Toque e ergonomia

O trabalho de alvos de toque desta casa está **muito acima da média** e não precisa de ser
refeito: há 345 usos de `.alvo-toque` no código, o `ui/Button.tsx` e o `ui/Segmented.tsx` já
trazem `pointer-coarse:h-11` de fábrica, os campos de escrever têm chão de 44 px em
`globals.css:645-649`, e há dois testes-guarda a segurar isto de fora — o
`moldura-alvos-de-toque.test.ts` (o cabeçalho, o dossier e os diálogos) e o
`nada-invisivel-ao-toque.test.ts` (nada que se toque pode estar a `opacity: 0`). O padrão do
checkbox — crescer o **rótulo** e não o quadrado — está aplicado em oito sítios, com o porquê
escrito por cima. O ecrã do carregamento (`carregamento/[eventId]/Carregamento.tsx`) é o melhor
ecrã de telemóvel do repositório: linhas de 56 px, fila offline, contador sempre à vista. Nada
disto é preciso tocar.

O que sobra divide-se em três famílias, e nenhuma delas é «faltou pôr a classe».

**Primeira: o arrasto.** Há dois motores de arrasto no back office e só um deles funciona no
iPhone. O `dnd-kit` (Serviços, mood boards, índice das páginas) está bem montado, com
`TouchSensor` a 180 ms e setas como caminho paralelo. O **arrasto nativo do HTML5**
(`draggable` + `dataTransfer`) está no **Kanban** e na **grelha de fotos de um tema** — e o
Safari do iOS não o implementa de todo. No Kanban isso quer dizer que a única coisa que aquele
ecrã existe para fazer não se faz, e a coluna vazia ainda por cima escreve «Arrasta para aqui»
a um dedo que não pode. Já o `Temas.tsx` sabe disto e escreveu-o (`Temas.tsx:3385`), mas a saída
que deixou só sabe «mover para o início».

**Segunda: o desfazer está no sítio errado do ecrã.** A casa tem três mecanismos de anular bons
— a barra do `ServicesEditor`, o `limpo` de dez segundos do estúdio, o botão «Desfazer» —, e no
telemóvel os três apontam para fora do ecrã. O estúdio diz «podes anular durante 10 segundos»
num aviso que aparece em baixo, e põe o botão no **topo** de uma secção de onze mil linhas; a
barra do `ServicesEditor` é `fixed bottom-6` e por isso pousa **em cima** da barra de navegação
e da barra de acção do estúdio — exactamente o defeito que o `Toast.tsx` já corrigiu com o token
`--bo-barra-inferior`, e que o `barra-inferior.test.tsx` não apanha porque o teste procura
`calc(Npx + env(...))` e isto é um `bottom-6` seco.

**Terceira: `.alvo-toque` onde devia estar `.alvo-invisivel`.** É o mesmo caso que deu origem à
segunda classe, e voltou noutro sítio: a pega de arrastar de cada fotografia do mood board
(`MoodBoardFotos.tsx:507`) leva `.alvo-toque` sobre um desenho de 24 px, e sob `(pointer: coarse)`
isso põe um quadrado preto de 44×44 no canto de cada miniatura de ~100 px, com o «⋯» de 44 px
já no canto de baixo. Metade da fotografia deixa de se ver. E há a ponta seca do outro lado:
`.alvo-invisivel` cresce `inset: -10px`, o que só chega aos 44 px quando o desenho tem 24 —
num ícone de 16 px (`PaginaEmConstrucao.tsx:115`) fica-se nos 36.

**Gestos e haptics, em duas linhas:** não há um único `navigator.vibrate` no repositório, e
ainda bem — o Safari do iOS não implementa a Vibration API e nunca implementou, portanto propor
haptics seria propor nada. E há um buraco de gesto simétrico e fácil de fechar: a lupa da página
do casal (`Inspiracao.tsx:844-858`) muda de foto ao deslizar; as duas lupas do back office
(`PhotoLightbox.tsx`, `LupaDeFotos.tsx`) não, e são as que se usam a rever uma proposta de pé.

Dezoito achados: 1 bloqueia, 10 graves, 7 menores.

---

[A3-001] [Agente 3] [Pipeline (Kanban)] [Bloqueia] Mover um cartão de coluna é arrasto nativo do HTML5, que o Safari do iOS não tem
     Largura onde falha: todas (é o apontador, não a largura)
     Onde: src/app/[lang]/(site)/orcamento/admin/Kanban.tsx:98-103 (o cartão),
       :453-462 (a coluna que recebe), :512 (o texto da coluna vazia)
     Observado: o cartão é `draggable` com `onDragStart`/`onDragEnd` e a coluna responde a
       `onDragOver`/`onDrop` com `dataTransfer`. É a API de arrasto do HTML5, e no Safari do
       iOS ela não dispara com o dedo — não há `dragstart`, não há `drop`. Os outros dois
       caminhos que o cartão oferece são de teclado: `Enter` abre e `ArrowLeft`/`ArrowRight`
       movem de coluna (:105-116). Num telemóvel não há nenhum dos dois. Resultado: no ecrã
       Pipeline, a única acção do ecrã não existe — e a coluna vazia dá a instrução
       «Arrasta para aqui» a quem não pode arrastar. A saída existe mas está noutro ecrã:
       tocar no cartão abre o pedido, e lá dentro há um `<select>` de estado
       (`AdminClient.tsx:4640-4654`). Ninguém a adivinha a partir do quadro.
     Proposta: o quadro tem de aprender o gesto do dedo, e a casa já tem as duas peças.
       (a) Passar este contexto para `dnd-kit` como os mood boards, com os mesmos sensores
       (`MouseSensor` a 4 px, `TouchSensor` com `delay: 180, tolerance: 6`) e uma pega própria
       no cartão — a célula inteira arrastável disputa o scroll da coluna, que é
       `overflow-y-auto` (:483); ou, mais barato e igualmente honesto,
       (b) dar ao cartão um «⋯» de 44 px com «Mover para →» / «Mover para ←» / «Marcar como…»,
       no molde do `ui/MenuDeAccoes.tsx` (que já é 44 px em todas as linhas). E, faça-se o que
       se fizer, trocar o texto da coluna vazia: «Arrasta para aqui» é uma promessa que aquele
       ecrã não cumpre no telemóvel.
     Equivalente em desktop: existe (o arrasto funciona com rato)

[A3-002] [Agente 3] [Estúdio → Mood boards] [Grave] A pega de arrastar de cada foto leva `.alvo-toque` e tapa a miniatura — é o caso que criou o `.alvo-invisivel`, outra vez
     Largura onde falha: 390 / 430 (a grelha é de 3 colunas até `sm`)
     Onde: src/app/[lang]/(site)/orcamento/admin/MoodBoardFotos.tsx:501-511
       (a grelha: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:6464,
       `grid grid-cols-3 sm:grid-cols-4 gap-2`)
     Observado: a pega é `alvo-toque … h-6 w-6 … bg-black/55` no canto superior direito. O
       desenho são 24 px; sob `(pointer: coarse)` o `.alvo-toque` força `min-width/min-height:
       44px` e o disco preto passa a 44×44. Na mesma célula já vive o «⋯» das acções, esse sim
       declarado `h-11 w-11` de propósito, no canto inferior direito
       (`ProposalStudio.tsx:9369`). O próprio ficheiro do estúdio mede a célula do telemóvel em
       **89 × 104 px** (`ProposalStudio.tsx:9222`). Dois quadrados opacos de 44 px na mesma
       coluna de 89 px de largura: **88 dos 104 px de altura da metade direita da fotografia
       ficam tapados**. É palavra por palavra o defeito que está escrito em `globals.css:705-716`
       («o disco preto passou a tapar o canto superior esquerdo de todas as fotografias»), e a
       classe que o resolve já existe.
     Proposta: trocar `alvo-toque` por `alvo-invisivel` nesta pega. O elemento já é `absolute`
       (o `::after` precisa disso), o desenho tem exactamente 24 px — que é a medida para que o
       `inset: -10px` foi calculado — e a área tocável fica nos 44 px sem um pixel pintado a
       mais. A folga de 10 px come 6 dos 8 px de goteira do `gap-2` e não chega à célula
       vizinha nem à pega dela. **Não** é caso de `.alvo-toque` porque aqui o vizinho apertado
       é a própria fotografia, que é o conteúdo.
     Equivalente em desktop: existe (com rato a pega só aparece no hover e mede 24 px)

[A3-003] [Agente 3] [Estúdio → Serviços] [Grave] A barra de acções da linha usa `(hover: none)` — num iPhone com AssistiveTouch fica invisível E com 44 px, a apanhar o dedo
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/ServicesEditor.tsx:91-94 (`ROW_ACTIONS`),
       :1177 (a `DragHandle`, mesmo padrão)
     Observado: `ROW_ACTIONS` esconde-se com `opacity-0` e reaparece com
       `[@media(hover:none)]:opacity-100`. É a pergunta **meia** que este repositório já
       diagnosticou por escrito duas vezes: o tamanho cresce com `(pointer: coarse)` (é o
       `.alvo-toque` do `ICON_BTN`, :98-101) mas a visibilidade decide-se com `(hover: none)`,
       e há aparelhos que respondem sim à primeira e não à segunda — um iPhone com
       AssistiveTouch, um iPad com trackpad, um portátil de ecrã táctil. Nesses, os quatro a
       seis ícones da linha ficam a `opacity: 0` **com 44 px cada**, e `opacity: 0` não desliga
       o toque: fica uma fila de botões invisíveis por cima da linha, o último dos quais apaga
       a linha (`removeItem`, :1008). O raciocínio inteiro está escrito em
       `ProposalStudio.tsx:9208-9243`, com medições; o `ServicesEditor` ficou para trás.
       O `nada-invisivel-ao-toque.test.ts` não o apanha porque aceita
       `[@media(hover:none)]:opacity-100` como saída válida (:52).
     Proposta: o par da casa, que está em `globals.css:98`:
       `opacity-100 com-rato:opacity-0 com-rato:group-hover/row:opacity-100`. E, já que se lá
       vai, apertar a lista `TEM_SAIDA_TACTIL` do teste para deixar de aceitar a pergunta meia
       — senão volta.
     Equivalente em desktop: existe (com rato de verdade a barra comporta-se como sempre)

[A3-004] [Agente 3] [Estúdio → Serviços] [Grave] A barra de «Anular» de uma linha removida nasce em cima da barra de navegação e da barra de acção do estúdio
     Largura onde falha: 390 / 430 / 768 (abaixo de `lg`, que é onde há barra de baixo)
     Onde: src/app/[lang]/(site)/orcamento/admin/ServicesEditor.tsx:1078-1092
     Observado: `fixed bottom-6 left-6 z-[80]`. A barra de baixo do back office tem 72 px
       (`--bo-barra-inferior`, globals.css:235) e vive em `z-30`
       (`AdminClient.tsx:3157`); a barra de acção do estúdio pousa em cima dela com ~64 px em
       `z-20` (`ProposalStudio.tsx:8440`). Um aviso a 24 px do fundo com ~48 px de altura ocupa
       a faixa dos 24 aos 72 px — **dentro** das duas — e com `z-[80]` ganha às duas. Ou seja:
       o momento em que se removeu uma linha por engano é exactamente o momento em que a
       navegação e o «Pré-visualizar» ficam tapados. É o mesmo defeito que o `Toast.tsx` já
       corrigiu, com a conta escrita (`Toast.tsx:60-80`), e passa ao lado do
       `barra-inferior.test.tsx` porque este procura `calc(<n>px + env(safe-area-inset-bottom))`
       e aqui está um `bottom-6` seco.
     Proposta: a mesma fórmula do `Toast.tsx` —
       `bottom-[calc(var(--bo-barra-inferior)+var(--bo-barra-accao,0px)+0.75rem+env(safe-area-inset-bottom))]`
       com `lg:bottom-6`. E o «Anular» (:1084-1090) é hoje texto sublinhado sem altura própria:
       leva `alvo-toque !justify-start`, porque é o único alvo do aviso e o mais importante do
       momento. Vale a pena acrescentar ao `barra-inferior.test.tsx` a busca por
       `fixed` + `bottom-<n>` sem o token — é a forma como isto voltou.
     Equivalente em desktop: existe (a `lg` não há barra de baixo e o `bottom-6` está certo)

[A3-005] [Agente 3] [Estúdio → Mood boards] [Grave] «Podes anular durante 10 segundos» — e o botão de anular está no topo de uma página de vários ecrãs
     Largura onde falha: todas em telemóvel
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:4126-4131 (o aviso),
       :5448-5460 (a faixa com o «Anular»), :5432-5441 (o botão «Desfazer»),
       src/app/[lang]/(site)/orcamento/admin/Toast.tsx:12-16 (o aviso não tem acção)
     Observado: mover ou remover fotografias põe um aviso no canto de baixo a dizer «Podes
       anular durante 10 segundos», e a faixa com o botão «Anular» é desenhada no **topo** da
       secção do estúdio. Entre uma coisa e outra estão as páginas de inspiração inteiras — a
       secção do estúdio tem mais de onze mil linhas de JSX e, a 390 px, os mood boards estão
       vários ecrãs abaixo. Dez segundos não chegam para subir a página, encontrar a faixa e
       tocar. O «Desfazer» geral (:5432) está no mesmo topo e não expira, mas também não se
       alcança sem sair do sítio onde se estava a trabalhar — e o comentário que o instalou diz
       precisamente que existe porque «num telemóvel não há `Cmd+Z`». Meio caminho andado.
     Proposta: o `Toast` é o sítio onde o aviso já aparece; falta-lhe uma acção. Acrescentar um
       terceiro argumento opcional `{ rotulo, onAccao }` ao `toast(...)` e desenhá-lo como um
       botão `alvo-toque` dentro da caixa — o aviso passa a ser «Fotografia movida.  **Anular**»
       no canto de baixo, ao alcance do polegar, e a faixa do topo fica para o computador. É
       uma peça só e serve os oito ou dez sítios que hoje dizem «podes anular» e apontam para
       longe.
     Equivalente em desktop: existe (no portátil vê-se a faixa e há `Cmd+Z`)

[A3-006] [Agente 3] [Temas → tema aberto] [Grave] Reordenar as fotos de um tema é arrasto HTML5; ao dedo só existe «mover para o início»
     Largura onde falha: todas (é o apontador)
     Onde: src/app/[lang]/(site)/orcamento/admin/Temas.tsx:3274-3300 (o arrasto),
       :3333-3348 (Alt+setas), :3392-3402 (o único botão de mover)
     Observado: a célula é `draggable` com `dataTransfer` — não pega no iOS, e o próprio
       ficheiro já o sabe e escreveu-o (:3385). Os outros dois caminhos são `Alt`+setas (precisa
       de teclado) e um botão ↑ que faz `moveTo(i, 0)`, ou seja **mover para o início**. Com só
       esse gesto qualquer ordem continua a ser alcançável — mas por construção ao contrário e
       com um toque por foto: pôr a 12.ª foto na 3.ª posição de um tema de 40 obriga a mover
       para o início as onze que lhe hão-de ficar à frente, pela ordem inversa. Numa quinta, de
       pé, isso não se faz.
     Proposta: nesta grelha o par de setas do `ServicesEditor` (`MoveBtns`, um passo de cada
       vez) é pior, não melhor — 40 fotos são 40 toques. O que serve é «Mover para a posição…»
       no menu de acções da célula: um campo de número ou uma lista curta («início / antes da
       capa / fim / posição N»). Se se quiser o gesto a sério, é o mesmo trabalho do A3-001 —
       trocar o arrasto nativo por `dnd-kit` com pega, como os mood boards já fazem.
     Equivalente em desktop: existe (arrasto com rato + Alt+setas)

[A3-007] [Agente 3] [Estúdio → Mood boards] [Grave] Passar uma foto para outra página só se faz a arrastar; a folha de acções tem sete linhas e nenhuma é «mover para a página…»
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:9300-9352 (as sete acções),
       src/app/[lang]/(site)/orcamento/admin/MoodBoardFotos.tsx:246-279 (o que o largar faz)
     Observado: aqui o arrasto é `dnd-kit` e **funciona** ao toque — não está bloqueado. O
       problema é o custo: com oito páginas abertas, levar uma foto da página 1 à página 5 num
       ecrã de 390 px é segurar 180 ms, arrastar até à margem, esperar que a página role
       sozinha por quatro cartões inteiros sem levantar o dedo, e largar no sítio certo. A
       folha de acções da foto tem sete linhas escritas por extenso — recuar, avançar, ver em
       grande, trocar, principal, escolher, remover — e nenhuma atravessa páginas. Há um
       caminho paralelo por selecção múltipla («Escolher para mover em conjunto», :9340, com
       `moverSeleccionadas` a escrever o aviso de :4126), mas obriga a escolher primeiro e a
       procurar o comando depois.
     Proposta: uma oitava linha na folha, «Mover para a página…», que abre a lista das páginas
       com os títulos e a contagem — os mesmos dados que o `MoodBoardIndice` já calcula
       (`MoodBoardIndice.tsx:154-164`). É um toque, um toque e pronto, sem dedo em cima do ecrã
       durante quatro segundos. O arrasto fica como está, para o rato e para quem gosta dele.
     Equivalente em desktop: existe (arrastar com rato entre dois cartões é natural)

[A3-008] [Agente 3] [Estúdio · Índice das páginas] [Grave] As pegas de arrasto do `dnd-kit` que sobrevivem ao dedo não declaram `touch-action: none`
     Largura onde falha: todas em toque — **[por confirmar no ecrã]**
     Onde: src/app/[lang]/(site)/orcamento/admin/MoodBoardIndice.tsx:202-212 (sem `touch-none`,
       e dentro de um `<ul>` que é `overflow-x-auto`, :108),
       src/app/[lang]/(site)/orcamento/admin/MoodBoardFotos.tsx:502-510 (sem `touch-none`);
       compare-se com src/app/[lang]/(site)/orcamento/admin/ServicesEditor.tsx:1177, que **tem**
       `touch-none` — e que é justamente a pega escondida no telemóvel
       (`[@media(pointer:coarse)]:hidden`)
     Observado: das três pegas de `dnd-kit` do back office, a única que declara
       `touch-action: none` é a única que o dedo nunca vê. As duas que o dedo usa não a
       declaram. Com `touch-action: auto`, o Safari pode decidir que o gesto é um scroll antes
       de o `TouchSensor` chegar aos seus 180 ms, e depois de o scroll começar já não há
       `preventDefault` que o pare. O caso do índice é o mais exposto: a tira é
       `overflow-x-auto` e o gesto de arrastar uma página é horizontal — a mesma direcção do
       scroll que a tira quer. Não consigo medir isto sem aparelho; o que se lê no código é a
       assimetria, e ela é real.
     Proposta: `touch-none` nas duas pegas, igual à do `ServicesEditor`. Custa uma classe e é a
       recomendação do próprio `dnd-kit` para o sensor de ponteiro/toque.
     Equivalente em desktop: existe (com rato o `touch-action` não entra na conversa)

[A3-009] [Agente 3] [Pedidos → selecção múltipla] [Grave] A barra de acções em lote tem seis alvos abaixo de 44 px, e o «Apagar (n)» está encostado ao «Email (n)»
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3962-4039
     Observado: `flex flex-wrap gap-3` com — «Selecionar todos (n)» (:3969, texto nu, `text-xs`,
       ~16 px de altura), o `<select>` de marcar estado (:3980, esse tem os 44 px do
       `globals.css`), «Exportar seleção» (:3998, `px-3 py-1.5 text-[10px]` ≈ 26 px),
       «Email (n)» (:4015, igual), «**Apagar (n)**» (:4026, igual, a terracota) e «Limpar»
       (:4033, texto nu). A 390 px a fila embrulha em duas ou três linhas e fica um bolo de
       alvos de 26 px com 8 a 12 px entre eles, dos quais **o destrutivo está entre dois
       inofensivos**. O `deleteSelected` tem `window.confirm` (:2441-2446), que é a rede — mas
       a rede aparece **depois** do toque errado, e apaga pedidos definitivamente.
     Proposta: `alvo-toque` nos quatro botões e nos dois textos nus (com `!justify-start` nos
       que são texto corrido, como o resto da casa faz). E separar o destrutivo como o
       `AccoesDaFoto` já separa (`ProposalStudio.tsx:9389-9404`): traço por cima e a última
       posição da fila, nunca colado ao «Email». Em telemóvel, ponderar mandar o «Apagar» para
       dentro de um «⋯» — mas isso é decisão dela, não minha.
     Equivalente em desktop: existe (com rato, 26 px é a densidade calma que este back office quer)

[A3-010] [Agente 3] [Dossier do evento → Pagamentos] [Grave] Apagar um pagamento não pergunta nada e não se desfaz; e o × do registo não guardado nem alvo tem
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/PaymentsPanel.tsx:351-356 (`remove`, sem
       confirmação), :877-889 (o × da linha, esse com `alvo-toque`), :915-929 (a linha fantasma),
       :922-929 (o × que descarta, **sem** `alvo-toque`)
     Observado: duas coisas diferentes no mesmo painel. (1) `remove(p)` apaga o pagamento na
       hora — sem `window.confirm`, sem faixa de anular. O `ghost` que ele guarda serve o
       «Repetir» de uma gravação falhada, não é um desfazer: se o servidor aceitar, o registo
       foi-se. É o único botão do painel que mexe em dinheiro já lançado e é o que tem menos
       rede — os vizinhos «Remover item», «Remover o fornecedor» e «Apagar a proposta» todos
       perguntam (`Inventario.tsx:243`, `Fornecedores.tsx:196`, `Propostas.tsx:299`). (2) Na
       linha fantasma, o × que descarta o registo que não chegou ao servidor (:922) não leva
       `alvo-toque` — fica em ~26×26 px — e está a 2 px do «Repetir», que é a acção que o
       salva. O toque errado deita fora o pagamento e não há segunda oportunidade: a linha
       desaparece.
     Proposta: `alvo-toque` no × de :922 (o irmão dele, a 40 linhas de distância, já o tem, com
       o comentário a explicar porquê) e mais espaço entre ele e o «Repetir» — `gap-0.5` (:914)
       para `gap-2` sob `pointer-coarse`, como o `DossierHeader.tsx:216` já faz. Para o
       `remove`, a faixa de anular vale mais do que uma pergunta: o dinheiro apagado é o caso
       em que se quer o passo atrás e não a caixa de diálogo. Se for para ser pergunta, que seja
       a mesma frase das outras («Esta ação não pode ser anulada»).
     Equivalente em desktop: não existe — a falta de confirmação e de desfazer é igual nos dois,
       mas com rato não se acerta no botão errado

[A3-011] [Agente 3] [Visão Geral · conflito de gravação] [Grave] Duas decisões irreversíveis lado a lado, a 8 px uma da outra, com 26 px de altura cada
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/Overview.tsx:429-442
     Observado: quando a nota do pedido foi alterada em dois sítios, o painel mostra as duas
       versões e dois botões: «Guardar a minha por cima» e «Ficar com a do servidor». São
       `px-3 py-1.5 text-[10px]` — cerca de 26 px de altura — num `flex flex-wrap gap-2`, ou
       seja **8 px** de distância. As duas escolhas deitam fora texto: uma o do servidor, outra
       o que se acabou de escrever. Não há confirmação (e faz sentido que não haja: a pergunta
       já é o painel) nem desfazer. É o alvo mais pequeno do back office com a consequência
       mais definitiva por toque.
     Proposta: `alvo-toque` nos dois e `gap-3 pointer-coarse:gap-4`, ou — melhor ainda —
       empilhados a toda a largura em telemóvel (`flex-col sm:flex-row`), que é o que se faz a
       uma escolha entre duas coisas que não se desfazem. O texto do botão já é bom: diz o que
       acontece, não «OK/Cancelar».
     Equivalente em desktop: existe (com rato, os 26 px chegam)

[A3-012] [Agente 3] [Dossier do evento] [Grave] A saída, as quatro ferramentas e a próxima acção vivem todas no terço de cima, num ecrã que não tem barra de baixo
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/evento/[id]/DossierHeader.tsx:157 (o cabeçalho
       `sticky top-0`), :173-175 (a única saída), :216 (a fila das quatro ferramentas),
       :401/:420/:441 (a próxima acção)
     Observado: o dossier vive em rota própria, fora do `AdminClient`, e por isso **não monta a
       barra de baixo nem a gaveta** — o `moldura-alvos-de-toque.test.ts` já o diz e mediu.
       Todos os alvos têm agora os 44 px (foi o trabalho do PR anterior, e está bem feito). O
       que não mudou foi **onde** estão: o link de voltar, as quatro ferramentas (copiar link,
       imprimir dossier, guião do dia, .ics) e o botão da próxima acção («Criar proposta» /
       «Abrir portal») estão todos no cabeçalho, que é `sticky top-0` e portanto fica sempre no
       terço de cima. A 390×844, isso é a zona em que um polegar só chega inclinando o
       telemóvel na mão. E o botão da próxima acção é, por definição, o que se toca mais vezes
       neste ecrã.
     Proposta: a próxima acção desce. Uma barra `sticky bottom-0` no telemóvel, com o mesmo
       botão que hoje está em :401 — é exactamente o que o estúdio já faz
       (`ProposalStudio.tsx:8440`, com o token `--bo-barra-accao` a publicar a altura para o
       aviso se afastar). As quatro ferramentas podem ficar em cima: imprimir um dossier não é
       gesto de quem está de pé. O link de voltar também fica — mas então este ecrã ganhava com
       um gesto de deslizar da margem esquerda para trás, que é o que o Safari já faz à
       navegação do browser e não custa código nenhum se o «voltar» for uma navegação a sério.
     Equivalente em desktop: não existe (não há problema de alcance com rato)

[A3-013] [Agente 3] [Todo o back office] [Menor] A lupa do back office não muda de foto ao deslizar — a do casal muda
     Largura onde falha: 390 / 430 / 768
     Onde: src/app/[lang]/(site)/orcamento/admin/PhotoLightbox.tsx:184 e :226 (as setas),
       src/app/[lang]/(site)/orcamento/admin/LupaDeFotos.tsx:107 e :127;
       o que falta está feito em
       src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx:844-858
     Observado: as duas lupas do back office mudam de fotografia só por dois botões de 44 px
       encostados às margens esquerda e direita do ecrã. Rever quarenta fotos de um tema são
       oitenta toques em dois alvos que ficam onde a mão não está. A página do casal — a
       superfície que se usa **menos** — tem o gesto: `onTouchStart`/`onTouchEnd`, com a guarda
       certa («horizontal a sério», para o dedo a rolar não mudar de foto) e o limiar já
       escolhido. Fechar ao deslizar para baixo também não existe em lado nenhum.
     Proposta: levantar o bloco de `Inspiracao.tsx:844-858` para um `useDeslizar` partilhado e
       pendurá-lo nas duas lupas do back office. Setas ficam — são o caminho do teclado e de
       quem não arrasta. Acrescentar o deslizar para baixo a fechar, com o mesmo limiar do
       `FolhaOuDialogo` (`FECHAR_A_PARTIR_DE`, `ui/FolhaOuDialogo.tsx:152`), para não haver dois
       números.
     Equivalente em desktop: existe (setas do teclado e ← →)

[A3-014] [Agente 3] [Listas (Pedidos, Propostas, Tarefas)] [Menor] Nenhuma lista tem gesto — nem deslizar para acção, nem puxar para atualizar (e o `overscroll` da casa desliga o do Safari)
     Largura onde falha: 390 / 430
     Onde: src/app/globals.css:604-608 (`overscroll-behavior-y: none` no `body`),
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3962 e seguintes (a lista),
       src/app/[lang]/(site)/orcamento/admin/ui/MenuDeAccoes.tsx:109-185 (o que existe hoje)
     Observado: arquivar, marcar seguimento ou mudar estado num pedido faz-se sempre por
       «⋯» → folha → linha: três toques. Deslizar para a esquerda numa linha não faz nada.
       E não há como pedir dados novos: o `overscroll-behavior-y: none` do `body` (posto de
       propósito, para não haver o efeito elástico branco nas margens) desliga também o
       puxar-para-atualizar nativo do Safari, e não há botão de atualizar em lado nenhum do back
       office — a única forma de ver o que outra pessoa gravou é recarregar a página pela barra
       do browser. Num sítio onde o 4G vai e vem, isso conta.
     Proposta: (a) deslizar para a esquerda numa linha de pedido revela **uma** acção — a mais
       usada, provavelmente «Arquivar», que é reversível — no molde que o `CuradoriaDeFotos.tsx`
       já tem (`pousar`/`mover`/`largar` com `setPointerCapture`, :114-139); o «⋯» fica para o
       resto. (b) Puxar para atualizar na lista: `overscroll-behavior-y: contain` no contentor
       da lista (não no `body`, para não trazer de volta o elástico branco das margens) e o
       mesmo trio de handlers. Se isso for muito, o mínimo honesto é um botão «Atualizar» no
       cabeçalho da lista — hoje não há nenhum.
     Equivalente em desktop: existe (o «⋯» é o mesmo, e recarregar é F5)

[A3-015] [Agente 3] [Todo o back office] [Menor] Haptics: não há nenhum, e é bem assim — o que falta é a resposta visível equivalente
     Largura onde falha: n/a
     Onde: procurado em todo o `src/` — zero ocorrências de `navigator.vibrate`;
       o que existe é src/app/globals.css:779-785 (`:active { opacity: 0.65 }` sob
       `(hover: none) and (pointer: coarse)`)
     Observado: não vale a pena propor `navigator.vibrate`. O WebKit do iOS **não implementa**
       a Vibration API — nem no Safari, nem numa app adicionada ao ecrã principal — e um
       `navigator.vibrate(10)` ali é uma linha de código que nunca corre. Qualquer proposta de
       haptics neste repositório seria uma promessa falsa. O que a casa tem em vez disso é o
       `:active` a 0,65 de opacidade, que é bom e está bem apontado (só onde não há hover).
     Proposta: em vez de haptics, **resposta de estado imediata e inequívoca** nos gestos que
       hoje só respondem depois da rede. Dois sítios concretos: o interruptor «Pago/Pendente»
       (`PaymentsPanel.tsx:839-856`), que muda de cor mas não confirma nada até o servidor
       responder; e as linhas do carregamento (`carregamento/[eventId]/Carregamento.tsx:331-335`),
       que já são optimistas e por isso já respondem bem — é o modelo a copiar. Fica registada
       **uma** hipótese de haptic verdadeiro, para experimentar antes de prometer: um
       `<input type="checkbox" switch>` nativo (Safari 17.4+) recebe o retorno táctil do próprio
       sistema ao ser alternado, sem API nenhuma. **[por confirmar no ecrã]** — não o testo sem
       aparelho e não o proponho como certo.
     Equivalente em desktop: n/a

[A3-016] [Agente 3] [Estúdio · Editor de email] [Menor] As bolinhas de cor do editor não se corrigem com nenhuma das duas classes da casa — o que está errado é a distância
     Largura onde falha: todas em toque
     Onde: src/app/[lang]/(site)/orcamento/admin/RichEmailEditor.tsx:296-309
     Observado: quatro ou cinco discos de `h-6 w-6` (24 px) num `flex gap-1` — 4 px entre
       centros a 28 px de distância. `.alvo-toque` cresce o desenho e transforma a paleta em
       cinco bolas de 44 px que não cabem no menu. `.alvo-invisivel` cresce a área 10 px para
       cada lado e as áreas dos vizinhos **sobrepõem-se 16 px**: o disco da direita passa a
       roubar a margem direita do da esquerda, e escolhe-se a cor errada sem perceber porquê.
       É o caso em que nenhuma das duas classes é a resposta.
     Proposta: primeiro o espaço, depois a classe — `gap-1 pointer-coarse:gap-5` (20 px, que é
       o que as duas folgas de 10 px pedem para não se tocarem) e só então `alvo-invisivel` nos
       discos. Se o menu ficar largo de mais, envolvê-lo em `flex-wrap` — são cinco cores, cabe
       em duas filas. Regra geral, para o inventário: `.alvo-invisivel` só serve quando o
       vizinho mais próximo está a **mais de 20 px**.
     Equivalente em desktop: existe

[A3-017] [Agente 3] [Todo o back office] [Menor] O `.alvo-invisivel` só chega aos 44 px a partir de um desenho de 24 — abaixo disso mente, e o comentário promete um `max()` que não está lá
     Largura onde falha: todas em toque
     Onde: src/app/globals.css:726-735 (a regra), :730-732 (o comentário),
       src/app/[lang]/(site)/orcamento/admin/PaginaEmConstrucao.tsx:115 (o caso: `h-4 w-4`)
     Observado: `inset: -10px` dá 24 + 10 + 10 = 44. A conta está certa **para 24 px** e o
       comentário diz isso. Mas a seguir promete que «um alvo maior do que 24 px encolhe esta
       margem sozinho — o `max()` nunca deixa a área tocável ficar abaixo do desenho», e não há
       `max()` nenhum na regra: são dez píxeis fixos, sempre. Para um alvo maior isso é
       inofensivo (fica maior do que 44). Para um alvo **menor** é o contrário: o × de dispensar
       o aviso da página em construção tem `h-4 w-4` (16 px) e com `.alvo-invisivel` fica em
       **36 px** — abaixo do mínimo, com a classe posta e a sensação de estar resolvido.
     Proposta: `inset: min(-10px, calc((24px - 100%) / -2))` não se escreve em CSS de forma
       simples; o caminho limpo é o que o comentário já descreve —
       `inset: calc((44px - 100%) / -2)` no `::after` (a percentagem resolve contra a caixa do
       elemento), que dá exactamente 44 px seja qual for o desenho e nunca encolhe abaixo dele.
       E, aconteça o que acontecer, corrigir o comentário: um comentário que descreve código que
       não existe é pior do que não haver comentário.
     Equivalente em desktop: n/a (a regra só vive sob `(pointer: coarse)`)

[A3-018] [Agente 3] [Estúdio → Mood boards] [Menor] Dois checkboxes do estúdio ficaram sem o rótulo-alvo que o resto da casa aplica
     Largura onde falha: 390 / 430 / 768
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:6696-6698 («Sem recorte»),
       :6864-6867 («enquadramento por omissão»)
     Observado: são `<label className="flex items-start gap-2 text-xs …">` com um
       `<input type="checkbox" className="h-4 w-4">` lá dentro. O `globals.css:645-649` exclui
       de propósito os checkboxes do chão de 44 px («um checkbox tem o seu quadrado desenhado e
       quem cresce é o rótulo à volta»), e o padrão está aplicado em oito sítios —
       `AdminClient.tsx:539`, `Servicos.tsx:120`, `DefinicoesProposta.tsx:474`,
       `PaymentsPanel.tsx:676`, `AdminLogin.tsx:622`, `SessaoExpirada.tsx:371`,
       `OrcamentoForm.tsx:1119` e `:1162`, todos com o comentário a explicá-lo. Estes dois
       ficaram de fora: o alvo é a caixa de 16 px mais a altura da linha de texto, uns 20 px.
     Proposta: `alvo-toque !justify-start` no `<label>`, tal e qual os outros oito. O
       `!justify-start` porque a classe centra o conteúdo e estes são linhas de texto alinhadas
       à esquerda. (O checkbox de `AdminClient.tsx:352` fica de fora desta lista: é a coluna da
       **tabela**, que no telemóvel dá lugar aos cartões — e o cartão, em :539, já o tem.)
     Equivalente em desktop: existe

---

## Inventário de alvos pequenos

O que permite corrigir a classe toda num lote. «Tamanho» é o desenho, não o alvo — sob
`(pointer: coarse)` é a classe que decide o alvo. A regra de escolha, em duas linhas:
**`.alvo-toque`** quando o elemento pode crescer sem tapar nada (botões soltos, chips, rótulos,
linhas de menu); **`.alvo-invisivel`** quando o desenho tem de ficar como está porque cresce em
cima de conteúdo (ícones pousados sobre fotografias) **e** o vizinho mais próximo está a mais de
20 px — abaixo disso as áreas invisíveis sobrepõem-se e roubam-se umas às outras.

| ficheiro:linha | o que é | tamanho actual | classe | porquê |
|---|---|---|---|---|
| `MoodBoardFotos.tsx:507` | pega ⠿ da foto do mood board | 24 px, mas hoje **44** por ter `.alvo-toque` | **trocar para `.alvo-invisivel`** | está pousada sobre a miniatura; a 44 px tapa a metade direita de uma célula de 89×104. Desenho de 24 px = a medida exacta para que o `inset: -10px` foi feito. Vizinho mais próximo (o «⋯») a ~58 px |
| `PaymentsPanel.tsx:922` | × que descarta o registo não guardado | ~26×26 (`p-1`) | `.alvo-toque` | símbolo centrado, botão solto — o irmão dele (:885) já a tem. Aumentar também o `gap-0.5` de :914 para `pointer-coarse:gap-2`: está a 2 px do «Repetir» |
| `AdminClient.tsx:3969` | «Selecionar todos (n)» | ~16 (texto nu) | `.alvo-toque !justify-start` | texto corrido numa fila que embrulha; centrar estragava o alinhamento |
| `AdminClient.tsx:3998` | «Exportar seleção» | ~26 (`px-3 py-1.5 text-[10px]`) | `.alvo-toque` | botão solto numa fila `flex-wrap`, cresce sem tapar nada |
| `AdminClient.tsx:4015` | «Email (n)» (`<a mailto:>`) | ~26 | `.alvo-toque` | idem — e é um link `mailto:`, dos alvos que mais pertencem a um telemóvel |
| `AdminClient.tsx:4026` | **«Apagar (n)»** | ~26 | `.alvo-toque` **+ separar** | destrutivo entre dois inofensivos; a classe resolve o tamanho, não a vizinhança (ver A3-009) |
| `AdminClient.tsx:4033` | «Limpar» | ~16 (texto nu) | `.alvo-toque !justify-start` | mesmo caso do «Selecionar todos» |
| `Overview.tsx:430` | «Guardar a minha por cima» | ~26 | `.alvo-toque` | escolha irreversível; ver A3-011 para o espaçamento |
| `Overview.tsx:436` | «Ficar com a do servidor» | ~26 | `.alvo-toque` | idem, e é o par do de cima — os dois sobem juntos ou a fila fica torta |
| `ProposalStudio.tsx:6696` | checkbox «Sem recorte» | 16 (caixa) / ~20 (rótulo) | `.alvo-toque !justify-start` **no `<label>`** | o padrão da casa: cresce o rótulo, o quadrado fica em 16 |
| `ProposalStudio.tsx:6864` | checkbox do enquadramento | 16 / ~20 | `.alvo-toque !justify-start` **no `<label>`** | idem |
| `ProposalStudio.tsx:10922` | «usar este valor» (aviso do total) | ~19 (`px-1.5 py-0.5 text-[9px]`) | `.alvo-toque` | botão solto num aviso; nada à volta para tapar |
| `ProposalStudio.tsx:10979` | idem, segundo aviso | ~19 | `.alvo-toque` | idem |
| `ServicesEditor.tsx:1084` | «Anular» da barra de remoção | ~20 (texto sublinhado) | `.alvo-toque !justify-start` | é o **único** alvo do aviso, e no pior momento possível (ver A3-004) |
| `RichEmailEditor.tsx:298` | bolinhas de cor do texto | 24, com `gap-1` (4 px) | **nenhuma das duas até o `gap` subir** | a 4 px, `.alvo-toque` não cabe e as áreas do `.alvo-invisivel` sobrepõem-se 16 px. Primeiro `pointer-coarse:gap-5`, depois `.alvo-invisivel` |
| `RichEmailEditor.tsx:345/352/453/460` | Aplicar / Cancelar dos painéis | ~26 (`px-3 py-1.5`) | `.alvo-toque` | botões de rodapé de painel, soltos |
| `TagsField.tsx:128` | sugestões de etiqueta «+ nome» | ~21 (`px-2.5 py-1`) | `.alvo-toque` | chips num `flex-wrap gap-1.5`; crescer empurra as linhas, que é aceitável |
| `EmailTemplates.tsx:717`, `:864` | chips de variável e de vista | ~21–26 | `.alvo-toque` | idem |
| `EmailTemplatesBilingue.tsx:478`, `:530`, `:557`, `:565` | chips de idioma e de variável | ~21–26 | `.alvo-toque` | idem |
| `Calendario.tsx:683`, `:701` | eventos dentro da célula do dia | ~18 (`px-1.5 py-1 text-[9px]`) | `.alvo-toque` **com cuidado** | a célula do dia é apertada: crescer para 44 muda a altura da grelha do mês. Medir antes — ou empilhar a lista do dia por baixo do calendário em telemóvel. **[por confirmar no ecrã]** |
| `NavEstudio.tsx:117` | entradas do índice do estúdio | ~28 (`px-2.5 py-1.5`) | `.alvo-toque !justify-start` | lista vertical, cresce sem estorvar |
| `PainelDoEstudio.tsx:203` | segmentado de vista do painel | ~28 (`px-2 py-1.5`) | `.alvo-toque` | ou trocar por `ui/Segmented.tsx`, que já traz `pointer-coarse:h-11` |
| `carregamento/[eventId]/Carregamento.tsx:265`, `:275` | filtros de viatura | ~26 (`px-3 py-1`) | `.alvo-toque` | tira `overflow-x-auto`: crescer só empurra para o lado, e este é **o** ecrã das mãos ocupadas |
| `PaginaEmConstrucao.tsx:115` | × que dispensa o aviso | 16, hoje com `.alvo-invisivel` → **36** | **`.alvo-invisivel` corrigida** (A3-017) | a classe está lá e não chega: 16 + 10 + 10 = 36. Ou isso, ou subir o desenho para `h-6 w-6` |
| `MoodBoardIndice.tsx:208` | pega ⠿ do índice das páginas | 16 (`h-7 w-4`), hoje **44** por `.alvo-toque` | manter `.alvo-toque`, **acrescentar `touch-none`** | aqui crescer não tapa nada (a tira rola de lado), mas falta o `touch-action` — ver A3-008 |
| `ServicesEditor.tsx:91-94` | barra de acções da linha | 44 (tem `ICON_BTN`) | classe certa, **pergunta errada** | o tamanho está bom; o que está mal é `[@media(hover:none)]` em vez de `com-rato:` — ver A3-003 |
| `AdminClient.tsx:352` | checkbox da coluna da tabela | 16 | **nenhuma** | é o ramo de **tabela** do `TabelaOuCartoes`; em telemóvel desenha-se o cartão, e o cartão (`:539`) já tem o rótulo-alvo |

### Método, e o que fica por confirmar

Auditoria por leitura: **nenhum ficheiro de código foi tocado**. O varrimento dos alvos foi feito
com um script descartável fora do repositório
(`…/scratchpad/alvos.py`), que abre cada etiqueta `<button>`/`<a>`/`<Link>`/`<input>`/`<label>`
dos directórios `orcamento/` e `proposta/[token]/`, lê a `className` inteira (incluindo as
interpoladas com crase, que uma expressão regular ingénua corta ao meio) e assinala as que têm
altura ou padding pequenos **e** não têm já `alvo-toque`/`alvo-invisivel`: 168 candidatas, 65
depois de filtrar as que ganham altura noutro sítio, e daí saiu a tabela.

Fica marcado o que precisa de olho num iPhone a sério: se o `TouchSensor` do `dnd-kit` pega nas
pegas sem `touch-action: none` (A3-008), se as células do calendário aguentam alvos de 44 px sem
deformar a grelha do mês, e se o `<input type="checkbox" switch>` dá mesmo retorno táctil no
Safari (A3-015).
