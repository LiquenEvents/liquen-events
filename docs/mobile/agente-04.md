# Agente 4 — Formulários e teclado

**264 campos de entrada** em 57 ficheiros. O formulário público — o que os casais preenchem
no telemóvel, e portanto o único que ela não controla — **está bem**: `type="tel"` com
`inputMode="tel"`, `type="email"`, `inputMode="numeric"` com `pattern="[0-9]*"` no número de
pessoas (que é a forma certa e não o `type="number"`), `type="date"` nativo, rascunho em
`sessionStorage` descarregado à força no `pagehide`. Quem o escreveu sabia o que estava a
fazer. O back office é outra história, e a diferença não é de gosto: é que **as regras que
protegem o formulário público nunca atravessaram a porta do `/admin`**.

Três coisas ficaram claras ao ler tudo:

**Primeira: a casa já sabe o remédio, e aplicou-o uma vez.** O `AdminLogin.tsx` tem
`seguirOTeclado` — mede a `visualViewport`, calcula quanto rolar para o campo E o botão de
submeter caberem acima do teclado, abre espaço no fundo do `<body>` porque no iOS a janela de
layout não encolhe. Está escrito com as medidas de um iPhone SE ao lado. É uma função privada
de um ficheiro só. O `ProposalStudio.tsx:7910` tem um `onFocus={e => e.currentTarget
.scrollIntoView({block:"center"})}` num campo — **um**, o «Validade (dias)» — com um comentário
que explica exactamente o problema («o `scroll-margin-bottom` sozinho não resolve — só entra em
jogo se ALGUÉM pedir um scroll, e um toque para abrir o teclado não pede nenhum»). Os outros
262 campos não têm nada. O diagnóstico está escrito no repositório; o tratamento é que ficou
por distribuir.

**Segunda: quase nada é um `<form>`.** Há **sete** elementos `<form>` na aplicação inteira, e
seis são de autenticação ou quase (`AdminLogin` ×2, `SessaoExpirada`, `DefinirPalavraPasse`,
`Servicos`, `PaymentsPanel`). O modal de «Novo pedido» com 11 campos, a gaveta do pedido com
12, o Inventário com 8, os Fornecedores com 6 — nenhum deles é um formulário. O iOS dá a barra
de «‹ › Concluído» de graça, mas só entre campos do MESMO `<form>`: sem ele as setas ficam
cinzentas e cada campo obriga a fechar o teclado, rolar, tocar, esperar o teclado abrir outra
vez. Onze campos = onze vezes.

**Terceira: `autoCapitalize` e `autoCorrect` existem em três sítios da casa toda**, e os três
são o email do login. Nem o formulário público os tem. Todos os outros campos — o nome do
casal, o nome da quinta, o e-mail do fornecedor, a procura por «Malhadinha» — levam com a
autocorreção do iOS ligada e a maiúscula inicial automática.

Vinte entradas. A que bloqueia mesmo é pequena e não se vê a olho: **uma correcção começada num
campo em linha não se consegue abandonar num telemóvel** — a única saída é o Escape, e não há
tecla Escape. O `onBlur` grava o que lá estiver.

---

[A4-001] [Agente 4] [Guião do dia · Checklist · Inventário · Estúdio] [Bloqueia] Uma edição em linha começada não se consegue abandonar: a única saída é o Escape
     Largura onde falha: todas com `(pointer: coarse)` — 390 / 430 / 768
     Onde: src/app/[lang]/(site)/orcamento/admin/EventTimeline.tsx:129-132 (`editKeys`), usado
       em :212, :242, :262
       src/app/[lang]/(site)/orcamento/admin/EventChecklist.tsx:314-318
       src/app/[lang]/(site)/orcamento/admin/PaymentsPanel.tsx:443-446
       src/app/[lang]/(site)/orcamento/admin/Overview.tsx:585-588
       src/app/[lang]/(site)/orcamento/admin/Inventario.tsx:603, :623, :646 (linhas editáveis)
     Observado: o guião do dia, a checklist e o inventário editam-se tocando no texto, que se
       troca por um `<input>` com `autoFocus`. O campo tem `onBlur={commitEdit}` e um
       `onKeyDown` com duas teclas: `Enter` grava, `Escape` desiste. Num telemóvel não há
       Escape. Ou seja: tocou-se por engano na hora errada, escreveu-se «1» a mais, e a partir
       daí **não há gesto nenhum que devolva o valor anterior** — tocar noutro sítio dispara o
       `onBlur` e grava, fechar o teclado dispara o `onBlur` e grava, rolar a lista pode
       disparar o `onBlur` e gravar. É o ecrã que ela usa de pé numa quinta, a corrigir o guião
       no local, com o polegar. O comentário do `EventTimeline.tsx:221-228` diz textualmente
       «o guião do dia é lido e corrigido no local, de pé» — o alvo de toque foi corrigido para
       44 px, a saída não.
     Proposta: enquanto um campo está em edição, mostrar dois botões — ✓ e ✕ — ao lado dele
       (existe espaço: a linha já tem a coluna dos botões de acção). O ✕ faz o que o Escape faz.
       Em alternativa, e mais barato: `onBlur` deixa de gravar e passa a manter o campo aberto;
       grava-se só pelo ✓ ou pelo `Enter`. A primeira é melhor — um botão visível não precisa
       de ser descoberto.
     Equivalente em desktop: existe (Escape)

[A4-002] [Agente 4] [Todo o back office] [Grave] Nenhum formulário está dentro de um `<form>`, e por isso não há barra de «anterior / seguinte / concluído»
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: há SETE `<form>` em toda a aplicação —
       src/app/[lang]/(site)/orcamento/admin/AdminLogin.tsx:482 e :687
       src/app/[lang]/(site)/orcamento/admin/SessaoExpirada.tsx:327
       src/app/[lang]/(site)/orcamento/admin/Servicos.tsx:272
       src/app/[lang]/(site)/orcamento/admin/PaymentsPanel.tsx:619
       src/app/[lang]/(site)/orcamento/admin/recuperar/DefinirPalavraPasse.tsx:111
       src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx:949
       E não há mais nenhum. Os que faltam, por ordem de tamanho:
       src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:144-277 (11 campos, num `<div>`)
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4637-4911 (12 campos na gaveta)
       src/app/[lang]/(site)/orcamento/admin/Inventario.tsx:438-489 (8)
       src/app/[lang]/(site)/orcamento/admin/MaterialRegras.tsx:166-236 (7)
       src/app/[lang]/(site)/orcamento/admin/Fornecedores.tsx:373-415 e :498-546 (6 ×2)
       src/app/[lang]/(site)/orcamento/admin/Material.tsx:376-428 (7)
       src/app/[lang]/(site)/orcamento/admin/EventCosts.tsx:288-368 (6)
       src/app/[lang]/(site)/orcamento/admin/Tarefas.tsx:583-659 (5)
     Observado: o Safari do iOS põe uma barra por cima do teclado com «‹ › Concluído» que salta
       entre campos sem fechar o teclado. Essa barra só liga campos do MESMO `<form>`; num
       grupo de `<div>`s as setas aparecem **cinzentas e inertes**. Com 11 campos no «Novo
       pedido», preencher é: tocar, escrever, tocar em «Concluído» para fechar o teclado, rolar
       à procura do campo seguinte, tocar, esperar o teclado abrir. Onze vezes. O
       `PaymentsPanel.tsx:599` tem o comentário certo escrito — «Um `<form>` a sério: dá
       submissão implícita (Enter em qualquer campo)» — e é o único ecrã de dados que o faz.
       [por confirmar no ecrã] o comportamento exacto das setas varia com a versão do iOS.
     Proposta: embrulhar cada bloco de campos num `<form onSubmit={...}>` e pôr o botão
       principal como `type="submit"`. Não muda nada no desktop (o `ui/Button.tsx:140` já é
       `type="button"` por omissão, portanto nada submete por acidente), e no telemóvel devolve
       a barra de navegação, a submissão por Enter e o autofill em cadeia. É a correcção com
       melhor razão de esforço para resultado de todo este relatório.
     Equivalente em desktop: não existe (no desktop o Tab já faz este trabalho)

