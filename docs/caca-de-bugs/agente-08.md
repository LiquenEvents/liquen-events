# Agente 8 — Consistência de dados

Os dois defeitos que ela deu como exemplo **estão corrigidos e ficaram corrigidos** — há uma só
contagem (`oQueTemODocumento`) e o inglês passou a ficar registado contra o português que
traduziu (`traducoesFeitas`/`estadoDoIngles`) —, mas **os dois voltaram a aparecer noutros
sítios**: a mesma contagem em cru na ficha «Criar a partir de…» e no cabeçalho dos Mood boards,
e o inglês desactualizado sem registo nenhum nas **alternativas** que o casal escolhe.

Nos fusos, o defeito descrito está vivo e reproduzido: na página do casal, «Atualizada a» e
«Emitida a» são desenhadas com **cinco linhas de distância** e só a segunda tem `Europe/Lisbon`
— para o mesmo instante imprimem dias diferentes.

Além disso: `deleteFoto` e `registarAcontecimento` são código morto (fotos órfãs, estados que
não transitam), e as colunas `largura`/`altura` das fotos são lidas pela página do casal e
**nunca são escritas por ninguém**.

## A varredura dos `new Date(`

344 ocorrências em `src` fora dos testes (140 só em `src/lib`). Classificadas pelo que a data
faz, que é o que decide se a falta de fuso é um defeito:

| Categoria | Quantos | Tem fuso? | Perigo |
|---|---|---|---|
| `new Date().toISOString()` — carimbo de instante gravado | ~83 em `src/lib` | não precisa | Nenhum |
| `new Date("yyyy-mm-ddT12:00:00")` — âncora de meio-dia | 11 em `src/lib`, ~25 em `src/app` | não, **mas não precisa** | Baixo — ±12 h de folga |
| `new Date("yyyy-mm-ddT12:00:00Z")` — meio-dia UTC explícito | 4 | sim (Z) | Nenhum |
| **`toLocaleDateString`/`toLocaleString` sobre um INSTANTE, sem `timeZone`** | **4** | **NÃO** | **Alto — o dia sai no fuso do processo (UTC no alojamento)** |
| `toLocaleDateString`/`toLocaleString` sobre um instante, **com** `timeZone` | 6 | sim | Correcto |
| Aritmética de dias a partir do relógio local (`getFullYear/getMonth/getDate/getUTC*`) | 7 | não | Médio — o «hoje» é o de Greenwich |
| `new Date("yyyy-mm-dd")` cru (meia-noite UTC) | 1 (`orcamento/fotos-repetidas.ts:91`) | não | Médio |

**Os quatro sem fuso que derivam um dia a partir de um instante:**

| Onde | Linha | Chega ao cliente? |
|---|---|---|
| `src/app/[lang]/(privado)/proposta/[token]/page.tsx` | 380 — `atualizadaLabel` | **SIM** — página do casal |
| `src/app/[lang]/(site)/orcamento/admin/ActivityLog.tsx` | 107 | não |
| `src/app/[lang]/(site)/orcamento/admin/Contratos.tsx` | 29, 41 | não |
| `src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx` | 748, 5040 | não |

**Os seis com fuso, todos a redeclarar a mesma constante à mão** (`FUSO`/`FUSO_DO_ESTUDIO =
"Europe/Lisbon"`): `proposal-doc.ts:1303` (o canónico), `proposal-pdf.ts:30`,
`contract-pdf.ts:78`, `ads/conversoes-offline.ts:49`, `api/cron/reminders/route.ts:44`,
`admin/EntradaComFotografia.tsx:165`. Nenhum importa outro.

---

