# Agente 5 — Ficheiros e imagens

**Resumo.** A defesa contra imagens partidas está bem construída mas **não cobre todos os
sítios onde uma foto é desenhada**: a capa e o fecho da página do casal — as duas maiores
imagens do documento — desenham `<img>` cru, sem `onError` e sem cascata, logo continuam a
mostrar barra cinzenta; e nos Temas a capa apagada nunca cai para a alternativa porque o
teste é sobre a **assinatura** e não sobre o ficheiro, que é exactamente a raiz já
diagnosticada a repetir-se num sítio novo. O EXIF está bem tratado (`.rotate()` em todos os
caminhos do `sharp` que importam) com uma só fenda de atalho. Achado colateral e grande: as
colunas `largura`/`altura` da `biblioteca_fotos` **nunca são escritas por ninguém**, o que
mata em silêncio o `aspect-ratio` da grelha do casal e metade da verificação pré-envio.

---

[A5-001] [Agente 5] [Página do casal] [Crítico] A capa e o fecho não colapsam — a defesa do silêncio não chega às duas maiores imagens
     Reproduzir: numa proposta com coverImages, apagar (ou nunca gerar) o objecto
       correspondente no bucket `proposal-thumbs`; abrir /pt/proposta/<token> numa
       janela com menos de 1024 px de largura e DPR 1 (o navegador escolhe o
       candidato de 400w, que é a miniatura). Alternativa equivalente: uma capa
       vinda de `tema:` com o URL assinado já caducado (6 h).
     Esperado: a célula desaparece em silêncio, como acontece na grelha
       (`Celula` → `if (desistiu || !alvo) return null`), e o botão «Voltar a
       carregar as fotografias» aparece no pé.
     Observado: fica o ícone de imagem partida do navegador, com a largura toda
       do documento, por cima do título branco do momento — e o botão do pé nunca
       aparece, porque nada chama `aoDesistir`.
     Onde: src/app/[lang]/(privado)/proposta/[token]/Documento.tsx:636 (capa) e
       src/app/[lang]/(privado)/proposta/[token]/Documento.tsx:1109 (fecho)
     Causa provável: os dois `<img>` foram escritos à mão em vez de reutilizarem
       a `Celula` do `Inspiracao.tsx`. Não têm `onError`, não usam
       `useFotoComPlanoB`, e o `src` é `capa.miniatura ?? capa.original` — sem
       plano B, uma miniatura em falta não cai sequer para o original (que é
       precisamente o degrau que o `useFotoComPlanoB` documenta existir).
     Correção proposta: passar as duas por `useFotoComPlanoB(miniatura, original)`,
       devolver `null` em `desistiu` e propagar `aoDesistir` para o `houveFalha`
       do `Inspiracao` (ou subir o estado para a página). O `srcSet` mantém-se
       como está — o candidato de 1200w já é servido pela rota, que responde
       sempre alguma coisa.
     Chega ao cliente? sim — é a primeira e a última coisa que o casal vê.

[A5-002] [Agente 5] [Temas] [Grave] A capa apagada nunca cai para a foto mais recente — assinar continua a passar por existir
     Reproduzir: escolher uma foto como capa de um tema (grava `coverPath`);
       apagar essa foto do bucket `theme-assets` por fora (ou por um caminho que
       não passe pelo ecrã); recarregar a Biblioteca de Temas.
     Esperado: o cartão mostra a foto mais recente da pasta — está escrito no
       cabeçalho da própria rota: «se a escolhida já tiver sido apagada e não
       puder ser assinada, a foto mais recente».
     Observado: o cartão fica com a imagem partida. `newest[i]` nunca é usado.
     Onde: src/app/api/temas/route.ts:389 —
       `const capa = paraCapa(chosen[i]) ? chosen[i] : newest[i];`
     Causa provável: **a mesma raiz de sempre, num sítio novo.** `paraCapa` é
       `thumbs.get(p) ?? urls.get(p)`, e um caminho entra nesse mapa por ter sido
       ASSINADO — não por o objecto existir. É a causa nº 6 do
       `diagnostico-de-fotos.ts` («assinar NÃO verifica que o objecto existe»)
       aplicada a um teto de truthiness. A condição do código não é «a capa
       existe?», é «a capa é assinável?», e essa é sempre verdadeira. Repare-se
       que `newest[i]` VEM DA LISTAGEM da pasta, portanto é o único caminho deste
       ficheiro que se sabe existir — e é o que nunca é escolhido.
     Correção proposta: `chosen[i]` só é candidato se estiver na listagem —
       `listings[i].names.includes(nomeDe(chosen[i]))`. Os nomes já estão em
       memória (foram usados para calcular `newest` e `extras`): custa zero idas
       ao Storage e resolve na fonte em vez de no navegador.
     Chega ao cliente? não — é o ecrã dela; mas é a queixa dela («os Temas
       continuam partidos») e é a mesma classe de defeito que chegou ao casal.

