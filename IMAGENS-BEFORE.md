# Imagens do back office — linha de base (Fase 0)

Medido a **6 de agosto de 2026**, contra o código em `75850b0`.

---

## Como isto foi medido, e o que NÃO foi

**Este ambiente não alcança o Supabase dela.** Isso decide o método, e é preciso
dizê-lo antes dos números para ninguém os ler como o que não são.

| O quê | Como | Confiança |
| --- | --- | --- |
| **Bytes de cada ficheiro** | Fotos **reais** do repositório reencodadas com as definições **exactas** do pipeline dela — `THUMB_EDGE=400`/`THUMB_QUALITY=0.72` e `COVER_MAX_EDGE=2200`/`COVER_QUALITY=0.9`, de `image-prep.ts` | **Alta.** São os bytes que o pipeline produz |
| **Pedidos, ordem, tempos, CLS, tamanho exibido** | Chromium a sério, autenticado, com **Slow 4G (1,6 Mbps ↓ / 750 kbps ↑ / 150 ms RTT)** e **CPU 4×**, via CDP | **Alta.** É o cliente real a correr |
| **Latência do Storage** | **Modelada**: `list` 120 ms + assinatura 90 ms — os valores que o próprio `theme-storage.ts` documenta —, aplicados às idas que o código faz de facto | **Média.** A forma está certa; o valor absoluto depende da região |
| **Round trips, batching, onde nascem as derivadas** | Leitura do código | **Alta** |

A biblioteca sintética tem **os tamanhos reais dos seis temas dela** — 14, 16,
21, 19, 17, 17 = **104 fotos**.

**O estrangulamento entra depois do login**, de propósito: o que se está a medir
é o pipeline de imagens, não o formulário de entrada.

### O que ainda não foi medido

Carregamento de fotos novas, mood boards já preenchidos dentro do estúdio, o
PDF, frames perdidos ao rolar, e uma biblioteca de milhares. Ficam para a
validação final.

---

## O peso de uma foto, hoje

Sobre 104 fotografias reais de casamento do repositório:

| Derivada | Definições | Média | 104 fotos |
| --- | --- | --- | --- |
| Miniatura (`theme-thumbs`) | 400 px, JPEG q72 | **20 KB** | 2,0 MB |
| Original (`theme-assets`) | 2200 px, JPEG q90 | **576 KB** | 58,5 MB |

Não há mais nenhuma. **Uma imagem, dois tamanhos** — e o de 400 px serve tanto a
célula de 43 px do cartão como a pré-visualização média do seletor.

---

## Ecrã a ecrã

### 1. Vista **Temas** — os seis cartões

| Medida | Computador (1440) | Telemóvel (375) | Alvo dela |
| --- | --- | --- | --- |
| Pedidos JSON | 2 | 2 | — |
| Pedidos de imagem | 19 | 19 | — |
| Bytes | 415 KB | 415 KB | — |
| **1.ª foto da biblioteca visível** | **1845 ms** | **2192 ms** | < 300 ms ❌ |
| **Grelha completa** (24 fotos) | **3821 ms** | **4156 ms** | < 1 s ❌ |
| **CLS** | **0,170** | **0,168** | 0 ❌ |
| **Imagens acima de 2× do tamanho exibido** | **24 / 24** | **24 / 24** | 0 ❌ |
| Pior excesso | **9,3×** | **9,8×** | ≤ 2× ❌ |

Cada cartão mostra a capa mais três pré-visualizações. As pré-visualizações
medem **43 × 42 px** no ecrã e o ficheiro tem **320 × 400** — é o mesmo
ficheiro de 20 KB da capa, servido para uma tira do tamanho de uma unha.

### 2. **Seletor de temas** — o modal do estúdio

| Medida | Medido | Alvo dela |
| --- | --- | --- |
| Pedidos JSON (1.ª abertura) | 2 | — |
| Pedidos de imagem | 23 | — |
| Bytes | 458 KB | — |
| **1.ª foto visível** | **1032 ms** | < 300 ms ❌ |
| **Grelha completa** (14 fotos) | **2562 ms** | < 1 s ❌ |
| **CLS** | **0,181** | 0 ❌ |
| **REABRIR** — tempo | **1835 ms** | < 50 ms ❌ |
| **REABRIR** — pedidos que atravessam a rede | **9** | 0 ❌ |
| **REABRIR** — bytes | **188 KB** | ≈ 0 ❌ |
| Imagens acima de 2× | 7 / 14 | 0 ❌ |

