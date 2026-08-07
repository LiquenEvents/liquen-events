# Diagnóstico — biblioteca lenta, mood boards lentos, PDF com fotos a menos

**Data:** 7 de Agosto de 2026 · **Ramo:** `claude/wedding-themes-photo-folders-v4at22`

---

## Antes das onze respostas: o que consegui medir e o que não consegui

Isto tem de vir primeiro, porque muda o peso de tudo o que se segue.

**Não consegui reproduzir com Playwright.** Este ambiente não tem credenciais do
Supabase — não existe `.env.local`, e sem `SUPABASE_URL`/`SERVICE_ROLE_KEY` a
rota de carregamento responde 503 de propósito (`isDatabaseConfigured()` em
`src/app/api/orcamento/[id]/assets/route.ts:100`). A única instância que tem o
Storage a sério é o site em produção, e não vou entrar lá para carregar
fotografias de teste na tua conta sem to perguntares.

Portanto, o que se segue está separado em duas famílias, e cada resposta diz a
qual pertence:

- **[CÓDIGO]** — facto lido no código, verificável abrindo o ficheiro. Não
  depende de medição: é o que a aplicação faz, sempre.
- **[POR MEDIR]** — depende dos teus ficheiros e da tua rede. Digo o que sei e
  o que falta.

E há uma terceira coisa, que é a mais útil de todas: **para o sintoma 3 os
registos do servidor já têm a resposta escrita**, com o motivo classificado.
Está no fim, na secção «O que fazer a seguir».

---

## A pista decisiva não é a que tu pensas

> «Se o PDF é gerado a partir de HTML impresso, uma imagem em falta significa
> que a impressão aconteceu ANTES de a imagem carregar.»

**O PDF não é HTML impresso.** Não há Puppeteer, não há Playwright, não há
navegador nenhum no caminho. É construído com `pdf-lib` no servidor
(`src/lib/proposal-doc-pdf.ts`), e os bytes de cada fotografia são descarregados
do Supabase **pelo próprio servidor**, com o cliente de service-role
(`sb.storage.from(BUCKET).download(...)` em
`src/lib/proposal-storage.ts:516`) — sem URL assinado, sem CORS, sem browser.

O código que resolve as imagens **espera por todas antes de desenhar seja o que
for**: `resolveImages` em `src/lib/proposal-doc-render.ts:119` faz `await` a cada
busca e só depois passa o documento ao gerador. Não há corrida possível. Não há
`timeout` de impressão a ser ultrapassado, porque não há impressão.

Isto não é um pormenor de implementação — **derruba a hipótese da causa comum**.
Uma foto em falta no PDF não pode ser "a imagem era lenta demais". Só pode ser
uma coisa: `fetchProposalImageBytes` devolveu `null`. E essa função tem quatro
motivos distintos para devolver `null`, que dão erros completamente diferentes
(ver Q7).

Os três sintomas podem partilhar causa. Mas **não é essa**, e continuar a
persegui-la levava-nos a reescrever o gerador de PDF por nada.

---

## As onze respostas

### Sobre os URLs

**1. São URLs assinados? Um a um ou em lote? Quantas idas antes do primeiro byte?**

**[CÓDIGO]** Assinados, **e já são em lote** — a coisa que a missão pede no ponto
2 da correcção já está feita.

- `assinarLote` (`src/lib/proposal-storage.ts:659`) usa
  `createSignedUrls(paths, ttl)` — **um pedido por bucket**, não um por foto.
- `signProposalPaths` / `signProposalThumbs` (`:724`, `:728`) assinam a lista
  toda de uma vez, e separam por bucket: as fotos da pasta do pedido num pedido,
  as referências `tema:` noutro, **em paralelo** (`Promise.all` em `:713`).
- A biblioteca faz o mesmo (`src/lib/theme-storage.ts:974`).

**Idas até ao primeiro byte de imagem, no seletor de temas:**

| # | Pedido | Onde |
|---|---|---|
| 1 | `GET /api/temas` — a lista de temas | `theme-picker-cache.ts:103` |
| 2 | `GET /api/temas/<id>/imagens?offset=0&limit=60` | `theme-picker-cache.ts:126` |
| 3 | a primeira imagem | — |

