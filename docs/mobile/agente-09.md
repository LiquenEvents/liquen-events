# Agente 9 — Acessibilidade (mobile e VoiceOver do iOS)

Este relatório é lido de código, sem browser e sem VoiceOver a correr: onde digo «anuncia» ou
«não anuncia», estou a ler a marcação, não a ouvir o telemóvel. Onde há uma medição a sério, é
de outro agente e está citada.

A primeira coisa a dizer é que esta casa **já tem as peças certas construídas**, e boas. O
`useFocusTrap.ts` faz o que quase nenhum trap de React faz — marca os irmãos do diálogo com
`aria-hidden` **e** `inert`, que é a única metade que interessa ao VoiceOver — e está no lugar
em treze diálogos. O `ui/Field.tsx` desenha o próprio controlo e devolve `<label for>` +
`aria-describedby` + `aria-invalid` já ligados, e é usado 113 vezes. O `OrcamentoForm.tsx`, que
é o formulário que o público variado preenche, é o melhor ficheiro de acessibilidade do
repositório: rótulo flutuante ligado por `htmlFor`, `aria-invalid`, `aria-describedby`,
`role="alert"` em cada erro, e — o que quase ninguém faz — **o foco vai para o primeiro campo
inválido quando a submissão falha** (`OrcamentoForm.tsx:652-663`). O `alvo-toque` do
`globals.css` e o `MenuDeAccoes` já resolveram, com folgas medidas e escritas, o problema de
«apagar encostado a editar» no dedo. Não há um único `tabIndex` positivo em toda a base de
código, há `roving tabindex` a sério em oito sítios, e o único `aria-hidden` num elemento
focável é o honeypot do formulário — com `tabIndex={-1}`, como deve ser.

O que encontrei não é ignorância. É **fronteira**: as peças boas estão do lado público e do
lado dos diálogos que alguém se lembrou de converter; o back office de escrever ficou de fora,
e o VoiceOver do iOS ficou de fora de tudo. Três coisas explicam quase todas as entradas:

**Primeira — o gate de acessibilidade nunca olha para aqui.** O `e2e/a11y.spec.ts` corre o axe
com «zero violações estruturais» como condição de build, em nove rotas públicas
(`e2e/a11y.spec.ts:27-36`), em `Desktop Chrome` (`playwright.config.ts:56`). O `/orcamento` —
o formulário público — não está na lista. O back office inteiro não está na lista. E o passeio
que **está** a 375 px com toque (`e2e/admin-mobile.spec.ts:34`) não importa o axe. As duas
redes existem e nunca se cruzam: uma é estrutural mas de computador e pública, a outra é de
telemóvel mas geométrica. Tudo o que este relatório encontrou vive exactamente na casa vazia
entre as duas.

**Segunda — a armadilha de foco à mão prende o Tab e não prende o VoiceOver.** Há três
diálogos que reimplementam o ciclo de `Tab` em vez de chamar o `useFocusTrap`. O ciclo de Tab
está correcto nos três. Só que num iPhone ninguém carrega em Tab: varre-se com o dedo, e o
varrimento não passa pelo `keydown` — passa pela árvore de acessibilidade. O que tira o fundo
da árvore é o `aria-hidden`/`inert` que só o `useFocusTrap.ts:63-77` põe. Um trap de Tab, num
telemóvel, é decoração.

**Terceira — o placeholder como único nome, e o rótulo que nunca se apresentou ao campo.** O
padrão está descrito, por extenso e com a razão certa, no cabeçalho do `CaixaInglesa.tsx:20-25`
— «O placeholder desaparece quando se escreve, e é exactamente quando se escreve que é preciso
saber em que caixa se está». A casa sabe. O painel do pedido, que é o ecrã mais usado do back
office, tem dez rótulos por cima de dez campos e **nenhum** deles está ligado ao seu.

Nota de enquadramento, que muda as severidades: o Agente 10 dividiu isto em «back office de
escrever» e «back office de saber e marcar». Onde a entrada cai do lado de escrever
(RichEmailEditor, Serviços, Estúdio), marquei Menor mesmo quando a falha é a mesma — não
porque doa menos, mas porque não se faz de pé numa quinta. Onde cai do lado de saber e marcar
(Pedidos, Calendário, Tarefas, gaveta), a mesma falha é Grave.

---

