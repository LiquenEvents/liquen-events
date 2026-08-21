# Agente 1 — Caminhos infelizes

Nove defeitos confirmados (mais um não confirmado), seis chegam ao casal (PDF, email ou
página da proposta). O pior é o dinheiro: no PDF e no email da proposta, Subtotal + IVA
não dá o TOTAL impresso ao lado — e o segundo pior imprime «Invalid Date» na folha do
casal.

---

[A1-001] [Agente 1] [Proposta / PDF+email] [Grave] Subtotal + IVA não fecha o TOTAL na folha que o casal lê
     Reproduzir: Back office → um pedido → «Gerar proposta» (ProposalBuilder) →
       uma linha só: descrição qualquer, Qt. 1, Unit. 36,50 → IVA 23% →
       «Gerar PDF e enviar ao cliente».
       No ecrã e no PDF lê-se: Subtotal 36,50 € · IVA (23%) 8,40 € · TOTAL 44,89 €.
     Esperado: 36,50 + 8,40 = 44,90. As três linhas de uma folha de dinheiro têm de fechar.
     Observado: TOTAL 44,89 €. O IVA real é 8,395 (arredonda para cima ao mostrar) e o
       total real 44,895 (arredonda para BAIXO, porque em vírgula flutuante é
       44,89499999…). Cada parcela é arredondada só na altura de a desenhar; a conta
       nunca é arredondada. Verificado numericamente: dos primeiros 200 000 cêntimos de
       subtotal, falham 36,50 · 85,50 · 158,50 · 183,50 · 279,50 · 304,50 · 329,50 · 354,50 …
       (todos os subtotais terminados em ,50 com dezena ímpar de euros e mais casos).
     Onde: src/app/api/orcamento/[id]/proposta/route.ts:109-111
       (`subtotal` / `vat = subtotal * vatRate` / `total = subtotal + vat`, sem `round2`);
       impresso em src/lib/proposal-pdf.ts:267-274 e no corpo do email na mesma rota
       (linha 335). O mesmo cálculo por arredondar está no ecrã:
       src/app/[lang]/(site)/orcamento/admin/ProposalBuilder.tsx:499-504.
     Causa provável: a casa já tem a regra escrita e explicada — `round2` em
       src/lib/money.ts:37, e o mesmo erro já foi corrigido em
       src/lib/orcamento/pricing.ts:96 («o IVA é 23% DAQUELE número, o que lá está
       escrito, e não de um número intermédio que ninguém vê»). Esta rota ficou de fora.
     Correção proposta: `const subtotal = round2(soma); const vat = round2(subtotal * vatRate);
       const total = round2(subtotal + vat);` na rota, e o mesmo trio no
       ProposalBuilder para o ecrã dizer o que a folha diz. (De passagem: o
       ProposalBuilder.tsx:11 tem uma cópia local do `Intl` — a quinta — que devia
       importar `eur` de `@/lib/money`.)
     Chega ao cliente? sim

