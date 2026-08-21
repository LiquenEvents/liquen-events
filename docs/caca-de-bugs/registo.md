# Registo da caça exaustiva a bugs

Dez agentes especializados, uma passagem cada, **nenhuma correcção aplicada**. O repositório
está exactamente como estava antes desta caça: a única coisa que mudou foram estes onze
ficheiros de texto.

**131 entradas. 67 chegam ao cliente.** Os relatórios por agente estão em `agente-01.md` a
`agente-10.md`, cada um com o formato completo (Reproduzir / Esperado / Observado / Onde / Causa
provável / Correção proposta / Chega ao cliente). Este ficheiro é o índice, as contas, e a
leitura de conjunto.

---

## Por agente

| Agente | Total | Crítico | Grave | Médio | Menor | Chegam ao cliente |
|---|---|---|---|---|---|---|
| 1 — Caminhos infelizes | 10 | 0 | 4 | 4 | 2 | 7 |
| 2 — Estado e concorrência | 11 | 2 | 4 | 3 | 2 | 2 |
| 3 — Cálculos | 13 | 1 | 5 | 3 | 4 | 12 |
| 4 — Templates e variáveis | 20 | 3 | 8 | 5 | 4 | 14 |
| 5 — Ficheiros e imagens | 10 | 1 | 4 | 3 | 2 | 5 |
| 6 — Fluxos completos | 14 | 1 | 4 | 6 | 3 | 10 |
| 7 — Permissões e segurança | 7 | 0 | 1 | 3 | 3 | 2 |
| 8 — Consistência de dados | 20 | 1 | 9 | 6 | 4 | 7 |
| 9 — Erros silenciosos | 14 | 1 | 5 | 6 | 2 | 3 |
| 10 — Integrações | 12 | 2 | 3 | 4 | 3 | 5 |
| **Total** | **131** | **12** | **47** | **43** | **29** | **67** |

## Os dez piores, e porquê

Ordenados por «quanto custa se acontecer × quão provável é acontecer», não por severidade
nominal. Todos chegam ao casal.

**1. A3-001 — o texto livre de um valor adicional pode virar 8.001.200 €.**
«de 800 a 1.200 €» escrito num valor adicional produz oito milhões de euros de adicionais. Não
é hipotético: foi medido, e a mesma limpeza também transforma «1.500 € + 23% IVA» em 1,50 € e
«2 x 450,00 €» em 2.450 €. O número errado vai ao PDF, à página, ao corpo do email, ao
`proposals.total` gravado, ao sinal e à factura. É o único defeito da lista que pode escrever um
número absurdo num documento com o nome dela em cima.

**2. A1-001 — Subtotal + IVA não dá o TOTAL impresso ao lado.**
36,50 + 8,40 = 44,89 na folha. Determinístico, reproduzível em trinta segundos, e acontece em
todos os subtotais terminados em ,50 com dezena ímpar. As três linhas de uma folha de dinheiro
que não fecham são a primeira coisa que um cliente atento vê. O `round2` que resolve isto já
existe na casa e já foi aplicado noutra rota, com o comentário a explicar porquê — esta ficou de
fora.

**3. A4-004 — a cláusula contratual congela na redacção «sem data» e nunca mais volta atrás.**
A capa diz «12 de setembro de 2026» e as Condições Gerais, três páginas à frente, dizem «válida
para a data do evento que vier a ser confirmada por escrito». É a folha que se relê quando há uma
discussão, e diz o contrário da capa. Arrasta atrás de si o A4-005: as condições de uma proposta
inglesa saem em português por causa desta mesma congelação.

**4. A10-002 — o email segue com um link para uma proposta que não existe.**
`updateProposal` devolve `null` sem lançar quando a linha desapareceu, e ninguém lê o valor de
retorno. O casal recebe o email, carrega no link e lê «proposta não encontrada». A rota irmã tem
o comentário «A persistence failure here is fatal — we do not send an un-acceptable proposal»; a
que se usa hoje não o cumpre.

**5. A10-001 — o email sai, o estado não grava, e a frase manda-a reenviar.**
A mensagem que ela lê é a que provoca o defeito: reenviar não é reconhecido como repetição (a
trava exige `status === "enviada"`, que é precisamente o que não gravou) e o casal recebe dois
emails com a mesma proposta. O facto do envio está gravado uma linha antes, em `registarEnvio`;
a trava não o consulta.

**6. A família das dimensões — A5-004 = A6-002 = A8-015.**
Três agentes independentes, a partir de três ângulos diferentes (imagens, fluxos, consistência),
chegaram ao mesmo sítio: as colunas `largura`/`altura` existem na base, são lidas por três
consumidores, e **nunca são escritas por ninguém**. Consequências, todas silenciosas: a página do
casal salta 10 833 px por baixo do dedo dele; as colunas do mood board nunca equilibram (a
queixa dos «buracos na grelha», que sobreviveu ao empacotamento guloso que foi escrito para a
resolver); a capa ao alto é recortada como se fosse deitada; e metade da verificação pré-envio é
código morto que responde «está tudo bem» (A6-004). Um `updateFoto` com mais dois campos fecha
os quatro.

**7. A6-005 — o estado da versão é calculado e nunca é desenhado.**
O `proposta-versao.ts` promete, por escrito, «o congelamento E O AVISO». O congelamento existe e
está correcto — verifiquei campo a campo e o selo não tem um único furo. O aviso não existe:
`estado` e `versaoVivaNumero` não têm um único consumidor em todo o `src`. O casal aceita a
versão 2, ela envia a 3, e ninguém — nem ele nem ela — vê em lado nenhum que há duas versões.

**8. A6-013 — apagar uma proposta mata o link que o casal tem no email.**
Sem guarda nenhuma, e a acção está sempre disponível, incluindo em propostas `enviada` e
`aceite`. Arrumar a lista das propostas antigas deixa o casal com um link morto; apagar a linha
aceite desfaz o congelamento em silêncio. A confirmação diz «esta ação não pode ser anulada» e
não diz o que é que se perde.

**9. A8-011 — «época alta» tem duas definições que discordam em Maio, Outubro e Dezembro.**
`getMonth()` base 0 lido como base 1. Um casamento em Maio não paga suplemento e a página de
confirmação diz-lhe que é época alta; um em Dezembro paga e a confirmação diz que não é. O valor
errado fica gravado no `priceBreakdown` e viaja para o email e para a margem do evento.

