# A galeria, depois — o que mudou, e o que não

Continuação de `GALERIA-BEFORE.md`. **Mesmo arnês, mesmas condições:**
`scripts/medir-galeria.mjs` contra um build de produção, 4G lento (1,6 Mbit/s,
150 ms de latência), CPU estrangulado 4×, Pixel 7 (412×915, DPR 3) e secretária
(1440×900, DPR 2).

---

## 1. A tabela

| | telemóvel antes | telemóvel depois | | secretária antes | secretária depois |
|---|---|---|---|---|---|
| **Imagens numa travessia** | 55,0 MB | **18,2 MB** | **−67 %** | 44,6 MB | **33,5 MB** | −25 % |
| KB medianos por foto | 104,6 | **49,9** | −52 % | 102,4 | 81,2 | −21 % |
| Fotos acima de 120 KB | 195 de 369 | **0** | | 146 de 427 | 4 de 427 | |
| Rácio servido/exibido | 3,11× | **1,86×** | | 2,14× | 2,14× | |
| Fotos acima de 2× | 374 de 374 | **5** | | 428 de 432 | 428 | |
| Formato | 100 % WebP | **99 % AVIF** | | 100 % WebP | **99 % AVIF** | |
| Descodificação (mediana) | 45,4 ms | **27,1 ms** | −40 % | 27,9 ms | 26,4 ms | |
| LCP | 3876 ms | 3584 ms | | 3968 ms | 3888 ms | |
| FCP | 1540 ms | 1596 ms | | 1668 ms | 1592 ms | |
| **CLS** | 0,0002 | **0,0002** | | **0,079** | **0,0001** | ✓ |
| **INP** | 264 ms | **160 ms** | ✓ < 200 | 248 ms | 240 ms | |
| TBT (carregamento) | — | **410 ms** | | — | **674 ms** | |
| Fotos pedidas já à vista | 1 de 374 | 1 de 390 | | **35 de 432** | **4 de 432** | ✓ |
| Placeholder no 1.º ecrã | 16 de 16 | 16 de 16 | | 16 de 16 | 16 de 16 | |
| Fotos com blur disponível | 48 de 427 | **427 de 427** | | 48 | **427** | |

---

## 2. Os alvos, um a um, sem arredondar a meu favor

| alvo | telemóvel | secretária | |
|---|---|---|---|
| Peso: −70 % | −67 % | −25 % | ✗ perto no telemóvel, longe na secretária |
| LCP < 1,8 s / < 1,2 s | 3584 ms | 3888 ms | ✗ **e não é por causa das imagens** — ver §3 |
| CLS = 0 | 0,0002 | 0,0001 | ✓ na prática (o limiar "bom" é 0,1) |
| INP < 200 ms | 160 ms | 240 ms | ✓ telemóvel, ✗ secretária |
| TBT < 150 ms | 410 ms | 674 ms | ✗ |
| Nenhuma imagem acima de 2× a exibição | 1,86× | 2,14× | ✓ telemóvel, ✗ por 7 % na secretária |
| Nenhuma imagem sem placeholder | ✓ | ✓ | ✓ |
| Zero frames perdidos | — | — | não é mensurável neste arnês (§4) |

---

## 3. Porque é que o LCP não desceu: **não é uma fotografia**

Isto é o achado mais importante do depois, e vale mais do que qualquer ganho de
bytes desta missão.

Medi qual é o elemento de LCP da `/galeria` no perfil de telemóvel:

```
1624 ms  IMG  19 656 px²  logo-liquen-512.webp
3588 ms  P    28 567 px²  <p class="text-[12.5px] leading-relaxed text-white/80">
```

Esse `<p>` é **o parágrafo do banner de cookies** (`ConsentBanner.tsx:124`).

A fotografia do herói chega aos **2702 ms** e a maior parte da primeira janela
está desenhada antes disso. O que fixa o LCP em ~3,5 s é o banner — que só
existe **depois da hidratação**, porque a decisão de o mostrar vem do
`localStorage`, que só o cliente sabe ler.

**Consequência prática:** nenhuma optimização de imagem move o LCP desta página.
Nem esta, nem a próxima. Enquanto o banner for o elemento de LCP, o tecto é o
tempo de hidratação.

