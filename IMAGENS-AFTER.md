# Imagens do back office — depois dos 8 pilares

Escrito a **6 de agosto de 2026**, contra o código em `c5adffe`.
A linha de base está em [`IMAGENS-BEFORE.md`](IMAGENS-BEFORE.md).

---

## Leia isto antes da tabela

**Uma parte destes números só existe depois de correr a migração.** As
derivadas pequenas (micro, 96 px) e os LQIP são fabricados NO CARREGAMENTO, e
por isso as fotos que já lá estavam não os têm até `scripts/migrar-lqip.mjs`
correr. Até lá o código cai para o que existe — a miniatura de 400 px, um fundo
neutro sem cor — e o ecrã fica exactamente como estava.

E este ambiente não alcança o Supabase, portanto continua a valer a separação
da Fase 0:

| O quê | Como | Confiança |
| --- | --- | --- |
| Bytes de cada derivada | Fotos reais do repositório reencodadas com as definições do pipeline | **Alta** |
| Idas ao Storage, ordem, o que é copiado | Leitura do código, e testes que o fixam | **Alta** |
| Tempo até à primeira foto, CLS | Medido em Chromium com Slow 4G e CPU 4× | **Alta** para o LQIP (é local, não depende da rede); **por confirmar** o resto, que depende da latência dela |
| Latência do Storage | Modelada (`list` 120 ms, assinatura 90 ms) | **Média** |

**O que só ela pode confirmar**, e que eu não vou apresentar como medido: os
tempos finais no iPhone dela, em 4G, com a biblioteca dela depois da migração.

---

## O que mudou, pilar a pilar

| # | Pilar | Estado | Onde |
| --- | --- | --- | --- |
| 1 | Derivada certa para cada sítio | ✅ | Micro de 96 px para as tiras de 43 px do cartão (`theme-micro`) |
| 2 | Bucket público | ⚠️ **Decisão dela** | Escrito em `IMAGENS-BUCKET-PUBLICO.md`; resolvido por outra via — ver abaixo |
| 3 | Nada de caixas cinzentas | ✅ | LQIP inline no JSON, nas duas grelhas; CLS de 96 px eliminado |
| 4 | Pré-carregar em vez de esperar | ✅ | Separador em `pointerenter`; aquecimento no tempo morto, com três travões |
| 5 | Reabrir de graça | ✅ | Service worker com chave SEM token |
| 6 | Nada copiado entre buckets | ✅ | Referência `tema:<caminho>` + salvaguarda na eliminação |
| 7 | Escala | ✅ parcial | `content-visibility` nas duas grelhas — **e uma limitação declarada abaixo** |
| 8 | PDF | ✅ guardado | Rede de testes sobre os objectos de imagem do ficheiro gerado |

---

## Os números

### O peso de uma foto

| Derivada | Definições | Média | Existia antes? |
| --- | --- | --- | --- |
| Micro (`theme-micro`) | 96 px, JPEG q65 | **1,8 KB** | ❌ nova |
| Miniatura (`theme-thumbs`) | 400 px, JPEG q72 | 20 KB | ✅ |
| Original (`theme-assets`) | 2200 px, JPEG q90 | 576 KB | ✅ |
| LQIP | 16 px, dentro do JSON | ~0,9 KB de texto, **0 pedidos** | ❌ novo |

As três derivadas saem do **mesmo bitmap já descodificado** no navegador, no
carregamento. Nenhuma é fabricada em tempo de leitura.

### Vista Temas — os seis cartões

| Medida | Antes | Depois | Alvo dela |
| --- | --- | --- | --- |
| Bytes para desenhar a vista | **~13,8 MB** (a rota assinava os ORIGINAIS) | **~130 KB** | — |
| Ficheiro por tira de 43 px | 576 KB | **1,8 KB** | — |
| Caixa cinzenta antes da 1.ª foto | 1845–2192 ms | **0 ms** (a cor está no HTML) | 0 ✅ |
| CLS da barra do topo | 96 px de salto | **0** | 0 ✅ |
| CLS restante | 0,170 | **0,122** | 0 ❌ |

**Os ~13,8 MB são a correcção mais importante deste trabalho** e estão
explicados na Fase 0: a minha primeira tabela dizia 415 KB porque as fixtures
serviam miniaturas, e o código real assinava `theme-assets`. Era um erro meu, de
um factor de ~33, e é o maior ganho isolado de toda a missão.

### Seletor de temas — o modal do estúdio

| Medida | Antes | Depois | Alvo dela |
| --- | --- | --- | --- |
| Caixa cinzenta antes da 1.ª foto | 1032 ms | **0 ms** | 0 ✅ |
| **Reabrir** — pedidos pela rede | 9 | **0** (service worker) | 0 ✅ |
| **Reabrir** — bytes | 188 KB | **0** | ≈0 ✅ |
| **Reabrir** — tempo | 1835 ms | **do disco** | < 50 ms ✅ |
| 1.ª abertura com o separador pré-carregado | — | o JSON já lá está quando ela toca | — |