[A9-001] [Agente 9] [Pedidos — painel do pedido] [Grave] Dez rótulos por cima de dez campos, e nenhum ligado ao seu
     Largura onde falha: todas (agrava a 390 / 430)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4639, 4657, 4711, 4765, 4775,
       4803, 4812, 4834, 4876, 4900
     Observado: são todos `<label className="bo-eyebrow block mb-1.5">Responsável</label>`
       seguidos de um `<input>` sem `id`, sem `aria-label` e sem `aria-labelledby`. Um `<label>`
       sem `htmlFor` que não embrulha o campo não é um rótulo: é um `<span>` a fingir. Quem
       varre o painel com VoiceOver ouve «campo de texto, Maria Silva» — o valor, nunca o nome
       — e a seguir «campo de texto, Évora», «campo de texto, +351 91…». Onde o campo ainda
       está vazio ouve-se o placeholder («Nome do membro da equipa…»), que desaparece à
       primeira letra escrita. A 390 px isto é o painel em modo folha modal, que é a única
       coisa no ecrã: não há a coluna à volta a dar contexto, como há no computador.
       Que não é desconhecimento está escrito no próprio ficheiro, duas vezes:
       · `AdminClient.tsx:4641-4643` — «O rótulo ao lado não está ligado ao campo (é um `label`
         sem `for`), e sem isto quem usa leitor de ecrã ouve só "combobox"» — e o `<select>`
         dessa linha levou `aria-label="Estado do pedido"`. Só esse.
       · `AdminClient.tsx:4729-4746` — o campo «Convidados», um `<div>` acima do «Responsável»,
         está completo: `htmlFor="campo-convidados"`, `id`, `aria-invalid`, `aria-describedby`.
       Um irmão foi corrigido, o outro não, dentro da mesma grelha.
     Proposta: dar `id` a cada campo e `htmlFor` ao rótulo que já lá está, ou — melhor, porque
       tira o problema da classe toda — trocar os dez blocos pelo `<Field>` de
       `admin/ui/Field.tsx`, que é o que o `Material.tsx:369-372` já faz e explica porquê. São
       dez substituições num ficheiro só.
     Equivalente em desktop: existe (a marcação é a mesma) — mas quem vê recupera pela
       proximidade visual do rótulo, e a 390 px o VoiceOver é o único leitor de ordem que há.

[A9-002] [Agente 9] [Gaveta de navegação] [Grave] A gaveta abre e o foco fica do lado de fora; o fundo continua na árvore
     Largura onde falha: 390 / 430 / 768 (tudo abaixo de `lg`, 1024)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:2869 (o `<aside>`), :3142-3147
       (o fundo escuro), :3217-3218 e :3297-3299 (os dois abridores)
     Observado: o `<aside>` que abre por cima do ecrã inteiro não tem `role="dialog"`, não tem
       `aria-modal`, não tem nome, e não chama o `useFocusTrap` — que está importado no mesmo
       ficheiro, linha 73, e usado 30 linhas abaixo para a folha do pedido. Consequências, por
       ordem de quanto custam:
       · ao abrir, o foco não entra: fica no botão «Mais destinos» da barra de baixo, atrás do
         fundo preto. Quem varre com VoiceOver a partir dali percorre a barra inferior, o
         rodapé e o conteúdo tapado antes de chegar aos vinte destinos que acabou de pedir;
       · nada do que está por baixo saiu da árvore de acessibilidade — o `inert` da linha 2870
         é para a gaveta FECHADA (e está bem, e tem a razão escrita), não para o fundo quando
         ela está aberta;
       · os dois abridores não dizem que abrem nada: sem `aria-expanded`, sem `aria-controls`.
         O mesmo ficheiro usa `aria-expanded` 29 vezes noutros sítios, incluindo na dobra
         «Mais» dentro desta mesma gaveta (:2938).
       O `Escape` fecha (:1631) e o scroll de fundo está travado (:1648) — falta a metade que
       o leitor de ecrã usa.
     Proposta: `role="dialog" aria-modal="true" aria-label="Destinos do back office"` no
       `<aside>` e `const gaveta = useFocusTrap<HTMLElement>(navEhGaveta && navOpen)` — a
       condição é exactamente a que o `inert` já calcula invertida, e o hook devolve o foco ao
       abridor no fim, de graça. `aria-expanded={navOpen}` + `aria-controls` nos dois botões.
     Equivalente em desktop: não existe — a partir de `lg` isto é uma coluna fixa, nunca é
       diálogo, e é por isso que o defeito só nasce no telemóvel e no tablet em retrato.