[A8-001] [Agente 8] [Proposta · página do casal] [Crítico] «Atualizada a» sai no dia errado, ao lado de «Emitida a» que sai no dia certo
     Reproduzir: gravar uma versão nova de uma proposta às 00:30 de 3 de Julho em Lisboa
       (= 2026-07-02T23:30:00Z, que é o que fica em `versaoEm`). Abrir o link do casal.
       Verificado com node, TZ=UTC:
         atualizadaLabel (sem fuso, linha 380) → "2 de julho de 2026"
         emitidaLabel    (com fuso, linha 408) → "3 de julho de 2026"
     Esperado: as duas datas no calendário de Portugal — «3 de julho» nas duas.
     Observado: a mesma página imprime dois dias diferentes para o mesmo instante. E a linha
       636-638 só mostra «Atualizada a» quando ela DIFERE de «Emitida a» — ou seja, o bug fabrica
       uma diferença que não existe e faz aparecer uma linha que não devia estar lá.
     Onde: src/app/[lang]/(privado)/proposta/[token]/page.tsx:380 (o par correcto está em
       :404-408)
     Causa provável: `toLocaleDateString` sem `timeZone` usa o fuso do processo, que no
       alojamento é UTC; entre a meia-noite e a 01:00 de Lisboa no Verão o dia já virou cá e não
       lá. O `emitidaLabel` cinco linhas abaixo já leva `timeZone: "Europe/Lisbon"` — a correcção
       foi feita a metade do bloco.
     Correção proposta: acrescentar `timeZone: FUSO_DO_ESTUDIO` à linha 380 e importar a
       constante de `proposal-doc.ts` em vez de a repetir.
     Chega ao cliente? sim

[A8-002] [Agente 8] [Pedidos · máquina de estados] [Grave] Marcar o contrato como aceite deixa o pedido em «Proposta enviada»
     Reproduzir: pedido em «Proposta enviada», proposta enviada, contrato criado. Contratos →
       «Marcar como aceite». Voltar ao Quadro.
     Esperado: o pedido sobe a «Ganho» (`ESTADO_APOS.contrato_registado = "aceite"`) e o
       histórico ganha a linha «contrato registado».
     Observado: o contrato fica `aceite`, a proposta fica `enviada` e o pedido fica `cotado` —
       «Proposta enviada» no Kanban. Pior: o Dossier do MESMO evento salta para «Aceite», porque
       `deriveStage` lê `!!contract?.acceptedAt` (dossier.ts:259-263). Dois ecrãs, o mesmo
       acontecimento, respostas diferentes — que é exactamente o cenário que o cabeçalho de
       estado-do-pedido.ts diz existir para impedir.
     Onde: src/app/api/contratos/[id]/route.ts:107-116 (o `updateContract` não é seguido de
       transição nenhuma)
     Causa provável: `contrato_registado` só é produzido pelo PATCH do pedido
       (`orcamento/[id]/route.ts:53`, quando alguém escreve um `contractRef` à mão). O caminho
       real do aceite nunca o produz.
     Correção proposta: chamar `registarAcontecimento(contrato.quoteId, "contrato_registado",
       contrato.id)` a seguir ao `updateContract` — a função já existe e já é à prova de falha.
     Chega ao cliente? não

[A8-003] [Agente 8] [Pedidos · máquina de estados] [Grave] `registarAcontecimento` não tem um único chamador
     Reproduzir: `grep -rn "registarAcontecimento" src e2e` → uma linha, a da própria definição.
       Nem testes.
     Esperado: o módulo documentado como «o braço que executa» a decisão é o caminho por onde
       todos os acontecimentos passam.
     Observado: os dois sítios que realmente transitam o estado
       (`orcamento/[id]/proposta/route.ts:488` e `orcamento/[id]/proposta-doc/route.ts:1190`)
       reescrevem à mão o mesmo bloco `updateQuoteWith` + `transicaoDoPedido` + `activityLog`. O
       módulo que existe para não haver seis cópias tem zero e há duas cópias.
       Consequência a sério: o `MAX_HISTORICO = 5000` só vive dentro do módulo morto — as duas
       cópias fazem `[...activityLog, entrada]` sem tecto, e o histórico de um pedido cresce sem
       limite dentro do blob `data`.
     Onde: src/lib/estado-do-pedido-servidor.ts:51 (morto);
       src/app/api/orcamento/[id]/proposta/route.ts:488-503;
       src/app/api/orcamento/[id]/proposta-doc/route.ts:1190-1205
     Causa provável: o módulo foi escrito depois das duas rotas e nunca se voltou para as
       converter.
     Correção proposta: converter as duas rotas (o preço grava-se num `updateQuoteWith` próprio,
       a transição vai pelo módulo), e ligar A8-002 ao mesmo sítio. Ou, se se preferir manter o
       bloco combinado, mover o `MAX_HISTORICO` para `estado-do-pedido.ts` e aplicá-lo nos três.
     Chega ao cliente? não

