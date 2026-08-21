# Agente 6 — Fluxos completos

Percorridos os seis percursos ponto a ponto, do formulário público até ao que o casal lê no
ecrã. O selo de versão está **certo campo a campo** — nenhum campo excluído do selo é desenhado
na página —, mas o estado que ele calcula (`por-aceitar`/`em-vigor`/`revista`) **não é lido por
ninguém**: o aviso que justifica o ficheiro inteiro nunca chega ao casal. A segunda fuga grande
é silenciosa e atravessa dois percursos: as colunas `largura`/`altura` das fotografias nunca
são escritas por caminho nenhum, portanto a página do casal desenha-se sem forma conhecida e a
verificação «esta foto vai sair mole» nunca dispara. Apagar uma proposta não tem guardas: mata o
link que o casal tem no email e desfaz o congelamento do aceite.

| # | Percurso | Estado |
|---|---|---|
| 1 | Pedido público → Pedidos → proposta → PDF → email → página | com fuga |
| 2 | Foto na biblioteca → mood board → PDF → página | com fuga |
| 3 | Proposta enviada → editada → reenviada | **partido** |
| 4 | Trocar de cliente a meio de uma proposta | com fuga |
| 5 | Mudar o idioma para EN a meio | com fuga |
| 6 | Criar, duplicar e apagar uma proposta | **partido** |

## O que os testes de ponta a ponta já prendem — e o que não

Lidos primeiro: `e2e/orcamento.spec.ts`, `e2e/fazer-proposta-cliente.spec.ts`,
`e2e/proposta-fluxos.spec.ts`, `e2e/proposta.spec.ts`, `e2e/proposta-rascunho.spec.ts`,
`e2e/moodboards-arrasto.spec.ts`, `e2e/i18n.spec.ts`.

Cobrem: submeter o pedido público e chegar à confirmação com referência; a coluna do que falta
no estúdio; «criar a partir de outra» traz o trabalho e não traz o casal anterior; escolher
cliente abre o estúdio e o botão «Trocar de cliente» volta ao passo 1; o rascunho segue para
outro dispositivo; arrastar fotos dentro de um board; e, na página do casal, exactamente dois
casos — token inválido e `noindex` (`e2e/proposta.spec.ts`, 22 linhas).

**Não cobrem** (é onde estão quase todos os achados abaixo): nenhum teste ponta a ponta abre a
página de uma proposta REAL; nenhum reenvia uma proposta editada para ver o que o casal passa a
ler; nenhum apaga uma proposta; nenhum duplica uma proposta com alternativas; nenhum muda o
idioma para EN e verifica o que sai; nenhum verifica que as fotografias chegam ao ecrã do casal
com forma, miniatura e ordem. **O ecrã mais caro do produto tem 22 linhas de e2e.**

---

## Percurso 1 — Pedido público → Pedidos → proposta → PDF → email → página

**O que sobrevive íntegro:** nomes do casal (com a distinção certa entre `quote.name` e
`partnerA/partnerB`), tipo de evento, data por extenso, local, convidados, tipo de cerimónia, e
os `decorPoints` — que semeiam os serviços E as linhas de orçamento
(`ProposalStudio.tsx:394-414`). O dinheiro entra pelo `totalAmountParaBase` respeitando o modo
de IVA. No envio, `subtotal/vat/total` da linha derivam do documento
(`proposta-doc/route.ts:454, 501-504`), portanto a linha e a folha nunca discordam. O email
segue na língua da proposta, com o PDF em anexo e o link para a MESMA proposta que acabou de ser
gravada. A página redesenha o PDF a partir do mesmo `doc` e na mesma língua.

