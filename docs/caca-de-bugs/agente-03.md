# Agente 3 — Cálculos

O núcleo das contas (`totaisDaProposta`, `money.ts`, `resolveProposalMoney`) está **bem feito e
fecha ao cêntimo**: as defesas contra o defeito da Tara e do Marty existem, são reais e foram
verificadas à mão — uma conversão por número, o IVA por subtracção, o saldo por subtracção, e o
PDF e o editor a lerem a MESMA chamada.

Onde o dinheiro se estraga é nas **bordas**: o texto livre dos valores adicionais
(`normalizarValor` concatena grupos de dígitos e produz 8.001.200 € ou zero), e a **página web
do casal**, que é a única das quatro superfícies que ainda faz contas próprias — recalcula o
sinal à mão e imprime a coluna dos adicionais em unidade diferente da do PDF.

Doze achados: 1 crítico, 5 graves, 3 médios, 4 menores.

## Método

Script descartável em `/tmp/.../scratchpad/` (fora do repositório), a importar as funções REAIS
via `jiti` com o alias `@ → src`. Nenhum ficheiro do repositório foi tocado. Os testes
existentes lidos como referência (`money.test.ts`, `money-invariantes.test.ts`,
`proposal-budget.test.ts`, `proposal-budget.adicionais.test.ts`,
`proposal-doc-math.adversarial.test.ts`, `dinheiro-nos-documentos.test.ts`) passam todos: 163
testes, 6 ficheiros, verdes.

### Tabela das combinações verificadas à mão

Todas passadas por `totaisDaProposta(doc, pctSinal)`, com os três invariantes conferidos um a
um (`serviços+adicionais = TOTAL`, `TOTAL+IVA = a pagar`, `sinal+saldo = a pagar`).

| # | Entrada | Subtotal | Adicionais | TOTAL | IVA 23% | A pagar | Sinal | Saldo | Fecha? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `totalAmount 10000`, **acresce** | 10.000,00 € | 0,00 € | 10.000,00 € | 2.300,00 € | 12.300,00 € | 3.690,00 € (30%) | 8.610,00 € | ✔ |
| 2 | `totalAmount 12300`, **incluído** | 10.000,00 € | 0,00 € | 10.000,00 € | 2.300,00 € | 12.300,00 € | 3.690,00 € | 8.610,00 € | ✔ |
| 3 | base 10.000 + adicional **que soma** «1.550,00 €» | 10.000,00 € | 1.550,00 € | 11.550,00 € | 2.656,50 € | 14.206,50 € | 4.261,95 € | 9.944,55 € | ✔ |
| 4 | mesmo, adicional **já incluído** no valor escrito | 8.450,00 € | 1.550,00 € | 10.000,00 € | 2.300,00 € | 12.300,00 € | 3.690,00 € | 8.610,00 € | ✔ |
| 5 | bruto 3.025,80 **incluído** + «75,00 €» calado (o caso Tara/Marty) | 2.399,02 € | 60,98 € | 2.460,00 € | 565,80 € | 3.025,80 € | 907,74 € | 2.118,06 € | ✔ |
| 6 | Organização: 6.500 + 1.850 impressos, **2 linhas sem preço**, total 12.500 | 12.500,00 € | 0,00 € | 12.500,00 € | 2.875,00 € | 15.375,00 € | 4.612,50 € | 10.762,50 € | ✘ — avisa correctamente |
| 7 | bruto 3.025,79 (**cêntimos que não dividem certo**), sinal 30% | 2.459,99 € | 0,00 € | 2.459,99 € | 565,80 € | 3.025,79 € | 907,74 € | 2.118,05 € | ✔ |
| 8 | total «a definir» | 0,00 € | 0,00 € | 0,00 € | 0,00 € | 0,00 € | 0,00 € | 0,00 € | ✔ |
| 9 | adicionais (1.550) **maiores que o total** (1.000) | −550,00 € | 1.550,00 € | 1.000,00 € | 230,00 € | 1.230,00 € | 369,00 € | 861,00 € | ✘ — avisa |
| 10 | **desconto** escrito como adicional «−500,00 €», que soma | 10.000,00 € | −500,00 € | 9.500,00 € | 2.185,00 € | 11.685,00 € | 3.505,50 € | 8.179,50 € | ✔ |
| 11 | base 10.000, **sinal 33%** | 10.000,00 € | 0,00 € | 10.000,00 € | 2.300,00 € | 12.300,00 € | 4.059,00 € | 8.241,00 € | ✔ |
| 12 | **desconto maior que o total**: base 10.000 + «−12.000,00 €» | 10.000,00 € | −12.000,00 € | −2.000,00 € | −460,00 € | **−2.460,00 €** | 0,00 € | 0,00 € | ✘ — ver A3-006 |

