# TOUCH-AUDIT — a ergonomia táctil do back office

Auditoria dos alvos de toque do back office num **iPhone SE (375 px, toque
ligado)**, medida antes de tocar em código e outra vez depois de corrigir. Os
números aqui foram medidos; o que não pôde ser medido está dito como tal, e não
preenchido com estimativas.

Reproduzir:

```bash
npm run dev -- --port 3210
node scripts/auditar-toque-admin.mjs http://localhost:3210 --json toque.json
```

---

## O resultado, em duas linhas

**95 alvos distintos abaixo do mínimo de 44×44 px → 0**, nas onze vistas.
Nenhum campo provocava zoom no iOS e nenhuma vista tinha conteúdo a passar da
margem — esses dois já estavam bem, e a razão está mais abaixo.

| | Antes | Depois |
| --- | --- | --- |
| Alvos < 44×44 px (distintos) | **95** | **0** |
| Vistas com algum alvo pequeno | 11 de 11 | 0 de 11 |
| Campos com letra < 16 px | 0 | 0 |
| Conteúdo para lá da margem direita | 0 | 0 |
| Focáveis fora do ecrã (gaveta fechada) | **20** | **0** |

---

## O que foi medido, e porquê estes limiares

**44×44 px** é o mínimo das *Human Interface Guidelines* da Apple (o Material
Design pede 48 dp). Não é gosto: a polpa do dedo cobre ~10 mm de ecrã e o
telemóvel não sabe onde está o centro dela. Abaixo disto acerta-se ao lado — e
no back office o que está ao lado é muitas vezes outra acção.

**16 px de letra nos campos** porque abaixo disso o Safari do iOS **amplia** a
página ao focar o campo, e não volta a desamplíar. É comportamento do sistema.

**8 px entre alvos** porque dois alvos grandes mas colados dão toques no
vizinho.

**375 px** e não 390: é o iPhone SE, o telemóvel mais estreito que ainda se usa
a sério, e a largura em que tudo o que é apertado se parte primeiro.

### Onze vistas, com a gaveta aberta à parte

Visão Geral · Pedidos · Propostas · Calendário · Tarefas · Faturas · Propostas
Aceites · Temas · Organização de propostas · Estatísticas · gaveta de navegação
aberta.

---

## Dois enganos do próprio medidor, corrigidos antes de acreditar nos números

Ficam escritos porque quem repetir isto vai tropeçar nos mesmos.

**A gaveta fechada entrava em todas as vistas.** A navegação lateral fechada não
sai do DOM: fica em `x = -244`, com tamanho e estilos. A primeira passagem
contava os seus 24 botões como conteúdo visível de *cada* vista — 23 dos 35
"achados" da Visão Geral eram isso. A regra passou a ser exacta em vez de um
limiar à sorte: só conta o que intersecta mesmo a largura do ecrã
(`r.right > 0 && r.left < innerWidth`).

**Um checkbox de 16 px pode ter um alvo de 44.** A caixa de seleccionar um
pedido é um `<input>` de 16×16 dentro de um `<label>`. O HTML manda o toque no
rótulo activar o controlo, portanto o alvo é o **rótulo**. Medir o input dava um
achado falso — e, pior, um que continuaria a aparecer depois de corrigido,
porque a correcção é no rótulo. O medidor passou a usar a caixa do rótulo
quando ela é maior.

---

## Os achados, por origem

Quase tudo vinha de **cinco sítios**. A tabela é por origem e não por ecrã,
porque é assim que se corrige.

| Origem | Alvos | O que era | Medido |
| --- | --- | --- | --- |
| `ui/Button.tsx:89` | ~40 | `sm` = 32 px, `md` = 40 px de altura | 175 usos de `<Button>` |
| `ui/Segmented.tsx:63` | ~12 | 32–36 px de altura | 16 usos |
| `AdminClient.tsx` (barra de topo) | 3 | 37×29, 44×28, 40×40 | em **todas** as 11 vistas |
| `AdminClient.tsx` (rodapé da gaveta) | 5 | 56×30 e 235×30 | Atalhos, Backup, Repor, Sair |
| `Calendario.tsx:519` | 31 | dias de 41 px de largura | grelha do mês |

### Os piores, um a um

