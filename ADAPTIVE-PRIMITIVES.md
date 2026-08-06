# ADAPTIVE-PRIMITIVES — as peças que mudam de forma

As fundações da Fase 1. Vivem em
`src/app/[lang]/(site)/orcamento/admin/ui/` e exportam-se do mesmo sítio que os
outros primitivos:

```ts
import { useAdaptativo, FolhaOuDialogo, TabelaOuCartoes, MenuDeAccoes, CampoData }
  from "@/app/[lang]/(site)/orcamento/admin/ui";
```

---

## A regra que decide se se usa alguma coisa disto

> **Diferença só de ESTILO? CSS.** Colunas, espaçamento, tamanhos de letra —
> variantes do Tailwind. Não custa JavaScript, não pisca e não pode
> dessincronizar.
>
> **Diferença ESTRUTURAL? Aí sim.** Uma tabela que vira cartões, um diálogo que
> vira folha, um arrasto que vira menu.

Usar um hook para mudar `gap-3` para `gap-4` é pagar JavaScript e um risco de
piscar por algo que o CSS faz de graça.

---

## Os dois eixos, que não são o mesmo

Esta é a distinção que mais engano evita, e por isso são duas funções e não uma:

| Eixo | Decide | Media query |
| --- | --- | --- |
| **Largura** | o LAYOUT — cabem duas colunas? uma tabela? uma barra ao lado? | `min-width` |
| **Ponteiro** | os ALVOS — há hover? é dedo ou rato? | `hover` / `pointer` |

Um **iPad com teclado** é largo **e** de toque. Um **portátil com ecrã táctil** é
largo **e** de toque. Tratar "estreito" e "dedo" como sinónimos é o que faz um
tablet receber a interface de um telemóvel — e foi um dos quatro achados
**Críticos** do `MOBILE-AUDIT.md`.

### Os pontos de corte

| Nome | Largura | Notas |
| --- | ---: | --- |
| `telemovel` | < 640 | |
| `tablet` | 640 – 1023 | |
| `desktop` | ≥ 1024 | é aqui que a barra lateral deixa de ser gaveta |
| `largo` | ≥ 1440 | há espaço para um painel lateral **sem** tirar ao conteúdo |

Coincidem de propósito com apenas **três** dos do Tailwind: `sm` (640) e `lg`
(1024), mais um `wide` (1440) que o Tailwind não tem. **`md` (768) e `xl` (1280)
não se usam no back office** — dois sistemas de cortes a competir é como um ecrã
acaba com três colunas a 800 px e duas a 900 px sem ninguém perceber porquê.

---

## `useAdaptativo()`

```ts
const { telemovel, tablet, desktop, largo, toque, hover, largura, montado } = useAdaptativo();
```

Contém **apenas** informação sobre o aparelho — nenhuma regra de negócio, nenhum
estado de dados. É essa separação que permite ter dois layouts sem ter duas
versões da lógica: o hook de dados é o mesmo, só a apresentação diverge.

### `montado` — a parte que se esquece e estraga tudo

O servidor não tem `window`. Se o primeiro desenho do browser já usasse a
largura real, o HTML dos dois lados seria diferente e o React queixava-se — ou,
pior, calava-se e deixava o ecrã a meio.

Por isso a primeira leitura é igual dos dois lados (**tudo `false`, ou seja
`"telemovel"`**) e `montado` diz se o que se está a ler já é a verdade.

**A escolha de cair para telemóvel é deliberada:** o layout de telemóvel é o mais
simples e o que menos estranha se aparecer por um instante num ecrã grande. O
contrário — desenhar uma tabela densa e trocá-la por cartões — vê-se.

---

## `FolhaOuDialogo`

**Diálogo centrado no computador · folha inferior arrastável no telemóvel.**

Um diálogo centrado a 375 px é uma caixa a flutuar com margens inúteis e o botão
de fechar no canto superior direito — o ponto mais longe do polegar de quem
segura o telemóvel com uma mão. A folha usa a largura toda, põe as acções em
baixo (onde o polegar está) e fecha-se com o gesto que o sistema já ensinou.

**O que é igual nos dois, e não por acaso:** armadilha de foco, Escape, bloqueio
do scroll de fundo, `role="dialog"` e `aria-modal`. A forma muda; o contrato de
acessibilidade não.

Pormenores que decidem se funciona:

- **`dvh`, não `vh`.** Com a barra do browser à vista, `100vh` é maior do que o
  que se vê — e o rodapé com as acções ficava por baixo dela.
- **A pega é o único sítio por onde se arrasta.** Se o gesto começasse no
  conteúdo, competia com o scroll da lista lá dentro.
- **Só para baixo.** Puxar para cima não faz nada, em vez de descolar a folha.
- **O botão de fechar existe sempre.** O gesto é um atalho; quem usa teclado ou
  leitor de ecrã não arrasta nada.
- **O fundo fecha, mas só se o toque começou nele.** Sem isso, arrastar de
  dentro para fora a seleccionar texto fechava a caixa e perdia o que lá estava.