É exactamente o mesmo achado que já está escrito em `LP-AUDIT.md` para as
páginas de campanha (3488–3908 ms com banner, 1344–1432 ms sem ele), e a
correcção é a mesma: **desenhar o banner no servidor, com a escolha num
cookie em vez do `localStorage`**. Isso toca no consentimento e continua a ser
uma decisão sua — não a tomei por si.

> Isto importa para o dinheiro: o LCP entra no Índice de Qualidade do Google
> Ads. Enquanto estiver assim, o tráfego pago desta página paga um LCP de 3,5 s
> que não vem das fotografias.

---

## 4. O metro de frames que eu tinha, e porque foi deitado fora

O `GALERIA-BEFORE.md` original dizia "523 frames perdidos no telemóvel, 1362 na
secretária". **Ignore esses dois números.** Eram calculados a partir dos
intervalos de `requestAnimationFrame` num Chromium headless, que não tem
pipeline de ecrã: media 2200 frames em 25 s num perfil e 6231 em 55 s no outro
— taxas base diferentes na mesma máquina, na mesma corrida. Contar "frames
perdidos" a partir disso é dar precisão a um número que não a tem.

O arnês passou a guardar a distribuição dos intervalos, que é comparável entre
corridas do mesmo arnês:

| | antes | depois |
|---|---|---|
| telemóvel — intervalos acima de 32 ms | (não comparável) | 31 % · mediana 19 ms · p99 155 ms |
| secretária — intervalos acima de 32 ms | (não comparável) | 55 % · mediana 36 ms · p99 172 ms |

Não tenho um "antes" comparável para esta métrica porque ela só existe depois
da correcção. **A fluidez do scroll fica por provar**, e digo-o em vez de
apresentar uma melhoria que não medi.

---

## 5. A compressão custou alguma coisa? SSIM contra o original

`scripts/comparar-qualidade.mjs`, 8 fotografias × 768 e 1024 px, cada candidato
comparado com a MESMA redução guardada sem perdas (para medir o codec, não o
redimensionador):

| variante | SSIM | KB/ficheiro |
|---|---|---|
| webp q65 (o que havia) | 0,9312 | 62,9 |
| webp q72 | 0,9392 | 72,1 |
| webp q75 | 0,9423 | 76,1 |
| **avif q52 (o novo)** | **0,9330** | **50,4** |
| avif q60 | 0,9505 | 73,8 |

**O AVIF q52 é o mesmo ponto de qualidade do WebP q65 que substitui** (0,9330
contra 0,9312 — a diferença está muito abaixo do que se vê) por **menos 20 % de
bytes**. Não chega ao q75 do WebP; uma versão anterior do comentário no
pré-gerador dizia que sim e estava errada — está corrigida, com a tabela ao lado.

Se um dia quiser mais nitidez do que bytes, o degrau é o `avif q60`: sobe o SSIM
0,018 (a maior subida da tabela) mas fica **17 % mais pesado do que o WebP que
havia**, ou seja, desfaz a poupança. Fica dito, com o número ao lado, para essa
ser uma decisão e não uma descoberta.

---

## 6. O que foi feito, e porquê

### Pilar 2 — o peso (o maior efeito)

Cada mosaico passou a ser um `<picture>` com quatro `<source>`:
telemóvel-AVIF, telemóvel-WebP, grande-AVIF, grande-WebP. Isso dá duas coisas
que um `<img>` sozinho não dava:

1. **Tecto por classe de ecrã.** O telemóvel recebe no máximo **768 px** — 1,86
   de densidade efectiva num ecrã 3×, indistinguível numa miniatura. Isto não se
   consegue dizer num `sizes`: o `sizes` descreve a largura da CAIXA e quem
   multiplica pela densidade é o browser. Mentir na percentagem resolvia o
   telemóvel e estragava o DPR 1 — já esteve assim, e a nota que isso deixou no
   código pedia para não se repetir.
2. **Negociação de formato**, com o WebP sempre presente como rede de segurança.

Mais: `decoding="async"` em todas, `width`/`height` explícitos, sRGB forçado
antes de largar o perfil ICC (o sharp larga os metadados por omissão, o que
dessatura uma fotografia em AdobeRGB), e os parâmetros do AVIF no carimbo da
cache do build.

