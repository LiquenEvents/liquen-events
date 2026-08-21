# Agente 7 — Desempenho em rede fraca

**Dezasseis achados: 1 Bloqueia, 8 Graves, 7 Menores.** A leitura de conjunto é
esta: **o back office já foi optimizado para rede lenta, com cuidado e com
medições — mas quase tudo o que trava a rede foi escrito para um browser que
não é o dela.** Os travões de «ligação lenta» e «poupar dados» estão em quatro
sítios do código e todos eles perguntam ao `navigator.connection`, que **não
existe no Safari**. O aquecimento de miniaturas em segundo plano — a cura da
lentidão dos Temas — desiste sozinho quando não há `requestIdleCallback`, e o
próprio `onIdle.ts` deste repositório escreve, na terceira linha, que o Safari
não o tem. Ou seja: no iPhone dela, o pré-aquecimento de fotos nunca correu, e
nada, em ligação nenhuma, limita o que o back office descarrega por
antecipação. Isto não desfaz o trabalho já feito — a fila de imagens, a cache
com ETag, o `content-visibility`, o paralelismo do seletor de temas são reais e
funcionam nos dois lados. Desfaz é a parte que era **condicional à rede**, e é
justamente essa que interessa numa quinta do Alentejo.

O segundo fio é a **cascata de abrir uma proposta**. Tocar num pedido → esperar
pelo pedido inteiro (sem um pixel a dizer que se está à espera, e sem tecto de
tempo) → o painel abre → tocar no separador do estúdio → descarregar **o maior
pedaço de código da aplicação**, que é o único que nunca é pré-aquecido, atrás
de um esqueleto que é uma barra cinzenta de 9 px → e só aí é que partem os
pedidos do rascunho, das fotos e das definições. São cinco níveis em série. A
400 ms de ida-e-volta são 2 segundos antes de haver o que quer que seja para
ver, e a 800 ms são 4 — e nenhum desses segundos tem uma frase a explicá-los.

O terceiro é o mais caro e é o que ela descreve: **trabalho perdido**. Aqui a
notícia é mista e vale a pena separar. O **Estúdio de Propostas está bem
defendido** — rascunho no `localStorage` a cada 800 ms, resgate automático na
reabertura, três tentativas com pausa, e a recusa explícita de escrever
«guardado» quando o servidor não confirmou. É trabalho a sério e não se deve
mexer nele. O **painel do pedido não tem nada disso**: só as notas gravam
sozinhas, tudo o resto (preço, data, convidados, local, nome, email, telefone,
estado) vive em memória até um clique em «Guardar» que não tem tecto de tempo
nem repetição, e o único travão é um `beforeunload` — que o iOS Safari não
honra quando o sistema deita fora o separador em segundo plano, que é o que
acontece a um telemóvel numa montagem. E **nada, em lado nenhum do back office,
volta a tentar quando a rede volta.** O modelo certo existe, está escrito, está
a funcionar — e está aplicado a um ecrã só, o do carregamento de material.

Ainda assim, e para ser justo: nada do que aqui está é regressão do que já foi
feito. A cache de módulo por tema, o pré-carregamento da página seguinte, o
`content-visibility`, a fila de concorrência das imagens pesadas e as
miniaturas aquecidas continuam todas no código e todas correctas — a fila e a
cache funcionam em qualquer browser. O que está partido no iPhone é **o
aquecimento das miniaturas** (A7-006) e **os travões de rede** (A7-005), e são
os dois a mesma causa: uma API que o Safari não implementa.

---

## O que se assume como «4G fraco»

Não há aqui browser nem servidor, portanto nada disto é medido ao vivo. Os
bytes vêm de sítios reais — a compilação que está em `.next` (de 13 de Agosto),
o `docs/desempenho.md`, e os números que o próprio código escreve nos
comentários — e os tempos são aritmética sobre dois perfis declarados:

| perfil | débito útil | ida-e-volta |
| --- | --- | --- |
| **4G fraco** | ~1,5 Mbit/s ≈ 190 KB/s | 300 ms |
| **4G a bater no fundo** | ~400 kbit/s ≈ 50 KB/s | 800 ms |

Cada nível de cascata custa uma ida-e-volta INTEIRA antes de o pedido seguinte
sair. É por isso que a contagem de cascatas conta mais do que a de bytes.

**Aviso de honestidade sobre os tamanhos de código:** a pasta `.next` desta
árvore é de 13 de Agosto e o `ProposalStudio.tsx` foi mexido a 21. Os KB de
chunk abaixo são **um piso, não um tecto** — o ficheiro cresceu desde a
compilação que medi.

---

