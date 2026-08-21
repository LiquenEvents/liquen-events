# Registo da adaptação a mobile

Dez agentes especializados, uma passagem cada, **nenhuma correcção aplicada**. O repositório
está exactamente como estava: as únicas coisas que mudaram foram estes doze ficheiros de texto.

**155 entradas — 8 bloqueiam, 84 são graves, 63 são acabamento.** Mais 55 tarefas
classificadas pelo Agente 10, que não conta entradas porque não procura defeitos.

Os relatórios completos estão em `agente-01.md` a `agente-10.md`, cada um com o formato
inteiro (Largura onde falha / Onde / Observado / Proposta / Equivalente em desktop). Este
ficheiro é o índice, as contas, e a leitura de conjunto.

---

## Por agente

| Agente | Total | Bloqueia | Grave | Menor |
|---|---|---|---|---|
| 1 — Paridade desktop/mobile | 14 | 0 | 10 | 4 |
| 2 — Layout e rutura | 16 | 2 | 7 | 7 |
| 3 — Toque e ergonomia | 18 | 1 | 11 | 6 |
| 4 — Formulários e teclado | 20 | 1 | 9 | 10 |
| 5 — Navegação e orientação | 21 | 2 | 11 | 8 |
| 6 — Densidade e legibilidade | 16 | 0 | 10 | 6 |
| 7 — Desempenho em rede fraca | 16 | 1 | 9 | 6 |
| 8 — Sheets e sobreposições | 15 | 1 | 9 | 5 |
| 9 — Acessibilidade | 19 | 0 | 8 | 11 |
| 10 — Classificação de tarefas | — | — | — | — |
| **Total** | **155** | **8** | **84** | **63** |

## Por ecrã

Os nomes dos ecrãs foram agrupados: um defeito que os agentes descreveram como «Estúdio ·
Mood boards» e outro como «Fazer proposta · Conteúdo» são o mesmo sítio.

| Zona | Total | Bloqueia | Grave | Menor |
|---|---|---|---|---|
| Transversal (toda a casa) | 38 | 1 | 20 | 17 |
| Fazer proposta · Estúdio | 35 | 2 | 23 | 10 |
| Pedidos | 20 | 3 | 7 | 10 |
| Temas · Biblioteca | 14 | 1 | 8 | 5 |
| Página pública / do casal | 11 | 0 | 3 | 8 |
| Evento · Material · Carregamento | 10 | 0 | 8 | 2 |
| Calendário | 9 | 0 | 5 | 4 |
| Definições · Entrada | 6 | 0 | 4 | 2 |
| Visão Geral · Kanban | 6 | 1 | 2 | 3 |
| Propostas · Clientes | 3 | 0 | 2 | 1 |
| Outros | 3 | 0 | 2 | 1 |

Vale a pena olhar para as duas primeiras linhas juntas: **quase metade das entradas não são
de um ecrã**. São de coisas que a casa faz em todo o lado da mesma maneira — e isso é uma
boa notícia, porque significa que se corrigem uma vez.

---

## Os oito que bloqueiam

Nenhum destes é «faz-se com atrito». São tarefas que num iPhone não se fazem.

**1. [A8-001] O gesto de voltar do Safari não fecha nada — sai do back office.**
Zero `pushState`/`popstate` em todo o `src/` fora da galeria pública. As vistas, a gaveta do
pedido, os separadores, os sete passos do estúdio e catorze modais são todos `useState`. No
iPhone, deslizar da esquerda **é** o botão de voltar — portanto isto acontece por acidente, a
qualquer profundidade, e o guarda que devia perguntar «tens alterações por gravar» nunca chega
a correr. Reportado em dobro pelos Agentes 5 e 8, o que é sinal de que é a causa e não o
sintoma.

**2. [A5-002] Com um pedido aberto sobra UM alvo de saída no ecrã todo.**
A gaveta ocupa a largura toda por cima do cabeçalho, a barra de baixo recolhe, e o fundo
escuro que fecharia ao toque fica por baixo dela. Resta o «×» do canto superior direito — o
ponto do ecrã mais longe do polegar. O comentário no código promete exactamente o contrário.

