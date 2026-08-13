# Desempenho — o que medimos, e o que está mesmo a atrasar

Este documento não propõe nada de cabeça. São **números**, tirados de uma
compilação de produção (`npm run build` + `npm run start`) com o script
`scripts/bench-back-office.mjs`. No fim está como voltar a correr tudo e como
comparar antes/depois de uma alteração.

Medir primeiro já poupou este projeto duas vezes: o PDF era lento por causa do
**formato** dos JPEG e de a mesma foto ser embutida quatro vezes — não por as
fotos serem grandes. Voltou a acontecer agora, e duas vezes: a explicação óbvia
para a lentidão do back office estava errada, e a correcção que parecia óbvia
**não melhora nada**. Só as medições mostraram isso.

---

## Em duas linhas

- **Mudar de vista demora ~350 ms, e 300 desses são a NÃO fazer nada.** Não é o
  código a chegar (8–21 ms), nem os dados (9–31 ms), nem o computador a
  trabalhar (fica parado). É o custo fixo de cada vista ser carregada à parte.
- **Com 300 pedidos, o back office deixa de responder ao primeiro clique
  durante 1,2 segundos** (contra 0,45 s com um pedido). O código não cresce; o
  que cresce é a quantidade de dados enviada de uma vez para o ecrã.

---

## Como isto foi medido (e em que confiar)

- Compilação de **produção**. Números de `npm run dev` são ruído de compilação,
  não são o produto.
- Cada valor é a **mediana de 3 repetições**; onde interessa está também o p95.
- Sem cache do browser, para medir a primeira visita a sério.
- A medição correu numa **cópia** do projeto, com a sua própria pasta `data/`.
- A máquina estava a ser partilhada por outras compilações ao mesmo tempo.
  Portanto: **os bytes são exactos e repetíveis; os tempos absolutos têm ruído**
  (até ±2× nos piores casos). As **proporções** — o que domina o quê — repetiram-se
  em todas as execuções e são o que interessa para decidir.

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

| Comprimido | O que transporta |
| --- | --- |
| 71,0 KB | react-dom + scheduler (o motor do React) |
| 38,6 KB | runtime do Next (navegação) |
| 26,8 KB | **AdminClient** — o esqueleto do back office + paleta de comandos |
| 18,8 KB | **catálogo `orcamento/data` + exportação CSV/ICS** |
| 12,9 KB | runtime do Next (server actions) |
| 9,3 KB | web-vitals |
| 9,2 KB | runtime do Next (navegação, 2.ª parte) |
| 8,8 KB | next/image |
| 8,6 KB | Overview + Lembretes |
| 8,0 KB | **dados do site público** (lista de clientes, slogan do rodapé) |

Duas leituras:

- **~150 dos 229 KB são infraestrutura** (React + Next). Não há aqui nada a
  cortar sem mudar de arquitectura. É o preço de entrada.
- **O código nosso são ~55 KB** — e dentro deles há desperdício claro:
  - o catálogo de tipos de evento e pacotes (`src/lib/orcamento/data.ts`) ficou
    duplicado em **quatro** ficheiros da compilação, e com volume chega a ser
    descarregado **duas vezes** no mesmo carregamento (18,8 KB + 19,7 KB);
  - os 8 KB de dados do site de marketing (nomes de clientes, slogan) não têm
    nada que fazer numa ferramenta interna. Vêm de o back office estar montado
    **dentro do layout do site público** (`src/app/[lang]/layout.tsx`), que
    também arrasta Navbar, Footer, StickyCTA, ConsentBanner, ScrollProgress e o
    `PageTransition`. A Navbar é escondida por CSS (`body.admin-mode`), mas o
    código é enviado e executado na mesma.

### A cascata

Todos os ficheiros arrancam ao mesmo tempo (~190 ms) e acabam entre 340 e
580 ms. **Não há cascatas encadeadas** — nada espera por nada. O tempo até
responder ao clique é dominado por hidratar o AdminClient, não por rede.