[A7-001] [Agente 7] [Painel do pedido] [Bloqueia] Só as notas gravam sozinhas; o resto do pedido vive em memória e o botão «Guardar» não tem tecto nem repetição
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:2276
           src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:1392-1406
           src/app/[lang]/(site)/orcamento/admin/useGravacaoAutomatica.ts:221-228
           src/app/[lang]/(site)/orcamento/admin/registo-de-gravacoes.tsx:352-364
     Observado:
       A gravação automática do painel do pedido cobre exactamente dois campos:
       `adminNotes` e `lostReason` (`NotasAutomaticas`, AdminClient.tsx:1382-1389).
       Tudo o resto que se edita ali — preço, data, convidados, local, nome,
       email, telefone, estado, motivo de perda — só sai deste telemóvel quando
       ela carrega em «Guardar».
       E esse caminho é o MENOS resiliente dos dois que existem no mesmo
       ficheiro. A gravação automática usa `fetchComTecto` (10 s) e
       `enviarComRepeticao` (3 tentativas). O botão usa um `fetch` cru, sem
       `signal`, sem tecto e sem repetição (AdminClient.tsx:2276). Num 4G que
       aceita a ligação e não responde — o caso normal numa quinta, não o caso
       raro — esse `fetch` fica pendurado até o Safari desistir sozinho, o botão
       fica em «a guardar», e uma única falha devolve `{ ok: false }` e um toast.
       O trabalho fica onde estava: no estado do React, e em mais lado nenhum.
       O travão de saída é um `beforeunload` (useGravacaoAutomatica.ts:225 e
       registo-de-gravacoes.tsx:362). Em computador funciona. **No iPhone é
       quase decorativo**: o iOS Safari descarta separadores em segundo plano
       para libertar memória, e não corre o `beforeunload` quando o faz. Atender
       o telefone, ver uma mensagem, abrir o mapa — cada um desses gestos é uma
       oportunidade de o separador morrer calado com o preço da proposta lá
       dentro.
       O contraste está escrito pelo próprio hook, e sem rodeios
       (useGravacaoAutomatica.ts:74): «no estúdio o trabalho fica no
       `localStorage` daquele computador, **no painel do pedido não fica em lado
       nenhum**».
     Proposta:
       Três coisas, por esta ordem de valor:
       1. **Dar ao painel do pedido a cópia local que o estúdio já tem.** O
          `useGravacaoAutomatica` já recebe um `gravarLocalmente`
          (useGravacaoAutomatica.ts:257) — está lá, tipado, e o painel não o
          passa. Uma chave `liquen-pedido-<id>` com os campos editados e um
          carimbo de hora, e o mesmo resgate na reabertura que o estúdio faz
          (ProposalStudio.tsx:1865-1900). É a diferença entre «o 4G caiu» e «o
          4G caiu e perdi a tarde».
       2. **Alargar a gravação automática aos outros campos**, ou pelo menos aos
          de texto (local, nome, email, telefone). Os que são decisões — estado,
          motivo — podem continuar a exigir clique; os que são escrita não
          deviam.
       3. **Trocar o `fetch` da linha 2276 pelo `fetchComTecto` + `enviarComRepeticao`
          que estão duas centenas de linhas acima.** É o mesmo ficheiro e a
          mesma cadeia; falta só chamá-la.
       E, transversal: **`pagehide` e `visibilitychange` ao lado de cada
       `beforeunload`**. O `GaleriaClient.tsx:787-788` e o `OrcamentoForm.tsx:498-499`
       já o fazem, com o comentário certo escrito ao lado («o `visibilitychange`
       cobre o telemóvel que muda de app»). O back office não.
     Equivalente em desktop: existe — em computador o `beforeunload` pergunta,
       e a rede de casa não cai a meio de um PATCH. É um defeito que só se
       manifesta a sério no telemóvel dela.

[A7-002] [Agente 7] [Todos] [Grave] Os travões de «rede lenta» e «poupar dados» não fazem nada no Safari
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/lazy.tsx:252-258
           src/app/[lang]/(site)/orcamento/admin/theme-picker-cache.ts:255-260
           src/components/HeroWarm.tsx:70-73
           src/app/[lang]/(site)/galeria/GaleriaClient.tsx:229-235
     Observado:
       Quatro sítios do código decidem se vale a pena gastar rede em antecipação,
       e os quatro perguntam ao mesmo sítio:
       ```
       const conn = (navigator as … ).connection;
       if (!conn) return true;              // lazy.tsx:255
       if (conn.saveData) return false;
       return !/(^|-)2g$/.test(conn.effectiveType ?? "");
       ```
       A Network Information API (`navigator.connection`, `saveData`,
       `effectiveType`) **não está implementada no Safari** — nem no de macOS,
       nem no do iPhone. Logo `conn` é `undefined`, e a linha 255 devolve `true`:
       **no aparelho dela, o travão diz sempre «podes».** As outras três
       variantes fazem o mesmo com `conn?.saveData` — um encadeamento opcional
       sobre `undefined` dá `undefined`, que é falso, que é «não travar».
       A consequência concreta, no back office: assim que a página assenta,
       o `warmViewChunks` (lazy.tsx:283-317) começa a descarregar, uma a uma, as
       17 vistas do menu. O comentário do próprio ficheiro diz o valor: «Tudo
       junto são ~250 KB». Em 4G a bater no fundo são **cinco segundos de canal
       ocupado** com código que ela talvez não abra hoje, exactamente enquanto
       tenta abrir um pedido. E não é possível desligá-lo: o `Save-Data` do
       iPhone (o «Modo de Dados Reduzidos» do iOS) não chega cá.
     Proposta:
       Um só sítio a responder à pergunta «vale a pena gastar rede nisto?», e que
       saiba responder sem a API que o Safari não tem. Três sinais que existem
       no iPhone e que se podem combinar:
        · **medir**, em vez de perguntar. A primeira resposta da sessão já dá um
          número: `performance.getEntriesByType("resource")` sobre os chunks que
          já chegaram dá bytes ÷ duração. Abaixo de um limiar (digamos 150 KB/s),
          não se aquece nada.
        · o `navigator.onLine === false` corta tudo, e já é lido em dois ecrãs
          (ModoDeCarga.tsx:60, Carregamento.tsx:69);
        · e uma **preferência dela**, guardada no `localStorage`, ao lado do
          botão das notificações: «poupar dados neste telemóvel». É a única que
          nunca engana, e é a mais barata de escrever.
       O que NÃO fazer é deixar como está com um comentário a dizer que respeita
       o Save-Data. Um travão que não trava é pior do que não haver travão: dá a
       quem lê o código a certeza de que o problema está resolvido.
     Equivalente em desktop: existe — no Chrome de secretária os quatro travões
       funcionam como escrito. É precisamente o browser onde a rede nunca é o
       problema.