[A6-001] [Agente 6] [Fazer proposta] [Menor] A mensagem do casal fica em Pedidos e não entra no ecrã onde a proposta se escreve
     Reproduzir: preencher o pedido público com texto em «Notas» → back office → Pedidos: a
       mensagem aparece (AdminClient.tsx:5029-5033) → sidebar → «Fazer proposta» → escolher o
       mesmo cliente.
     Esperado: o ecrã que existe «para um trabalho só» mostra o que o casal pediu — é o que a
       proposta tem de responder.
     Observado: o cartão do passo 2 só mostra o nome (FazerProposta.tsx:213-236) e o estúdio
       nunca lê `quote.notes` (zero ocorrências em ProposalStudio.tsx). Para reler o pedido é
       preciso sair do ecrã e ir a Pedidos.
     Onde: src/app/[lang]/(site)/orcamento/admin/FazerProposta.tsx:220-236;
       ProposalStudio.tsx:250-289
     Causa provável: o `initialDoc` semeia os campos ESTRUTURADOS do pedido; o texto livre não
       tem campo no documento e por isso não foi trazido para lado nenhum.
     Correção proposta: mostrar `quote.notes` (e `spaceType`) no cartão «Proposta para»,
       dobrado, ao lado do nome — leitura, nunca semente.
     Chega ao cliente? não (mas é a causa de propostas que não respondem ao que foi pedido)

---

## Percurso 2 — Foto na biblioteca → mood board → PDF → página

**O que sobrevive íntegro:** a ordem (uma só função para o estúdio, o gerador e a página —
`proposal-ordem.ts:185`); a marca de foto principal, reindexada em TODAS as operações do estúdio
e reencontrada pelo id e não pela posição na página (`Documento.tsx:397-399`) — o defeito de
índices que apontavam para a foto errada depois de a lista encolher está fechado nos três
sítios; a identidade opaca das fotos (`proposta-fotos.ts:116-138`); e a verificação de ficheiros
em falta ANTES do envio.

[A6-002] [Agente 6] [Fotografias] [Grave] `largura`/`altura` nunca são gravadas: a página do casal desenha-se sem saber a forma de uma única fotografia
     Reproduzir: carregar uma foto na Biblioteca de Temas OU no estúdio → pô-la num mood board →
       enviar → abrir a página do casal → inspeccionar a célula: não tem `aspect-ratio`.
       Confirmação directa: `grep -rn "updateFoto(" src` devolve três chamadas, e nenhuma escreve
       `largura`/`altura`.
     Esperado: cada célula nasce com a altura certa. O cabeçalho da `Inspiracao.tsx` mede o custo
       de não o fazer: «com a forma guardada o "Orçamento" fica onde estava — 0 px; sem a forma
       guardada desce 10 833 px».
     Observado: as colunas existem na base (db/schema.sql:917-918), `formasDeCaminhos` lê-as,
       `proposta-fotos.ts:191` mapeia-as e a `Celula` depende delas — mas ninguém as escreve. A
       biblioteca grava `{lqip, cor}` (temas/[id]/imagens/route.ts:361-363) e o estúdio grava
       `{cor}` (assets/route.ts:336-337). Resultado, hoje, para TODAS as fotos: `proporcao ===
       undefined` (Inspiracao.tsx:609), o equilíbrio das colunas feito com a altura de reserva de
       2/3 para todas, e a capa e o fecho a caírem no 3/2 de reserva. Dez mil pixéis a fugir por
       baixo de quem está a ler uma condição.
     Onde: src/lib/biblioteca-fotos-store.ts:101-104 e 203-225;
       src/app/api/orcamento/[id]/assets/route.ts:336-337;
       src/app/api/temas/[id]/imagens/route.ts:358-367
     Causa provável: o `sharp` já tem os metadados em mão nos dois caminhos de upload; as
       dimensões simplesmente nunca foram acrescentadas ao objecto passado ao `updateFoto`.
     Correção proposta: nos dois uploads, juntar `largura: meta.width, altura: meta.height` ao
       `dados`/`patch` do `garantirFoto`+`updateFoto`; e um varrimento único para as fotos já
       guardadas. Um teste que prenda o par (upload → linha com forma) fecha-o.
     Chega ao cliente? sim

