# Agente 4 — Templates e variáveis

Dos três casos conhecidos, **dois continuam vivos e reproduzem-se hoje** («para o ␣no Torre de
Palma» e «no Torre de Palma»); o terceiro tem defesa (`assinanteDoEmail`) mas há um caminho
paralelo por onde volta a acontecer — `{{remetente_nome}}` sai «Líquen Events» enquanto o bloco
de assinatura sai «Catarina Gaspar», no mesmo email.

Foi corrido o interpretador real (`renderizarCorpo`/`preencherMarcadores`) com cada uma das 11
variáveis vazia, uma de cada vez, sobre os 3 modelos de origem × 2 línguas (66 combinações), e
o `preencherMarcadores` com data/convidados vazios sobre as condições PT e EN.

Vinte defeitos; 11 chegam ao cliente, e o pior não é um espaço duplo — é uma **cláusula
contratual que fica congelada a dizer «a data que vier a ser confirmada por escrito» numa
proposta que já tem data**.

---

[A4-001] [Agente 4] [Modelos de email] [Crítico] «para o ␣no Torre de Palma» — a frase parte-se quando o tipo de evento falta
     Reproduzir: pedido com `eventType` ausente ou «Outro» (o formulário público grava vazio) +
       local preenchido. Estúdio → passo do email → modelo «Registo formal» (é o que abre por
       omissão). Ou: renderizarCorpo(MODELOS_DE_ORIGEM[0].pt.texto, construirValores({evento:
       {tipo:"outros", local:"Torre de Palma", dataIso:"2026-09-12"}, …}))
     Esperado: sem tipo de evento, a frase não menciona tipo nenhum — «…respetivo orçamento
       para a Torre de Palma, a 12 de setembro de 2026.»
     Observado: «De acordo com o solicitado, enviamos a nossa proposta de decoração e respetivo
       orçamento para o ␣no Torre de Palma, a 12 de setembro de 2026.» (dois espaços entre «o» e
       «no»). Em inglês: «…respective quote for the ␣at Torre de Palma, on 12 de setembro de
       2026.»
     Onde: src/lib/email-templates-store.ts:396 (pt) e :419 (en); igual em :446 e :474
     Causa provável: o bloco está condicionado a `evento_local` e não a `evento_tipo` —
       `{{#se evento_local}} para o {{evento_tipo}} no {{evento_local}}{{/se}}`. Basta um dos
       dois faltar para o texto fixo à volta do outro ficar órfão. E `marcadoresDoPedido`
       (email-modelos.ts:604) devolve `evento_tipo: ""` SEMPRE, portanto pelas rotas antigas
       isto sai em 100% dos envios que usem este modelo.
     Correção proposta: dois blocos aninhados, cada texto fixo dentro do bloco da sua variável —
       ou uma variável composta `evento_no_local` construída em `construirValores`, onde já há
       código para o fazer bem.
     Chega ao cliente? sim — este é o texto que ABRE o ecrã de envio, e o aviso «Ficou por
       preencher» é só um aviso: não trava o botão Enviar.

[A4-002] [Agente 4] [Modelos de email] [Crítico] «no Torre de Palma» — preposição fixa no modelo, errada na maioria dos espaços
     Reproduzir: mesmo modelo, com local preenchido. Varridos os espaços reais da casa:
     Esperado: «na Torre de Palma», «na Herdade da Malhadinha Nova», «na Quinta do Lago», «na
       Adega Mayor», «na Casa do Alentejo», «no Convento do Espinheiro».
     Observado, tal e qual:
       «…orçamento para o Casamento no Torre de Palma, a 12 de setembro de 2026.»
       «…orçamento para o Casamento no Herdade da Malhadinha Nova, a 12 de setembro de 2026.»
       «…orçamento para o Casamento no Quinta do Lago, a 12 de setembro de 2026.»
       «…orçamento para o Casamento no Adega Mayor, a 12 de setembro de 2026.»
       «…orçamento para o Casamento no Casa do Alentejo, a 12 de setembro de 2026.»
       Só «no Convento do Espinheiro» está certo. Cinco em seis errados.
     Onde: src/lib/email-templates-store.ts:396, :446 (e os pares em inglês, onde «at» está
       certo — o defeito é só português)
     Causa provável: a contração «no» está escrita à mão no modelo, colada a um valor cujo
       género ninguém conhece. O ficheiro `orcamento/data.ts:84` diz textualmente «E NENHUMA
       frase para o cliente depende de um artigo colado ao tipo… As frases foram reescritas para
       não precisarem» — a semente do modelo violou essa regra.
     Correção proposta: tirar a preposição da frase — «…respetivo orçamento para o
       {{evento_tipo}}, {{evento_local}}» — ou «…orçamento para o {{evento_tipo}} em
       {{evento_local}}», que é neutro e nunca está errado. Uma tabela de géneros para nomes de
       quintas não existe e não se pode inventar.
     Chega ao cliente? sim

