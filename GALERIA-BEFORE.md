# A galeria, medida antes de lhe tocar

**Fase 0 da missão "uma das galerias mais rápidas que existem".** Tudo o que
está aqui saiu de um Chromium real contra um build de produção
(`npm run build` + `next start`), com **4G lento** (1,6 Mbit/s a descer, 150 ms
de latência) e **CPU estrangulado 4×**, em dois perfis: **Pixel 7** (412×915,
DPR 3) e **secretária** (1440×900, DPR 2). O arnês é
`scripts/medir-galeria.mjs`; os dados em bruto ficam no JSON que ele escreve.

> **O que estes números NÃO são.** É Chromium estrangulado, não um telemóvel de
> gama média a sério. São um **piso optimista**: o aparelho da vida real é mais
> lento. E a travessia é programática (900 px de 260 em 260 ms), portanto mede
> um scroll contínuo — não um dedo a atirar a página.

---

## 1. O resumo, e a conta que explica a queixa

| | telemóvel | secretária | alvo |
|---|---|---|---|
| LCP | **3876 ms** | **3968 ms** | 1800 / 1200 ms |
| FCP | 1540 ms | 1668 ms | — |
| CLS | 0,0002 | **0,079** | 0 |
| INP | **264 ms** | **248 ms** | < 200 ms |
| Bloqueio da thread principal (sessão inteira) | 949 ms | 1998 ms | *(ver nota)* |
| Peso das imagens numa travessia completa | **55,0 MB** | **44,6 MB** | −70 % |
| Fotos descarregadas | 369 | 427 | — |
| Frames perdidos ao percorrer tudo | *(retirado — ver §2.7)* | *(retirado)* | 0 |

**A queixa — "as fotos de baixo ainda estão a carregar" — sai desta subtracção:**

```
antecipação medida ......... 1133 px   (mediana, telemóvel)
velocidade do scroll ....... 1668 px/s (a travessia medida)
                             ─────────
tempo que a foto tem ....... 679 ms

peso mediano de uma foto ... 124,8 KB
largura de banda ........... 200 KB/s (4G lento)
                             ─────────
tempo que a foto precisa ... 624 ms de rede
              + fila (6 em voo, 12 fotos por ecrã)
              + 45 ms de descodificação
```

Ou seja: **a antecipação em píxeis está boa** (1133 px ≈ 1,2 ecrãs) e mesmo
assim não chega, porque cada foto é pesada demais para o tempo que essa margem
compra. E a um dedo a sério — um flick de ~4000 px/s — os mesmos 1133 px valem
**283 ms**, menos de metade do que a foto precisa. **O problema não é a margem.
É o peso.**

---

## 2. Ponto a ponto, como pedido

### 2.1 Métricas

Acima. Duas notas:

- **CLS 0,079 na secretária** — não é zero como eu tinha assumido. Acontece
  fora da grelha (a grelha tem `aspect-ratio` em cada célula e não salta); o
  valor aparece na primeira janela, com o mosaico-herói de altura fixa
  (`h-[320px] sm:h-[480px] lg:h-[600px]`) a assentar.
- **O bloqueio da thread principal** está aqui como "949 / 1998 ms", e eu
  chamei-lhe TBT. **Não é TBT.** A soma inclui a travessia inteira — mais de um
  minuto a percorrer 427 fotografias — e o TBT é uma métrica do CARREGAMENTO.
  Medido à parte, só o carregamento custa ~300 ms (284/318/322 em três
  corridas). O arnês passou a separar os dois; o `GALERIA-AFTER.md` já traz a
  coluna certa. O que se aguenta desta linha é a comparação relativa entre os
  dois perfis: a secretária bloqueia o dobro do telemóvel apesar de a máquina
  ser mais rápida, porque monta 432 mosaicos num documento com menos de metade
  da altura.

### 2.2 Peso

| | telemóvel | secretária |
|---|---|---|
| Imagens da grelha | 55,0 MB em 369 fotos | 44,6 MB em 427 fotos |
| Documento + JS + CSS + fontes | ~500 KB | ~496 KB |