[A5-003] [Agente 5] [Temas] [Grave] Quando o plano B também falha, a célula não desiste — fica a imagem partida
     Reproduzir: um tema cuja capa não exista em nenhum dos três buckets
       (o caso do A5-002, ou uma pasta arrumada à mão). O `ImagemComPlanoB`
       tenta a miniatura, cai para o original, e o original também dá 404.
     Esperado: o mesmo contrato da página do casal — a imagem desaparece e fica o
       fundo da moldura 4:3 (que já existe e já é `bg-foreground/[0.04]`), ou o
       `FolderIcon` que o ramo sem capa já desenha.
     Observado: fica um `<img>` com `src` morto. O comentário do próprio ficheiro
       promete «fica o fundo» — mas não há estado de desistência nenhum, e o que
       fica é o glifo de imagem partida do navegador por cima do fundo.
     Onde: src/app/[lang]/(site)/orcamento/admin/ImagemComPlanoB.tsx:53-57
       (`onError` só troca para o plano B; nunca marca «acabou»)
     Causa provável: o componente foi escrito antes do `useFotoComPlanoB` sair da
       pasta do estúdio e ficou com uma cascata de dois degraus sem o terceiro
       estado. Hoje há uma rede partilhada — e este ecrã não a usa.
     Correção proposta: `const [morreu, setMorreu] = useState(false)` no segundo
       `onError`, e `if (morreu) return null`. Melhor ainda: substituir por
       `useFotoComPlanoB`, que já traz a segunda volta ao fim de 2 s e o ouvinte
       do `online` — os dois casos que mais acontecem no telemóvel dela.
     Chega ao cliente? não