### Pedidos repetidos no arranque

```
3× /api/tarefas      2× /api/calendario      3× /api/vitals
```

Com um pedido isto é invisível (respostas de 0,5 KB). **Com 300 pedidos são
30 KB de tarefas e 33 KB de calendário pedidos e deitados fora**, e — pior — no
intervalo exacto (1024–1359 ms) em que o ecrã ainda não responde ao clique.

Causa, identificada: `Overview` desenha `Reminders` **e** `Agenda`, e cada um
faz o seu próprio `fetch("/api/tarefas")` cru, sem passar pelo `useCachedList`
que existe precisamente para isto — e o `prefetchList` do `AdminClient` já
tinha pedido o mesmo em modo ocioso. Três pedidos, três leituras no servidor,
três renders.

`Reminders.tsx:27` · `Agenda.tsx:57` · `AdminClient.tsx:527`

---

## 2. Mudar de vista

Mediana de 3 repetições. As fases são **em série**: clique → pedir o ficheiro →
recebê-lo → avaliar e montar → o efeito dispara o pedido de dados → dados →
desenhar.

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

Peso de cada vista à primeira visita: Propostas 10,3 KB · Faturas 13,5 KB ·
Calendário 17,3 KB · Estatísticas 17,8 KB · Temas 27,9 KB. **Todas juntas pesam
pouco mais do que o react-dom sozinho.**

### Os 300 ms: o que NÃO são

A parte "montar" é sempre ~300 ms, seja a vista de 10 KB ou de 28 KB. Um número
constante assim não é trabalho — é uma espera. Testámos as cinco explicações
plausíveis, uma a uma, cada uma com a sua compilação:

| Hipótese | Experiência | Resultado |
| --- | --- | --- |
| É o ficheiro a ser descarregado | Segunda visita à mesma vista | **355 ms → 26 ms.** Não é o download: à 2.ª vez é instantâneo |
| É a animação de transição de página (280 ms em `globals.css`) | Correr com "reduzir movimento" (animações a 0 s) | **Sem diferença** (378 vs 395 ms) |
| É o ficheiro chegar tarde → pré-aquecer os chunks em idle | Compilação com `warmViewChunks` ligado | **Sem diferença** (367 vs 358 ms) |
| É a prioridade da actualização | `setView` dentro de `startTransition` | **Sem diferença** (355 vs 358 ms) |
| É o esqueleto de carregamento | `dynamic()` sem componente `loading` | **Sem diferença** (364 ms) |
| **É o próprio corte em ficheiros separados** | **Propostas importada normalmente (sem `dynamic`)** | **370 ms → 258 ms, e a fase "montar" passa de 300 ms a 0** |

Ou seja: os 300 ms são o custo fixo de **a vista ser montada pela primeira vez
a partir de um ficheiro separado**, e a única coisa que os elimina é não a
separar. Nem pré-carregar o ficheiro, nem tirar o esqueleto, nem mexer na
animação resolvem — foi tudo medido.

> Isto contraria directamente a nota que está hoje em `admin/lazy.tsx`, que
> atribui ~250 ms por vista ao download do chunk. O download são 8–21 ms. O
> pré-aquecimento continua a valer a pena por outra razão (numa ligação lenta,
> deixa de haver rede no momento do clique) — mas **não** torna a mudança de
> vista mais rápida, e não deve ser vendido como tal.

**A troca, medida:** trazer Propostas para dentro do esqueleto custa +10,3 KB no
primeiro carregamento e poupa ~110 ms em cada primeira mudança para essa vista.
Fazer o mesmo às cinco vistas do dia-a-dia (Propostas, Faturas, Calendário,
Estatísticas, Overview ≈ 67 KB) levaria o primeiro carregamento de 229 KB para
~296 KB (+29 %) e tiraria os 300 ms de espera de todas elas.

---