[A6-003] [Agente 6] [Fotografias] [Médio] As fotografias carregadas no estúdio não guardam LQIP — só as da Biblioteca é que o têm
     Reproduzir: carregar uma foto pelo estúdio (não pela Biblioteca), pô-la num board, abrir a
       página do casal com a rede lenta.
     Esperado: «a célula nunca é um rectângulo vazio, nem sequer no primeiro fotograma»
       (Inspiracao.tsx:678-688).
     Observado: `assets/route.ts:336-337` grava só `{cor}`; o `lqip` fica nulo,
       `lqipsDeCaminhos` não devolve nada e a célula abre vazia. Pelo caminho da Biblioteca o
       `lqip` é gravado (temas/[id]/imagens/route.ts:361).
     Onde: src/app/api/orcamento/[id]/assets/route.ts:330-340
     Causa provável: o caminho da Biblioteca ganhou o LQIP e o caminho do estúdio ficou para trás
       — os dois usam `sharp` e o mesmo `garantirFoto`.
     Correção proposta: calcular o LQIP no upload do estúdio, com a mesma função e a mesma guarda
       `lqipAceitavel`.
     Chega ao cliente? sim

[A6-004] [Agente 6] [Conferência de fotos] [Médio] O aviso «esta fotografia vai sair mole» nunca dispara — é consequência silenciosa do A6-002
     Reproduzir: pôr num mood board uma imagem de 600×400 (ou uma largura de partilha) e correr a
       verificação antes do envio.
     Esperado: `suspeitas` traz a foto com motivo `pequena-demais` ou `medida-de-partilha`, e o
       estúdio diz onde ela está.
     Observado: a verificação pergunta a forma a `formasDeCaminhos` e faz `if (!forma) continue;`
       — como nenhuma linha tem forma, `suspeitas` é SEMPRE uma lista vazia. O painel diz «nada a
       apontar» a um documento com fotos esticadas.
     Onde: src/lib/proposta-fotos-verificacao.ts:249-267 (MINIMO_UTIL:34)
     Causa provável: a mesma de A6-002 — a peça que alimenta a verificação nunca foi ligada.
     Correção proposta: sai de graça com A6-002; entretanto, um controlo positivo no teste da
       verificação (uma foto com forma pequena TEM de aparecer) impedia isto de voltar a ser
       vacuoso.
     Chega ao cliente? sim (indirectamente: é ele que recebe a foto mole)

---

## Percurso 3 — Proposta enviada → editada → reenviada. O casal vê a versão certa?

**O que está certo, e é preciso dizê-lo:**

- O documento que a página mostra e o documento que o botão do PDF descarrega são resolvidos
  pela MESMA função (`propostaDoLink`) — não há página na versão 2 com um PDF da versão 1.
- O número da versão só sobe quando o conteúdo muda; gravar cinco vezes não leva à versão 6.
- **Verificação campo a campo do selo.** Confrontada a lista de exclusões
  (`NUNCA_VISTO_PELO_CASAL`, `proposta-versao.ts:78-90`) com o que a página desenha:

| Campo excluído | É visto na página? | Veredicto |
|---|---|---|
| `budgetAmounts`, `budgetCosts`, `budgetScales` | não — `totaisDaProposta` deriva de `totalAmount`/`totalText`/`budgetExtras`, nunca da soma das linhas | correcto |
| `convidadosPorMesa` | não | correcto |
| `notasInternas`, `notasPorSeccao` | não | correcto |
| `fotosDeBiblioteca` | não — as fotos saem de `coverImages`/`moodBoards`/`escolhas`, que são selados | correcto |
| `traducoesFeitas` | não | correcto |
| `vatRate` | a taxa é impressa, mas qualquer alteração dela move `vat`/`subtotal`/`total`, que são selados | correcto |
| `headerTitle`, `intencao`, `escolhas` | sim — e por isso estão em `VISTO_NA_PAGINA` | correcto |

Não foi encontrado um único campo visto na página que não conte para o selo. O selo está bem
feito. O que está partido é o que se faz com ele.

