# PDF-BEFORE — autópsia do PDF de proposta

Fase 0, antes de uma linha de código. Amostra: uma proposta de decoração com
**14 fotografias reais** do repositório (16,4 MB de originais), capa dupla e três
mood boards cheios.

Reproduzir:

```
PDF_AUTOPSIA=/tmp/proposta-antes.pdf npx vitest run proposal-doc-pdf.autopsia
pdfimages -list /tmp/proposta-antes.pdf ; pdffonts /tmp/proposta-antes.pdf ; qpdf --check /tmp/proposta-antes.pdf
```

---

## Resposta curta: a hipótese de partida está REFUTADA

> "As fotos estão a ser embebidas em resolução original, sem downsampling e
> possivelmente em PNG."

**Não estão.** O gerador já redimensiona cada foto ao tamanho de exibição, já
reencoda em JPEG e já deduplica por conteúdo. Os números abaixo mostram-no.

Mas a autópsia encontrou **três defeitos reais** que ninguém tinha visto — e
nenhum deles é uma fotografia.

---

## 1. Peso

| | |
| --- | --- |
| **Ficheiro completo** | **0,95 MB** |
| Páginas | 11 |
| Fotografias de origem | 14 ficheiros, 16,4 MB |
| Redução conseguida | **16,4 MB → 0,95 MB (94%)** |
| Página mais pesada | 1 e 11 (as capas): ~470 KB de fotografia cada |

O alvo que me deu para a Fase 2 era "PDF de 10 páginas abaixo de 5 MB". **Já
está cinco vezes abaixo disso.**

## 2. As imagens, uma a uma

38 objectos de imagem: **16 fotografias em JPEG** e **22 objectos do logótipo**
(11 imagens + 11 máscaras).

| O quê | Píxeis | DPI efectivo | Compressão | Peso |
| --- | --- | --- | --- | --- |
| Capa, foto esquerda | 617×1323 | **160** | JPEG (DCTDecode) | 260 KB |
| Capa, foto direita | 617×1323 | **160** | JPEG | 207 KB |
| Mood board, foto grande | 714×613 | **130** | JPEG | 77–102 KB |
| Mood board, fotos pequenas | 266×299 | **130** | JPEG | 10–21 KB |
| **Logótipo** | 720×430 | **720** ⚠️ | **PNG (FlateDecode) + SMask** ⚠️ | 20 KB |

Os DPI vêm do código, não por acaso: `PLACEMENT_DPI` em
`src/lib/proposal-image.ts` fixa **160 para capas e 130 para colagens**, e
`MAX_IMAGE_EDGE_PX = 2200` protege contra caixas absurdas. É a regra que me
pediu (150 DPI para ecrã), já implementada, com um ponto de folga nas capas.

**Só duas imagens passam dos 150 KB que pediu** — as duas fotos de capa, a
160 DPI. Baixá-las para 150 DPI tira-lhes ~12% do peso.

## 3. Duplicados: não há

O gerador tem cache por **conteúdo × caixa** (`imageContentKey` +
`EmbedCache`). A mesma foto usada na capa e na contracapa é embutida **uma vez**
e referenciada duas — vê-se nos objectos 11 e 12, que reaparecem na página 11
com os mesmos IDs. O logótipo é um só objecto (7 para as páginas interiores, 8
para as capas) partilhado pelas 11 páginas.

## 4. PNG em fotografias: não há

Todas as 16 fotografias são **DCTDecode (JPEG)**, q84, 4:2:0. Nenhuma
fotografia em PNG.

## 5. ⚠️ Transparência: o logótipo, em todas as páginas

**Este é o achado principal.** O logótipo é um **PNG com máscara alfa (SMask)**,
composto em **todas as 11 páginas**. É a única transparência do ficheiro — e a
transparência é, como escreveu, das coisas mais caras de desenhar num
visualizador de PDF.

Pior: está embutido a **720×430 px para ser desenhado com ~72 pt de largura**, o
que dá **720 DPI** — quatro vezes e meia acima dos 160 DPI a que as fotografias
são tratadas. É a única coisa neste ficheiro em resolução absurda, e não é uma
foto.

## 6. ⚠️ Fontes: embebidas, mas NÃO em subconjunto

```
Carlito-Bold      CID TrueType   emb: yes   sub: NO
Carlito-Regular   CID TrueType   emb: yes   sub: NO
Carlito-Italic    CID TrueType   emb: yes   sub: NO
```

Três faces completas, com todos os glifos, quando a proposta usa algumas
dezenas. Estão embebidas uma só vez cada (não repetidas por página), mas
inteiras.

## 7. Espaço de cor: limpo

Tudo em **RGB**. Nenhuma imagem em CMYK, nenhum perfil ICC pesado embebido.

## 8. ⚠️ Estrutura: não linearizado

```
File is not linearized
```

Sem *fast web view*: o visualizador tem de ter o ficheiro todo antes de mostrar
a primeira página. Num PDF servido por rede é exactamente isto que faz uma
abertura parecer lenta.

## 9. Como é gerado