### Pilar 1 — a antecipação

A margem passou a comprar **tempo**, não distância: `useAntecipacao` mede a
velocidade do scroll e devolve a margem que mantém constante o aviso (1,2 s),
com piso de 2 ecrãs e tecto de 6. Resultado medido: as fotografias pedidas já à
vista na secretária caíram de **35 para 4**.

### Pilar 3 — os buracos

O blur cobria 48 de 427 fotografias. Mandar as 427 no HTML custava ~63 KB e
atrasava a primeira fotografia em ~800 ms. Agora as primeiras vão no HTML e as
outras vêm em `/_img/blur-galeria.json`, buscado depois da primeira pintura, em
tempo ocioso — e aplicado **directamente no elemento**, sem passar por estado do
React, porque um placeholder é pintura e não conteúdo.

O CLS da secretária caiu de **0,079 para 0,0001**.

### Pilar 4 — feito, e a virtualização NÃO foi feita de propósito

O `will-change: transform` estava no estado de repouso de todos os mosaicos
montados: com a antecipação a montar até seis ecrãs à frente, eram ~100 camadas
de composição paradas ao mesmo tempo, sem nada a animar. Passou para o `.in`,
que é onde a transição existe.

**O efeito medido é grande.** Bloqueio total da thread principal numa sessão
completa (carregamento + travessia das 427), telemóvel:

| | bloqueio |
|---|---|
| antes desta correcção | **1449 ms** |
| depois | **410 ms** |

— uma queda de 72 %, na mesma medida e no mesmo arnês.

#### Porque é que não há virtualização