[A9-003] [Agente 9] [Calendário] [Grave] O diálogo de novo evento não prende o foco, não esconde o mês, e não o devolve
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:159-165 (o diálogo), :207
       (`autoFocus`), :927 (`onClose={() => setModalDate(null)}`)
     Observado: tem `role="dialog"`, `aria-modal="true"` e um `aria-label` bem escrito — e
       nenhum dos três faz o trabalho sozinho. Não há `useFocusTrap`: o `autoFocus` do campo
       «Título» leva o foco para dentro, mas a partir dali o varrimento sai para a grelha de 42
       células que está por baixo, tapada e a anunciar-se («3 de março — 2 eventos; Enter para
       ver»). E ao fechar, o foco não volta ao dia que a abriu — o componente desmonta e o foco
       cai no `<body>`, o que num iPhone põe o cursor do VoiceOver no topo da página. Para
       marcar dois eventos seguidos, percorre-se o mês inteiro outra vez.
       O `Escape` está tratado (:326). O trinco de scroll está tratado (:148). O foco não.
     Proposta: `const caixa = useFocusTrap<HTMLDivElement>(true)` no `AddEventModal` — que só
       existe montado, portanto `true` é a condição certa, tal como o `useTrincoDeScroll(true)`
       da linha ao lado. Resolve as três coisas de uma vez, incluindo o regresso ao dia.
     Equivalente em desktop: existe — mas com rato o clique fora fecha e o olho encontra o mês
       outra vez; com VoiceOver não há «olhar para o mês».

[A9-004] [Agente 9] [Temas · Inspiração do casal] [Grave] Armadilha de foco feita à mão: prende o Tab, não prende o dedo
     Largura onde falha: todas (o sintoma é do VoiceOver, não da largura)
     Onde: src/app/[lang]/(site)/orcamento/admin/PhotoLightbox.tsx:88-118 e :134-140;
       src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx:801-826 e :833-840
     Observado: os dois reimplementam o ciclo de `Tab` à mão — `querySelectorAll` dos focáveis,
       primeiro, último, `e.preventDefault()`. O ciclo está certo. O que falta é o que o
       `useFocusTrap.ts:63-77` faz e isto não: marcar os irmãos do diálogo com `aria-hidden` e
       `inert`. Num iPhone, o gesto de navegação é o varrimento, e o varrimento não gera
       `keydown`: percorre a árvore de acessibilidade. Com a lupa aberta por cima de tudo, o
       dedo continua a chegar à grelha de fotografias que está por baixo, invisível, e a activar
       botões que ninguém vê. É pior no `Inspiracao.tsx` porque essa é a página do casal — uma
       pessoa que nunca viu isto e não tem como saber onde está.
       O `PhotoLightbox` devolve o foco (quem o guarda é o `Temas.tsx:2771`) e o `Inspiracao`
       também (:295). É só a metade do fundo que falta nos dois.
     Proposta: trocar os dois blocos de `Tab` pelo `useFocusTrap` — o `LupaDeFotos.tsx:49`, que
       é a terceira lupa desta casa, já o faz, e o `PhotoLightbox` foi o modelo de que a
       `Inspiracao` copiou (está escrito no comentário :777). A `Inspiracao` está noutra árvore
       (`(privado)`) e teria de importar o hook de fora do `admin/` — ou passa-se o hook para
       `src/lib/`, que é onde o `useReducedMotion` já vive.
     Equivalente em desktop: não existe — com teclado o ciclo de Tab feito à mão resolve; é
       exactamente o leitor de ecrã de telemóvel que o atravessa.

[A9-005] [Agente 9] [Tarefas] [Grave] A linha em edição tem cinco campos e nenhum tem nome
     Largura onde falha: todas (agrava a 390)
     Onde: src/app/[lang]/(site)/orcamento/admin/Tarefas.tsx:490-491 (título, com `autoFocus`),
       :501 (prioridade), :512 (prazo), :518 (responsável), :524 (área)
     Observado: cinco controlos seguidos, zero `<label>`, zero `aria-label`. O `<select>` da
       prioridade anuncia-se «Alta, lista» — o valor e o tipo, nunca a pergunta. O `<input
       type="date">` do prazo anuncia-se como um seletor de data sem dizer de quê. O único que
       tem alguma pista é o responsável, e é um `placeholder="Responsável"` que se apaga à
       primeira letra. Isto está no lado «saber e marcar» do Agente 10: marcar uma tarefa é
       precisamente o que se faz de pé numa quinta.
       O `autoFocus` da linha 491 é o agravante em mobile: leva o foco para o título, o Safari
       abre o teclado, e o teclado come metade dos 844 px — os outros quatro campos ficam fora
       do ecrã, sem nada que diga que existem.
     Proposta: `aria-label` nos cinco («Título da tarefa», «Prioridade», «Prazo»,
       «Responsável», «Área»). É a solução mais barata e é a que o `EditorDeEscolhas.tsx:161`
       e o `CaixaInglesa.tsx:161` já usam para linhas apertadas — não gasta altura, que é o que
       falta aqui. Tirar o `autoFocus`, ou trocá-lo por um foco explícito depois de a linha
       estar montada e visível.
     Equivalente em desktop: existe a falta de rótulos; o `autoFocus` não incomoda ninguém com
       teclado físico.