Ida e volta `totalAmountParaBase → resolveProposalMoney`: **300.000 bases (0,01 € a 3.000,00 €)
× 2 modos = 600.000 casos, zero desvios.**

---

[A3-001] [Agente 3] [Orçamento/Adicionais] [Crítico] `normalizarValor` cola todos os grupos de dígitos do texto e inventa milhões
     Reproduzir: um valor adicional com o texto «de 800 a 1.200 €» (ou «800 a 1.200 €», ou
       «entre 800 € e 1.200 €») num documento de base 10.000 € + IVA, com «os adicionais somam
       ao valor». Chamar totaisDaProposta(doc, 30).
     Esperado: 800 (o primeiro número), ou nada legível — como «a definir», que é o que a
       função promete no comentário («o que tem um número conta; o resto não conta e também
       não estraga nada»).
     Observado: 8.001.200,00 € de adicionais. TOTAL 8.011.200,00 €, a pagar 9.853.776,00 €,
       sinal 30% 2.956.132,80 €. Medido, não hipotético. A causa é a linha 142:
       `texto.replace(/[^\d,.\-]/g,"")` deita fora as LETRAS mas junta os dígitos que estavam à
       volta delas — «de 800 a 1.200» fica «8001.200» e o «.200» é lido como separador de
       milhares. O mesmo defeito, em variantes mais discretas:
         «1.500 € + 23% IVA»  → 1,50 €  (perde 1.498,50 €)
         «2 x 450,00 €»       → 2.450,00 € (em vez de 900,00 €)
         «450,00 € por pessoa (x2)» → 450,002 (salva-se pelo round2)
     Onde: src/lib/proposal-budget.ts:137-160 (`normalizarValor`), consumida por
       `somaDosExtrasSemIva` (:265) e daí por `dinheiroDaProposta` (:36) e `totaisDaProposta`
       (:626). Note-se que `parseMoneyText` (src/lib/proposal-doc.ts:1158) faz o CONTRÁRIO e lê
       «de 800 a 1.200 €» como 800: o mesmo texto tem dois leitores que discordam.
     Causa provável: a limpeza foi escrita a pensar em «1 500 €» e no espaço inquebrável colado
       de uma folha de cálculo, e não em texto com prosa pelo meio — que é exactamente o que o
       cabeçalho do módulo diz que estes campos são.
     Correção proposta: extrair a PRIMEIRA corrida monetária antes de normalizar, com a mesma
       regra do `parseMoneyText` (`/\d(?:[\d.,\s ]*\d)?/`), e só depois aplicar as regras
       da vírgula/ponto. As duas funções passam a responder o mesmo ao mesmo texto.
     Chega ao cliente? sim — vai ao PDF, à página, ao email («valor a pagar»), ao
       `proposals.total` gravado, ao sinal e à factura.