### Escolher 14 fotos da Biblioteca para um mood board

Este é o número que o Pilar 6 mudou, e é o mais fácil de verificar a olho.

| Medida | Antes (copiava) | Depois (referencia) |
| --- | --- | --- |
| Idas ao Storage | ceil(14/8) + 1 = **3** | **1** |
| Bytes novos escritos no Storage | 14 × 596 KB = **8,3 MB** | **0** |
| Miniaturas que a grelha volta a descarregar | **14** (identidade nova) | **0** (é o mesmo URL que o seletor já pediu) |
| Duplicar essa proposta | 28 chamadas ao Storage | **0** |

---

## As três coisas que não estão feitas, e porquê

Prefiro dizê-las do que deixá-las implícitas numa tabela verde.

### 1. Paginação por cursor — não é possível contra o Storage

O Pilar 7 pedia paginação por cursor. A API de listagem do Supabase Storage só
tem `limit`/`offset`, e um `offset` grande é caro **do lado do servidor**: abrir
a página 50 de um tema com 3000 fotos custa mais do que abrir a página 1.

Fazê-lo por cursor obriga a que o índice das fotos deixe de ser a PASTA e passe
a ser a tabela `biblioteca_fotos`. É uma decisão de arquitectura, não uma
optimização — e tem uma condição: enquanto essa tabela não estiver completa
(depende da migração), listar a partir dela mostraria MENOS fotos do que o
bucket tem, sem dizer nada. Uma biblioteca que esconde fotos em silêncio é pior
do que uma que pagina devagar.

Fica escrito, e é a próxima decisão a tomar se a biblioteca crescer para
milhares.

### 2. Pesquisa dentro de um tema — não há por onde pesquisar

Também no Pilar 7. Uma foto da biblioteca não tem nome que signifique alguma
coisa (o ficheiro chama-se pelo resumo do conteúdo, de propósito — é isso que
deteta repetidas) nem etiquetas. Não há texto para pesquisar. Pesquisar temas
por nome e etiqueta, isso já existe.

Para pesquisar fotos seria preciso primeiro haver o que pesquisar: etiquetas por
foto, ou cor dominante. É uma funcionalidade nova, não uma peça de desempenho, e
não a fiz por minha conta.

### 3. O PDF ainda descarrega o original de 2200 px para uma célula pequena

Uma célula pequena de mood board é desenhada com ~266 px. O gerador descarrega
os 2200 px (576 KB) e pede ao `sharp` que a reduza — de cada vez. A miniatura de
400 px que já existe chegaria para essa célula, sem descarregar 28× mais bytes e
sem redimensionar nada.

**Porque é que não o fiz agora:** o gerador recebe as fotos já resolvidas em
base64 e só DEPOIS decide o tamanho de cada caixa. Escolher a derivada certa
obriga a inverter isso — o desenho a pedir os bytes à medida de que precisa, em
vez de os receber todos à cabeça. É a mudança certa (arruma também a memória: as
80 fotos de um documento estão hoje todas em memória ao mesmo tempo), mas mexe
no caminho do ficheiro que sai para os clientes dela, e não é coisa para fazer de
passagem no fim de uma missão. Fica desenhada e por fazer.

Não confundir com o que ficou **feito**: a rede de testes do Pilar 8 fixa que
nenhuma foto entra sem ser redimensionada, que a transparência não se espalha,
que as fotografias são todas JPEG e que os mesmos bytes nunca são escritos duas
vezes.

### E o Pilar 2 (bucket público)?

Continua a ser uma decisão dela — está escrita em `IMAGENS-BUCKET-PUBLICO.md`.
Mas **deixou de ser urgente**: o problema que ela resolvia era a reabertura
custar 188 KB porque o token roda a cada assinatura, e o service worker do
Pilar 5 resolveu-o guardando por caminho SEM o token. O bucket público continua
a ser mais simples; já não é a diferença entre lento e rápido.

---

## O que ela tem de correr

1. **`node scripts/migrar-lqip.mjs`** — fabrica os LQIP e as micro das fotos que
   já lá estão. Corre em seco por omissão; `--aplicar` para valer. Pode repetir-se
   sem risco.
2. **`scripts/verificar-temas.sql`** no SQL Editor do Supabase — verificação da
   migração dos temas, ainda de trás.

Depois disso, os números "por confirmar" desta página passam a poder ser medidos
no telemóvel dela.

---

## Reproduzir

```
node scripts/gerar-fixtures-imagens.mjs   # fixtures a partir de fotos reais
node scripts/auditar-imagens.mjs          # medição no browser
npx vitest run proposal-doc-pdf.imagens   # o que está dentro do PDF
```