[A9-006] [Agente 9] [Back office inteiro] [Grave] `<html lang="en">` por cima de um back office cem por cento em português
     Largura onde falha: todas (o sintoma é do VoiceOver)
     Onde: src/proxy.ts:141-145 (o reescrito por cookie); src/app/[lang]/layout.tsx:229-230;
       src/lib/i18n/config.ts:21
     Observado: o `<html lang>` sai de `htmlLang(locale)`, e o `locale` sai do segmento
       `/[lang]/`, que o proxy escolhe a partir do cookie `liquen-lang`. O cookie fica «en»
       assim que alguém abre uma URL `/en/…` numa navegação de documento (`proxy.ts:132-138`)
       — e ela abre: é assim que se confere a proposta que segue em inglês para um casal
       estrangeiro. A partir daí, `/orcamento/admin` é reescrito para `/en/orcamento/admin` e
       o back office inteiro — que não tem uma única frase em inglês — é servido dentro de
       `<html lang="en">`. Com o VoiceOver do iOS na configuração normal (uma voz só, a do
       sistema), «Pedidos», «Orçamento», «Fornecedores» e «Proposta enviada ao cliente» saem
       lidos com fonemas ingleses. Não é sotaque: é ininteligível ao ouvido.
       Tem saída — voltar a passar por uma página `/pt` ou trocar a voz no rotor — mas a saída
       exige saber que o problema é este, e nada no ecrã o diz.
     Proposta: o back office é monolingue por decisão (está escrito em `ProposalStudio.tsx:272`
       — «Em português mesmo quando o pedido veio em inglês»). Então diz-se: `lang="pt-PT"` no
       elemento de raiz do back office, no `admin/page.tsx` ou no `AdminClient`, que sobrepõe o
       `<html>` para a subárvore. Uma linha, e fecha a família toda de entradas de língua.
     Equivalente em desktop: existe — mas quem lê com os olhos não dá por nada.

[A9-007] [Agente 9] [Estúdio de propostas] [Grave] `role="alertdialog"` num aviso que não é diálogo nenhum
     Largura onde falha: todas (agrava a 390, onde o aviso e o botão que o levantou não cabem
       no mesmo ecrã)
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:5474-5491
     Observado: é uma faixa de aviso com duas escolhas («Cancelar», «Substituir»), declarada
       `role="alertdialog"` **e** `aria-live="assertive"` no mesmo elemento. Um `alertdialog` é,
       por definição, modal: promete a quem ouve que o foco está lá dentro e que nada mais
       responde até se responder. Aqui não há `aria-modal`, não há trap, e o foco fica onde
       estava — que pode ser um botão a 2000 px de distância, porque o aviso aparece de
       propósito no topo do estúdio e não ao pé do que o levantou (a razão está escrita nas
       linhas 5463-5470, e é boa). O `aria-live` por cima do `role` faz o anúncio duas vezes em
       alguns leitores.
       Num ecrã de 390 px o efeito prático é: ouve-se «diálogo — confirmar alteração ao valor»,
       o dedo procura os botões, e eles estão fora do ecrã, no topo de uma página que a pessoa
       não sabe que rolou.
     Proposta: `role="alert"` sozinho (tira o `aria-live`, que é redundante com `alert`), e
       levar o foco ao botão «Substituir» quando a faixa aparece — que é o que torna a promessa
       verdadeira sem transformar isto num modal.
     Equivalente em desktop: existe — mas com um ecrã largo a faixa está à vista e a promessa
       falsa não custa nada.

[A9-008] [Agente 9] [Definições de proposta · Pedidos · `ui/Field`] [Menor] O erro está ligado ao campo e nunca é anunciado
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/ui/Field.tsx:174-179;
       src/app/[lang]/(site)/orcamento/admin/DefinicoesProposta.tsx:153-156 e :213-216;
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4755-4762
     Observado: estes três estão bem montados — `aria-invalid` no campo, `aria-describedby` a
       apontar para o parágrafo do erro, o erro com um `id` estável. Falta-lhes uma coisa só:
       `role="alert"`. O `aria-describedby` é lido **quando o foco chega ao campo**; o erro
       aparece enquanto se escreve, com o foco já lá dentro, e nesse momento não há anúncio
       nenhum. Fica visível — a 390 px, a 10 px de altura (`text-[10px]`), por baixo de um
       campo que o teclado do telemóvel pode ter empurrado para fora do ecrã.
       O `ui/Field.tsx` é o caso que mais rende: 113 usos. (E é curioso — a propriedade `error`
       do `Field` está a ser usada **uma vez** em todo o back office, `EmailDoEnvio.tsx:368`.
       Os outros ecrãs desenham o erro à mão, que é o que produz a entrada seguinte.)
     Proposta: `role="alert"` no `<p>` do erro do `ui/Field.tsx:174` — uma palavra que arruma
       113 campos de uma vez — e o mesmo nos três sítios que desenham o erro à mão.
     Equivalente em desktop: existe, mas o erro está à vista ao lado do campo e o olho apanha-o.