**3. [A5-013] A checklist da carrinha — a única tarefa que É de telemóvel — está a quatro
toques e não tem entrada na navegação.** O ecrã de carregamento é o melhor desenhado da casa
para o dedo (linhas de 56 px, `localStorage` primeiro, fila de saída) e chega-se lá por um
link de texto no fundo de um painel.

**4. [A7-001] O painel do pedido guarda as notas sozinho e mais nada.**
Preço, data, convidados, local e contactos vivem em memória; o «Guardar» é um pedido cru sem
tecto de tempo nem repetição; e o único travão é um `beforeunload`, que o iOS não honra quando
descarrega um separador. Numa quinta com 4G fraco, isto é trabalho perdido sem aviso.

**5. [A3-001] O Kanban move cartões por arrasto nativo do HTML5**, que o Safari do iOS não
implementa. A coluna vazia diz «Arrasta para aqui» a um dedo que não pode, e a alternativa
(setas do teclado) também não existe num telemóvel.

**6. [A4-001] Uma edição em linha começada não se consegue abandonar.**
Guião do dia, checklist, inventário, estúdio: a única saída é o Escape, e `onBlur` grava. Num
telemóvel não há Escape — portanto uma correcção errada não tem como ser desfeita.

**7. [A2-001] A caixa do nome de uma linha do orçamento tem 62 px** a 390 px — 27 com a
proposta bilingue ligada. Parte abaixo dos 520 px. É onde se escreve «Arranjo floral para a
mesa dos noivos».

**8. [A2-002] A barra que aplica etiquetas na revisão da biblioteca fica por trás da barra de
destinos.** Escolhem-se as fotos e não se etiqueta.

---

## Os padrões — uma causa, vários sintomas

Esta é a secção que decide a ordem de correcção. Cinco causas explicam bem mais de metade das
155 entradas.

### P1 · O código foi escrito para o Chrome, e ela usa o Safari

Não é uma questão de estilo: são funcionalidades que **estão desligadas no aparelho para que
foram feitas**.

- `navigator.connection` não existe no Safari, e os quatro travões de «ligação lenta / poupar
  dados» fazem `if (!conn) return true`. No iPhone, o travão diz sempre «podes».
- `requestIdleCallback` não existe no Safari, e o aquecimento de miniaturas — a cura conhecida
  da lentidão dos Temas — desiste sem ele. O próprio repositório tem um ficheiro que diz que o
  Safari não o tem.
- Arrasto nativo do HTML5 não existe em toque: Kanban e reordenar fotos de um tema.
- `beforeunload` não é honrado pelo iOS ao descartar separadores — e é o único guarda de
  trabalho por gravar do painel do pedido.
- E o contrário, que está bem: **zero `navigator.vibrate`** no repositório, que é a decisão
  certa porque o WebKit não a implementa.

### P2 · O remédio já existe na casa e não foi propagado

O padrão mais barato de corrigir e o mais caro de ignorar, porque cada ocorrência parece um
defeito novo e não é.

| O que já existe | Onde está aplicado | Onde falta |
|---|---|---|
| `--bo-text-muted` (5,9:1) | 109 sítios | 693 abaixo do chão do AA |
| `.alvo-invisivel` | seletor de temas | pega das fotos do mood board, e outras |
| `seguirOTeclado` (mede a `visualViewport`) | 1 ficheiro (entrada) | 264 campos |
| `fetchComTecto` | algumas rotas | abrir um pedido, 450 linhas abaixo dele |
| `prefersReducedMotion()` partilhado | 13 componentes públicos | **zero** do back office |
| Fila de saída + sincronizar ao voltar | 1 ecrã (carregamento) | todo o resto |
| `type`/`inputMode` corretos | formulário público | back office inteiro |
| `FolhaOuDialogo`, `GRELHA_DE_FOTOS` | 1–2 sítios | cinco das dezasseis entradas de layout |
| `useFocusTrap` (faz `inert`) | vários diálogos | gaveta de navegação, calendário |
| `dvh` | a maioria | 3 diálogos ainda em `vh` |

### P3 · Não há história, portanto não há «voltar»

Já está em cima como bloqueio, mas repete-se aqui porque é causa: resolve o gesto de voltar,
resolve fechar sheets, resolve o passo do estúdio que se perde, resolve a gaveta sem saída.
Uma peça — um `useHistoria` que empurra um estado por camada aberta — apaga entradas em cinco
relatórios diferentes.

