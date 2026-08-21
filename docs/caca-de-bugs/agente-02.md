# Agente 2 — Estado e concorrência

O estúdio tem defesas escritas e boas contra as corridas que já custaram trabalho (a tradução
campo a campo, a «abertura», o resgate do `localStorage`), mas a defesa central contra duas
pessoas na mesma proposta **está montada só até meio**: o servidor guarda a versão sobreposta
numa ranhura de resgate que **nenhum ecrã lê**, e o `baseUpdatedAt` que a arma cai para `null`
exactamente nos casos em que ela faria falta (leitura de abertura falhada, logo a seguir a
«Limpar»).

Fora disso, os buracos são todos do mesmo feitio: **trabalho em voo que não conta como «por
gravar»** — um lote de fotos a subir, o preço do pedido a caminho, os dez segundos da anulação
— e por isso nem o travão de saída nem o «Guardar tudo» sabem dele.

Nove das onze entradas perdem trabalho dela; duas chegam ao cliente.

---

[A2-001] [Agente 2] [Estúdio de propostas / rascunho] [Crítico] O estúdio grava o rascunho local no servidor antes de saber o que lá está — e cego, sem `baseUpdatedAt`
     Reproduzir:
       1. Portátil da Ana: abrir a proposta do pedido X de manhã, escrever, deixar o separador aberto (fica `liquen-proposal-studio-X` no localStorage).
       2. Noutro computador, a Catarina abre a MESMA proposta à tarde, monta dois mood boards e escreve os textos. O servidor fica com a versão das 16h.
       3. A Ana recarrega a página do estúdio numa ligação lenta ou com a sessão já expirada (o `GET /proposta-rascunho` demora mais de 800 ms, ou responde 401/falha).
       4. Não escrever nada. Esperar.
     Esperado: enquanto não se souber o que está no servidor, não se escreve nada por cima dele; e se se escrever, vai com o carimbo lido, para o servidor poder dizer «sobrepuseste» e guardar a versão anterior na ranhura de resgate.
     Observado: 800 ms depois da montagem sai um PUT com o documento da manhã. Como o `serverStamp` ainda é `null`, o corpo leva `baseUpdatedAt: null`; a rota calcula `overwrote = Boolean(current && base && …)` → `false`; não há aviso, não há `--sobreposto`, e a tarde da Catarina deixa de existir em qualquer sítio. Basta abrir o estúdio: nenhuma tecla é premida.
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:2371 (o `setTimeout(save, 800)` que arranca com o restauro local)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1551 e 1843-1850 (o `serverStamp` só é escrito dentro do `if (draft)` do GET)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1712 («SÓ quando não havia rascunho nenhum» — com rascunho, a abertura não é marcada e portanto grava)
       src/app/api/orcamento/[id]/proposta-rascunho/route.ts:128 (`overwrote` exige um `base` não nulo)
     Causa provável: a gravação automática e a leitura do servidor são dois efeitos independentes, sem ordem imposta entre eles. A defesa da sobreposição depende de um carimbo que só existe DEPOIS da leitura, e a gravação não espera por ele. A mesma cegueira acontece a seguir ao «Limpar», que põe `serverStamp.current = null` (ProposalStudio.tsx:3410).
     Correção proposta: uma `ref` do género `servidorLido` que o efeito da leitura levanta em qualquer desfecho (leu, não havia, falhou), e o `save` a não sair enquanto ela for falsa — o trabalho não se perde, fica no `localStorage` na mesma e sobe assim que a leitura resolver. E, quando a leitura FALHOU, mandar o PUT com um `baseUpdatedAt` que o servidor saiba ler como «não sei o que lá está» e trate como sobreposição (guardando sempre resgate), em vez do silêncio actual.
     Chega ao cliente? não (mas apaga uma tarde de trabalho, e o PDF que sair a seguir é o do documento antigo)

