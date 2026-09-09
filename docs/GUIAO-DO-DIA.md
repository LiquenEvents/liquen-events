# Guiões do dia — a vista de topo

> **Âmbito:** a vista `guioes` do back office (`/orcamento/admin?v=guioes`), o
> motor que ela reutiliza e os modelos de guião.
> **Pré-requisito:** os tokens e as regras do `docs/DESIGN-SYSTEM.md`. Nenhum
> valor de cor, espaço, raio, duração ou curva existe fora deles.

---

## A DECISÃO, ANTES DE TUDO: REUTILIZAR

Posta a escolha entre **promover e ampliar o `EventTimeline` a vista de topo**
ou **construir uma vista nova**, a resposta é a terceira, e é a que o código
pedia: **uma vista nova que monta o `EventTimeline` que já existe, sem lhe
tocar no motor nem no editor.**

Porquê, ponto a ponto:

**O que faltava não era nenhuma das partes difíceis.** O `guiao-do-dia.ts` já
sabia onde cada momento começa e acaba na régua de um dia que não acaba à
meia-noite, quem está em dois sítios ao mesmo tempo, onde estão os vazios, e o
que vem a seguir a esta hora. O `EventTimeline.tsx` já sabia desenhar isso à
escala, editar com o polegar (durações de lista fechada), e gravar com
protecção contra duas pessoas a escrever ao mesmo tempo — incluindo o 409 que
reaplica o GESTO por cima da versão do servidor em vez de mandar a lista
inteira. Nada disto se reescreve por gosto.

**O que faltava era chegar lá.** O guião vivia dentro da zona de produção de UM
evento, a três aberturas de distância. A pergunta de segunda-feira de manhã —
«dos eventos que aí vêm, quais é que já têm guião e quais é que têm um
problema?» — não tinha ecrã nenhum, porque não se responde a abrir vinte
pedidos.

**Promover o `EventTimeline` a vista de topo não servia**, e a razão é o `key`:
ele copia `quote.timeline` para estado interno no primeiro render e está preso
ao id do pedido. É um componente de UM evento, por construção e com razão. Uma
vista de topo tem de listar vinte.

**Construir de novo era pior ainda.** Um segundo editor de guiões a viver ao
lado do primeiro é literalmente o defeito que o `CLAUDE.md` manda evitar por
escrito («converge com a família que já existe»). Na prática seriam duas
implementações da gravação com 409, duas listas de degraus de duração, e dois
ecrãs a discordar sobre o mesmo dia — que é a avaria mais cara possível num
papel que se entrega à equipa na manhã do evento.

**O que se acrescentou, e só isto:** a lista de todos os guiões, a régua deitada
que os torna comparáveis, os modelos, e a casa onde as três coisas vivem.

---

## O QUE SE MOVEU (convergência, não duplicação)

| Estava | Passou para | Porquê |
|---|---|---|
| `TEMPLATE` (o cronograma-base), em `EventTimeline.tsx` | `MODELOS_DA_CASA[0]`, em `lib/orcamento/guiao-modelos.ts` | O cronograma-base do botão e o modelo «Casamento de tarde» da vista são a mesma coisa com dois nomes. Duas cópias divergem no dia em que alguém afinar uma. Os oito momentos ficaram byte a byte iguais. |
| `DEGRAUS_DE_DURACAO`, `SEM_DURACAO`, `opcoesDeDuracao`, em `EventTimeline.tsx` | `lib/orcamento/guiao-do-dia.ts` | Os degraus (15/30/45/60/90/120/180/240/360/480) são uma decisão do ofício, não do componente. Com dois sítios a editar guiões, uma segunda lista escrita ao lado da primeira acaba com o dossier a oferecer «90 min» e a vista de topo não. |

O `EventTimeline` ganhou **duas propriedades opcionais** e mais nada:
`modelos` e `aoGuardarComoModelo`. Sem elas — que é o caso do dossier de um
evento — o painel abre exactamente como abria.

**Porque é que os modelos são uma propriedade e não uma leitura de dentro do
`EventTimeline`.** Tentou-se primeiro um `useCachedList` lá dentro, que os dava
aos dois sítios sem prop nenhuma. Não passa: os testes desse componente CONTAM
as chamadas ao `fetch` para provar que duas remoções ao mesmo tempo não
ressuscitam um momento apagado (`EventTimeline.test.tsx`), e uma leitura de
modelos à montagem entrava como chamada número um e trocava as respostas todas.
Uma leitura acrescentada a um componente que já usa o `fetch` para gravar não é
gratuita.