[A6-005] [Agente 6] [Página do casal] [Crítico] O estado da versão é calculado e nunca é desenhado: o casal nunca é avisado de que a proposta mudou depois do «sim»
     Reproduzir: enviar a proposta → marcar como aceite (gera contrato com `propostaVersaoSelo`)
       → no estúdio, mudar o preço e enviar a revisão → abrir o link que o casal tem no email.
     Esperado: o cabeçalho de `proposta-versao.ts:170-176` promete: «`revista` — há um aceite E o
       documento mudou desde então. O casal continua a ver o que aceitou (congelado); a versão
       nova precisa de um aceite novo. A Fase 4 é que lhe dá o botão; até lá o que existe é o
       congelamento E O AVISO.» O congelamento existe. O aviso não.
     Observado: `propostaDoLink` devolve `estado` e `versaoVivaNumero`
       (proposta-do-link.ts:161-181) e NENHUM consumidor os lê. `page.tsx` usa apenas
       `doLink.versao` e `doLink.versaoEm` (page.tsx:624-644). `grep -rn
       "revista\|em-vigor\|por-aceitar\|versaoVivaNumero" src` não devolve um único uso fora do
       próprio módulo e dos seus testes. O casal abre o link, lê uma proposta congelada, e nada
       na página diz que existe uma versão mais recente — nem, do outro lado, existe onde ela
       veja «aceitaram a 2, há uma 3 por aceitar».
     Onde: src/lib/proposta-do-link.ts:161-181;
       src/app/[lang]/(privado)/proposta/[token]/page.tsx:266 e 611-644;
       src/lib/proposta-versao.ts:165-182
     Causa provável: a peça de dados (Fase 3.5) foi entregue antes do ecrã; o `estado` ficou à
       espera de um consumidor que não chegou, e nada falha em silêncio melhor do que um campo
       que ninguém lê.
     Correção proposta: uma linha por baixo da data, com as palavras já traduzidas nos
       dicionários: em `revista`, «Esta é a proposta que aceitaram (versão N). Há uma versão N+1 —
       falem connosco»; em `em-vigor`, nada. Dois testes de página, um por estado.
     Chega ao cliente? sim — pela ausência, que é o pior modo: o documento muda por baixo dele e
       ninguém lho diz

[A6-006] [Agente 6] [Link do casal] [Médio] Com o aceite ilegível, a página cai calada na proposta do token e volta a dizer «por aceitar» — não confirmado (exige base de dados)
     Reproduzir: com um contrato aceite no pedido, mudar o email do cliente no pedido (ou apagar
       a linha aceite — ver A6-013) e reabrir o link.
     Esperado: ou se mostra o que foi aceite, ou se diz que não se conseguiu resolver. Nunca
       voltar ao princípio.
     Observado: se `aceitada` não passa o `podeMostrar` (guarda de mesmo email,
       proposta-do-link.ts:118-122, 138), o ramo `else if` não corre — está encadeado no `if
       (aceite?.proposalId)` — portanto `proposta` fica na do TOKEN (que pode ser uma revisão
       antiga) e `seloAceite` fica `undefined`, o que dá `estado: "por-aceitar"`. O congelamento
       desaparece sem um aviso, e o registo também: este caminho não escreve nada no `log`.
     Onde: src/lib/proposta-do-link.ts:131-146
     Causa provável: o `podeMostrar` foi escrito para as IRMÃS (a quem se salta) e reaproveitado
       para a ACEITE (a quem se volta), que é o caso oposto — para a aceite, o que interessa é
       que ela foi mesmo aceite.
     Correção proposta: separar as duas guardas; se a proposta aceite não se conseguir mostrar,
       registar e cair na mais recente com o estado `revista`, nunca em `por-aceitar`.
     Chega ao cliente? sim

