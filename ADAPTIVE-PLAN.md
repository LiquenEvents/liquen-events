# ADAPTIVE-PLAN — que forma cada ecrã do back office toma em cada aparelho

**Fase 0. Decisões, não código.** Nada foi implementado; este documento é para
ser discordado antes de valer trabalho.

---

## Antes de tudo: o que já está feito, e que não vou refazer

Três das catorze frentes da missão já foram trabalhadas neste projecto, e
correr-lhes o varrimento outra vez produziria sobretudo zeros. Digo-o agora para
não pagares duas vezes pela mesma coisa.

| Frente da missão | Estado | Onde está |
| --- | --- | --- |
| **Agente 9** — ergonomia de toque | **feito**: 95 alvos abaixo de 44×44 px → 0, nas onze vistas; 20 focáveis fora do ecrã → 0 | `TOUCH-AUDIT.md`, `scripts/auditar-toque-admin.mjs` |
| **Agente 14** (parte) — percursos reais em aparelho estrangulado | **feito**: 4 Críticos + 16 Altos → 0, em iPhone SE / 15 Pro / Pixel 8 / iPad | `MOBILE-AUDIT.md`, `scripts/auditar-percursos-movel.mjs` |
| **Que não regrida** (parte) | **feito e a correr no CI**: passo `@movel` bloqueante que verifica alvos ≥44 px, campos ≥16 px e nada fora da margem a 375 px | `.github/workflows/ci.yml`, `e2e/admin-mobile.spec.ts` |

O que **não** está feito — e é o coração desta missão — é a distinção que tu
própria puseste à cabeça: **responsivo ≠ adaptativo**. O que existe hoje é o
primeiro. Está medido:

| Ficheiro | Linhas | Variantes de breakpoint |
| --- | ---: | ---: |
| `AdminClient.tsx` (a moldura) | 3 488 | 56 |
| `ProposalStudio.tsx` (o estúdio) | 2 980 | **11** |
| `Temas.tsx` | 3 081 | 13 |
| `Propostas.tsx` | 540 | **5** |
| `Kanban.tsx` | 481 | **3** |
| `Inventario.tsx` | 767 | **6** |
| `StatsDashboard.tsx` | 821 | 6 |
| **Total dos 15 ecrãs** | **17 752** | **166** |

Uma variante por cada 107 linhas — e **um terço de toda a adaptação do back
office está na moldura**, não nos ecrãs. Traduzido: a navegação transforma-se
mesmo (barra lateral vira gaveta abaixo de 1024, há barra inferior, há
armadilhas de foco), mas **o conteúdo é o mesmo layout a encolher**. O estúdio
de propostas — 2 980 linhas, o ecrã mais complexo do sistema — tem onze
variantes no total.

É esse o trabalho a fazer, e é onde vou pôr o esforço.

---

## O princípio, aplicado

Uma pergunta por ecrã, e é sempre a mesma: **qual é a tarefa aqui, neste
aparelho?** Quando a resposta é diferente, o ecrã tem de ser diferente — não
mais estreito.

Três categorias, e o que cada uma merece:

| Categoria | O que significa | Quanto trabalho merece |
| --- | --- | --- |
| **Primário em telemóvel** | é aqui que o trabalho acontece de pé, numa quinta, com uma mão | redesenhado para o polegar; a versão de desktop pode até ser a secundária |
| **Primário em desktop** | sessões longas, sentada, com rato e teclado | densidade, atalhos, várias coisas ao mesmo tempo; em telemóvel basta **rever e ajustar**, não criar |
| **Bom nos dois** | consulta-se e age-se em ambos, com a mesma frequência | dois layouts a sério, a partir da mesma lógica |
| **Só legível** | uso raro em telemóvel | não parte, não obriga a zoom, e mais nada |

---

## O inventário, ecrã a ecrã

### Primários em TELEMÓVEL — redesenhar para o polegar

