# ADICIONAR-BEFORE — o que acontece ao adicionar fotos da Biblioteca a uma proposta

Fase 0 da missão "adicionar uma foto demora segundos". **Diagnóstico por
leitura do código**, com os limites dessa leitura ditos onde existem.

> ## ⚠️ O que NÃO foi medido, e porquê
>
> Os tempos e os bytes **não foram medidos**. A importação escreve em dois
> buckets privados de Supabase e esta máquina não tem as chaves — a rota
> devolve 503 antes de tocar em nada, portanto não há o que cronometrar.
>
> O que se segue é o que o **código faz**: a sequência exacta, e a contagem de
> idas ao Storage por foto. Isso lê-se com certeza, e por si só já explica o
> sintoma. Os milissegundos ficam por medir e estão marcados como tal.

---

## A resposta curta

**Nenhuma das duas hipóteses está certa como foi escrita, e a verdade está a
meio caminho.**

- **(a) copia ficheiros?** Copia — mas **dentro do Supabase**, com
  `storage.copy()`. Os bytes **não** atravessam a rede até à Vercel nem até ao
  browser. Não é uma transferência de megabytes.
- **(b) reprocessa a imagem?** **Não.** Não há `sharp`, não há redimensionar,
  não há converter, não há blurhash. Zero processamento.

**A causa real é uma terceira: são QUATRO idas ao Storage por foto, uma a
seguir à outra.** Nenhuma move bytes pela rede; cada uma paga a latência
Vercel → Supabase. É a soma de quatro esperas que dá os segundos.

E é isto que explica a observação dela de que **uma foto demora tanto como
cinco**: a rota corre 5 fotos ao mesmo tempo (`CONCURRENCY = 5`), portanto 1 e
5 custam exactamente a mesma "onda" de quatro idas.

---

## Resposta às 7 perguntas

### 1. O fluxo exacto, do clique à escrita final

| Onde | O quê |
| --- | --- |
| `ThemePicker.tsx:602` | `runImport(paths)` — parte a selecção em lotes de **8** (`IMPORT_CHUNK`) |
| `ThemePicker.tsx:622` | por lote, um `POST /api/orcamento/{id}/assets/importar` com `{ paths }` |
| `importar/route.ts` | valida sessão, valida que os caminhos são do bucket de temas, `ensureProposalBucket()` |
| idem | **5 fotos ao mesmo tempo** (`CONCURRENCY = 5`), cada uma por `copyThemeImageToProposal` |
| `theme-storage.ts:1240` | as quatro idas ao Storage por foto (tabela abaixo) |
| `ThemePicker.tsx:639` | `onPicked(...)` põe as cópias no estúdio; no fim, `onClose()` |

Os lotes são **sequenciais**: o lote 2 só arranca quando o 1 responde.

### 2. Copia bytes? Quantos e para onde?

Copia — **do lado do servidor do Supabase**, não pela rede:

```ts
sb.storage.from(THEME_BUCKET).copy(themePath, dest, { destinationBucket: PROPOSAL_BUCKET })
```

`proposal-assets/{quoteId}/{uuid}.jpg`. É uma cópia **por servidor**: os bytes
nunca passam pela função nem pelo browser.

**Há um caminho de recurso que SIM move bytes:** se a cópia falhar
(`theme-storage.ts:1273`), o código descarrega a foto para a memória da função
e volta a carregá-la. São ~2,6 MB por foto, ida e volta. É o plano B e não o
caminho normal — **mas se estiver a disparar em produção, é a explicação de
tudo, e não aparece na interface**. Fica na lista do que confirmar nos registos
(`log.warn("theme-storage: cópia no Storage falhou, a descarregar")`).

A cópia (em vez de referenciar) é **deliberada**, e está escrita na rota:
deixar a proposta autónoma, para reorganizar a biblioteca nunca partir uma
proposta já enviada.

### 3. Reprocessa a imagem?

**Não. Nenhuma operação, nenhuma biblioteca.** A miniatura também não é gerada
— é **copiada** a que o tema já tem (`copiarMiniaturaParaProposta`,
`theme-storage.ts:1295`).

A hipótese (b) está descartada.

### 4. Quantas idas ao servidor por foto?

**Quatro, em sequência**, dentro de `copyThemeImageToProposal`:

| # | Chamada | Para quê |
| --- | --- | --- |
| 1 | `copy(themePath → proposal-assets)` | a foto |
| 2 | `createSignedUrl(dest)` | o URL da foto — **uma de cada vez**, singular |
| 3 | `copy(theme-thumbs → proposal-thumbs)` | a miniatura |
| 4 | `createSignedUrl(dest)` no bucket das miniaturas | o URL da miniatura |

Mais `ensureProposalBucket()` uma vez por processo (`getBucket`, e um
`hardenBucket` extra à primeira).

**Quanto demora cada uma: não medido.** Numa travessia típica entre regiões,
100–300 ms cada — o que daria 0,4 a 1,2 s para **uma** foto. É a ordem de
grandeza do que ela descreve, mas é aritmética, não medição.

Note-se o contraste com o resto do ficheiro: a grelha assina **em lote**
(`createSignedUrls`, plural). Aqui assina-se **uma a uma**. As chamadas #2 e #4
são as que mais facilmente desaparecem.

### 5. Porque é que a barra fica presa em 0%?

Porque **conta lotes, não fotos**:

```ts
setProgress({ done: Math.min(i + IMPORT_CHUNK, paths.length), total: paths.length });
```

Isto corre **no fim de cada lote de 8**. Com 1 foto há **um** lote, logo a barra
tem exactamente dois estados: **0% durante toda a operação**, e 100% quando
acabou. Nunca há nada a meio para mostrar.

O texto "A adicionar **0** de 1 foto… 0%" está tecnicamente correcto — zero
fotos estão confirmadas — mas para quem olha é indistinguível de "encravou".
**A suspeita dela está certa: o progresso é falso e a operação é um bloco
opaco.** Só passa a mexer-se acima de 8 fotos.

### 6. O "Parar" cancela mesmo alguma coisa?

**Para 8 fotos ou menos, não. É decorativo.**

O botão põe `stopRequested.current = true` (linha 1002), mas isso só é lido
**no topo do ciclo dos lotes** (linha 615) — ou seja, **entre** lotes. Com um
lote só, a verificação já passou quando o botão fica disponível, e o `fetch`
que está a decorrer não é interrompido: não há `AbortController`.

Com 40 fotos (5 lotes) o Parar funciona, mas só corta no fim do lote em curso.

### 7. Medições com Playwright

**Não feitas** — ver o aviso no topo: sem chaves do Supabase a rota devolve 503
antes de tocar em nada, e cronometrar um 503 não diria nada sobre uma
importação verdadeira.

O que fica preparado para as fazer assim que houver acesso: tempo total, bytes,
e tempo por passo, para 1 e para 10 fotos.

---

## O que isto muda no plano da missão

| Agente | Premissa | Verdade |
| --- | --- | --- |
| 2 — zero reprocessamento | reprocessa | **já não reprocessa nada** — sem trabalho |
| 1 — referência em vez de cópia | copia megabytes | copia **dentro do Storage**; o ganho é muito menor do que parece, e o custo (soft delete, migração, PDF a resolver dois buckets) mantém-se inteiro |

**A correcção com melhor relação ganho/risco não é nenhum dos dois. É esta
ordem:**

1. **Assinar em lote** (as chamadas #2 e #4). Passam de 2N para 2. É a mesma
   `createSignedUrls` que a grelha já usa — mudança pequena, sem risco, e
   corta **metade** das idas ao servidor.
2. **UI optimista** (Agente 3). O modal fecha já e a foto aparece com a
   miniatura que **já está em memória** no seletor. Mesmo que a escrita demore
   500 ms, ninguém está à espera dela. É o que mais muda a sensação.
3. **Tirar a barra de progresso** para lotes pequenos. Uma barra a 0% é pior do
   que barra nenhuma.
4. **Fazer o "Parar" parar mesmo** — `AbortController` no `fetch`, não só a
   verificação entre lotes.
5. **Idempotência** (Agente 4). Hoje dois cliques dão duas cópias, com uuids
   diferentes: nada as reconhece como a mesma foto.
6. **Referenciar em vez de copiar** (Agente 1) — só depois de medir. Se os 1–3
   já puserem isto em menos de 500 ms, esta mudança de esquema deixa de se
   justificar pelo desempenho, e passa a decidir-se só pelo argumento do
   armazenamento duplicado.

---

## O que confirmar nos registos da Vercel

**Se aparecer `theme-storage: cópia no Storage falhou, a descarregar`**, então
o caminho de recurso está a disparar e são ~2,6 MB por foto a atravessar a
função. Isso mudaria o diagnóstico todo — e é uma linha de log a procurar antes
de mais nada.
