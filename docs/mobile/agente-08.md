# Agente 8 — Sheets e sobreposições

Contei **dezassete sobreposições** na casa: três folhas inferiores, duas gavetas, quatro lupas de
ecrã inteiro e oito diálogos centrados. O `ThemePicker` está feito e serve de régua — o que a
varredura mostra é que ele é **a excepção, não o padrão**. As outras dezasseis afastam-se dele em
sítios diferentes, e nenhuma se afasta em todos: há sempre uma peça certa e uma peça de antes.
O `ThemeCopyDialog` é o caso mais claro — é o gémeo literal do `ThemePicker` (mesma folha, mesma
aresta, mesmo `rounded-t-2xl`) e ficou na versão anterior à correcção: `bg-black/35` sem
desfocagem, sem pega, sem área segura no rodapé. O comentário que explica porque é que o `/35`
estava errado está escrito a doze linhas de distância, no ficheiro ao lado.

Há uma peça da casa que resolvia metade disto e **está a ser usada uma vez**: o
`ui/FolhaOuDialogo.tsx` faz folha no telemóvel e diálogo no computador, com pega, trinco,
armadilha de foco e `env(safe-area-inset-bottom)` — e o único sítio que lhe chama é o menu de uma
fotografia no estúdio (`ProposalStudio.tsx:9378`). As outras quinze sobreposições são cada uma
escrita à mão. E ela própria tem um defeito que ninguém apanhou porque só há um sítio para o
apanhar: tocar no fundo não fecha (o escurecido é *filho* do elemento que tem o `onMouseDown`,
portanto o teste `target === currentTarget` nunca dá).

Três coisas atravessam a casa inteira e valem mais do que qualquer entrada individual.
**A primeira**: `grep -rn "popstate\|pushState"` no back office devolve **zero**. Nenhuma
sobreposição é uma entrada de histórico, portanto o gesto de deslizar da aresta esquerda no
Safari — que é como toda a gente fecha coisas num iPhone — não fecha o sheet: sai do back office.
**A segunda**: nenhuma das dezassete tem posição intermédia. São todas «aberto ou fechado»; a
única que segue o dedo (`ThemePicker`, e a `FolhaOuDialogo`) segue-o só para baixo e só para
fechar. **A terceira**: nenhuma lupa do back office tem gesto nenhum — e as duas do site público
(`GaleriaClient.tsx:1880`, `Inspiracao.tsx:844`) têm arrastar-para-baixo com escala e opacidade a
acompanhar, e swipe lateral para mudar de foto. O sítio onde ela trabalha todos os dias é o que
tem menos gestos do que a página que os clientes vêem.

Sobre proporção: fui à procura de sheets onde a moldura come mais de metade e **não encontrei
nenhum**. As folhas e as gavetas estão bem repartidas (a gaveta de detalhe gasta ~125 px de
cabeçalho em 844; o «Novo pedido» gasta ~178 px de 760). O defeito de proporção que existe é
outro e é mais parvo: três sobreposições medem o tecto em `vh` em vez de `dvh`
(`ThemeCopyDialog:249`, `CriarAPartirDe:231` e `239`) — `90vh` são ~760 px medidos no ecrã grande,
desenhados num ecrã onde só há ~660 visíveis com as barras do Safari à vista. Sobram ~100 px que
saem por uma das arestas. O resto da casa já passou a `dvh`; estas três ficaram para trás.

---