**pdf-lib**, em código — `src/lib/proposal-doc-pdf.ts` (`renderProposalDocPdf`),
com o redimensionamento em `src/lib/proposal-image.ts` (sharp).

**Não é Puppeteer nem HTML impresso.** O AGENTE 4 da missão — CSS de impressão,
`box-shadow`, `networkidle`, `@page` — **não se aplica**: não existe HTML nenhum
neste caminho.

---

## O que isto muda no plano

**O que já está feito e não é para refazer:** downsampling a 130–160 DPI, JPEG
q84 com 4:2:0, deduplicação por conteúdo, tecto de 2200 px, RGB sem ICC.

**O que a autópsia mandou fazer, e que não estava no plano:**

1. **O logótipo.** Achatar a transparência (fundo sólido em vez de SMask) e
   embuti-lo à resolução a que é desenhado. Tira 11 composições alfa do
   ficheiro — a única fonte de custo de desenho que aqui existe.
2. **Subconjunto das fontes.** Três faces completas onde bastam os glifos usados.
3. **Linearizar** (`qpdf --linearize`), para a primeira página aparecer antes do
   ficheiro todo ter chegado.
4. Baixar as capas de 160 para 150 DPI — as únicas duas imagens acima dos 150 KB.

**Uma correcção ao que me pediu:** o AGENTE 1 diz "recomprime em JPEG
progressivo". **Isso partiria o PDF.** O filtro `DCTDecode` do PDF assume JPEG
*baseline*, e vários visualizadores recusam ou desenham mal um JPEG progressivo
embutido. O código já sabe disso e tem o aviso escrito (`PDF_JPEG_OPTIONS`:
"Explícito e inegociável: baseline, nunca progressivo"). Fica em baseline.

---

## O que esta autópsia NÃO explica, e é o mais importante

**Um ficheiro de 0,95 MB com 11 páginas não trava o scroll de ninguém.** O
sintoma que descreve — travar a percorrer, blocos de fotos em branco durante
segundos — não é compatível com o que está neste ficheiro. Restam três
explicações, e não consigo distinguir entre elas daqui:

1. **As suas propostas reais têm muitas mais fotografias** do que as 14 desta
   amostra. Com 60 ou 80 fotos o ficheiro cresce proporcionalmente.
2. **O caminho de recurso está a disparar em produção.** Se o `sharp` falhar,
   `drawCoverImage` embute o **ORIGINAL inteiro** em vez da versão
   redimensionada (`proposal-doc-pdf.ts:264`). Um PDF gerado por esse caminho
   tem exactamente o aspecto da sua hipótese de partida — fotos em resolução
   original — e seria a explicação mais provável do que descreve.
3. **O problema não está no ficheiro, está em como é aberto.** Um PDF servido
   dentro de um iframe no portal, sem *Range requests* e sem linearização,
   comporta-se muito pior do que o mesmo ficheiro aberto localmente.

**Para distinguir preciso de um PDF verdadeiro seu** — um que tenha travado a
sério. Guarde-o e dê-mo, e em minutos digo qual das três é. Sem isso, corrigir
os três defeitos acima melhora o ficheiro, mas posso estar a tratar o sintoma
errado.

---

# ADENDA — o PDF verdadeiro dela (3,31 MB, 10 páginas)

Ela enviou um PDF real. Ele separa as três hipóteses: **é a segunda.**

## A prova

| | Amostra gerada por este código | **PDF verdadeiro dela** |
| --- | --- | --- |
| Peso | 0,95 MB / 11 pág. | **3,31 MB** / 10 pág. |
| Capas | 617×1323 @ **160 DPI**, 260 KB | 1475×2200 @ **266 DPI**, **995 KB** |
| Fotos de mood board | 266×299 @ **130 DPI**, 10–21 KB | 736×1308 … 1179×1598 @ **360–576 DPI**, 73–403 KB |
| Proporções das fotos pequenas | **todas iguais** (0,89) | **todas diferentes** (0,56 / 0,66 / 0,74 / 0,80) |

A última linha é a que fecha o caso. `resizeToBox` recorta ao aspecto **exacto
da caixa**, portanto todas as fotos de uma mesma grelha têm de sair com a mesma
proporção. **As dela têm proporções diferentes entre si** — logo não passaram
por lá. Foram embutidas como estavam, pelo caminho de **RECURSO** do
`drawCoverImage` (`proposal-doc-pdf.ts:264`), que embute o ORIGINAL e ajusta por
recorte no desenho.

Ou seja: o `sharp` está a falhar em produção, e ninguém dá por isso — o recurso
foi desenhado para nunca lançar, e cumpre. O PDF sai sempre; sai é com as fotos
inteiras lá dentro, a 360–576 DPI.

## O que isto muda

1. **A correcção principal deixa de ser "redimensionar as imagens"** — esse
   código existe e está certo. Passa a ser **descobrir porque é que o `sharp`
   falha em produção e fazê-lo falhar RUIDOSAMENTE** em vez de em silêncio.
