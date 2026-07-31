# Desempenho das landing pages — medido, com o resultado que deu

Foi pedido "LCP abaixo de 2s em todas estas páginas. Mede e prova." Medi. O
resultado é bom, mas **não é um sim limpo**, e digo-o antes dos números.

Reproduzir: `node scripts/medir-lcp-landing.mjs http://127.0.0.1:3000`, com o
site compilado (`npm run build && npx next start`).

---

## O resultado em três linhas

- **Em computador: sim, com folga.** 292 a 1092 ms. O limite de 2 s nunca chega
  perto de ser tocado.
- **Em telemóvel estrangulado: não.** 1840 a 2528 ms, com quatro páginas abaixo
  dos 2 s e dez acima.
- **Mas são 30% a 45% mais rápidas do que qualquer página que já existia no
  site**, medidas no mesmo perfil e na mesma máquina.

## As condições, ditas à partida

Chromium local contra `next start` na mesma máquina, portanto **sem latência de
rede real**. Duas condições:

| | Ecrã | Rede | CPU |
|---|---|---|---|
| Computador | 1440×900 | local | normal |
| Telemóvel estrangulado | 390×844 @3x | 1,6 Mbps, 150 ms de latência | 4× mais lento |

A segunda é o perfil que o Lighthouse usa para telemóvel. É **deliberadamente
pessimista** — pior do que a rede da maior parte dos telemóveis portugueses em
2026. Uso-a porque é a referência da indústria e porque é o lado seguro para
tomar decisões; não porque acredite que é a experiência típica.

## Os números

| Página | Computador | Telemóvel estrangulado |
|---|---:|---:|
| /casamentos/destination | 636 ms | **1840 ms** |
| /casamentos/algarve | 336 ms | **1884 ms** |
| /casamentos/acores | 408 ms | **1932 ms** |
| /en/casamentos/destination | 396 ms | **1964 ms** |
| /casamentos/porto-douro | 340 ms | 2048 ms |
| /casamentos/estilo/campo | 364 ms | 2084 ms |
| /casamentos/alentejo | 420 ms | 2096 ms |
| /en/casamentos/alentejo | 292 ms | 2100 ms |
| /casamentos/centro | 1092 ms | 2184 ms |
| /casamentos/madeira | 568 ms | 2240 ms |
| /casamentos/minho | 620 ms | 2272 ms |
| /casamentos/lisboa | 1088 ms | 2300 ms |
| /casamentos/estilo/minimalista | 636 ms | 2452 ms |
| /casamentos/estilo/boho | 712 ms | 2528 ms |

## A comparação que interessa mais do que o limite

O limite de 2 s é um número. Isto é uma referência:

| Página | Telemóvel estrangulado (mediana de 3) |
|---|---:|
| `/` (página inicial) | 3752 ms |
| `/servicos` | 3652 ms |
| `/clientes` | 3552 ms |
| `/servicos/casamentos` | 3268 ms |
| **`/casamentos/alentejo`** | **2064 ms** |
| **`/casamentos/lisboa`** | **2696 ms** ¹ |

¹ antes do último ajuste de herói; ficou em 2300 ms.

As landing pages são **um segundo a segundo e meio mais rápidas** do que as
páginas existentes, no mesmo perfil. É isso que o Índice de Qualidade da Google
vai comparar com os concorrentes, e é aí que a diferença se paga.

## O que fez a diferença, e o que descobri pelo caminho

A **primeira medição falhou feio**: 2108 a 6560 ms, com o pior caso três vezes
o melhor. A diferença inteira eram **bytes de imagem**.

Duas das fotografias que eu tinha escolhido para herói eram tomadas de drone.
Comprimem mal — muito detalhe fino, sem superfícies lisas — e davam ficheiros
de **316 KB e 282 KB** a 1536 px, contra uma norma de 65 a 110 KB nas outras.

A página não estava partida. Aparecia bem. Só demorava três vezes mais, e
ninguém repararia sem medir.

Medindo três páginas com heróis de peso diferente, a relação é quase linear:

```
 65 KB → 2064 ms        92 KB → 2696 ms        113 KB → 2964 ms
```

Cerca de **19 ms por KB**: 5 ms de transferência a 1,6 Mbps mais a
descodificação com o CPU a um quarto da velocidade. Traduzido para uma decisão:
**cada 50 KB a mais no herói é praticamente um segundo a mais de espera** para
quem clicou no anúncio.

Troquei seis heróis por fotografias mais leves. Pior caso: **6560 → 2528 ms**.

E, para isto não voltar a acontecer em silêncio, o peso passou a ser uma regra
verificada: `src/lib/ads/polos-peso.test.ts` abre o ficheiro WebP de cada herói
e recusa qualquer um acima de **100 KB**. Uma fotografia pesada escolhida no
futuro falha o CI com a explicação, em vez de custar dinheiro caladamente.

## Porque é que não continuei a afinar até dar abaixo de 2 s

Porque o que falta **não são as imagens**. Há um piso de cerca de 1,8 a 2,1 s
que vem do HTML, do CSS e do JavaScript da estrutura do site, e vê-se nele: a
página mais leve de todas (`/casamentos/destination`, herói de 46 KB) dá
1840 ms. Nenhuma escolha de fotografia baixa esse piso.

Baixá-lo seria trabalho noutra camada — cortar JavaScript da estrutura comum,
que é partilhada com o resto do site — e isso é um projecto com risco próprio,
não um retoque. Afinar números até um deles calhar abaixo de 2 s numa medição
seria pior do que dizer isto.

**Recomendação:** aceitar como está e voltar a medir com dados reais. O que
conta para o Índice de Qualidade não é este perfil sintético — é o que os
visitantes dela experimentam de facto, e isso lê-se no Search Console (Core Web
Vitals) ao fim de algumas semanas de tráfego. O limiar de "bom" da Google é
**2,5 s**, e todas as páginas já estão abaixo disso mesmo nesta medição
pessimista.