**Duas idas à nossa API antes do primeiro byte**, e dentro da segunda o servidor
faz um `list` + até três `createSignedUrls` (original, thumb, micro). Não é
um-a-um, e há pré-aquecimento ao passar o rato
(`aquecerBiblioteca`, ligado a `onPointerEnter`/`onFocus`/`onTouchStart` —
`ProposalStudio.tsx:2164`).

**2. Qual é a validade dos URLs? Podem expirar antes de serem usados?**

**[CÓDIGO]** **São dois prazos diferentes, e essa é a parte que interessa.**

| Bucket | Constante | Validade |
|---|---|---|
| `proposal-assets`, `proposal-thumbs` | `SIGNED_TTL` (`proposal-storage.ts:30`) | **10 anos** |
| `theme-assets`, `theme-thumbs`, `theme-micro` | `THEME_SIGNED_TTL` (`theme-ref.ts:69`) | **6 horas** |

**Sim, podem expirar — e encontrei o defeito que faz com que expirar doa.**

O estúdio guarda os URLs assinados no `localStorage` (chave `SIDE_KEY`,
`ProposalStudio.tsx:742`). Ao reabrir a proposta, um efeito vai buscar
assinaturas frescas a `/api/orcamento/<id>/assets`. Mas as duas metades desse
efeito não fazem a mesma coisa:

```ts
// ProposalStudio.tsx:668 — a MINIATURA só entra se ainda não houver nada
for (const im of imgs)
  if (im.path && im.url && !next[im.path]) next[im.path] = im.thumbUrl || im.url;

// ProposalStudio.tsx:676 — o ORIGINAL entra sempre, e sobrepõe-se
for (const im of imgs) if (im.path && im.url) next[im.path] = im.url;
```

O `!next[im.path]` da primeira metade significa: **se já lá estiver um URL
guardado — mesmo expirado —, a assinatura fresca é deitada fora.** Reabrir uma
proposta com fotos de tema mais de 6 horas depois deixa a grelha a pedir URLs
mortos. O plano B (o original) é refrescado, portanto a célula acaba por
recuperar — mas paga um 400 do Supabase por foto antes disso.

**Segundo defeito, no mesmo sítio:** quando se escolhe uma foto da biblioteca, o
lugar é reservado com um marcador (`onReservedFromLibrary`,
`ProposalStudio.tsx:1327`) que preenche `assetUrls[token]` **mas nunca
`assetOriginais[token]`**. Durante essa janela a célula não tem plano B nenhum:
se a miniatura falhar, vai directa a «desistiu» — que é exactamente a mensagem
«Guardada, mas não foi possível pré-visualizar aqui».

Nenhum dos dois está provado como *a* causa do que vês. Ambos são defeitos reais
e ambos produzem esse sintoma.

**3. O domínio do Supabase está em `images.remotePatterns`?**

**[CÓDIGO]** **Não — e não faz diferença nenhuma.** Duas razões independentes:

1. O estúdio desenha as fotos com `<img>` simples, não com `next/image`
   (`ProposalStudio.tsx:3559`, com o `eslint-disable` do
   `@next/next/no-img-element` por cima). O optimizador nunca é chamado.
2. Neste projecto o `/_next/image` **está desligado**: o `next.config.ts` define
   `loader: "custom"` + `loaderFile`, e com isso o Next responde 404 ao endpoint
   antes de validar o que quer que seja (está medido no comentário do próprio
   `next.config.ts:27-32`). Pôr lá `remotePatterns` não ligava nada.

**A hipótese A da tua lista está descartada, com prova.**

### Sobre os ficheiros

**4. Que tamanho em bytes, e em que tamanho é exibida?**

**[POR MEDIR]** quanto aos teus ficheiros. **[CÓDIGO]** quanto ao que é pedido:

- A grelha do estúdio pede `im.thumbUrl || im.url` — **a miniatura de 400 px
  primeiro** (`ProposalStudio.tsx:669` e `:1193`), com o original só como recurso.
- A grelha dos Temas pede a micro de 96 px onde chega, e a miniatura de 400 px
  no resto (`theme-storage.ts:73-87`, com a medição: eram 18 dos 24 pedidos da
  vista e ~360 KB dos 415 KB).
- As células do estúdio são desenhadas a ~174 px; as capas a ~4:3 dentro de meia
  coluna.

Ou seja: **o sistema já não serve o original nas grelhas.** A hipótese «serve
originais de vários MB numa grelha de 400 px» — que resolveria tudo de uma vez —
**não se aplica às fotos carregadas depois das miniaturas existirem**.