[A6-007] [Agente 6] [Selo de versão] [Médio] A guarda que impede as duas listas de divergir só lê um dos três ficheiros que desenham a página
     Reproduzir: acrescentar `{doc.notasPorSeccao?.[0]}` ao `Escolhas.tsx` ou à `page.tsx`. A
       suite passa a verde.
     Esperado: qualquer campo excluído do selo que passe a ser desenhado ao casal parte um teste.
     Observado: o teste lê exclusivamente `Documento.tsx` (proposta-versao.test.ts:157-174). A
       página do casal é desenhada por quatro ficheiros — `page.tsx` desenha
       `doc.intencao`/`doc.intencaoEn` fora do `Documento.tsx` (page.tsx:319-323), e
       `Escolhas.tsx`/`Inspiracao.tsx` desenham conteúdo do documento. Hoje nenhum deles mostra
       um campo excluído; a defesa é que não os cobre.
     Onde: src/lib/proposta-versao.test.ts:157-174
     Causa provável: quando a guarda foi escrita a página era um ficheiro só.
     Correção proposta: correr o `not.toContain` sobre a concatenação dos quatro ficheiros da
       pasta `proposta/[token]` (ou sobre um `readdir` dela, que apanha o quinto no dia em que
       nascer).
     Chega ao cliente? não (hoje)

---

## Percurso 4 — Trocar de cliente a meio de uma proposta

**O que sobrevive íntegro:** o estúdio é remontado de raiz por `key={fazer-proposta-${id}}`
(FazerProposta.tsx:242-249) — o rascunho de um casal não aparece no ecrã do seguinte; e a
gravação pendente dos 800 ms é descarregada na desmontagem. A cópia troca a identidade do evento
(nomes, data, local, convidados), marca os campos para confirmação, remarca as Condições Gerais,
apaga as notas internas e deita fora a validade e o valor da proposta anterior.

[A6-008] [Agente 6] [Copiar proposta] [Grave] As fotografias das alternativas não são recopiadas: ficam na pasta do pedido de origem, e o aviso não as conta
     Reproduzir: numa proposta com uma escolha («duas paletas», cada opção com fotografia), usar
       «Criar a partir de…» para outro cliente → enviar → apagar (ou arquivar) o pedido de origem
       → abrir a página do casal novo: as fotos das opções desaparecem.
     Esperado: a regra do módulo, à letra: «copiar o caminho deixaria a proposta nova a apontar
       para a pasta de outro pedido — se esse for apagado, esta fica sem imagens, em silêncio e
       provavelmente já enviada» (proposal-copy.ts:28-33).
     Observado: `fotosDoDocumento` só varre `coverImages` e `moodBoards[].images` —
       `escolhas[].opcoes[].imagem` não entra (proposal-copy.ts:156-167), e o `trocarFotos`
       também não lhe toca (proposal-copy.ts:282-292). Logo o `duplicarFotosParaPedido` nunca as
       vê, elas ficam com o caminho `<pedidoAntigo>/<uuid>.jpg`, e o contador `fotosPartilhadas`
       — que é o que faz o toast ficar vermelho (ProposalStudio.tsx:5127-5137) — reporta zero.
       Enquanto a origem existir tudo parece bem.
     Onde: src/lib/proposal-copy.ts:156-167 e 282-292
     Causa provável: as alternativas (Fase 3) nasceram depois do «Criar a partir de…» e o
       inventário de fotos da cópia não foi actualizado.
     Correção proposta: incluir `escolhas[].opcoes[].imagem` no `fotosDoDocumento` e no
       `trocarFotos` (com o mesmo cuidado de não mexer nas `data:`), e um teste que copie uma
       proposta com escolhas e exija que nenhum caminho fique na pasta antiga.
     Chega ao cliente? sim

[A6-009] [Agente 6] [Copiar proposta] [Médio] A frase de intenção do casal anterior viaja para o casal novo sem marca nenhuma
     Reproduzir: escrever a frase de intenção («Para a Ana e o João imaginámos…»), enviar, e
       depois «Criar a partir de…» para outro cliente.
     Esperado: a regra do módulo — «copia-se TUDO menos aquilo que é de OUTRA pessoa»
       (proposal-copy.ts:21-27). A frase de intenção é, por definição, a tese daquele casamento,
       e é o PRIMEIRO texto que o casal lê, em serifada a 21 px (page.tsx:465-471).
     Observado: `copiarParaPedido` apaga `notasInternas` e `notasPorSeccao`
       (proposal-copy.ts:209-210) e não toca em `intencao`/`intencaoEn`; e `CampoAMudar`
       (proposal-copy.ts:44-52) não tem entrada para ela, portanto o anel laranja de «confirma
       isto» também não aparece (ProposalStudio.tsx:5122).
     Causa provável: a intenção nasceu com a página do casal, depois da cópia; ficou no lote do
       «serviço» em vez do lote da «identidade do evento».
     Correção proposta: ou acrescentar `intencao` (e o par inglês) ao `CampoAMudar` e marcá-la,
       ou esvaziá-la como se faz à cerimónia e à hora. Marcar é melhor: a redacção dela pode
       servir de ponto de partida.
     Chega ao cliente? sim