---

## O DESENHO

### A régua deitada é o objecto central

A régua do `EventTimeline` é **vertical**, é onde se edita, e cada bloco tem
44 px de chão para se tocar com o polegar: um dia mede uns 800 px. Vinte dias
medem dezasseis mil, e a pergunta desta vista não se responde a rolar dezasseis
mil píxeis.

O `ReguaDoDia.tsx` é a mesma informação **deitada e sem chão nenhum**: um dia
cabe numa fita de uma linha. É a relação que o sistema de design já descreve
entre o sparkline da Visão Geral e o gráfico grande das Estatísticas, e por isso
**não inventa vocabulário**:

| Coisa | Como se desenha | Igual a |
|---|---|---|
| momento com duração | barra cheia, a acento, com o comprimento do tempo | o bloco do `EventTimeline` |
| momento sem duração (instante) | traço de 3 px + ponto redondo por cima | o carril tracejado do `EventTimeline` |
| vazio (só os CERTOS, ≥ 60 min) | moldura tracejada | a banda tracejada do `EventTimeline` |
| choque de responsável | barra a perigo + losango por cima | o carril vermelho do `EventTimeline` |
| sobreposição | um SEGUNDO CARRIL — a régua engrossa | a banda com tinta do `EventTimeline` |
| «agora» | risca vertical, só no dia do evento | o ponto do «agora» do `EventTimeline` |

**Os carris são a parte que interessa.** Duas coisas ao mesmo tempo ocupam o
mesmo intervalo de píxeis; postas no mesmo carril, a segunda tapa a primeira e a
fita mostra um dia limpo onde há duas coisas em cima uma da outra. Cada bloco vai
para o primeiro carril onde não bate em nada (`emCarris`), portanto **a régua
engrossa onde o dia corre em paralelo**. Não é uma legenda: é a forma.

### A janela é comum a todas as réguas

Se cada linha tivesse a sua própria escala, todas mediriam o mesmo comprimento e
a comparação seria falsa — um evento de quatro horas desenhava-se tão largo como
um de dezanove. A `janelaComum` vai do início mais cedo ao fim mais tarde de
todos os dias da lista, com um chão de doze horas para um evento curto sozinho
não encher a régua de bordo a bordo.

E calcula-se sobre a lista **inteira**, não sobre a filtrada: se dependesse do
filtro, trocar «Todos» por «Com problema» reescalava todas as fitas ao mesmo
tempo, e uma régua que se mexe quando os dados não mudam é uma régua em que não
se acredita.

### A cor nunca é o único portador

Regra da casa, e já houve aqui um calendário que dizia o estado só com cor. Cada
sinal leva **cor + ícone + palavra**, e o nome acessível da linha traz a **frase
inteira** («Uma pessoa em dois sítios ao mesmo tempo»), não um «Choque, 1»
solto. Um dia lido em tons de cinzento continua a separar os estados; um dia
lido em voz alta continua a dizer o que se passa.

As cores são as três com significado desta casa e nenhuma mais: perigo, aviso e
acento. «Pronto» não ganha uma quarta cor — é a ausência de problema, não um
estado a celebrar.

### O que a vista mostra, por ordem

1. **O dia que está a acontecer**, quando há um (`estaNoDia`): a régua grande
   com as horas escritas e a risca do «agora», o que está a decorrer em pequeno
   e **o que vem a seguir em grande**. É a mesma hierarquia do `EventTimeline`,
   de propósito — o mesmo dia visto de dois sítios não pode ler-se de duas
   maneiras. Nos outros dias este painel não existe: um «agora» a apontar para
   um dia que não é o do evento parece informação e é ruído.
2. **O filtro** — Todos · Por fazer · Com problema, com as contagens.
3. **A lista**, com os que aí vêm primeiro (do mais próximo para o mais longe) e
   os que já passaram no fim (do mais recente para o mais antigo). O próprio dia
   do evento conta como futuro, e conta até ao fim: é durante o evento que este
   ecrã mais serve.
4. **O guião aberto** — o `EventTimeline` inteiro, com a folha para imprimir.

No computador a lista e o guião vivem lado a lado; no telemóvel trocam de lugar,
porque dois painéis de largura inteira empilhados obrigavam a rolar a lista toda
para chegar ao guião que se acabou de abrir.