[A2-002] [Agente 2] [API rascunho + estúdio] [Crítico] A versão sobreposta é guardada em `--sobreposto` e NUNCA é oferecida a ninguém
     Reproduzir:
       1. Duas sessões na mesma proposta (dois computadores, ou dois separadores).
       2. A sessão A grava; a sessão B, com o carimbo antigo, grava a seguir.
       3. O servidor cria `X--sobreposto` com a versão de A e responde com `resgate` e `resgateEm`.
       4. Procurar, em qualquer ecrã do back office, o botão que traz essa versão de volta.
     Esperado: o que o comentário da rota promete — «a resposta di-lo para o estúdio o poder dizer a quem está a olhar»: um aviso com «recuperar a versão de Catarina das 16:04».
     Observado: o cliente nunca lê os campos. `gravarRascunhoNoServidor` só extrai `updatedAt`, `overwrote`, `previousBy`, `duradouro` e `aviso`; `resgate`/`resgateEm` são deitados fora. Não há rota que leia a chave (`VARIANTES_DE_RASCUNHO` só conhece `orcamento-linhas`, e a variante é aplicada ao PEDIDO, não ao sufixo `--sobreposto`), nem ecrã, nem menção em lado nenhum do `src`. A versão resgatada só é acessível a quem abrir o `app_state` à mão.
     Onde:
       src/app/api/orcamento/[id]/proposta-rascunho/route.ts:159-171 e 226 (grava e devolve)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:897-915 (a leitura da resposta, sem `resgate`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:2350-2360 (o único uso do `overwrote`: um toast, e só o primeiro da sessão)
     Causa provável: o trabalho foi feito de fora para dentro e parou no servidor; o `ResultadoDaGravacao` do cliente nunca ganhou os dois campos.
     Correção proposta: acrescentar `resgate`/`resgateEm` ao `ResultadoDaGravacao`, aceitar o sufixo `--sobreposto` no `GET` (lista fechada, como a variante) e trocar o toast de uma linha por um aviso persistente com um botão «ver o que foi sobreposto» que abra a versão em modo de comparação — a mesma casa do «Repor versão» que já existe.
     Chega ao cliente? não

[A2-003] [Agente 2] [Estúdio de propostas / rascunho] [Grave] A mesma proposta em dois separadores: nenhum revalida, os dois partilham a mesma gaveta local, e o aviso fala uma vez só
     Reproduzir:
       1. Abrir a proposta do pedido X no separador 1 e no separador 2 do MESMO browser.
       2. Escrever no separador 1 («Cerimónia ao pôr do sol»). Esperar 1 s.
       3. Passar ao separador 2 e escrever noutro campo.
       4. Voltar ao separador 1 e continuar a escrever.
     Esperado: o separador que volta ao foco revalida o rascunho antes de deixar escrever, ou avisa de forma persistente que está a olhar para uma versão antiga.
     Observado: os dois separadores escrevem alternadamente a chave `liquen-proposal-studio-X` inteira (documento completo, não campos), e cada um manda o SEU documento ao servidor. O que se escreveu no separador 2 desaparece assim que o 1 grava, e vice-versa. Nada revalida: não há `storage`, `BroadcastChannel`, nem re-leitura no `focus`/`visibilitychange` (o único `visibilitychange` que existe é o do contador de tempo activo). O `warnedOverwrite` dispara um toast informativo UMA vez por sessão e depois cala-se para sempre, enquanto o vaivém continua.
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1552 e 2352-2360 (`warnedOverwrite`, uma vez por sessão)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1819-1975 (a leitura do servidor corre uma vez, com `[quote.id]`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:2280-2283 (a escrita do documento inteiro na chave partilhada)
     Causa provável: o desenho assume um só estúdio por browser. A ranhura local não tem dono e o aviso foi calibrado para não fazer ruído a cada 800 ms — o que faz sentido para uma sobreposição isolada e não para um vaivém contínuo.
     Correção proposta: (a) um `BroadcastChannel` por pedido, ou um ouvinte do evento `storage`, que faça o separador que não está em foco entrar em modo de leitura com um aviso nomeado («esta proposta está aberta noutro separador»); (b) o `warnedOverwrite` deixar de ser uma vez por SESSÃO e passar a ser uma vez por `previousBy`+carimbo, para o vaivém ser dito; (c) enquanto (a) não existe, o A2-002 pelo menos torna o estrago recuperável.
     Chega ao cliente? não

[A2-004] [Agente 2] [Estúdio — fotografias] [Grave] Sair (ou trocar de cliente) durante um upload: as fotos sobem e nunca entram no documento, sem uma palavra
     Reproduzir:
       1. Abrir o estúdio de um pedido, ir a um mood board e escolher 12 fotos do telemóvel.
       2. Enquanto a barra sobe (numa ligação de quinta são minutos), clicar em «Trocar de cliente» — ou fechar o separador, ou mudar de separador de detalhe.
     Esperado: um travão a dizer que há fotos a caminho (o mesmo travão que o envio já tem: «Ainda há N fotos a entrar na proposta»), ou a colocação a acontecer na mesma quando o lote acabar.
     Observado: o estúdio é desmontado (a `key` em `FazerProposta.tsx:246` recomeça-o do zero). O lote continua a subir, os bytes ficam no bucket, e o `onPaths` chama `setDoc` num componente que já não existe — as fotos nunca entram no mood board. A descarga da desmontagem já correu antes, portanto o rascunho gravado é o de ANTES das fotos. Reabrir o pedido mostra o mood board sem elas e ninguém diz que houve um lote. Como `uploading` não entra em `porGravar`, nem o `beforeunload` nem o registo do «Guardar tudo» sabem que há trabalho em voo — fechar o separador não pergunta nada.
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:3499-3545 (`handleUpload`, sem sinal de vida e sem `AbortController`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:3533 (`if (paths.length > 0) onPaths(paths)` — o `setDoc` que se perde)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:3211 (o travão de saída: `porGravar`, `soNesteComputador`, `aGravarNoServidor` — `uploading` não está lá)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:2513 (o mesmo no `porGravar` que vai para o registo)
     Causa provável: as fotos que já estão no documento têm o marcador `pending:` e são contadas (`fotosPorConfirmar`) — as que ainda estão a subir do disco dela não têm marcador nenhum, e por isso não existem para o resto do ecrã.
     Correção proposta: contar `Object.values(uploading).some(Boolean)` como trabalho por gravar (entra de graça no `beforeunload` e no «Guardar tudo»), e — como o marcador provisório já faz para a biblioteca — reservar o lugar da foto no documento no instante em que o ficheiro é escolhido, para a colocação não depender de o componente ainda estar montado.
     Chega ao cliente? não (mas a proposta segue com menos fotos do que ela escolheu, o que é o defeito que originou o `fotosPorConfirmar`)

[A2-005] [Agente 2] [Estúdio de propostas / rascunho] [Grave] O travão de saída pergunta e não grava — e no telemóvel nem pergunta
     Reproduzir:
       1. Escrever uma frase num campo do estúdio.
       2. Dentro de 800 ms, carregar em ⌘R (ou fechar o separador) e responder «Sair» à pergunta do browser.
       3. Reabrir a proposta.
     Esperado: sair sem gravar é uma escolha sobre o SERVIDOR; a cópia local é síncrona, gratuita e não tinha por que se perder.
     Observado: o `beforeunload` só faz `preventDefault()`. O `setTimeout` dos 800 ms morre com a página e a última frase não chega sequer ao `localStorage` — o rascunho fica na versão anterior. Num telemóvel (onde ela escreve propostas, por escrito nos comentários deste ficheiro) o `beforeunload` é ignorado e o separador arrumado em segundo plano é morto sem pergunta nenhuma: a perda é silenciosa. O `pagehide` está montado no estúdio, mas só para o contador de tempo activo.
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:3210-3216
       src/app/[lang]/(site)/orcamento/admin/registo-de-gravacoes.tsx:352-364 (o travão comum, que também só pergunta)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1504 (o `pagehide` que já existe, e só serve a medição)
     Causa provável: o travão foi pensado como pergunta e não como descarga; e a descarga da desmontagem (ProposalStudio.tsx:2419-2423) cobre a navegação DENTRO da aplicação, que era o caso conhecido.
     Correção proposta: no `beforeunload` (e sobretudo no `pagehide`, que é o que o telemóvel honra) fazer a parte SÍNCRONA do `save` — os três `localStorage.setItem` — antes de perguntar seja o que for; e mandar o servidor por `navigator.sendBeacon`, exactamente como o `reportarTempo` já faz aqui ao lado.
     Chega ao cliente? não

[A2-006] [Agente 2] [Estúdio — Limpar / Repor versão] [Grave] A anulação de dez segundos vive só na memória, e o servidor já foi apagado no primeiro segundo
     Reproduzir:
       1. Montar uma proposta (textos, mood boards, orçamento).
       2. Carregar em «Limpar».
       3. Dentro dos dez segundos, recarregar a página — ou clicar em «Trocar de cliente», ou deixar cair a ligação e fechar o portátil.
     Esperado: uma limpeza reversível é reversível enquanto a janela durar, aconteça o que acontecer ao ecrã.
     Observado: o `clearDraft` apaga já `DRAFT_KEY`, `DRAFT_KEY:at` e `SIDE_KEY`, e manda logo `DELETE` ao servidor. O que ia ser resgatado está apenas no estado React `limpo`, que morre com o componente. Recarregar dentro dos dez segundos apaga a proposta inteira dos dois sítios, sem confirmação prévia (deliberadamente) e agora também sem a anulação que a substituía. O «Repor versão» tem o mesmo desenho (só que aí o documento anterior ainda existe no painel de versões).
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:3398-3416 (`clearDraft`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1058-1075 (o estado `limpo`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:3338-3345 (`restaurarVersao`)
     Causa provável: a anulação foi desenhada contra o clique enganado, e não contra a página que desaparece a meio da janela.
     Correção proposta: escrever o documento deitado fora numa chave irmã do `localStorage` (`…:anulavel`) ANTES de limpar, e adiar o `DELETE` do servidor para o fim dos dez segundos (ou mandá-lo já mas guardando a versão no `--sobreposto` do A2-002). Ao reabrir, um rascunho `:anulavel` com menos de uma hora oferece «anular a limpeza».
     Chega ao cliente? não

[A2-007] [Agente 2] [Construtor de orçamento (linhas)] [Médio] Duas pessoas nas linhas do orçamento sobrepõem-se em silêncio absoluto
     Reproduzir:
       1. Duas sessões no mesmo pedido, ambas no separador do construtor de orçamento (a tabela de linhas).
       2. Cada uma acrescenta linhas.
     Esperado: pelo menos o mesmo que o estúdio já faz — «tinha sido alterado por X noutro sítio; ficou a tua versão».
     Observado: o construtor manda o `baseUpdatedAt` correctamente e a rota até calcula o `overwrote` e guarda o `--sobreposto`, mas `enviarRascunhoParaServidor` devolve só `{ guardado, updatedAt, porque }` — o `overwrote` e o `previousBy` são ignorados e nunca é dito nada a ninguém. E, como no A2-001, se o `GET` de abertura falhar o `carimboDoServidor` fica `null` e a primeira gravação vai cega (sem `overwrote` e portanto sem resgate).
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalBuilder.tsx:76-102 (a resposta lida sem `overwrote`)
       src/app/[lang]/(site)/orcamento/admin/ProposalBuilder.tsx:369-372 (o carimbo só é escrito dentro do `if (res.ok)`)
     Causa provável: a ferramenta antiga herdou a máquina de gravar do estúdio mas não a parte do aviso.
     Correção proposta: as mesmas quatro linhas do estúdio — ler `overwrote`/`previousBy` e dizê-lo — de preferência já no formato do A2-002.
     Chega ao cliente? não

[A2-008] [Agente 2] [Estúdio — fotografias / sessão] [Médio] Sessão expirada a meio de um lote de fotos: o lote não é retomado depois de reautenticar
     Reproduzir:
       1. Deixar a sessão caducar (ou rodar o `SESSION_VERSION`).
       2. Escolher 20 fotos para um mood board.
       3. Autenticar no painel «Sessão expirada» que aparece a meio.
     Esperado: o que o painel promete para o texto — o trabalho continua exactamente onde estava, e o que falhou por causa da sessão é retomado.
     Observado: cada `uploadOne` que apanha 401 atira; a via segue para o ficheiro seguinte, que também apanha 401. No fim lê-se «3 de 20 carregadas. Falha ao carregar a imagem». O `concluir()` do painel só chama o «guardar tudo» dos rascunhos — não há nada que retome um upload. As 17 fotos têm de ser escolhidas outra vez, e no telemóvel isso é refazer a selecção toda. A repetição interna do `uploadOne` só cobre um soluço de rede (um `throw`), não um 401.
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:3470-3486 (`uploadOne`: repete só o `catch` de rede)
       src/app/[lang]/(site)/orcamento/admin/SessaoExpirada.tsx:203-217 (`concluir`: grava rascunhos, não retoma nada)
     Causa provável: a reautenticação foi desenhada à volta do trabalho que vive em estado (texto), não do trabalho que vive num `File` a meio de um `fetch`.
     Correção proposta: guardar os ficheiros que falharam com 401/403 num escalão de repetição e oferecer «tentar outra vez as 17 que faltam» no mesmo toast; ou expor um sinal do painel de sessão renovada a que o lote em curso possa reagir.
     Chega ao cliente? não

[A2-009] [Agente 2] [Estúdio — preço final] [Médio] O preço do pedido tem um travão de 600 ms que ninguém descarrega, e o «Guardar agora» diz «guardado» sem ele
     Reproduzir:
       a) Escrever o preço final no estúdio e, em menos de 600 ms, fechar o separador (respondendo «Sair») ou recarregar.
       b) Ou: escrever o preço e carregar em ⌘S imediatamente.
     Esperado: (a) o preço chega ao pedido, como a promessa «há um número só» diz; (b) «Rascunho guardado no servidor» só depois de tudo o que estava em voo ter chegado.
     Observado: (a) o `PATCH /api/orcamento/[id]` está atrás de um `setTimeout(600)` que nunca é descarregado — o documento fica com o valor, o PEDIDO fica com o antigo, e a Visão Geral, o Kanban, o sinal e a fatura continuam a dizer o número anterior (a descarga da desmontagem cobre o rascunho e não este); (b) o `flushDraft` não toca no travão do preço, portanto a frase de sucesso sai com a gravação do preço ainda por acontecer.
     Onde:
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:2651-2680 (`gravarPreco` / `persistirPreco`)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:2335-2360 (o `save` que o «Guardar agora» chama, sem o preço)
     Causa provável: dois travões independentes (800 ms para o rascunho, 600 ms para o preço) e só um deles tem descarga.
     Correção proposta: extrair o corpo do `setTimeout` para uma função e chamá-la do `flushDraft`, da limpeza da desmontagem e do `pagehide` (com `keepalive`), como o A2-005 propõe para o rascunho.
     Chega ao cliente? sim (o sinal e a fatura saem do «Preço final» do pedido)

[A2-010] [Agente 2] [Envio da proposta] [Menor] não confirmado — dois envios verdadeiramente simultâneos escapam à janela de repetição
     Reproduzir (por leitura; não reproduzido): dois pedidos de envio do mesmo documento que se sobreponham de tal maneira que o segundo leia as propostas irmãs antes de o primeiro escrever a sua linha — dois cliques a menos de ~100 ms, ou dois separadores a enviar ao mesmo tempo.
     Esperado: um só email, um só link de aceitação — que é o que a janela de três minutos existe para garantir.
     Observado: a trava compara com linhas JÁ GRAVADAS (`status === "enviada"` e `sentAt`), e a leitura das irmãs acontece depois de o PDF estar desenhado mas ANTES de a linha ser escrita. Dois pedidos que atravessem essa janela ao mesmo tempo passam os dois: duas propostas, dois emails, dois links. O `if (busy) return` do estúdio não fecha isto — é estado React, lido em atraso no mesmo tique, e o próprio comentário da rota diz que não chega.
     Onde:
       src/app/api/orcamento/[id]/proposta-doc/route.ts:643-673 (a janela de repetição)
       src/app/api/orcamento/[id]/proposta-doc/route.ts:480-492 (a leitura das irmãs)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:4862-4863 (`if (busy) return`)
     Causa provável: a trava é uma leitura-depois-escrita sem reserva; falta um passo atómico entre as duas.
     Correção proposta: reservar antes de desenhar — inserir a linha em `status: "a-enviar"` com o selo de versão sob uma restrição de unicidade (selo + pedido), e o segundo pedido a encontrar a reserva devolve o mesmo `repetidoAviso` que já existe.
     Chega ao cliente? sim (dois emails e dois links de aceitação para o mesmo casamento)

[A2-011] [Agente 2] [Back office — navegação] [Menor] Voltar atrás no browser a meio da proposta sai do back office inteiro
     Reproduzir: no estúdio, no passo «Pré-visualizar» ou «Enviar», carregar no botão «voltar» do browser (ou no gesto de voltar do telemóvel, que é fácil de apanhar sem querer).
     Esperado: voltar um passo do fluxo guiado, ou pelo menos voltar à lista de clientes do «Fazer proposta».
     Observado: nada do estado do back office está no histórico — nem o pedido escolhido, nem o passo, nem o separador. O `router` só é usado na entrada e na recuperação de palavra-passe. «Voltar» leva à página anterior do site; ao avançar outra vez, o estúdio remonta do zero no passo «Conteúdo» com o cliente por escolher. O rascunho não se perde (a descarga da desmontagem e o `localStorage` seguram-no), mas perde-se o sítio onde ela ia — e o gesto de voltar do telemóvel é o mais fácil de dar sem querer.
     Onde:
       src/app/[lang]/(site)/orcamento/admin/FazerProposta.tsx:245-250 (o cliente escolhido é estado, não URL)
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:1374 (`step`, idem)
     Causa provável: o back office é uma página só, com todo o encaminhamento em estado React.
     Correção proposta: espelhar `?pedido=<id>&passo=<passo>` na barra de endereços com `history.replaceState`/`pushState` — dá o botão «voltar» de graça, e torna partilhável o endereço de uma proposta a meio.
     Chega ao cliente? não

---

## O que está bem defendido (e com que nome)

- **A tradução campo a campo, provada pelo texto português** — `aplicarTraducao`
  (`src/lib/proposal-traducao.ts:461-475`) só escreve a caixa inglesa quando o português
  daquele campo ainda é o que foi mandado traduzir; o estúdio aplica-a sobre `docRef.current`
  e pela forma funcional do `setDoc` (`ProposalStudio.tsx:4353-4355`), portanto as fotos que
  ela mexeu durante a ida à rede ficam. E os campos que mudaram são CONTADOS e ditos.
- **A trava do desalinhamento** — uma resposta com um número de textos diferente do pedido é
  recusada por inteiro (`proposal-traducao.ts:520-535`), em vez de deslizar a tradução de um
  campo para outro.
- **A «abertura»** — `aAbrir` / `marcaDaAbertura` / `jaGravou` (`ProposalStudio.tsx:2174-2192`):
  abrir um pedido não conta como trabalho por gravar, a abertura acaba no primeiro gesto dela
  (incluindo `input`, `change`, `paste` e `drop`, não só teclas), e o silêncio é levantado
  assim que há rascunho gravado.
- **Os campos que ela está a tocar** — `camposTocados` (`ProposalStudio.tsx:2423-2428` e
  `onTotalInput`): o merge do rascunho do servidor deixa em paz os campos em que ela tem as
  mãos, com a medição escrita ao lado (sete rondas em oito perdiam texto).
- **A descarga da desmontagem** — `flushDraft` na limpeza do efeito
  (`ProposalStudio.tsx:2419-2423`): «Trocar de cliente» dentro dos 800 ms grava, e a parte do
  `localStorage` é síncrona.
- **O resgate da abertura** — `ProposalStudio.tsx:1860-1910`: um rascunho preso no
  `localStorage` é reenviado ao abrir, e SÓ quando o `GET` correu bem. Tem teste.
- **A verdade sobre onde ficou** — os quatro estados do indicador (`textoDaGravacao`), o 503
  com `guardado: false`, o `duradouro: false` e o «guardado só neste computador» por extenso.
- **A sessão expirada** — `SessaoExpirada.tsx`: o painel por cima em vez de um
  redireccionamento (nada é desmontado), com o `fetch` embrulhado só para LER o `status`, as
  rotas de entrada de fora, e o «guardar tudo» automático depois de reautenticar.
- **O registo das gravações** — `registo-de-gravacoes.tsx`: uma verdade sobre o back office
  inteiro, capaz de NOMEAR o que se perde ao fechar o separador.
- **O reenvio da mesma proposta** — a janela de três minutos sobre o selo de versão
  (`proposta-doc/route.ts:643`) apanha o caso real; ver A2-010 para o resto.
- **Os marcadores provisórios** — `pending:<uuid>` nunca é gravado nem enviado
  (`stripPendingImages` no rascunho, na pré-visualização e no envio), e o envio ESPERA pelas
  fotos por confirmar em vez de mandar um PDF com buracos.