**10. A7-001 — os caminhos do armazenamento saem no HTML da página da proposta.**
Um componente `"use client"` recebe o objecto inteiro das alternativas, e o Next serializa todas
as props para dentro do HTML — usadas ou não. Vai o id interno do pedido e os nomes das pastas
da Biblioteca de Temas. **Não expõe dados de outro casal** — isso foi verificado e a fronteira
entre casais aguenta em todos os caminhos. Expõe a taxonomia do estúdio e o id do pedido, numa
página que o casal guarda e reencaminha, e quebra uma regra que o próprio repositório escreveu em
maiúsculas.

*Ficaram de fora por pouco:* A1-002 («Invalid Date» impresso no PDF do casal), A3-003 + A3-004 (a
página do casal é a única superfície que ainda faz contas próprias, e diverge do PDF ao cêntimo e
na unidade), A4-001 + A4-002 (os dois casos conhecidos, ambos vivos, com «no Torre de Palma»
errado em cinco dos seis espaços reais da casa).

---

## Padrões — o que estes 131 têm em comum

Isto vale mais do que a lista. São seis, e quase todas as entradas cabem numa delas.

### 1. Peças entregues sem consumidor — com um comentário a jurar que já estão ligadas

O padrão mais frequente e o mais perigoso, porque **o comentário é o que impede o próximo leitor
de reparar**. Inventário:

| Peça | Onde | O que devia alimentar |
|---|---|---|
| `estado` / `versaoVivaNumero` | `proposta-do-link.ts:161` | o aviso de versão ao casal (A6-005) |
| `camposDeEscolhaPorTraduzir` | `proposta-escolhas.ts:165` | a Conferência, o painel «Por traduzir», a tradução automática (A6-010) |
| `largura` / `altura` | `db/schema.sql:917` | o `aspect-ratio` da página e as suspeitas da verificação (A5-004, A6-002, A6-004, A8-015) |
| `deleteFoto` | `biblioteca-fotos-store.ts:229` | a limpeza da linha quando a foto sai do bucket (A5-006, A8-004, A8-005) |
| `registarAcontecimento` | `estado-do-pedido-servidor.ts:51` | todas as transições de estado do pedido (A8-002, A8-003) |
| `passaDoAnexo` | `custo-do-pdf.ts:161` | a decisão do servidor sobre anexar (A5-005, A10-007) |
| `resgate` / `resgateEm` | `proposta-rascunho/route.ts:226` | o botão «ver o que foi sobreposto» (A2-002) |
| `docError` | `proposta-doc/route.ts:1259` | o toast que diz que a proposta seguiu sem documento (A9-003) |
| `conflitos` / `ignoradas` | `material/marcar/route.ts:156` | o aviso «N marcações não pegaram» (A9-012) |
| `PropostaIncompleta` | `proposal-pdf-cache.ts:119` | nada — nenhum chamador a pode lançar (A10-012) |
| `useGravacaoAutomatica` | — | zero ecrãs de produção (nota do Agente 9) |

Onze peças. Em quatro casos há um comentário no código a afirmar explicitamente que a ligação
existe — o do `camposDeEscolhaPorTraduzir` («já são contadas, por…») é falso e serve de álibi a
uma exclusão que custa uma proposta inglesa com as alternativas em português.

### 2. A Fase 3 (alternativas) ficou de fora de cinco inventários

Cada inventário que percorre o documento foi escrito antes das alternativas existirem, e nenhum
foi actualizado: a cópia de fotos (A6-008), a contagem de traduções (A6-010, A8-009), a tradução
automática (A6-010), a detecção de bilinguismo (A6-011), e a projecção para o cliente (A7-001).
Cinco buracos, uma causa.

### 3. Uma regra escrita num sítio e não noutro

A casa escreve boas regras e depois copia-as à mão. Cada cópia é um sítio onde a regra pode não
estar:

- `round2` — aplicado em `pricing.ts` com o comentário certo, ausente na rota da proposta (A1-001)
- `dataIso` — aplicado à `validUntil`, ausente na `date` do pedido (A1-002)
- `Europe/Lisbon` — **seis** declarações independentes, uma delas canónica (A8-001, A8-013, A8-016)
- «sem IVA» — na expressão da linha, ausente na do total (A3-005)
- `esc()` — cinco caracteres num ficheiro, quatro noutro, com o comentário a jurar «byte-for-byte» (A7-005)
- `fetchComTecto` — duas versões no back office, nenhuma no portal do casal (A9-007)
- `quebrar` — usado na tabela do PDF, não no cabeçalho (A1-003)
- «época alta» — duas definições que discordam (A8-011)

### 4. A página do casal é a superfície menos protegida

É a mais cara e a menos coberta. Faz contas que o PDF já sabe fazer e diverge (A3-003 ao cêntimo,
A3-004 na unidade, A3-013 por omissão); desenha `<img>` cru sem a cascata que o resto da página
usa (A5-001); tem um estado calculado que não desenha (A6-005); e — a raiz de tudo isto — **tem
22 linhas de teste ponta a ponta**, que verificam um token inválido e o `noindex`. Nenhum teste
abre a página de uma proposta real.

### 5. O erro silencioso de fronteira

O servidor faz o trabalho todo — calcula o motivo, escreve a frase certa em português, devolve-a
— e o cliente deita-a fora. Ou o inverso: o cliente faz `await fetch` sem olhar para o `res.ok`.
A9-001, A9-003, A9-008, A9-012, A10-003, A2-002, A2-007. Sete entradas, e em cinco delas a frase
que faltava mostrar já estava escrita e traduzida.

### 6. Os gestos destrutivos não foram revistos desde que o modelo mudou

Apagar uma proposta (A6-013), apagar um pedido (A8-012), apagar uma foto (A8-004), apagar um tema
(A8-004). Todos foram escritos quando cada coisa era dona de si própria; depois o link do casal
passou a seguir o pedido, o aceite passou a congelar uma versão, e a biblioteca ganhou uma tabela
— e nenhum dos quatro foi revisto.

---

## Ordem de correcção proposta

Agrupada por **causa**, não por severidade, porque quase todos os grupos fecham várias entradas
de uma vez. Nenhum destes passos foi dado: fico à espera do teu sim.