---

## OS MODELOS

Ela faz o mesmo tipo de dia vinte vezes por ano. Sem modelos, cada evento novo
obriga a escrever oito momentos e oito durações à mão — que é o trabalho que
ninguém faz, e é por isso que a maior parte dos guiões nasce e morre vazia.

**Três modelos da casa**, que vêm com o produto e não se apagam: «Casamento de
tarde» (o antigo cronograma-base), «Evento corporativo» e «Batizado». Mais os
que ela guardar.

**Um modelo guarda horas absolutas, não desvios.** A alternativa era «montagem:
T−8h» ancorado à cerimónia. Recusada por duas razões deste domínio: (1) ela
pensa em horas de relógio — «a cerimónia é às cinco» é a frase, «a montagem é
oito horas antes da cerimónia» não é —, e um modelo com desvios obriga a
escolher uma âncora que não existe no ofício; (2) a régua já tem UMA
adivinhação (uma hora antes das 05:00 vale +24h, porque o encerramento das 02:00
é o fim do dia), e com desvios seria preciso refazê-la ao contrário. O custo,
dito com todas as letras: um casamento com cerimónia às 16:00 obriga a corrigir
as horas depois de aplicar o modelo — um toque por momento numa lista fechada,
contra oito momentos escritos de raiz, e com as durações já certas.

**Guardar como modelo tira os responsáveis.** Um modelo é a FORMA do dia; «Rita»
não é a forma de nada. Guardá-la fazia com que aplicar «Casamento de tarde» a um
evento onde a Rita não trabalha **inventasse choques com o nome dela** — o motor
compara responsáveis para dizer quem está em dois sítios ao mesmo tempo.

**Aplicar um modelo ACRESCENTA, nunca substitui.** Com o guião vazio dá o mesmo;
com o guião de outra pessoa por baixo — que é o que acontece quando um 409 manda
reaplicar o gesto — deitar fora o que lá está era usar um modelo para apagar
trabalho. Não há nesta vista um único caminho que destrua um guião sem ser
momento a momento, com o × de cada linha. Por isso o comando diz **«Juntar
modelo…»** e não «Aplicar»: o verbo tem de dizer o que o toque faz.

**Onde ficam.** Na tabela `app_state`, sob a chave `guiao-templates` — a mesma
decisão e a mesma razão dos modelos de proposta (`proposal-templates.ts`): uns
KB por modelo não valem um passo manual de SQL numa instalação já a funcionar, e
uma funcionalidade que só arranca depois de alguém abrir o painel do Supabase é
uma funcionalidade que não existe. Tectos: 40 modelos, 256 KB, 200 momentos por
modelo.

**A gravação diz onde ficou.** Sem base de dados configurada em produção, o
`app-state` escreve para o disco da função e isso desaparece no deploy seguinte.
Dizer «Guardado» sobre isso é a avaria que custou uma proposta inteira montada
(está contada por extenso no `app-state.ts`). A rota devolve o
`ResultadoDeEscrita` e a vista diz a verdade: «ficou guardado só nesta máquina».

---

## OS DADOS

| O quê | De onde | Porquê |
|---|---|---|
| A lista de guiões | `GET /api/guioes` | O `timeline` é um dos cinco campos que o resumo dos pedidos deixa cair de propósito (`CAMPOS_SO_DO_DETALHE`) — com 300 pedidos era o cronograma que enchia o HTML da página. A rota devolve os MOMENTOS e mais nada, uns 60 bytes cada. |
| Os modelos | `GET /api/guioes/modelos` | Os da casa (do produto) e os dela (do `app_state`), na mesma lista, para o ecrã ter uma para desenhar em vez de duas para reconciliar. |
| O pedido aberto | `comPedidoInteiro` do `AdminClient`, por propriedade | Essa função sabe uma coisa aprendida a doer: a rota do pedido responde **200 com uma versão CURTA** quando a sessão caiu, e só o cabeçalho `x-pedido: completo` distingue as duas. Uma segunda leitura escrita na vista herdava o defeito — e este é o ecrã onde o guião se GRAVA. |

**A rota devolve os momentos e não a análise**, e é deliberado: a análise é o
`analisarODia`, a mesma função que o `EventTimeline` usa. Cozinhar um resumo no
servidor («2 choques, 1 buraco») era uma segunda implementação da mesma
pergunta, a divergir em silêncio no dia em que uma das duas fosse afinada — com
a lista a dizer «pronto» sobre um dia que o ecrã do evento marca a vermelho.