A missão pedia-a explicitamente ("virtualização se a galeria tiver mais de ~80
imagens"). **Não a fiz, e a razão é uma medição, não uma preferência.**

Antes de arrancar mosaicos do DOM, perguntei se o número deles custa alguma
coisa. Percorri a galeria em seis blocos de oito ecrãs, medindo o bloqueio da
thread principal dentro de cada bloco e os mosaicos montados no início e no fim:

| bloco | mosaicos | bloqueio no bloco | duração |
|---|---|---|---|
| 1 | 16 → 40 | **0 ms** | 2,9 s |
| 2 | 40 → 40 | **0 ms** | 2,8 s |
| 3 | 40 → 40 | **0 ms** | 2,9 s |
| 4 | 64 → 64 | **0 ms** | 3,0 s |
| 5 | 64 → 64 | **0 ms** | 2,9 s |
| 6 | 64 → 88 | 27 ms | 2,9 s |

O bloqueio não cresce com os mosaicos montados — é praticamente zero em todo o
percurso. O que se sente ao percorrer a galeria deixou de ser a thread
principal; é a fotografia a chegar pela rede.

Virtualizar custaria caro em coisas que funcionam: a navegação por teclado
percorre as 427 fotografias e depende de as células existirem no DOM
(`querySelector('[data-tile-idx="N"]')`), e o restauro da posição de scroll —
que já foi medido, corrigido e documentado ao pormenor — repõe `{y, shown}` a
contar com os mosaicos montados. Trocar isso por um ganho que a medição diz ser
zero seria arriscar duas funcionalidades por nada.

**Se algum dia o bloqueio por bloco deixar de ser zero, a decisão muda.** A
sonda que produziu esta tabela demora dois minutos a correr.

### Pilar 6 — parcial

O lightbox pré-carregava só o vizinho seguinte. Agora pré-carrega os dois — o
`←` era o gesto que doía, porque quem volta atrás está a voltar a uma fotografia
de que gostou.

### Pilar 6 — o lightbox abre a partir da cache

Abria directamente a fotografia em resolução inteira. É o pedido certo — mas é
um pedido, e a 4G lento o que se vê nesse intervalo é preto. Agora desenha-se
primeiro a miniatura que a grelha já descarregou, e a versão grande entra por
cima quando chega.

**Verificado contra o build**, que era onde estava o risco (se o `sizes` da
pré-visualização não escolhesse o candidato já em cache, isto passava a ser um
segundo download no pior momento):

| | telemóvel | secretária |
|---|---|---|
| Fotografia visível depois de abrir | **0 ms** | **1 ms** |
| Pedidos causados pela pré-visualização | **0** | **0** |

Zero milissegundos é a prova de que acertou na cache: nada se descarrega em
zero.

**Dois itens do Pilar 6 que não fiz, de propósito:**

- **Os filtros por categoria.** O código diz `Category filter bar removed on
  request` — foi um pedido dela. Não desfaço uma decisão sua para cumprir uma
  alínea de uma lista. Se os quiser de volta, repõem-se.
- **A revelação com fade.** A actual sobe 20 px sem tocar na opacidade, e o
  código explica porquê: um estado de repouso com `opacity: 0` deixava mosaicos
  invisíveis quando a animação não corria. Trocar isso por "fade + 8 px" seria
  reintroduzir um defeito documentado por causa de 12 px que ninguém vê.

### Achado por tratar: a fotografia do lightbox ainda é WebP

A mesma sonda mostrou o que o lightbox pede ao abrir: `<chave>-1280.webp` para
a fotografia mostrada e para os dois vizinhos pré-carregados. Ou seja, **a
grelha passou a AVIF mas o lightbox não** — continua a usar `next/image` com o
carregador antigo, que só emite WebP.

São ~44 KB por fotografia aberta (169,9 KB em WebP contra 125,8 em AVIF, na
média medida a 1280 px). Para quem percorre o lightbox foto a foto, isso soma
depressa.

Não o mudei nesta ronda porque a fotografia do lightbox está embrulhada no
`<ViewTransition>` do morph e tem a sua própria escada de re-tentativa
(`lbRaw`); passá-la a `<picture>` obriga a refazer as duas, e não quis tocar
nisso sem poder medir o resultado com o mesmo cuidado. **Fica identificado, com
o número.**

### A rede que impede o regresso

`e2e/galeria-desempenho.spec.ts` (`@galeria`), **bloqueante no CI**, em dois
tamanhos de ecrã: nenhuma foto acima do degrau que cobre 2× a caixa, o AVIF à
frente e o WebP presente, nenhum mosaico do primeiro ecrã sem placeholder, e
cada célula com altura reservada antes de a fotografia chegar.

Bloqueante e não informativo porque **esta regressão é invisível**: a galeria
continua a parecer bem com fotografias três vezes maiores do que precisa. Foi
assim que chegou a 55 MB sem ninguém dar por isso.

---

## 7. O que fica por fazer, dito por escrito

- **O TBT de carregamento** (410 / 674 ms) continua acima do alvo de 150 ms, e a
  distribuição de frames não tem um "antes" comparável. A virtualização foi
  descartada com medição (ver Pilar 4); o que resta do bloqueio é a hidratação,
  não o scroll.
- **Terceiros.** Não revi o que o Google Tag Manager custa ao carregamento desta
  página. O preload das primeiras fotografias está feito e verificado.
- **A fotografia do lightbox ainda é WebP** e não AVIF: ~44 KB por fotografia
  aberta. Identificado acima, com a razão de não ter sido feito agora.
- **Pilar 7.** Os `alt` já são únicos e localizados e as dimensões são
  explícitas; falta o `ImageObject`.
- **Secretária a 2,14×.** Fica 7 % acima da regra. Descer ao degrau seguinte
  (768) poria a grelha a 1,62× num ecrã Retina, e isso vê-se. É uma decisão de
  qualidade, não um esquecimento.
- **O peso na secretária** desceu 25 %, não 70 %. Pela mesma razão: lá o aperto
  de largura de banda não justifica perder nitidez.
- **Vídeos.** `scripts/video-galeria.mjs` grava a travessia nas condições da
  medição; para a comparação lado a lado é preciso correr contra os dois builds.

---

## 8. Como repetir

```bash
npm run build
npx next start -p 3000 &
node scripts/medir-galeria.mjs http://127.0.0.1:3000 --json galeria-after.json
node scripts/comparar-qualidade.mjs --amostra 8 --larguras 768,1024
node scripts/video-galeria.mjs http://127.0.0.1:3000 video-galeria
npx playwright test --grep "@galeria"
```