[A4-003] [Agente 4] [Folhas, gavetas e diálogos] [Grave] O botão de gravar fica atrás do teclado, e a defesa que existe está trancada no ecrã de entrada
     Largura onde falha: todas com `(pointer: coarse)` — pior a 390
     Onde: src/app/[lang]/(site)/orcamento/admin/ui/FolhaOuDialogo.tsx:130 (`max-h-[88dvh]`),
       :169 (corpo que rola), :173-185 (o rodapé das acções, FORA do que rola)
       src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:108 (`max-h-[90dvh]`), :280
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4163 (gaveta, `max-h-[100dvh]`),
       :5571 (o pé com «Guardar alterações»)
       A defesa que falta: src/app/[lang]/(site)/orcamento/admin/AdminLogin.tsx:876-979
       (`aoFocarCampo` / `deslocamentoParaOTeclado` / `espacoDoTeclado` / `seguirOTeclado`) —
       função privada, não exportada, usada num ficheiro só.
     Observado: as três caixas são molduras de três andares — cabeça, meio que rola, pé com as
       acções. O pé está FORA do que rola, de propósito e com boa razão (ver o comentário do
       `AdminClient.tsx:4146-4162`). Só que `dvh` não sabe do teclado: no iOS a janela de
       LAYOUT não encolhe quando o teclado abre, encolhe a VISUAL. Resultado: a caixa continua
       a medir 88% de um ecrã que já não existe, e o rodapé com «Guardar» fica atrás do
       teclado. O corpo que rola safa-se em parte (o iOS leva o campo focado à vista dentro do
       contentor mais próximo), mas o pé não rola com nada.
       Junta-se a isto o `useTrincoDeScroll` (`useTrincoDeScroll.ts:80`, `body { overflow:
       hidden }`), que fecha a saída de emergência: nem a página de trás anda.
       Na prática ela consegue gravar — fecha o teclado com «Concluído» e o botão reaparece —
       mas isso é um gesto a mais por cada gravação, e o comentário do `AdminLogin.tsx:838`
       diz o que é medido no ecrã de entrada: «não é que o botão se perdesse — perdia-se o
       próprio campo que se acabou de tocar».
       [por confirmar no ecrã] quanto é que o corpo que rola compensa em cada uma das três.
     Proposta: tirar `deslocamentoParaOTeclado`, `espacoDoTeclado` e `seguirOTeclado` do
       `AdminLogin.tsx` para um `useSeguirOTeclado.ts` em `admin/`, e chamá-lo com um
       `onFocusCapture` no `FolhaOuDialogo`, no `NewQuoteModal` e na gaveta do pedido. A conta
       já está separada do DOM de propósito, «para poder ser provada com números» — está
       pronta a mudar de sítio. Nos três casos há um único botão principal no pé, que é
       exactamente o que o `closest("form")?.querySelector('button[type="submit"]')` procura
       (mais uma razão para o A4-002 vir primeiro).
     Equivalente em desktop: não existe (sem teclado de ecrã não há nada a tapar)

[A4-004] [Agente 4] [Fornecedores] [Grave] O telefone e o e-mail do fornecedor são campos de texto: teclado de letras, maiúscula automática e autocorreção
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/Fornecedores.tsx:392 (telefone, formulário de
       acrescentar), :398 (e-mail), :519 (telefone, edição em linha), :526 (e-mail)
     Observado: são quatro `<Field>` sem `type` nenhum. O `ui/Field.tsx:92` tem
       `as = "input"` por omissão e o `type` nunca é passado, portanto sai um
       `<input type="text">`. Num iPhone isso quer dizer: teclado QWERTY para escrever
       «+351 962 …» (sem o `+`, sem o teclado numérico), e para o e-mail — que é onde dói —
       maiúscula inicial automática e autocorreção ligadas. «geral@quintadoscastanheiros.pt»
       tem duas hipóteses de sair «Geral@quintadoscastanheiros.pt» e uma boa hipótese de o
       nome da quinta ser «corrigido». O directório de fornecedores é o sítio de onde saem os
       contactos que se usam à pressa numa montagem.
     Proposta: `type="tel" inputMode="tel" autoComplete="off"` no telefone (é o que a gaveta
       do pedido já faz — `AdminClient.tsx:4835`), e `type="email" inputMode="email"
       autoCapitalize="none" autoCorrect="off" spellCheck={false}` no e-mail (é o que o
       `AdminLogin.tsx:517-521` já faz). Não é preciso inventar nada: os dois padrões existem
       na casa, a duas pastas de distância.
     Equivalente em desktop: existe / não se nota

[A4-005] [Agente 4] [Estúdio de propostas · Quadro do orçamento] [Grave] Uma linha de valor do orçamento com teclado alfabético
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7598
     Observado: é o campo «Valor» das `budgetRows` — o quadro de valores estimados que sai no
       PDF. `placeholder="1.500,00 €"`, `aria-label="Valor"`, e **nenhum `inputMode`**. Abre o
       teclado de letras para escrever um preço. Todos os outros campos de dinheiro do mesmo
       ficheiro têm `inputMode="decimal"` — o preço da linha (:7161), o preço por mesa/convidado
       (:7224), o valor da linha adicional (:7532) e o total (:7739). Este ficou de fora, e é o
       único campo de dinheiro do estúdio que não tem. Uma proposta escrita com o teclado errado é
       exactamente a frase do briefing.
     Proposta: `inputMode="decimal"`. Uma palavra.
     Equivalente em desktop: existe / não se nota

[A4-006] [Agente 4] [Onze ecrãs] [Grave] `type="number"` — em iOS apaga o que se escreveu quando o que se escreveu não é um número
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4737 (convidados)
       src/app/[lang]/(site)/orcamento/admin/GuestList.tsx:252 e :352 (convidados por grupo)
       src/app/[lang]/(site)/orcamento/admin/Inventario.tsx:457, :623, :754 (quantidade)
       src/app/[lang]/(site)/orcamento/admin/Overview.tsx:580 (meta de receita — ver A4-009)
       src/app/[lang]/(site)/orcamento/admin/ProposalBuilder.tsx:780 (quantidade)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7886 (validade em dias)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:7964 (percentagem do sinal)
       src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:250 (nº de convidados)
       src/components/ads/PedidoRapido.tsx:298 (convidados)
     Observado: `type="number"` tem três problemas próprios, e nenhum é teórico.
       (1) Quando o que está escrito não é um número válido, `e.target.value` devolve **cadeia
       vazia** — não devolve o que lá está. Numa localidade portuguesa, escrever «1,5» ou
       tocar sem querer na vírgula do teclado numérico faz o estado saltar para `""`, e o que
       estava escrito desaparece do ecrã. Nos campos onde o `onChange` faz
       `Number.parseInt(e.target.value)` (ProposalStudio:7892, :7970) o resultado é `NaN` e o
       valor gravado passa a `undefined`.
       (2) No computador, a roda do rato por cima de um `type="number"` focado **altera o
       valor** sem ninguém pedir — a percentagem do sinal (`ProposalStudio.tsx:7964`) fica a
       um scroll de distância de mudar.
       (3) Os botõezinhos de ↑↓ ocupam largura à direita, no ecrã onde ela menos tem.
       A casa já usa a forma certa em dois sítios: `OrcamentoForm.tsx:1142` e
       `PainelInterno.tsx:118-120`, ambos `type="text" inputMode="numeric"`.
     Proposta: para inteiros — `type="text" inputMode="numeric" pattern="[0-9]*"` com um
       `onChange` que filtra (`.replace(/[^0-9]/g, "")`, como o formulário público faz na linha
       1154). Para valores com casas decimais — `type="text" inputMode="decimal"`, que é o que
       o resto do estúdio já faz. **Recomendo `text` + `inputMode` e não `number`**: dá o mesmo
       teclado no telemóvel, não come o que se escreve, não muda com a roda do rato, e deixa o
       `min`/`max` de mentira — que já não travava nada — ser substituído por uma frase, como o
       `AdminClient.tsx:4751-4754` já explica que é preciso.
     Equivalente em desktop: existe / o comportamento é diferente e também errado