[A1-002] [Agente 1] [Pedido de orçamento / datas] [Grave] Uma data que não é uma data imprime «Invalid Date» no PDF do casal
     Reproduzir: dois caminhos, o primeiro é determinístico.
       (a) `POST /api/orcamento` com `form.date = "20265-08-20"` (ano com cinco
           dígitos). O esquema aceita — `date` é só `trimmed(20)`. Depois, no back
           office, gerar a proposta desse pedido: o PDF anexo ao email do casal traz,
           na linha do EVENTO, a palavra «Invalid Date».
           Confirmado em Node: `new Date("20265-08-20T12:00:00").toLocaleDateString("pt-PT")`
           → `"Invalid Date"`.
       (b) O mesmo valor entra pelo campo «Data do evento» do back office
           (`quoteUpdateSchema.date` é `shortDate`, ou seja, `trimmed(30)` — não é
           validado como dia de calendário) e, muito provavelmente, por um engano de
           dedo no `<input type="date">` do formulário público, onde o Chrome aceita
           anos até seis dígitos e o `okData` compara TEXTO (`"20265-08-20" >= "2026-08-20"`
           é verdadeiro). Este último caminho fica não confirmado num browser real.
     Esperado: ou a data é recusada à entrada, ou o documento omite a linha — nunca
       «Invalid Date» impresso numa folha que vai para um casal.
     Observado: além do PDF, mais dois estragos do mesmo valor:
       · o email de confirmação automático diz ao casal que a data está «ainda a
         definir» apesar de a terem indicado (`longDate` devolve `""` e o modelo cai
         no `t.dateOpen`) — src/lib/workdays.ts:14-15 e
         src/lib/client-confirmation.ts:242,292;
       · o evento nunca aparece no calendário nem na agenda do back office, porque
         essas vistas filtram por `isDateKey`. Desaparece em silêncio.
     Onde: src/lib/proposal-pdf.ts:223; validação em falta em src/lib/validation.ts:49
       (`date: trimmed(20)`) e :310 (`date: shortDate`).
     Causa provável: a própria casa já escreveu o remédio e a razão — `dataIso`
       (src/lib/validation.ts:210), com o comentário a dizer que «um ano com cinco
       dígitos … imprime Invalid Date na factura, no email da proposta e no PDF».
       Foi aplicado à `validUntil` da proposta e nunca à `date` do pedido.
     Correção proposta: passar `date` (e `endDate`) por `dataIso` nos dois esquemas —
       recusando no formulário público com a frase do dicionário, e no back office com
       «Data inválida — usa o formato aaaa-mm-dd», que já existe. E, como rede,
       guardar o `meta.date` do PDF com `dataIso` antes de o desenhar.
     Chega ao cliente? sim

[A1-003] [Agente 1] [Proposta / PDF] [Grave] Nome de cliente comprido sai fora da folha e passa por cima da coluna «EVENTO»
     Reproduzir: pedido cujo «Nome» tenha ~110 caracteres (o esquema aceita até 120 —
       nomes legais inteiros, «Maria … e Castro Vasconcelos Meneses Portugal Sousa
       Coutinho de Mendonça Cabral») → gerar a proposta.
     Esperado: o nome quebra em duas linhas, ou é aparado com reticências.
     Observado: é desenhado numa linha só, a partir de x=56. Medido com a própria
       Helvetica-Bold do pdf-lib: 622,9 pt de largura, quando a folha útil tem 483,3 pt
       e a coluna «EVENTO» começa aos 326 pt. O nome atravessa o tipo de evento e sai
       pela direita da página — o pdf-lib desenha na mesma, sem cortar nem avisar.
       Pelo mesmo caminho passam `meta.eventType` e `meta.location` (linha do evento).
     Onde: src/lib/proposal-pdf.ts:218 (`text(p.clientName || "—", MARGIN, y, …)`),
       e :219, :229 para o evento e o local.
     Causa provável: o ficheiro tem uma função de quebra (`quebrar`, :45) usada só na
       tabela e nas notas; o cabeçalho desenha texto cru.
     Correção proposta: passar o nome, o tipo de evento e a linha do evento pelo
       `quebrar` com `maxWidth = 270` (a largura da coluna) e desenhar até duas linhas,
       descendo o `y` em conformidade.
     Chega ao cliente? sim