- **`env(safe-area-inset-bottom)`** nas acções, para o iPhone.

---

## `TabelaOuCartoes`

**Tabela densa no computador · lista de cartões no telemóvel.**

Uma tabela de seis colunas a 375 px ou ganha scroll horizontal (e metade da
informação fica atrás de um gesto que ninguém descobre) ou aperta as colunas até
o texto partir em três linhas. Nos dois casos deixa de se poder **varrer a lista
com os olhos**, que é a única coisa que uma tabela faz bem.

**O cartão NÃO é gerado a partir das colunas.** É escrito à mão por quem conhece
o ecrã, e mostra as quatro coisas que interessam em vez das dez que a tabela
mostra. É a diferença entre *adaptar* e *converter*.

O que é partilhado são os **dados** e a **ordem** — a ordenação vive aqui, uma
vez, e as duas formas leem o mesmo.

- `soLargo: true` numa coluna: só aparece a partir de 1440. É assim que se ganha
  densidade no ecrã grande sem apertar o médio.
- **A primeira célula é um botão a sério** quando a linha abre alguma coisa.
  Clicar na linha é comodidade do rato; sem isso a tabela era inutilizável por
  teclado — o defeito mais fácil de introduzir aqui e o mais difícil de notar.
- `aria-sort` no cabeçalho, senão a setinha é decoração.

---

## `MenuDeAccoes`

**Reveladas no hover onde há rato · sempre visíveis onde não há.**

> **Num ecrã táctil, "aparece no hover" quer dizer "não existe".**

Não é um inconveniente: a função fica invisível e ninguém a descobre. Este
componente é onde essa regra passa a ser aplicada **uma vez**, em vez de ser
relembrada em cada ecrã — e esquecida num.

Decide pelo **ponteiro**, não pela largura. Esconder por largura acerta nos dois
casos comuns e falha exactamente nos interessantes (iPad, portátil táctil).

- `soltasNoEcraGrande`: quantas acções ficam à vista antes do `…`.
- As **destrutivas** vão a vermelho e com uma linha a separá-las. No telemóvel,
  "Eliminar" colado a "Duplicar" é um engano à espera de acontecer.
- O menu chama-se *"Acções de Terracotta"*, não *"Acções"* — dez menus na mesma
  página não podem ter todos o mesmo nome.

---

## `CampoData`

**`<input type="date">` nativo nos dois — e é essa a decisão.**

No telemóvel abre o selector do sistema, o mesmo em que se marcam consultas, com
o polegar e sem aprender nada. No computador abre o calendário do browser, com
teclado. Um calendário escrito à mão seria pior nos dois: nunca fica tão bom como
o do sistema, e perde a escrita directa.

O que se acrescenta é o que o nativo não dá:

1. **A data por extenso**, por baixo. `2027-09-18` não se lê; *"sábado, 18 de
   setembro de 2027"* lê-se — e é assim que se apanha o ano errado.
2. **O aviso de dia da semana** quando um casamento cai fora de sábado. Assinala,
   não impede. É exactamente o engano que quase passou na importação dos
   casamentos de 2027: uma quinta-feira no meio de sábados.
3. **Letra de 16 px**, que é o que impede o Safari do iOS de ampliar ao focar — e
   de não voltar a desampliar.

**Uma armadilha resolvida:** `new Date("2027-09-18")` é lida como **UTC**, e em
Portugal no Verão isso dá o dia anterior às 23h. A data é construída com os três
números soltos, em hora local.

---

## Tooltips

**Não há primitivo, e é de propósito.** Um tooltip depende de hover; num ecrã
táctil não existe. A regra é: se a informação é necessária, é **texto visível**;
se não é necessária, não é um tooltip — é ruído. O `title` do HTML pode ficar
como reforço para quem usa rato, nunca como o único sítio onde a informação
está.

---

## O que ainda não é primitivo, e devia

Fica anotado para não se perder:

- **Navegação** — já adapta (barra lateral ≥1024, gaveta e barra inferior
  abaixo), mas vive dentro do `AdminClient` em vez de ser uma peça.
- **Selector de fotos** — o `ThemePicker` tem o seu próprio diálogo; passa a
  `FolhaOuDialogo` na Parte da biblioteca.
- **Barra de acções de selecção** — a de `BibliotecaRevisao` está boa e devia
  servir os outros ecrãs com selecção múltipla.

---

## Testes

`ui/adaptativo.test.tsx` — 17 testes, com um `matchMedia` falso que simula
largura **e** ponteiro em separado (o jsdom não tem nenhum; sem ele tudo dá
`false` e os testes só afirmam o comportamento por omissão).

**Um aviso que vale a pena guardar.** A primeira versão do teste do iPad
afirmava que a classe continha `"opacity-100"` — e a variante *escondida* é
`opacity-0 group-hover:opacity-100`, que contém essa cadeia na mesma. O teste
passava dos dois lados. Só se viu ao partir o código de propósito para o ver
falhar; passou a afirmar sobre `opacity-0`, que discrimina.