[A4-007] [Agente 4] [Toda a casa] [Grave] A autocorreção do iOS está ligada em todos os campos de nome, local e e-mail — incluindo o formulário público
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: `autoCapitalize` existe em TRÊS sítios do repositório inteiro —
       src/app/[lang]/(site)/orcamento/admin/AdminLogin.tsx:520 e :704
       src/app/[lang]/(site)/orcamento/admin/SessaoExpirada.tsx:338
       `autoCorrect` nos mesmos três (:521, :705, :339). Mais nenhum campo, em lado nenhum.
       Os que doem mais:
       src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx:1262 (nome de contacto),
         :1340 e :1353 (os dois nomes do casal), :1223 (local / região)
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4804 (nome do cliente),
         :4776 (local do evento), :4766 (responsável)
       src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:173 (nome), :258 (local)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:5666 (clientes), :5699 (local)
       src/app/[lang]/(site)/orcamento/admin/Fornecedores.tsx:373, :404, :498, :533
     Observado: o iOS liga a autocorreção por omissão em qualquer campo de texto. Nomes
       próprios portugueses e nomes de quintas não estão no dicionário: «Malhadinha» é a
       primeira candidata a ser trocada, e a troca acontece ao confirmar com espaço — sem
       aviso e sem o dedo tocar em nada. Um nome de casal trocado sai na capa da proposta. Um
       local trocado sai nas Condições Gerais. Ela escreve isto de pé numa quinta, sem olhar
       duas vezes.
       A maiúscula automática é menos grave nos nomes (que querem maiúscula na mesma), mas
       nota-se no local escrito em minúsculas e é errada em qualquer campo de e-mail que não
       seja `type="email"` (ver A4-004).
     Proposta: três regras, aplicadas em lote —
       · nomes de pessoas e de espaços (`nome`, `noivo`, `noiva`, `local`, `responsável`,
         `clientes`, `nome do fornecedor`, `nome do tema`): `autoCorrect="off"`
         `spellCheck={false}` e `autoCapitalize="words"`;
       · e-mails: `type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
         spellCheck={false}` (o `type="email"` já desliga as duas no Safari, mas escrevê-las
         torna a regra legível e cobre os campos que não podem ser `type="email"`);
       · códigos, referências e frases de confirmação: `autoCorrect="off"`
         `autoCapitalize="none"` `spellCheck={false}` (ver A4-015).
       O sítio óptimo para as duas primeiras é o `ui/Field.tsx`: uma propriedade `natureza`
       (`"nome" | "email" | "codigo" | "texto"`) que despache o conjunto certo, para não haver
       250 sítios onde alguém se pode esquecer. As descrições e notas ficam como estão — aí a
       correcção ajuda.
     Equivalente em desktop: não existe (sem teclado de ecrã não há autocorreção)

[A4-008] [Agente 4] [Todo o back office] [Grave] Nenhum ecrã guarda rascunho local, e o Safari do iOS descarrega separadores em segundo plano
     Largura onde falha: todas — o efeito é do sistema, não da largura
     Onde: o que TEM rascunho local:
       src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx:343-379 (restauro) e :409-470
         (gravação adiada + descarga síncrona no `pagehide`) — em `sessionStorage`
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1589, :1835 (`DRAFT_KEY` em
         `localStorage`)
       src/app/[lang]/(site)/orcamento/admin/EmailTemplates.tsx:152-186 (rascunho do modelo)
       src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:63-202
         (fila de carregamento offline — este está muito bem feito)
       O que NÃO tem, e devia:
       src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx (11 campos em `useState`, o
         `EMPTY` de :19-31 é tudo o que lá há)
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4637-4911 (a gaveta do pedido;
         tem gravação automática no SERVIDOR via `useGravacaoAutomatica`, mas só para as notas
         — ver `AdminClient.tsx:1392` — e nenhuma cópia local)
       src/app/[lang]/(site)/orcamento/admin/EmailDoEnvio.tsx:344, :356 (assunto e texto do
         email de envio, o passo antes de a proposta seguir)
       src/app/[lang]/(site)/orcamento/admin/Fornecedores.tsx, Inventario.tsx, Material.tsx,
         Tarefas.tsx, EventCosts.tsx, GuestList.tsx (formulários de acrescentar)
     Observado: o Safari do iOS descarrega páginas em segundo plano quando precisa de memória,
       e volta a carregá-las do zero quando se regressa ao separador. Basta atender uma
       chamada, responder a uma mensagem, ou abrir o mapa para confirmar a morada da quinta —
       coisas que acontecem todas em cima umas das outras numa montagem. Ao voltar, o modal
       está fechado e os 11 campos vazios. Não há aviso nenhum: a página volta como se nunca
       tivesse sido aberta.
       O formulário público — o que é preenchido por estranhos — está protegido; os ecrãs em
       que ela trabalha não estão. É o contrário do que faz sentido.
     Proposta: o padrão já existe e está escrito com as razões todas no `OrcamentoForm.tsx`
       (adiar ~500 ms, espelhar num `ref` a cada render, descarregar de forma SÍNCRONA no
       `pagehide` — sem isto uma navegação rápida perde a escrita pendente). Extraí-lo para um
       `useRascunhoLocal(chave, valores)` e ligá-lo primeiro ao `NewQuoteModal` e ao
       `EmailDoEnvio`, que são os dois onde se perde mais de uma vez. `sessionStorage` e não
       `localStorage` nos que levam dados de cliente, pela mesma razão que lá está escrita
       (:348-351). Nada de segredos, chaves ou tokens — só o que a pessoa escreveu.
     Equivalente em desktop: existe / é raro (os separadores de portátil não são descarregados
       com a mesma facilidade)

[A4-009] [Agente 4] [Visão Geral] [Grave] A meta de receita do mês não aceita vírgula decimal, e o que se escreve desaparece
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/Overview.tsx:580-592
     Observado: `type="number"` num campo de euros (`aria-label="Meta de receita deste mês"`,
       `placeholder="Ex: 15000"`). Além de tudo o que o A4-006 diz, aqui há um agravante: é um
       valor em dinheiro num campo que rejeita a vírgula. E o `onKeyDown` de :587 tem outra vez
       o `Escape` como única desistência — mas neste há botão de «Guardar» ao lado (:593), o
       que já é mais do que o A4-001 tem.
     Proposta: `type="text" inputMode="decimal"`, com a mesma leitura tolerante que o
       `DefinicoesProposta.tsx:118-135` já faz (`comVirgula` / `lerNumero`) — esse ficheiro é o
       modelo de como se lê um número escrito por uma pessoa portuguesa.
     Equivalente em desktop: existe / não se nota

[A4-010] [Agente 4] [Estúdio · Enviar] [Grave] O campo do nome do modelo abre com `autoFocus` dentro de uma barra, e o teclado nasce por cima de tudo
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:5493-5510
     Observado: ao carregar em «Guardar como modelo» aparece uma barra com um campo
       `autoFocus` e `onKeyDown` para `Enter` (gravar) e `Escape` (cancelar). O `autoFocus`
       abre o teclado imediatamente, antes de o layout assentar, e a barra fica onde estava —
       que a 390 px é a meio da página. Outra vez: o `Escape` é a saída, e não há Escape.
       [por confirmar no ecrã] se o botão de confirmar ao lado do campo fica visível.
     Proposta: o mesmo `useSeguirOTeclado` do A4-003 no `onFocus` do campo, e um ✕ ao lado do
       ✓ para o cancelar existir sem teclado.
     Equivalente em desktop: existe

[A4-011] [Agente 4] [Gaveta do pedido] [Menor] Etiquetas: a única maneira de acrescentar é a tecla Enter, e o campo diz-lhe o nome
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/TagsField.tsx:111-124
     Observado: `placeholder="Adicionar etiqueta e Enter…"`. Não há botão de acrescentar
       nenhum — o `onKeyDown` de :115-120 é o mecanismo inteiro. Num telemóvel a tecla existe
       (a de «return» do teclado do iOS dispara `keydown` com `key === "Enter"`), portanto
       funciona; mas chama-se «return» e não «Enter», não tem o aspecto de um botão de
       confirmar, e uma pessoa que não saiba não descobre. O `list={...}` do datalist (:123)
       é outra coisa que no Safari do iOS tem apresentação própria — [por confirmar no ecrã].
     Proposta: um `+` de 44×44 ao lado do campo, que faça o que o `Enter` faz, e
       `enterKeyHint="done"` no campo para a tecla passar a dizer «Concluído» em vez de
       «return». O placeholder passa a «Adicionar etiqueta».
     Equivalente em desktop: existe