Aplica-se, isso sim, às **fotos carregadas ANTES**: essas não têm miniatura
nenhuma, `thumbUrl` vem vazio, e a grelha cai para o original de 2200 px
(~576 KB). Quantas são é a coisa que preciso de medir e não posso.

**5. Que formato?**

**[CÓDIGO]** **JPEG, em todo o lado.** O cliente prepara e reencoda em
`image/jpeg` (`image-prep.ts:377`, `canvas.toBlob(resolve, "image/jpeg", q)`), e
o servidor força formato imprimível antes de guardar
(`garantirFormatoImprimivel`, `assets/route.ts`) porque **o `pdf-lib` só embute
JPEG e PNG** — um WebP guardado tal e qual acabava numa moldura vazia na proposta
do casal. Não há AVIF nem WebP nestes buckets, e a razão é o gerador de PDF, não
distracção.

**6. Existem derivadas geradas no upload?**

**[CÓDIGO]** **Sim, três, e são geradas no browser antes de subir:**

| Derivada | Lado | Bucket | Onde |
|---|---|---|---|
| miniatura 400 px | ~400 | `proposal-thumbs` / `theme-thumbs` | `image-prep.ts` → `uploadProposalThumb` |
| micro 96 px | 96 | `theme-micro` | `image-worker.ts` (`MICRO_EDGE`) |
| LQIP | inline | base de dados | `LQIP_EDGE`, guardado como `data:` curto |

O desenho é **bucket paralelo, mesma chave**: a miniatura de
`proposal-assets/<pedido>/<uuid>.jpg` é `proposal-thumbs/<pedido>/<uuid>.jpg`
(`proposal-storage.ts:556-573`). Sem índice, sem coluna nova — e uma miniatura em
falta cai sozinha para o original.

**O que a missão pede no ponto 1 já está construído.** O que falta é a migração
das fotos antigas, que nunca correu.

### Sobre a geração do PDF

**7. Como é gerado?**

**[CÓDIGO]** **`pdf-lib` no servidor.** `src/lib/proposal-doc-pdf.ts` desenha,
`src/lib/proposal-doc-render.ts` resolve as imagens para base64 antes de desenhar.
Zero navegadores.

Uma foto falta no PDF quando `fetchProposalImageBytes`
(`proposal-storage.ts:426`) devolve `null`, e há **quatro** caminhos para isso,
com causas que não têm nada a ver umas com as outras:

| Caminho | Causa provável |
|---|---|
| `caminho-do-bucket` | ficheiro apagado, ou permissões do bucket |
| `biblioteca-de-temas` | a foto saiu de um tema (apesar do `theme-materializar`) |
| `url` | assinatura expirada, ou anfitrião fora do guarda anti-SSRF |
| `data-uri` | base64 estragado no documento |

**Cada uma destas já é registada, com o motivo classificado**
(`proposal-storage.ts:451`). É por isso que digo que a resposta ao sintoma 3 já
existe escrita — só não a consigo ler daqui.

**8. Espera por `networkidle` e por `img.complete`?**

**[CÓDIGO]** A pergunta não se aplica, e a resposta é melhor do que ela: **espera
por tudo, sempre**, porque as buscas são `await` e o desenho só começa depois.
Há um tecto de **4 buscas em paralelo** (`FETCH_CONCURRENCY`,
`proposal-doc-render.ts:67`) e **80 imagens por documento**
(`MAX_IMAGES_PER_DOC`), ambos para não rebentar a memória do servidor.

Há um `timeout`, mas noutro sítio e só para URLs remotos: **8 segundos por
imagem** (`AbortSignal.timeout(8000)`, `proposal-storage.ts:488`). Esse caminho só
é usado quando o documento guarda um URL completo em vez de um caminho de bucket.

**E o teu pedido «não gerar em silêncio» já está meio feito:** o gerador conta as
que faltaram e devolve-as no cabeçalho `X-Fotos-Em-Falta`. O que falta é **falhar
mesmo**, em vez de avisar. Concordo contigo: uma proposta com buracos enviada ao
casal é pior do que um erro.

**9. O HTML do PDF aponta para originais ou derivadas?**

**[CÓDIGO]** Não há HTML. O que há é uma escolha por caixa, e é fina:

