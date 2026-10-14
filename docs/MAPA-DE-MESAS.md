# Mapa de mesas

Pedido dela (14/10), com a captura de um «Mapa de Mesas»:

> «de acordo com a disposição que o cliente ou que nós colaboradores queremos
> colocar, fazia-se um visual e nós conseguíamos adaptar ao número de lugares e
> colocar cada pessoa com esse número. E depois que desse para imprimir isso,
> dessa forma. Mas que fosse algo interativo, que desse para mexer, para mexer
> as cadeiras, as mesas.»

## As decisões dela

| Pergunta | Resposta |
|---|---|
| Onde fica | Um ecrã novo no menu («Mapa de mesas», no «Mais», a seguir às Timelines) |
| Quem mexe | Só a equipa, no back office |
| Grupos da lista de convidados («Família Silva · 4») | O nome do grupo em cada lugar — «uma família pode ter mais que 4 lugares. Deixa o sistema super inteligente e adaptável a cada contexto» |
| Ecrã | Tudo também no telemóvel |
| Imprimir | O desenho e a lista por mesa |
| Sala | Mesas e também noivos, pista, palco, buffet, bar |

## Onde vive

- **As regras:** `src/lib/orcamento/mapa-de-mesas.ts`, puro e com testes:
  - as cadeiras de cada forma;
  - quem está por sentar;
  - sentar um grupo;
  - acrescentar lugares;
  - o resto na mesa mais próxima;
  - sentar automaticamente;
  - o mapa a acompanhar a lista de convidados;
  - as contas.

  O ecrã e o PDF lêem as mesmas funções.
- **Os dados:** `Quote.mapaDeMesas`, dentro do pedido. Não houve migração.
  - Gravam-se pela rota do pedido com `{mapaDeMesas, base}`.
  - Num 409, os gestos que ainda não chegaram ao servidor aplicam-se por cima do mapa que lá está.
- **As pessoas** vêm da lista de convidados do pedido (`guestList`). Os recusados não entram. Um grupo de N pessoas tem N lugares («Silva 1/N»), e em cada lugar pode escrever-se o nome da pessoa.
- **O ecrã:**
  - `MapaDeMesas.tsx`: escolher o evento, com a mesma lista das Timelines;
  - `mesas/EditorDoMapa.tsx`: o estado, a gravação, a lista de espera, o inspector e a vista «Lista»;
  - `mesas/Sala.tsx`: o desenho em SVG e os gestos.

## O que está feito, e o que falta

| | Estado |
|---|---|
| Mesas redondas, compridas e quadradas; os lugares mudam o tamanho da mesa; rodar | **feito** |
| Arrastar mesas e elementos (rato, dedo e setas), andar pela sala, pinça e zoom | **feito** |
| Elementos da sala: noivos, pista, palco, buffet, bar, outro, com o tamanho ajustável | **feito** |
| Sentar por toque (um convidado da lista, depois um lugar), levar uma pessoa para outra cadeira (troca) | **feito** |
| Grupo maior do que a mesa: «Acrescentar N lugares» ou «Sentar o resto na mais próxima» | **feito** |
| Sentar automaticamente (não parte grupos quando há outra saída; não mexe em quem está sentado) | **feito** |
| Vista «Lista» com «Mudar para…» — a alternativa inteira ao arrasto | **feito** |
| Acrescentar um convidado daqui (grava na lista de convidados do pedido) | **feito** |
| Apagar com «Anular» | **feito** |
| Imprimir: o PDF com o desenho e a lista por mesa | **por fazer** (2.º PR) |