[A4-012] [Agente 4] [Nove ecrãs] [Menor] Os campos de procura não são `type="search"`, e levam com a autocorreção
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3673 (procurar pedidos)
       src/app/[lang]/(site)/orcamento/admin/Clientes.tsx:232
       src/app/[lang]/(site)/orcamento/admin/Inventario.tsx:377
       src/app/[lang]/(site)/orcamento/admin/Temas.tsx:973
       src/app/[lang]/(site)/orcamento/admin/Contratos.tsx:267
       src/app/[lang]/(site)/orcamento/admin/Fornecedores.tsx:337
       src/app/[lang]/(site)/orcamento/admin/Material.tsx:441
       src/app/[lang]/(site)/orcamento/admin/ThemeCopyDialog.tsx:285
       src/app/[lang]/(site)/orcamento/admin/ThemePicker.tsx:1948
       src/app/[lang]/(site)/orcamento/admin/CommandPalette.tsx:189
       (dois já estão certos: `BibliotecaServicos.tsx:89` e `FazerProposta.tsx:273`, ambos
       `type="search"`)
     Observado: sem `type="search"` não há o × de limpar dentro do campo (que num telemóvel
       poupa oito toques na tecla de apagar), a tecla de confirmação diz «return» em vez de
       «Procurar», e a autocorreção está ligada — procurar por «Malhadinha» ou por «Torre de
       Palma» é exactamente o caso em que ela troca a palavra.
     Proposta: `type="search" enterKeyHint="search" autoCorrect="off" autoCapitalize="none"
       spellCheck={false}` nos dez. O `.bo-input` continua a dar o aspecto (o `-webkit-appearance`
       do `search` já vem neutralizado pelo reset do Tailwind).
     Equivalente em desktop: existe / não se nota

[A4-013] [Agente 4] [Serviços do estúdio] [Menor] Os atalhos escondem-se por largura e não por dedo — o iPad e o telemóvel deitado voltam a vê-los
     Largura onde falha: 768 e acima, com toque (iPad em retrato, telemóvel deitado)
     Onde: src/app/[lang]/(site)/orcamento/admin/ServicesEditor.tsx:704 (`max-md:hidden`)
     Observado: este é o caso conhecido, e está **quase** resolvido: a linha «Enter abre a
       linha seguinte · Alt+↑/↓ move · Ctrl+Z anula» foi para dentro de um `<details>` e leva
       `max-md:hidden`, com o comentário certo (:677-688). Só que `max-md` é uma pergunta
       sobre LARGURA, e a pergunta certa é sobre o apontador — é a mesma lição que o
       `globals.css:610-624` já escreveu por causa do zoom de 16 px («A largura nunca foi a
       pergunta certa: o zoom depende de o aparelho ter um ecrã táctil, não de o ecrã ser
       estreito»). Num iPad em retrato (768 px) e num iPhone deitado o `<details>` volta a
       aparecer, com quatro teclas que ali não existem.
       O resto da casa já usa a pergunta certa: `ActivityLog.tsx:237`, `CommandPalette.tsx:207`,
       :314, :330, `AjudaGlossario.tsx:70`, :78, `AdminClient.tsx:3052`, :3430, todos com
       `pointer-coarse:hidden`.
     Proposta: trocar `max-md:hidden` por `pointer-coarse:hidden`. Uma classe.
     Equivalente em desktop: existe

[A4-014] [Agente 4] [Calendário · Kanban] [Menor] Instruções de teclado dentro de `aria-label` — o VoiceOver do iPhone lê teclas que ali não existem
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:615-616 («Enter para ver» /
       «Enter para adicionar»)
       src/app/[lang]/(site)/orcamento/admin/Kanban.tsx:101 («Enter para abrir; setas
       esquerda/direita para mover de coluna»)
     Observado: não se vê no ecrã — ouve-se. Quem usa o VoiceOver num iPhone recebe uma
       instrução para carregar em teclas que o aparelho não tem, e a instrução substitui a que
       serviria (no VoiceOver activa-se com toque duplo, e move-se com o rotor). Não bloqueia:
       o toque duplo funciona na mesma. Mas é a mesma classe de erro do resto desta secção,
       só que no canal de áudio.
     Proposta: tirar a parte das teclas do `aria-label` e deixar só o que o objecto É («12 de
       setembro, 2 eventos»). O `role`/`aria-pressed` já diz ao leitor de ecrã como se activa,
       em qualquer aparelho, e diz melhor.
     Equivalente em desktop: existe / é correcto lá

[A4-015] [Agente 4] [Repor cópia · Envio · Pagamentos] [Menor] Códigos e referências com autocorreção ligada
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/RestoreDialog.tsx:488-497 (a frase de
       confirmação; tem `autoComplete="off"` e `spellCheck={false}`, falta `autoCorrect="off"`
       e `autoCapitalize="none"`)
       src/app/[lang]/(site)/orcamento/admin/PaymentsPanel.tsx:439-450 (referência do
       contrato, «2026-001» — sem `inputMode` e sem nada desligado)
       src/app/[lang]/(site)/orcamento/admin/EmailDoEnvio.tsx:471-477 (nome do ficheiro do
       anexo — o iOS põe-lhe maiúscula inicial e corrige-o)
       src/app/[lang]/(site)/orcamento/admin/AdminLogin.tsx:590-604 e
       src/app/[lang]/(site)/orcamento/admin/SessaoExpirada.tsx:355 (o código de 2FA tem
       `inputMode="numeric"` e `autoComplete="one-time-code"`, que é o essencial, mas não tem
       `autoCorrect="off"`)
     Observado: `spellCheck={false}` **não desliga a autocorreção do iOS** — desliga o
       sublinhado vermelho. Quem substitui a palavra é o `autoCorrect`, e esse falta. No
       `RestoreDialog` isto é inofensivo por acaso (o servidor compara em maiúsculas —
       `api/backup/restore/route.ts:143`); no nome do ficheiro do anexo não é, porque o
       resultado vai anexado a um email para o cliente.
     Proposta: `autoCorrect="off" autoCapitalize="none" spellCheck={false}` nos quatro, e
       `autoCapitalize="none" autoCorrect="off"` na referência do contrato.
     Equivalente em desktop: existe / não se nota

[A4-016] [Agente 4] [Novo pedido · Inventário · Fornecedores · Material] [Menor] Formulários compridos demais para um ecrã de 390, sem passos e sem sítio onde parar
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:144-277 — 11 campos numa
       grelha que a 390 px é `grid-cols-1`, ou seja **onze linhas empilhadas** dentro de um
       modal de `max-h-[90dvh]`
       src/app/[lang]/(site)/orcamento/admin/Inventario.tsx:438-489 — 8
       src/app/[lang]/(site)/orcamento/admin/Material.tsx:376-428 — 7
       src/app/[lang]/(site)/orcamento/admin/MaterialRegras.tsx:166-236 — 7
       src/app/[lang]/(site)/orcamento/admin/Fornecedores.tsx:373-415 — 6
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4637-4911 — 12 na gaveta
     Observado: com o teclado aberto sobram ~400 px de altura útil num iPhone SE e ~580 num
       iPhone padrão. Um campo com rótulo mede ~70 px. Ou seja: vêem-se cinco ou seis campos
       de cada vez, no melhor caso, e o modal do «Novo pedido» tem onze mais um aviso de
       duplicado. Não parte nada — mas não há forma de saber quanto falta, não há como voltar
       atrás sem rolar, e se o separador for descarregado (A4-008) perdem-se os onze.
       O estúdio de propostas é a excepção que mostra o caminho: seis `<Section>` dobráveis
       com uma navegação própria (`NavEstudio.tsx`), e um estado de «feito ao abrir» por
       secção.
     Proposta: o «Novo pedido» é o candidato óbvio a dois passos — **Quem** (nome, e-mail,
       telefone, empresa, como nos conheceu) e **O quê** (categoria, tipo, data, convidados,
       local, notas). Só o nome é obrigatório (`NewQuoteModal.tsx:288`), portanto o primeiro
       passo já pode gravar e o segundo passa a ser opcional de verdade. Nos formulários de
       catálogo (Inventário, Material, Fornecedores) chega dobrar o bloco de baixo — as notas,
       a localização, a unidade — atrás de um «Mais detalhes», porque nenhum deles é
       obrigatório.
     Equivalente em desktop: existe / não se nota (a 1280 px são duas colunas e cabem)

[A4-017] [Agente 4] [Toda a casa] [Menor] `enterKeyHint` não aparece uma única vez em 264 campos
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: procura por `enterKeyHint` em `src/**/*.tsx` — zero ocorrências
     Observado: a tecla de confirmação do teclado do iOS diz sempre «return». O `enterKeyHint`
       muda-a para «Procurar», «Seguinte», «Concluído», «Enviar» — e nos campos que já usam o
       `Enter` como acção (são vinte e um, ver o A4-002) isso é a diferença entre uma tecla
       que se experimenta e uma tecla que se percebe.
     Proposta: `enterKeyHint="search"` nos campos de procura, `"done"` nos que gravam com
       Enter (TagsField, EventChecklist:374, EventCosts:375, EventTasks:194, EventTimeline:330
       e :340, GuestList:339/:348/:359, MaterialListas:236, ModelosParciais:259,
       ProductionPlan, Calendario:211, Contratos:147, BibliotecaRevisao:342, Overview:586,
       PaymentsPanel:445), `"send"` no envio do `ClientMessenger`. Anda a par do A4-002 — com
       um `<form>` a sério, o `"next"`/`"done"` até vem sozinho em vários casos.
     Equivalente em desktop: não existe

