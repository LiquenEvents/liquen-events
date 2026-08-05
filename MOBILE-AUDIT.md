# MOBILE-AUDIT — o back office no telemóvel, a fazer trabalho a sério

Auditoria dos **percursos de trabalho** do back office em quatro aparelhos, com
rede e processador estrangulados. Mede o que só existe depois de um toque: a
gaveta de um pedido, o estúdio de propostas, os diálogos onde se escreve.

Companheiro de [`TOUCH-AUDIT.md`](TOUCH-AUDIT.md), que mede as **vistas** e
nunca abre nada. Os dois juntos são a auditoria completa.

Reproduzir:

```bash
npm run dev -- --port 3210
node scripts/auditar-percursos-movel.mjs http://localhost:3210 --json percursos.json
```

---

## O resultado

**4 achados Críticos e 16 Altos → 0**, nos quatro aparelhos.

| Aparelho | Antes | Depois |
| --- | --- | --- |
| iPhone SE (375×667) | 3 Altos | **0** |
| iPhone 15 Pro (393×852) | 3 Altos | **0** |
| Pixel 8 (412×915) | 3 Altos | **0** |
| iPad retrato (768×1024) | **4 Críticos** + 7 Altos | **0** |

---

## As condições

| | |
| --- | --- |
| Rede | 4G lento — 1,6 Mbps, 150 ms de latência |
| Processador | 4× mais lento (`Emulation.setCPUThrottlingRate`) |
| Toque | ligado, o que também faz `(pointer: coarse)` ser verdade |
| Percursos | ver um pedido · diálogos onde se escreve · calendário, temas e estatísticas |

**Porquê estes quatro aparelhos.** O iPhone SE é o mais estreito que ainda se
usa — o pior caso. O 15 Pro é o telemóvel mediano de hoje. O Pixel 8 é o lado
Android, mais largo e mais alto. E o **iPad em retrato** é a largura onde as
regras de "telemóvel" deixam de se aplicar e ainda não há rato — foi lá que
apareceu tudo o que era Crítico.

### O teclado, e o que essa medição vale

Não há como abrir o teclado do sistema num browser sem cabeça. O que o guião faz
é encolher a janela para o que **sobra** com o teclado aberto (300 px no iPhone
SE, 336 no 15 Pro, 320 no Pixel, 340 no iPad — o que cada teclado tapa) e
perguntar se o botão que fecha a tarefa continua alcançável. Está marcado como
aproximação nos achados, e não como medição do teclado verdadeiro. Nenhum
diálogo falhou este teste.

---

## O Crítico: o iPad estava fora da regra que impede o zoom do iOS

Quando um campo com letra menor que 16 px recebe o foco, o Safari do iOS
**amplia a página** — e não desfaz. Fica-se com o ecrã descentrado a meio de
preencher um formulário. É comportamento do sistema, não uma preferência.

A regra que põe os campos a 16 px estava atrás de `@media (max-width: 640px)`.
Medido num iPad em retrato:

| Onde | Campo | Servido a |
| --- | --- | --- |
| Lista de pedidos | Procurar por nome, email, local | **14 px** |
| Lista de pedidos | Filtrar por categoria | **12 px** |
| Lista de pedidos | Ordenar pedidos | **12 px** |
| Diálogo de pedido novo | 14 campos (nome, email, telefone, …) | **14 px** |
| Gaveta de um pedido | 26 campos | **12–14 px** |

**A largura nunca foi a pergunta certa.** O zoom depende de o aparelho ter ecrã
táctil, não de o ecrã ser estreito. A condição passou a `(pointer: coarse)`:

- apanha o **iPad**, que estava de fora;
- apanha um **telemóvel deitado**, que também passa dos 640 px e também estava
  de fora;
- deixa de fora uma **janela de portátil encolhida** para 500 px, que estava a
  levar com o aumento sem precisar — com rato não há zoom nenhum.

Os campos ganham de caminho os 44 px de altura mínima: um campo de texto é uma
coisa em que se toca, e os do back office ficavam em 37–40 px.

---

## Os Altos, por sítio

| Sítio | O que era | Alvo |
| --- | --- | --- |
| Gaveta do pedido | Copiar email | **12×12** |
| Gaveta do pedido | O email e o telefone (`mailto:` / `tel:`) | 160×**16** |
| Gaveta do pedido | WhatsApp | 66×**16** |
| Gaveta do pedido | Dossier | 43×**36** |
| Gaveta do pedido | "⋯ Mais" | **39**×44 |
| Diálogo Ajuda | Fechar | **12×18** |
| Diálogo do calendário | Fechar | pequeno |
| Diálogo de pedido novo | Fechar | 36×36 |
| Estúdio de propostas | Remover grupo / item | **11×16** |
| Estúdio de propostas | Mover para cima / baixo | 24×24 |
| Estúdio de propostas | 1 Conteúdo · 2 Pré-visualizar · 3 Enviar | ×**32** |
| Estúdio de propostas | "Da biblioteca de temas", "+ Adicionar mood board" | ×**16** |
| Calendário | O "+" de cada dia | **13×14** |
| Adiar uma fase | "+3 dias", "+1 semana", "Limpar" | ×**16** |