---

## Percurso 5 — Mudar o idioma para EN a meio

**Verificação da lista de lacunas.** O cabeçalho de `proposal-doc-bilingue.ts:55-64` diz que o
cronograma e as linhas estimadas não têm par inglês nenhum e saem em português sem aviso:
**continua verdade**. O que mudou desde que a lacuna foi escrita é o alcance: o cronograma
passou a ser desenhado também na página do casal (`Documento.tsx:756-771`), portanto a mesma
lacuna leva agora o português a duas superfícies em vez de uma. O que a lista **já não descreve
bem** é o caso das alternativas:

[A6-010] [Agente 6] [Bilingue] [Grave] As alternativas não entram em contagem de tradução nenhuma — e a Conferência dá «Idioma: ok» a uma proposta inglesa com as alternativas em português
     Reproduzir: proposta com idioma EN, tudo traduzido menos uma escolha («Paleta» / opções
       «Terracota» e «Verde-oliva») → passo Enviar → ler a Conferência → enviar → abrir a página
       do casal.
     Esperado: ou a contagem diz «2 campos não têm versão inglesa e vão sair em português», ou o
       botão «traduzir» preenche-os. Uma das duas.
     Observado: a Conferência lê `camposPorTraduzir` (conferencia.ts:507), que percorre
       `camposDoDocumento` — e as alternativas estão FORA dessa lista, por decisão escrita
       (proposal-ortografia.ts:408-430). A linha sai com `severidade: "ok"` e detalhe vazio: um
       visto verde falso. O painel «Por traduzir» (PorTraduzir.tsx:47), o contador por secção
       (`porTraduzirPorSeccao`, proposal-doc-bilingue.ts:486-496) e a tradução automática
       (proposal-traducao.ts:510) usam as mesmas duas funções e são igualmente cegos. A página
       desenha-as com `tituloNaLingua`/`rotuloNaLingua`, que caem para o português
       (Documento.tsx:411-421).
       E a justificação da exclusão é FALSA: «alternativas TÊM par inglês e já são contadas — por
       `camposDeEscolhaPorTraduzir`, que é de quem elas são» (proposal-ortografia.ts:419-421).
       Essa função existe, está testada e NÃO É CHAMADA POR NINGUÉM — `grep -rn
       "camposDeEscolhaPorTraduzir" src` devolve a definição (proposta-escolhas.ts:165), o teste,
       e um comentário. É código morto a servir de álibi a uma exclusão.
     Onde: src/lib/proposta-escolhas.ts:158-196; src/lib/proposal-ortografia.ts:408-430;
       src/lib/orcamento/conferencia.ts:505-521; src/lib/proposal-doc-bilingue.ts:408-420 e
       439-456
     Causa provável: a Fase 3 (alternativas) entregou as caixas inglesas no editor
       (EditorDeEscolhas.tsx:156-254) e o ajudante da contagem, e ninguém ligou o ajudante aos
       três sítios que contam.
     Correção proposta: somar `camposDeEscolhaPorTraduzir(doc.escolhas)` à contagem da
       Conferência, ao painel e ao contador por secção (é exactamente o que o comentário já
       promete), e passá-las à tradução automática. Enquanto isso não existir, corrigir o
       comentário — porque é ele que impede o próximo leitor de reparar.
     Chega ao cliente? sim