[A8-004] [Agente 8] [Biblioteca de fotos] [Grave] Apagar uma foto (ou um tema inteiro) nunca apaga a linha dela — `deleteFoto` é código morto
     Reproduzir: `grep -rn "deleteFoto" src` → só a definição. Depois: apagar uma foto etiquetada
       num tema (Temas → foto → apagar). A foto sai do bucket; a linha em `biblioteca_fotos` e as
       suas linhas em `biblioteca_foto_etiquetas` ficam.
     Esperado: a linha e as etiquetas saem com o ficheiro — é o que o comentário do próprio
       `deleteFoto` promete («Chamada quando a FOTO sai do bucket»).
     Observado: `apagarFotoDaBiblioteca` → `deleteThemeImage` (theme-storage.ts:1151-1165) mexe
       no Storage, na cache da contagem e nas miniaturas, e não toca na base.
       `apagarPastaDaBiblioteca` → `deleteThemeFolder` idem: apagar um tema com 60 fotos deixa 60
       linhas órfãs cuja `pasta` (coluna gerada) aponta para um tema que já não existe. O `on
       delete cascade` das etiquetas nunca dispara porque a linha-pai nunca é apagada.
     Onde: src/lib/biblioteca-fotos-store.ts:229 (nunca chamada); src/lib/theme-storage.ts:1151,
       :1178; src/lib/theme-materializar.ts:245, :255; src/app/api/temas/[id]/route.ts:189
     Causa provável: `deleteFoto` foi escrita com a tabela e o caminho de eliminação nunca foi
       ligado a ela.
     Correção proposta: `deleteThemeImage` chama `deleteFoto(path)` (melhor esforço, nunca a
       travar a remoção do ficheiro); `deleteThemeFolder` chama o mesmo para cada caminho que
       remove.
     Chega ao cliente? não (mas ver A8-005, A8-006 e A8-015, que são as consequências)

[A8-005] [Agente 8] [Biblioteca de fotos] [Grave] Os números ao lado de cada etiqueta contam fotos que já não existem
     Reproduzir: etiquetar 10 fotos com `paleta:terracotta`, apagar 4. O chip continua a dizer
       «terracotta 10»; a procura devolve 6.
     Esperado: o número prometido pelo chip é o número que a procura devolve.
     Observado: `contagemPorEtiqueta` conta LIGAÇÕES, e as ligações das fotos apagadas
       sobrevivem (A8-004). O chip é um convite a filtrar, e filtrar responde outra coisa — que é
       a maneira mais rápida de se deixar de olhar para ele.
     Onde: src/lib/biblioteca-consulta.ts:88-92
     Causa provável: consequência directa de A8-004.
     Correção proposta: corrigir A8-004. Como rede de segurança, contar só as ligações cujo
       `path` está no conjunto de fotos que a listagem devolveu.
     Chega ao cliente? não

[A8-006] [Agente 8] [Biblioteca de fotos] [Grave] O «total» da procura é contado antes do filtro que deita fotos fora, e a paginação salta
     Reproduzir: procurar na biblioteca com qualquer filtro. Comparar o `total` da resposta com o
       número de fotos que a grelha consegue desenhar depois de carregar todas as páginas.
     Esperado: `total` é o número de fotos que se vão poder ver.
     Observado: `total: encontradas.length` é contado ANTES de `.filter((f) => f.url)`, que
       remove as que não se conseguem assinar (incluindo, com A8-004, todas as órfãs). Duas
       consequências: (a) «104 fotos» por cima de uma grelha de 97; (b) a página de 60 devolve
       menos de 60, mas o cliente avança o `offset` de 60 na mesma — as fotos que caíram entre o
       `slice` e o `filter` nunca são substituídas, e o «carregar mais» salta um bocado da
       biblioteca.
     Onde: src/app/api/biblioteca/fotos/route.ts:93 (`total`) vs :103 (`filter`)
     Causa provável: o filtro de segurança foi acrescentado ao fim do `map`, sem recuar até ao
       sítio onde o total é contado.
     Correção proposta: assinar e filtrar antes de paginar, ou (mais barato) devolver também
       `nestaPagina` e fazer o cliente avançar o offset pelo número de linhas CONSIDERADAS.
     Chega ao cliente? não