[A5-004] [Agente 5] [Fotos / Página do casal] [Grave] `largura` e `altura` estão na tabela, no tipo e na consulta — e ninguém as escreve
     Reproduzir: carregar uma foto pela Biblioteca (`POST /api/temas/[id]/imagens`)
       ou pelo estúdio (`POST /api/orcamento/[id]/assets`); consultar a linha em
       `biblioteca_fotos`. `largura` e `altura` ficam a `null`. Abrir depois a
       página do casal: nenhuma célula tem `aspect-ratio`.
     Esperado: as duas colunas preenchidas no carregamento — o browser já
       descodificou a imagem uma vez para fazer a miniatura, o LQIP e a cor
       (`prepareInWorker`), e as dimensões estão ali de borla, como o LQIP e a cor
       que viajam pelo mesmo campo.
     Observado: o único `updateFoto` de cada rota manda `{ lqip }` e/ou `{ cor }`
       e mais nada. `formasDeCaminhos` devolve SEMPRE um mapa vazio. Quatro
       consequências, todas silenciosas:
       · a página do casal desenha 46 células sem `aspect-ratio` — é exactamente
         o salto de **10 833 px** que o cabeçalho do `Inspiracao.tsx` documenta
         como sendo o comportamento «sem a forma guardada». Não é o caso
         degradado: é o único caso que existe em produção;
       · `arrumarPorColunas` usa `ALTURA_POR_OMISSAO` (2/3) para tudo, portanto as
         colunas nunca equilibram — a queixa dela («há buracos visíveis onde uma
         coluna acaba antes da outra, notório na Decoração Jantar») continua de pé
         apesar do empacotamento guloso ter sido escrito para a resolver;
       · a capa e o fecho caem no `aspectRatio: "3 / 2"` fixo, logo uma capa ao
         alto é recortada como se fosse deitada;
       · **as «suspeitas» da verificação pré-envio nunca disparam**:
         `proposta-fotos-verificacao.ts:249` pede `formasDeCaminhos`, recebe vazio,
         e o `if (!forma) continue` salta todas. «Medida de partilha» (Pinterest) e
         «pequena demais» são código morto — e é meia verificação a responder
         «está tudo bem» com a mesma cara de uma proposta impecável.
     Onde: src/app/api/temas/[id]/imagens/route.ts:358-363 e
       src/app/api/orcamento/[id]/assets/route.ts:333-337 (só `lqip`/`cor`);
       src/lib/biblioteca-fotos-store.ts:203-225 (`formasDeCaminhos`, sem dados);
       src/lib/proposta-fotos-verificacao.ts:249-267 (as suspeitas que não correm);
       db/schema.sql:917-918 (as colunas, vazias).
     Causa provável: as colunas nasceram com o esquema e o produtor nunca foi
       ligado. Nada falha, nada avisa: o consumidor trata «não sei a forma» como
       um caso legítimo (e trata-o bem), portanto o buraco é invisível.
     Correção proposta: mandar as dimensões no mesmo `FormData` em que já viajam
       `thumbs` e `cores` (o `prepareInWorker` tem `bitmap.width/height` na mão,
       já com a orientação aplicada pelo `createImageBitmap`), e acrescentá-las ao
       `dados` do `garantirFoto`/`updateFoto`. Para as fotos que já lá estão, um
       script de recuperação a ler o cabeçalho com `sharp` — mesmo desenho do
       `scripts/migrar-lqip.mjs`, e cuidado em aplicar a mesma troca de eixos que
       o `dimensoesReais` faz para orientação ≥ 5.
     Chega ao cliente? sim — a página dele salta dez mil pixéis por baixo do dedo
       e as colunas ficam desalinhadas.

[A5-005] [Agente 5] [Email] [Grave] O PDF é anexado sem alguém lhe medir os bytes — o aviso dos 8 MB é uma estimativa que fica no estúdio
     Reproduzir: gerar uma proposta cujo PDF real dê 8,5 MB (as ~46 fotos já lá
       chegam) e enviá-la. O aviso do estúdio pode nem ter aparecido: ele corre
       sobre `tamanhoEstimado(fotos, amostras)`, uma recta ajustada às gerações
       anteriores DAQUELE computador, não sobre o ficheiro que vai seguir.
     Esperado: antes do `sendMail`, comparar `pdfBuffer.byteLength` com
       `LIMITE_DE_ANEXO` e, acima dele, não anexar — enviar só o link, e dizer-lho
       na resposta. É o que o próprio texto do aviso já promete ao utilizador:
       «o link da proposta continua a servir na mesma, com o PDF inteiro do outro
       lado».
     Observado: `attachments: [...email.attachments, { content: pdfBuffer }]`, sem
       uma única comparação. O `byteLength` chega a ser lido — mas só depois, para
       o registo do envio. Um SMTP que recuse cai no `catch` genérico e a UI diz
       «A proposta foi guardada, mas o email ao cliente falhou», sem dizer que o
       motivo foi o tamanho e sem dizer o que fazer.
     Onde: src/app/api/orcamento/[id]/proposta-doc/route.ts:1037-1051 (e o
       registo em :1120 que mede os bytes tarde de mais);
       src/app/api/orcamento/[id]/proposta/route.ts:431-437 (a rota irmã, igual);
       src/lib/custo-do-pdf.ts:161 (`passaDoAnexo`, cujo único chamador é
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:9867).
     Causa provável: `passaDoAnexo` foi desenhado como aviso de ecrã e nunca desceu
       ao servidor, onde estão os bytes verdadeiros. O ficheiro `email-limites.ts`
       existe precisamente para partilhar tectos entre os dois lados da fronteira —
       e este tecto ficou de fora dele.
     Correção proposta: no servidor, antes de montar `attachments`,
       `if (passaDoAnexo(pdfBuffer.byteLength))` → enviar sem anexo, acrescentar
       uma linha ao corpo a dizer que a proposta se vê no link, e devolver o facto
       na resposta para ela ver que foi isso que aconteceu. Silenciar o anexo é
       melhor do que um email que não chega — mas silenciá-lo sem o dizer, não.
     Chega ao cliente? sim, pela pior via: não chega nada.