**A reabertura é o número que mais dói**, e merece a explicação: a cache de
módulo (`theme-picker-cache.ts`) faz o seu trabalho — **zero pedidos JSON**. O
que volta a atravessar a rede são as **imagens**, e a razão está uma camada
abaixo.

---

## Porque é que a cache do browser não salva a reabertura

O Storage serve as fotos com `Cache-Control: max-age=3600` (o `upload` não passa
`cacheControl`, fica o default). O cabeçalho está certo. O que o anula é o
**URL**:

```
…/theme-thumbs/terracotta/ab12….jpg?token=<JWT novo a cada assinatura>
```

Cada assinatura produz um token diferente, logo um **URL diferente**, logo uma
**entrada de cache diferente**. O ficheiro é o mesmo, os bytes são os mesmos, e
o browser volta a buscá-los à mesma. Prolongar o `SIGNED_TTL` não resolve — o
comentário no código já o diz: *"o token muda a cada assinatura, logo o URL muda
na mesma"*.

**É o bucket privado que paga isto**, e é o ponto onde a arquitectura dela e a
actual divergem.

---

## O que já está certo (e não se toca)

Boa parte do Pilar 1 e do Pilar 2 já existe. Vale a pena dizê-lo, para o
trabalho ir só onde falta:

| Princípio dela | Estado | Onde |
| --- | --- | --- |
| Trabalho pesado **no upload**, nunca na leitura | ✅ | Miniatura gerada **no browser**, do mesmo bitmap já descodificado (`image-worker.ts`) |
| Nada redimensionado em tempo de leitura | ✅ | Nenhuma transformação do Supabase, nenhum `sharp` no caminho de leitura |
| Upload directo cliente → Storage | ✅ | `createThemeUploadTickets` |
| Compressão prévia no cliente | ✅ | `image-prep.ts` |
| **URLs assinados em LOTE, não um a um** | ✅ | `createSignedUrls` — uma chamada por página, por bucket |
| Nome de ficheiro com hash do conteúdo | ✅ | `fileNameFor(fingerprint)` |
| **Deduplicação** | ✅ | `upsert:false` + 409 no nome-hash, e MD5 do eTag para a biblioteca antiga |
| Paginação | ✅ | `listThemeImagePage`, `?offset=&limit=` |
| Dados e URLs no MESMO pedido | ✅ | O JSON já traz `url` e `thumbUrl` — **não há o waterfall de três saltos** |
| Cache partilhada entre modal e página | ✅ (parcial) | `theme-picker-cache.ts`, com SWR e dedup de pedidos em voo |
| Pré-carregar ao aproximar do botão | ✅ (parcial) | `aquecerBiblioteca()` no `pointerenter`/`focus`/`touchstart` |

---

## O que falta — por ordem de impacto medido

| # | Lacuna | Custo medido | Pilar |
| --- | --- | --- | --- |
| 1 | **Não há blurhash/LQIP** | 1032–2192 ms de caixa vazia antes da primeira foto | 3 |
| 2 | **Bucket privado + token rotativo** | Reabrir custa 9 pedidos / 188 KB / 1835 ms em vez de 0 | 2, 5 |
| 3 | **Uma só derivada (400 px)** para células de 43 px | 24/24 acima de 2×, até **9,3×** | 1 |
| 4 | **CLS 0,17–0,18** | Salta debaixo do dedo | 3 |
| 5 | **JPEG, não AVIF** | ~30–40% de bytes a mais para a mesma qualidade | 1 |
| 6 | **As fotos são COPIADAS tema → proposta** | Duplica bytes no Storage e reprocessa no caminho da leitura | 6 |
| 7 | **Sem virtualização** | Ainda não dói com 104; dói com milhares | 7 |
| 8 | **Sem service worker para as miniaturas** | Um F5 recomeça do zero | 5 |

O **6** é o que contraria mais directamente o princípio dela — está escrito no
próprio `theme-storage.ts`: *"os bytes são COPIADOS para a pasta da proposta"*.

---

## Reproduzir

```
node scripts/auditar-imagens.mjs          # fixtures + medição
```

As fixtures são geradas de fotos reais do repositório e vivem fora do git.