[A7-003] [Agente 7] [Temas · Seletor de temas] [Grave] O aquecimento das miniaturas — a cura da lentidão dos Temas — nunca corre no iPhone
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/theme-picker-cache.ts:261-263
           src/lib/onIdle.ts:1-3, 16-21
     Observado:
       O `aquecerFotosEmSegundoPlano()` é a peça que faz o seletor de temas abrir
       com as fotos já em disco. O comentário dele descreve os três travões, e o
       terceiro é este:
       ```
       const agendar = (window as …).requestIdleCallback;
       if (typeof agendar !== "function") return;
       ```
       «sem `requestIdleCallback` não se agenda nada — não vale a pena inventar
       um `setTimeout` que compete com o desenho da página». O raciocínio é bom.
       O problema é o veredicto do próprio repositório sobre onde é que essa API
       existe: `src/lib/onIdle.ts`, linha 2, diz literalmente «falling back to a
       short timeout **where requestIdleCallback isn't available (Safari)**».
       Se essa nota estiver certa — e é a única evidência que este repositório
       tem sobre o assunto —, então **o aquecimento de fotografias em segundo
       plano nunca correu, nem uma vez, no telemóvel para que foi feito**. Ele
       existe, está testado, e está desligado exactamente no aparelho onde a
       lentidão dos Temas é a queixa.
       Nota de honestidade: **não confirmei em que versão do Safari isto está.**
       O `requestIdleCallback` foi durante anos a única API de agendamento que o
       Safari não tinha, e ganhou suporte tarde. Ou o comentário do `onIdle.ts`
       está desactualizado — e então há uma linha errada a corrigir —, ou está
       certo — e então há uma funcionalidade inteira desligada. Não pode ser as
       duas coisas, e as duas dão trabalho a fazer.
       Há uma segunda dependência na mesma linha: o aquecimento pede as fotos com
       `fetch(url, { priority: "low" })` (theme-picker-cache.ts:287). A opção
       `priority` do `fetch` também não é universal; onde não é entendida, é
       ignorada em silêncio — o pedido sai à mesma, com prioridade normal, a
       disputar o canal com o que ela está a ver. Aqui a falha é benigna (bytes
       úteis na altura errada), mas é preciso saber que a garantia não existe.
     Proposta:
       Trocar a guarda por uma que degrade em vez de desistir: onde não há
       `requestIdleCallback`, usar o `onIdle` do repositório (que já tem a
       reserva de `setTimeout`) mas só DEPOIS do evento `load`, como o
       `warmViewChunks` faz (lazy.tsx:309-310). Assim não compete com o primeiro
       desenho — que era a preocupação certa — e passa a correr no aparelho dela.
       E, seja qual for a decisão, **acertar o comentário do `onIdle.ts`**: é ele
       que está a informar toda a gente que ler este código a seguir.
     Equivalente em desktop: existe — no Chrome o aquecimento corre e a coisa é
       rápida. É por isso que ninguém deu por ele estar desligado.

[A7-004] [Agente 7] [Pedidos — abrir um pedido] [Grave] O toque não dá sinal nenhum enquanto o pedido inteiro vem, e essa ida não tem tecto de tempo
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:1818-1845
           src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:1868-1881
     Observado:
       A lista vai em resumo (uma boa decisão, e recente: `page.tsx:20-33`), por
       isso abrir um pedido tem de ir buscar o resto — convidados, checklist,
       plano de produção, cronograma. O `openQuote` faz `setView("pedidos")` e
       depois **espera**:
       ```
       setView("pedidos");
       const q = await comPedidoInteiro(pedido);   // 1878
       if (!q) { toast("Não foi possível abrir o pedido…"); return; }
       setSelected(q);                              // 1882
       ```
       Entre a linha 1878 e a 1882 não acontece nada no ecrã. Não há esqueleto,
       não há `aria-busy`, não há o cartão a marcar-se como «a abrir». O painel
       aparece de uma vez, ou não aparece de todo. Num portátil isso são 100 ms e
       ninguém repara; em 4G a bater no fundo são **quase dois segundos de um
       toque que não fez nada** — e o gesto seguinte de qualquer pessoa é tocar
       outra vez.
       O `fetch` da linha 1821 não tem `signal` nem tecto. Se a rede aceita a
       ligação e nunca responde, isto fica pendurado até o browser desistir por
       sua conta — dezenas de segundos no Safari — e só aí é que sai a frase
       «Verifica a ligação». O `fetchComTecto` (10 s) está importado neste mesmo
       ficheiro e é usado 450 linhas acima, na linha 1364.
       A decisão de ESPERAR está certa e está bem justificada (o comentário de
       1798-1816 explica que abrir com o resumo apagava a lista de 150
       convidados). O que falta não é abrir mais cedo — é **dizer que se está a
       esperar**.
     Proposta:
       Duas linhas e uma:
        · marcar o pedido que está a abrir (`setAAbrir(pedido.id)`) e desenhar o
          painel com o esqueleto que já existe — `SkeletonList` /
          `PanelLoading` — enquanto o `await` corre. O cartão tocado ganha
          `aria-busy`, que é o que diz a quem não vê que o toque foi registado;
        · trocar o `fetch` da linha 1821 pelo `fetchComTecto` deste ficheiro, com
          o tecto do costume. Um toque que falha ao fim de 10 s com uma frase é
          melhor do que um toque que fica a pensar durante 40.
     Equivalente em desktop: existe, e é invisível — a mesma espera existe, só
       que dura 100 ms.

[A7-005] [Agente 7] [Estúdio de Propostas] [Grave] O maior pedaço de código da aplicação é o único que nunca é pré-aquecido, e o seu esqueleto é uma barra de 9 px
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/lazy.tsx:166-168
           src/app/[lang]/(site)/orcamento/admin/lazy.tsx:20-25
           src/app/[lang]/(site)/orcamento/admin/lazy.tsx:212-235
     Observado:
       O `lazy.tsx` divide o back office em duas famílias. As **vistas de topo**
       usam `splitView`, entram no `VIEW_WARMERS` e são descarregadas em janelas
       de inactividade — 17 delas. As **ferramentas do painel** são `dynamic()`
       simples e **não são aquecidas por ninguém**. O `ProposalStudio` está na
       segunda família.
       Medido na compilação que está em `.next` (13 de Agosto): o chunk que
       contém as cadeias do estúdio (`Só para ti`, `Pré-visualizar`, `guardado só
       neste computador`) é `1py8hc-5-iqpj.js`, **266.783 bytes em cru, 81.433
       comprimidos** — o maior ficheiro de toda a compilação, à frente do próprio
       react-dom (63.950 comprimidos). E é o único grande que sai à rede **no
       momento exacto do toque**, porque o aquecimento não lhe toca.
       81 KB são ~0,4 s em 4G fraco e **~1,6 s a bater no fundo**, mais a
       ida-e-volta. Durante esse tempo o que está no ecrã é o `PanelLoading`:
       ```
       <div className="border-t …">
         <div className="bo-skeleton h-2.5 w-40 mb-4" />
         <div className="bo-skeleton h-9 w-full" />
       </div>
       ```
       Uma sobrancelha e uma barra — para uma ferramenta que ocupa o ecrã
       inteiro. É o primo directo dos «cartões cinzentos» que ela já assinalou:
       não se distingue de «carregou e não veio nada».
       E o ficheiro cresceu: o `ProposalStudio.tsx` tem hoje 11.149 linhas e foi
       mexido depois desta compilação. Os 81 KB são o piso.
     Proposta:
        · **Pôr o `ProposalStudio` no aquecimento**, mas com uma condição que as
          vistas não têm: só depois de um pedido estar ABERTO. Aí já se sabe que
          o próximo gesto provável é uma proposta, e o chunk chega enquanto ela
          lê a ficha em vez de chegar quando ela toca. Uma linha no efeito do
          `openQuote`, e a mesma disciplina de janela ociosa.
        · **Um esqueleto à altura da coisa.** O `ViewSkeleton` existe, tem
          `role="status"`, tem o «A carregar…» para leitor de ecrã e tem a forma
          certa (Skeleton.tsx:70-102). O `ProposalStudio` merece esse e não o
          `PanelLoading` de duas barras.
     Equivalente em desktop: existe — o chunk é o mesmo. Em banda larga são
       80 ms e o esqueleto nem chega a ser visto, que é a razão de ninguém ter
       reparado que ele não diz nada.