[A3-002] [Agente 3] [Orçamento/Adicionais] [Grave] Um adicional com vírgula dentro da ressalva desaparece do total, mas o número continua impresso ao lado do nome
     Reproduzir: valor adicional com `valueText` = «75,00 € (Évora, ida e volta 120 km)» — a
       forma exacta em que uma proposta importada de PDF chega
       (src/lib/proposta-de-pdf/campos.ts:1818 grava o texto impresso tal e qual). Chamar
       totaisDaProposta.
     Esperado: 75,00 € somados à base (ou, no mínimo, um aviso).
     Observado: `normalizarValor` devolve `null` — a limpeza deixa «75,00,120», duas vírgulas,
       `Number(...)` dá NaN. Adicionais = 0,00 €; o total não muda. O PDF imprime na coluna do
       dinheiro «—» (proposal-doc-pdf.ts:2604) mas imprime ao lado do rótulo, entre parênteses,
       o texto inteiro dela: «Deslocação (75,00 € (Évora, ida e volta 120 km))   —». O casal lê
       75 € numa linha cujo valor não está em lado nenhum da soma.
     Onde: src/lib/proposal-budget.ts:142 e :189-193 (`valoresDosExtras` filtra os nulos em
       silêncio); impressão em src/lib/proposal-doc-pdf.ts:2563-2606.
     Causa provável: a mesma da A3-001.
     Correção proposta: a mesma correcção da A3-001 resolve este caso (a primeira corrida é
       «75,00»); além disso, `totaisDaProposta` devia acrescentar a `porQueNaoFecha` uma linha
       por cada adicional com texto e sem número legível — hoje um valor que não se consegue
       ler é indistinguível de um «a definir» deliberado.
     Chega ao cliente? sim.

[A3-003] [Agente 3] [Página do casal] [Grave] O sinal impresso na página é recalculado à mão e diverge um cêntimo do PDF e da factura
     Reproduzir: proposta com total a pagar 12.000,15 € e sinal de 30%. Abrir o PDF e a página
       `/proposta/[token]` lado a lado.
     Esperado: o mesmo número nos dois. O comentário três linhas acima promete-o à letra: «Os
       seis números saem de `totaisDaProposta`, de uma vez: aqui não se faz uma única conta.»
     Observado: faz-se uma. O PDF e o estúdio dizem «Sinal 30% 3.600,05 €» (`totais.sinal`, que
       é `round2` com o empurrão contra o meio-cêntimo de vírgula flutuante); a página diz «30%
       na adjudicação: 3.600,04 €», porque calcula `totais.aPagar * (sinalPct/100)` e entrega o
       número cru ao `Intl`, que arredonda 3.600,045 para baixo. A factura do sinal é emitida
       sobre `totais.sinal` — logo é a página que está errada.
       Frequência medida: 2,50 % de todos os totais entre 1.000 € e 5.000 € (10.002 em 400.001)
       a 30 %. A 40 % e a 50 % não acontece nunca — é uma armadilha específica da percentagem
       da casa. Outros exemplos: a pagar 12.000,55 € (PDF 3.600,17 € / página 3.600,16 €);
       12.001,05 € (3.600,32 / 3.600,31).
     Onde: src/app/[lang]/(privado)/proposta/[token]/Documento.tsx:948
     Causa provável: `totais.sinal` já lá está a três linhas de distância; a expressão foi
       escrita à mão porque a linha nasceu como texto de apoio e não como número do documento.
     Correção proposta: `eur(totais.sinal)`. É a mesma leitura que o PDF, o estúdio, o portal e
       `semear-producao` já fazem.
     Chega ao cliente? sim — é a linha que ele lê por baixo do total.