| # | Bloco | Fecha | Esforço | Porquê primeiro |
|---|---|---|---|---|
| 1 | **O dinheiro que o casal lê** — `round2` na rota, primeira corrida monetária no `normalizarValor`, `sinal` lido em vez de recalculado na página, coluna dos adicionais na unidade do PDF | A3-001, A3-002, A3-003, A3-004, A1-001, A3-008 | 1 dia | É a única classe que escreve um número errado num documento com o nome dela. Cinco correcções pequenas, todas com a função certa já escrita ao lado. |
| 2 | **As dimensões das fotos** — dois campos no `updateFoto` dos dois uploads + script de recuperação | A5-004, A6-002, A6-004, A8-015, e metade de A6-003 | meio dia | Três agentes independentes lá chegaram. Fecha a queixa dos buracos na grelha e ressuscita metade da verificação pré-envio. |
| 3 | **O envio que mente** — verificar o `guardar()`, alargar a trava de repetição ao `registarEnvio`, `copiaError`/`pedidoError` na resposta, `docError` no toast | A10-001, A10-002, A10-003, A9-003, A10-009 | 1 dia | Duas propostas ao mesmo casal, e um link morto num email já enviado. |
| 4 | **As condições que congelam** — não gravar o texto preenchido; preencher só ao desenhar | A4-004, A4-005, A4-009, A4-010 | meio dia | Cláusula contratual que contradiz a capa, e condições inglesas em português. |
| 5 | **Os dois casos conhecidos dos modelos** — reescrever as frases para não dependerem de artigo nem de contracção | A4-001, A4-002, A4-003 | 2 horas | São os que ela já viu. A regra («nenhuma frase depende de um artigo colado») já está escrita no repositório e a semente do modelo não a cumpre. |
| 6 | **As alternativas nos cinco inventários** — cópia de fotos, contagem, tradução, `docTemIngles`, projecção RSC | A6-008, A6-010, A6-011, A8-009, A7-001 | 1 dia | Uma causa, cinco buracos, um deles é a fuga de caminhos no HTML. |
| 7 | **Um fuso só** — `src/lib/fuso.ts` client-safe, e os seis sítios a importar | A8-001, A8-013, A8-014, A8-016, A8-017, A8-018 | 3 horas | Duas datas contraditórias na mesma página do casal. |
| 8 | **Os gestos destrutivos** — guardas no apagar, `deleteFoto` ligado, `registarAcontecimento` ligado | A6-013, A8-002, A8-003, A8-004, A8-005, A8-006, A8-012, A6-014 | 1 dia | |
| 9 | **O trabalho em voo** — descarga síncrona no `pagehide`, uploads a contar como «por gravar», anulação persistente, `resgate` com ecrã | A2-001, A2-002, A2-004, A2-005, A2-006, A2-009 | 1–2 dias | Não chega ao casal, mas é o tempo dela. |
| 10 | **Os erros silenciosos de fronteira** — ler o `res.ok`, mostrar o que o servidor já escreveu | A9-001, A9-002, A9-004, A9-006, A9-008, A9-012, A9-010, A9-011 | 1 dia | A9-002 (a cópia de segurança que se carimba sem o email sair) devia subir se ela quiser dormir descansada. |
| 11 | **Os tempos e os tectos** — orçamento global de tempo no desenho, tecto do anexo no servidor | A10-004, A10-005, A10-006, A10-007, A10-010 | 1 dia | |
| 12 | **O resto** — os Menores, as guardas dos testes (A7-002, A6-007), o link revogável (A7-003) | os restantes | conforme | O A7-003 é uma decisão de produto, não uma correcção: precisa da tua opinião antes de código. |

**Três coisas que precisam de decisão tua antes de haver código:**

- **A7-003 — o link da proposta não se pode revogar.** Não é um bug: é um modelo que não tem
  alavanca. Um claim de geração resolve-o, mas muda o comportamento («regerar o link» passaria a
  cortar os anteriores). Queres essa alavanca?
- **A8-012 — apagar um pedido com proposta enviada.** Recusar (que é o que os registos fiscais
  pedem) ou apagar em cascata? Hoje não faz nem uma coisa nem outra.
- **A10-008 — «enviada» quer dizer «o relay aceitou».** Tratar devoluções é trabalho a sério
  (webhook, caixa de retorno). O mínimo honesto — mudar a frase para «entregue ao servidor de
  correio» — custa cinco minutos. Chega?

---

## O que CHEGA AO CLIENTE — a lista que manda

67 das 131 entradas chegam ao casal: ao PDF, ao email, à página da proposta ou ao formulário público.

