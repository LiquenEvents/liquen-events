# Os mood boards do estúdio — o que mudou, contado

Uma proposta tem tipicamente **8 boards e ~40 fotos**, e é a secção onde se
gasta mais tempo. Este documento diz o que era preciso fazer antes e o que é
preciso fazer agora, contado em **gestos** — cliques, arrastos, toques.

Gestos e não segundos, de propósito: um cronómetro nesta máquina mediria a
minha velocidade a escrever num teclado, não o trabalho dela com o telefone ao
ouvido. O número de gestos é o mesmo em qualquer par de mãos.

## As quatro tarefas medidas

| Tarefa | Antes | Depois |
| --- | ---: | ---: |
| Reordenar 3 fotos dentro de um board | **impossível** (ver nota 1) | **3** arrastos, ou 3–9 toques nas setas |
| Mover 1 foto para outro board | **4** + a foto vai para o fim | **1** arrasto |
| Mover 6 fotos para outro board | **24** + as seis vão para o fim | **8** (6 toques a escolher + destino + confirmar) |
| Levar o board 8 ao topo | **7** cliques na seta ↑ | **1** arrasto |
| Trocar a disposição de um board | **1** clique, às cegas | **1** clique, com a página à vista |

**Nota 1 — «impossível» não é exagero.** Antes, a única ferramenta era o `×` de
remover, e as fotos novas entravam sempre no FIM. Para pôr a terceira foto em
primeiro lugar era preciso remover as duas primeiras, voltar à biblioteca,
encontrá-las outra vez e escolhê-las pela ordem certa — 10 a 12 gestos para uma
troca, e com a foto a sair de vista pelo meio. Na prática, não se fazia: a
ordem das fotos era a ordem por que calharam a ser escolhidas, e essa ordem é a
composição da página.

**A conta do «mover 1 foto»:** remover (1) → abrir a biblioteca (1) → encontrar
e escolher a foto (1) → fechar (1). E, no fim disto, a foto fica no fim do
board de destino: pô-la no sítio custava os 10–12 gestos da nota 1.

## O que passou a existir

**Dentro de um board** — arrastar (pega própria, 44 px no dedo), setas ← →,
ampliar com navegação por setas, substituir no lugar sem apagar primeiro,
remover com 10 segundos para anular, e marcar a fotografia que manda na página.

**Entre boards** — arrastar de um board para outro, incluindo para um board
vazio; e selecção múltipla com um destino em lista, para quando é uma pasta
inteira que foi parar ao sítio errado.

**Nos boards** — arrastar para reordenar, fechar (com uma tira de miniaturas
para se saber qual é), duplicar com fotos e textos, marcar como terminado
(fica só de leitura), e um índice lateral que diz quais estão vazios.

**Antes de gerar** — a página desenhada com as fotos no sítio, ao lado das
opções de disposição; a explicação de porque é que o «Automático» escolheu
aquilo; e o aviso da última fila desequilibrada.

**Sobre cada foto** — de que tema veio, se já está noutro sítio desta proposta,
e se já foi para um casamento no mesmo espaço.

## O que se mede sozinho, e continua a ser verdade

- **A ordem é uma só.** O orçamento, os mood boards e o PDF saem pela ordem da
  lista de Serviços; quando ela arruma à mão, a ordem escrita passa a mandar nos
  três. Preso em `src/lib/proposal-ordem.ts` e nos seus testes.
- **As caixas vazias nunca chegaram ao PDF.** A geometria só faz caixas para as
  fotos que existem (`caixasDoMoodboard` recebe a lista de aspectos e devolve
  uma caixa por foto). O que faltava — e passou a existir — era o aviso da
  última fila desequilibrada.
- **A foto marcada como principal sai mesmo maior.** Um teste gera as caixas das
  duas disposições com destaque e verifica que a primeira é a de maior área.
- **O tamanho do PDF é medido, não estimado:** 7 páginas fixas mais uma por
  página de inspiração (medido com 0, 1 e 3 boards → 7, 8 e 10 folhas).

## O que fica por fazer

Escrito aqui para não se perder, com a razão:

- **Vista de conjunto dos 8 boards** lado a lado, para avaliar a coerência da
  paleta, com reordenação a partir dessa vista.

## O que passou a estar feito

- **Teste Playwright do arrasto** (computador e telemóvel), em
  `e2e/moodboards-arrasto.spec.ts`, pelo sensor de teclado do dnd-kit — Espaço,
  setas, Espaço. É o mesmo `onDragEnd` do rato e é o único caminho determinista;
  ao prendê-lo pelo teclado prende-se também a acessibilidade do gesto.

  **O que ele encontrou pelo caminho, que valia mais do que ele:** o estúdio
  abria com 0 boards tendo o rascunho no `localStorage` com a chave certa —
  comparada a sério, imprimindo o `DRAFT_KEY` do `ProposalStudio` e o `id` que o
  `POST /api/orcamento` devolve. Batem certo. O defeito era do restauro: o
  efeito não era idempotente, corria duas vezes em desenvolvimento, e a segunda
  passagem lia o documento vazio que a gravação automática tinha entretanto
  escrito por cima. A gravação seguinte tornava a perda definitiva. Está
  corrigido, e a razão está escrita no `ProposalStudio.tsx`, em «CORRE UMA VEZ
  SÓ».

  E o telemóvel encontrou um segundo: num ecrã estreito as setas nunca chegavam
  à foto seguinte — as zonas grandes (a grelha, o cartão do board) ganhavam a
  corrida ao vizinho, e o cartão do board nem sequer é destino de uma foto. Quem
  só tem teclado não conseguia reordenar fotos num ecrã estreito. As setas e a
  detecção de colisões seguem agora a regra que o `onDragEnd` já aplicava: só
  param onde largar faz alguma coisa.

- **Cor dominante de cada fotografia**, no trabalhador que já as prepara
  (`image-worker.ts`), do MESMO canvas reduzido que gera a miniatura e o LQIP —
  sem uma segunda descodificação. É ali porque ali a foto está em bruto, antes
  de subir: do lado da proposta as fotos chegam por URLs assinados de outro
  domínio e ler-lhes os píxeis lançaria. A aritmética está em
  `src/lib/cor-dominante.ts`, pura e testada em Node.

  A cor viaja com o carregamento, é validada à entrada (`src/lib/cor.ts`, uma
  lista de permitidos curta: `#rrggbb` e mais nada) e fica na linha da foto.

- **Aviso de paleta fora da média.** Por board, e só quando salta à vista: os
  pesos da distância entre cores foram calibrados contra dois casos que têm de
  cair de lados opostos — uma página de verdes com uma foto de azul forte (avisa,
  0,48) e uma página de verdes COM cremes (não avisa, 0,29), que é a paleta mais
  comum de um casamento. O limiar fica a meio, com folga dos dois lados. Não é
  vermelho: uma foto de cor diferente pode ser exactamente o que se quer.

- **«Organizar automaticamente» por cor.** Um botão por board, que encadeia as
  fotos pela mais parecida com a anterior começando pela mais típica da página —
  não é «ordenar por matiz», que partiria os vermelhos pelas duas pontas.
  As fotos sem cor conhecida ficam no fim, pela ordem em que estavam: nunca se
  inventa uma cor para as poder arrumar. Entra no histórico como qualquer outra
  alteração, e o Cmd+Z desfaz.

- **Registo do tempo activo, acumulado no SERVIDOR.** A contagem já existia e
  estava testada (`tempo-activo.ts`); o que faltava era o sítio onde os totais
  sobrevivessem. Está em `tempo-activo-servidor.ts` (na tabela `app_state`, como
  os rascunhos) e em `POST /api/orcamento/[id]/tempo-activo`.

  O cliente manda o que passou DESDE O ÚLTIMO ENVIO e o servidor soma. Se
  mandasse o total, dois aparelhos abertos na mesma proposta escreviam um por
  cima do outro — que é a avaria que trazer isto para o servidor veio resolver.
  A secção vem da coluna lateral, que já a calculava: é o que responde a «que
  boards custam mais tempo?» em vez de só «esta proposta levou duas horas».