O **"⋯ Mais"** merece nota: tem 44 px de altura, mas no telemóvel esconde o
rótulo e fica só com o glifo — 39 px de largura, três abaixo do mínimo. Um alvo
pode falhar num eixo só.

### O "+" do calendário: não crescer, desaparecer

O "+" de cada dia só aparece ao passar o **rato** por cima (`group-hover`, com
`text-[#4d6350]/0` até lá). Num ecrã táctil não há rato: ficava um alvo de
13×14 px **invisível**, que ainda por cima roubava o toque à célula.

A correcção não foi aumentá-lo. Foi `pointer-coarse:!hidden` — onde não há
hover, não existe. A célula inteira já abre o "adicionar", portanto não se perde
nada e ganha-se o dia inteiro como alvo.

---

## Duas coisas que só apareceram por medir DENTRO da gaveta

### 1. A linha do grupo de serviços não cabia

No estúdio de propostas, cada grupo tem uma linha com: letra + título + setas de
mover + remover. Em fila única, o título era o único com `flex-1 min-w-0`,
portanto era ele que cedia — e ficava com **22 px de largura**. Inescrevível.

Passou a `flex-wrap`, com um mínimo legível (`min-w-[12rem]`) no título.

### 2. E `sm:` não servia para a resolver

A primeira tentativa foi `flex-wrap sm:flex-nowrap`. Num iPad a 768 px o
`sm:` disparava, a linha voltava a não caber, e as setas e o "×" saíam **58 a
110 px para lá da margem**.

A razão: **`sm:` mede o ECRÃ, e estas linhas vivem dentro da gaveta de detalhe**,
que é muito mais estreita do que o ecrã. Um ponto de corte por viewport não
consegue responder a uma pergunta sobre o contentor.

A correcção foi tirar o ponto de corte: `flex-wrap` sozinho só quebra quando não
cabe — que é exactamente a pergunta certa, e não depende do aparelho.

Fica registado porque é o engano mais fácil de repetir neste back office: quase
tudo o que interessa acontece dentro de uma gaveta ou de um cartão, e o `sm:`
não sabe disso.

---

## Uma armadilha da `.alvo-toque`, agora com rede

A classe `.alvo-toque` põe `display: inline-flex`. Num elemento com `hidden` do
Tailwind — que esconde **por** `display: none` — juntá-la fá-lo **reaparecer**
no telemóvel, exactamente onde estava escondido de propósito.

Aconteceu com o atalho de pesquisa da barra de topo (`hidden sm:flex`), que se
resolveu com `pointer-coarse:min-h-11` em vez da classe. E ficou uma regra
`.alvo-toque.hidden { display: none }` para que o engano, se voltar, não tenha
efeito.

---

## O que NÃO foi medido

Dito aqui em vez de preenchido com suposições.

- **Listas e grelhas cheias.** Sem Supabase nesta máquina há **um** pedido de
  exemplo e nenhuma foto em bucket. Uma lista de 200 pedidos, uma grelha de
  moodboard com 24 fotos e uma proposta com fotografias a sério ficam por medir
  — e é aí que o scroll e a memória sofrem.
- **O teclado verdadeiro.** Ver a nota acima: a janela encolhida é uma
  aproximação da altura útil, não o teclado do sistema. O que ela não simula é
  o comportamento do `scroll-into-view` do iOS ao focar um campo.
- **Safari e Chrome a sério.** Tudo isto foi medido em Chromium. As regras
  usadas (`pointer: coarse`, o zoom aos 16 px) são comportamento documentado do
  iOS, mas a confirmação num iPhone verdadeiro fica por fazer.
- **Gestos.** Arrastar cartões no quadro de propostas, arrastar para fechar uma
  gaveta, pinçar para ampliar uma foto — nada disso foi exercitado.
- **Landscape.** Só retrato. Um telemóvel deitado tem ~400 px de altura útil com
  o teclado aberto, e é o caso mais apertado que existe.

---

## A rede que impede a regressão

Os limiares vivem em `e2e/ergonomia-tactil.mjs`, partilhados entre este guião,
o varrimento das vistas e o passeio do CI — para os três nunca discordarem. O CI
corre-os em passo **bloqueante** (`Ergonomia táctil no telemóvel`).

O que este guião mede a mais — os percursos, os diálogos e os quatro aparelhos —
**não** está no CI: leva minutos e precisa de um servidor com dados. É para
correr à mão quando se mexe na gaveta de detalhe, no estúdio de propostas ou nos
diálogos.