[A4-018] [Agente 4] [Gaveta do pedido · Novo pedido] [Menor] Contactos sem `autoComplete`: o preenchimento do iOS não ajuda, e o das notas ajuda a mais
     Largura onde falha: todas com `(pointer: coarse)`
     Onde: src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:173 (nome), :183 (e-mail),
       :191 (telefone) — nenhum tem `autoComplete`
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4813 e :4835 — têm
       `autoComplete="off"`, o que está certo
     Observado: são dois problemas ao contrário. No «Novo pedido», sem `autoComplete` o
       Safari adivinha: um campo chamado «Nome» a seguir a um chamado «E-mail» é um formulário
       de registo aos olhos dele, e o teclado oferece o cartão de contacto DELA. Ela está a
       registar o pedido de outra pessoa. Na gaveta do pedido o `autoComplete="off"` já está
       lá e resolve — a diferença entre os dois ficheiros não é intencional, é só o que cada
       um se lembrou de escrever.
     Proposta: `autoComplete="off"` nos três campos do `NewQuoteModal` (mais
       `data-1p-ignore` / `data-lpignore`, como o `OrcamentoForm.tsx:970-972` já faz para os
       gestores de palavras-passe). É o oposto do formulário público, onde o `autoComplete`
       deve estar ligado porque quem preenche é o dono dos dados.
     Equivalente em desktop: existe / é o mesmo problema com menos atrito

[A4-019] [Agente 4] [Formulário público] [Menor] O salto para o primeiro campo por preencher não tem margem para o teclado
     Largura onde falha: 390 / 430
     Onde: src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx:663
     Observado: ao submeter com campos em falta, faz-se
       `first.find(([ok]) => !ok)?.[1]?.focus()` — um `.focus()` seco, sem `scrollIntoView` e
       sem margem. O `.focus()` num telemóvel leva o campo à vista MAS encosta-o à aresta, e o
       teclado nasce logo a seguir: se o campo em falta for a mensagem (que é o último,
       `:1408`, com `min-h-[132px]`), o cursor fica na linha de baixo da caixa, já dentro do
       teclado. É o mesmo defeito que o `AdminLogin.tsx:826-847` descreve com números.
       [por confirmar no ecrã] qual dos campos é que fica pior — depende da altura da página
       nesse momento, que muda com os blocos condicionais do casamento.
     Proposta: `scrollIntoView({ block: "center" })` antes do `.focus({ preventScroll: true })`
       — que é exactamente o que o `ProposalStudio.tsx:4206-4210` já faz e explica. Ou, melhor,
       o `useSeguirOTeclado` do A4-003, que este `<form>` (`:949`) já está preparado para
       receber: tem `onFocusCapture={markStart}`, portanto o gancho está lá.
     Equivalente em desktop: existe / não se nota

[A4-020] [Agente 4] [Página pública da proposta] [Menor] Nada a assinalar — e isso é a nota
     Largura onde falha: nenhuma
     Onde: src/app/[lang]/(privado)/proposta/[token]/ (Documento.tsx, Escolhas.tsx,
       Inspiracao.tsx, page.tsx)
     Observado: **zero** `<input>`, `<textarea>` ou `<select>` na página que o casal recebe. As
       escolhas fazem-se em botões (`Escolhas.tsx:25` tem a razão escrita: «PORQUE É QUE ISTO
       NÃO É UM `<form>` COM UM BOTÃO DE CONFIRMAR»). Não há teclado a tapar nada porque não
       há teclado nenhum. É o ecrã da casa que melhor se comporta num telemóvel, e vale a pena
       dizê-lo por escrito — a decisão de não pôr campos foi deliberada e paga-se aqui.
     Proposta: nada a fazer. Fica como referência para quando alguém propuser acrescentar um
       campo de comentário.
     Equivalente em desktop: —

---

## O que já está certo, e não se deve mexer

Vale a pena registar, para ninguém «corrigir» por engano:

- **`globals.css:625-649`** — `@media (pointer: coarse) { input, textarea, select {
  font-size: 16px; min-height: 44px } }`, fora de camadas. É isto que impede o Safari de
  ampliar a página ao focar um campo e não voltar a desampliar. A pergunta é sobre o
  apontador e não sobre a largura, e o comentário explica porque é que a versão anterior
  (`max-width: 640px`) deixava o iPad de fora. **Consequência prática: nenhum dos 264 campos
  amplia ao ser tocado**, mesmo os que têm `text-xs` ou `text-[15px]` escrito à mão (o
  `CommandPalette.tsx:200`, por exemplo).
- **`ui/CampoData.tsx`** — `type="date"` nativo com a data por extenso por baixo e o aviso de
  dia da semana. É a decisão certa e o comentário diz porquê.
- **`OrcamentoForm.tsx:1142`** — `type="text" inputMode="numeric" pattern="[0-9]*"` com filtro
  no `onChange`. É o modelo para o A4-006.
- **`OrcamentoForm.tsx:343-470`** — o rascunho com descarga síncrona no `pagehide`. É o modelo
  para o A4-008.
- **`AdminLogin.tsx:876-979`** — `seguirOTeclado`. É o modelo para o A4-003, e a conta está
  separada do DOM para poder ser provada com números.
- **`ActivityLog.tsx:237`, `CommandPalette.tsx:207/:314/:330`, `AjudaGlossario.tsx:70/:78`,
  `AdminClient.tsx:3052/:3430/:3691`** — atalhos de teclado atrás de `pointer-coarse:hidden`.
  A regra está certa; falta aplicá-la ao `ServicesEditor` (A4-013).
- **`FolhaOuDialogo.tsx`** — diálogo no computador, folha arrastável no telemóvel, com o mesmo
  contrato de acessibilidade nos dois. A forma está certa; o que falta é a conta do teclado
  (A4-003).

---

## Inventário de campos

264 campos. `type` e `inputMode` são o que está escrito no código (`—` = não declarado, logo o
valor por omissão). A coluna da direita só está preenchida onde há alteração a fazer.

Legenda de abreviaturas: `aC` = `autoComplete`, `cap` = `autoCapitalize`, `cor` = `autoCorrect`,
`sp` = `spellCheck`.

### Formulário público de orçamento

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `OrcamentoForm.tsx:964` | honeypot (anti-bot) | `text` | — | aC:off | — está certo |
| `OrcamentoForm.tsx:1101` | data do evento | `date` | — | — | — está certo |
| `OrcamentoForm.tsx:1142` | nº de pessoas | `text` | `numeric` | — | — está certo (é o modelo) |
| `OrcamentoForm.tsx:1223` | local / região | `text` | — | aC:address-level2 | + `cor:off` `sp:false` `cap:words` **(A4-007)** |
| `OrcamentoForm.tsx:1262` | nome de contacto | `text` | — | aC:name | + `cor:off` `sp:false` `cap:words` **(A4-007)** |
| `OrcamentoForm.tsx:1292` | email | `email` | — | aC:email | + `inputMode:email` `cap:none` `cor:off` |
| `OrcamentoForm.tsx:1340` | nome de um dos noivos | `text` | — | aC:off | + `cor:off` `sp:false` `cap:words` **(A4-007)** |
| `OrcamentoForm.tsx:1353` | nome do outro noivo | `text` | — | aC:off | + `cor:off` `sp:false` `cap:words` **(A4-007)** |
| `OrcamentoForm.tsx:1377` | telefone | `tel` | `tel` | aC:tel | — está certo |
| `OrcamentoForm.tsx:1408` | mensagem (visão do dia) | textarea | — | — | + `enterKeyHint` não se aplica; fica como está |