[A5-006] [Agente 5] [Biblioteca] [Médio] `deleteFoto` está exportado e nunca é chamado — a base de dados guarda fotos que já não existem
     Reproduzir: apagar uma foto de um tema (o ficheiro sai do bucket, e o
       `materializarAntesDeApagar` faz o seu trabalho nas propostas). Consultar
       `biblioteca_fotos`: a linha continua lá, com o LQIP, a cor e as etiquetas.
     Esperado: o `deleteFoto` que existe para isto ser chamado no mesmo passo —
       tem inclusive o comentário «chamada quando a FOTO sai do bucket».
     Observado: `grep` sobre o repositório dá UM resultado: a própria definição.
       As linhas fantasma acumulam-se. Não partem nada hoje (a pasta é a fonte de
       verdade, e a página do casal colapsa a célula antes de desenhar o LQIP),
       mas inflacionam a contagem de cada cartão — que é a segunda razão declarada
       para a tabela existir — e ressuscitam se um ficheiro novo calhar no mesmo
       caminho.
     Onde: src/lib/biblioteca-fotos-store.ts:229 (sem chamadores);
       src/lib/theme-materializar.ts e src/lib/theme-storage.ts (`deleteThemeImage`,
       `deleteThemeFolder` — os dois sítios onde devia ser chamado).
     Causa provável: a tabela nasceu depois do caminho de eliminação, e o lado do
       apagar nunca foi ligado.
     Correção proposta: chamar `deleteFoto(path)` a seguir a cada
       `deleteThemeImage` bem sucedido, em melhor esforço (falhar aqui não pode
       desfazer uma eliminação que já aconteceu no Storage). As etiquetas vão
       atrás por `on delete cascade`, que já está no esquema.
     Chega ao cliente? não

[A5-007] [Agente 5] [PDF / EXIF] [Médio] O atalho «já está do tamanho certo» salta o `.rotate()` — não confirmado
     Reproduzir: não reproduzido. Exige uma foto com orientação EXIF ≠ 1 cujas
       dimensões DEPOIS da rotação batam exactamente com a caixa pedida (617×1323
       na tira de capa) e que seja JPEG baseline.
     Esperado: nenhuma imagem chega ao `pdf-lib` sem ter passado pelo
       `.rotate()` — é a regra escrita no `drawCoverImage` («o `pdf-lib` lê o
       tamanho no marcador SOF e não faz ideia do que seja a orientação EXIF»).
     Observado: `resizeToBox` tem um retorno antecipado que devolve os bytes CRUS,
       sem o `sharp` correr — e portanto sem `.rotate()`. Se esses bytes trouxerem
       uma etiqueta de orientação, a foto sai deitada na página e recortada contra
       o eixo errado, que é a definição de «desconfigurada».
     Onde: src/lib/proposal-image.ts:346 —
       `if (origem.w === width && origem.h === height && ehJpegBaseline(bytes)) return bytes;`
     Causa provável: o atalho é defendido pelo argumento «os bytes já vêm de cá»
       (foram escritos pela `derivadaDaCapa`, que passa pelo `resizeToBox` e por
       isso não tem EXIF). O argumento é bom e a função é pública: nada impede
       outro chamador de lhe passar um original.
     Correção proposta: acrescentar a orientação à condição —
       `&& ((await sharp(bytes).metadata()).orientation ?? 1) === 1`. O
       `dimensoesReais`, três linhas acima, já lê a `metadata()` e já sabe a
       orientação: basta devolvê-la em vez de a deitar fora.
     Chega ao cliente? sim, se acontecer — uma foto deitada num PDF de vinte mil
       euros. Baixa probabilidade, correcção de uma linha.