[A8-007] [Agente 8] [Propostas · Criar a partir de…] [Grave] A ficha de escolha conta em cru e ignora o `budgetRows` — o mesmo defeito que se acabou de corrigir, num segundo sítio
     Reproduzir: proposta do modelo Organização com o orçamento preenchido em linhas estimadas (o
       caso dos 3.862,20 € citado em proposal-progress.ts). Estúdio → «Criar a partir de…».
     Esperado: as mesmas contagens que o índice lateral do estúdio dá para a mesma proposta.
     Observado: a ficha diz «0 linhas» (lê só `budgetItems`), que é palavra por palavra o defeito
       que `oQueTemODocumento` foi escrito para matar. E `grupos`/`moodBoards` são `array.length`
       em cru: um grupo vazio — o estado com que o estúdio ABRE — conta como grupo, enquanto o
       índice, que exige título OU um item com nome, diz «por preencher». A mesma proposta lida
       pelos dois ecrãs dá dois pares de números.
     Onde: src/app/api/propostas/route.ts:44-49
     Causa provável: a correcção ficou em `proposal-progress.ts` e este `resumir` do lado do
       servidor nunca foi ligado a ele.
     Correção proposta: importar `oQueTemODocumento` (exportá-lo) e usá-lo aqui. É o mesmo
       argumento do cabeçalho do módulo: uma contagem, não três.
     Chega ao cliente? não

[A8-008] [Agente 8] [Estúdio · Mood boards] [Médio] O cabeçalho da secção conta páginas por outra regra que o índice
     Reproduzir: criar um mood board com título e sem fotos nenhumas.
     Esperado: as duas marcas no mesmo ecrã dizem a mesma coisa.
     Observado: o índice lateral diz «Mood boards · 1 board» com visto de preenchida
       (`temTexto(b.title) || images.length > 0`); o cabeçalho da secção, dez centímetros ao
       lado, diz «0 páginas · 0 fotos · PDF com cerca de N». Além disso `totalDeFotos` soma
       `b.images.length` INCLUINDO os marcadores de fotos ainda por copiar (`isPendingImage`),
       que o `fotosParaEscolhas` da mesma componente já sabe filtrar.
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:2815-2822 (contra
       src/lib/proposal-progress.ts:66)
     Causa provável: contagem escrita para a estimativa de páginas do PDF, que é uma pergunta
       legítima e diferente — mas foi-lhe dado o mesmo vocabulário.
     Correção proposta: tirar as fotos pendentes da soma; e ou usar a contagem de
       `oQueTemODocumento` para os boards, ou dizer explicitamente «1 board, 0 com fotos».
     Chega ao cliente? não (mas a estimativa de páginas do PDF sai errada)

[A8-009] [Agente 8] [Proposta bilingue] [Grave] O «Reunião Inicial → Ceremony Decor» continua vivo nas ALTERNATIVAS, e essas chegam ao casal
     Reproduzir: criar uma alternativa («Paleta»), escrever o título português e o `tituloEn`.
       Depois mudar só o português. Ir ao painel «Por traduzir».
     Esperado: a alternativa aparece como desactualizada, tal como acontece hoje com um título de
       grupo de serviços.
     Observado: não aparece em lado nenhum. `camposDeEscolhaPorTraduzir` só pergunta «o inglês
       está VAZIO?» (`texto(e.titulo) && !texto(e.tituloEn)`) — que é exactamente a contagem de
       caixas vazias que o cabeçalho de proposal-doc-bilingue.ts diz não ser capaz de ver este
       defeito. As escolhas não passam por `CampoDeTexto`, logo não passam por `estadoDoIngles`
       nem por `traducoesFeitas`, e `tituloNaLingua` / `rotuloNaLingua` / `descricaoNaLingua`
       imprimem o inglês velho na página do casal e no PDF sem uma palavra.
       Resposta directa à pergunta «que campos traduzíveis ficaram de fora do registo»: são estes
       quatro — `escolhas[].tituloEn`, `escolhas[].notaEn`, `escolhas[].opcoes[].rotuloEn`,
       `escolhas[].opcoes[].descricaoEn`. São TODOS os campos com par inglês que existem fora do
       `CampoDeTexto`.
     Onde: src/lib/proposta-escolhas.ts:170-196 (a contagem); :140-155 (a impressão);
       src/lib/proposal-ortografia.ts:419-421
     Causa provável: `traducoesFeitas` foi chaveado por `chaveDoCampo(campo: CampoDeTexto)` e as
       escolhas têm um inventário próprio, com `caminho` em vez de campo. A chave já é uma string
       (`escolhas:0:titulo`) e serve.
     Correção proposta: dar às escolhas a mesma marca — `confirmarTraducao` a aceitar um
       `CampoPublicado` (ou a chave em texto), e `camposDeEscolhaPorTraduzir` a devolver `estado:
       EstadoDoIngles` como o `camposPorRever` faz.
     Chega ao cliente? sim