[A7-006] [Agente 7] [Estúdio de Propostas] [Grave] As definições da proposta falham uma vez e ficam falhadas para a sessão inteira — com números de dinheiro por omissão, e em silêncio
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/definicoes-da-proposta.ts:38-53
     Observado:
       ```
       let promessa: Promise<DefinicoesDaProposta> | null = null;
       function ler() {
         promessa ??= fetch("/api/proposta-definicoes")
           .then(…)
           .catch(() => OMISSAO);      // 52
         return promessa;
       }
       ```
       O `??=` guarda a promessa **para sempre**, e o `.catch` transforma uma
       falha de rede numa resposta bem-sucedida com os valores por omissão. Junte
       as duas: se o pedido apanhar um túnel, um lapso de cobertura ou um 4G que
       desistiu — **um só, no primeiro segundo** —, o back office fica com
       `PARAMETROS_OMISSAO` e `MARGEM_MINIMA_OMISSAO` até ela recarregar a
       página. Não há repetição, não há revalidação, não há aviso.
       E o que estes valores decidem é dinheiro: os parâmetros de deslocação e a
       margem mínima abaixo da qual o estúdio avisa. Uma proposta montada com a
       margem por omissão em vez da que está configurada mostra o aviso na altura
       errada — ou não o mostra de todo. É a espécie de erro que não se vê no
       ecrã e se vê na conta bancária.
       Compare-se com o vizinho: o `useCachedList` (useCachedList.ts:85-93) trata
       uma falha como falha, guarda a mensagem do servidor, expõe `error` e dá um
       `refresh`. Aqui o mesmo problema tem a resposta oposta.
     Proposta:
       Não guardar a promessa que rejeitou — é a mesma correcção que o
       `splitView` já faz para os chunks, com a razão escrita por extenso
       (lazy.tsx:64-77: «um chunk que não chegou é um acidente; o que não pode é
       ser definitivo»). Em código: `.catch(e => { promessa = null; return OMISSAO; })`.
       E, se se quiser fechar a sério, distinguir «são os valores por omissão
       porque é isso que está configurado» de «são os valores por omissão porque
       não consegui perguntar» — a segunda merece uma linha ao lado do aviso de
       margem, como o `AvisoDeFalha` já faz noutros ecrãs.
     Equivalente em desktop: existe — mas em desktop este pedido praticamente
       nunca falha, portanto o caminho de falha nunca foi percorrido.

[A7-007] [Agente 7] [Todos] [Grave] Nada volta a tentar quando a rede volta — e o modelo certo já existe, aplicado a um ecrã só
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:135-205
           src/app/[lang]/(site)/orcamento/admin/useGravacaoAutomatica.ts:177-215
     Observado:
       Percorrida a árvore inteira à procura de `addEventListener("online"…)`:
       quatro resultados, e **nenhum é uma gravação**. São `SafeImage.tsx:288`,
       `GalleryImage.tsx:232`, `useFotoComPlanoB.ts:126` — três fotografias que
       voltam a tentar — e `ModoDeCarga.tsx:62`, que só o lê para escrever «sem
       rede» no ecrã.
       Ou seja: **nenhuma escrita do back office sabe que a rede voltou.** O
       `enviarComRepeticao` tenta três vezes com pausas de 400 ms a crescer, o
       que dá cerca de dois segundos. Cobre um soluço; não cobre estar cinco
       minutos sem cobertura, que é o caso dela. Passados esses dois segundos o
       estúdio diz a verdade («guardado só neste computador») e fica à espera de
       uma tecla que talvez não venha.
       O modelo certo está escrito, está a funcionar, e está a **um ecrã**: o
       `Carregamento.tsx` tem fila em `localStorage` (`lerFila`/`escreverFila`),
       ouve `online`/`offline`, sincroniza quando volta (linha 205:
       `if (navigator.onLine) void sincronizar()`), e junta o que está pendente
       ao que chega do servidor. É exactamente a peça que falta em todo o resto.
     Proposta:
       Levar essa fila do `Carregamento.tsx` para um módulo do back office e
       ligá-la a dois sítios, por esta ordem:
       1. **ao `enviarComRepeticao`**: esgotadas as três tentativas, em vez de
          desistir, pôr o envio na fila e voltar a tentar no `online`. O
          indicador ganha um quarto estado — «à espera de rede» — que é
          diferente de «não chegou ao servidor» e diz-lhe que não tem de fazer
          nada;
       2. **ao painel do pedido** (A7-001), que é o que hoje não tem rede de
          segurança nenhuma.
       Nota de desenho, e é a razão de isto não ser trivial: a fila tem de ser
       por CAMPO e não por pedido, ou uma gravação em fila carimbada às 14:32
       escreve por cima de uma edição das 14:40. O `useCachedList` já tem esta
       exacta disciplina resolvida com o contador `escritas`
       (useCachedList.ts:41-54, 101) — a regra pode vir de lá.
     Equivalente em desktop: existe — em desktop a rede não volta porque nunca se
       foi embora. É o achado mais «só de telemóvel» de todos.