[A4-003] [Agente 4] [Modelos de email] [Grave] «para o Conferência» — o artigo também é fixo
     Reproduzir: pedido com eventType = `conferencias` (ou `Conferência` no rótulo).
     Esperado: «para a Conferência no/em …»
     Observado: «…respetivo orçamento para o Conferência no Convento do Espinheiro, a 12 de
       setembro de 2026.»
     Onde: src/lib/email-templates-store.ts:396 («para o {{evento_tipo}}»)
     Causa provável: mesma raiz do A4-002 — «Conferência» é o único feminino da tabela
       `EVENT_TYPE_NAMES` (orcamento/data.ts:105) e o modelo escreve «o» sempre.
     Correção proposta: mesma da A4-002 — reescrever a frase para não precisar de artigo.
     Chega ao cliente? sim — casamentos são a maioria, mas conferências existem no catálogo e no
       formulário público.

[A4-004] [Agente 4] [Proposta / Condições Gerais] [Crítico] A cláusula fica CONGELADA na redacção «sem data» depois de a data existir
     Reproduzir:
       1. Estúdio de propostas com o pedido ainda sem data (o caso normal de quem anda a
          escolher o dia). Enviar. `withProposalDefaults` grava as condições já preenchidas
          dentro do `doc` da proposta.
       2. A data aparece. Painel Versões → «Repor esta versão» (ProposalStudio.tsx:3345).
          Preencher a data e o número de convidados.
       3. Pré-visualizar / enviar a revisão.
     Esperado: com data no documento, a cláusula volta a citar o dia — «Esta proposta só é válida
       para o evento a realizar no dia 12 de setembro de 2026.»
     Observado: a capa e o quadro dizem 12 de setembro de 2026 e 120 convidados, e as Condições
       Gerais, três páginas à frente, continuam a dizer:
       «Esta proposta só é válida para a data do evento que vier a ser confirmada por escrito.»
       «O orçamento é válido para o número de convidados que vier a ser confirmado por escrito;
        abaixo ou acima desse número o valor da proposta terá de ser revisto.»
     Onde: src/lib/proposal-doc.ts:959 e :1445
     Causa provável: `preencherMarcadores` troca a CLÁUSULA INTEIRA pela redacção sem dado — e
       essa redacção já não tem `{DATA}` nem `{CONVIDADOS}` lá dentro. O `withProposalDefaults`
       grava o resultado no documento (`.map(fill)`), portanto a troca é irreversível: na
       passagem seguinte já não há marcador para preencher. O mecanismo que protege a folha
       quando o dado falta é o mesmo que a estraga quando o dado chega.
     Correção proposta: não gravar o texto preenchido. Guardar as condições COM os marcadores e
       preencher só na altura de desenhar (o `Documento.tsx:1064` já chama `preencherMarcadores`
       no render — está lá meio caminho feito). Se a gravação tiver de ficar,
       `preencherMarcadores` tem de saber desfazer: uma tabela inversa `sem → com` aplicada antes
       da substituição.
     Chega ao cliente? sim — é uma cláusula contratual, no PDF e na página do casal. É a folha
       que se relê quando há uma discussão, e diz o contrário da capa.