[A9-009] [Agente 9] [Vários — Versões, Biblioteca, Cópia de tema, Calendário, Material] [Menor] Erros que só existem a olho
     Largura onde falha: todas (agrava a 390, onde o erro pode estar fora do ecrã)
     Onde: src/app/[lang]/(site)/orcamento/admin/Versoes.tsx:340;
       src/app/[lang]/(site)/orcamento/admin/BibliotecaServicos.tsx:103;
       src/app/[lang]/(site)/orcamento/admin/ThemeCopyDialog.tsx:413;
       src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:451;
       src/app/[lang]/(site)/orcamento/admin/Material.tsx:592
     Observado: cinco mensagens de falha renderizadas por `{erro && <p …>}` sem `role="alert"`,
       sem `aria-live`, sem `aria-invalid` no campo e sem `aria-describedby`. Aparecem e não se
       ouvem. Num ecrã de 390 px, três delas nascem abaixo da dobra: carrega-se no botão, não
       acontece nada perceptível, carrega-se outra vez.
       Para dimensionar: 26 `role="alert"` e 31 `aria-live` em toda a base de código, e o
       `Toast.tsx:97-105` faz isto exemplarmente (assertivo para erro, polido para o resto,
       com a razão escrita). Não é falta de padrão — é falta de o padrão ter passado por estes
       cinco ficheiros.
     Proposta: `role="alert"` nos cinco. É uma palavra por sítio.
     Equivalente em desktop: existe.

[A9-010] [Agente 9] [Back office] [Menor] Oito rolagens suaves que ignoram quem pediu menos movimento
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/NavEstudio.tsx:93;
       src/app/[lang]/(site)/orcamento/admin/AdminLogin.tsx:973;
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:4206, :4230, :6039, :6064;
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:4510-4512 e :4516-4518
     Observado: `scrollIntoView({ behavior: "smooth" })` escrito à mão. O `globals.css:485-489`
       trata do `scroll-behavior` do CSS sob movimento reduzido — mas um `behavior` explícito
       nas opções do JavaScript ganha ao CSS, sempre. Quem tem «Reduzir movimento» ligado no
       iOS (que é a definição que muita gente com enjoo de movimento tem sempre ligada)
       continua a ver a página a correr sozinha oito vezes.
       A casa sabe fazer isto: `ThemePicker.tsx:1566-1570` usa `movimentoReduzido() ? "auto" :
       "smooth"`, e `evento/[id]/DossierClient.tsx:142-143` faz o mesmo com um `matchMedia`
       próprio. São os dois únicos, contra oito que não perguntam.
     Proposta: existe um `prefersReducedMotion()` partilhado e testado em
       `src/lib/motion/useReducedMotion.ts` — usado por treze componentes do site público e por
       **zero** ficheiros do back office. Importá-lo nos oito sítios, e apagar o
       `movimentoReduzido()` privado do `ThemePicker.tsx:99-108` e o `matchMedia` solto do
       `DossierClient`, que são duas cópias da mesma pergunta.
     Equivalente em desktop: existe (é a mesma preferência, e existe em macOS) — mas o gesto de
       rolar num telemóvel é onde a rolagem imposta mais incomoda.

[A9-011] [Agente 9] [Avisos (toast)] [Menor] O aviso desliza sem porteiro, e o contador só pára com rato
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/Toast.tsx:163-172 (a entrada e as pausas), :23
       (`TOAST_DURATION = 4000`)
     Observado: duas coisas na mesma caixa.
       · A entrada é `transition-all duration-300` com `translate-y-3 → translate-y-0`: um
         deslocamento a sério, sem `motion-safe:` e sem media query. É o mesmo ficheiro cujo
         botão irmão (`ui/Button.tsx:108`) tem o cuidado de escrever `motion-safe:animate-spin`.
       · A pausa do contador de 4 s está pendurada em `onMouseEnter`/`onMouseLeave` e
         `onFocus`/`onBlur`. Num telemóvel não há hover, e o aviso não recebe foco — nasce
         fora da ordem de foco, no fundo do ecrã. Ou seja: a rede que existe para não apressar
         quem está a ler a mensagem **não existe em mobile**. Quatro segundos é curto para o
         VoiceOver acabar de ler uma frase de erro do tamanho das que esta casa escreve.
     Proposta: `motion-safe:transition-all` na entrada. E acrescentar `onTouchStart={pause}` —
       ou, mais simples e mais honesto, dar mais tempo aos avisos de erro (o
       `Toast.tsx:26-37` já discute quantos cabem no ecrã; falta a mesma conversa sobre quanto
       tempo lá ficam).
     Equivalente em desktop: a animação sim; a pausa que nunca dispara é só de mobile.