2. `renderProposalDocPdfWithReport` já existe e devolve um relatório. Se ele
   distinguir "redimensionada" de "recurso", basta ligá-lo a um aviso — e o
   back office passa a dizer quando uma proposta saiu pelo caminho mau.
3. Os três defeitos da autópsia (logótipo com SMask nas 10 páginas a 720 DPI,
   fontes sem subconjunto, ficheiro não linearizado) **mantêm-se todos**, e são
   independentes deste. O logótipo, em particular, continua a ser a única
   transparência do ficheiro — e é composto em todas as páginas.

## Ainda por explicar

Porque é que o `sharp` falha. Hipóteses a testar, por ordem: o binário não estar
disponível no ambiente serverless da Vercel para a arquitectura em uso; um
tecto de memória na função a matar o redimensionamento de ficheiros grandes; ou
`failOn` a rejeitar ficheiros que as câmaras dela produzem. Nenhuma se confirma
sem os registos de produção.

---

# CORRECÇÃO À ADENDA

A adenda acima conclui que o caminho de recurso do `sharp` está a disparar. **O
raciocínio estava errado e a conclusão não se sustenta.** Fica aqui em vez de
ser apagada, porque o erro é instrutivo.

**O que estava mal.** Argumentei que fotos com proporções diferentes provavam
que não tinham sido redimensionadas. Não provam: numa colagem as caixas têm
tamanhos diferentes por desenho, e cada caixa dá uma proporção diferente. O
argumento não vale nada.

**O que os números dizem mesmo.** Os DPI do ficheiro dela são uma mistura: 117 e
134 (perto dos 130 que o código manda nas colagens) ao lado de 360, 417, 489 e
576. E as capas saem a 1475×**2200** — 2200 é exactamente o `MAX_IMAGE_EDGE_PX`,
o que só acontece se alguém tiver pedido MAIS de 2200 px e o tecto ter cortado.

**Porque é que isso é decisivo.** Com `cover: 160` e uma caixa de 595 pt de
altura, `pixelsForBox` pede 1322 px — muito abaixo do tecto. Para o tecto ser
atingido, o DPI pedido teria de ser ~266 ou mais. A tabela `PLACEMENT_DPI`
entrou a 28 de Julho (b042159) com 160/130 e nunca mudou desde então.

**Logo: o que gerou aquele PDF não foi esta versão do código.** Fica por
determinar qual foi — e é isso que a próxima medição tem de responder, em vez de
mais uma hipótese.

**O passo seguinte, concreto.** Gerar um PDF com o MESMO template que ela usa
(o dela tem um painel central estreito, ~44 pt, contra ~286 pt no template
`decoracao` que serviu de amostra), e registar por imagem: a caixa em pontos, os
píxeis pedidos por `pixelsForBox`, e os píxeis que saíram. Se os três baterem
certo, o problema não está no gerador e está no que está publicado.

**O que NÃO muda com esta correcção:** os três defeitos da autópsia — logótipo
com SMask em todas as páginas a 720 DPI, fontes sem subconjunto, ficheiro não
linearizado. Esses foram medidos directamente e mantêm-se todos.

---

# SEGUNDA CORRECÇÃO — as fontes não são um defeito

O ponto 6 da autópsia diz que as fontes estão embebidas mas **não** em
subconjunto, com base na coluna `sub: no` do `pdffonts`. **Está errado.**

O `pdffonts` marca `sub: yes` apenas quando o nome da fonte traz o prefixo
convencional de seis letras (`ABCDEF+Carlito`). A pdf-lib faz o subconjunto mas
não acrescenta esse prefixo, por isso a coluna diz `no` mesmo com o trabalho
feito — e `subset: true` já estava no código (`proposal-doc-pdf.ts:334`).

Medido, que é o que conta: os ficheiros de origem são **48, 50 e 46 KB** —
Carlito já reduzido, contra os ~700 KB de um Carlito completo. No pior caso as
três faces somam **144 KB de um ficheiro de 940 KB**, e a pdf-lib ainda reduz
mais a partir daí.

**Nada a fazer aqui.** Fica escrito porque a lição é geral: uma coluna de uma
ferramenta não é uma medição.

## E a linearização, que é real, não se resolve daqui

O ficheiro continua sem *fast web view*, e isso é verdade. Mas a pdf-lib não
sabe linearizar, e o `qpdf` — que sabe — é um binário nativo que não existe no
ambiente serverless onde o PDF é gerado. Acrescentá-lo é uma decisão de
infraestrutura, não uma linha de código.

Alternativas, por ordem de custo:

1. **Não linearizar** e resolver a lentidão de abertura no PORTAL: servir o PDF
   com `Content-Length` e suporte a *Range requests*, em vez de o entregar
   dentro de um iframe de uma vez só. É onde o sintoma se sente e não precisa de
   binário nenhum.
2. Linearizar **fora** do pedido — num passo de segundo plano, com o ficheiro já
   gerado, onde um binário é aceitável.
3. Acrescentar o `qpdf` ao ambiente de execução. É o mais directo e o mais caro.

Fica por decidir, e a recomendação é a 1 — resolve o que se sente, sem
infraestrutura nova.
