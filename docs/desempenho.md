# Desempenho — o que medimos, e o que está mesmo a atrasar

Este documento não propõe nada de cabeça. São **números**, tirados de uma
compilação de produção (`npm run build` + `npm run start`) com o script
`scripts/bench-back-office.mjs`. No fim está como voltar a correr tudo e como
comparar antes/depois de uma alteração.

Medir primeiro já poupou este projeto duas vezes: o PDF era lento por causa do
**formato** dos JPEG e de a mesma foto ser embutida quatro vezes — não por as
fotos serem grandes. Voltou a acontecer agora. A coisa mais lenta do back office
**não é o peso do código: é uma espera de 0,3 segundos que ninguém pediu**, e
sem medir nunca lá chegávamos.

---

## Antes de mais: duas coisas que os números dizem e ninguém esperava

**1. Mudar de vista demora ~350 ms, e 290 desses são a NÃO fazer nada.**
Clicar em "Faturas" pede um ficheiro de 13 KB que chega em 20 ms. Depois a
página fica 280 ms parada — sem descarregar, sem calcular, com o processador
livre — e só então a vista aparece. Não é o tamanho do código. É a animação de
transição de página (280 ms, em `globals.css`) a segurar a atualização seguinte.
Prova: à **segunda** vez que se entra na mesma vista, quando já não há
esqueleto a substituir, a mesma mudança demora **26 ms**.

**2. Com 300 pedidos, o back office deixa de funcionar.**
Não fica lento — **rebenta**. Ao mudar de vista aparece o ecrã "Ocorreu um erro
inesperado". Isto não é um detalhe de desempenho, é a funcionalidade a partir-se
a um volume que a Catarina vai ter. Detalhes em §4.

---

## Como isto foi medido (e o que confiar)

- Compilação de **produção**, servida com `npm run start`. Números de `npm run dev`
  são ruído de compilação, não o produto.
- Cada valor é a **mediana de 3 repetições**; onde interessa está também o p95.
- Sem cache do browser, para medir o primeiro carregamento a sério.
- A máquina onde isto correu estava a ser partilhada por outras compilações.
  Portanto: **os bytes são exatos e repetíveis; os tempos absolutos têm ruído**
  (±2× nos piores casos). As **proporções** — o que domina o quê — são estáveis
  e foram confirmadas em várias execuções.
- A medição corre numa **cópia** do projeto, com a sua própria pasta `data/`.
  Os seus dados nunca são tocados, nem sequer durante o teste de volume.

---

## 1. Primeiro carregamento de `/orcamento/admin`

Com os dados de origem (1 pedido):

| | valor |
| --- | --- |
| HTML vindo do servidor | **112,6 KB** |
| JavaScript enviado | **229,2 KB** em 17 ficheiros |
| CSS | 26,1 KB |
| Servidor a responder (TTFB) | 45 ms |
| Primeira coisa desenhada (FCP) | 244 ms |
| Elemento principal (LCP) | 272 ms |
| **Responde ao primeiro clique** | **456 ms** (p95 870 ms) |
| Thread principal bloqueada (TBT) | 4 ms |
| Saltos de layout (CLS) | 0,067 |

### Quem são os 229 KB

| Bytes (comprimidos) | O que é |
| --- | --- |
| 71,0 KB | react-dom + scheduler (o motor do React) |
| 38,6 KB | runtime de navegação do Next |
| 26,8 KB | **AdminClient** (o esqueleto do back office) + paleta de comandos |
| 18,8 KB | **catálogo `orcamento/data` + exportação CSV/ICS** |
| 12,9 KB | runtime de server actions do Next |
| 9,3 KB | web-vitals |
| 9,2 KB | runtime de navegação (2.ª parte) |
| 8,8 KB | next/image |
| 8,6 KB | Overview + Lembretes |
| 8,0 KB | **dados do site público** (lista de clientes, slogan) |

Duas observações que interessam:

- **~150 KB dos 229 KB são infraestrutura** (React + Next). Não há aqui nada a
  cortar sem mudar de arquitetura; é o preço de entrada.