[A3-004] [Agente 3] [Página do casal] [Grave] A coluna dos valores adicionais na página está numa unidade e o TOTAL logo abaixo noutra — a coluna não soma
     Reproduzir: proposta em modo «IVA incluído», campo do total 3.025,80 €, um adicional
       «Deslocação da Equipa Líquen» com «75,00 €» (sem dizer nada sobre IVA). Abrir a página
       do casal.
     Esperado: o que o PDF faz — imprimir na coluna o que o adicional acrescenta à BASE
       (60,98 €) e pôr o que ela escreveu entre parênteses ao lado do nome. O comentário do
       gerador explica-o por extenso: «imprimir 75,00 aqui era pôr uma parcela que não soma com
       as outras».
     Observado: a página imprime o texto CRU na coluna do dinheiro:
         Subtotal dos serviços      2.399,02 €
         Deslocação da Equipa Líquen   75,00 €
         TOTAL (sem IVA)            2.460,00 €
       2.399,02 + 75,00 = 2.474,02 ≠ 2.460,00. Catorze euros que a folha não explica, na página
       que o casal usa para carregar em «Aceito».
       Acontece também em documentos «+ IVA» quando a LINHA se declara «IVA incluído»:
       10.000,00 + «1.550,00 € (IVA incluído)» com TOTAL impresso 11.260,16 € — 289,84 € de
       buraco. Num documento «+ IVA» com o adicional calado (o caso normal) a coluna fecha, e é
       por isso que isto passa despercebido.
     Onde: src/app/[lang]/(privado)/proposta/[token]/Documento.tsx:886
       (`dinheiroEscrito(e.valueText)`), contra src/lib/proposal-doc-pdf.ts:2563-2606.
     Causa provável: a página herdou o desenho antigo da coluna e recebeu a correcção da UNIDADE
       só do lado do PDF.
     Correção proposta: copiar a regra do gerador — valor impresso = `somaDosExtrasSemIva([e],
       {mode: totais.modo, vatRate: totais.taxa})` com o «+» à frente, e o texto dela entre
       parênteses ao lado do rótulo. É a mesma função, já importada no módulo.
     Chega ao cliente? sim.

[A3-005] [Agente 3] [IVA] [Grave] «sem IVA» / «s/ IVA» num total é lido como «IVA incluído» — 23 % de diferença, e o mesmo texto numa LINHA é lido ao contrário
     Reproduzir: `resolveProposalMoney({ totalText: "3.000,00 € s/ IVA" })`. Caminho real: uma
       proposta antiga sem `totalVatMode`, ou uma proposta importada de PDF —
       src/lib/proposta-de-pdf/campos.ts:1573 e :1933 decidem o `totalVatMode` chamando
       `detectVatMode` sobre o texto impresso.
     Esperado: «acrescer» — 3.000 € é a base, o cliente paga 3.690 €. É o que `modoDeIvaDaLinha`
       responde ao mesmo texto.
     Observado: «incluido». Base 2.439,02 €, bruto 3.000 €. Uma proposta de 3.000 € + IVA
       importada de PDF passa a valer 2.439,02 € de base, e é esse número que segue para o
       sinal, para a factura e para a margem. Medido, lado a lado:
         "3.000,00 € + IVA"              detectVatMode=acrescer   linha=acrescer  ✔
         "3.000,00 € s/ IVA"             detectVatMode=incluido   linha=acrescer  ✘
         "3.000,00 € sem IVA"            detectVatMode=incluido   linha=acrescer  ✘
         "3.000,00 € (IVA não incluído)" detectVatMode=acrescer   linha=acrescer  ✔
     Onde: src/lib/proposal-doc.ts:1193-1201 (`detectVatMode`) contra
       src/lib/proposal-budget.ts:229-236 (`modoDeIvaDaLinha`), que tem `s\/\s*iva|sem\s+iva` e
       o outro não.
     Causa provável: as duas expressões foram escritas em momentos diferentes e a segunda foi a
       que aprendeu as formas que faltavam. O comentário de `modoDeIvaDaLinha` justifica bem
       porque é que as funções são DUAS (o silêncio significa coisas diferentes), mas não porque
       é que o vocabulário do «acresce» havia de ser diferente.
     Correção proposta: extrair a alternativa do «acrescer» para uma constante partilhada e as
       duas lêem-na. O que continua diferente — e deve — é só o que se faz com o silêncio.
     Chega ao cliente? sim.

