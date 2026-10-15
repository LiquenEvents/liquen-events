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
  - `mesas/PartilharMapa.tsx`: o menu «Partilhar» e a folha do email.
- **O PDF:** `src/lib/orcamento/mapa-de-mesas-pdf.ts` (pdf-lib, Carlito e o
  logótipo, como o guião). Um nome com uma letra que a fonte não tem
  («Nguyễn», «Ł») perde o acento em vez de rebentar o PDF.
- **As rotas** (só com sessão, na tabela do `auth-guard-audit`):
  - `GET /api/mesas/[id]/pdf` — descarrega; com `?ver=1` abre no separador
    (o «Imprimir»). Um mapa sem mesas dá 409 com a frase;
  - `POST /api/mesas/[id]/enviar` `{para, assunto, mensagem}` — o endereço vem
    do corpo porque é ela quem o escolhe, e é validado. **Sem SMTP no servidor
    responde 503 e diz que o mapa NÃO seguiu** — nada de «enviado» que não
    chegou, e o histórico só regista o que seguiu mesmo.

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
| **O ecrã de trabalho (14/10, 2.ª volta):** a sala no ecrã inteiro, com a barra de cima de vidro, a lista de espera e o painel da peça a flutuar | **feito** |
| «Adicionar ▾» com ícones: as três mesas e os seis elementos da sala | **feito** |
| A barrinha junto da mesa escolhida: «− N lugares +», Rodar, Duplicar, Apagar — o «adicionar um lugar» dela, no desenho | **feito** |
| Arrastar um convidado da lista para uma cadeira (ou para uma mesa: senta-o nos primeiros livres) | **feito** (computador; no telemóvel é tocar e tocar) |
| Guias de alinhamento ao arrastar uma mesa ou um elemento (encaixa no centro de outra peça) | **feito** |
| Anular e refazer, 50 passos (⌘Z, ⇧⌘Z; ⌘D duplica); o nome de uma mesa escrito é UM passo | **feito** |
| De perto, o nome curto de cada pessoa debaixo da cadeira («Silva 2»); o selo «6/8» em cada mesa | **feito** |
| A lista dos eventos: o dia em grande, quanto falta, «8 mesas · 64/74 sentados» com a barra, o próximo à cabeça, procura | **feito** |
| **Partilhar (14/10, 3.ª volta):** «Partilhar ▾» na barra de cima (no telemóvel, dentro do «⋯») com Descarregar PDF, WhatsApp, Email e Imprimir | **feito** |
| O PDF: o desenho numa A4 deitada, depois a lista por mesa a três colunas, e no fim quem ficou por sentar | **feito** |
| **Um número em cada lugar (15/10):** «há mais do que uma Mariana… aparece só MA ou MB… coloca em cada lugar o número, para na lista sabermos que aquele número é para aquela pessoa». Ela escolheu um número **único na sala toda** (1, 2, 3…, mesa a mesa pela ordem do nome, os livres também contam — `numerosDosLugares`) e, no desenho, **o número e as iniciais**. A lista por mesa, o painel da mesa e a vista «Lista» do ecrã mostram o MESMO número; «Por sentar» deixou de numerar as linhas, para não se confundir com um lugar | **feito** |
| WhatsApp: no telemóvel, o «Partilhar» do sistema já com o PDF; no computador, descarrega o PDF e abre o WhatsApp com a frase escrita | **feito** |
| Email: vem com o email do casal e muda-se na hora (quinta, catering, equipa); o PDF segue em anexo, com a assinatura da casa; fica no histórico do pedido | **feito** |
| Antes de pedir o PDF grava-se o que está por gravar — o PDF tem sempre a última mesa | **feito** |

**O que ficou de fora do «Partilhar», e porquê:**
- **Nenhum site consegue anexar um ficheiro a uma conversa do WhatsApp.** No
  computador o browser não partilha ficheiros, por isso o PDF descarrega-se e
  o WhatsApp abre com a frase: arrasta-se o ficheiro para a conversa, e o
  aviso di-lo.
- **O email não foi experimentado com um servidor de correio a sério** (aqui
  não há, e não se manda email a ninguém para o provar). Os testes simulam o
  correio e provam o destino, o anexo e o histórico.

**O que ficou de fora do ecrã de trabalho, e porquê:**
- **O endereço não guarda o evento aberto** (`?evento=`). O gesto de voltar
  já fecha o ecrã inteiro (`useCamadaDeHistoria`), e um segundo dono do
  endereço a mexer na história desalinhava essa contagem — o `AdminClient`
  explica o mesmo para as secções. Recarregar volta à lista.
- **O resto do back office continua no leitor de ecrã por baixo do ecrã
  inteiro** (está tapado, mas não `inert`). Pôr `inert` no cabeçalho e na
  barra de destinos é mexer no `AdminClient`; fica anotado.