[A9-012] [Agente 9] [Confirmação do casal] [Menor] O texto de espera pulsa e não pára nunca
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/confirmacao/[id]/ConfirmacaoClient.tsx:236-241
     Observado: `animate-pulse` sem `motion-safe:` e sem media query, numa página pública — a
       primeira que o casal vê depois de carregar em «Enviar», quase sempre no telemóvel. O
       `role="status"` está lá e está bem; é só o movimento que não pergunta. Enquanto a
       resposta não chega, a frase pisca indefinidamente.
     Proposta: `motion-safe:animate-pulse`. É o que o `ui/Button.tsx:108` e o
       `GuardarTudo.tsx:125` já escrevem.
     Equivalente em desktop: existe.

[A9-013] [Agente 9] [Formulário público] [Menor] O único sítio onde o botão gira é o único sem porteiro
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx:1443-1448
     Observado: `animate-spin` a seco no roda-roda que aparece dentro do botão «Enviar»
       enquanto o pedido segue. É o formulário do público variado, é a acção mais importante da
       página, e é o único `animate-*` do ficheiro. As outras duas instâncias de `animate-spin`
       da base de código estão as duas com `motion-safe:` (`ui/Button.tsx:108`,
       `GuardarTudo.tsx:125`) — logo o padrão da casa é claro e este ficou de fora.
       O `aria-hidden` está bem posto e o `to.enviando` diz o estado por palavras, portanto
       quem ouve não perde nada; quem tem enjoo de movimento é que perde.
     Proposta: `motion-safe:animate-spin`.
     Equivalente em desktop: existe.