[A3-006] [Agente 3] [Totais] [Grave] Desconto maior que o total: o PDF imprime «Total a pagar −2.460,00 €» e a página esconde o quadro inteiro
     Reproduzir: base 10.000 € + IVA, um valor adicional «Desconto comercial» com
       «−12.000,00 €», «os adicionais somam ao valor». Gerar o PDF e abrir a página.
     Esperado: as duas folhas a dizerem a mesma coisa, e um total negativo a não ser impresso
       como preço.
     Observado: `totaisDaProposta` devolve total −2.000,00 €, IVA −460,00 €, a pagar −2.460,00 €,
       sinal 0,00 € e saldo 0,00 € (o `splitSinal` faz `Math.max(0, total)`), e o aviso dispara.
       Mas o aviso só regista, não bloqueia (e está bem que não bloqueie), e depois:
         · o PDF entra no ramo `if (extras.length)` e desenha a escada inteira, com o número
           grande a dizer −2.460,00 €;
         · a página entra no ramo `else` (a condição é `totais.aPagar > 0`) e imprime só o texto
           que ela escreveu, sem escada nenhuma.
       Duas folhas do mesmo documento, uma com seis números negativos e a outra sem números.
     Onde: src/lib/proposal-doc-pdf.ts:2545 (`if (extras.length)`, sem guarda de sinal) contra
       Documento.tsx:870 (`totais.aPagar > 0`); a origem em src/lib/proposal-budget.ts:644-666.
     Causa provável: o ramo do PDF foi escrito para «há adicionais» e o da página para «há euros
       a somar» — duas perguntas parecidas que divergem exactamente no caso negativo.
     Correção proposta: uma condição só nos dois sítios (`totais.aPagar > 0`), e um degrau a
       mais em `porQueNaoFecha` para o total negativo.
     Chega ao cliente? sim.

[A3-007] [Agente 3] [Faseamento] [Médio] Duas percentagens de sinal no mesmo documento quando o sinal muda depois de o faseamento estar materializado
     Reproduzir: copiar uma proposta anterior para um pedido novo (botão «Criar a partir de» →
       `copiarParaPedido`, que clona o documento inteiro, faseamento incluído —
       src/lib/proposal-copy.ts:176). O documento de origem passou por `withProposalDefaults` no
       envio, logo traz `faseamento: ["30% na adjudicação;", "70% 1 mês antes;", …]` gravado. No
       estúdio, mudar a caixa «Sinal (%)» para 50 e gerar o PDF.
     Esperado: as duas percentagens do documento a dizerem o mesmo — é exactamente o defeito que
       `faseamentoPorOmissao` foi escrita para impedir.
     Observado: a defesa só funciona quando o campo está VAZIO (`doc.faseamento ??
       faseamentoPorOmissao(...)`). Com o array já materializado, `withProposalDefaults` devolve-o
       intacto: com `depositPercent: 50` continua a devolver «30% na adjudicação; 70% 1 mês
       antes;». O PDF imprime essa lista e, por baixo dela, «Sinal 50% …» e «Saldo 50% …»
       calculados de `depositPercentOf`. Efeito secundário na página do casal: `blocoEDaCasa`
       compara com `faseamentoPorOmissao(50)`, não bate, e a linha «50% na adjudicação: X €»
       desaparece em silêncio.
     Onde: src/lib/proposal-doc.ts:1450; src/lib/proposal-doc-textos.ts:1016 e :967; impressão em
       src/lib/proposal-doc-pdf.ts:3081-3096.
     Causa provável: só o caminho «documento sem faseamento» foi coberto; o documento COPIADO
       nunca está nesse caminho.
     Correção proposta: quando o faseamento gravado for, palavra por palavra, o da casa para
       ALGUMA percentagem (basta procurar o padrão `^(\d+)% na adjudicação;$` na primeira linha),
       regenerá-lo com a percentagem em vigor; o que ela reescreveu à mão continua a mandar.
     Chega ao cliente? sim — as duas percentagens saem impressas no mesmo PDF.