[A8-010] [Agente 8] [Proposta bilingue] [Médio] O cronograma e as linhas estimadas não têm inglês nenhum — uma proposta de Organização em inglês sai meio portuguesa, sem aviso
     Reproduzir: proposta de Organização, interruptor bilingue ligado, cronograma preenchido.
       Gerar o PDF em inglês.
     Esperado: ou o cronograma em inglês, ou um aviso de que vai sair em português.
     Observado: sai em português no meio de um documento inglês, e nem o painel «Por traduzir»
       nem a Conferência nem o contador do índice o mencionam — `cronogramaTitulo`,
       `cronogramaItem` e `linhaEstimada` vivem em `OutroCampoPublicado` e nunca passam por
       `temVersaoInglesa`.
     Onde: src/lib/proposal-ortografia.ts:433-435; a lacuna está escrita e assumida em
       src/lib/proposal-doc-bilingue.ts:56-64
     Causa provável: os campos do modelo Organização nasceram depois do inventário bilingue e
       nunca ganharam par inglês no tipo do documento.
     Correção proposta: acrescentar `titleEn`/`itemsEn` ao cronograma e `itemEn` ao `budgetRows`,
       e registá-los no `CampoDeTexto` NA MESMA alteração.
     Chega ao cliente? sim (documentado e assumido, mas continua a sair)

[A8-011] [Agente 8] [Orçamento público] [Grave] «Época alta» tem duas definições que discordam em Maio e Outubro — uma faz o preço, a outra faz a frase
     Reproduzir: node, com as duas implementações lado a lado:
         2027-05-15  pricing: false   workdays: true
         2027-06-15  pricing: true    workdays: true
         2027-10-15  pricing: false   workdays: true
         2027-12-15  pricing: true    workdays: false
     Esperado: uma definição de época alta.
     Observado: `orcamento/pricing.ts` usa `getMonth()` (base 0) com `(m>=5&&m<=8)||m===11` →
       Junho a Setembro, mais Dezembro. `workdays.ts` usa o mês do ISO (base 1) com `m>=5&&m<=10`
       → Maio a Outubro, e o comentário diz «May to October, when Saturdays go first».
       Um casamento em Maio: o formulário NÃO cobra suplemento de época alta e a página de
       confirmação a seguir diz-lhe que é época alta e que «vale a pena não demorar». Um
       casamento em Dezembro: cobra suplemento e a confirmação diz que não é época alta. O valor
       errado fica gravado no `priceBreakdown` do pedido e viaja para o email e para a margem do
       evento.
     Onde: src/lib/orcamento/pricing.ts:10-15 contra src/lib/workdays.ts:44-48
     Causa provável: `getMonth()` base 0 lido como base 1. O `(m>=5&&m<=8)` parece «Maio a
       Agosto» e é «Junho a Setembro».
     Correção proposta: uma função só, com o mês do ISO (sem `Date` nenhum pelo meio), importada
       pelos dois. Nota: `isWeekend` na mesma linha conta Sexta+Sábado (`getDay()===5||6`) — se
       for intencional (e para casamentos parece ser), o nome mente e devia chamar-se
       `ehDiaDePonta`.
     Chega ao cliente? sim