## 3. Onde a thread principal bloqueia mais de 50 ms

Com os dados de origem quase não bloqueia: **uma** tarefa de 54 ms durante a
hidratação; TBT total de 4 ms. Confortável.

Com **300 pedidos** passa a **642 ms acumulados em 8 tarefas**:

| Duração | Quando |
| --- | --- |
| 223 ms | vista Faturas |
| 172 ms | primeiro carregamento (hidratação) |
| 142 ms | vista Propostas |
| 122 ms | vista Faturas |
| 118 / 106 / 86 / 73 ms | primeiro carregamento |

Todas em `window` (código da aplicação, não de terceiros). O grosso está na
hidratação do `AdminClient` — desserializar os pedidos que vêm dentro do HTML e
reconstruir a lista — e depois em desenhar listas longas (Faturas, Propostas).

---

## 4. Com volume a sério — 300 pedidos, 194 propostas, 159 faturas

Um back office rápido com 3 linhas e lento com 300 é exactamente a queixa. Os
pedidos de teste são **clones de um pedido real** do projeto (mesmos campos,
mesma forma), variando só o que distingue um cliente de outro.

| | 1 pedido | 300 pedidos | Fator |
| --- | --- | --- | --- |
| HTML do servidor | 112,6 KB | **501,2 KB** | **4,5×** |
| JavaScript | 229,2 KB | 229,2 KB | 1,0× |
| Primeira pintura (FCP) | 244 ms | 420 ms | 1,7× |
| **Responde ao 1.º clique** | 456 ms | **1173 ms** (p95 1200) | **2,6×** |
| Bloqueio da thread (TBT) | 4 ms | **305 ms** | 76× |
| Mudança de vista (mediana) | 350 ms | 363 ms | 1,04× |
| Abrir um pedido | 615 ms | 683 ms | 1,1× |

**O JavaScript não cresce — o que cresce são os dados.** Os 300 pedidos
completos vão dentro do HTML porque `admin/page.tsx` lê `listQuotes()` inteiro e
passa-o como `initialQuotes`. A lista só mostra 50 de cada vez
(`LIST_PAGE_SIZE`), mas os 300 seguem na mesma pelo cabo e o browser tem de os
desserializar **antes** de conseguir responder ao primeiro clique.

Boa notícia: **mudar de vista quase não piora com o volume** (350 → 363 ms). O
problema do volume está concentrado no arranque.

### O servidor não é o problema

Medido sem browser, com 300 pedidos:

| Endpoint | Mediana | p95 | Resposta |
| --- | --- | --- | --- |
| `/api/propostas` | 35 ms | 36 ms | 156,1 KB |
| `/api/faturas` | 24 ms | 31 ms | 43,4 KB |
| `/api/calendario` | 14 ms | 25 ms | 43,5 KB |
| `/api/tarefas` | 13 ms | 28 ms | 21,5 KB |
| `/api/contratos` | 10 ms | 16 ms | 15,6 KB |

Tudo em dezenas de milissegundos, mesmo lendo e voltando a analisar o ficheiro
JSON inteiro a cada pedido (`src/lib/repository.ts`, `FileBackend.read`). Em
produção isto é Supabase, ainda mais rápido. **Não há aqui nada urgente.** O que
custa é o *tamanho* das respostas e o facto de algumas serem pedidas 2–3 vezes.

### Um susto que valeu a pena: uma linha má derruba o back office inteiro

Durante a medição o back office rebentou com o ecrã "Ocorreu um erro
inesperado". **Não era o volume** — eram os dados de teste: uma proposta com o
estado `"recusada"` em vez de `"rejeitada"`. Corrigidos os dados de teste, as
dez vistas passam todas com 300 pedidos.

Mas o susto expôs uma fragilidade verdadeira:

```
Propostas.tsx:373 → STATUS_META[p.status].color
TypeError: Cannot read properties of undefined (reading 'color')
```