[A3-008] [Agente 3] [Modelo Organização] [Médio] O preço por linha é texto livre e o aviso «as contas não fecham» herda todos os defeitos de leitura
     Reproduzir: modelo Organização, rubrica com preço «6.500,00 € (inclui deslocação,
       montagem)»; outra com «de 800 a 1.200 €».
     Esperado: 6.500 e 800 (ou, no mínimo, que o aviso não diga um número que não existe).
     Observado: a primeira dá `null` — a rubrica passa a contar como «rubrica sem preço» apesar
       de ter um preço impresso na folha que o casal tem à frente, e a frase do aviso («2
       rubricas sem preço») deixa de descrever o papel. A segunda dá 8.001.200 e o aviso passa a
       acusar milhões de diferença. O campo é um `<input>` de texto sem normalização
       (ProposalStudio.tsx:7535), ao contrário do campo dos adicionais, que já foi convertido em
       campo numérico com selector de IVA.
     Onde: src/lib/proposal-budget.ts:339-362 (`somaDasLinhasEstimadas`) e :681-701 (o aviso);
       campo em ProposalStudio.tsx:7535.
     Causa provável: `budgetRows` ficou de fora da mesma arrumação que os adicionais receberam.
     Correção proposta: a correcção da A3-001 tapa a maior parte; a mais certa é dar a este campo
       o mesmo tratamento do adicional (número + selector de IVA + ressalva à parte).
     Chega ao cliente? não directamente — mas cega o único aviso que existe contra uma coluna que
       não soma, que é o defeito que ele foi escrito para apanhar.

[A3-009] [Agente 3] [Validade] [Médio] A data de validade do email é calculada quando o rascunho abre e a do PDF quando o envio acontece
     Reproduzir: abrir o ecrã de envio (POST /api/orcamento/[id]/email-rascunho) num dia e
       carregar em Enviar no dia seguinte (ou depois da meia-noite de Lisboa).
     Esperado: o email e o PDF a dizerem a mesma data — é a razão de ser da congelação que a rota
       do envio já faz e explica por extenso.
     Observado: o rascunho preenche `validade_data` com `resolveValidUntil(doc)` calculado NAQUELE
       instante (route.ts:96), e o corpo assim renderizado é o que viaja no `corpo` do envio. A
       rota do envio só congela `doc.validUntil` mais tarde (proposta-doc/route.ts:300). Com 60
       dias de validade e um envio adiado dois dias, o email promete «válida até 19 de outubro» e
       o PDF em anexo diz 21 de outubro.
     Onde: src/app/api/orcamento/[id]/email-rascunho/route.ts:96 contra
       src/app/api/orcamento/[id]/proposta-doc/route.ts:300.
     Causa provável: a congelação foi feita no envio, e o rascunho é anterior a ela.
     Correção proposta: congelar no RASCUNHO (`doc.validUntil ??= resolveValidUntil(doc)`) e o
       envio honra o que já lá está — `resolveValidUntil` é idempotente perante uma data
       explícita, portanto não muda mais nada.
     Chega ao cliente? sim — é a data pela qual ele decide.

[A3-010] [Agente 3] [IVA] [Menor] O rótulo da taxa de IVA arredonda de duas maneiras — «23,5%» no PDF e «24%» na página e no estúdio (não confirmado como alcançável)
     Reproduzir: `vatRate: 0.235`. O PDF chama `percentagemDoIva` (Intl com duas casas, sobre
       `round2(taxa*100)`); a página e o estúdio fazem `Math.round(taxa*100)`.
     Esperado: o mesmo rótulo nos três.
     Observado: PDF «IVA (23,5%)», página e estúdio «IVA (24%)» — sobre a MESMA linha de euros.
       Com 0,225: «22,5%» contra «23%».
       **Não confirmado** como alcançável hoje: o estúdio não tem campo de taxa e as taxas
       portuguesas (6, 13, 23) são inteiras; só o `ProposalBuilder` antigo aceita qualquer valor
       < 1 (ProposalBuilder.tsx:130). Fica registado porque é uma divergência de código, não de
       dados.
       Nota junta: `percentagemDoIva` não passa pelo `montanteNaLingua`, por isso numa folha
       inglesa uma taxa fraccionária sairia com a vírgula portuguesa («VAT (23,5%)») — a
       conversão existe (`PERCENTAGEM_PT`, money.ts:262) mas não é aplicada a esta string.
     Onde: src/lib/proposal-doc-pdf.ts:118-119; Documento.tsx:475; ProposalStudio.tsx:7891.
     Causa provável: três escritas independentes do mesmo rótulo.
     Correção proposta: exportar `percentagemDoIva` do `money.ts` e ler os três de lá, já passada
       pelo `montanteNaLingua` onde há língua.
     Chega ao cliente? sim (dois dos três sítios são o PDF e a página), se e quando uma taxa não
       inteira existir.