[A4-005] [Agente 4] [Proposta bilingue] [Grave] Consequência do A4-004: as Condições Gerais de uma proposta INGLESA saem em português
     Reproduzir: o mesmo documento do A4-004, marcado como inglês.
     Esperado: `blocosFixosNaLingua(doc,"en").condicoesGerais` em inglês.
     Observado: sai o bloco inteiro em português. `blocoEDaCasa(doc,"condicoesGerais") === false`
     Onde: src/lib/proposal-doc-textos.ts:990 (`saoIguais(atual, casa[campo].pt)`)
     Causa provável: a comparação «isto ainda é o texto da casa?» compara o documento (que ficou
       com a redacção «sem dado») com `preencher(DEFAULT_CONDICOES_GERAIS)` recalculado agora COM
       a data. Falham duas linhas, e a regra é tudo-ou-nada: o bloco inteiro passa a contar como
       reescrito à mão e não se traduz.
     Correção proposta: cai sozinho com a correcção do A4-004. Em alternativa, a comparação tem
       de aceitar as duas redacções de cada cláusula (comparar contra `com` OU `sem`).
     Chega ao cliente? sim — um casal estrangeiro recebe as condições numa língua que não lê, sem
       nada no ecrã a dizer que isso aconteceu.

[A4-006] [Agente 4] [Variáveis / assinatura] [Grave] `{{remetente_nome}}` assina a casa enquanto o bloco de baixo assina a pessoa
     Reproduzir: escrever num modelo «Com os melhores cumprimentos,\n{{remetente_nome}}» (a
       variável está no menu do editor, grupo «Quem assina») e enviá-lo pelo botão do dossier
       (`/api/orcamento/[id]/modelo`) ou com a proposta.
     Esperado: o nome de quem carregou no botão — o mesmo que sai no bloco de assinatura.
     Observado: o corpo sai «Com os melhores cumprimentos,\nLíquen Events» e três linhas abaixo o
       bloco da casa sai «Catarina Gaspar · Manager». Dois assinantes diferentes no mesmo email.
       É a forma exacta do incidente conhecido.
     Onde: src/lib/email-modelos.ts:612 (`remetente_nome: REMETENTE_POR_OMISSAO`); os três
       chamadores têm o nome verdadeiro na mão e não o passam —
       api/orcamento/[id]/modelo/route.ts:109 vs :159, .../proposta/route.ts:260 vs :268,
       .../proposta-doc/route.ts:920 vs :952
     Causa provável: `marcadoresDoPedido` não recebe o remetente e cai no recurso da casa. O
       recurso está certo; o que falta é o caminho por onde o nome real entra. O ecrã de envio
       novo (`valoresDoEnvio` → `construirValores`) já o passa bem — são as três rotas antigas
       que não.
     Correção proposta: passar `{ remetente_nome: nomeDeQuemEnvia(request) }` no `extra` das três
       chamadas. O `extra` já ganha ao valor por omissão (email-modelos.ts:615), portanto é uma
       linha por rota.
     Chega ao cliente? sim

[A4-007] [Agente 4] [Ecrã de envio] [Grave] Um modelo do dialecto antigo no ecrã de envio sai com `{nome}` e `{valor}` literais
     Reproduzir: no ecrã de envio da proposta, trocar de modelo para «Sinal recebido» (ou
       «Proposta enviada» / «Falta uma semana» / «Agradecimento» — `listarModelos` oferece-os
       todos no `select`), com esse modelo já guardado alguma vez no editor clássico.
     Esperado: ou o modelo resolvido com os dados do casal, ou uma recusa explicada.
     Observado, na caixa que se envia sem se lhe tocar:
       «Olá {nome},»
       «Confirmamos a receção do sinal de {valor}. A vossa data está oficialmente reservada…»
       «Data do evento: {data_evento}»
       «Líquen Events · Portugal»
       — e `porPreencher` vem VAZIO, portanto não há aviso nenhum. O rodapé «Líquen Events ·
       Portugal» também vem, e a seguir entra a assinatura da casa: dois fechos colados.
     Onde: src/lib/email-modelos-rascunho.ts:141-162 (`fonteEditavel` → `renderizarCorpo`)
     Causa provável: `rascunhoParaEnvio` resolve SEMPRE com o interpretador novo (`{{ }}`), sem a
       escolha de dialecto que o `prepararModelo` faz (email-modelos.ts:329, `ehDialectoNovo`) e
       sem o `desmoldurar` que tira o rodapé da casa. Um `{nome}` de chavetas simples não casa
       com `RE_ETIQUETA` e passa intacto. A regra 1 do interpretador — «NADA DE CHAVETAS PARA O
       CLIENTE» — é violada por um caminho que não passa pelo interpretador todo.
     Correção proposta: `rascunhoParaEnvio` deve (a) chamar `desmoldurar` no corpo guardado e (b)
       recusar (ou converter) um modelo de dialecto antigo, com a mesma frase que o
       `prepararModelo` já sabe dizer. Em alternativa, tirar os quatro modelos antigos da lista
       que o ecrã de envio oferece.
     Chega ao cliente? sim