[A5-008] [Agente 5] [Upload] [Médio] A confirmação lê 256 KB e conclui sobre o ficheiro inteiro — não confirmado
     Reproduzir: não reproduzido (exigiria forçar o Storage a guardar um objecto
       truncado). Um JPEG cortado a meio mantém SOI e SOF nos primeiros KB.
     Esperado: um ficheiro incompleto é recusado na confirmação e apagado, como já
       acontece com os ilegíveis e as bombas de descompressão.
     Observado: `avaliarCabecalho` só pergunta «tem dimensões? são sãs?». Um
       ficheiro truncado responde que sim às duas, entra na proposta, e só se vê
       quando o navegador do casal pinta meia fotografia e meia barra cinzenta —
       ou quando o `sharp` cai para a tentativa `failOn: "none"` na geração do PDF
       (que o aceita de propósito, e bem).
     Onde: src/lib/proposal-storage.ts:319-330 (`avaliarCabecalho`) e
       src/lib/proposal-storage.ts:384-402 (o lote que a alimenta).
     Causa provável: o desenho é deliberado e a razão está escrita — descarregar
       cada foto inteira para a confirmar custaria dezenas de MB e estouraria o
       tempo-limite. A defesa foi dimensionada para bombas de descompressão, não
       para truncagem.
     Correção proposta: não descarregar mais nada. Comparar o `Content-Length` que
       a listagem do Storage já devolve com o tamanho que o cliente declarou ao
       pedir o bilhete — é uma subtracção, e apanha exactamente o caso do upload
       interrompido sem uma ida a mais ao Storage.
     Chega ao cliente? sim, se acontecer.

[A5-009] [Agente 5] [Temas] [Menor] A grelha de fotos de um tema tem o mesmo terceiro degrau em falta
     Reproduzir: numa pasta de tema, uma foto cujo original desapareça entre a
       listagem e o desenho (janela curta, mas existe: a listagem é de um pedido
       anterior quando o ETag devolve 304).
     Esperado: a célula desiste e desaparece, como na página do casal.
     Observado: o `onError` da `Photo` liberta a vez na fila e mais nada — o
       `lightBroken` só existe para o degrau barato→pesado. Falhando o pesado,
       fica a célula partida.
     Onde: src/app/[lang]/(site)/orcamento/admin/Temas.tsx:1575-1578
     Causa provável: mesmo padrão do A5-003 — a cascata tem dois degraus e não tem
       estado final.
     Correção proposta: um `desistiu` quando `heavy` falha, e devolver o fundo com
       o LQIP (que já está pintado como `background-image` da caixa, portanto o
       resultado é uma célula desfocada em vez de um ícone partido).
     Chega ao cliente? não

[A5-010] [Agente 5] [Storage] [Menor] `signThemePaths` ignora o erro por caminho que o Supabase devolve
     Reproduzir: assinar em lote um conjunto onde um caminho não exista.
     Esperado: um caminho com erro não entra no mapa — e quem chama pode
       distinguir «não assinou» de «não existe».
     Observado: `for (const s of data) if (s.path && s.signedUrl) urls.set(...)`.
       O campo `s.error` de cada item nunca é lido nem registado. Hoje o efeito é
       inofensivo (sem `signedUrl` não entra), mas é a última hipótese que o
       servidor tem de saber que um ficheiro não está lá antes de o navegador do
       casal descobrir — e está a ser deitada fora sem uma linha de registo.
     Onde: src/lib/theme-storage.ts:975
     Causa provável: a leitura em lote foi escrita a olhar só para o caminho feliz.
     Correção proposta: registar os itens com `s.error` (`log.warn`, com a
       contagem e não com os caminhos) e, sobretudo, usar essa informação no
       A5-002 em vez do teste de truthiness.
     Chega ao cliente? não