[A3-011] [Agente 3] [Total] [Menor] `parseMoneyText` perde o sinal negativo, e `resolveProposalMoney` ignora um `totalAmount` ≤ 0 caindo no texto
     Reproduzir: `parseMoneyText("-500,00 €")` → 500 (não −500; o `\d` inicial da expressão não
       apanha o menos). E `resolveProposalMoney({ totalAmount: -500, totalText: "1.000,00 € +
       IVA" })` → base 1.000 €.
     Esperado: um total negativo ou é recusado com ruído, ou é respeitado; hoje é substituído por
       outro número em silêncio.
     Observado: a guarda é `doc.totalAmount > 0` (proposal-doc.ts:1257), portanto um zero ou um
       negativo caem no texto livre — que pode ser um valor antigo que já não é o dela.
       `normalizarValor`, para o mesmo texto, devolve −500: mais um par de leitores que discordam
       do mesmo sinal.
     Onde: src/lib/proposal-doc.ts:1158-1188 e :1256-1259.
     Causa provável: o `> 0` foi escrito para apanhar o campo em branco («0 é campo por
       preencher»), e apanha também o negativo.
     Correção proposta: separar as duas perguntas — `Number.isFinite(totalAmount) && totalAmount
       !== 0` para decidir se o campo está preenchido, e deixar o negativo chegar às contas, onde
       já há aviso para ele (A3-006).
     Chega ao cliente? sim, no caminho em que o texto livre está desactualizado.

[A3-012] [Agente 3] [Validade] [Menor] Nada avisa quando a proposta continua válida DEPOIS do dia do casamento
     Reproduzir: pedido com `date` = 2026-09-05, proposta com 60 dias de validade enviada a
       2026-08-20 → `resolveValidUntil` = 2026-10-19, seis semanas depois do evento.
     Esperado: um aviso no estúdio, ao lado da caixa «Validade (dias)». A folha diz «esta
       proposta só é válida para o evento a realizar no dia …» e ao mesmo tempo «válida até» uma
       data posterior a esse dia — duas frases que se contradizem, ambas impressas.
     Observado: não há verificação nenhuma. `oQueFaltaParaEnviar` e a conferência não olham para
       a validade. A data ISO do evento existe no pedido (`quote.date`), portanto a comparação é
       possível sem depender do `doc.eventDate`, que é texto por extenso.
     Onde: src/lib/proposal-doc.ts:1382-1395; campo em ProposalStudio.tsx:7822.
     Causa provável: a validade foi tratada como propriedade da proposta e não como propriedade
       da relação proposta↔evento.
     Correção proposta: aviso suave (não bloqueio) quando `resolveValidUntil(doc) > quote.date`,
       com o número de dias de excesso.
     Chega ao cliente? sim — a data impressa é a que ele lê.
     Nota de arrumação encontrada pelo caminho: o comentário em
       src/app/api/orcamento/[id]/proposta-doc/route.ts:455 diz «30 por omissão» e
       `DEFAULT_VALID_DAYS` são 60.