[A7-008] [Agente 7] [Propostas] [Grave] A lista de Propostas descarrega os documentos inteiros para desenhar uma tabela — e descarrega-os DUAS vezes
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/Propostas.tsx:178
           src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:1469
           src/app/api/propostas/route.ts:52-89
     Observado:
       A rota `/api/propostas` tem três formas: completa, `?resumo=1` e
       `?semDoc=1`. A forma leve foi feita **precisamente para isto**, e o
       comentário da rota di-lo (route.ts:53-61): «É o que os painéis de
       Propostas, Acompanhamento e Análise desenham: nenhum deles imprime o
       documento, e o documento é quase tudo o que se descarrega».
       O Acompanhamento e a Análise já passaram para lá. **A vista Propostas
       não** — continua em `useCachedList("propostas", "/api/propostas")`. Medido
       no `desempenho.md` com 194 propostas: **156,1 KB**. Em 4G a bater no fundo
       são mais de três segundos, e cresce com cada proposta que ela faz.
       Há um segundo custo, mais irritante: o aquecimento ocioso do AdminClient
       pede `?semDoc=1` com a chave `"propostas-leves"` (linha 1469), e a vista
       pede a forma completa com a chave `"propostas"`. São **duas chaves de
       cache, dois pedidos, dois corpos** — o leve descarregado logo à chegada e
       nunca usado por este ecrã, e o pesado descarregado ao clique. O comentário
       da linha 1471-1477 admite o desencontro e explica porquê.
       A razão de não ter mudado está escrita e é honesta (Propostas.tsx:86-98):
       a coluna «Rubricas» lê `doc.budgetItems.length`, e a forma leve não traz
       nenhum facto derivado equivalente.
     Proposta:
       O bloqueio é um número. A forma leve já carrega três factos derivados do
       documento (`temDoc`, `temOpcionais`, `pctSinal`, route.ts:63-80) —
       acrescentar um quarto, `nRubricas`, é a mesma linha de código e resolve a
       única objecção. A partir daí a vista passa à chave `"propostas-leves"`,
       colhe o aquecimento que já foi pago, e a lista deixa de descarregar
       megabytes de mood boards para desenhar nomes e valores.
     Equivalente em desktop: existe — e em desktop 156 KB são 0,2 s, que é a
       razão de este custo nunca ter doído a ninguém.

[A7-009] [Agente 7] [Temas] [Grave] A vista Temas pede a lista por fora da cache com ETag que existe exactamente para ela
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/Temas.tsx:757
           src/app/[lang]/(site)/orcamento/admin/theme-picker-cache.ts:97-133
           src/app/api/temas/route.ts:417-441
     Observado:
       A rota `/api/temas` tem uma resposta condicional feita com cuidado
       invulgar: como cada capa vem num URL assinado que muda a cada assinatura,
       um ETag tirado do corpo nunca daria 304 nenhum — por isso o validador é
       calculado sobre o corpo **sem a parte assinada** (route.ts:433-441). É a
       peça que faz reabrir a biblioteca custar uma viagem sem corpo em vez da
       lista inteira.
       Quem a usa é o `buscarTemas()` do `theme-picker-cache.ts`, que guarda o
       ETag e o reenvia em `If-None-Match` (linha 106-111). **A vista Temas não
       a usa.** Faz o seu próprio `fetch("/api/temas", { cache: "no-store" })`,
       sem cabeçalho condicional, e portanto recebe sempre o corpo completo. O
       `Temas.tsx` até importa deste módulo — mas só o `esquecerBiblioteca`
       (linha 23).
       O custo repete-se por gesto: abrir Temas (corpo completo) → abrir o
       estúdio e o seletor (corpo completo outra vez, agora pelo `buscarTemas`)
       → voltar a Temas (corpo completo pela terceira vez). Cada corpo leva
       **oito URLs assinados por tema** — capa, plano B da capa, três tiras e os
       três planos B (route.ts:405-411) —, e um URL assinado do Supabase são
       várias centenas de caracteres de JWT, que comprime mal. Com quinze temas
       são umas dezenas de KB por viagem, sempre iguais.
     Proposta:
       Trocar o corpo do efeito da linha 755-781 por `await buscarTemas()`. É a
       mesma resposta, com ETag, com dedupe de pedidos simultâneos e com cache
       de módulo — e passa a partilhar a cache com o seletor, o que resolve o
       segundo e o terceiro pedidos de uma vez. O tratamento de recusas que está
       lá (`blocked`, `tituloDaRecusa`) é bom e deve ficar; só precisa de receber
       o erro do `buscarTemas` em vez do `res` cru.
     Equivalente em desktop: existe.

[A7-010] [Agente 7] [Todos] [Grave] O back office nunca diz «estás sem rede»
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/ModoDeCarga.tsx:57-70
           src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:168-175
           src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3390-3480
     Observado:
       Dois ecrãs sabem responder a «há rede?»: o Modo de Carga e o Carregamento
       de material. São os dois que foram desenhados para a quinta, e ambos o
       fazem bem — o `useSemRede` do `ModoDeCarga.tsx:57-70` é seis linhas.
       O resto do back office não tem essa noção. Sem rede, cada ecrã falha à sua
       maneira e cada um conta uma história diferente sobre a mesma causa: a
       vista Material diz «Não foi possível ler o material», o Calendário desenha
       um mês vazio (A7-011), o estúdio diz «guardado só neste computador», o
       painel do pedido diz «Não foi possível guardar as alterações», e o
       aquecimento de vistas falha calado. Nenhuma delas diz a coisa que
       explicaria as cinco de uma vez, e que é a única que ela pode confirmar
       olhando para a barra de estado do iPhone.
       Isto importa mais do que parece porque muda o que ela faz a seguir. «Não
       foi possível guardar» convida a carregar outra vez — que numa quinta sem
       cobertura é gastar bateria a repetir um gesto que vai voltar a falhar.
       «Sem rede — o que estiver por gravar segue mal ela volte» diz-lhe para
       continuar a trabalhar.
     Proposta:
       Uma faixa no topo do `AdminClient`, ao lado de onde já vive o
       `AvisoDeArmazenamento` (linha 3470), a ler o mesmo `navigator.onLine` +
       `online`/`offline` que o `ModoDeCarga` lê. Aparece só quando está mesmo
       offline — como o `AvisoDeArmazenamento`, que «só desenha alguma coisa
       quando o servidor diz `avisar`», pela mesma razão escrita lá
       (AvisoDeArmazenamento.tsx:17-23: um aviso que aparece quando está tudo bem
       é um aviso que se deixa de ler).
       Ressalva honesta: o `navigator.onLine` diz «tenho interface de rede», não
       «chego ao servidor». Um 4G de uma barra que aceita a ligação e não
       responde dá `true`. Cobre o caso de estar mesmo sem cobertura, que é
       frequente; não cobre o caso do 4G moribundo. Para esse, o sinal que vale é
       o número de gravações em fila do A7-007.
     Equivalente em desktop: não existe, e não faz falta.