[A1-004] [Agente 1] [Proposta / construtor] [Grave] Uma linha com a quantidade apagada desaparece do PDF sem aviso nenhum
     Reproduzir: Back office → «Gerar proposta» → três linhas preenchidas → apagar o
       conteúdo do campo «Qt.» de uma delas (fica vazio) → o botão continua activo
       porque as outras dão subtotal > 0 → enviar.
     Esperado: ou o envio é travado a apontar a linha incompleta, ou a linha segue.
       Uma rubrica escrita à mão não pode evaporar-se.
     Observado: `Number("")` é 0, a linha fica com `qty: 0`, e o servidor filtra-a
       (`lineItems.filter(it => it.description && it.qty > 0)`). O PDF que o casal
       recebe não tem essa rubrica, a resposta não diz que faltou nada, e o histórico
       do pedido regista o envio como bem sucedido. O mesmo acontece a uma linha com
       preço mas sem descrição.
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalBuilder.tsx:785
       (`onChange={(e) => update(i, { qty: Number(e.target.value) })}`, com `min={1}`
       que nunca é aplicado — o envio é um `onClick`, não uma submissão de formulário)
       e src/app/api/orcamento/[id]/proposta/route.ts:99.
     Causa provável: o filtro do servidor foi escrito para limpar linhas em branco e
       acabou a apagar linhas em que ela ESCREVEU alguma coisa.
     Correção proposta: no cliente, tratar o campo vazio como texto em edição (o mesmo
       padrão que o preço já usa, `precoEmEdicao`) e travar o envio com uma frase que
       nomeie a linha; no servidor, distinguir «linha totalmente vazia» (descartar) de
       «linha começada» (recusar com 400 a dizer qual é).
     Chega ao cliente? sim

[A1-005] [Agente 1] [Proposta / PDF] [Médio] Uma palavra sem espaços na descrição invade as colunas do preço
     Reproduzir: linha com a descrição
       `Arranjo-floral-de-mesa-comprida-com-velas-e-eucalipto-personalizado`
       (67 caracteres, sem espaços — é o que sai de colar um nome de ficheiro ou um
       endereço) → gerar o PDF. O mesmo vale para um endereço colado no campo «Notas».
     Esperado: a palavra é partida (ou o texto é aparado) para caber nos 263,3 pt da
       coluna «DESCRIÇÃO».
     Observado: `quebrar` só parte nos espaços — uma palavra maior do que a coluna é
       empurrada inteira para uma linha. Medido: 310,3 pt contra 263,3 pt disponíveis;
       a palavra chega aos 366,3 pt e passa por baixo da quantidade (alinhada aos
       353,3 pt) e do preço unitário.
     Onde: src/lib/proposal-pdf.ts:45-63 (`quebrar`), usada em :237 e :292.
     Causa provável: a função foi escrita para prosa, e recebe texto colado.
     Correção proposta: quando uma palavra sozinha excede `maxWidth`, parti-la por
       caracteres (medindo) antes de a empurrar para a linha seguinte.
     Chega ao cliente? sim

[A1-006] [Agente 1] [Formulário público] [Médio] «Nº de pessoas: 999999» é recusado com «demasiado longo … 100000 caracteres»
     Reproduzir: /orcamento → preencher tudo → escrever `999999` no «Nº de pessoas»
       (o campo aceita seis dígitos, `maxLength={6}`) → Enviar.
     Esperado: uma frase que fale de convidados — «Indique um número de convidados até
       100 000», por exemplo — e, de preferência, dita no próprio campo antes do envio.
     Observado: 400 com «O campo «Nº de pessoas» é demasiado longo. Encurte-o para
       100000 caracteres ou menos.» Confirmado a correr o esquema: o zod devolve
       `code: "too_big", maximum: 100000` para um NÚMERO, e a rota trata todos os
       `too_big` como comprimento de texto. O visitante fica sem perceber o que fazer,
       na página que paga a casa.
     Onde: src/app/api/orcamento/route.ts:109-119 (o ramo `too_big`);
       o campo em src/lib/validation.ts:48 (`guests … .max(100000)`);
       a validação do cliente (`okPessoas = Number(pessoas) > 0`, OrcamentoForm.tsx:561)
       não tem tecto nenhum, por isso deixa passar.
     Causa provável: o ramo `too_big` foi escrito a pensar em `name`, `location` e
       `notes` — todos texto — e o `guests` cai lá dentro.
     Correção proposta: distinguir pelo `issue.origin` (`"number"` vs `"string"`) e ter
       uma frase para números; e pôr o mesmo tecto no `okPessoas` do formulário, para a
       recusa acontecer ao lado do campo e não depois do envio.
     Chega ao cliente? sim