| Ecrã | Tarefa em telemóvel | Tarefa em desktop | O que muda |
| --- | --- | --- | --- |
| **Inventário / logística** | *carregar a carrinha numa quinta, com as mãos ocupadas e má rede* | gerir catálogo, stock, listas base | Modo de carga a uma mão: linha inteira tocável, contador grande, **offline com sincronização posterior**. É o ecrã que mais muda dos catorze. |
| **Dossier do evento** (`/evento/[id]`) | *consultar no local: horas, contactos, o que falta* | preparar e editar | Telemóvel: um cartão por secção, contactos com toque-para-ligar, cronograma como linha temporal vertical. Desktop: colunas. |
| **Calendário** | *o que tenho esta semana* | planear o ano, arrastar | Telemóvel: agenda vertical (lista por dia), não grelha de mês. Desktop: grelha. |
| **Tarefas** | *marcar feito entre visitas* | organizar, atribuir, prioridades | Telemóvel: lista com toque para concluir e nada mais. |
| **Faturas → registar pagamento** | *recebi o sinal, registar já* | livro completo, numeração, análise | Telemóvel: um formulário empilhado com teclado numérico e vírgula; o livro vira cartões. |

### Primários em DESKTOP — em telemóvel, rever e ajustar

| Ecrã | Tarefa em desktop | Tarefa em telemóvel | O que muda |
| --- | --- | --- | --- |
| **Fazer proposta** (estúdio) | *criar a proposta de raiz* | *rever antes de enviar; corrigir um preço* | O caso mais difícil. Desktop: navegação lateral fixa, secções abertas, dois campos por linha, pré-visualização ao lado. Telemóvel: secções fechadas, um campo por linha, passos com progresso, barra fixa em baixo com "Guardado" + acção principal. **Assumo que ninguém cria uma proposta de raiz ao telemóvel** — e o desenho passa a dizer isso em vez de fingir que sim. |
| **Organização de propostas** (kanban) | *arrastar entre fases* | *ver em que fase está* | Telemóvel: o arrasto horizontal em colunas não funciona com o polegar. Vira lista agrupada por fase, com mudança de fase por menu — não por arrasto. |
| **Estatísticas** | *analisar, comparar, cruzar* | *os 3 números que interessam* | Telemóvel: um bloco de cada vez, números grandes em vez de gráficos apertados. |
| **Temas** (gestão) | *arrumar a biblioteca, rever etiquetas* | *mostrar um moodboard a um casal* — que é **tablet**, não telemóvel | Já reformulado esta semana. Falta a folha inferior de selecção e a grelha de 2–3 colunas em telemóvel. |
| **Modelos de email** | *escrever e afinar* | raro | Só legível. |
| **Fornecedores** · **Clientes** | *gerir, cruzar histórico* | *procurar um contacto e ligar* | Telemóvel: lista com procura ao cimo e toque-para-ligar. Sem tabela. |
| **Backup / Repor** | *operação deliberada* | nunca | Só legível — e a reposição deve **recusar-se** em ecrã pequeno, não adaptar-se: é a operação mais destrutiva do sistema. |

### Bons nos DOIS

| Ecrã | Porquê | O que muda |
| --- | --- | --- |
| **Pedidos** | chega um pedido novo e vê-se no telemóvel; trabalha-se nele no escritório | Desktop: tabela densa, colunas ordenáveis, filtros à vista, selecção múltipla e acções em lote. Telemóvel: cartões com nome, data, local, estado e **dias de espera**, filtros numa folha inferior, acções por deslize. |
| **Propostas** (lista) | idem | O mesmo par tabela/cartões. |
| **Visão Geral** | é a primeira coisa que se abre nos dois | Desktop: blocos lado a lado. Telemóvel: os quatro números que interessam e o que é preciso fazer hoje. |
| **Propostas Aceites** | consulta nos dois | Tabela/cartões. |
| **Entrada** (login, TOTP, passkeys) | entra-se dos dois | Telemóvel: mostrar/ocultar palavra-passe, TOTP que aceita os 6 dígitos colados de uma vez, **estado preservado ao sair para o autenticador e voltar**. É o percurso onde uma falha custa o acesso todo. |

### Componentes partilhados que também têm de mudar de forma