[A7-011] [Agente 7] [Calendário] [Menor] Enquanto os eventos vêm a caminho, o Calendário escreve «Sem eventos este mês»
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:255-260
           src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:485-489
     Observado:
       O Calendário é a única vista de lista do back office que **não lê o
       `loading`** do `useCachedList`:
       ```
       const { data: events = [], setData: setEvents,
               error: erroDeLeitura, errorMessage: mensagemDeErro,
               refresh: recarregar } = useCachedList<CalendarEvent[]>(…);
       ```
       Falta `loading`. As outras seis — Propostas:175, Tarefas:284, Contratos:168,
       Fornecedores:112, Inventário:141, Acompanhamento:136 — leem-no todas e
       desenham `SkeletonList`. Aqui, enquanto o pedido está no ar, `events` é
       `[]`, o `monthTotal` dá zero e a eyebrow do mês escreve, com todas as
       letras, **«Sem eventos este mês»** (linha 487). Mais abaixo abre o estado
       vazio «Sem eventos agendados» (linha 912).
       Em 4G a bater no fundo são um a dois segundos em que o ecrã afirma uma
       coisa falsa sobre a agenda dela — e afirma-a com a mesma confiança com que
       diria a verdade. As marcações do calendário desaparecem; as datas de
       eventos, essas, aparecem, porque vêm nos `quotes` do servidor. Ou seja: o
       mês fica meio certo, que é a pior das três hipóteses.
     Proposta:
       Passar a ler `loading` e usá-lo em dois sítios: a eyebrow escreve «a
       ler…» em vez do total, e a grelha desenha as células com `bo-skeleton` em
       vez de vazias. O `AvisoDeFalha` já lá está para o caso da falha — o que
       falta é só distinguir «ainda não sei» de «não há».
     Equivalente em desktop: existe, e dura 30 ms.

[A7-012] [Agente 7] [Visão Geral] [Menor] O primeiro ecrã que ela vê diz «Nada agendado» antes de saber
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/Agenda.tsx:69-70, 195-198
           src/app/[lang]/(site)/orcamento/admin/Reminders.tsx:32
     Observado:
       O mesmo defeito do A7-011, no ecrã de chegada. Os dois painéis da Visão
       Geral destroem só o `data`:
       ```
       const { data: calEvents = [] } = useCachedList<CalendarEvent[]>("calendario", …);
       const { data: tasks = [] }      = useCachedList<Task[]>("tarefas", …);
       ```
       Enquanto as listas vêm, a Agenda desenha o `EmptyState` com «Nada agendado
       para os próximos N dias» e os Lembretes desenham a coluna curta (só o que
       se deriva dos `quotes`, que já cá estão). É a primeira coisa que ela vê ao
       abrir o back office no telemóvel, e durante um a dois segundos essa coisa
       é «não tens nada para fazer».
       Isto é uma consequência benigna de uma correcção boa: os dois painéis
       passaram a partilhar a cache do `useCachedList` para deixar de fazer três
       pedidos de tarefas e dois de calendário (Agenda.tsx:55-68). A partilha
       está certa; o que ficou por trazer foi o estado de espera.
     Proposta:
       Ler o `loading` nos dois e, enquanto for verdade, desenhar duas ou três
       `SkeletonRow` em vez do `EmptyState`. São as linhas que o `loading.tsx` da
       rota já desenha um instante antes — a espera fica contínua em vez de
       piscar do esqueleto para o «não tens nada» e de volta para a agenda.
     Equivalente em desktop: existe.

[A7-013] [Agente 7] [Todos] [Menor] O aquecimento de DADOS não tem travão nenhum, ao contrário do de código
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:1457-1472
           src/lib/onIdle.ts:16-21
     Observado:
       O aquecimento de CÓDIGO tem três travões (só depois do `load`, nunca em
       ligação medida, nunca em desenvolvimento — lazy.tsx:304-310). O de DADOS,
       vinte linhas de distância no `AdminClient`, tem zero:
       ```
       useEffect(() => {
         return onIdle(() => {
           prefetchList("propostas-leves", "/api/propostas?semDoc=1");
           prefetchList("tarefas", "/api/tarefas");
           prefetchList("calendario", "/api/calendario");
         });
       }, []);
       ```
       Três listas, sempre, em qualquer ligação. Com 300 pedidos são ~63 KB
       (`desempenho.md`, secção 4) descarregados por antecipação, e nem sequer
       aproveitados pela vista Propostas por causa do desencontro de chaves do
       A7-008.
       Onde isto pesa mais do que parece é no MOMENTO. O `onIdle` cai num
       `setTimeout(cb, 200)` quando não há `requestIdleCallback` — repare-se que
       ignora o `timeout` que lhe passaram — portanto, no browser dela, este
       efeito não corre «quando o telemóvel estiver desocupado»: corre **200 ms
       depois de montar**, em cima da hidratação, no intervalo exacto que o
       `desempenho.md` identifica como aquele em que o ecrã ainda não responde ao
       primeiro toque (1024–1359 ms com 300 pedidos).
       Não estou a afirmar que isto atrasa a hidratação — os `fetch` não bloqueiam
       a thread principal e o custo é de rede, não de CPU. O que afirmo é que
       ocupa o canal ao lado do que ela está a tentar fazer, e que a decisão de
       o fazer nunca é revista.
     Proposta:
       Fazer este efeito passar pela mesma porta que o de código: uma só função
       «vale a pena gastar rede?» (a do A7-002, a que sabe funcionar no Safari), e
       esperar pelo evento `load` como o `warmViewChunks` faz. E, quando o A7-008
       estiver feito, o aquecimento de `propostas-leves` passa a ser
       aproveitado — o que o torna, aí sim, um bom negócio.
     Equivalente em desktop: existe, e é grátis.