[A4-008] [Agente 4] [Ecrã de envio] [Grave] O email diz «Ainda aguardamos a data» com o PDF datado em anexo
     Reproduzir: pedido sem `date` (o formulário permite-o), estúdio com `doc.eventDate = "3 de
       julho de 2027"` escrito à mão. Abrir o ecrã de envio.
     Esperado: o corpo do email diz a mesma data que o documento em anexo.
     Observado:
       corpo: «Ainda aguardamos a informação relativamente à data, mas podemos depois
              acrescentá-la à proposta.»
       anexo: Proposta-Liquen-Events-Marta-e-Joao-03-07-2027.pdf
       e a capa do PDF diz 3 de julho de 2027.
     Onde: src/app/api/orcamento/[id]/email-rascunho/route.ts:93
       (`dataIso: String(quote.date ?? "")`)
     Causa provável: `evento_data` vem do PEDIDO e nunca do DOCUMENTO. A rota explica porquê (o
       `doc.eventDate` é texto livre e o catálogo quer ISO) e a razão é boa; o que não está
       tratado é a consequência — o bloco `{{#se_nao evento_data}}` dispara sobre um dado que
       existe noutro sítio. O nome do anexo, esse, LÊ `doc.eventDate`
       (email-proposta-textos.ts, `nomeDoFicheiroDaProposta`), e é por isso que as duas metades
       do mesmo envio se contradizem.
     Correção proposta: `isoDaDataPorExtenso(doc.eventDate)` já existe e converte a frase dela em
       ISO — usar `quote.date || isoDaDataPorExtenso(doc.eventDate)`. Quando nem assim der (uma
       data como «Julho de 2027»), aí sim, vazio.
     Chega ao cliente? sim

[A4-009] [Agente 4] [Condições Gerais] [Grave] «O orçamento cobre a definir convidados.» — o `semDado` só apanha as duas frases da casa
     Reproduzir: reescrever uma condição no estúdio mantendo o marcador (por exemplo «O
       orçamento cobre {CONVIDADOS} convidados.») e gerar a proposta sem número.
     Esperado: uma frase inteira, como a casa faz nas duas cláusulas que conhece.
     Observado:
       «O orçamento cobre a definir convidados.»
       «Válida para o dia a definir e para a definir convidados.»
       «Esta proposta é válida apenas para o dia a definir, e para mais nenhum.»
     Onde: src/lib/proposal-doc.ts:902 (`DADO_POR_DEFINIR`), :959-965
     Causa provável: é o desenho documentado — a tabela `CONDICOES_SEM_DADO` troca a cláusula
       inteira, e o que não estiver na tabela cai numa substituição de PALAVRA. Está escrito no
       ficheiro que «a segunda é o caso perigoso», e é. O problema é que a única maneira de uma
       condição sair da tabela é ela editá-la — e o editor não avisa que ao mexer naquela frase
       ela perde a rede.
     Correção proposta: quando falta o dado numa frase que não está na tabela, escrever a
       ausência de forma que sobreviva à concordância. O caminho certo é o editor recusar/avisar:
       uma condição reescrita que ainda cite `{CONVIDADOS}` tem de pedir a segunda redacção, como
       a casa tem.
     Chega ao cliente? sim (só quando ela reescreveu a cláusula)