### P4 · As barras fixas não se conhecem umas às outras

Há um token para a altura da barra de baixo, e quem devia usá-lo não usa: uma barra de acções
`sticky bottom-0` fica por trás dela, outra `fixed bottom-6` pousa-lhe em cima, os avisos saem
por trás de cinco diálogos, e o fundo escuro da gaveta está no mesmo plano do cabeçalho que
devia tapar. Não é um bug — é a falta de uma escada de planos escrita num sítio só.

### P5 · As redes de segurança existem e não se cruzam

O verificador de acessibilidade corre em nove rotas **públicas**, em Chrome de computador. O
passeio de 375 px cobre o back office e **não** corre o verificador. As duas coisas nunca se
encontram — e sozinho, o verificador apanharia pelo menos oito das dezanove entradas de
acessibilidade. Há ainda um teste de escala de letra que passa a verde por casar uma
subcadeia, o que deixou uma fresta entre os 640 e os 1023 px.

---

## Classificação das tarefas (Agente 10)

**55 tarefas: 24 mobile nativo · 15 consulta · 20 desktop** (cinco partidas em duas
classificações — marcar vs. editar — contadas do lado onde o telemóvel manda).

A leitura dele, que subscrevo: **há dois back offices aqui dentro.** O de **escrever**
(estúdio, serviços, mood boards, modelos, definições) é de computador. O de **saber e marcar**
(evento do dia, carrinha, tarefas, pagamentos, estados) é de telemóvel — e hoje só existe em
condições num único ecrã, que por acaso é o que está mais escondido.

E a parte que poupa trabalho: **cinco famílias de correcção que os outros agentes propõem com
razão de layout devem ser fechadas com um aviso em vez de corrigidas**, porque caem em tarefas
que não devem acontecer no telemóvel — o editor de Serviços a 390 px, o arrasto de fotos entre
páginas, os modelos de email a duas colunas, a barra de guardar do painel de gestão, e mudar a
política de segurança para mostrar o PDF num iframe. A tabela completa está no `agente-10.md`.

## Paridade

A tabela das trinta linhas está no fim do `agente-01.md`. O resumo: o back office já foi
trabalhado a sério para o dedo — as tabelas viram cartões, os atalhos escondem-se porque tudo
tem botão, o Kanban trocou arrasto por setas. **O que falta são as três colunas laterais do
computador** (índice de secções do estúdio, contacto do cliente no dossier, o que falta para
enviar) e alguns controlos únicos que ficaram do lado errado de um `sm:` — ordenar propostas,
exportar o calendário, o responsável de uma tarefa.

Uma só tarefa é «computador apenas»: repor uma cópia de segurança.

---

## Ordem de correcção proposta

1. **Os oito que bloqueiam.** Por esta ordem dentro do lote: o histórico (P3, que arruma dois
   deles), a saída da gaveta, a gravação do painel do pedido, a checklist da carrinha, as duas
   ruturas de layout, o Kanban, e o abandonar de uma edição.
2. **Os padrões de sistema.** P4 (a escada das barras), P2 nas suas linhas mais rentáveis — o
   `role="alert"` que arruma 113 campos de uma vez, o `--bo-text-muted`, o `seguirOTeclado` —
   e P1 (as verificações que assumem Chrome).
3. **As lacunas de paridade** nas tarefas classificadas como mobile nativo — e só nessas.
4. **Graves.**
5. **Menores.**

E antes de qualquer um deles, P5: pôr o verificador de acessibilidade a correr no passeio de
375 px. Se ele apanha oito destas sozinho, apanha as próximas oito sem ninguém pedir.

---

## Uma limitação, dita à frente

Os dez agentes trabalharam por **leitura de código**: sem browser e sem servidor. As larguras
vêm das medidas do próprio repositório (as margens, os `p-5`, os `grid-cols`) e as contas de
contraste da composição alfa das cores, mas **nada disto foi visto num ecrã**. O que precisa
de olho ficou marcado `[por confirmar no ecrã]` nos relatórios — sobretudo o comportamento com
o teclado aberto, a ordem de quebra das barras, e as medidas de área segura por aparelho.

Essas confirmam-se com o Playwright a 390 px no início do primeiro lote de correcções, que é
quando custam menos.
