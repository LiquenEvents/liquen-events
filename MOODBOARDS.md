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

- **Teste Playwright do arrasto** (desktop e telemóvel). O caminho determinista
  é o sensor de teclado do dnd-kit (Espaço, setas, Espaço), não o rato. Não
  ficou feito.
- **Vista de conjunto dos 8 boards** lado a lado, para avaliar a coerência da
  paleta, com reordenação a partir dessa vista.
- **Aviso de incoerência de paleta** e **«organizar automaticamente» por cor**.
  Os dois dependem de extrair a cor dominante de cada fotografia. No browser
  isso faz-se com um `canvas`, mas as fotos vêm de URLs assinados de outro
  domínio: sem os cabeçalhos de CORS certos, ler os pixéis lança e o resultado
  seria uma funcionalidade que ora funciona ora não. O sítio certo para isto é o
  trabalhador que já prepara as imagens (`image-worker.ts`), que as tem em bruto
  antes de subirem — e isso é uma frente própria.
- **Registo do tempo activo** por proposta e por secção. É um contador de
  segundos com a página em foco, mais um sítio onde os acumular entre propostas
  — servidor, não `localStorage`, senão a resposta a «que boards custam mais
  tempo?» seria só a deste computador.