### Entrada, sessão e recuperação

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `admin/AdminLogin.tsx:488` | email de entrada | `email` | — | aC:username webauthn / cap:none / cor:off / sp:false | + `inputMode:email` |
| `admin/AdminLogin.tsx:537` | palavra-passe | `password`/`text` | — | aC:current-password | — está certo |
| `admin/AdminLogin.tsx:590` | código 2FA | `text` | `numeric` | aC:one-time-code | + `cor:off` `cap:none` **(A4-015)** |
| `admin/AdminLogin.tsx:697` | email de recuperação | `email` | `email` | aC:username / cap:none / cor:off / sp:false | — está certo (é o modelo) |
| `admin/SessaoExpirada.tsx:331` | email | `email` | `email` | aC:username / cap:none / cor:off / sp:false | — está certo |
| `admin/SessaoExpirada.tsx:345` | palavra-passe | `password` | — | aC:current-password | — está certo |
| `admin/SessaoExpirada.tsx:355` | código 2FA | `text` | `numeric` | aC:one-time-code | + `cor:off` `cap:none` **(A4-015)** |
| `admin/recuperar/DefinirPalavraPasse.tsx:112` | palavra-passe nova | `password` | — | aC:new-password | — está certo |
| `admin/recuperar/DefinirPalavraPasse.tsx:124` | confirmação | `password` | — | aC:new-password | — está certo |
| `admin/PasskeysDialog.tsx:259` | nome do dispositivo | `text` | — | — | + `cor:off` |
| `admin/PasskeysDialog.tsx:294` | nome do dispositivo (novo) | `text` | — | — | + `cor:off` |

### Pedidos — lista, filtros e gaveta

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `admin/AdminClient.tsx:3673` | procurar pedidos | — | — | — | `search` + `enterKeyHint:search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/AdminClient.tsx:3758` | filtro de categoria | select | — | — | — |
| `admin/AdminClient.tsx:3771` | filtro de tempo de espera | select | — | — | — |
| `admin/AdminClient.tsx:3782` | filtro de mês | select | — | — | — |
| `admin/AdminClient.tsx:3797` | filtro de região | select | — | — | — |
| `admin/AdminClient.tsx:3812` | filtro de planner | select | — | — | — |
| `admin/AdminClient.tsx:3826` | ordenação | select | — | — | — |
| `admin/AdminClient.tsx:3980` | marcar seleccionados como | select | — | — | — |
| `admin/AdminClient.tsx:4640` | estado do pedido | select | — | — | — |
| `admin/AdminClient.tsx:4660` | preço final (sem IVA) € | `text` | `decimal` | — | — está certo |
| `admin/AdminClient.tsx:4712` | data do evento | `date` | — | — | — está certo |
| `admin/AdminClient.tsx:4737` | nº de convidados | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** |
| `admin/AdminClient.tsx:4766` | responsável | `text` | — | — | + `cap:words` `cor:off` **(A4-007)** |
| `admin/AdminClient.tsx:4776` | local do evento | — | — | — | + `cap:words` `cor:off` **(A4-007)** |
| `admin/AdminClient.tsx:4804` | nome do cliente | — | — | — | + `cap:words` `cor:off` **(A4-007)** |
| `admin/AdminClient.tsx:4813` | email do cliente | `email` | `email` | aC:off | + `cap:none` `cor:off` |
| `admin/AdminClient.tsx:4835` | telefone | `tel` | `tel` | aC:off | — está certo |
| `admin/AdminClient.tsx:4877` | motivo de perda | textarea | — | — | — |
| `admin/AdminClient.tsx:4901` | notas internas | textarea | — | — | — |
| `admin/TagsField.tsx:111` | etiquetas | — | — | — | + `enterKeyHint:done` + botão `+` **(A4-011)** |
| `admin/FollowUpField.tsx:62` | data de seguimento | `date` | — | — | — está certo |
| `admin/Acompanhamento.tsx:528` | voltar a falar em | `date` | — | — | — está certo |
| `admin/Acompanhamento.tsx:540` | para quê (nota) | `text` | — | — | — |
| `admin/Acompanhamento.tsx:602` | detalhe do motivo | `text` | — | — | — |
| `admin/PerguntaDeDesfecho.tsx:260` | detalhe opcional | `text` | — | — | — |
| `admin/PerguntaDeDesfecho.tsx:278` | valor fechado | `text` | `decimal` | — | — está certo |
| `admin/NewQuoteModal.tsx:173` | nome do cliente | — | — | — | + `aC:off` `cap:words` `cor:off` **(A4-018, A4-007)** |
| `admin/NewQuoteModal.tsx:183` | e-mail | `email` | — | — | + `inputMode:email` `aC:off` `cap:none` `cor:off` |
| `admin/NewQuoteModal.tsx:191` | telefone | `tel` | — | — | + `inputMode:tel` `aC:off` |
| `admin/NewQuoteModal.tsx:199` | empresa | — | — | — | + `cor:off` |
| `admin/NewQuoteModal.tsx:205` | como nos conheceu | — | — | — | — |
| `admin/NewQuoteModal.tsx:211` | categoria | select | — | — | — |
| `admin/NewQuoteModal.tsx:228` | tipo de evento | select | — | — | — |
| `admin/NewQuoteModal.tsx:243` | data do evento | `date` | — | — | — está certo |
| `admin/NewQuoteModal.tsx:250` | nº de convidados | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** |
| `admin/NewQuoteModal.tsx:258` | local | — | — | — | + `cap:words` `cor:off` **(A4-007)** |
| `admin/NewQuoteModal.tsx:266` | notas | textarea | — | — | — |
| `admin/ActivityLog.tsx:211` | registar chamada / nota | textarea | — | — | — |
| `admin/ClientMessenger.tsx:171` | mensagem ao cliente | textarea | — | — | + `enterKeyHint:send` |
| `admin/PainelInterno.tsx:118` | quilómetros até ao local | `text` | `numeric` | — | — está certo (é o modelo) |
| `admin/PainelInterno.tsx:387` | custo da linha (margem) | `text` | `decimal` | — | — está certo |