[A8-012] [Agente 8] [Pedidos] [Médio] Apagar um pedido deixa propostas e contratos órfãos, e o comentário que o justifica está desactualizado
     Reproduzir: pedido com proposta enviada e contrato. DELETE do pedido.
     Esperado: ou o que ficar para trás é alcançável, ou é apagado com ele.
     Observado: `proposals.quote_id` tem `on delete set null`, e o `fromRow` transforma o null em
       `quoteId: ""`. A proposta continua na lista de Propostas, continua a contar para a taxa de
       aceitação em `analise-de-propostas.ts`, e não há pedido nenhum onde ela apareça. Os
       `contracts` são pior: `quote_id` e `proposal_id` são `text` SEM chave estrangeira nenhuma
       (schema.sql:709-722), portanto ficam a apontar para linhas que não existem, e o índice
       único `contracts_proposal_id_uk` continua a reservar um `proposal_id` morto.
       O comentário da rota diz «Draft proposals are left too — proposals-store exposes no clean
       delete helper»; `deleteProposal` existe desde então (proposals-store.ts:127) e é usado
       pela rota das propostas.
     Onde: db/schema.sql:28, :709-722; src/app/api/orcamento/[id]/route.ts:612-618 (o comentário)
       e :627
     Causa provável: eliminação escrita quando não havia mais nada pendurado no pedido.
     Correção proposta: decidir e escrever. Ou o DELETE recusa quando há proposta
       enviada/contrato aceite (que é o que os registos fiscais pedem), ou apaga as propostas em
       rascunho e marca as restantes. Actualizar o comentário nos dois casos.
     Chega ao cliente? não

[A8-013] [Agente 8] [Propostas · validade] [Médio] Dois «hoje» diferentes sobre a mesma validade: um é o de Lisboa, o outro é o de Greenwich
     Reproduzir: às 00:30 de Lisboa no Verão (23:30 UTC do dia anterior), pedir a lista de
       Acompanhamento com uma proposta cuja validade acabou ONTEM.
     Esperado: expirada.
     Observado: `diasAte` ancora o «hoje» em `Date.UTC(hoje.getUTCFullYear(), …, 12)` — o dia de
       Greenwich —, devolve 0 em vez de −1, e `estaExpirada` diz que não. Enquanto isso
       `resolveValidUntil`, que CALCULOU essa validade, conta o dia em `Europe/Lisbon`
       (`hojeNoEstudio`, proposal-doc.ts:1344) e tem um comentário de 15 linhas a explicar porquê.
       As duas pontas da mesma validade usam calendários diferentes durante uma hora por dia,
       seis meses por ano.
     Onde: src/lib/orcamento/proposta-estado.ts:30-36
     Causa provável: `proposta-estado.ts` é client-safe e não importou `hojeNoEstudio`, que vive
       num módulo pesado.
     Correção proposta: extrair `hojeNoEstudio`/`FUSO_DO_ESTUDIO` para um módulo client-safe e
       usá-lo aqui. O `Intl.DateTimeFormat` funciona nos dois lados da fronteira.
     Chega ao cliente? não

[A8-014] [Agente 8] [Proposta · página do casal] [Médio] O fim do último dia de validade é o do fuso do processo
     Reproduzir: proposta válida até 2 de Julho. Entre as 00:00 e as 00:59 de Lisboa do dia 3
       (23:00-23:59 UTC do dia 2), abrir o link.
     Esperado: expirada — o dia 2 acabou em Lisboa.
     Observado: `Date.parse("2026-07-02T23:59:59")` sem fuso é lido no fuso do processo (UTC),
       logo a proposta continua «em aberto» durante mais uma hora. É pouco, e é do lado seguro —
       mas é a mesma regra escrita num terceiro calendário, ao lado de duas datas já corrigidas
       na mesma função.
     Onde: src/app/[lang]/(privado)/proposta/[token]/page.tsx:372-377
     Causa provável: o mesmo esquecimento de A8-001.
     Correção proposta: derivar o fim do dia com `Intl.DateTimeFormat` no fuso do estúdio, ou
       comparar `hojeNoEstudio()` com `validUntil` como texto — que é uma comparação de dias de
       calendário e não precisa de instante nenhum.
     Chega ao cliente? sim