- **O código nosso são ~55 KB.** Mas dentro deles há desperdício claro: o
  catálogo de tipos de evento e pacotes (`src/lib/orcamento/data.ts`) aparece
  **em quatro ficheiros diferentes** da compilação, e no back office com volume
  chega a ser descarregado **duas vezes** (18,8 KB + 19,7 KB). E os 8 KB de
  dados do site público (nomes de clientes, slogan do rodapé) não têm nada que
  fazer numa ferramenta de trabalho interna — vêm de o back office estar
  montado dentro do layout do site de marketing (`src/app/[lang]/layout.tsx`,
  com Navbar, Footer, StickyCTA, ConsentBanner, ScrollProgress…).

### A cascata

Todos os ficheiros arrancam ao mesmo tempo (~190 ms) e terminam entre 340 e
580 ms — não há cascatas encadeadas, o que é bom. O tempo até responder ao
clique é dominado por **hidratar o AdminClient**, não por esperar rede.

### Pedidos repetidos no arranque

```
3× /api/tarefas
2× /api/calendario
3× /api/vitals
```

Com os dados de origem isto é invisível (respostas de 0,5 KB). **Com 300
pedidos, são 65 KB de tarefas e 88 KB de calendário pedidos e deitados fora.**

A causa está identificada e é simples: `Overview` desenha `Reminders` **e**
`Agenda`, e cada um faz o seu próprio `fetch("/api/tarefas")` cru, sem passar
pelo `useCachedList` que existe precisamente para isso — e o `prefetchList` em
`AdminClient` já tinha pedido o mesmo em modo ocioso. Três pedidos, três
leituras do ficheiro no servidor, três renders.

Ficheiros: `Reminders.tsx:27`, `Agenda.tsx:57`, `AdminClient.tsx:527`.

---

## 2. Mudar de vista

Mediana de 3 repetições, dados de origem. As fases são **em série**: clique →
pedir o ficheiro → recebê-lo → avaliar e montar → o efeito dispara o pedido de
dados → dados → desenhar.

| Vista | Total | Reagir | Ficheiro | **Montar** | Dados | Desenhar |
| --- | --- | --- | --- | --- | --- | --- |
| Pedidos (já no esqueleto) | **52 ms** | 49 | 0 | 0 | 9 | ~0 |
| Propostas | 355 ms | 50 | 8 | **300** | 8 | ~0 |
| Faturas | 350 ms | 43 | 10 | **298** | 9 | ~0 |
| Calendário | 350 ms | 45 | 8 | **296** | 9 | ~0 |
| Temas | 407 ms | 91 | 21 | **282** | 11 | 2 |
| Estatísticas | 329 ms | 27 | 8 | 0 | 0 | **294** |
| Abrir um pedido | 615 ms | — | — | — | — | — |
| Mensagens (separador dentro do pedido) | 25 ms | — | — | — | — | — |

Quanto pesa cada vista à primeira visita: Propostas 10,3 KB · Faturas 13,5 KB ·
Calendário 17,3 KB · Estatísticas 17,8 KB · Temas 27,9 KB. **Todas juntas pesam
menos de metade do react-dom.**

### Onde estão os 290 ms

Não é o download (8–21 ms) nem os dados (8–11 ms) nem o desenho. É uma espera
com o processador livre. A experiência decisiva:

```
Faturas, 1.ª vez     → esqueleto aos 77 ms · ficheiro chega aos 102 ms
                       · conteúdo só aos 378 ms   (276 ms parados)
Faturas, 2.ª vez     → conteúdo aos 26 ms, pedido de dados aos 42 ms
Propostas, 2.ª vez   → conteúdo aos 30 ms, pedido de dados aos 45 ms
```

Assim que o módulo já está em memória — e portanto **não há esqueleto a
substituir** — os 290 ms desaparecem por completo. O que os provoca é a segunda
atualização (esqueleto → conteúdo) ter de esperar pela animação de transição de
vista, que `src/app/globals.css` define em **280 ms** (`vt-arrive`), com o
`<PageTransition>` do layout ativo por cima de todo o back office
(`src/app/[lang]/layout.tsx:236`, `next.config.ts` → `experimental.viewTransition`).