[A7-014] [Agente 7] [Temas · Seletor de temas] [Menor] Há duas variantes de fotografia — 96 px e 400 px — e o telemóvel cai entre as duas
     Largura onde falha: 390 / 430 (e agrava com a densidade do ecrã)
     Onde: src/lib/theme-storage.ts:73-89
           src/app/[lang]/(site)/orcamento/admin/Temas.tsx:346
           src/app/[lang]/(site)/orcamento/admin/Temas.tsx:314-315
     Observado:
       A biblioteca tem exactamente três tamanhos por foto: a **micro** (96 px,
       ~1,8 KB), a **miniatura** (400 px, ~20–25 KB) e o **original** (~576 KB a
       2,6 MB, conforme o sítio do código onde está estimado). Não há `srcset` em
       lado nenhum: cada `<img>` escolhe UM dos três em JavaScript
       (`const light = localSrc || image.thumbUrl`, Temas.tsx:1557) e o browser
       não tem por onde escolher melhor.
       Os dois tamanhos foram medidos contra o ecrã de secretária — a nota do
       `theme-storage.ts:85-88` di-lo: «as três tiras de pré-visualização de cada
       cartão de tema são desenhadas com 43 × 42 px e recebiam o ficheiro de
       400 px». Correcto, e a poupança de 91% é real.
       Só que **no telemóvel a grelha tem MENOS colunas, portanto células
       MAIORES**. O `GRELHA_DE_FOTOS` é `grid-cols-2` abaixo de 26rem
       (Temas.tsx:346) e os cartões são `grid-cols-2` (linha 314). A 390 px de
       largura isso dá células de ~175 px CSS — que num iPhone a 3× são **~525
       píxeis reais** a receber uma imagem de 400. A miniatura fica esticada
       ~30%: visivelmente mole, e numa biblioteca de INSPIRAÇÃO a nitidez é
       metade do produto.
       O passo seguinte é o original, e o salto é de 25 KB para vários MB. Não há
       nada no meio.
     Proposta:
       Uma terceira derivada de ~800 px, gerada no browser pelo mesmo caminho que
       já gera as outras duas (`image-worker.ts`, sem `sharp` e sem
       transformações pagas), e servida só onde a célula é grande. Em 4G a
       decisão passa a ser dela e não do layout: 25 KB moles ou 60 KB nítidos,
       em vez de 25 KB moles ou 2,6 MB.
       Alternativa mais barata, se a derivada nova não valer o trabalho: dar aos
       `<img>` da grelha um `srcset` com as duas variantes que já existem
       (`96w`, `400w`) e um `sizes` que descreva a grelha. Não resolve a moleza —
       não há um ficheiro maior para escolher — mas passa a impedir o caso
       inverso, que é a micro de 96 px ir parar a uma tira de 129 píxeis reais
       num ecrã 3×.
     Equivalente em desktop: não existe — em desktop as células são mais pequenas
       e os 400 px chegam e sobram. É o layout móvel que cria o problema.

[A7-015] [Agente 7] [Todos os ecrãs com fotografias] [Menor] Não há `preconnect` garantido ao Storage: cada ecrã com fotos paga um aperto de mão a frio
     Largura onde falha: todas — é rede, não largura
     Onde: src/app/[lang]/layout.tsx:220-224, 349
           src/lib/csp-imagens.ts (VARIAVEIS_DE_ORIGEM)
     Observado:
       Todas as fotografias do back office são `<img>` apontados ao Storage do
       Supabase, noutra origem. A primeira ligação a uma origem nova custa DNS +
       TCP + TLS antes do primeiro byte — em 4G, tipicamente 300 a 800 ms, uma
       vez por ecrã e por sessão.
       Há um `preconnect` no layout de raiz, mas com duas ressalvas:
        · **é condicional a uma variável só**, `NEXT_PUBLIC_IMAGE_CDN`
          (layout.tsx:220-224). O `csp-imagens.ts` mostra que a origem do Storage
          pode vir de três sítios, por ordem de preferência, e esta é a última
          das três. Uma instalação que só tenha `SUPABASE_URL` — que é a que
          serve as fotos — publica um sítio **sem `preconnect` nenhum**;
        · e mesmo quando existe, está no `<body>`, depois do `LocaleProvider`
          (linha 349). O React 19 iça-o para o `<head>`, portanto funciona; mas
          fica atrás do que o analisador de pré-carga do browser podia ter visto
          logo no HTML.
       Não consegui confirmar qual das variáveis está definida na instalação dela
       — e **não é coisa que se confirme escrevendo valores num relatório**. O
       que se pode afirmar é que a garantia não está no código.
     Proposta:
       Fazer o `preconnect` sair da MESMA função que já decide a origem para a
       CSP (`origensDeImagem` em `csp-imagens.ts`), em vez de ler uma variável à
       parte. Duas cópias da regra são duas oportunidades de o `preconnect`
       apontar para um sítio diferente daquele de onde as fotos vêm — que é
       exactamente o argumento que aquele ficheiro já faz para si próprio. E
       subi-lo para dentro do `<head>`, ao lado do `<script>` que já lá está.
     Equivalente em desktop: existe — e em fibra são 20 ms, portanto invisível.