**Uma única proposta com um estado inesperado leva TODO o back office ao ecrã de
erro**, não só aquela linha. A API valida os estados
(`api/propostas/[id]/route.ts:18`), portanto isto não acontece pelo uso normal —
mas acontece com uma linha antiga, uma migração, ou uma correcção feita
directamente na base de dados. O `AdminClient` já protegia o mesmo caso
(`statusBadge` usa `s?.color ?? …`); o `Propostas.tsx` não.

**Já está corrigido.** O `Propostas.tsx` passou a usar um `statusMeta()` que
devolve o valor cru em cinzento quando o estado não está no mapa: a linha
estranha aparece marcada, e o ecrã não se perde. `Propostas.test.tsx` fixa-o com
uma proposta gravada como `recusada` — sem a correcção, esses dois testes
rebentam com exactamente o `TypeError` acima.

### E o volume, afinal?

Com os dados de teste corrigidos e uma compilação de produção **coerente** (ver
"Notas de honestidade"), 300 pedidos dão:

| | medido |
| --- | --- |
| entrar → barra lateral visível | 371 ms |
| primeiro clique a aterrar | 124 ms |
| vista Pedidos a aparecer | 14 ms |
| **total até poder trabalhar** | **509 ms** |
| mudar de vista (4 vistas seguidas) | 97–131 ms |

Nenhum ecrã de erro, nenhum erro de execução. **O back office não quebra com
volume** — a secção acima descreve uma fragilidade de dados, não um limite de
escala.

---

## 5. O site público

Medido com Playwright, contra os orçamentos já acordados em
`lighthouserc.json` / `lighthouserc.mobile.json`. **Não é uma pontuação
Lighthouse** — é a matéria-prima dela (o `lhci` precisa de internet para se
instalar e aqui não há). Serve para ver desvios, não para substituir o CI.

**Desktop** (orçamentos: LCP ≤ 2500 ms · CLS ≤ 0,1 · TBT ≤ 200 ms)

| Página | LCP | CLS | TBT | JS | Imagens |
| --- | --- | --- | --- | --- | --- |
| home | 468 ms ✅ | 0,000 ✅ | **324 ms ⚠️** | 257,1 KB | 1714,5 KB (54 pedidos) |
| galeria | 664 ms ✅ | 0,000 ✅ | **211 ms ⚠️** | 209,2 KB | 1354,9 KB (26 pedidos) |

**Mobile, CPU 4× mais lento** (orçamentos: LCP ≤ 4000 ms · TBT ≤ 600 ms)

| Página | LCP | CLS | TBT | JS | Imagens |
| --- | --- | --- | --- | --- | --- |
| home | 756 ms ✅ | 0,000 ✅ | 270 ms ✅ | 209,2 KB | 1736,8 KB (55) |
| galeria | 912 ms ✅ | 0,000 ✅ | 285 ms ✅ | 209,2 KB | 1346,2 KB (26) |

LCP e CLS estão folgados — muito folgados. O único ponto fora é o **TBT no
desktop**, e mesmo esse com uma ressalva honesta: a máquina estava com outras
compilações a correr, e o valor de mobile (com o CPU deliberadamente 4× mais
lento) deu *melhor* do que o de desktop, o que só pode ser ruído. **Antes de
mexer no site público, vale a pena correr o `lhci` a sério no CI** — pelo que se
vê aqui, não há emergência.

O que salta à vista é outra coisa: a home descarrega **1,7 MB de imagens em 54
pedidos**. Não estoura nenhum orçamento acordado, mas é o maior número da página
e o mais fácil de justificar a olho.

---

## 6. O PDF da proposta

Medido de ponta a ponta em `POST /api/orcamento/:id/proposta-doc` (o mesmo
caminho que o Estúdio de Propostas usa para pré-visualizar), variando o número
de fotos para separar o custo fixo do custo por foto.