[A1-007] [Agente 1] [Proposta / PDF] [Menor] Quantidade decimal sai com ponto inglês na folha portuguesa
     Reproduzir: escrever `2.5` no campo «Qt.» (o `type="number"` aceita) → gerar o PDF.
     Esperado: «2,5», como todo o resto do documento.
     Observado: a coluna QT. desenha `String(item.qty)` → «2.5». O dinheiro à frente
       está em português («1.250,00 €») e a quantidade em inglês, na mesma linha.
     Onde: src/lib/proposal-pdf.ts:247.
     Causa provável: `String()` em vez de um formatador.
     Correção proposta: `new Intl.NumberFormat("pt-PT").format(item.qty)`.
     Chega ao cliente? sim

[A1-008] [Agente 1] [Biblioteca de temas / carregamento] [Médio] Um ficheiro mau a meio do lote aborta o lote e esconde as fotos que já subiram
     Reproduzir: Temas → escolher 20 ficheiros de uma vez, sendo o 5.º um PDF (ou um
       JPEG de 15 MB, ou um ficheiro corrompido) → carregar.
     Esperado: as boas ficam, a má é apontada pelo nome, e a resposta diz as duas coisas.
     Observado: os quatro primeiros JÁ FORAM escritos no bucket, mas o `return` da
       recusa deita fora o array `uploaded` — a resposta é só 415/413/500 e a grelha não
       mostra nada do que subiu. Quem carregar outra vez fica com metade das fotos
       marcadas como «já estava neste tema», sem perceber porquê (só ficam visíveis
       depois de recarregar a página).
     Onde: src/app/api/temas/[id]/imagens/route.ts:270-302 (os três `return` dentro do
       ciclo `for`, incluindo o do `garantirFormatoImprimivel`).
     Causa provável: a recusa por ficheiro foi escrita como recusa do pedido inteiro.
     Correção proposta: acumular os recusados numa lista `rejeitados: [{nome, motivo}]`
       e responder 200 com `{ images, duplicates, rejeitados }`, como já se faz com os
       repetidos — que é exactamente a mesma decisão, já tomada e já escrita a três
       linhas de distância.
     Chega ao cliente? não

[A1-009] [Agente 1] [Back office / validação] [Médio] Recusas do zod chegam ao ecrã em inglês e sem nomear o campo
     Reproduzir: três caminhos, todos de dez segundos:
       · construtor de propostas → preço unitário `-100` (um desconto) → Enviar →
         «Too small: expected number to be >=0»;
       · descrição de linha com mais de 500 caracteres → «Too big: expected string to
         have <=500 characters»;
       · Serviços → guardar um serviço com nome acima de 200 caracteres → a mesma coisa.
     Esperado: uma frase em português que diga o campo e o limite, como a rota pública
       já faz (`mensagemDeValidacao`).
     Observado: `firstError` devolve `err.issues[0].message`, que é o texto interno do
       zod. O ecrã mostra-o tal e qual, dentro de um `role="alert"`.
     Onde: src/lib/validation.ts:410 (`firstError`), usada em
       src/app/api/orcamento/[id]/proposta/route.ts:77,
       src/app/api/servicos-catalogo/route.ts:63 e em mais rotas de administração.
     Causa provável: só a rota do formulário público ganhou frases próprias; as do back
       office ficaram com o texto da biblioteca.
     Correção proposta: dar mensagens ao esquema (`.max(500, "A descrição de uma linha
       não pode passar de 500 caracteres.")`, `.min(0, "O preço não pode ser negativo —
       para um desconto, usa uma linha com valor a menos.")`) ou generalizar o
       `mensagemDeValidacao` da rota pública, que já sabe traduzir `too_big` e nomear o
       campo.
     Chega ao cliente? não