| ID | Sev. | Onde | O quê |
|---|---|---|---|
| A3-001 | Crítico | Orçamento/Adicionais | `normalizarValor` cola todos os grupos de dígitos do texto e inventa milhões |
| A4-001 | Crítico | Modelos de email | «para o ␣no Torre de Palma» — a frase parte-se quando o tipo de evento falta |
| A4-002 | Crítico | Modelos de email | «no Torre de Palma» — preposição fixa no modelo, errada na maioria dos espaços |
| A4-004 | Crítico | Proposta / Condições Gerais | A cláusula fica CONGELADA na redacção «sem data» depois de a data existir |
| A5-001 | Crítico | Página do casal | A capa e o fecho não colapsam — a defesa do silêncio não chega às duas maiores imagens |
| A6-005 | Crítico | Página do casal | O estado da versão é calculado e nunca é desenhado: o casal nunca é avisado de que a proposta mudou depois do «sim» *(não confirmado)* |
| A8-001 | Crítico | Proposta · página do casal | «Atualizada a» sai no dia errado, ao lado de «Emitida a» que sai no dia certo |
| A10-001 | Crítico | Envio de email + base de dados | O email sai, o estado não grava, e a frase manda-a reenviar — o casal recebe duas propostas |
| A10-002 | Crítico | Base de dados / envio | A gravação da proposta não é verificada: o email segue com um link para uma proposta que não existe |
| A1-001 | Grave | Proposta / PDF+email | Subtotal + IVA não fecha o TOTAL na folha que o casal lê |
| A1-002 | Grave | Pedido de orçamento / datas | Uma data que não é uma data imprime «Invalid Date» no PDF do casal *(não confirmado)* |
| A1-003 | Grave | Proposta / PDF | Nome de cliente comprido sai fora da folha e passa por cima da coluna «EVENTO» |
| A1-004 | Grave | Proposta / construtor | Uma linha com a quantidade apagada desaparece do PDF sem aviso nenhum |
| A3-002 | Grave | Orçamento/Adicionais | Um adicional com vírgula dentro da ressalva desaparece do total, mas o número continua impresso ao lado do nome |
| A3-003 | Grave | Página do casal | O sinal impresso na página é recalculado à mão e diverge um cêntimo do PDF e da factura |
| A3-004 | Grave | Página do casal | A coluna dos valores adicionais na página está numa unidade e o TOTAL logo abaixo noutra — a coluna não soma |
| A3-005 | Grave | IVA | «sem IVA» / «s/ IVA» num total é lido como «IVA incluído» — 23 % de diferença, e o mesmo texto numa LINHA é lido ao contrário |
| A3-006 | Grave | Totais | Desconto maior que o total: o PDF imprime «Total a pagar −2.460,00 €» e a página esconde o quadro inteiro |
| A4-003 | Grave | Modelos de email | «para o Conferência» — o artigo também é fixo |
| A4-005 | Grave | Proposta bilingue | Consequência do A4-004: as Condições Gerais de uma proposta INGLESA saem em português |
| A4-006 | Grave | Variáveis / assinatura | `{{remetente_nome}}` assina a casa enquanto o bloco de baixo assina a pessoa |
| A4-007 | Grave | Ecrã de envio | Um modelo do dialecto antigo no ecrã de envio sai com `{nome}` e `{valor}` literais |
| A4-008 | Grave | Ecrã de envio | O email diz «Ainda aguardamos a data» com o PDF datado em anexo |
| A4-009 | Grave | Condições Gerais | «O orçamento cobre a definir convidados.» — o `semDado` só apanha as duas frases da casa |
| A4-010 | Grave | Proposta inglesa | «a definir» — português dentro de uma cláusula inglesa |
| A4-011 | Grave | Rotas de envio | `{{link_proposta}}` fica LITERAL no email pela rota `/proposta` |
| A5-004 | Grave | Fotos / Página do casal | `largura` e `altura` estão na tabela, no tipo e na consulta — e ninguém as escreve |
| A5-005 | Grave | Email | O PDF é anexado sem alguém lhe medir os bytes — o aviso dos 8 MB é uma estimativa que fica no estúdio |
| A6-002 | Grave | Fotografias | `largura`/`altura` nunca são gravadas: a página do casal desenha-se sem saber a forma de uma única fotografia |
| A6-008 | Grave | Copiar proposta | As fotografias das alternativas não são recopiadas: ficam na pasta do pedido de origem, e o aviso não as conta |
| A6-010 | Grave | Bilingue | As alternativas não entram em contagem de tradução nenhuma — e a Conferência dá «Idioma: ok» a uma proposta inglesa com as alternativas em português |
| A6-013 | Grave | Propostas | Apagar uma proposta mata o link que o casal tem no email — e, se for a aceite, desfaz o congelamento |
| A7-001 | Grave | Proposta viva — página do casal | Os caminhos do armazenamento saem no HTML da página da proposta |
| A8-009 | Grave | Proposta bilingue | O «Reunião Inicial → Ceremony Decor» continua vivo nas ALTERNATIVAS, e essas chegam ao casal |
| A8-011 | Grave | Orçamento público | «Época alta» tem duas definições que discordam em Maio e Outubro — uma faz o preço, a outra faz a frase |
| A8-015 | Grave | Biblioteca de fotos | `largura` e `altura` são lidas pela página do casal e nunca são escritas por ninguém |
| A9-003 | Grave | Estúdio de propostas | A proposta segue sem documento gravado e o ecrã diz «Proposta enviada ao cliente» |
| A10-004 | Grave | Storage / geração de PDF | Armazenamento pendurado: uma fotografia sozinha gasta 24,5 s e mata as duas rotas |
| A10-005 | Grave | Envio de email / tempo | O orçamento do envio não cabe nos 60 s, e a morte a meio do SMTP é a pior das saídas |
| A1-005 | Médio | Proposta / PDF | Uma palavra sem espaços na descrição invade as colunas do preço |
| A1-006 | Médio | Formulário público | «Nº de pessoas: 999999» é recusado com «demasiado longo … 100000 caracteres» |
| A2-009 | Médio | Estúdio — preço final | O preço do pedido tem um travão de 600 ms que ninguém descarrega, e o «Guardar agora» diz «guardado» sem ele *(não confirmado)* |
| A3-007 | Médio | Faseamento | Duas percentagens de sinal no mesmo documento quando o sinal muda depois de o faseamento estar materializado |
| A3-009 | Médio | Validade | A data de validade do email é calculada quando o rascunho abre e a do PDF quando o envio acontece *(não confirmado)* |
| A4-012 | Médio | Interpretador | Chavetas duplas chegam ao cliente, e o validador não acusa nada |
| A4-013 | Médio | Interpretador | `{{{cliente_nome}}}` → «{Marta}» — o nome do cliente entre chavetas |
| A4-014 | Médio | Interpretador | `{{#se}}` sem nome: o comentário diz que o bloco desaparece; ele renderiza sempre |
| A5-007 | Médio | PDF / EXIF | O atalho «já está do tamanho certo» salta o `.rotate()` — não confirmado *(não confirmado)* |
| A5-008 | Médio | Upload | A confirmação lê 256 KB e conclui sobre o ficheiro inteiro — não confirmado *(não confirmado)* |
| A6-003 | Médio | Fotografias | As fotografias carregadas no estúdio não guardam LQIP — só as da Biblioteca é que o têm |
| A6-004 | Médio | Conferência de fotos | O aviso «esta fotografia vai sair mole» nunca dispara — é consequência silenciosa do A6-002 |
| A6-006 | Médio | Link do casal | Com o aceite ilegível, a página cai calada na proposta do token e volta a dizer «por aceitar» — não confirmado (exige base de dados) *(não confirmado)* |
| A6-009 | Médio | Copiar proposta | A frase de intenção do casal anterior viaja para o casal novo sem marca nenhuma |
| A7-003 | Médio | Link da proposta | O link não se pode revogar, e mostra as revisões futuras a quem o tiver |
| A8-010 | Médio | Proposta bilingue | O cronograma e as linhas estimadas não têm inglês nenhum — uma proposta de Organização em inglês sai meio portuguesa, sem aviso |
| A8-014 | Médio | Proposta · página do casal | O fim do último dia de validade é o do fuso do processo |
| A9-007 | Médio | Portal do casal | A escolha do casal pode ficar «a enviar…» para sempre, sem mensagem e com os botões trancados |
| A9-008 | Médio | Portal do casal | «Voltar a carregar as fotografias» não faz nada e não diz nada quando o servidor recusa |
| A10-006 | Médio | Geração de PDF | O PDF servido INCOMPLETO deixa rasto só no registo — e nunca é guardado, por isso volta a desenhar-se duas vezes a cada abertura |
| A1-007 | Menor | Proposta / PDF | Quantidade decimal sai com ponto inglês na folha portuguesa |
| A2-010 | Menor | Envio da proposta | não confirmado — dois envios verdadeiramente simultâneos escapam à janela de repetição *(não confirmado)* |
| A3-010 | Menor | IVA | O rótulo da taxa de IVA arredonda de duas maneiras — «23,5%» no PDF e «24%» na página e no estúdio (não confirmado como alcançável) *(não confirmado)* |
| A3-011 | Menor | Total | `parseMoneyText` perde o sinal negativo, e `resolveProposalMoney` ignora um `totalAmount` ≤ 0 caindo no texto |
| A3-012 | Menor | Validade | Nada avisa quando a proposta continua válida DEPOIS do dia do casamento |
| A3-013 | Menor | Coerência PDF↔página | «Sem os extras assinalados» sai com número no PDF e sem número nenhum na página |
| A6-012 | Menor | Bilingue | A lacuna do cronograma e das linhas estimadas continua certa — e agora custa em dois sítios |
| A8-017 | Menor | Confirmação do pedido | «faltam N dias» conta o hoje no fuso do processo *(não confirmado)* |

