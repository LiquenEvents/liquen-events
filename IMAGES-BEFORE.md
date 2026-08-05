# IMAGES-BEFORE — o que as grelhas de imagens do back office fazem hoje

Linha de base medida **antes** de tocar em código, como pedido. Os números aqui
foram medidos com as condições ditas; o que não pôde ser medido está dito como
tal, e não preenchido com estimativas.

Reproduzir: `node scripts/medir-imagens-admin.mjs http://localhost:3210`
(escreve `images-before.json`).

---

## O que foi medido, e o que NÃO foi

As fotografias verdadeiras vivem num bucket **privado** de Supabase. Esta
máquina não tem as chaves, e ao site a sério não há como entrar sem a
palavra-passe da dona. Em vez de inventar números, o medidor serve **fotografias
reais do repositório** — as mesmas que estão em `public/imagens/`, com 1,1 MB de
média — pelo caminho que o back office usa hoje, e mede o browser verdadeiro.

| Medido e fiável | Não medido |
| --- | --- |
| Bytes por célula e no total | Latência do bucket de Supabase |
| Número de pedidos e ordem | Região do bucket vs. região da Vercel |
| Pedidos em voo ao mesmo tempo | Se há CDN à frente do Storage |
| Dimensão do ficheiro vs. dimensão de exibição | Custo de assinar cada URL |
| Formato servido e cabeçalhos de cache | |
| Tempo até à primeira imagem e até à grelha completa | |

**Os tempos absolutos são um PISO.** O bucket a sério, com latência e assinatura
de URL pelo meio, só pode tornar isto mais lento — nunca mais rápido.

Condições: Chromium, ecrã 1280×900, 24 células numa grelha de caixas de 160 px
(a grelha real do back office), cache vazia. O perfil "4G lento" é
**1,6 Mbps / 150 ms de latência** — o mesmo das medições das landing pages.

---

## O achado principal: três comportamentos, e só um está tratado

A leitura do código mostra que o back office não tem UM comportamento, tem três:

| Onde | Miniatura? | Fila? | `lazy`? | Prioridade? |
| --- | --- | --- | --- | --- |
| **Biblioteca de Temas** (`Temas.tsx`) | **sim**, ~25 KB | sim | sim | sim |
| Temas, fotos anteriores às miniaturas | não | sim | — | — |
| **Imagens de capa e moodboards** (`ProposalStudio.tsx`) | **não** | **não** | **não** | **não** |

A Biblioteca de Temas já foi tratada: `src/lib/theme-storage.ts` gera miniaturas
e a grelha consome-as, com fila para os originais e prioridade na primeira
dobra. **`src/lib/proposal-storage.ts` não gera miniatura nenhuma.** As Imagens
de capa e os moodboards do estúdio de propostas puxam o **original inteiro** por
célula, em `<img>` cru (`ProposalStudio.tsx`, linhas 1794 e 1978), sem fila, sem
`loading="lazy"` e sem prioridade.

É exactamente onde a dona diz que vê "A carregar…." durante segundos.

---

## Os números

24 células, o caso das Imagens de capa e dos moodboards:

| | Sem estrangular (localhost) | **4G lento (1,6 Mbps)** |
| --- | --- | --- |
| Pedidos de imagem | 24 | 24 |
| Bytes descarregados | 18,9 MB* | **26,5 MB** |
| Média por célula | 1136 KB | **1130 KB** |
| Primeira imagem visível | 120 ms | **34 680 ms** |
| Grelha completa | 381 ms | **132 866 ms** |
| Tudo pintado | 663 ms | 133 063 ms |
| Formato servido | `image/jpeg` | `image/jpeg` |
| Cache | `public, max-age=31536000, immutable` | idem |

\* a corrida sem estrangular registou 17 dos 24 pedidos (os restantes fecharam
depois da recolha); a de 4G registou os 24. A média por célula é a mesma nas
duas, portanto o total real sem estrangular é também ~26,5 MB.

**Em 4G, a primeira imagem aparece ao fim de 35 segundos e a grelha só fica
completa aos 2 minutos e 13 segundos.** Não é uma impressão: é o número.

### A aritmética que explica tudo

```
Ficheiro servido:   1707 px de largura
Caixa onde aparece:  174 px de largura
                    ────────────────────
                    9,8× a mais em cada eixo  ≈ 96× a área
```

Cada célula descarrega **1130 KB** para desenhar 174 px. A miniatura que a
Biblioteca de Temas já usa nas mesmas caixas pesa **~25 KB** — **45 vezes
menos**. Vinte e quatro células: **26,5 MB contra ~0,6 MB**.

### Formato

Tudo sai em **`image/jpeg`**, o original tal como foi carregado. Nada de WebP,
nada de AVIF, e **nenhuma destas imagens passa pelo `next/image`** — são `<img>`
crus com URL assinado do Storage. (O site público, esse, já não depende do
optimizador: pré-gera 2869 ficheiros WebP na compilação. O back office não
aproveita nada desse trabalho.)

### Cache

`public, max-age=31536000, immutable` — um ano, com o hash no caminho. Este está
bem, e não é aqui o problema.

### Pedidos em voo