### Estúdio de propostas

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `admin/ProposalStudio.tsx:5497` | nome do modelo a guardar | — | — | — | + ✕ de cancelar **(A4-010)** |
| `admin/ProposalStudio.tsx:5666` | clientes (nomes) | — | — | — | + `cap:words` `cor:off` **(A4-007)** |
| `admin/ProposalStudio.tsx:5677` | tipo de evento | — | — | — | — |
| `admin/ProposalStudio.tsx:5688` | data (texto livre) | — | — | — | — |
| `admin/ProposalStudio.tsx:5699` | local | — | — | — | + `cap:words` `cor:off` **(A4-007)** |
| `admin/ProposalStudio.tsx:5711` | convidados | — | — | — | + `inputMode:numeric` |
| `admin/ProposalStudio.tsx:5731` | cerimónia | — | — | — | — |
| `admin/ProposalStudio.tsx:5742` | hora | — | — | — | — |
| `admin/ProposalStudio.tsx:5794` | título interno | — | — | — | — |
| `admin/ProposalStudio.tsx:5826` | frase de intenção | textarea | — | — | — |
| `admin/ProposalStudio.tsx:6219` | título do mood board | — | — | — | — |
| `admin/ProposalStudio.tsx:6254` | subtítulo do mood board | — | — | — | — |
| `admin/ProposalStudio.tsx:6943` | título da fase | — | — | — | — |
| `admin/ProposalStudio.tsx:6973` | tarefa da fase | — | — | — | — |
| `admin/ProposalStudio.tsx:7074` | item do orçamento | — | — | — | — |
| `admin/ProposalStudio.tsx:7095` | como escala a linha | select | — | — | — |
| `admin/ProposalStudio.tsx:7124` | **preço da linha** | — | `decimal` | — | — está certo |
| `admin/ProposalStudio.tsx:7212` | preço por mesa/convidado | — | `decimal` | — | — está certo |
| `admin/ProposalStudio.tsx:7340` | rótulo do total | — | — | — | — |
| `admin/ProposalStudio.tsx:7412` | como contam os adicionais | select | — | — | — |
| `admin/ProposalStudio.tsx:7485` | descrição da linha adicional | — | — | — | — |
| `admin/ProposalStudio.tsx:7526` | valor da linha adicional | — | `decimal` | — | — está certo |
| `admin/ProposalStudio.tsx:7535` | IVA da linha adicional | select | — | — | — |
| `admin/ProposalStudio.tsx:7590` | item do quadro estimado | — | — | — | — |
| `admin/ProposalStudio.tsx:7598` | **valor do quadro estimado** | — | **—** | — | **`inputMode:decimal` (A4-005)** |
| `admin/ProposalStudio.tsx:7622` | nota do orçamento | textarea | — | — | — |
| `admin/ProposalStudio.tsx:7734` | valor total (sem IVA) | — | `decimal` | — | — está certo |
| `admin/ProposalStudio.tsx:7886` | validade (dias) | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** — tem `onFocus` scrollIntoView, mantém-se |
| `admin/ProposalStudio.tsx:7964` | percentagem do sinal | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** |
| `admin/ProposalStudio.tsx:8187` | mensagem para o cliente | textarea | — | — | — |
| `admin/ProposalStudio.tsx:9073` | mover fotos para mood board | select | — | — | — |
| `admin/ProposalStudio.tsx:9788` | resumo para copiar à mão | textarea | — | — | — |
| `admin/ProposalBuilder.tsx:772` | descrição da linha | — | — | — | — |
| `admin/ProposalBuilder.tsx:780` | quantidade da linha | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** |
| `admin/ProposalBuilder.tsx:790` | preço unitário | `text` | `decimal` | — | — está certo |
| `admin/ProposalBuilder.tsx:842` | taxa de IVA | select | — | — | — |
| `admin/ProposalBuilder.tsx:864` | válida até | `date` | — | — | — está certo |
| `admin/ProposalBuilder.tsx:870` | notas (no PDF) | textarea | — | — | — |
| `admin/ServicesEditor.tsx:159` | nome do serviço (linha) | textarea | — | — | — |
| `admin/ServicesEditor.tsx:749` | marcador do grupo | — | — | — | — |
| `admin/EditorDeEscolhas.tsx:148/157` | título da alternativa PT / EN | — | — | — | — |
| `admin/EditorDeEscolhas.tsx:166/175` | nota da alternativa PT / EN | — | — | — | — |
| `admin/EditorDeEscolhas.tsx:221/230` | opção PT / EN | — | — | — | — |
| `admin/EditorDeEscolhas.tsx:239/248` | descrição da opção PT / EN | — | — | — | — |
| `admin/CaixaInglesa.tsx:188/191` | tradução (textarea / input) | — | — | — | — |
| `admin/NotasInternas.tsx:86` | nota interna | textarea | — | — | — |
| `admin/DefinicoesProposta.tsx:124` | valor por omissão (€/km) | `text` | `decimal` | — | — está certo (é o modelo de leitura) |
| `admin/DefinicoesProposta.tsx:200` | terra de partida | `text` | — | — | + `cap:words` `cor:off` |
| `admin/ModelosParciais.tsx:254` | nome do modelo parcial | — | — | — | — |
| `admin/CriarAPartirDe.tsx:250` | procurar propostas anteriores | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/FazerProposta.tsx:273` | procurar cliente | `search` | — | — | + `enterKeyHint:search` `cor:off` |
| `admin/BibliotecaServicos.tsx:89` | procurar na biblioteca | `search` | — | — | + `enterKeyHint:search` `cor:off` |

### Envio e modelos de email

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `admin/EmailDoEnvio.tsx:309` | modelo de email | select | — | — | — |
| `admin/EmailDoEnvio.tsx:344` | assunto | — | — | — | — (falta rascunho, A4-008) |
| `admin/EmailDoEnvio.tsx:356` | texto do email | textarea | — | — | — (falta rascunho, A4-008) |
| `admin/EmailDoEnvio.tsx:471` | nome do ficheiro do anexo | — | — | — | + `cap:none` `cor:off` `sp:false` **(A4-015)** |
| `admin/EmailTemplates.tsx:703` | assunto do modelo | — | — | — | — |
| `admin/EmailTemplates.tsx:773` | HTML do email | textarea | — | sp:false | + `cap:none` `cor:off` |
| `admin/EmailTemplatesBilingue.tsx:507` | assunto do modelo | — | — | — | — |
| `admin/EmailTemplatesBilingue.tsx:583` | HTML do email | textarea | — | sp:false | + `cap:none` `cor:off` |
| `admin/EmailTemplatesBilingue.tsx:644` | idioma | select | — | — | — |
| `admin/EmailTemplatesBilingue.tsx:689` | email de teste | `email` | — | — | + `inputMode:email` `cap:none` `cor:off` |
| `admin/RichEmailEditor.tsx:329` | texto do botão | — | — | — | — |
| `admin/RichEmailEditor.tsx:338` | destino do botão | — | — | — | + `inputMode:url` `cap:none` `cor:off` |
| `admin/RichEmailEditor.tsx:441` | URL da imagem | — | — | — | + `type:url` `inputMode:url` `cap:none` `cor:off` |

### Catálogos — Serviços, Inventário, Material, Fornecedores

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `admin/Servicos.tsx:278/289` | nome do serviço PT / EN | — | — | — | — |
| `admin/Servicos.tsx:299/310` | descrição PT / EN | textarea | — | — | — |
| `admin/Servicos.tsx:322` | categoria | — | — | — | — |
| `admin/Inventario.tsx:377` | procurar item | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/Inventario.tsx:385` | filtrar por estado | select | — | — | — |
| `admin/Inventario.tsx:438` | nome do item | — | — | — | — |
| `admin/Inventario.tsx:445` | categoria | select | — | — | — |
| `admin/Inventario.tsx:457` | quantidade | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** |
| `admin/Inventario.tsx:465` | unidade | — | — | — | — |
| `admin/Inventario.tsx:471` | estado | select | — | — | — |
| `admin/Inventario.tsx:483` | localização | — | — | — | + `cap:words` `cor:off` |
| `admin/Inventario.tsx:489` | notas | — | — | — | — |
| `admin/Inventario.tsx:603/731` | nome (linha editável) | — | — | — | + ✕ de cancelar **(A4-001)** |
| `admin/Inventario.tsx:610/740` | categoria (linha) | select | — | — | — |
| `admin/Inventario.tsx:623/754` | quantidade (linha) | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** |
| `admin/Inventario.tsx:631/764` | estado (linha) | select | — | — | — |
| `admin/Inventario.tsx:646/780` | localização (linha) | — | — | — | + `cap:words` `cor:off` |
| `admin/Material.tsx:376` | nome do material | — | — | — | — |
| `admin/Material.tsx:382/392` | categoria / tipo | select | — | — | — |
| `admin/Material.tsx:402` | unidade | — | — | — | — |
| `admin/Material.tsx:414/420` | stock / mínimo | — | `decimal` | — | — está certo |
| `admin/Material.tsx:428` | notas | — | — | — | — |
| `admin/Material.tsx:441` | procurar material | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/Material.tsx:448/459` | filtro de categoria / tipo | select | — | — | — |
| `admin/MaterialListas.tsx:231` | nome da lista nova | — | — | — | + `enterKeyHint:done` |
| `admin/MaterialListas.tsx:333` | quantidade do item | — | `decimal` | — | — está certo |
| `admin/MaterialListas.tsx:409` | acrescentar do catálogo | select | — | — | — |
| `admin/MaterialRegras.tsx:166` | nome da regra | — | — | — | — |
| `admin/MaterialRegras.tsx:172/193/203/218` | quando / então / lista / item | select | — | — | — |
| `admin/MaterialRegras.tsx:185` | nº de convidados **ou** palavras | — | `numeric`\|`text` | — | — está certo (alterna com o tipo) |
| `admin/MaterialRegras.tsx:231` | quantos | — | `decimal` | — | — está certo |
| `admin/Fornecedores.tsx:337` | procurar fornecedor | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/Fornecedores.tsx:373/498` | nome do fornecedor | — | — | — | + `cap:words` `cor:off` **(A4-007)** |
| `admin/Fornecedores.tsx:380/506` | categoria | select | — | — | — |
| `admin/Fornecedores.tsx:392/519` | **telefone** | **—** | **—** | **—** | **`tel` + `inputMode:tel` + `aC:off` (A4-004)** |
| `admin/Fornecedores.tsx:398/526` | **e-mail** | **—** | **—** | **—** | **`email` + `inputMode:email` + `cap:none` `cor:off` (A4-004)** |
| `admin/Fornecedores.tsx:404/533` | localização | — | — | — | + `cap:words` `cor:off` |
| `admin/Fornecedores.tsx:410/540` | notas | — | — | — | — |