**A lista fica em dia com o que se edita.** O `setData` do `useCachedList`
escreve na cache: apagar um choque dentro do editor tira a pastilha vermelha da
linha ao lado no mesmo instante, e sair da vista e voltar não ressuscita o
estado antigo.

---

## A NAVEGAÇÃO

`guioes` entra no **`MORE_NAV`** e não na `BARRA_INFERIOR`, e a justificação é a
que já estava escrita no `nav.tsx`: a barra de baixo tem quatro lugares, os
quatro estão tomados pelo dia de trabalho comercial (ver o que há, ler o que
entrou, escrever a proposta, ver as que saíram), e um quinto botão dava cinco
alvos de 75 px numa barra de 390 onde 44 é o mínimo. Tirar um dos quatro para
pôr este era trocar a tarefa que dá o dinheiro por uma que só serve nas semanas
em que há evento.

Fica **em primeiro no «Mais»**: é o único destino dessa lista que se usa com um
evento em cima, de pé, numa quinta. Os outros cinco são de escritório. No
computador não há diferença nenhuma — a barra mostra os doze.

---

## OS TESTES, E QUE AVARIA CADA UM GUARDA

**`src/lib/orcamento/guioes.test.ts`** — as contas que decidem qual dos vinte
dias ela abre a seguir. Com controlos negativos a sério: mudar só o NOME do
responsável tem de trocar «choque» por «sobreposição»; um dia sem sobreposições
tem de dar **um** carril e não um por bloco (senão o teste dos dois carris
passava por acaso); as mesmas sete horas entre os mesmos dois momentos deixam de
ser um «vazio» quando o momento anterior perde a duração.

**`src/lib/orcamento/guiao-modelos.test.ts`** — que nenhum modelo da casa traga
responsáveis (senão inventa choques), que todos tragam durações (senão o dia
nasce sem forma), que nenhum nasça com um choque, e que o vazio das 13:00 às
16:00 do cronograma-base continue lá.

**`src/app/[lang]/(admin)/orcamento/admin/Guioes.test.tsx`** — a promessa da
vista: um evento por linha, o estado com cor E forma E palavra, o filtro a
filtrar mesmo, e o caminho do modelo até ao PATCH. A régua **não** se mede aqui,
de propósito: em jsdom não há disposição nenhuma e medir larguras de blocos era
medir zero e passar sempre.

**`e2e/guiao-do-dia.spec.ts`** — as quatro coisas que só um browser vê: que o
destino existe (uma `View` declara-se em quatro sítios e só dois é que o
compilador exige em par), que o chunk monta, que a gravação **volta depois de
recarregar** (e não só foi desenhada), e que a folha do dia sai **cheia** — com
os momentos e com os intervalos «16:00 → 19:00». Uma folha em branco entregue à
equipa na manhã do evento é o defeito mais caro deste ecrã, e sai com 200 e sem
um erro na consola.

Corre em `npm run test:e2e:dados` (servidor próprio, que grava) pela razão que
está escrita no `playwright.dados.config.ts`: o servidor de produção sem
Supabase recusa toda a escrita, e sem escrita não há pedido nem guião.

---

## O QUE FICOU POR FAZER

- **Os modelos não chegam ao dossier do evento.** O `EventTimeline` aceita-os
  por propriedade e o `AdminClient` ainda não lhos passa lá — é uma leitura a
  acrescentar e duas linhas de JSX, mas mexe num ecrã com muitos testes e não
  entrou nesta ronda.
- **Não há como apagar um modelo pela interface.** A rota
  `DELETE /api/guioes/modelos/[id]` existe e recusa os da casa; falta o comando
  no ecrã.
- **Imprimir a partir da linha da lista.** Só se imprime com o guião aberto, e é
  uma limitação técnica com nome: o `printRunSheet` abre uma janela, e uma
  janela aberta depois de um `await` é bloqueada pelo browser. Na lista o pedido
  inteiro ainda não chegou. A saída seria pré-carregar o pedido ao passar o rato
  sobre a linha.
- **Arrastar um bloco na régua para o mover.** A edição continua a ser pela
  lista fechada de degraus, que é a decisão certa para o polegar. Arrastar seria
  um acréscimo para quem tem rato, não um substituto.