## Registo completo

| ID | Sev. | Chega | Módulo | O quê | Relatório |
|---|---|---|---|---|---|
| A2-001 | Crítico | não | Estúdio de propostas / rascunho | O estúdio grava o rascunho local no servidor antes de saber o que lá está — e cego, sem `baseUpdatedAt` | [agente-02.md](agente-02.md) |
| A2-002 | Crítico | não | API rascunho + estúdio | A versão sobreposta é guardada em `--sobreposto` e NUNCA é oferecida a ninguém | [agente-02.md](agente-02.md) |
| A3-001 | Crítico | **sim** | Orçamento/Adicionais | `normalizarValor` cola todos os grupos de dígitos do texto e inventa milhões | [agente-03.md](agente-03.md) |
| A4-001 | Crítico | **sim** | Modelos de email | «para o ␣no Torre de Palma» — a frase parte-se quando o tipo de evento falta | [agente-04.md](agente-04.md) |
| A4-002 | Crítico | **sim** | Modelos de email | «no Torre de Palma» — preposição fixa no modelo, errada na maioria dos espaços | [agente-04.md](agente-04.md) |
| A4-004 | Crítico | **sim** | Proposta / Condições Gerais | A cláusula fica CONGELADA na redacção «sem data» depois de a data existir | [agente-04.md](agente-04.md) |
| A5-001 | Crítico | **sim** | Página do casal | A capa e o fecho não colapsam — a defesa do silêncio não chega às duas maiores imagens | [agente-05.md](agente-05.md) |
| A6-005 | Crítico | **sim** | Página do casal | O estado da versão é calculado e nunca é desenhado: o casal nunca é avisado de que a proposta mudou depois do «sim» *(não confirmado)* | [agente-06.md](agente-06.md) |
| A8-001 | Crítico | **sim** | Proposta · página do casal | «Atualizada a» sai no dia errado, ao lado de «Emitida a» que sai no dia certo | [agente-08.md](agente-08.md) |
| A9-002 | Crítico | não | Cópia de segurança | O carimbo da cópia diária é gravado mesmo quando o email não saiu | [agente-09.md](agente-09.md) |
| A10-001 | Crítico | **sim** | Envio de email + base de dados | O email sai, o estado não grava, e a frase manda-a reenviar — o casal recebe duas propostas | [agente-10.md](agente-10.md) |
| A10-002 | Crítico | **sim** | Base de dados / envio | A gravação da proposta não é verificada: o email segue com um link para uma proposta que não existe | [agente-10.md](agente-10.md) |
| A1-001 | Grave | **sim** | Proposta / PDF+email | Subtotal + IVA não fecha o TOTAL na folha que o casal lê | [agente-01.md](agente-01.md) |
| A1-002 | Grave | **sim** | Pedido de orçamento / datas | Uma data que não é uma data imprime «Invalid Date» no PDF do casal *(não confirmado)* | [agente-01.md](agente-01.md) |
| A1-003 | Grave | **sim** | Proposta / PDF | Nome de cliente comprido sai fora da folha e passa por cima da coluna «EVENTO» | [agente-01.md](agente-01.md) |
| A1-004 | Grave | **sim** | Proposta / construtor | Uma linha com a quantidade apagada desaparece do PDF sem aviso nenhum | [agente-01.md](agente-01.md) |
| A2-003 | Grave | não | Estúdio de propostas / rascunho | A mesma proposta em dois separadores: nenhum revalida, os dois partilham a mesma gaveta local, e o aviso fala uma vez só | [agente-02.md](agente-02.md) |
| A2-004 | Grave | não | Estúdio — fotografias | Sair (ou trocar de cliente) durante um upload: as fotos sobem e nunca entram no documento, sem uma palavra | [agente-02.md](agente-02.md) |
| A2-005 | Grave | não | Estúdio de propostas / rascunho | O travão de saída pergunta e não grava — e no telemóvel nem pergunta | [agente-02.md](agente-02.md) |
| A2-006 | Grave | não | Estúdio — Limpar / Repor versão | A anulação de dez segundos vive só na memória, e o servidor já foi apagado no primeiro segundo | [agente-02.md](agente-02.md) |
| A3-002 | Grave | **sim** | Orçamento/Adicionais | Um adicional com vírgula dentro da ressalva desaparece do total, mas o número continua impresso ao lado do nome | [agente-03.md](agente-03.md) |
| A3-003 | Grave | **sim** | Página do casal | O sinal impresso na página é recalculado à mão e diverge um cêntimo do PDF e da factura | [agente-03.md](agente-03.md) |
| A3-004 | Grave | **sim** | Página do casal | A coluna dos valores adicionais na página está numa unidade e o TOTAL logo abaixo noutra — a coluna não soma | [agente-03.md](agente-03.md) |
| A3-005 | Grave | **sim** | IVA | «sem IVA» / «s/ IVA» num total é lido como «IVA incluído» — 23 % de diferença, e o mesmo texto numa LINHA é lido ao contrário | [agente-03.md](agente-03.md) |
| A3-006 | Grave | **sim** | Totais | Desconto maior que o total: o PDF imprime «Total a pagar −2.460,00 €» e a página esconde o quadro inteiro | [agente-03.md](agente-03.md) |
| A4-003 | Grave | **sim** | Modelos de email | «para o Conferência» — o artigo também é fixo | [agente-04.md](agente-04.md) |
| A4-005 | Grave | **sim** | Proposta bilingue | Consequência do A4-004: as Condições Gerais de uma proposta INGLESA saem em português | [agente-04.md](agente-04.md) |
| A4-006 | Grave | **sim** | Variáveis / assinatura | `{{remetente_nome}}` assina a casa enquanto o bloco de baixo assina a pessoa | [agente-04.md](agente-04.md) |
| A4-007 | Grave | **sim** | Ecrã de envio | Um modelo do dialecto antigo no ecrã de envio sai com `{nome}` e `{valor}` literais | [agente-04.md](agente-04.md) |
| A4-008 | Grave | **sim** | Ecrã de envio | O email diz «Ainda aguardamos a data» com o PDF datado em anexo | [agente-04.md](agente-04.md) |
| A4-009 | Grave | **sim** | Condições Gerais | «O orçamento cobre a definir convidados.» — o `semDado` só apanha as duas frases da casa | [agente-04.md](agente-04.md) |
| A4-010 | Grave | **sim** | Proposta inglesa | «a definir» — português dentro de uma cláusula inglesa | [agente-04.md](agente-04.md) |
| A4-011 | Grave | **sim** | Rotas de envio | `{{link_proposta}}` fica LITERAL no email pela rota `/proposta` | [agente-04.md](agente-04.md) |
| A5-002 | Grave | não | Temas | A capa apagada nunca cai para a foto mais recente — assinar continua a passar por existir | [agente-05.md](agente-05.md) |
| A5-003 | Grave | não | Temas | Quando o plano B também falha, a célula não desiste — fica a imagem partida | [agente-05.md](agente-05.md) |
| A5-004 | Grave | **sim** | Fotos / Página do casal | `largura` e `altura` estão na tabela, no tipo e na consulta — e ninguém as escreve | [agente-05.md](agente-05.md) |
| A5-005 | Grave | **sim** | Email | O PDF é anexado sem alguém lhe medir os bytes — o aviso dos 8 MB é uma estimativa que fica no estúdio | [agente-05.md](agente-05.md) |
| A6-002 | Grave | **sim** | Fotografias | `largura`/`altura` nunca são gravadas: a página do casal desenha-se sem saber a forma de uma única fotografia | [agente-06.md](agente-06.md) |
| A6-008 | Grave | **sim** | Copiar proposta | As fotografias das alternativas não são recopiadas: ficam na pasta do pedido de origem, e o aviso não as conta | [agente-06.md](agente-06.md) |
| A6-010 | Grave | **sim** | Bilingue | As alternativas não entram em contagem de tradução nenhuma — e a Conferência dá «Idioma: ok» a uma proposta inglesa com as alternativas em português | [agente-06.md](agente-06.md) |
| A6-013 | Grave | **sim** | Propostas | Apagar uma proposta mata o link que o casal tem no email — e, se for a aceite, desfaz o congelamento | [agente-06.md](agente-06.md) |
| A7-001 | Grave | **sim** | Proposta viva — página do casal | Os caminhos do armazenamento saem no HTML da página da proposta | [agente-07.md](agente-07.md) |
| A8-002 | Grave | não | Pedidos · máquina de estados | Marcar o contrato como aceite deixa o pedido em «Proposta enviada» | [agente-08.md](agente-08.md) |
| A8-003 | Grave | não | Pedidos · máquina de estados | `registarAcontecimento` não tem um único chamador | [agente-08.md](agente-08.md) |
| A8-004 | Grave | não | Biblioteca de fotos | Apagar uma foto (ou um tema inteiro) nunca apaga a linha dela — `deleteFoto` é código morto | [agente-08.md](agente-08.md) |
| A8-005 | Grave | não | Biblioteca de fotos | Os números ao lado de cada etiqueta contam fotos que já não existem | [agente-08.md](agente-08.md) |
| A8-006 | Grave | não | Biblioteca de fotos | O «total» da procura é contado antes do filtro que deita fotos fora, e a paginação salta | [agente-08.md](agente-08.md) |
| A8-007 | Grave | não | Propostas · Criar a partir de… | A ficha de escolha conta em cru e ignora o `budgetRows` — o mesmo defeito que se acabou de corrigir, num segundo sítio | [agente-08.md](agente-08.md) |
| A8-009 | Grave | **sim** | Proposta bilingue | O «Reunião Inicial → Ceremony Decor» continua vivo nas ALTERNATIVAS, e essas chegam ao casal | [agente-08.md](agente-08.md) |
| A8-011 | Grave | **sim** | Orçamento público | «Época alta» tem duas definições que discordam em Maio e Outubro — uma faz o preço, a outra faz a frase | [agente-08.md](agente-08.md) |
| A8-015 | Grave | **sim** | Biblioteca de fotos | `largura` e `altura` são lidas pela página do casal e nunca são escritas por ninguém | [agente-08.md](agente-08.md) |
| A9-001 | Grave | não | Notificações | «Notificações ativadas» sobre uma subscrição que o servidor recusou | [agente-09.md](agente-09.md) |
| A9-003 | Grave | **sim** | Estúdio de propostas | A proposta segue sem documento gravado e o ecrã diz «Proposta enviada ao cliente» | [agente-09.md](agente-09.md) |
| A9-004 | Grave | não | Carregamento (telemóvel) | Sem localStorage, a marcação nunca vai à rede — apesar do comentário dizer que vai | [agente-09.md](agente-09.md) |
| A9-005 | Grave | não | Modelos de email bilingues | Ecrã com alterações por publicar que não está inscrito no registo — o «Guardar tudo» diz «Tudo guardado» | [agente-09.md](agente-09.md) |
| A9-006 | Grave | não | Carregamento (telemóvel) | A sincronização falha em ciclo sem nunca o dizer, e sem forma de tentar outra vez | [agente-09.md](agente-09.md) |
| A10-003 | Grave | não | Base de dados | Depois do email, duas das três escritas falham em silêncio | [agente-10.md](agente-10.md) |
| A10-004 | Grave | **sim** | Storage / geração de PDF | Armazenamento pendurado: uma fotografia sozinha gasta 24,5 s e mata as duas rotas | [agente-10.md](agente-10.md) |
| A10-005 | Grave | **sim** | Envio de email / tempo | O orçamento do envio não cabe nos 60 s, e a morte a meio do SMTP é a pior das saídas | [agente-10.md](agente-10.md) |
| A1-005 | Médio | **sim** | Proposta / PDF | Uma palavra sem espaços na descrição invade as colunas do preço | [agente-01.md](agente-01.md) |
| A1-006 | Médio | **sim** | Formulário público | «Nº de pessoas: 999999» é recusado com «demasiado longo … 100000 caracteres» | [agente-01.md](agente-01.md) |
| A1-008 | Médio | não | Biblioteca de temas / carregamento | Um ficheiro mau a meio do lote aborta o lote e esconde as fotos que já subiram | [agente-01.md](agente-01.md) |
| A1-009 | Médio | não | Back office / validação | Recusas do zod chegam ao ecrã em inglês e sem nomear o campo *(não confirmado)* | [agente-01.md](agente-01.md) |
| A2-007 | Médio | não | Construtor de orçamento (linhas) | Duas pessoas nas linhas do orçamento sobrepõem-se em silêncio absoluto | [agente-02.md](agente-02.md) |
| A2-008 | Médio | não | Estúdio — fotografias / sessão | Sessão expirada a meio de um lote de fotos: o lote não é retomado depois de reautenticar | [agente-02.md](agente-02.md) |
| A2-009 | Médio | **sim** | Estúdio — preço final | O preço do pedido tem um travão de 600 ms que ninguém descarrega, e o «Guardar agora» diz «guardado» sem ele *(não confirmado)* | [agente-02.md](agente-02.md) |
| A3-007 | Médio | **sim** | Faseamento | Duas percentagens de sinal no mesmo documento quando o sinal muda depois de o faseamento estar materializado | [agente-03.md](agente-03.md) |
| A3-008 | Médio | não | Modelo Organização | O preço por linha é texto livre e o aviso «as contas não fecham» herda todos os defeitos de leitura | [agente-03.md](agente-03.md) |
| A3-009 | Médio | **sim** | Validade | A data de validade do email é calculada quando o rascunho abre e a do PDF quando o envio acontece *(não confirmado)* | [agente-03.md](agente-03.md) |
| A4-012 | Médio | **sim** | Interpretador | Chavetas duplas chegam ao cliente, e o validador não acusa nada | [agente-04.md](agente-04.md) |
| A4-013 | Médio | **sim** | Interpretador | `{{{cliente_nome}}}` → «{Marta}» — o nome do cliente entre chavetas | [agente-04.md](agente-04.md) |
| A4-014 | Médio | **sim** | Interpretador | `{{#se}}` sem nome: o comentário diz que o bloco desaparece; ele renderiza sempre | [agente-04.md](agente-04.md) |
| A4-015 | Médio | não | Editor clássico | Pré-visualização de um modelo novo dá «Olá {},» | [agente-04.md](agente-04.md) |
| A4-016 | Médio | não | Pré-visualização | `{{sinal_percentagem}}` mostra sempre 30% na pré-visualização com dados reais | [agente-04.md](agente-04.md) |
| A5-006 | Médio | não | Biblioteca | `deleteFoto` está exportado e nunca é chamado — a base de dados guarda fotos que já não existem *(não confirmado)* | [agente-05.md](agente-05.md) |
| A5-007 | Médio | **sim** | PDF / EXIF | O atalho «já está do tamanho certo» salta o `.rotate()` — não confirmado *(não confirmado)* | [agente-05.md](agente-05.md) |
| A5-008 | Médio | **sim** | Upload | A confirmação lê 256 KB e conclui sobre o ficheiro inteiro — não confirmado *(não confirmado)* | [agente-05.md](agente-05.md) |
| A6-003 | Médio | **sim** | Fotografias | As fotografias carregadas no estúdio não guardam LQIP — só as da Biblioteca é que o têm | [agente-06.md](agente-06.md) |
| A6-004 | Médio | **sim** | Conferência de fotos | O aviso «esta fotografia vai sair mole» nunca dispara — é consequência silenciosa do A6-002 | [agente-06.md](agente-06.md) |
| A6-006 | Médio | **sim** | Link do casal | Com o aceite ilegível, a página cai calada na proposta do token e volta a dizer «por aceitar» — não confirmado (exige base de dados) *(não confirmado)* | [agente-06.md](agente-06.md) |
| A6-007 | Médio | não | Selo de versão | A guarda que impede as duas listas de divergir só lê um dos três ficheiros que desenham a página | [agente-06.md](agente-06.md) |
| A6-009 | Médio | **sim** | Copiar proposta | A frase de intenção do casal anterior viaja para o casal novo sem marca nenhuma | [agente-06.md](agente-06.md) |
| A6-011 | Médio | não | Bilingue | `docTemIngles` é cego às alternativas: uma proposta reaberta pode esconder as traduções que já tem | [agente-06.md](agente-06.md) |
| A7-002 | Médio | não | API — auditoria de guardas | A auditoria prende ficheiros, não métodos: dois métodos escapam-lhe | [agente-07.md](agente-07.md) |
| A7-003 | Médio | **sim** | Link da proposta | O link não se pode revogar, e mostra as revisões futuras a quem o tiver | [agente-07.md](agente-07.md) |
| A7-004 | Médio | não | Autenticação — tokens | Os limites de taxa são por instância quando o Upstash não está configurado *(não confirmado)* | [agente-07.md](agente-07.md) |
| A8-008 | Médio | não | Estúdio · Mood boards | O cabeçalho da secção conta páginas por outra regra que o índice | [agente-08.md](agente-08.md) |
| A8-010 | Médio | **sim** | Proposta bilingue | O cronograma e as linhas estimadas não têm inglês nenhum — uma proposta de Organização em inglês sai meio portuguesa, sem aviso | [agente-08.md](agente-08.md) |
| A8-012 | Médio | não | Pedidos | Apagar um pedido deixa propostas e contratos órfãos, e o comentário que o justifica está desactualizado | [agente-08.md](agente-08.md) |
| A8-013 | Médio | não | Propostas · validade | Dois «hoje» diferentes sobre a mesma validade: um é o de Lisboa, o outro é o de Greenwich | [agente-08.md](agente-08.md) |
| A8-014 | Médio | **sim** | Proposta · página do casal | O fim do último dia de validade é o do fuso do processo | [agente-08.md](agente-08.md) |
| A8-019 | Médio | não | Pedidos | não confirmado — Um pedido sem `submissionId` cria um lead duplicado sem segunda barreira *(não confirmado)* | [agente-08.md](agente-08.md) |
| A9-007 | Médio | **sim** | Portal do casal | A escolha do casal pode ficar «a enviar…» para sempre, sem mensagem e com os botões trancados | [agente-09.md](agente-09.md) |
| A9-008 | Médio | **sim** | Portal do casal | «Voltar a carregar as fotografias» não faz nada e não diz nada quando o servidor recusa | [agente-09.md](agente-09.md) |
| A9-009 | Médio | não | Modelos de email bilingues | Histórico de versões que falhou a ler mostra-se como «ainda não há versões» | [agente-09.md](agente-09.md) |
| A9-010 | Médio | não | Material — listas base | Quantidade que não gravou fica na caixa a dizer que gravou | [agente-09.md](agente-09.md) |
| A9-011 | Médio | não | Quadro de pedidos | «2 falhou(ram)» sem dizer quais, e a selecção é limpa na mesma | [agente-09.md](agente-09.md) |
| A9-012 | Médio | não | Material — marcações | Marcações ignoradas e em conflito voltam num 200 que ninguém lê *(não confirmado)* | [agente-09.md](agente-09.md) |
| A10-006 | Médio | **sim** | Geração de PDF | O PDF servido INCOMPLETO deixa rasto só no registo — e nunca é guardado, por isso volta a desenhar-se duas vezes a cada abertura | [agente-10.md](agente-10.md) |
| A10-007 | Médio | não | Envio de email | O servidor nunca compara o PDF com o limite de anexo que já tem escrito | [agente-10.md](agente-10.md) |
| A10-008 | Médio | não | Envio de email | «Enviada» quer dizer «o relay aceitou»: uma devolução posterior é invisível *(não confirmado)* | [agente-10.md](agente-10.md) |
| A10-009 | Médio | não | Estúdio / mensagens | «No PDF que seguiu…» aparece mesmo quando nada seguiu, e engole o aviso mais grave | [agente-10.md](agente-10.md) |
| A1-007 | Menor | **sim** | Proposta / PDF | Quantidade decimal sai com ponto inglês na folha portuguesa | [agente-01.md](agente-01.md) |
| A1-010 | Menor | não | Carregamento de fotos | não confirmado — ficheiro de 100 MB não tem travão antes de o browser o abrir *(não confirmado)* | [agente-01.md](agente-01.md) |
| A2-010 | Menor | **sim** | Envio da proposta | não confirmado — dois envios verdadeiramente simultâneos escapam à janela de repetição *(não confirmado)* | [agente-02.md](agente-02.md) |
| A2-011 | Menor | não | Back office — navegação | Voltar atrás no browser a meio da proposta sai do back office inteiro | [agente-02.md](agente-02.md) |
| A3-010 | Menor | **sim** | IVA | O rótulo da taxa de IVA arredonda de duas maneiras — «23,5%» no PDF e «24%» na página e no estúdio (não confirmado como alcançável) *(não confirmado)* | [agente-03.md](agente-03.md) |
| A3-011 | Menor | **sim** | Total | `parseMoneyText` perde o sinal negativo, e `resolveProposalMoney` ignora um `totalAmount` ≤ 0 caindo no texto | [agente-03.md](agente-03.md) |
| A3-012 | Menor | **sim** | Validade | Nada avisa quando a proposta continua válida DEPOIS do dia do casamento | [agente-03.md](agente-03.md) |
| A3-013 | Menor | **sim** | Coerência PDF↔página | «Sem os extras assinalados» sai com número no PDF e sem número nenhum na página | [agente-03.md](agente-03.md) |
| A4-017 | Menor | não | Modelos de email | Linha em branco a mais no bloco do resumo quando a última linha falta | [agente-04.md](agente-04.md) |
| A4-018 | Menor | não | Ecrã de envio | O aviso manda preencher num sítio onde o campo não existe | [agente-04.md](agente-04.md) |
| A4-019 | Menor | não | Contrato | O ponto 4 dos termos é composto por `replace` de uma frase literal *(não confirmado)* | [agente-04.md](agente-04.md) |
| A4-020 | Menor | não | Assinatura | A defesa «não assinar com o nome de quem recebe» não apanha metade de um casal *(não confirmado)* | [agente-04.md](agente-04.md) |
| A5-009 | Menor | não | Temas | A grelha de fotos de um tema tem o mesmo terceiro degrau em falta | [agente-05.md](agente-05.md) |
| A5-010 | Menor | não | Storage | `signThemePaths` ignora o erro por caminho que o Supabase devolve | [agente-05.md](agente-05.md) |
| A6-001 | Menor | não | Fazer proposta | A mensagem do casal fica em Pedidos e não entra no ecrã onde a proposta se escreve | [agente-06.md](agente-06.md) |
| A6-012 | Menor | **sim** | Bilingue | A lacuna do cronograma e das linhas estimadas continua certa — e agora custa em dois sítios | [agente-06.md](agente-06.md) |
| A6-014 | Menor | não | Propostas / Armazenamento | Apagar deixa as fotografias no bucket, sem dono e sem contagem *(não confirmado)* | [agente-06.md](agente-06.md) |
| A7-005 | Menor | não | Email — modelos | O `esc()` dos modelos não escapa a plica, ao contrário do que o comentário promete *(não confirmado)* | [agente-07.md](agente-07.md) |
| A7-006 | Menor | não | Autenticação — tokens | `readProposalToken` aceita um token sem `typ` *(não confirmado)* | [agente-07.md](agente-07.md) |
| A7-007 | Menor | não | Segredos versionados | Hashes de palavra-passe em ficheiros versionados | [agente-07.md](agente-07.md) |
| A8-016 | Menor | não | Fusos | `Europe/Lisbon` está escrito à mão em seis sítios, e um deles é o canónico | [agente-08.md](agente-08.md) |
| A8-017 | Menor | **sim** | Confirmação do pedido | «faltam N dias» conta o hoje no fuso do processo *(não confirmado)* | [agente-08.md](agente-08.md) |
| A8-018 | Menor | não | Estúdio · fotos repetidas | `new Date("yyyy-mm-dd")` cru na marca «Já usada» *(não confirmado)* | [agente-08.md](agente-08.md) |
| A8-020 | Menor | não | Temas | não confirmado — A contagem de fotos de cada cartão é uma cache de processo *(não confirmado)* | [agente-08.md](agente-08.md) |
| A9-013 | Menor | não | Persistência (dev) | Ficheiro de dados corrompido lê-se como tabela vazia e é reescrito por cima *(não confirmado)* | [agente-09.md](agente-09.md) |
| A9-014 | Menor | não | Passkeys | não confirmado — `AbortError` de rede confundido com «a pessoa cancelou» *(não confirmado)* | [agente-09.md](agente-09.md) |
| A10-010 | Menor | não | Storage / tempo | A escrita da derivada da capa está no caminho crítico de uma rota de 20 s | [agente-10.md](agente-10.md) |
| A10-011 | Menor | não | Envio de email | SMTP não configurado: a rota irmã não diz o motivo (a do Estúdio diz) | [agente-10.md](agente-10.md) |
| A10-012 | Menor | não | Geração de PDF | `PropostaIncompleta` já não pode ser lançada por nenhum dos dois chamadores que a apanham | [agente-10.md](agente-10.md) |