[A4-010] [Agente 4] [Proposta inglesa] [Grave] «a definir» — português dentro de uma cláusula inglesa
     Reproduzir: proposta em inglês, condição reescrita à mão que cite `{DATA}` ou
       `{CONVIDADOS}`, sem o dado.
     Esperado: «to be confirmed» / «to be defined».
     Observado:
       «This proposal is only valid for the event on a definir.»
       «Catering is planned for a definir guests.»
     Onde: src/lib/proposal-doc.ts:902 — `DADO_POR_DEFINIR` é uma constante única, sem língua;
       `preencherMarcadores` recebe `semDado` traduzido (proposal-doc-textos.ts:832) mas não
       recebe o recurso traduzido.
     Causa provável: o terceiro argumento traduz a tabela das cláusulas e esqueceu o texto do
       último recurso.
     Correção proposta: `preencherMarcadores(texto, dados, semDado, porDefinir = "a definir")`,
       com `"to be confirmed"` no chamador inglês.
     Chega ao cliente? sim

[A4-011] [Agente 4] [Rotas de envio] [Grave] `{{link_proposta}}` fica LITERAL no email pela rota `/proposta`
     Reproduzir: POST /api/orcamento/[id]/proposta com um `corpo` que contenha
       `{{link_proposta}}` (o marcador que o ecrã de envio deixa no rascunho por desenho — ver
       email-ligacao-reservada.ts).
     Esperado: o marcador trocado pelo endereço assinado, como a rota irmã faz.
     Observado: o corpo vai para o `corpoEscritoAMao` sem passar por `resolverLigacaoDaProposta`,
       e o casal recebe «…pode também ser consultada aqui: {{link_proposta}}».
     Onde: src/app/api/orcamento/[id]/proposta/route.ts:304 — não há `resolverLigacaoDaProposta`;
       comparar com proposta-doc/route.ts:797, que o faz.
     Causa provável: a protecção foi montada só na rota nova. A rota `/proposta` aceita `corpo`
       desde a mesma altura (documentado em :286) e ficou de fora.
     Correção proposta: a mesma linha, antes do `corpoEscritoAMao`. E um teste que percorra as
       rotas que aceitam `corpo` e exija que nenhuma o entregue com o marcador dentro.
     Chega ao cliente? sim se alguém enviar por esta rota com corpo escrito à mão — **não
       confirmado** que a interface o faça hoje: o `ProposalBuilder` (o único ecrã que chama esta
       rota) não manda `corpo`. É uma assimetria armada, não um defeito activo.