O medidor contou até 24 pedidos "em voo" ao mesmo tempo, mas isso **inclui os
que estão à espera de ligação**: o número não prova que houve 24 downloads em
paralelo. O que se vê no tempo é o efeito da fila — a primeira imagem só termina
aos 35 s porque está a competir com as outras 23 pelo mesmo canal estreito.
Confirmar quantas ligações o servidor a sério permite fica para a Fase 2, com o
Supabase à frente.

---

## O que ainda não pôde ser respondido

- **Latência do bucket, região e CDN.** Precisa de acesso ao Supabase. Se a
  região do bucket e a da Vercel não coincidirem, cada um destes 24 pedidos
  paga a travessia — e são 24.
- **Custo de assinar os URL.** `proposal-storage.ts:199` assina **um URL de cada
  vez**, com validade de 60 s. Se isso acontecer em série por imagem, é um
  round trip por célula antes sequer de a imagem começar a descarregar. Há uma
  variante em lote (`createSignedUrls`) usada noutro sítio; qual dos caminhos o
  estúdio segue tem de ser confirmado com o Storage ligado.
- **O waterfall de dados.** Falta cronometrar, contra o Supabase, se a lista da
  grelha e os URL das imagens vêm no mesmo pedido ou em dois.

---

## O que estes números já mandam fazer

Por ordem de efeito, e todos verificáveis contra esta linha de base:

1. **Gerar miniaturas para as imagens das propostas.** O mecanismo já existe e
   está provado do lado dos temas; falta aplicá-lo ao `proposal-storage.ts` e
   escrever a migração para as que já lá estão. Sozinho, isto tira **26,5 MB →
   ~0,6 MB**.
2. **Servir WebP ou AVIF em vez do JPEG original.**
3. **`loading="lazy"` e prioridade só nas primeiras células** — hoje as 24 pedem
   ao mesmo tempo, e a primeira paga a espera de todas.
4. **Placeholder com espaço reservado** em vez do texto "A carregar…." — a caixa
   já tem `aspect-ratio`, portanto não há salto de layout a corrigir; o que
   falta é aparecer alguma coisa em 0 ms.
5. **Aproveitar a fila que a Biblioteca de Temas já tem**, em vez de a
   reescrever.

Os alvos ficam a valer contra a coluna de 4G desta tabela: **primeiro conteúdo
visual < 300 ms** (hoje 34 680 ms) e **grelha completa < 1,5 s** (hoje
132 866 s). O segundo alvo veio cortado na mensagem original; está assumido em
1,5 s e é para corrigir se era outro.

---

# ADENDA — o trabalho que falta é MENOR do que parecia

Investigado depois de escrever o acima. A conclusão muda o tamanho da correcção,
e vale a pena ficar registada antes de alguém a começar do zero.

## A máquina das miniaturas JÁ EXISTE, e as propostas recusam-na

`src/app/[lang]/(site)/orcamento/admin/image-prep.ts` fabrica miniaturas **no
browser**, a partir da mesma descodificação que já faz para redimensionar o
original — 400 px de lado maior, qualidade 0,72, ~30–60 KB.

Só que expõe DUAS portas:

```ts
// A que as propostas usam — o `false` é "não faças miniatura".
export async function prepareImageForUpload(file, kind): Promise<File> {
  return (await prepare(file, kind, false)).file;
}

// A irmã, usada só pela Biblioteca de Temas, que devolve também a miniatura.
```

E o armazenamento acompanha a mesma assimetria: `theme-storage.ts` tem
`uploadThemeThumb` e um bucket `theme-thumbs`; **`proposal-storage.ts` não tem
uma única linha sobre miniaturas.**

Ou seja: a foto é descodificada, a miniatura podia sair da mesma descodificação
por quase nada, e o código escolhe explicitamente não a fazer.

## O desenho a copiar, que já está provado

Os temas guardam a miniatura **num bucket paralelo, com a MESMA chave** do
original: `theme-assets/<tema>/<uuid>.jpg` → `theme-thumbs/<tema>/<uuid>.jpg`.
Não há índice para manter, não há coluna nova na base de dados, e uma miniatura
em falta cai para o original sozinha — que é o que faz as fotos antigas
continuarem a funcionar sem migração obrigatória.

Para as propostas: `proposal-assets/<pedido>/<uuid>.jpg` →
`proposal-thumbs/<pedido>/<uuid>.jpg`.

## Os quatro passos, por ordem

1. **`ProposalStudio`** passa a chamar a variante que devolve a miniatura.
2. **A rota `/api/orcamento/[id]/assets`** aceita a miniatura ao lado do
   original (hoje recebe um campo `files` só).
3. **`proposal-storage.ts`** ganha o gémeo do `uploadThemeThumb` e o
   `listProposalImages` passa a devolver `thumbUrl`.
4. **A grelha** consome `thumbUrl` com recurso ao original — o mesmo padrão do
   componente `Photo` de `Temas.tsx`, que já trata de tudo isto.

## E de caminho, uma pista para o mistério do PDF

`image-prep.ts` tem `COVER_MAX_EDGE = 2200`. As capas do PDF verdadeiro dela
medem **1475×2200** — exactamente esse tecto, no lado maior. Isto diz que a foto
guardada é a que entrou no PDF **tal e qual**, sem passar pelo `pixelsForBox`
(que a 160 DPI pediria 1322 px). É a prova mais forte até agora de que o caminho
de recurso dispara — e desta vez o argumento é um número que só pode vir de um
sítio, não uma inferência sobre proporções.