[A9-014] [Agente 9] [Editor de email] [Menor] Três rótulos e três campos que nunca se apresentaram
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/RichEmailEditor.tsx:328-333, :334-342, :439-451
     Observado: o mesmo defeito do [A9-001] em ponto pequeno — `<label className="bo-eyebrow
       block mb-1">Texto do botão</label>` seguido de um `<input>` sem `id`. Os três campos
       anunciam-se pelo placeholder («Ex.: Ver proposta», «{link}», «https://…») até se escrever
       neles, e a partir daí por nada. O painel do link e o painel do botão abrem em cima do
       editor: a 390 px o rótulo pode ter saído do ecrã.
       Nota do lado bom: o corpo do email tem `role="textbox" aria-label aria-multiline`
       (:365-368), que é a marcação certa para um `contentEditable`.
     Proposta: `htmlFor` + `id` nos três pares, ou `<Field>`.
     Equivalente em desktop: existe.
     [Lado «escrever» do Agente 10 — não se faz de pé numa quinta, e é por isso que é Menor.]

[A9-015] [Agente 9] [Caixas inglesas · Serviços] [Menor] O inglês lido com voz portuguesa
     Largura onde falha: todas (o sintoma é do VoiceOver)
     Onde: src/app/[lang]/(site)/orcamento/admin/CaixaInglesa.tsx:155-162;
       src/app/[lang]/(site)/orcamento/admin/Servicos.tsx:288 e :309
     Observado: o `CaixaInglesa` é dos componentes mais bem pensados do repositório neste
       capítulo — o cabeçalho (:20-25) diz exactamente porque é que o «EN» é rótulo e não
       placeholder, e o `aria-label` acrescenta «(inglês)» ao nome do campo «porque são duas
       caixas com o mesmo nome a meio centímetro uma da outra» (:159-161). Falta-lhe uma coisa
       só: `lang="en"` no controlo. Sem isso, o texto inglês que lá está dentro é lido com a
       voz portuguesa — e a tarefa desta caixa é precisamente reler o inglês para o conferir.
       O mesmo nos dois campos «(EN)» do `Servicos.tsx`.
     Proposta: `lang="en"` no objecto `comuns` do `CaixaInglesa.tsx:150-170` (arruma todas as
       caixas inglesas do estúdio de uma vez) e nos dois do `Servicos.tsx`. O
       `EmailTemplatesBilingue.tsx:209` já faz isto certo na pré-visualização — escreve
       `<html lang="${idioma}">` no `srcdoc` —, portanto o hábito existe, só não atravessou
       para os campos.
     Equivalente em desktop: existe.

[A9-016] [Agente 9] [Quadro (kanban)] [Menor] O cartão promete setas de teclado a quem tem dedo, e é um botão com botões lá dentro
     Largura onde falha: 390 / 430 / 768
     Onde: src/app/[lang]/(site)/orcamento/admin/Kanban.tsx:96-102 (o cartão), :215-260 (os
       botões ‹ ›)
     Observado: o cartão é um `<div role="button" tabIndex={0}>` com um `aria-label` que acaba
       em «Enter para abrir; setas esquerda/direita para mover de coluna» — instruções de
       teclado, anunciadas a alguém que num iPhone não tem teclas nenhumas. E os botões que
       realmente movem o cartão no dedo (‹ ›, `lg:hidden`, com o alvo e a folga já corrigidos e
       explicados nas linhas 194-214) estão **dentro** do elemento que se declara botão. Um
       `role="button"` com controlos aninhados é marcação inválida, e no VoiceOver do iOS o
       resultado é imprevisível: às vezes os ‹ › aparecem como itens próprios, às vezes ficam
       absorvidos no nome do cartão.
     Proposta: fazer o `aria-label` depender do apontador — ou, mais simples, tirar as
       instruções de teclado do nome e pô-las numa `aria-description`/`title` que não compete
       com o rótulo. E tirar os ‹ › de dentro do `role="button"`: passá-los para irmãos do
       cartão, dentro de um invólucro sem role, é o que arruma os dois problemas de uma vez.
     Equivalente em desktop: não existe — no computador os ‹ › estão escondidos (`lg:hidden`) e
       as setas do teclado são verdade.

[A9-017] [Agente 9] [Desfecho do pedido] [Menor] «Detalhe opcional» é um campo sem nome
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/PerguntaDeDesfecho.tsx:246-266
     Observado: o `<span>` «Motivo (opcional)» (:247-249) é a legenda de um grupo de botões, e
       o `<input>` do detalhe (:259-266) vem a seguir sem rótulo — só o placeholder «Detalhe
       opcional…». Quem varre ouve os botões de motivo e depois «campo de texto», sem saber que
       é o mesmo assunto. O irmão desta caixa, três linhas abaixo (:275-292), está certo — é um
       `<label>` a embrulhar. O mesmo ficheiro, os dois padrões.
     Proposta: `aria-label="Detalhe do motivo (opcional)"`, ou embrulhar como o vizinho já faz.
     Equivalente em desktop: existe.

[A9-018] [Agente 9] [Proposta do casal] [Menor] A escolha que não gravou é anunciada em voz baixa
     Largura onde falha: todas
     Onde: src/app/[lang]/(privado)/proposta/[token]/Escolhas.tsx:194-215
     Observado: a mesma região `aria-live="polite"` serve o «escolha guardada» e o «não foi
       possível guardar — tentar de novo». Um sucesso é polido; uma falha não. Com `polite`, o
       anúncio espera que o leitor termine o que está a dizer e pode ser engolido se a pessoa
       continuar a varrer — e o botão «tentar de novo» que está lá dentro nunca chega a ser
       oferecido. É a página do casal, no telemóvel deles, e o que se perde é a escolha.
       O resto do ficheiro está muito bem: `aria-pressed` em vez de rádios com a razão escrita
       (:161-164), e o `sr-only` que dá ao botão o nome do gesto inteiro (:183-187).
     Proposta: `aria-live={estado === "falhou" ? "assertive" : "polite"}` — que é exactamente a
       forma que o `ProposalBuilder.tsx:701` e o `GuardarTudo.tsx:188` já usam neste repositório.
     Equivalente em desktop: existe.

[A9-019] [Agente 9] [Rede de segurança] [Grave] O gate do axe não olha para o back office, nem para o formulário público, nem para um telemóvel
     Largura onde falha: todas (é a causa das outras)
     Onde: e2e/a11y.spec.ts:27-36 (a lista de rotas) e :38-54 (o gate);
       playwright.config.ts:56 (`devices["Desktop Chrome"]`); e2e/admin-mobile.spec.ts:34
     Observado: existe um gate de acessibilidade a sério — «zero violações estruturais», com o
       `color-contrast` isentado por decisão escrita — e ele corre em nove rotas públicas, num
       ecrã de computador. O `/orcamento` (o formulário que os casais preenchem) não está lá. O
       `/orcamento/admin` e os seus ~101 ficheiros não estão lá. A `proposta/[token]` não está
       lá. E o passeio que corre a 375 px com toque, o `admin-mobile.spec.ts`, não importa o
       `AxeBuilder`.
       O comentário do próprio `a11y.spec.ts:13-25` já conta esta história uma vez: o ramo de
       anúncios «ficava de fora desta lista … e foi ali que a auditoria encontrou um defeito
       genuíno que este ficheiro nunca tinha tido hipótese de apanhar». É a mesma lição, uma
       superfície adiante.
       De 19 entradas deste relatório, o axe apanharia sozinho pelo menos 8 — as de rótulo
       (`label`, `aria-input-field-name`, `form-field-multiple-labels`), a de `aria-modal` sem
       `role` e a de controlo aninhado em `role="button"`.
     Proposta: um segundo projecto no `playwright.config.ts` com o `devices["iPhone 13"]`, e um
       `a11y-admin.spec.ts` que faça login e passe o axe pelas oito vistas que o
       `admin-mobile.spec.ts` já sabe visitar, mais `/orcamento` e uma `proposta/[token]` de
       exemplo. Enquanto o gate não vir estas rotas, tudo o que este relatório propõe volta a
       entrar na semana seguinte.
     Equivalente em desktop: não se aplica — é a rede, não o ecrã.

---

## Padrões, não ocorrências

Cinco causas produzem 18 das 19 entradas. Corrigidas em lote, custam menos do que as entradas
uma a uma — e, mais importante, deixam de voltar.

**1 · O rótulo que nunca se apresentou ao campo — 20 ocorrências**
`<label>` sem `htmlFor` sobre um `<input>` sem `id`, ou placeholder como único nome. Contei 20
rótulos órfãos em 6 ficheiros — **10 deles num só**, o painel do pedido do `AdminClient.tsx`,
e 3 no `RichEmailEditor.tsx`. A correcção não é escrever 20 `aria-label`: é que já existe o
`ui/Field.tsx`, que desenha o controlo e devolve tudo ligado, e já é usado 113 vezes. Os 20
sítios são os que ficaram para trás. Vale a pena um teste de contrato ao lado do
`Field.contrato.test.ts` que já existe: «nenhum `<input>` do back office sem nome acessível».
→ A9-001, A9-005, A9-014, A9-017

**2 · Movimento sem porteiro — 51 ocorrências**
8 `scrollIntoView({behavior:"smooth"})` escritos à mão, 2 `animate-*` sem `motion-safe:`, 1
entrada de toast com `transition-all` + `translate-y`, e ~40 `transition-all`/`transition-
transform` a seco no `orcamento/`. A causa de fundo é haver **quatro** maneiras de fazer a
mesma pergunta nesta casa: `motion-safe:` (110 usos), `motion-reduce:` (31),
`useReducedMotion()`/`prefersReducedMotion()` de `src/lib/motion/` (13 componentes — todos
públicos, **nenhum** do back office), e um `movimentoReduzido()` privado no
`ThemePicker.tsx:99` com um só chamador. Escolher uma — o `prefersReducedMotion()` partilhado
para JavaScript, `motion-safe:` para classes — e apagar as outras duas.
→ A9-010, A9-011, A9-012, A9-013

**3 · A armadilha de foco feita à mão, e o diálogo que não é diálogo — 4 ocorrências**
`PhotoLightbox`, `Inspiracao` (ciclo de Tab à mão, fundo na árvore), `Calendario`
(`role="dialog"` sem trap nenhum, e sem devolver o foco), gaveta do `AdminClient` (sem role,
sem trap, sem `aria-expanded`). Contra 13 diálogos que chamam o `useFocusTrap` e ficam certos
de graça. O que separa os dois grupos não é qualidade de código — os traps à mão estão bem
escritos — é que só o hook põe `aria-hidden`/`inert` no fundo, e **é essa metade, e só essa,
que o VoiceOver do iPhone usa**. Mover o `useFocusTrap.ts` para `src/lib/` (para a
`proposta/[token]` o poder importar) e converter os quatro.
→ A9-002, A9-003, A9-004, e o `aria-modal` mal declarado do A9-007

**4 · O erro que se vê e não se ouve — 9 ocorrências**
5 mensagens sem `role`/`aria-live` nenhum, e 4 com `aria-describedby` correcto mas sem
`role="alert"` — que num campo já focado, que é o caso de quem está a escrever, não anuncia
nada. A correcção mais rentável é uma palavra num ficheiro: `role="alert"` no `<p>` do erro do
`ui/Field.tsx:174` arruma 113 campos. Os outros 8 são uma palavra cada.
→ A9-008, A9-009, A9-018

**5 · A rede que nunca passou por aqui — 1 ocorrência, e é a que segura as outras 4**
O gate do axe cobre 9 rotas públicas em ecrã de computador; o passeio de 375 px cobre o back
office e não corre o axe. Nenhuma das 18 entradas acima podia ter sido apanhada por
qualquer um dos dois. É a única entrada deste relatório que, corrigida, impede as outras de
regressar — e é por isso que, apesar de não ser um defeito de ecrã nenhum, devia ser a
primeira a fazer-se.
→ A9-019