### Evento — dossier, tarefas, custos, convidados, guião

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `admin/EventCosts.tsx:288/305` | orçado (€) / real (€) | `text` | `decimal` | — | — está certo |
| `admin/EventCosts.tsx:333/355` | fornecedor / categoria | select | — | — | — |
| `admin/EventCosts.tsx:348` | nome do fornecedor | — | — | — | + `cap:words` `cor:off` |
| `admin/EventCosts.tsx:368` | custo orçado (€) | `text` | `decimal` | — | — está certo |
| `admin/EventTasks.tsx:188` | título da tarefa | — | — | — | + `enterKeyHint:done` |
| `admin/EventTasks.tsx:200` | prioridade | select | — | — | — |
| `admin/EventTasks.tsx:212` | data limite | `date` | — | — | — está certo |
| `admin/EventChecklist.tsx:310` | editar item (em linha) | — | — | — | + ✕ de cancelar **(A4-001)** |
| `admin/EventChecklist.tsx:368` | novo item | — | — | — | + `enterKeyHint:done` |
| `admin/EventTimeline.tsx:206` | editar hora (em linha) | `time` | — | — | + ✕ de cancelar **(A4-001)** |
| `admin/EventTimeline.tsx:237` | editar momento (em linha) | — | — | — | + ✕ de cancelar **(A4-001)** |
| `admin/EventTimeline.tsx:257` | editar responsável (em linha) | — | — | — | + ✕ de cancelar **(A4-001)** + `cap:words` |
| `admin/EventTimeline.tsx:314` | hora (novo) | `time` | — | — | — está certo |
| `admin/EventTimeline.tsx:324` | momento (novo) | — | — | — | + `enterKeyHint:done` |
| `admin/EventTimeline.tsx:334` | responsável (novo) | — | — | — | + `cap:words` `cor:off` |
| `admin/GuestList.tsx:252` | convidados no grupo (linha) | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** |
| `admin/GuestList.tsx:263` | estado do RSVP | select | — | — | — |
| `admin/GuestList.tsx:334` | nome do grupo | — | — | — | + `cap:words` `cor:off` |
| `admin/GuestList.tsx:343` | nota | — | — | — | — |
| `admin/GuestList.tsx:352` | nº de convidados | `number` | — | — | `text` + `inputMode:numeric` **(A4-006)** |
| `admin/ProductionPlan.tsx:280` | fase | select | — | — | — |
| `admin/ProductionPlan.tsx:292` | nova tarefa de produção | — | — | — | + `enterKeyHint:done` |
| `admin/PaymentsPanel.tsx:439` | referência do contrato | — | — | — | + `cap:none` `cor:off` **(A4-015)** + ✕ **(A4-001)** |
| `admin/PaymentsPanel.tsx:620` | tipo de pagamento | select | — | — | — |
| `admin/PaymentsPanel.tsx:633` | valor em euros | `text` | `decimal` | — | — está certo |
| `admin/PaymentsPanel.tsx:648` | data do pagamento | `date` | — | — | — está certo |
| `admin/PaymentsPanel.tsx:655` | método ou nota | `text` | — | — | — |
| `admin/PaymentsPanel.tsx:788` | valor (edição em linha) | `text` | `decimal` | — | — está certo |
| `admin/Contratos.tsx:141` | como o aceite aconteceu | `text` | — | — | + `enterKeyHint:done` |
| `admin/Contratos.tsx:267` | procurar contratos | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |

### Restantes ecrãs

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `admin/Overview.tsx:580` | **meta de receita do mês** | **`number`** | **—** | — | **`text` + `inputMode:decimal` (A4-009)** |
| `admin/Overview.tsx:800` | notas da equipa | textarea | — | — | — |
| `admin/Tarefas.tsx:490` | título da tarefa (linha) | — | — | — | — |
| `admin/Tarefas.tsx:501/524` | área / prioridade | select | — | — | — |
| `admin/Tarefas.tsx:512` | prazo | `date` | — | — | — está certo |
| `admin/Tarefas.tsx:518` | responsável | — | — | — | + `cap:words` `cor:off` |
| `admin/Tarefas.tsx:583` | nova tarefa | — | — | — | + `enterKeyHint:done` |
| `admin/Tarefas.tsx:633` | responsável | — | — | — | + `cap:words` `cor:off` |
| `admin/Tarefas.tsx:641/649` | área / prioridade | select | — | — | — |
| `admin/Tarefas.tsx:659` | prazo | `date` | — | — | — está certo |
| `admin/Calendario.tsx:206` | título do evento | — | — | — | + `enterKeyHint:done` |
| `admin/Calendario.tsx:216` | hora | `time` | — | — | — está certo |
| `admin/Calendario.tsx:223` | nota | — | — | — | — |
| `admin/Clientes.tsx:232` | procurar cliente | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/CommandPalette.tsx:189` | pesquisar ou navegar | — | — | — | + `cap:none` `cor:off` (não `type=search`: é um `combobox`) |
| `admin/Temas.tsx:973` | procurar tema | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/Temas.tsx:1007` | filtro | select | — | — | — |
| `admin/Temas.tsx:1105` | nome do tema | — | — | — | + `cap:words` `cor:off` |
| `admin/Temas.tsx:1122` | nota | — | — | — | — |
| `admin/Temas.tsx:2835` | nome do tema (renomear) | — | — | — | + `cap:words` `cor:off` |
| `admin/ThemePicker.tsx:1948` | procurar tema | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/ThemeCopyDialog.tsx:285` | procurar tema de destino | — | — | — | `search` + `cap:none` `cor:off` **(A4-012)** |
| `admin/BibliotecaRevisao.tsx:334` | nome do tema a criar | — | — | — | + `enterKeyHint:done` |
| `admin/BibliotecaRevisao.tsx:463/484` | filtros | select | — | — | — |
| `admin/RestoreDialog.tsx:488` | frase de confirmação | — | — | aC:off / sp:false | + `cap:none` `cor:off` **(A4-015)** |
| `admin/ui/CampoData.tsx:92` | data (componente partilhado) | `date` | — | — | — está certo |
| `admin/ui/Field.tsx:162/164/166` | o controlo genérico | — | — | — | **sítio da propriedade `natureza` (A4-007)** |

### Formulários de campanha (Ads / Meta)

| ficheiro:linha | o que o campo é | type | inputMode | aC/cap/cor | o que devia ser |
|---|---|---|---|---|---|
| `components/ads/PedidoRapido.tsx:292` | data | `date` | — | — | — está certo |
| `components/ads/PedidoRapido.tsx:298` | convidados | `number` | `numeric` | — | `text` + `inputMode:numeric` **(A4-006)** |
| `components/ads/PedidoRapido.tsx:313` | local | `text` | — | aC:off | + `cap:words` `cor:off` **(A4-007)** |
| `components/ads/PedidoRapido.tsx:327` | nome | `text` | — | aC:name | + `cap:words` `cor:off` **(A4-007)** |
| `components/ads/PedidoRapido.tsx:341` | email | `email` | — | aC:email | + `inputMode:email` `cap:none` `cor:off` |
| `components/ads/PedidoRapido.tsx:357` | telefone | `tel` | `tel` | aC:tel | — está certo |
| `components/ads/PedidoRapido.tsx:376` | honeypot | `text` | — | aC:off | — está certo |
| `components/meta/PedidoRelampago.tsx:344` | data | `date` | — | — | — está certo |
| `components/meta/PedidoRelampago.tsx:350` | local | `text` | — | aC:off | + `cap:words` `cor:off` **(A4-007)** |
| `components/meta/PedidoRelampago.tsx:364` | nome | `text` | — | aC:name | + `cap:words` `cor:off` **(A4-007)** |
| `components/meta/PedidoRelampago.tsx:378` | contacto (email **ou** telefone) | `text` | `text` | — | — está certo (a razão está em :384) + `cap:none` `cor:off` |
| `components/meta/PedidoRelampago.tsx:434` | honeypot | `text` | — | aC:off | — está certo |

---

## Ordem de correção sugerida

Por razão de esforço para resultado, e porque umas destravam outras:

1. **A4-002** (embrulhar em `<form>`) — devolve a barra de navegação do teclado a toda a casa
   e é pré-requisito do A4-003, que procura o `button[type="submit"]` do formulário.
2. **A4-005** e **A4-009** — duas palavras cada, num campo de dinheiro cada.
3. **A4-004** — quatro campos, dois padrões já escritos na casa.
4. **A4-007** via `ui/Field.tsx` — uma propriedade `natureza`, e depois um lote de chamadas.
5. **A4-006** — onze campos, mesma troca em todos.
6. **A4-003** — extrair o `seguirOTeclado`. É a mais delicada e a que mais se nota.
7. **A4-001** — os ✕ nas edições em linha.
8. **A4-008** — o `useRascunhoLocal`, começando pelo `NewQuoteModal` e pelo `EmailDoEnvio`.
9. O resto (A4-010 a A4-020), que é acabamento.