[A8-015] [Agente 8] [Biblioteca de fotos] [Grave] `largura` e `altura` são lidas pela página do casal e nunca são escritas por ninguém
     Reproduzir: `grep -rn "largura" src db scripts` a excluir comentários →
       `biblioteca-fotos-store.ts` a mapear a coluna, `formasDeCaminhos` a lê-la,
       `Inspiracao.tsx:338,609` e `Escolhas.tsx:72` a desenharem com ela. Nenhuma rota, nenhuma
       função de escrita, nenhum caminho de upload, nenhum restauro lhe passa um valor.
       `updateFoto` aceita-as no tipo e ninguém as manda.
     Esperado: a célula de cada uma das 46 fotografias nasce com a altura certa, que é o que o
       comentário de `formasDeCaminhos` promete («cada célula nasce com a altura certa e nada se
       mexe»).
     Observado: `formasDeCaminhos` devolve sempre um mapa vazio; todas as células caem na
       proporção por omissão (`ALTURA_POR_OMISSAO`, `"4/3"`), e a página do casal continua a
       saltar por baixo do dedo a cada foto que aterra — exactamente o problema que a coluna foi
       criada para resolver. Uma coluna na base, três leitores e zero escritores.
     Onde: src/lib/biblioteca-fotos-store.ts:41,55,103,217 (só leitura); db/schema.sql:915-916;
       src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx:338,609; .../Escolhas.tsx:72
     Causa provável: as dimensões chegam a ser calculadas no navegador de quem carrega (é o mesmo
       sítio onde o LQIP e a cor nascem), e o par `garantirFoto`+`updateFoto` do upload manda
       `{lqip, cor}` e não as dimensões.
     Correção proposta: mandar `largura`/`altura` a partir do `image-worker` junto com o LQIP e a
       cor, no mesmo `updateFoto` que já existe em temas/[id]/imagens/route.ts:362-363 e
       assets/route.ts:336-337.
     Chega ao cliente? sim

[A8-016] [Agente 8] [Fusos] [Menor] `Europe/Lisbon` está escrito à mão em seis sítios, e um deles é o canónico
     Reproduzir: `grep -rn "Europe/Lisbon" src`
     Esperado: uma constante.
     Observado: seis — `FUSO_DO_ESTUDIO` (proposal-doc.ts:1303, o canónico, com o comentário que
       explica a regra), e cinco `FUSO` locais em proposal-pdf.ts:30, contract-pdf.ts:78,
       ads/conversoes-offline.ts:49, api/cron/reminders/route.ts:44 e
       admin/EntradaComFotografia.tsx:165. Nenhum importa outro. É o terreno onde A8-001 nasceu:
       quem escreve a sexta cópia não vê que já existe a regra.
     Onde: os seis acima
     Causa provável: `proposal-doc.ts` é grande e server-heavy; importar dele para uma componente
       cliente não apetece.
     Correção proposta: um `src/lib/fuso.ts` client-safe com a constante e o `hojeNoEstudio`; os
       seis passam a importar. Fecha também A8-013.
     Chega ao cliente? não (mas é a causa-raiz de A8-001 e A8-013)

[A8-017] [Agente 8] [Confirmação do pedido] [Menor] «faltam N dias» conta o hoje no fuso do processo
     Reproduzir: às 00:30 de Lisboa no Verão, abrir a página de confirmação de um pedido com data
       de evento.
     Esperado: os dias contados a partir do dia que Portugal está a viver.
     Observado: `daysUntil` usa `from.getFullYear()/getMonth()/getDate()`, que no alojamento (UTC)
       é o dia anterior — um dia a mais durante essa hora. O `longDate` mesmo por cima já leva
       `timeZone: "UTC"` e uma âncora `Date.UTC`, portanto acerta.
     Onde: src/lib/workdays.ts:29-36
     Causa provável: o mesmo esquecimento; `daysUntil` recebe o `Date` de fora e nunca lhe é dito
       em que calendário o deve ler.
     Correção proposta: derivar o dia com `hojeNoEstudio(from)` e comparar dois `yyyy-mm-dd`, como
       `somarDias` já faz.
     Chega ao cliente? sim (frase na página de confirmação)

[A8-018] [Agente 8] [Estúdio · fotos repetidas] [Menor] `new Date("yyyy-mm-dd")` cru na marca «Já usada»
     Reproduzir: foto já usada num casamento de 2026-09-12, visto num navegador com fuso a oeste
       de Greenwich.
     Esperado: «Ana e Rui, 12 set 2026».
     Observado: «11 set 2026» — `new Date("2026-09-12")` é meia-noite UTC e o
       `toLocaleDateString` sem fuso desenha-a no fuso do navegador. Em Lisboa (UTC+0/+1) acerta
       sempre, por isso é menor; mas é o único sítio do ficheiro onde a âncora de meio-dia que o
       resto do código usa não está.
     Onde: src/lib/orcamento/fotos-repetidas.ts:91
     Causa provável: `q?.date` é `yyyy-mm-dd` e foi tratado como um instante.
     Correção proposta: `new Date(`${data}T12:00:00`)`, como os outros ~25 sítios do back office
       já fazem.
     Chega ao cliente? não