> **Como os bytes foram contados.** Pelo `encodedBodySize` de cada resposta, não
> pelo `transferSize`: neste arnês o `transferSize` vem a zero em quase todas as
> imagens (a emulação de rede pelo CDP), e usá-lo dava 596 KB de imagens — vinte
> vezes menos do que a realidade. O `encodedBodySize` confere ao byte com os
> ficheiros em disco (132 946 bytes medidos = 132 946 bytes de
> `DaniGui_Adois_58-1280.webp`).

### 2.3 Por imagem

| | telemóvel | secretária |
|---|---|---|
| Formato | WebP (100 %) | WebP (100 %) |
| Largura servida | **1280 px** (369 de 369) | **1024 px** (422 de 427) |
| Largura de exibição | 412 CSS px | 479 CSS px |
| **Rácio servido / exibido** | **3,11×** | **2,14×** |
| Rácio contra píxeis físicos | 1,04× | 1,07× |
| KB por foto (mín / mediana / p95 / máx) | 19,3 / **124,8** / 360,0 / 539,8 | 14,0 / **92,5** / 232,2 / 377,2 |
| Acima de 120 KB | **195 de 369** | **146 de 427** |

**Este é o achado principal.** A regra da missão — *nenhuma imagem servida acima
de 2× o tamanho de exibição em CSS px* — está a ser violada em **374 de 374**
fotos no telemóvel e em **428 de 432** na secretária. A galeria está a servir
1280 px para caixas de 412 CSS px porque o ecrã é DPR 3 e o `sizes` pede
honestamente 3× — o que é tecnicamente correcto e, em bytes, ruinoso: **de 1280
para 768 px são −69 % dos bytes** e a fotografia continua a 1,86× a densidade
física, que ninguém distingue num telemóvel.

> **Nota sobre como isto foi medido, porque quase escapou.** A primeira corrida
> deste arnês dizia "rácio 0,33×" — como se as fotos fossem servidas pequenas
> demais. Era falso: eu estava a ler `im.naturalWidth`, e a especificação manda
> o browser devolver aí o tamanho intrínseco **dividido pela densidade que ele
> próprio calculou** a partir do `srcset`. Para qualquer foto isso dá sempre
> exactamente a largura de exibição — ou seja, um rácio de 1,00 mascarado. A
> largura verdadeira está no nome do ficheiro (`-1280.webp`), e é de lá que o
> arnês passou a lê-la.

### 2.4 Quantas ao carregar, quantas em lazy

| | telemóvel | secretária |
|---|---|---|
| Mosaicos no HTML do servidor | 16 | 16 |
| Pedidos já feitos na primeira pintura | 4 | 4 |
| `loading="eager"` | 1 | 1 |
| `loading="lazy"` | 378 | 429 |
| Imagens no DOM no fim | 381 | 432 |

A galeria arranca com 12 mosaicos no masonry + 5 no mosaico-herói e cresce de
24 em 24 conforme o sentinela é alcançado.

### 2.5 Antecipação — com que margem dispara o carregamento

| | telemóvel | secretária |
|---|---|---|
| Mediana | **1133 px** (679 ms) | **1132 px** (777 ms) |
| p10 (os 10 % piores) | 1024 px | **99 px** |
| Fotos pedidas já dentro do ecrã | 1 de 374 | **35 de 432** |

Há dois mecanismos em série, e é o segundo que manda:

1. **O sentinela do scroll infinito**, com `rootMargin: "800px 0px"`, decide
   quando os mosaicos seguintes **entram no DOM**;
2. o `loading="lazy"` nativo decide quando a imagem **é pedida**. O
   `IntersectionObserver` de 1200 px que existe no `GalleryImage` está lá, mas
   não corre: o componente arranca com `armed = true` (para as fotos virem no
   HTML do servidor), portanto o efeito devolve logo à entrada.

**Uma foto não pode ser pedida antes de o seu mosaico existir.** Por isso a
antecipação real fica presa aos 800 px do sentinela, mais o que o lazy nativo
acrescenta. Na secretária, onde a página é menos alta, isso deixa **35 fotos
pedidas quando já estão à vista** — o buraco cinzento, sem margem nenhuma.

### 2.6 Descodificação

Sonda própria: os ficheiros já servidos, descodificados outra vez com
`createImageBitmap`, na mesma thread e com o mesmo CPU 4×.