[A1-010] [Agente 1] [Carregamento de fotos] [Menor] não confirmado — ficheiro de 100 MB não tem travão antes de o browser o abrir
     Reproduzir: Temas ou Estúdio → arrastar um TIFF/JPEG de ~100 MB.
     Esperado: recusa imediata pelo tamanho, antes de qualquer descodificação.
     Observado (por leitura): não há teste de tamanho antes de `prepare()`. O ficheiro é
       descodificado no browser (`createImageBitmap`) e só depois reduzido; o comentário
       do próprio ficheiro avisa que uma foto de 4032×3024 ocupa ~48 MB descomprimida e
       que há tantas em voo quantos os trabalhadores. O tecto de 12 MB só existe do lado
       do servidor, ou seja, depois de a máquina dela já ter feito o trabalho todo.
       Não consegui confirmar o desfecho (separador pendurado? erro? sucesso lento?) sem
       um browser — fica registado por isso mesmo.
     Onde: src/app/[lang]/(site)/orcamento/admin/image-prep.ts:474-500;
       tecto do servidor em src/app/api/temas/[id]/imagens/route.ts:37.
     Causa provável: a redução é feita ANTES de haver limite, porque o limite é do
       servidor e a redução existe justamente para o respeitar.
     Correção proposta: um tecto de entrada no cliente (por exemplo 60 MB) com a mesma
       frase do `recusa-de-imagem`, antes de decodificar seja o que for.
     Chega ao cliente? não

---

## Já conhecido e escrito no código

Estes apareceram na caça, têm consequências visíveis, e já estão explicados por
comentários longos no próprio ficheiro como limitações conhecidas ou decisões
tomadas. Não contam como defeitos novos.

| O que se vê | Onde está escrito |
|---|---|
| Um preenchimento automático do gestor de palavras-passe no campo escondido faz o pedido ser descartado em silêncio, com o visitante a receber uma página de confirmação para um id que não existe | `src/app/api/orcamento/route.ts:768-782` — o comentário assume o risco e regista o descarte com o user-agent para o falso positivo ser observável |
| Emoji e alfabetos não latinos viram «?» (ou desaparecem, no documento novo) nos PDFs | `src/lib/pdf-text.ts:1-63` e :218-264 |
| As fotos acima de `MOOD_BOARD_MAX_IMAGES` não são impressas | `ProposalStudio.tsx:3890-3895` e `MoodBoardIndice`, com aviso no ecrã e marca «fora do PDF» |
| O `min` do campo da data não existe no primeiro desenho (página pré-gerada) | `OrcamentoForm.tsx:324-339`, com o `okData` a segurar a regra do lado do envio |
| A data do evento é texto livre no back office («a definir») e as vistas defendem-se com `isDateKey` | `admin/util.ts:48-57` — mas ver A1-002: a folha do PDF não se defende |
| O tecto de 4000 caracteres da mensagem está repetido no cliente e no servidor de propósito | `OrcamentoForm.tsx:100-105` e `validation.ts:50-60` |
| Uma proposta gravada mas não enviada é reaproveitada no reenvio, em vez de nascer outra | `api/orcamento/[id]/proposta/route.ts:113-146` |

## O que NÃO foi coberto

Não chegou ao documento novo da proposta (`proposal-doc-pdf.ts`, 3 486 linhas — tem
bateria própria de testes para vazios, transbordos e caracteres), nem ao contrato e à
factura, nem às escolhas do casal na página pública, nem ao restauro de cópias de
segurança. Os defeitos A1-001 a A1-005 são todos do caminho **ProposalBuilder →
/api/orcamento/[id]/proposta → proposal-pdf.ts**, que é o construtor simples; o Estúdio
segue outro caminho e merece a mesma passagem.

## Avisos para quem corrigir

- **A1-001** e **A1-004** afectam propostas já enviadas — vale a pena ver se algum PDF no
  histórico saiu com o cêntimo a menos ou com uma rubrica a menos.
- Nenhuma das correcções propostas foi aplicada. O repositório está exactamente como estava.