[A8-019] [Agente 8] [Pedidos] [Médio] não confirmado — Um pedido sem `submissionId` cria um lead duplicado sem segunda barreira
     Reproduzir (não executado): submeter o mesmo pedido de dois separadores, ou de dois
       dispositivos, ou com o `submissionId` a falhar a validação `/^[A-Za-z0-9_-]{8,64}$/`.
     Esperado: o segundo é reconhecido, ou pelo menos assinalado.
     Observado: `id = submissionId ? quoteIdFor(submissionId) : generateQuoteId()` e a verificação
       de existência só corre `if (submissionId)`. Sem ele nasce um pedido novo, com email de
       confirmação e tudo, e os dois aparecem no Kanban como dois casais. Não há nenhuma segunda
       rede (mesmo email + mesma data de evento numa janela curta). A rota assume-o de propósito
       — «a duplicate is far better than a dropped enquiry» —, o que é a decisão certa para não
       perder o lead, mas deixa o back office a limpar à mão.
     Onde: src/app/api/orcamento/route.ts:800-814
     Causa provável: decisão deliberada, sem o outro lado (detectar depois).
     Correção proposta: não mudar a criação. Marcar: no PATCH/listagem, assinalar pedidos com o
       mesmo email e a mesma `date` submetidos com menos de uma hora de diferença.
     Chega ao cliente? não

[A8-020] [Agente 8] [Temas] [Menor] não confirmado — A contagem de fotos de cada cartão é uma cache de processo
     Reproduzir (não executado, precisa de duas instâncias em produção): carregar fotos num tema;
       abrir a lista de temas até 60 s depois, com sorte noutra instância.
     Esperado: o cartão diz quantas fotos o tema tem.
     Observado: `invalidateThemeCount` limpa a cache DA INSTÂNCIA que escreveu; a outra continua a
       servir o número velho até o TTL de 60 s expirar. É um compromisso documentado
       (theme-storage.ts:717-722) e o custo é pequeno, mas o efeito é o de sempre: um número que
       às vezes está errado deixa de ser lido.
     Onde: src/lib/theme-storage.ts:717-765
     Causa provável: cache em memória num ambiente sem memória partilhada.
     Correção proposta: nenhuma urgente. Se incomodar, a contagem já podia vir de
       `biblioteca_fotos` (`select count(*) where pasta = …`, que tem índice) — que é precisamente
       a razão nº 2 pela qual essa tabela existe, escrita no cabeçalho do store e nunca usada para
       isso. Depende de A8-004.
     Chega ao cliente? não

---

## Resumo

| Severidade | IDs |
|---|---|
| Crítico | A8-001 |
| Grave | A8-002, A8-003, A8-004, A8-005, A8-006, A8-007, A8-009, A8-011, A8-015 |
| Médio | A8-008, A8-010, A8-012, A8-013, A8-014, A8-019 |
| Menor | A8-016, A8-017, A8-018, A8-020 |

**Chegam ao cliente:** A8-001, A8-009, A8-010, A8-011, A8-014, A8-015, A8-017.
**Não confirmados:** A8-019, A8-020.

**As duas confirmações pedidas, em duas linhas:**
`proposal-progress.ts` tem uma só contagem (`oQueTemODocumento`, linha 66) e as duas listas
leem-na — mas sobraram três contadores por sua conta: `api/propostas/route.ts:44-46` (A8-007,
com o defeito do `budgetRows` incluído), `ProposalStudio.tsx:2815-2822` (A8-008) e, como
consequência, a estimativa de páginas do PDF.
`proposal-doc-bilingue.ts` regista `traducoesFeitas` (linha 396) e `estadoDoIngles` (linha 376)
para os 15 tipos de `CampoDeTexto` — ficaram de fora os quatro campos ingleses das alternativas
(A8-009, chega ao casal) e, sem inglês nenhum, o cronograma e as linhas estimadas (A8-010).