Duas saídas, ambas medidas como eficazes:

1. **Não deixar aparecer o esqueleto**: pré-carregar os ficheiros das vistas em
   janelas ociosas. Uma vista pré-aquecida monta na primeira atualização, sem
   fallback e sem espera. (Já está a ser feito em `admin/lazy.tsx`.)
2. **Não deixar o back office dentro do `<PageTransition>`**, ou pôr a animação
   a 0 dentro de `.admin-mode`. Uma ferramenta de trabalho não precisa de
   transições de página entre separadores internos.

As duas resolvem o mesmo problema por caminhos diferentes; a primeira é a de
menor risco e já está em curso.

---

## 3. Onde a thread principal bloqueia mais de 50 ms

Com os dados de origem quase não bloqueia: **uma** tarefa de 54 ms durante a
hidratação, TBT total de 4 ms. Confortável.

Com **300 pedidos** passa a **185 ms de TBT** e a resposta ao primeiro clique
sobe para 738 ms (p95 1370 ms). O trabalho está todo na hidratação do
`AdminClient` — desserializar os 805 KB de dados que vêm no HTML e reconstruir a
lista.

---

## 4. Com volume a sério — 300 pedidos, 193 propostas, 157 faturas

Esta é a secção que interessa: um back office rápido com 3 linhas e lento com
300 é exatamente a queixa.

### 4.1 O que quebra

**O back office atira um erro e mostra "Ocorreu um erro inesperado" ao mudar de
vista.** Reproduz-se sempre, em qualquer das vistas testadas depois da primeira.
Não é lentidão — é o ecrã de erro global a substituir a aplicação.

Isto tem de ser corrigido **antes** de qualquer optimização: não vale a pena
afinar milissegundos num ecrã que rebenta.

### 4.2 O que cresce

| | 1 pedido | 300 pedidos | Fator |
| --- | --- | --- | --- |
| HTML do servidor | 112,6 KB | **805,3 KB** | **7,2×** |
| JavaScript | 229,2 KB | 229,2 KB | 1,0× |
| Responde ao 1.º clique | 456 ms | **738 ms** (p95 1370) | 1,6× |
| Bloqueio da thread (TBT) | 4 ms | **185 ms** | 46× |
| `/api/tarefas` repetido | 3 × 0,5 KB | **3 × 21,8 KB** | — |
| `/api/calendario` repetido | 2 × 0,3 KB | **2 × 43,8 KB** | — |

O JavaScript não cresce — o problema é **os dados**. Os 300 pedidos completos
(com notas, histórico de atividade e listas de convidados) são serializados para
dentro do HTML porque `admin/page.tsx` lê `listQuotes()` inteiro e passa-o como
`initialQuotes` ao componente de cliente. A lista só mostra 50 de cada vez
(`LIST_PAGE_SIZE`), mas os 300 vão na mesma pelo cabo, e o browser tem de os
desserializar antes de responder ao primeiro clique.

### 4.3 O servidor não é o problema

As APIs de lista, medidas sem browser, com 300 pedidos:

| Endpoint | Mediana | p95 | Resposta |
| --- | --- | --- | --- |
| `/api/propostas` | 35 ms | 36 ms | 156,1 KB |
| `/api/faturas` | 24 ms | 31 ms | 43,4 KB |
| `/api/calendario` | 14 ms | 25 ms | 43,5 KB |
| `/api/tarefas` | 13 ms | 28 ms | 21,5 KB |
| `/api/contratos` | 10 ms | 16 ms | 15,6 KB |

Todas respondem em dezenas de milissegundos, mesmo lendo e voltando a analisar o
ficheiro JSON inteiro a cada pedido (`src/lib/repository.ts`, `FileBackend.read`).
Em produção real isto é Supabase, ainda mais rápido. **Não há aqui nada urgente
a corrigir** — o que custa é o tamanho das respostas (156 KB de propostas para
desenhar uma lista) e o facto de algumas serem pedidas mais do que uma vez.

---