---

## O que está bem defendido, com o nome do mecanismo

- **Orientação EXIF.** Está tratada, e bem, em todos os caminhos que produzem pixéis:
  `derivadas.ts:273` (lote), `:387` (miniatura a pedido), `:473` (intermédia a pedido),
  `proposal-image.ts:353` (`resizeToBox`), `:441` (`transcodificarParaJpeg`),
  `api/temas/[id]/miniaturas/route.ts:187`. Duas defesas de segunda linha que merecem ser
  ditas pelo nome: `dimensoesReais` (`proposal-image.ts:231`) troca os eixos quando
  `orientation >= 5`, e o `cobre` do `proposal-doc-render.ts:69` faz a mesma troca antes de
  decidir se uma miniatura chega para a caixa — é o cuidado que impede uma foto deitada de
  ser rejeitada pela razão errada. O caminho de recurso do PDF (`proposal-doc-pdf.ts:540`)
  passa pelo `sharp` **nem que seja só para rodar**, o que é a decisão certa. A única fenda
  é o A5-007.
- **Nomes de ficheiro.** Nada guarda o nome que o utilizador carregou: o Storage recebe
  `randomUUID()` ou o resumo de 32 hex (`theme-storage.ts:373` e `:494`,
  `proposal-storage.ts:452`), e `isThemePath`/`isProposalPath` recusam tudo o que não seja
  `[a-zA-Z0-9_-]`. Do lado de fora, o `paraNomeDeFicheiro` (`email-proposta-textos.ts:91`)
  trata NFD, `ø`, `æ`, `ß` e `&` antes de o nome viajar num `Content-Disposition`. Não foi
  encontrado aqui um único caractere problemático por onde entrar.
- **Fotos apagadas da biblioteca em propostas antigas.** O `materializarAntesDeApagar`
  (`theme-materializar.ts`) copia antes de apagar e **recusa a eliminação** se não conseguir
  garantir que ninguém fica a perder. O `refsDeTemaNoDoc` faz uma varredura recursiva do
  documento inteiro em vez de conhecer os campos — a decisão certa, e a que impediu este
  mecanismo de ficar desactualizado quando as `escolhas` foram acrescentadas.
- **Fotos por copiar.** Os marcadores `pending:` são apanhados em três sítios independentes:
  `countPendingImages`, `stripPendingImages` e o motivo `por-copiar` da verificação
  pré-envio. Uma promessa nunca é assinada como se fosse um ficheiro.
- **A verificação pré-envio cobre o documento todo.** Confirmado campo a campo: o
  `ProposalDoc` tem exactamente três sítios onde cabe uma fotografia (`coverImages`,
  `moodBoards[].images`, `escolhas[].opcoes[].imagem`) e o `inventarioComSitio` visita os
  três, com os mesmos `id` do `inventarioDeFotos` — que é o que faz o relatório e o ecrã
  falarem da mesma foto. **Onde ela falha é depois**: pela metade das suspeitas (A5-004) e
  por não ser aplicada às duas imagens que o `Documento.tsx` desenha à mão (A5-001). Os
  Temas continuarem partidos não é uma falha desta verificação: é o A5-002, num ecrã que ela
  nunca teve por missão cobrir.
- **A rota `api/proposta/[token]/foto/[id]`.** É a resposta certa ao problema do `srcset`:
  um endereço assinado que dá 404 não cai para o candidato seguinte, dá imagem partida — por
  isso a rota **responde sempre alguma coisa**, a derivada ou o original. Merece ser copiada
  para os Temas.
- **`useFotoComPlanoB`.** Segunda volta ao fim de 2 s, ouvinte do evento `online`, e um
  `url` novo a zerar as tentativas — a regra «gravar uma falha como se fosse um facto» está
  identificada e resolvida. O problema é só quem ainda não a usa (A5-001, A5-003, A5-009).