| | telemóvel | secretária |
|---|---|---|
| Mediana | **45,4 ms** | 27,9 ms |
| p95 | 116,3 ms | 57,0 ms |

45 ms é **quase três frames** por fotografia. Com 12 fotos a chegar ao mesmo
tempo são ~540 ms de thread principal — e é isto, mais do que o download, que
faz o scroll tropeçar quando um lote aterra.

### 2.7 Frames perdidos — **este número foi retirado**

> **CORRECÇÃO.** Aqui estava escrito "523 frames perdidos no telemóvel, 1362 na
> secretária". **Ignore esses dois números: eram meus e estavam errados.**
>
> Vinham dos intervalos de `requestAnimationFrame` num Chromium headless, que
> não tem pipeline de ecrã. Na mesma corrida, na mesma máquina, o arnês contou
> 2200 frames em 25 s num perfil e 6231 em 55 s no outro — taxas base
> diferentes. Contar "frames perdidos" a partir disso é dar precisão a um
> número que não a tem, e a conclusão que eu tinha tirado ("a secretária perde
> 62 % dos frames") não se aguenta.
>
> O arnês passou a guardar a DISTRIBUIÇÃO dos intervalos (percentagem acima de
> 32 ms, mediana, p95, p99, cauda), que é comparável entre corridas do mesmo
> arnês — e não serve para afirmar quantos frames um telemóvel real perde. Os
> valores do depois estão em `GALERIA-AFTER.md` §4, com a mesma ressalva.
>
> **A fluidez do scroll fica, portanto, por medir.** É a única secção deste
> relatório sem número de confiança.

### 2.8 Placeholders

- **Primeira pintura: 16 mosaicos, 16 com blur.** A primeira janela está bem
  servida.
- **Mas só as primeiras 48 fotos de 427 têm blur** (`BLUR_WINDOW = 48` em
  `page.tsx`). As restantes **379** têm apenas a cor média da fotografia
  (`tile-colors.json`, ~7 caracteres cada).
- Nenhum mosaico fica sem nada: o fundo `#12160f` do `.g-tile` está sempre lá.

Ou seja: quem passa da quarta dobra deixa de ver blur e passa a ver rectângulos
de cor lisa. O blur completo custaria ~63 KB no HTML (427 × 147 bytes), e foi
por isso que ficou pelos 48 — uma medição anterior mostrou que mandar os 427
atrasava a primeira fotografia de 3,4 s para 4,2 s.

### 2.9 Total e paginação

- **427 fotografias** em `photos-data.ts`.
- Sem paginação: **scroll infinito**, 12 no primeiro render, +24 por lote.
- Documento completo: **197 194 px** no telemóvel, **88 764 px** na secretária.

---

## 3. O que isto manda fazer, por ordem de tamanho do efeito

1. **Cortar a largura servida ao dobro do tamanho de exibição** (Pilar 2).
   1280 → 768 no telemóvel: **−69 % dos bytes**, sem diferença visível a DPR 3.
   É a única mudança que sozinha chega perto do alvo de −70 %.
2. **AVIF à frente do WebP** (Pilar 2). Medido nesta pasta, AVIF q52 é −30 %
   face ao WebP q65 actual *e* perceptualmente melhor. Somado ao ponto 1, uma
   foto de 124,8 KB passa a ~27 KB.
3. **Desligar a antecipação do sentinela** (Pilar 1): montar os mosaicos muito
   antes, e pedir a imagem por observador próprio com margem adaptada à
   velocidade do scroll — não pelo `lazy` nativo, que na secretária chega tarde
   em 35 fotos.
4. **Deixar de reconciliar 432 mosaicos** (Pilar 4). O número de frames que eu
   tinha aqui não era de confiar (§2.7); o que se aguenta é o bloqueio da
   thread principal e o número de mosaicos montados.
5. **Blur para as 427** (Pilar 3), mas por um caminho que não custe 63 KB de
   HTML.
6. **CLS 0,079 na secretária** (Pilar 3): encontrar o que assenta na primeira
   janela.

---

## 4. Como repetir estas medições

```bash
npm run build
npx next start -p 3123 &
node scripts/medir-galeria.mjs http://127.0.0.1:3123 --json galeria-before.json
```

Um perfil de cada vez com `--perfil telemovel` ou `--perfil secretaria`.