[A6-011] [Agente 6] [Bilingue] [Médio] `docTemIngles` é cego às alternativas: uma proposta reaberta pode esconder as traduções que já tem
     Reproduzir: escrever uma proposta cujo único texto inglês está nas alternativas → fechar →
       reabrir noutro portátil (ou copiá-la a partir de outra).
     Esperado: o interruptor «Proposta bilingue» abre LIGADO — é a razão declarada da função:
       «sem isto, os textos ingleses existiam no documento e o ecrã não os mostrava: invisíveis e
       editáveis por acidente, que é a pior combinação» (proposal-doc-bilingue.ts:458-468).
     Observado: `docTemIngles` percorre `camposDoDocumento` (proposal-doc-bilingue.ts:498-502),
       que não inclui as escolhas. O interruptor abre desligado, as caixas inglesas das
       alternativas desaparecem do ecrã (EditorDeEscolhas.tsx:156) e o inglês que lá está fica
       invisível — exactamente a combinação que a função existe para impedir.
     Onde: src/lib/proposal-doc-bilingue.ts:498-502; ProposalStudio.tsx:1291, 1612, 1971
     Causa provável: a mesma de A6-010.
     Correção proposta: `docTemIngles` passa a devolver verdadeiro também quando alguma escolha
       tem `tituloEn`/`notaEn`/`rotuloEn`/`descricaoEn` escritos.
     Chega ao cliente? não (mas produz o A6-010 sem ninguém dar por isso)

[A6-012] [Agente 6] [Bilingue] [Menor] A lacuna do cronograma e das linhas estimadas continua certa — e agora custa em dois sítios
     Reproduzir: proposta modelo «Organização», idioma EN, com cronograma preenchido →
       Conferência → enviar.
     Esperado: que a lacuna declarada continue a ser a que está escrita.
     Observado: continua exacta — não há `titleEn` no cronograma nem `itemEn` nas linhas
       estimadas (proposal-doc.ts:569, 766), e por isso não são contadas nem traduzidas. O que a
       nota já não diz é que o cronograma deixou de sair só no PDF: é desenhado também na página
       do casal (Documento.tsx:756-771). Uma proposta inglesa mostra «3. Timeline» com as fases
       todas em português.
     Onde: src/lib/proposal-doc-bilingue.ts:55-64; src/lib/proposal-ortografia.ts:408-421
     Causa provável: lacuna assumida, anterior à página viva.
     Correção proposta: manter a decisão, actualizar a nota para dizer «no PDF e na página»; e,
       no dia em que se resolver, entrar pelo `CampoDeTexto` (que é o que faz o `switch` sem
       `default` obrigar a decidir).
     Chega ao cliente? sim (declarado)

---

## Percurso 6 — Criar, duplicar e apagar uma proposta

**O que sobrevive íntegro:** criar e reenviar estão bem fechados — reenviar não gera propostas
fantasma (a linha por enviar é reescrita), o mesmo documento duas vezes não são dois emails com
dois links, e o rascunho do estúdio sobrevive ao envio.