[A4-012] [Agente 4] [Interpretador] [Médio] Chavetas duplas chegam ao cliente, e o validador não acusa nada
     Reproduzir: escrever num modelo qualquer uma destas, e pré-visualizar/enviar:
     Observado (saída literal, corpo E assunto, `validarModelo` devolve `[]`):
       «Olá {{ cliente-nome }}, tudo bem?»      →  «Olá {{ cliente-nome }}, tudo bem?»
       «Olá {{nome do cliente}},»               →  «Olá {{nome do cliente}},»
       «Total: {{1valor}}»                      →  «Total: {{1valor}}»
       «Olá {{cliente_nome}, boa tarde»         →  «Olá {{cliente_nome}, boa tarde»
     Esperado: a regra 1 escrita no topo do ficheiro — «NADA DE CHAVETAS PARA O CLIENTE… o que
       quer que corra mal, o que sai nunca contém `{{`».
     Onde: src/lib/email-template-engine.ts:47 (`RE_ETIQUETA`), :200 (`validarModelo`)
     Causa provável: o que a expressão não reconhece não é etiqueta nenhuma — é texto, e texto
       sai tal e qual. Um hífen, um espaço no meio do nome, um dígito à cabeça ou uma chaveta a
       menos bastam. E como não gera nó, `validarModelo` não tem nada a que se agarrar: o editor
       mostra tudo verde.
     Correção proposta: uma segunda varredura, depois de desenhar, que procure `{{` no resultado
       e (a) o remova do que sai e (b) o reporte em `validarModelo` como «isto parece uma
       variável mas não é nenhuma das que existem».
     Chega ao cliente? sim

[A4-013] [Agente 4] [Interpretador] [Médio] `{{{cliente_nome}}}` → «{Marta}» — o nome do cliente entre chavetas
     Reproduzir: escrever `Olá {{{cliente_nome}}}` (três chavetas — é o que uma pessoa escreve
       quando duplica um token à mão no editor).
     Esperado: «Olá Marta» ou uma recusa.
     Observado: «Olá {Marta}»
     Onde: src/lib/email-template-engine.ts:47
     Causa provável: a expressão apanha as duas chavetas interiores e deixa a terceira de cada
       lado como texto.
     Correção proposta: a mesma varredura do A4-012, alargada a chavetas soltas coladas a um
       valor substituído.
     Chega ao cliente? sim

[A4-014] [Agente 4] [Interpretador] [Médio] `{{#se}}` sem nome: o comentário diz que o bloco desaparece; ele renderiza sempre
     Reproduzir: `{{#se}}Isto devia desaparecer por inteiro.{{/se}}`
     Esperado (o que está escrito em engine.ts:95-97): «O bloco desaparece por inteiro em vez de
       ficar a render-se sempre… mostrar o conteúdo dava a ilusão de que a condição estava a
       funcionar.»
     Observado: «Isto devia desaparecer por inteiro.» — o conteúdo sai. Os dois erros aparecem em
       `validarModelo`, mas o texto vai à mesma para o cliente.
     Onde: src/lib/email-template-engine.ts:99 (`continue` sem empilhar nada)
     Causa provável: ao não empilhar, o conteúdo cai no nível actual e o `{{/se}}` seguinte é
       tratado como fecho órfão. O comentário descreve a intenção, o código faz o contrário.
     Correção proposta: empilhar um bloco «morto» que consuma até ao fecho e não desenhe nada —
       ou corrigir o comentário, se o comportamento actual for o desejado. Neste momento o
       ficheiro documenta uma garantia que não dá.
     Chega ao cliente? sim

[A4-015] [Agente 4] [Editor clássico] [Médio] Pré-visualização de um modelo novo dá «Olá {},»
     Reproduzir: guardar o «Registo formal» (ou qualquer modelo de dialecto novo), depois abri-lo
       no ecrã «Modelos de email» clássico — `listTemplatesWithDefaults` acrescenta-o à lista,
       incluindo a linha física `registo-formal@en`.
     Esperado: a pré-visualização mostra o que o cliente vai ver.
     Observado, no iframe:
       «Olá {}, boa tarde,»
       «…respetivo orçamento{{#se evento_local}} para o {} no {}{{/se}}{{#se evento_data}}, a {}{{/se}}.»
     Onde: src/lib/email-template-format.ts:50 (`renderPreview`, `\{(\w+)\}`) chamado de
       EmailTemplates.tsx:487
     Causa provável: a pré-visualização clássica só conhece o dialecto antigo e a expressão
       `\{(\w+)\}` casa com a chaveta INTERIOR de um `{{variavel}}` — é exactamente o cenário que
       `email-modelos.ts:333` descreve («o que saía era "Proposta {Marta}"»). O ENVIO está
       protegido (`ehDialectoNovo`); a pré-visualização não.
     Correção proposta: `renderPreview`/`renderPreviewSubject` fazem a mesma escolha de dialecto
       que o `prepararModelo`. Melhor ainda: o editor clássico não abre modelos com `{{`, e diz
       onde é que eles se editam.
     Chega ao cliente? não directamente — mas leva-a a «corrigir» um modelo que estava bom, e aí
       chega.

[A4-016] [Agente 4] [Pré-visualização] [Médio] `{{sinal_percentagem}}` mostra sempre 30% na pré-visualização com dados reais
     Reproduzir: proposta com `depositPercent: 50`; ecrã dos modelos → pré-visualizar com esse
       pedido real.
     Esperado: «50%», que é o que o envio vai escrever (`depositPercentOf(doc)` em
       email-rascunho/route.ts:98).
     Observado: «30%».
     Onde: src/lib/email-modelos-previsualizacao.ts:92
       (`sinalPercentagem: SINAL_POR_OMISSAO`)
     Causa provável: a pré-visualização lê o pedido e a proposta, mas o sinal é uma constante — o
       `depositPercent` do documento não é consultado.
     Correção proposta: `depositPercentOf(proposta?.doc)` com recurso à constante.
     Chega ao cliente? não — mas é a mesma classe de divergência que o ficheiro do ecrã de envio
       se esforça por evitar («um ecrã que mente»), e um modelo escrito a olhar para 30% pode
       dizer a coisa errada quando sair a 50%.

[A4-017] [Agente 4] [Modelos de email] [Menor] Linha em branco a mais no bloco do resumo quando a última linha falta
     Reproduzir: modelo «Com resumo do evento», sem validade (ou sem valor e validade).
     Esperado: o resumo acaba na última linha que tem dado.
     Observado, na caixa editável: duas linhas em branco entre o resumo e o parágrafo seguinte;
       com tudo vazio ficam três linhas em branco seguidas.
     Onde: src/lib/email-templates-store.ts:453-458 (o `\n` está DENTRO de cada `{{#se}}`, mas o
       último bloco não o tem e o parágrafo já traz o seu)
     Causa provável: cada linha do resumo leva o seu `\n` dentro do bloco; quando o último bloco
       fecha vazio, sobra o `\n` do penúltimo mais o separador de parágrafo.
     Correção proposta: pôr o `\n` no INÍCIO de cada bloco em vez do fim (o primeiro fica sem),
       como o `{{/se_nao}}` do parágrafo da data já faz bem.
     Chega ao cliente? não no HTML final (`corpoEnviavel` filtra parágrafos vazios) — mas é o que
       ela lê e edita antes de enviar.

[A4-018] [Agente 4] [Ecrã de envio] [Menor] O aviso manda preencher num sítio onde o campo não existe
     Reproduzir: A4-001. O aviso diz: «Ficou por preencher, e vai sair assim: Tipo de evento.
       Corrige o texto acima antes de enviar — ou preenche o dado no passo “Conteúdo”.»
     Esperado: o passo «Conteúdo» tem onde preencher o tipo de evento.
     Observado: `eventType` só é editável ao CRIAR um pedido (NewQuoteModal.tsx:233). No estúdio
       não há campo nenhum. Metade do conselho é impossível de seguir.
     Onde: src/app/[lang]/(site)/orcamento/admin/EmailDoEnvio.tsx:396
     Causa provável: o texto do aviso é genérico e assume que toda a variável tem um campo no
       estúdio; `evento_tipo`, `validade_data` e `sinal_percentagem` não têm.
     Correção proposta: a frase diz onde se preenche CADA variável, ou omite a segunda metade
       quando não há sítio.
     Chega ao cliente? não

[A4-019] [Agente 4] [Contrato] [Menor] O ponto 4 dos termos é composto por `replace` de uma frase literal
     Reproduzir: alterar uma vírgula em `DEFAULT_TERMS[3].body`.
     Esperado: o ponto 4 continua a seguir a percentagem do sinal.
     Observado: `s.body.replace("O sinal de 30% destina-se", …)` deixa de casar e o contrato passa
       a dizer 30% numa proposta a 50%, em silêncio. O mesmo em inglês («The 30% deposit is
       intended»).
     Onde: src/lib/contract-terms.ts:78-81
     Causa provável: composição por substituição de texto literal, sem marcador nem teste que
       garanta que a substituição aconteceu.
     Correção proposta: o ponto 4 composto como o ponto 3 (frase inteira montada com o número),
       ou um teste que exija que a saída de `termosPara(50)` não contenha «30%» fora da cláusula
       de indemnização.
     Chega ao cliente? não hoje — é uma armadilha para a próxima edição do texto.
       Nota adicional: com `termosPara(70)` o ponto 4 sai «O sinal de 70% … tem direito a receber
       70% do valor total» — dois setentas de naturezas diferentes na mesma frase.

[A4-020] [Agente 4] [Assinatura] [Menor] A defesa «não assinar com o nome de quem recebe» não apanha metade de um casal
     Reproduzir: assinanteDoEmail({ nome: "Marta Gaspar", destinatario: "Marta Gaspar e João
       Pereira" })
     Esperado: a defesa dispara e assina a casa.
     Observado: devolve `{ nome: "Marta Gaspar", cargo: "" }` — passa. Com o destinatário
       exactamente igual («Marta Gaspar») a defesa dispara e devolve «Catarina Gaspar · Manager»,
       como deve.
     Onde: src/lib/email-assinatura.ts:137-141 (igualdade exacta depois de normalizar)
     Causa provável: o `destinatario` de um casal é «A e B» e o candidato é um nome só.
     Correção proposta: comparar também contra cada metade do `destinatario` partida por
       «e/&/and» — o `primeiroNome` (email-template-vars.ts) já sabe partir assim.
     Chega ao cliente? **não confirmado** — o nome de quem assina vem do cookie assinado da
       sessão, portanto é sempre alguém da casa. É uma rede com um buraco, não um defeito activo.

---

## Os três casos conhecidos — estado

| Caso | Estado | Onde está (ou falta) a defesa |
|---|---|---|
| «para o ␣no Torre de Palma» | **VIVO** — reproduzido tal e qual | Nenhuma. O bloco condiciona-se a `evento_local` e não a `evento_tipo` (email-templates-store.ts:396). O aviso `variaveisPorPreencher` acusa «Tipo de evento», mas é um aviso — não trava o envio. |
| «no Torre de Palma» | **VIVO** — 5 em 6 espaços reais saem errados | Nenhuma. A regra existe escrita (`orcamento/data.ts:84`) e a semente do modelo não a cumpre. |
| Email assinado com o nome do cliente | **CORRIGIDO** para a assinatura da casa: `assinanteDoEmail` (email-assinatura.ts:128-149) compara e cai na casa, com `log.warn` sem nomes; `construirValores` (email-template-vars.ts:249) tem compartimentos separados e `remetente_nome` só lê `remetente`. **MAS** o segundo sintoma («Assina: Líquen Events» em vez de uma pessoa) continua vivo pelo A4-006. |

## O que foi testado e não deu nada

- As 11 variáveis × 3 modelos × 2 línguas, uma de cada vez: fora do A4-001 e do A4-017, não há
  mais espaços duplos nem vírgulas órfãs. «Olá ,» e «…consultada aqui: » aparecem, mas com
  `porPreencher` a nomeá-los — são o comportamento documentado, não defeitos.
- `variaveisPorPreencher` acerta em todos os casos: nunca acusou uma variável guardada por
  `{{#se}}`, nunca deixou passar uma a descoberto.
- Nenhuma variável trocada: `construirValores` nunca deixa um valor do destinatário chegar a
  `remetente_nome`, mesmo com todos os compartimentos vazios.
- `contract-terms.ts` não tem marcadores nenhuns — não há por onde partir uma frase.
- `resolverLigacaoDaProposta` troca TODAS as ocorrências (`split`/`join`), e
  `preencherMarcadores` usa `replaceAll` — nenhum dos dois deixa uma segunda ocorrência por
  trocar.
- Escape: o corpo escapa, o assunto não, nos quatro caminhos (`renderTemplate`,
  `renderizarCorpo`/`renderizarAssunto`, `renderPreview`/`renderPreviewSubject`,
  `corpoEnviavel`). Coerente.

## Como reproduzir

Todos os `Observado` acima são saída literal de scripts descartáveis em `/tmp` (fora do
repositório), corridos com `npx vitest run --config /tmp/<scratch>/caca.config.ts`, com o config
a apontar `root` para o repositório e `include` para os ficheiros `*.caca.ts` do /tmp — os
módulos importados são os de produção (`@/lib/email-template-engine`, `@/lib/proposal-doc`,
`@/lib/email-templates-store`, `@/lib/email-rascunho-do-envio`), sem cópias nem imitações. Nada
foi escrito no repositório (`git status` limpo).