[A7-016] [Agente 7] [Todos] [Menor] O back office descarrega e envia telemetria de campo que ele não usa
     Largura onde falha: todas — é rede, não largura
     Onde: src/components/WebVitals.tsx:52-96
           src/components/CromadoDoSitio.tsx:82-105
     Observado:
       O back office está montado dentro do layout do site público, portanto
       recebe o cromado dele — o `desempenho.md` já assinala isto no lugar 7 do
       seu ranking, e não o repito. O que acrescento é a parte que é de REDE.
       O `WebVitals` importa a biblioteca `web-vitals` (**9,3 KB comprimidos**,
       medido no `desempenho.md`) e regista cinco métricas, cada uma das quais
       manda um `sendBeacon` para `/api/vitals` — o `desempenho.md` conta três
       desses envios na janela em que o ecrã ainda não responde ao primeiro
       toque. O `SpeculationRules` e o `HeroWarm` verificaram-se bem: os dois
       excluem `/orcamento/*` explicitamente (SpeculationRules.tsx:29-30,
       HeroWarm.tsx:42), portanto não pré-carregam páginas de marketing por cima
       do trabalho dela. Esse cuidado está feito.
       O `WebVitals` é que não tem essa exclusão. Ele existe para medir o SÍTIO
       PÚBLICO em telemóveis reais — o que é uma boa ideia — e o back office é
       uma ferramenta interna com uma utilizadora. Os campos que a baliza envia
       (`path`, `nav`, `conn`) sobre `/orcamento/admin` não respondem a pergunta
       nenhuma que alguém vá fazer.
       Sendo justo com a gravidade: os beacons são de baixa prioridade e não
       bloqueiam nada. O custo real são os 9,3 KB de JavaScript, que em 4G a
       bater no fundo são ~0,2 s — pequeno, mas é 100% desperdício.
     Proposta:
       A guarda já existe e chama-se `isTokenRoute` (safe-path.ts), usada aqui
       para excluir as rotas de proposta e portal (WebVitals.tsx:41). Acrescentar
       a mesma exclusão para `/orcamento/admin` — antes do `import("web-vitals")`,
       para os 9,3 KB nem chegarem a ser pedidos.
     Equivalente em desktop: existe, e é irrelevante.

---

## Custo por ecrã

As contagens são de **primeira visita ao ecrã, cache fria**, com sessão já
iniciada. «Em cascata» conta os níveis em SÉRIE — um pedido que só parte quando
o anterior responde. Os MB são estimativa a partir dos bytes reais citados nos
achados; onde o número depende do volume de dados, ponho os dois extremos.

| Ecrã | Pedidos até ser utilizável | Quantos em cascata | MB estimados | Tem estado de carregamento? |
| --- | --- | --- | --- | --- |
| **Entrada / Visão Geral** (arranque a frio) | ~26 — HTML + 17 JS + CSS + 6 API (`visao-geral`, `tarefas`, `calendario`, `armazenamento`, `push/subscribe`, `propostas?semDoc=1`) + `sw.js` | **2** (HTML → JS → APIs) | **0,37 MB** com poucos pedidos · **0,82 MB** com 300 · +0,25 MB de vistas aquecidas em ocioso | **Parcial.** O `loading.tsx` da rota é bom e cobre a espera pelo HTML. Depois disso, a Agenda e os Lembretes mentem enquanto carregam (A7-012) |
| **Pedidos (lista)** | 0 — já vem no esqueleto | 0 | 0 | n/a (é instantânea, medida em 52 ms) |
| **Abrir um pedido** | 3–4 — `GET /api/orcamento/{id}` + `proposta-rascunho` (NotaDaProposta) + o chunk do separador + o `fetch` desse separador | **3** | dezenas de KB, dominado pela lista de convidados e pelo cronograma | **NÃO.** Nada entre o toque e o painel (A7-004) |
| **Estúdio de Propostas** | 5 + uma por fotografia — chunk de 81 KB, depois `proposta-rascunho` ∥ `assets` ∥ `proposta-doc` ∥ `proposta-definicoes`, depois as miniaturas | **5** contando desde o toque no pedido | **~0,35 MB** com 12 fotos (81 KB de código + ~20 KB por miniatura) | **Fraco.** Barra de 9 px durante todo o chunk (A7-005); dentro, as células têm esqueleto próprio e bom |
| **Temas (biblioteca)** | ~1 + 4 por tema — `/api/temas`, depois a capa e três tiras de cada cartão | **2** (JSON → imagens) | **~0,46 MB** com 15 temas (capas ~330 KB + tiras ~81 KB + JSON) | **Sim**, e bem feito (esqueleto de 6 cartões, Temas.tsx:1138-1144) |
| **Um tema aberto** | 1 + 60 | **2** | **~1,3 MB** por página de 60 fotos | **Sim** (12 células em esqueleto, Temas.tsx:3215-3220) + fila de concorrência para as pesadas |
| **Seletor de temas** (dentro do estúdio) | 2 em PARALELO + 60 | **1** — a lista e as imagens partem ao mesmo tempo, de propósito (ThemePicker.tsx:1020-1048) | **~1,26 MB** por página de 60 miniaturas | **Sim**, e é o melhor ecrã do back office nesta matéria |
| **Propostas** | 1 (o chunk vem aquecido) | 1 | **0,16 MB** com 194 propostas, e a crescer — mais 0,03 MB já descarregados e deitados fora (A7-008) | **Sim** (`SkeletonList`, Propostas.tsx:395) |
| **Calendário** | 1 | 1 | ~0,04 MB com 300 pedidos | **NÃO** — e pior: afirma «Sem eventos este mês» enquanto espera (A7-011) |
| **Estatísticas** | 0 (lê os `quotes` que já cá estão) | 0 | 0 | n/a |
| **Tarefas · Contratos · Fornecedores · Inventário · Material · Acompanhamento** | 1 cada | 1 | 0,01–0,04 MB | **Sim** — as seis leem o `loading` e usam `AvisoDeFalha` na falha |
| **Modo de Carga · Carregamento de material** | 0 (abre do `localStorage`) | 0 | 0 | **Sim**, e é o único par de ecrãs que funciona sem rede nenhuma |

### As três contas que resumem tudo

- **Chegar ao back office**: 0,37 MB e dois níveis de cascata → ~2 s em 4G
  fraco, **~8 s a bater no fundo**. Com 300 pedidos, 0,82 MB → ~16 s.
- **Do toque num pedido até poder escrever uma proposta**: cinco níveis em
  série. Só as idas-e-voltas são 1,5 s em 4G fraco e **4 s a bater no fundo** —
  antes de um único byte de conteúdo. Somando os 81 KB do chunk e o resto,
  ~3 s e **~9 s**.
- **O ecrã mais caro é o seletor de temas**, com 1,26 MB — mas é o mais bem
  feito de todos: paraleliza a cascata, tem esqueleto, tem fila de concorrência
  e tem cache no service worker. **É o modelo. O que falta ao resto do back
  office já está escrito ali.**