| Fotos | 1.ª chamada | Já quente | PDF gerado |
| --- | --- | --- | --- |
| 0 | 437 ms | **259 ms** | 75,2 KB |
| 2 (as duas da capa) | 600 ms | 528 ms | 332,4 KB |
| 6 | 762 ms | 704 ms | 462,5 KB |
| 12 | 1267 ms | **1161 ms** | 605,8 KB |

Decomposição:

- **259 ms fixos** — texto, fontes, logótipos e estrutura do documento. Não
  depende das fotos.
- **~75 ms por foto** — descodificar, recortar com o sharp e embutir. As duas
  fotos da capa custam mais (~135 ms cada: são tiras de página inteira, saem de
  originais de 3000 px); as do mood board custam ~45–75 ms.
- **+178 ms na primeira chamada de cada arranque do servidor** — carregar o
  `pdf-lib` e o `sharp`. Só se paga uma vez.

**Uma proposta real com capa + 10 fotos de inspiração: ~1,1 segundos.** O
documento fica em ~600 KB. Isto está bem: depois das correcções anteriores (o
JPEG baseline e a cache por conteúdo em `proposal-image.ts`), o gerador está a
fazer exactamente o trabalho mínimo. **Não recomendo mexer aqui.**

Uma ressalva de método: nesta medição as fotos vão dentro do pedido em base64,
enquanto em produção o servidor vai buscá-las ao Supabase. A parte de **rede é
diferente**; a parte de **CPU** (sharp + embutir), que é a que domina, é a mesma.

---

## Ranking — (tempo poupado) ÷ (risco da alteração)

Do melhor negócio para o pior. "Risco" é 1 (uma linha, sem efeitos laterais) a 5
(mexe na arquitectura).

| # | O quê | Poupa | Risco | Ficheiros |
| --- | --- | --- | --- | --- |
| 1 | **Proteger `STATUS_META[p.status]`** com um valor por omissão | evita o back office inteiro ir ao ecrã de erro | 1 | `Propostas.tsx:373` |
| 2 | **Acabar com os pedidos repetidos**: `Reminders` e `Agenda` passam a usar `useCachedList` em vez de `fetch` cru | ~63 KB e 2 pedidos a menos, na janela exacta em que o ecrã não responde (300 pedidos) | 1 | `Reminders.tsx`, `Agenda.tsx` |
| 3 | **Não enviar os 300 pedidos dentro do HTML** — mandar só a primeira página e ir buscar o resto | HTML 501 → ~50 KB · 1.º clique 1173 → estimados ~600 ms · TBT 305 → ~50 ms | 3 | `admin/page.tsx`, `AdminClient.tsx` |
| 4 | **Trazer as 5 vistas do dia-a-dia para dentro do esqueleto** (sem `dynamic`) | −110 ms em cada primeira mudança de vista, e fim dos 300 ms de espera. Custa +67 KB no arranque | 2 | `admin/lazy.tsx`, `AdminClient.tsx` |
| 5 | **Aquecer o `pdf-lib` + `sharp`** no arranque do servidor | −178 ms no primeiro PDF de cada sessão | 1 | rota/arranque do servidor |
| 6 | **Deduplicar o catálogo `orcamento/data`** (aparece em 4 chunks, 2 descarregados) | ~19 KB no primeiro carregamento com volume | 2 | `lib/orcamento/data.ts` e quem o importa |
| 7 | **Tirar o back office do layout do site de marketing** | ~8 KB de dados + Footer/StickyCTA/ConsentBanner/ScrollProgress por hidratar | 3 | `app/[lang]/layout.tsx` (route group) |
| 8 | **Site público: 1,7 MB de imagens na home** | não estoura orçamentos; medir com `lhci` a sério antes de mexer | 3 | galeria/home |

O que **não** vale a pena fazer, e porquê:

- **Encolher o React/Next (150 dos 229 KB).** É infraestrutura; só sai mudando
  de arquitectura.
- **Optimizar as APIs de lista.** 10–35 ms com 300 linhas, a ler ficheiros JSON.
  Em produção é Supabase.