[A6-013] [Agente 6] [Propostas] [Grave] Apagar uma proposta mata o link que o casal tem no email — e, se for a aceite, desfaz o congelamento
     Reproduzir (A): enviar a v1 → enviar a v2 (revisão) → back office → Propostas → Apagar a v1
       «para arrumar» → abrir o link que o casal recebeu no email.
     Reproduzir (B): marcar uma proposta como aceite → apagar essa linha → abrir o link do casal.
     Esperado (A): o link segue o PEDIDO e não a linha — é o que `proposta-do-link.ts` existe
       para garantir; a v2 devia continuar a abrir. Esperado (B): «o que foi aceite fica
       congelado e imutável».
     Observado (A): `propostaDoLink` começa por `getProposal(claim.proposalId)` e devolve `null`
       se essa linha desapareceu (proposta-do-link.ts:99-100), portanto a página mostra «proposta
       não encontrada», o PDF dá 404 e as fotos deixam de assinar — mesmo com a v2 viva no mesmo
       pedido. É o ÚNICO link que o casal tem.
       Observado (B): o contrato continua a apontar para a proposta apagada; `aceitada` fica
       indefinido, `seloAceite` também, e a página passa a mostrar a proposta mais recente com
       estado `por-aceitar` — o congelamento desaparece sem uma palavra.
       A rota não tem guarda nenhuma: `DELETE` faz `deleteProposal(id)` e mais nada
       (propostas/[id]/route.ts:97-110), e a acção «Apagar» está sempre na lista, incluindo em
       propostas `enviada` e `aceite` (Propostas.tsx:458-463). A confirmação diz «Esta ação não
       pode ser anulada» e não diz que o casal fica sem link (Propostas.tsx:296-299).
     Onde: src/app/api/propostas/[id]/route.ts:97-110; src/lib/proposta-do-link.ts:99-100 e
       131-141; src/app/[lang]/(site)/orcamento/admin/Propostas.tsx:290-315 e 458-463
     Causa provável: o DELETE é anterior ao link vivo, às revisões por pedido e ao selo do aceite;
       nunca foi revisto depois de a linha ter passado a ser uma das versões de um pedido em vez
       de a proposta.
     Correção proposta: recusar (409, com a razão) apagar uma proposta `enviada`/`aceite`, ou uma
       referida por um contrato; para arrumar a lista, arquivar em vez de apagar. E, se se
       mantiver, fazer o `propostaDoLink` cair para a irmã mais recente do mesmo pedido quando a
       linha do token já não existe, em vez de devolver `null`.
     Chega ao cliente? sim

[A6-014] [Agente 6] [Propostas / Armazenamento] [Menor] Apagar deixa as fotografias no bucket, sem dono e sem contagem
     Reproduzir: criar uma proposta com 46 fotos carregadas no estúdio → apagar a proposta →
       listar `<quoteId>/` no bucket das propostas.
     Esperado: ou as fotos saem com ela, ou fica dito (a casa já tem um painel de armazenamento).
     Observado: `deleteProposal` remove a linha e mais nada (proposals-store.ts:127); nada limpa
       `<quoteId>/…`, nem as miniaturas. Como as fotos vivem debaixo do PEDIDO e não da proposta,
       apagá-las às cegas seria pior — mas hoje não há nem limpeza nem contagem.
     Onde: src/lib/proposals-store.ts:127; src/app/api/propostas/[id]/route.ts:97-110
     Causa provável: o dono das fotos é o pedido, e o gesto é sobre a proposta; ninguém decidiu de
       quem é a limpeza.
     Correção proposta: contar os órfãos no painel de armazenamento (as fotos de pedidos sem
       proposta nenhuma), com limpeza à mão. Nunca apagar em cascata a partir daqui.
     Chega ao cliente? não

---

## Resumo dos catorze

| ID | Percurso | Severidade | Chega ao cliente |
|---|---|---|---|
| A6-001 | 1 | Menor | não |
| A6-002 | 2 | Grave | sim |
| A6-003 | 2 | Médio | sim |
| A6-004 | 2 | Médio | sim |
| A6-005 | 3 | **Crítico** | sim |
| A6-006 | 3 | Médio (não confirmado) | sim |
| A6-007 | 3 | Médio | não |
| A6-008 | 4 | Grave | sim |
| A6-009 | 4 | Médio | sim |
| A6-010 | 5 | Grave | sim |
| A6-011 | 5 | Médio | não |
| A6-012 | 5 | Menor (declarado) | sim |
| A6-013 | 6 | Grave | sim |
| A6-014 | 6 | Menor | não |

Três padrões atravessam a lista, e valem mais do que os itens soltos: **peças entregues sem
consumidor** (o `estado` da versão, o `camposDeEscolhaPorTraduzir`, as colunas
`largura`/`altura`) — cada uma com um comentário a afirmar que já está ligada; **a Fase 3
(alternativas) ficou de fora de quatro inventários** que percorrem o documento (cópia de fotos,
contagem de traduções, tradução automática, detecção de bilinguismo); e **os gestos destrutivos
não foram revistos depois de o link do casal passar a seguir o pedido**.