```
[A8-001] [Agente 8] [Todos os ecrãs] [Bloqueia] O gesto de voltar do Safari não fecha nada — sai do back office
     Largura onde falha: 390 / 430 (é onde o gesto de aresta existe)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:1794 (e as 17 sobreposições, nenhuma excepção)
     Observado:
       `grep -rn "popstate\|history.pushState\|history.back"` em todo o back office
       devolve zero linhas. Nenhum sheet, gaveta, lupa ou diálogo se regista no
       histórico do browser.
       Num iPhone, deslizar da aresta esquerda é o gesto de «fechar isto» — é
       assim que se sai de tudo. Aqui não fecha o sheet: navega para fora da
       página. Com a gaveta de detalhe aberta isso é perder o pedido que estava
       aberto E o `discardGuard()` (AdminClient.tsx:1790), que só corre dentro do
       `closeDetail` e portanto nunca chega a perguntar «tem alterações por
       guardar?». O aviso existe e é contornado pelo gesto mais natural do
       aparelho.
       Dois diálogos têm `beforeunload` enquanto trabalham (`RestoreDialog.tsx:178`,
       `ThemeCopyDialog.tsx:126`) — esses avisam. Os outros quinze não.
     Proposta:
       Um gancho único, `useSaidaPeloVoltar(aberto, aoFechar)`, que faz
       `history.pushState` ao abrir e ouve `popstate` para chamar o fecho — e que
       faz `history.back()` quando se fecha pelo × ou pelo gesto, para não deixar
       entradas mortas empilhadas. Um sítio, como o `useTrincoDeScroll`, e a
       classe inteira fica resolvida de uma vez.
       Ordem sugerida: a gaveta de detalhe primeiro (é a que tem o que perder).
     Equivalente em desktop: não existe — no computador fecha-se com Escape, que
       está implementado em toda a parte.

[A8-002] [Agente 8] [Pedidos — gaveta de detalhe] [Grave] A 390 a gaveta não tem fundo onde tocar, nem pega: a única saída é o × do canto mais longe
     Largura onde falha: 390 / 430 (a 768 já há fundo visível e o toque fora funciona)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4140 (o escurecido),
           :4163 (a gaveta), :4407 (o ×)
     Observado:
       A gaveta é `fixed inset-y-0 right-0 z-50 w-full max-w-md sm:max-w-xl` — a
       390 e a 430 o `w-full` ganha, portanto ocupa o ecrã todo. O escurecido por
       baixo (`fixed inset-0 z-40 bg-black/50 xl:hidden`, com o `onClick={closeDetail}`)
       fica inteiramente tapado: não há um pixel dele a que um dedo chegue.
       A partir de `sm` (640) o `max-w-xl` deixa 192 px de fundo a 768 e aí o
       toque fora passa a funcionar — o comportamento existe e desaparece
       exactamente na largura onde é preciso.
       Não há pega, não há arrasto, não há swipe para a direita. Resta o × do
       cabeçalho colado (AdminClient.tsx:4407), no canto superior direito de um
       ecrã de 844 px de alto, segurando o telemóvel com uma mão.
       O escurecido também não tem desfocagem — `bg-black/50` e mais nada, ao
       contrário do `backdrop-blur-[2px]` que o irmão da navegação já leva
       (:3144) e do `backdrop-blur-[3px]` da referência.
     Proposta:
       A gaveta desliza da direita, portanto o gesto que lhe pertence é para a
       direita — a mesma mecânica da pega do `ThemePicker` no eixo x, com o
       `FECHA_AOS` a valer em px horizontais. E uma pega vertical na aresta
       esquerda a dizer que se arrasta.
       O × pode ficar onde está (quem usa teclado precisa dele), mas deixa de ser
       a única porta. `backdrop-blur-[2px]` no escurecido, para igualar os irmãos.
     Equivalente em desktop: existe — a xl+ isto é um painel na grelha, não uma
       sobreposição, e fecha-se pelo × sem custo nenhum.

[A8-003] [Agente 8] [Todos os ecrãs — gaveta de navegação] [Grave] O escurecido da gaveta está um degrau abaixo do que a escada da casa manda: o cabeçalho e a barra de baixo ficam acesos por cima dele
     Largura onde falha: 390 / 430 / 768 (tudo abaixo de `lg`)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3144
           (a escada está escrita em :3262-3271; o cabeçalho em :3282; a barra em :3157)
     Observado:
       A escada de planos está documentada no próprio ficheiro e diz:
         30 → o cabeçalho da vista e a barra de navegação de baixo
         40 → a gaveta de navegação **e o seu fundo escuro**
       O fundo escuro está a `z-30`. Está no mesmo plano das duas coisas que devia
       escurecer, e vem ANTES delas no DOM — o `<header sticky top-0 z-30>` (:3282)
       e o `<nav fixed bottom-0 z-30>` (:3157) são ambos posteriores. Com `z-index`
       igual quem manda é a ordem no DOM, e os dois pintam por cima do escurecido.
       Nenhum deles está dentro de um contexto de empilhamento próprio: o
       `<div className="flex-1 min-w-0 flex flex-col …">` (:3255) que embrulha o
       cabeçalho não tem `z-index`, nem `transform`, nem `opacity`.
       Resultado: abre-se a gaveta, o ecrã escurece — e o cabeçalho no topo e a
       barra de destinos no fundo ficam à luz do dia, legíveis e tocáveis, por
       cima da camada que existe para os apagar. É o mesmo defeito de leitura que
       o `ThemePicker` já corrigiu («um fundo que deixa ler o que está por baixo
       não separa nada»), só que aqui a causa é o plano e não a opacidade.
       O `<aside>` da gaveta está a `z-40` e está certo. É só o fundo que ficou.
     Proposta:
       `z-30` → `z-40` na linha 3144. Um caractere, e passa a cumprir a escada que
       o ficheiro já tem escrita três parágrafos abaixo.
       [por confirmar no ecrã] se a barra de baixo deve ficar sob o escurecido ou
       se deve sair de cena como já sai com a gaveta de detalhe (`translate-y-full`).
     Equivalente em desktop: não existe — a `lg` a barra lateral é uma coluna
       permanente e não há escurecido nenhum.

[A8-004] [Agente 8] [Biblioteca de temas — copiar/mover fotos] [Grave] O gémeo do painel da biblioteca ficou na versão anterior à correcção
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/ThemeCopyDialog.tsx:238 (o fundo),
           :249 (o tecto em `vh`), :422 (o rodapé)
     Observado:
       Mesma folha inferior que a referência — `fixed inset-0 z-50 flex items-end
       justify-center … sm:items-center`, `rounded-t-2xl … sm:rounded-2xl`. Quatro
       diferenças, todas do lado errado:
       · **`bg-black/35` e mais nada.** Sem `backdrop-blur`, sem `supports-[]`. É
         literalmente o valor que o comentário do `ThemePicker.tsx:1825` descreve
         como o defeito («o título lia-se por trás do sheet, nítido e cortado a
         meio pela aresta de cima»). Aqui o que fica a ler-se por trás é a grelha
         de fotos do tema, com as miniaturas todas nítidas — pior do que texto.
       · **Sem pega de arrastar.** A saída é o × de 30×30 do canto superior
         direito (:246-266) — o próprio comentário admite os 30×30 e a distância.
         Tocar no fundo fecha (:239), mas só quando não está a copiar.
       · **`max-h-[90vh]` e não `dvh`.** ~760 px medidos no ecrã grande, numa
         folha desenhada no ecrã pequeno. [por confirmar no ecrã] por que aresta
         saem os ~100 px de diferença — no `items-end` deve ser o cabeçalho a
         sair por cima.
       · **Rodapé sem área segura.** O `px-5 py-4` da linha 422 leva o «Copiar N
         fotos» / «Mover N fotos» / «Parar» encostado à aresta de baixo de uma
         folha que está encostada à aresta de baixo do ecrã. Os 34 px do
         indicador de home do iPhone ficam por cima do botão que executa a
         operação destrutiva.
     Proposta:
       Copiar as quatro coisas do irmão, tal e qual:
       `bg-black/50 supports-[backdrop-filter]:backdrop-blur-[3px]`; a pega com
       `FECHA_AOS = 90` (com `disabled` do arrasto enquanto `running`, como o ×
       já tem); `max-h-[90dvh]`; e
       `style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}` no
       rodapé, como em `ThemePicker.tsx:2420`.
       A sério: isto é um caso para extrair a folha da referência para
       `ui/FolhaOuDialogo.tsx` e passar os dois a usá-la, em vez de manter dois
       gémeos que já divergiram uma vez.
     Equivalente em desktop: existe — a `sm+` é um diálogo centrado e nada disto
       se nota.

[A8-005] [Agente 8] [Calendário — adicionar ao calendário] [Grave] O teclado do iOS tapa metade do formulário, incluindo o botão de guardar
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:161 (o diálogo),
           :207 (o `autoFocus`), :233 (o botão)
     Observado:
       Diálogo centrado (`fixed inset-0 flex items-center justify-center p-4`) com
       `w-full max-w-md … p-6` — e **sem `max-h` nenhum e sem caixa que role**.
       O conteúdo mede ~410 px a 390 de largura (cabeçalho ~72, as cinco pastilhas
       de tipo em duas filas ~86, «Título» ~60, a fila «Hora»+«Nota» ~60, o botão
       ~48, mais os 48 de `p-6`). Centrado em 844, ocupa ~217→627.
       O campo «Título» tem `autoFocus` (:207), portanto o teclado do iOS abre
       **junto com o diálogo**. O teclado come ~336 px, deixando visível até aos
       ~508. A partir daí ficam tapados: a fila «Hora»/«Nota» inteira e o
       «Adicionar ao calendário».
       No iOS o teclado não encolhe o viewport de layout, portanto o diálogo não
       sobe sozinho — e como o `useTrincoDeScroll(true)` (:148) tranca o `body`,
       também não há para onde rolar. Fica-se com um formulário de onde só se vê o
       campo que está a ser escrito e nenhuma maneira de o submeter, a não ser o
       Enter (que está ligado, :210) — que num teclado de iPhone é a tecla
       «return» e não é óbvio que guarde.
       Também não tem armadilha de foco: importa o `useTrincoDeScroll` (:10) e não
       o `useFocusTrap`, apesar de declarar `role="dialog" aria-modal="true"`
       (:164-165). É o único diálogo do back office que anuncia modalidade sem a
       implementar.
     Proposta:
       Passar a folha inferior (é um formulário curto de quatro campos — o formato
       da `FolhaOuDialogo` serve inteiro), com o botão no rodapé fixo e
       `env(safe-area-inset-bottom)`. Numa folha encostada em baixo o teclado
       empurra a folha em vez de a tapar, que é o comportamento que o iOS dá de
       graça a quem está no fundo do ecrã.
       Tirar o `autoFocus` no telemóvel: abrir um diálogo já com o teclado em
       cima esconde as pastilhas de tipo, que é a primeira escolha a fazer.
       E acrescentar o `useFocusTrap`, que é uma linha.
     Equivalente em desktop: existe e funciona — no computador não há teclado a
       tapar nada.

[A8-006] [Agente 8] [Estúdio de propostas — criar a partir de…] [Grave] Fundo mais transparente do que o valor que a casa já classificou como erro de desenho
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/CriarAPartirDe.tsx:231, :239
     Observado:
       `bg-black/30 … backdrop-blur-sm`. A desfocagem lá está, mas o escuro é `/30`
       — cinco pontos abaixo do `/35` que o `ThemePicker.tsx:1825` documenta como
       o defeito que se corrigiu, e vinte abaixo do `/50` que ficou. Por trás
       deste diálogo está o estúdio de propostas inteiro, com o cabeçalho e a
       barra do total.
       E `pt-[8vh]` + `max-h-[80vh]` (:231, :239) — outra vez o ecrã grande a
       medir uma coisa desenhada no pequeno. `8vh + 80vh` = ~743 px num ecrã onde
       há ~660 visíveis: a lista de propostas anteriores acaba abaixo da aresta,
       e é uma lista onde se procura por rolo.
       O resto está bem: `onMouseDown` com o teste de origem (:232), campo de
       procura em cima com `autoFocus`, trinco e armadilha de foco (:105-106),
       navegação por setas.
     Proposta:
       `bg-black/50 supports-[backdrop-filter]:backdrop-blur-[3px]`, e
       `pt-[8dvh] max-h-[80dvh]`. Quatro caracteres e uma classe.
     Equivalente em desktop: existe — a `sm+` o diálogo cabe e o fundo claro
       incomoda menos porque há muito mais fundo.

[A8-007] [Agente 8] [Biblioteca de temas — lupa da foto] [Grave] A única sobreposição que não usa nenhum dos dois ganchos da casa — e é a que se empilha
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/PhotoLightbox.tsx:78-129
           (aberta de Temas.tsx:3180, por cima do ThemeCopyDialog de Temas.tsx:3168)
     Observado:
       O `PhotoLightbox` tem trinco de scroll e armadilha de foco **escritos à
       mão**, e é o único ficheiro do back office assim:
       · o trinco (:123-129) é `document.body.style.overflow = "hidden"` com o
         valor anterior guardado no próprio efeito — **sem a contagem** que o
         `useTrincoDeScroll` tem precisamente para dois diálogos empilhados
         (useTrincoDeScroll.ts:44-52). Aberto por cima de um diálogo que já
         trancou, guarda `"hidden"` como valor anterior e devolve `"hidden"` ao
         sair; se a ordem se inverter, é o trinco contado que passa a guardar o
         `"hidden"` do lightbox como estado anterior — e a página fica trancada
         até se recarregar. [por confirmar no ecrã] se a ordem inversa é
         alcançável a partir do ecrã dos Temas; a mecânica está lá de qualquer
         maneira e não devia estar.
       · a armadilha (:95-110) prende o Tab mas **não põe `inert` no que está por
         trás** nem devolve o foco ao fechar (o comentário :116 diz que quem o
         devolve é quem abriu).
       No ecrã dos Temas, `copyOpen` e `zoomAt` são estados independentes
       (Temas.tsx:3167 e :3179) — os dois podem estar abertos. Os dois estão a
       `z-50`; ganha o lightbox por vir depois no DOM, o que por acaso está certo.
       O que não está: o `ThemeCopyDialog` por baixo tem `useFocusTrap(true)`
       fixo (ThemeCopyDialog.tsx:95), e essa armadilha regista o `keydown` em
       fase de captura **primeiro**. Carregar em Tab dentro da lupa vai parar ao
       diálogo de baixo (useFocusTrap.ts:96: `!container.contains(activeEl)` →
       `first.focus()`).
     Proposta:
       Trocar as duas implementações à mão pelos ganchos da casa: `useTrincoDeScroll(true)`
       e `useFocusTrap<HTMLDivElement>(true)`, exactamente como o `LupaDeFotos.tsx:48-49`
       já faz — é o mesmo componente, escrito duas vezes, e a segunda versão está
       melhor. Depois disso os dois passam a ser candidatos a serem **um**.
       O empilhamento em si é o A8-011.
     Equivalente em desktop: existe — o mesmo defeito, mas com rato e teclado
       nota-se muito menos.

[A8-008] [Agente 8] [Definições / Cópias de segurança] [Grave] O Toast está mais baixo do que cinco diálogos: a confirmação sai por trás da janela que a provocou
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/Toast.tsx:96 (`z-[80]`)
           vs PasskeysDialog.tsx:194 (`z-[95]`), RestoreDialog.tsx:275 (`z-[95]`),
           CommandPalette.tsx:155 (`z-[90]`), NewQuoteModal.tsx:99 (`z-[85]`),
           SessaoExpirada.tsx:277 (`z-[110]`)
     Observado:
       O `PasskeysDialog` remove um dispositivo e chama `toast?.("Dispositivo
       removido.", "success")` (:189). O diálogo está a `z-[95]`, o Toast a
       `z-[80]` — e o Toast vive no fundo à direita, exactamente onde o diálogo
       (`max-w-lg`, ecrã quase todo a 390) está. A confirmação de que o
       dispositivo saiu aparece **por trás** do painel que a pediu.
       O mesmo vale para o `NewQuoteModal` (:89, `toast(porqueFalhou(…))` numa
       falha de rede — a mensagem que explica porque é que o pedido não foi criado
       fica escondida) e para a paleta de comandos.
       A escada documentada em AdminClient.tsx:3262-3271 tem quatro degraus e
       acaba em «50+ diálogos e o Toast» — na prática há dez valores em uso:
       30, 40, 50, 60, 70, 80, 85, 90, 95, 110. O Toast está a meio da pilha em
       vez de no topo dela.
     Proposta:
       O Toast é a única coisa que tem de estar sempre por cima de tudo, incluindo
       a sessão expirada. `z-[200]`, e a escada da linha 3262 actualizada para
       dizer os degraus que existem mesmo — a lista de quatro está a mentir sobre
       uma pilha de dez.
     Equivalente em desktop: existe — a `lg` o Toast tem `bottom-[calc(...)]` sem
       a barra inferior e cai numa zona onde os diálogos centrados são mais
       estreitos, portanto às vezes vê-se. É pior no telemóvel, onde os diálogos
       ocupam o ecrã todo.

[A8-009] [Agente 8] [Estúdio — menu de uma fotografia] [Grave] Tocar no fundo não fecha a folha: o escurecido é filho do elemento que trata o toque
     Largura onde falha: 390 / 430 (é onde é folha; a `sm+` é diálogo e o defeito é o mesmo)
     Onde: src/app/[lang]/(site)/orcamento/admin/ui/FolhaOuDialogo.tsx:110-114
     Observado:
       ```
       <div className="fixed inset-0 z-50 flex" onMouseDown={(e) => {
             if (e.target === e.currentTarget) onFechar();   // ← :111
           }}>
         <div className="absolute inset-0 bg-[#1b2119]/40 backdrop-blur-[2px]" aria-hidden />
       ```
       O escurecido é `absolute inset-0` e **filho** do elemento que tem o
       `onMouseDown`. Cobre a área toda. Qualquer toque fora da folha acerta nele,
       portanto `e.target` é o escurecido e nunca o `currentTarget` — a condição
       nunca dá verdadeira e o fundo nunca fecha.
       A folha é `max-h-[88dvh]` com `mt-auto`, o que deixa ~12dvh (≈100 px) de
       escurecido em cima que parece tocável e não é.
       O comentário ao lado (:107-109) explica bem porque é que a condição existe
       — arrastar de dentro para fora não deve fechar. A condição está certa; o
       que está errado é o sítio do escurecido.
       O `ThemePicker` não tem este problema porque põe o `bg-black/50` no PRÓPRIO
       elemento que trata o clique (ThemePicker.tsx:1834), sem filho nenhum pelo
       meio. É a diferença toda.
       Como só há um sítio a usar a `FolhaOuDialogo` (`ProposalStudio.tsx:9378`),
       isto passou despercebido — mas é a peça que se quer usar em mais quinze
       sítios.
     Proposta:
       Pôr as classes do escurecido no elemento de fora e deitar o filho fora,
       como na referência. Ou, se o filho tiver de ficar (por causa do
       `aria-hidden`), aceitar os dois: `if (e.target === e.currentTarget ||
       e.currentTarget.firstElementChild === e.target)`. A primeira é mais limpa.
     Equivalente em desktop: existe — o mesmo defeito, e no computador é mais
       visível porque clicar fora é o reflexo mais forte que há.

[A8-010] [Agente 8] [Estúdio e Biblioteca — as duas lupas] [Grave] As lupas do back office não têm gesto nenhum; as do site público têm arrastar-para-fechar e swipe
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/PhotoLightbox.tsx:139
           src/app/[lang]/(site)/orcamento/admin/LupaDeFotos.tsx:79
           (a comparação: src/app/[lang]/(site)/galeria/GaleriaClient.tsx:1880-1907
            e src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx:844-857)
     Observado:
       As duas lupas do back office são ecrãs pretos inteiros com um × de 36×36
       no canto superior direito, setas ‹ › nas arestas laterais e as setas do
       teclado. Nenhum `onTouchStart`, nenhum `onPointerDown`, nada.
       Percorrer 40 fotos de um mood board num iPhone é, hoje, 40 toques num alvo
       de 44 px na aresta do ecrã — quando o gesto que toda a gente faz numa
       galeria de fotos é arrastar de lado.
       No site público está tudo feito, e bem: o `GaleriaClient` (:1880-1907) tem
       arrasto vertical com a camada a seguir o dedo (`translateY` + `scale`
       progressivo) e o escurecido a desvanecer com ele, fecha aos 120 px, e
       swipe horizontal aos 50 px para mudar de foto — com detecção de eixo, para
       um dedo a rolar não mudar de imagem. O `Inspiracao.tsx:844` tem a versão
       curta do mesmo (swipe horizontal com `DISTANCIA_DO_GESTO` e teste de eixo).
       Duas implementações prontas, na mesma árvore, a duas pastas de distância.
     Proposta:
       Extrair o gesto do `GaleriaClient` para `src/lib/motion/` (a pasta já
       existe) e ligá-lo às duas lupas do back office. Arrastar para baixo fecha;
       arrastar de lado muda de foto; as setas e o × ficam para quem não arrasta.
       E, já agora, arrumar as duas lupas numa só — são o mesmo componente
       escrito duas vezes, e uma delas (A8-007) está pior do que a outra.
     Equivalente em desktop: existe e chega — no computador as setas do teclado
       fazem o trabalho todo.

[A8-011] [Agente 8] [Todos os diálogos empilhados] [Menor] A armadilha de foco do de baixo prende o de cima
     Largura onde falha: todas (é defeito de teclado — pesa menos no telemóvel)
     Onde: src/app/[lang]/(site)/orcamento/admin/useFocusTrap.ts:80-103
     Observado:
       O `useFocusTrap` regista `keydown` em fase de **captura** no `document`
       (:103) e, quando o foco não está dentro do seu contentor, traz-no de volta
       à força (:91-98). Duas armadilhas activas ao mesmo tempo → a do diálogo de
       baixo, que registou primeiro, corre primeiro e ganha: cada Tab dentro do
       diálogo de cima salta para o primeiro elemento do de baixo.
       O `inert` nos irmãos (:65-78) devia proteger disto, e não protege por duas
       razões: percorre só `document.body.children`, e **nenhum diálogo do back
       office usa `createPortal`** — todos desenham onde estão na árvore, portanto
       um diálogo aberto por cima de outro nunca é irmão de `body`, é neto ou
       bisneto do mesmo `#root`, e o `node.contains(container)` (:69) salta-o.
       O `inert` só apanha o que está fora da aplicação inteira.
       Pares alcançáveis a partir do telemóvel que passam por aqui: o
       `ThemeCopyDialog` + a lupa (A8-007), o `ThemePicker` aberto de dentro da
       gaveta de detalhe, e o `SessaoExpirada` por cima de tudo o que estiver
       aberto quando a sessão morrer.
       Devolver o foco ao fechar o de cima funciona (:113 guarda o
       `previouslyFocused`) — o que não funciona é navegar enquanto os dois estão
       abertos.
     Proposta:
       Uma pilha no módulo, como o `trincos` do `useTrincoDeScroll`: cada
       armadilha inscreve-se num array partilhado e só a **última** faz alguma
       coisa no `keydown`. É o mesmo padrão, no ficheiro do lado, e resolve
       também o `inert` (marcar inerte o contentor da armadilha anterior em vez de
       varrer os filhos de `body`).
     Equivalente em desktop: existe — é o mesmo código e o mesmo defeito, e no
       computador nota-se mais porque lá usa-se o Tab.

[A8-012] [Agente 8] [Todas as folhas] [Menor] Nenhuma folha tem posição intermédia — são todas «aberta ou fechada»
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/ui/FolhaOuDialogo.tsx:139-160,
           ThemePicker.tsx:1496-1517 (o arrasto), ThemeCopyDialog.tsx:249 (nem arrasto tem)
     Observado:
       As três folhas da casa têm um estado só. O arrasto que existe é
       `Math.max(0, …)` — só para baixo, e só até fechar (`FECHA_AOS = 90`,
       `FECHAR_A_PARTIR_DE = 80`). Puxar para cima não faz nada, por decisão
       explícita nos dois comentários.
       Onde isso custa mesmo é na **gaveta de detalhe** (que nem folha é — é uma
       gaveta lateral de ecrã inteiro, A8-002): abrir um pedido tapa a lista
       inteira, e voltar a ver a lista é fechar o pedido e perder o sítio onde se
       estava. Numa montagem, a pergunta «este é o pedido da quinta de sábado ou
       o de domingo?» custa duas transições de ecrã inteiro.
       Também custa no `ThemePicker`, onde uma posição a meio deixaria ver a
       secção da proposta onde as fotos vão entrar enquanto se escolhem.
     Proposta:
       Não é para fazer já e não é para fazer em todas — é para fazer **numa**,
       e a candidata é a gaveta de detalhe: um passo a ~55% de altura, com o
       cabeçalho do pedido e os botões de acção à vista e a lista visível por
       cima. `translateY` com três pontos de paragem, largando na mais próxima,
       como a pega já faz para o zero.
       As restantes ficam binárias, que é o correcto para um formulário curto.
     Equivalente em desktop: existe e é melhor — a xl+ a lista e o detalhe estão
       lado a lado, que é a posição intermédia levada ao fim.

[A8-013] [Agente 8] [Pedidos — novo pedido] [Menor] O campo «Notas» é o último de um diálogo centrado: com o teclado aberto fica no limite
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:99, :268
     Observado:
       Diálogo centrado com `max-h-[90dvh]` (o `dvh` está certo), cabeçalho fixo
       (~98 px), corpo que rola e rodapé fixo com «Cancelar»/«Criar pedido»
       (~80 px) — a proporção está bem: ~77% para o conteúdo.
       O problema é o último campo. A `textarea` «Notas» (:268, `rows={3}`) fica
       no fim de uma lista de nove campos que a 390 é uma coluna só. Focá-la abre
       o teclado; o iOS rola o contentor para a trazer à vista, o que costuma
       resultar — mas o diálogo é `fixed` num `body` trancado pelo
       `useTrincoDeScroll` (:42), e o que o iOS faz nesse caso é subir o viewport
       visual inteiro, empurrando o cabeçalho do diálogo para fora.
       [por confirmar no ecrã] — é o género de coisa que só se vê no aparelho,
       e as duas hipóteses (rola dentro / sobe tudo) dão experiências diferentes.
     Proposta:
       Ver primeiro. Se subir tudo, a resposta é a mesma do A8-005: folha inferior
       no telemóvel, onde o teclado empurra em vez de tapar. O componente
       `FolhaOuDialogo` já faz exactamente essa troca por largura.
     Equivalente em desktop: existe e funciona.

[A8-014] [Agente 8] [Todos os ecrãs — paleta de comandos] [Menor] 12dvh de escurecido morto por cima da caixa de procura
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/CommandPalette.tsx:155
     Observado:
       `items-start … pt-[12dvh]` — ~101 px de escurecido acima da caixa antes de
       aparecer alguma coisa. A lista tem `max-h-[52dvh]` (~439 px). Com o teclado
       do iOS aberto (e a paleta abre sempre com o campo focado) sobram ~508 px
       visíveis: a caixa e ~5 resultados. Os outros ficam debaixo do teclado, numa
       lista que serve precisamente para percorrer.
       O afastamento do topo é uma proporção de computador — num ecrã de 27" os
       12% dão respiro; num de 390×844 com teclado dão 101 px que faltam à lista.
       O resto está bem pensado: o × só aparece em ecrã de toque (:212-220, com um
       comentário a explicar a ordem das classes do Tailwind), o escurecido fecha,
       trinco e armadilha de foco lá estão (:51-52).
     Proposta:
       `pt-[12dvh] sm:pt-[12dvh] pt-[4dvh]` — ou seja, ~34 px no telemóvel e os
       12% a partir de `sm`. E `max-h-[52dvh]` pode passar a `max-h-[60dvh]` no
       telemóvel com o espaço que sobra.
     Equivalente em desktop: existe e está certo.

[A8-015] [Agente 8] [Pedidos — gaveta de detalhe] [Menor] A gaveta chega à aresta de baixo sem área segura
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4163, :4434
     Observado:
       A gaveta é `fixed inset-y-0 … max-h-[100dvh]` e o conteúdo que rola acaba
       em `px-5 py-6` (:4434) — 24 px de folga em baixo. O indicador de home do
       iPhone ocupa ~34. A última linha de conteúdo do pedido fica por baixo dele.
       A casa já sabe fazer isto: a barra de navegação inferior tem
       `paddingBottom: env(safe-area-inset-bottom)` (:3160) e o conteúdo principal
       reserva `calc(var(--bo-barra-inferior) + env(safe-area-inset-bottom))`
       (:3255). A gaveta, que tapa os dois, não reserva nada.
     Proposta:
       `pb-[max(1.5rem,env(safe-area-inset-bottom))]` no contentor de :4434, ou o
       `pb-[max(0.75rem,env(safe-area-inset-bottom))]` que a `FolhaOuDialogo` já
       usa no rodapé (:180).
     Equivalente em desktop: não existe — a xl+ é um painel na grelha e não chega
       a aresta nenhuma.
```

---

## Inventário de sobreposições

Dezassete, por ordem de plano. `—` quer dizer que não se aplica (não é uma camada modal).
O `ThemePicker` na primeira linha é a régua.

| Componente | Trinco de scroll? | Focus trap? | Scrim + blur? | Fecha por gesto? | Safe-area? | z-index |
|---|---|---|---|---|---|---|
| **`ThemePicker.tsx:1834`** *(referência)* | ✅ contado | ✅ gancho | ✅ `/50` + blur 3px c/ `supports` | ✅ pega, `FECHA_AOS=90` + toque no fundo | ✅ rodapé | 50 |
| `ui/FolhaOuDialogo.tsx:105` | ✅ contado | ✅ gancho | ⚠️ `/40` + blur 2px, sem `supports` | ⚠️ pega sim, **toque no fundo não** (A8-009) | ✅ rodapé | 50 |
| `ThemeCopyDialog.tsx:238` | ✅ contado | ✅ gancho | ❌ `/35` **sem blur** (A8-004) | ⚠️ só toque no fundo, sem pega | ❌ (A8-004) | 50 |
| `CriarAPartirDe.tsx:231` | ✅ contado | ✅ gancho | ⚠️ `/30` + blur (A8-006) | ⚠️ só toque no fundo | — centrado | 50 |
| `PhotoLightbox.tsx:139` | ❌ à mão, sem contagem | ❌ à mão, sem `inert` | ✅ `/92` opaco | ⚠️ só toque no fundo, sem swipe (A8-010) | ❌ | 50 |
| `AdminClient.tsx:4163` gaveta de detalhe | ✅ contado | ✅ gancho (só em overlay) | ⚠️ `/50` **sem blur**, e tapado a 390 (A8-002) | ❌ nada (A8-002) | ❌ (A8-015) | 50 |
| `Calendario.tsx:161` | ✅ contado | ❌ **nenhum** (A8-005) | ✅ `/60` + blur | ⚠️ só toque no fundo | — centrado | 50 |
| `GaleriaClient.tsx:1937` *(site público)* | ✅ à mão | ✅ à mão | ✅ opaco | ✅ **arrasto + swipe** (o melhor da casa) | ✅ | 60 |
| `Inspiracao.tsx:840` *(proposta do casal)* | ✅ à mão | ✅ à mão | ✅ `/94` opaco | ✅ swipe lateral | ⚠️ | 50 |
| `ThemePicker.tsx:831` toast interno | — | — | — | — | — | 70 |
| `LupaDeFotos.tsx:79` | ✅ contado | ✅ gancho | ✅ `/85` + blur | ⚠️ só toque no fundo, sem swipe (A8-010) | ❌ | 80 |
| `Toast.tsx:96` | — | — | — | — | ✅ | 80 ⚠️ (A8-008) |
| `NewQuoteModal.tsx:99` | ✅ contado | ✅ gancho | ✅ `/60` + blur | ⚠️ só toque no fundo | — centrado | 85 |
| `CommandPalette.tsx:155` | ✅ contado | ✅ gancho | ✅ `/50` + blur | ⚠️ só toque no fundo | — centrado | 90 |
| `ShortcutsModal.tsx:75` | ✅ contado | ✅ gancho | ✅ `/60` + blur | ⚠️ só toque no fundo | — centrado | 90 |
| `AjudaGlossario.tsx:40` | ✅ contado | ✅ gancho | ✅ `/60` + blur | ⚠️ só toque no fundo | — centrado | 90 |
| `PasskeysDialog.tsx:194` | ✅ contado | ✅ gancho | ✅ `/60` + blur | ⚠️ só toque no fundo | — centrado | 95 |
| `RestoreDialog.tsx:275` | ✅ contado | ✅ gancho | ✅ `/60` + blur | ❌ de propósito (não fecha a meio) | — centrado | 95 |
| `SessaoExpirada.tsx:277` | ✅ contado | ✅ gancho | ✅ `/60` + blur | ❌ de propósito (não há saída) | — centrado | 110 |
| `AdminClient.tsx:3144` fundo da gaveta de nav. | — | — | ⚠️ `/60` + blur, mas **no plano errado** (A8-003) | ✅ toque | — | 30 ⚠️ |

**Nenhuma das dezassete responde ao gesto de voltar do Safari (A8-001).**
**Nenhuma das dezassete tem posição intermédia (A8-012).**
Dez usam `dvh`; três continuam em `vh` (`ThemePicker:1844`, `ThemeCopyDialog:249`,
`CriarAPartirDe:231`+`239`) — a da referência incluída, e é a mesma correcção nas três.