- **Mexer no gerador de PDF.** Já está no mínimo depois das correcções
  anteriores; 259 ms fixos + 75 ms por foto é trabalho real.
- **Pré-aquecer os chunks das vistas para ganhar tempo.** Medido: ganha 0 ms.
  (Continua a fazer sentido para tirar a rede do momento do clique numa ligação
  lenta — mas é esse o argumento, não a velocidade.)

---

## Como voltar a medir

```bash
npm run build                          # obrigatório: dev não conta
node scripts/bench-back-office.mjs     # arranca o servidor sozinho e mede
```

O script arranca o `npm run start` numa porta livre, faz login, mede, e desliga
tudo no fim. Sem opções, **não escreve nada em lado nenhum**.

Opções úteis:

| Opção | Para quê |
| --- | --- |
| `--runs=5` | mais repetições (menos ruído, mais tempo) |
| `--cpu=4` | emular um portátil modesto (CPU 4× mais lento) |
| `--skip=publico,pdf` | medir só o back office |
| `--url=http://localhost:3000` | usar um servidor já a correr |
| `--json=antes.json` | guardar os números em bruto |
| `--headed` | ver o browser a trabalhar (diagnóstico) |

### O teste de volume (300 pedidos)

Esta é a única parte que **escreve** ficheiros — substitui `data/*.json` e
repõe-nos no fim, mesmo depois de uma interrupção. Por isso é preciso pedi-la de
propósito, e o mais seguro é apontá-la a uma cópia do projeto:

```bash
cp -r . /tmp/liquen-bench && cd /tmp/liquen-bench && npm run build
node scripts/bench-back-office.mjs --volume=300 --root=/tmp/liquen-bench
```

Os pedidos gerados são **clones de um pedido real** do `data/quotes.json` do
projeto, para que um ecrã que rebente seja culpa do produto e não dos dados de
teste. (Foi assim que se descobriu o problema do `STATUS_META`.)

### Comparar antes e depois

```bash
node scripts/bench-back-office.mjs --json=antes.json
# ... alterações ...
npm run build && node scripts/bench-back-office.mjs --json=depois.json
node scripts/bench-back-office.mjs --diff=antes.json,depois.json
```

O `--diff` imprime uma tabela com a variação em percentagem de cada número que
interessa: bytes do primeiro carregamento, tempo até responder ao clique,
bloqueio da thread, cada mudança de vista e cada caso do PDF.

---

## Notas de honestidade

- Nada foi desligado para os números ficarem bonitos. As experiências da secção
  2 (sem `dynamic`, sem `loading`, com `startTransition`, com movimento
  reduzido) foram feitas **numa cópia do projeto**, para medir, e não estão no
  código.
- O `lhci` não corre neste ambiente (precisa de internet). Os números do site
  público são do Playwright e servem para detectar desvios, não para substituir
  o job de Lighthouse do CI.
- A secção de volume não mede **gravações**: sem Supabase, o repositório de
  ficheiros recusa escritas em produção de propósito
  (`src/lib/repository.ts`). Criar um pedido ou guardar um tema não está medido
  aqui.
- **Compilar por cima de um servidor a correr inventa problemas que não
  existem.** Ao repetir a secção de volume, uma medição deu um clique morto de
  20 segundos e um formulário de login que não aceitava escrita — parecia um
  defeito grave e não era nenhum: o `npm run build` tinha substituído o `.next`
  debaixo do `npm run start` que já estava de pé, os chunks de JavaScript
  passaram a responder 500 e a página nunca chegou a hidratar. Com uma
  compilação coerente, os mesmos 300 pedidos dão os 509 ms da secção 4. Se um
  número parecer catastrófico, **confirmar primeiro que o servidor e o `.next`
  são da mesma compilação** (`rm -rf .next && npm run build`, e só depois
  `npm run start`) antes de acreditar nele.