| Alvo | Antes | `ficheiro:linha` |
| --- | --- | --- |
| Seleccionar um pedido (checkbox) | **16×16** | `AdminClient.tsx:296` |
| "Abrir →" | 36×**16** | `Overview.tsx:1269` |
| "Ver tudo →" | 51×**16** | `Overview.tsx:1321` |
| "Definir meta" | 61×**16** | `Overview.tsx:505` |
| "Adicionar nota" | 71×**16** | `Overview.tsx:691` |
| Mês anterior / seguinte | 32×32 | `Calendario.tsx:452` e `:483` |
| "Atualizar pedidos" | 37×29 | `AdminClient.tsx:1757` |
| "Novo pedido" (barra de topo) | 44×**28** | `AdminClient.tsx:1785` |
| "Ajuda e glossário" | 40×40 | `AdminClient.tsx:1712` |
| Atalhos / Backup / Repor / Sair | 56×30 | `AdminClient.tsx:1505`–`1571` |
| Itens de navegação da gaveta | 231×41 | `AdminClient.tsx:1272` |
| Filtros de estado ("Todos · 1", …) | 70–130×**28** | `AdminClient.tsx:2029` |
| Dias do calendário | **41**×52 | `Calendario.tsx:579` |

Os quatro botões de 16 px de altura da Visão Geral eram o pior caso do back
office inteiro: um alvo com **um terço** da altura mínima, no primeiro ecrã que
aparece depois de entrar.

---

## A correcção

Cresce os alvos **só com `(pointer: coarse)`** — verdade num telemóvel ou
tablet, falso com rato. O portátil fica exactamente como estava; muda o
telemóvel.

1. **`ui/Button.tsx` e `ui/Segmented.tsx`** ganham `pointer-coarse:h-11`. Trata
   de 191 botões de uma vez — era daqui que vinha a maioria.
2. **`globals.css` ganha `.alvo-toque`** (44 px mínimos, `inline-flex`
   centrado, dentro de `@media (pointer: coarse)`), para os botões escritos à
   mão que não passam pelas primitivas.
3. **O calendário** tinha dias de 41 px porque os 24 px de margem do cartão
   deixavam 295 px para sete colunas com seis filetes. A conta: 375 − 32 (margem
   da vista) = 343; com 12 px de cada lado sobram 319, e (319 − 6) / 7 = **44,7**.
4. **Espaçamento** da barra de topo e do rodapé da gaveta: de 4–6 px para
   8–10 px no dedo.

---

## O que já estava bem, e porquê

Vale dizê-lo, porque são duas categorias inteiras que não deram trabalho.

**Nenhum campo provoca zoom no iOS.** `globals.css:377` já tem uma regra que põe
`font-size: 16px` em `input`, `textarea` e `select` até 640 px de largura. Os 3
a 8 campos de cada vista passam todos.

> **Mas há um buraco por confirmar:** a regra é `@media (max-width: 640px)`. Um
> iPad em retrato (768 px) fica **de fora** e volta às medidas desenhadas, que
> em alguns campos são menores que 16 px. Não foi medido a essa largura, e está
> na lista do que falta.

**Nenhuma vista tem conteúdo para lá da margem direita** — verificado com o
teste que enxerga, não com o que estava cego (ver abaixo).

---

## O teste de overflow estava a mentir, e agora não está

O teste clássico de "não tem scroll lateral" é
`document.scrollWidth > document.clientWidth`. **Neste site ele nunca pode ser
verdade:** `globals.css:422` tem `body { overflow-x: clip }`.

O clip tira a **barra** de scroll, não o conteúdo que sai fora. Se alguma coisa
passar da margem, fica **cortada e inalcançável** — que é pior do que poder
arrastar até lá, porque não há sequer como ver que falta ali qualquer coisa.

O passeio `e2e/admin-mobile.spec.ts` fazia exactamente essa asserção cega desde
que existe. Estava verde por construção, não por mérito. Passou a medir a
margem direita de cada elemento, ignorando os que têm um antepassado com scroll
próprio (uma tabela em `overflow-x-auto` é desenho, não defeito).

Com o teste que enxerga: **zero culpados** nas onze vistas. A conclusão não
mudou — mudou o facto de agora haver prova dela.

---

## O que fica por corrigir, e porquê

### 1. Pares a menos de 8 px — aceites, com a razão

Sobram pares colados, e nenhum é para corrigir:

- **Grupos de filtros mutuamente exclusivos** (`Todos · 1` / `Novo · 0` / …,
  `Últimos 3 meses` / `Último ano` / …) a 4–6 px. Tocar no vizinho troca o
  filtro e custa um toque a mais. Nada mais.
- **Células do calendário** a 1 px. Uma grelha de dias é feita de células
  adjacentes; separá-las tirava-lhes a largura que se acabou de ganhar.
- **Itens de navegação** a 4 px. Todos navegam; nenhum destrói nada.

**Nenhum par que reste tem consequência irreversível.** O caso que preocupava —
"Repor" (repor uma cópia de segurança) a 4 px de "Backup" e de "Sair" — foi
verificado: `RestoreDialog.tsx` exige escrever a frase **"REPOR TUDO"** antes de
tocar em dados. Um toque ao lado abre um diálogo; não destrói. Severidade
**média**, não crítica, e o espaçamento subiu para 8 px na mesma.

### 2. O que o medidor não vê

- **As vistas aparecem quase vazias.** Sem Supabase ligado nesta máquina, não
  há linhas de tabela, nem grelhas de fotos cheias, nem propostas a sério. O que
  se mede são 8 a 44 elementos por vista — os controlos, não o conteúdo. **Os
  alvos que vivem dentro de uma linha de dados não foram medidos.**
- **Modais e gavetas de detalhe.** O estúdio de propostas, o diálogo de nova
  fatura, o *lightbox* das fotos — nenhum foi aberto neste varrimento.
- **iPad (768–1024 px).** Não medido. É onde a regra dos 16 px nos campos deixa
  de se aplicar.
- **Pares entre camadas.** Com a gaveta aberta, o medidor compara os seus botões
  com os da vista por baixo (`Calendário ↔ Todo o período`). O véu impede o
  toque, portanto esses pares são artefacto da medição e estão ignorados na
  contagem acima.

---

## Vinte focáveis fora do ecrã — corrigido

Com a gaveta **fechada**, os seus 20 botões continuavam alcançáveis pelo TAB de
um teclado externo e pelo varrimento do VoiceOver: o `-translate-x-full`
empurra-os para `x = -244` mas não os tira do DOM. O foco desaparecia do ecrã e
ficava-se a carregar em Tab às cegas.

A barra passa a levar `inert` quando é gaveta **e** está fechada. As duas
condições são precisas: a partir de `lg` (1024 px) a mesma barra é uma coluna
sempre visível, e marcá-la inerte ali desligava a navegação no portátil. O
estado vem de um `matchMedia("(max-width: 1023px)")`, no mesmo padrão que o
ficheiro já usa para o painel de detalhe — e sem `matchMedia` (SSR, jsdom) fica
em `false`, que é o estado seguro.

### O skip link não é um defeito, e o teste passou a saber a diferença

O "Saltar para o conteúdo" também vive fora do ecrã (`x = -1`), e está certo:
é a técnica normal de um skip link, que só aparece ao receber o foco. A
diferença entre o defeito e a técnica não é o elemento — é **o que acontece ao
focá-lo**.

É isso que o medidor testa, em vez de tratar por nome os casos conhecidos:
foca, volta a medir, e só fica como achado o que continua fora do ecrã **depois
de ter o foco**. Com a mesma regra, os 20 botões da gaveta contam e o skip link
não, sem uma única excepção escrita à mão.

(Custou um segundo engano: focar o skip link deixava-o desenhado no canto e a
interceptar o toque seguinte, o que partia a navegação do próprio passeio.
Medir não pode deixar a página noutro estado do que a encontrou — o foco é
largado logo a seguir a medir.)

---

## A rede que impede a regressão

Isto volta sozinho: basta alguém escrever `py-1.5` num botão novo.

`e2e/ergonomia-tactil.mjs` guarda as quatro regras e os limiares num sítio só,
partilhado entre o passeio do CI e o varrimento que produziu este relatório —
para nunca discordarem. O CI corre-as em **passo bloqueante**
(`Ergonomia táctil no telemóvel`), ao lado das passkeys e pela mesma razão: um
passo que avisa e deixa passar é um passo que se ignora.

Verificado nos dois sentidos: com `pointer-coarse:h-11` fora do `ui/Button.tsx`,
o passeio falha e **nomeia** os botões de 40 px em Tarefas, Faturas e Temas; com
ele, passa.