[A3-013] [Agente 3] [Coerência PDF↔página] [Menor] «Sem os extras assinalados» sai com número no PDF e sem número nenhum na página
     Reproduzir: proposta com pelo menos uma linha marcada como extra e preços por linha
       preenchidos.
     Esperado: o mesmo número nas duas folhas — a razão de existir dessa linha é responder ao «e
       sem isso, quanto fica?» sem uma segunda proposta.
     Observado: o PDF imprime «Sem os extras assinalados   9.840,00 € + IVA»
       (proposal-doc-pdf.ts:2706-2714, via `totaisDasVersoes`); a página imprime só a contagem
       («1 linha assinalada como extra», Documento.tsx:860-863). Não é um número errado — é um
       número que existe num documento e não no outro, e é o número por que o casal vai pedir o
       desconto.
     Onde: Documento.tsx:860-863 contra src/lib/proposal-doc-pdf.ts:2703-2723.
     Causa provável: `totaisDasVersoes` (src/lib/orcamento/versoes-da-proposta.ts) não é lida
       pela página.
     Correção proposta: ler `totaisDasVersoes(doc)` também na página, com a mesma guarda
       (`comoOTotal.base > 0 && extras > 0`).
     Chega ao cliente? sim, por omissão.

---

## O que foi verificado e está CERTO

- **`round2` e o meio cêntimo.** O empurrão de quatro épsilons faz o que promete: 1,005 → 1,01,
  −1,005 → −1,01. É a única razão por que os totais do bloco fecham.
- **O invariante `gross === round2(base + vat)`** aguenta nos dois modos, e no modo «incluído» o
  IVA sai mesmo por subtracção — verificado no caso que o comentário cita (bruto 10.000,03 € →
  base 8.130,11 € e IVA 1.869,92 €, e não 1.869,93 €).
- **`splitSinal` fecha sempre**, incluindo quando o arredondamento come um cêntimo: 3.025,79 a
  30 % dá 907,74 + 2.118,05 = 3.025,79 exacto (combinação 7).
- **Ida e volta `totalAmountParaBase` ↔ `resolveProposalMoney`: 600.000 casos, zero desvios.**
- **A defesa contra o defeito da Tara e do Marty EXISTE e funciona.** Reproduzido o caso original
  (bruto 3.025,80, deslocação de 75 € num documento com IVA incluído): serviços 2.399,02 +
  adicionais 60,98 = 2.460,00; sinal 907,74 + saldo 2.118,06 = 3.025,80. Não há dupla conversão,
  e o `porQueNaoFecha` é a rede que apanha o dia em que voltar a haver.
- **Uma fonte só para os seis números** em todas as superfícies excepto uma: o PDF
  (`proposal-doc-pdf.ts:1124`), o estúdio (`ProposalStudio.tsx:2734`), a página
  (`Documento.tsx:442`) e a geração de pagamentos (`semear-producao.ts:338`) chamam a MESMA
  `totaisDaProposta(doc, depositPercentOf(doc))`. O email leva `dinheiroDaProposta(doc).gross`,
  que é o mesmo `aPagar` ao cêntimo. O que falha é só o que a página recalcula por fora (A3-003,
  A3-004).
- **`doc.validUntil` é congelado dentro do documento antes de o PDF ser desenhado**
  (proposta-doc/route.ts:300): a descarga pelo link do casal daqui a dois meses dá a mesma folha.
- **`proposals.total` é gravado bruto e com os adicionais** (`dinheiroDaProposta`, route.ts:453/503).
- **`depositPercentOf` é lida num sítio só** pelo estúdio, pela página, pelo PDF e pelas rotas de
  facturação — não foi encontrado nenhum «30» escrito à letra em caminho de dinheiro.
- **O «+ IVA» garantido** quando o texto do total não o diz está nos dois sítios (PDF
  `comIvaDito`, página `comIvaDito`) e com a mesma expressão.
- **`eur` (Intl, sem separador abaixo de cinco dígitos) só é usado no back office**; tudo o que
  sai para o cliente passa por `eurDocumento`/`milharesComPonto`/`montanteNaLingua`.
- **Os arrays paralelos do orçamento** (`budgetCosts`, `budgetScales`, `budgetOpcional`,
  `budgetItemsEn`) são alinhados por `comParalelos` em todas as mutações — não foi possível
  produzir um desalinhamento de índices por adicionar, apagar ou reordenar.