Não são vistas, mas aparecem em quase todas: **gaveta do pedido**, **selector de
fotos da biblioteca**, **paleta de comandos**, **diálogos de confirmação**,
**selector de datas**, **lightbox**. Vão para a Fase 1 como primitivos, porque
adaptá-los um a um dentro de cada ecrã é como isto se desalinha outra vez.

---

## O que decidi e vale a pena discordar

**1. O estúdio de propostas não vai ser criável em telemóvel.** Podia
tentar-se; ficaria mau nos dois. Prefiro assumir "em telemóvel revê-se e
ajusta-se" e fazer isso muito bem — secções fechadas, um campo por linha, e a
certeza de que o que se toca guarda. Se me disseres que crias propostas no
telemóvel, isto muda e é uma decisão diferente.

**2. O kanban perde o arrasto em telemóvel.** Arrastar cartões entre colunas
horizontais com o polegar, num ecrã de 375 px, é uma frustração garantida. A
mudança de fase passa a ser um menu. O arrasto continua no desktop.

**3. A reposição de backup recusa-se em ecrã pequeno.** Não é uma limitação: é
a operação que escreve por cima de facturas e contratos. Fazê-la a partir de um
telemóvel, de pé, é o cenário em que ela corre mal.

**4. Detecção por capacidade, não por largura, onde importa.** Um iPad com
teclado não é um telemóvel grande. A regra que vou usar: a **largura** decide o
layout, o **ponteiro** (`pointer: coarse`) decide o tamanho dos alvos e se
existe hover. São eixos diferentes e hoje estão confundidos.

**5. Os breakpoints.** Os teus — <640, 640–1024, >1024, >1440 — não coincidem
com os do Tailwind (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Vou usar `sm`,
`lg` e acrescentar um `wide` a 1440, e **não** usar `md` nem `xl` no back
office, para não haver dois sistemas a competir. Fica documentado em
`ADAPTIVE-PRIMITIVES.md`.

---

## Duas coisas que não te posso prometer como pediste

**Os vídeos antes/depois.** O Playwright grava vídeo e vou gravá-los, mas eu
entrego **ficheiros** — não os consigo reproduzir aqui na conversa. O que
consigo mostrar-te directamente são **capturas** lado a lado. Digo-o agora para
não ficares à espera de um formato que não vai aparecer.

**Os agentes "em paralelo".** Vou fazer as catorze frentes, mas em série e por
ordem de impacto no teu dia — não em paralelo. Lançar catorze agentes ao mesmo
tempo neste código, que tem 17 mil linhas de ecrãs e uma suite de 3 000 testes,
produz conflitos que custam mais a desfazer do que o tempo que poupam.

---

## A ordem que proponho

Por impacto no trabalho diário, não pela ordem da missão:

1. **Fase 1 — fundações**: breakpoints, hooks de capacidade, e os primitivos
   (folha inferior, tabela↔cartões, menu de acções, selector de datas).
   Sem isto, cada ecrã inventa o seu e o problema volta.
2. **Inventário** — o único primário-em-telemóvel a sério, e o que tem offline.
3. **Pedidos + Propostas** — tabela↔cartões, o padrão que se repete em quatro
   ecrãs.
4. **Estúdio de propostas** — o mais difícil e o mais usado.
5. **Financeiro, dossier do evento, calendário, tarefas.**
6. **Aproveitamento do desktop** (Agente 11) — densidade, atalhos, acções em
   lote. É a metade que costuma ficar esquecida.
7. **Desempenho por aparelho** (Agente 13) e **uso hostil** (Agente 14).
8. **ADAPTIVE-AUDIT.md** e as redes que impedem regressões.

---

## Uma pergunta de calendário, não de desenho

A missão dos **Temas** ficou a meio: as Partes C, D e E não estão feitas, e a
migração está à espera do teu `commit;`. Esta missão nova é maior do que essa.
Vou começar por aqui, como pediste, mas se preferires que feche primeiro os
Temas — são poucas horas — é só dizeres.

---

## Fase 0 termina aqui

**Diz-me se concordas com as cinco decisões acima**, em especial as duas
primeiras (o estúdio e o kanban), que são as que mudam mais o que vais ver.
Depois disso executo tudo sem voltar a perguntar.