- **Mood boards:** pergunta-se primeiro **onde** a foto vai ser desenhada
  (`pixelsForBox`), e só se vai buscar a miniatura quando ela chega para essa
  caixa (`proposal-doc-render.ts:142-154`). Uma segunda passagem verifica cada uma
  contra a caixa **verdadeira** — porque uma foto que falha faz as outras crescer —
  e sobe ao original a que ficou curta.
- **Capas:** vão **sempre ao original**, de propósito. As tiras da capa correm de
  topo a fundo do A4 e pedem ~617×1323 px; nenhuma miniatura de 400 px lá chega, e
  tentar seria uma ida ao Storage deitada fora por fotografia
  (`proposal-doc-render.ts:136-141`).

### Sobre os mood boards

**10. O erro exacto quando não abre.**

**[POR MEDIR]** — é a resposta que me falta e a única que não consigo derivar do
código. O que sei é onde ele aparece: o seletor pede
`/api/temas/<id>/imagens?offset=…&limit=60` (`ThemePicker.tsx:1257`), e cada falha
tem tratamento próprio. **Preciso da mensagem, ou dos registos.**

**11. Quantas imagens tenta carregar de uma vez?**

**[CÓDIGO]** **60 por página** (`THEME_PAGE_SIZE`, `theme-types.ts:117`), com
tecto de 200. São 60 células a pedir imagem ao mesmo tempo, e o browser serve
6 por anfitrião — as últimas ficam em fila. **Não há limite de concorrência nem
`IntersectionObserver` nesta grelha**, ao contrário da galeria pública, que
levou os dois. É o ponto 4 da tua correcção, e é justo.

---

## A conclusão, dita como ela é

**Não tenho uma causa raiz comum medida, e não te vou dar uma inventada.**

O que tenho:

1. **A hipótese da causa comum está derrubada.** O PDF não é HTML impresso;
   nenhuma lentidão de imagem pode produzir um PDF com buracos. Os sintomas 1 e 2
   (lentidão) e o sintoma 3 (fotos em falta) têm **mecanismos diferentes**, e
   tratá-los como um só fazia-nos reescrever o gerador por nada.

2. **Para o sintoma 3, a causa está escrita nos registos do servidor**, com o
   motivo já classificado em quatro famílias (Q7). Uma linha de log responde ao
   que três dias de reescrita não respondem.

3. **Para as capas, encontrei dois defeitos reais** (Q2): a assinatura fresca
   deitada fora quando já há uma guardada, e a reserva sem plano B. Ambos
   produzem exactamente a mensagem que vês. Nenhum está provado como *a* causa —
   provo-os assim que tiver uma reprodução.

4. **Para os sintomas 1 e 2, a infraestrutura que a missão pede já existe**
   (derivadas 400/96/LQIP, assinatura em lote, pré-aquecimento) — **excepto para
   as fotos carregadas antes de as miniaturas existirem**, que continuam a servir
   o original de 2200 px, e **excepto o carregamento diferido**: 60 células pedem
   imagem ao mesmo tempo, sem `IntersectionObserver` e sem tecto de concorrência.

**O meu palpite ordenado**, dito como palpite: (a) fotos antigas sem miniatura, a
servir 576 KB numa célula de 174 px, 60 ao mesmo tempo; (b) as 6 horas de
validade dos URLs de tema a cruzarem-se com URLs guardados no `localStorage`;
(c) fotos que já não existem no bucket, para o PDF.

---

## O que fazer a seguir — por ordem de quanto responde por quanto custa

1. **Ler os registos do servidor** (Vercel → Logs, filtrar por
   `imagem não resolveu`). Custa cinco minutos e responde ao sintoma 3 **hoje**.
   Se preferires, mando-te o filtro exacto.
2. **Contar quantas fotos não têm miniatura.** É um script de leitura, sem
   escritas, que corre contra o Storage e diz o número. Sem isso, «gerar as
   derivadas que faltam» é trabalho ao escuro.
3. **A reprodução.** Ou me dizes que posso entrar no site com uma conta de teste
   e carregar duas fotografias de teste, ou instrumento o estúdio para me mandar
   o URL e o código de estado quando a célula falhar — que é, aliás, o «log do
   erro no servidor» que tu própria pediste. A segunda não te toca nos dados.

Diz-me qual, e sigo. Não avanço para as correcções sem isto, porque cada uma
delas é grande e duas das três podem ser para o lado errado.
