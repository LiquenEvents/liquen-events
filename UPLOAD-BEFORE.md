# O carregamento de fotos, medido antes de lhe tocar

O caso que deu origem a isto: **49 fotografias de casamento** arrastadas para um
tema, 6 concluídas ao fim de bastante tempo, barra nos 12%, botão bloqueado e
sem forma de cancelar.

Este documento é a linha de base. Não tem opiniões — tem números, e diz como
foram obtidos, para o «depois» poder ser comparado com o mesmo instrumento.

## Como foi medido

| | |
| --- | --- |
| Ficheiros | 49 JPEG, **264,3 MiB** no total, média **5,39 MiB** (4,0–10,7 MiB) |
| Rede | Chrome «Slow 4G»: 1,6 Mbit/s a descer, **750 kbit/s a subir**, 150 ms RTT |
| CPU | Estrangulado a **1/4** |
| Servidor | `next dev`, com o Storage e o PostgREST servidos por `scripts/supabase-de-teste.mjs` |
| Instrumento | `e2e/upload-medicao.spec.ts` → `e2e/medicoes/antes.json` |

As fotografias são fabricadas (`scripts/gerar-fotos-de-teste.mjs`) a partir das
fotos reais do repositório, ampliadas para tamanho de máquina e com ruído fino
sobreposto. O ruído não é decoração: sem ele uma ampliação comprime muito melhor
do que uma fotografia verdadeira, e os ficheiros sairiam a 1–2 MiB em vez dos
4–10 MiB do caso real — a medição ficaria otimista de graça.

**O Storage é de mentira, e isso é deliberado.** Sem ele a rota responde 503
antes de sair um único byte, e a latência do Supabase verdadeiro variaria entre
as duas corridas e tornaria a comparação inútil. O que se mede aqui é o CLIENTE
e a REDE, que é onde está o problema.

## Os números

| Medida | Valor |
| --- | ---: |
| **Tempo total** | **320 s** (5 m 20 s) |
| Bytes no disco | 264,3 MiB |
| **Bytes enviados** | **28,3 MiB** (592 KiB/foto) |
| Redução já feita pelo cliente | **89,3 %** |
| Débito médio de subida | **742 kbit/s** (tecto: 750) |
| Pedido por foto | min 14,7 s · p50 22,3 s · p90 36,4 s · máx 40,0 s |
| Concorrência | **4** (constante) |
| Primeira célula com imagem | **82 ms** |
| Long tasks | **192**, somando **20,9 s**, a maior **268 ms** |
| Nós no DOM | 513 → 653 (durante) → **892** (fim) |
| Escritas no Storage | 147 = **3 por foto** (original, miniatura, micro) |
| Bytes directos ao Storage | **0** |

### A conclusão que manda em tudo o resto

**742 kbit/s medidos contra um tecto de 750: a subida está saturada a 99 %.**

O carregamento não está à espera do CPU, nem do servidor, nem do Storage. Está à
espera do cano. Tudo o que não reduza BYTES não muda o tempo — e isso inclui
subir a concorrência, que é a correcção que primeiro ocorre a toda a gente.

## Ponto por ponto, o que a Fase 0 perguntava

**Quantos uploads em paralelo.** Quatro, fixos (`UPLOAD_CONCURRENCY = 4`). Com o
cano saturado, seis não seriam mais rápidos — seriam as mesmas fotos a chegar
todas um pouco mais tarde.

**Bytes transferidos vs tamanho dos ficheiros.** 28,3 MiB contra 264,3 MiB. O
cliente **já** comprime antes de enviar (redimensiona para 2200 px e regrava em
JPEG q0.9, com miniatura e micro na mesma descodificação). A premissa de que se
enviam os 8 MB originais **não se confirma neste código**: 89,3 % dos bytes já
não saem daqui.

**O ficheiro passa por uma função da Vercel ou vai directo ao Storage?** Passa
pela função: `POST /api/temas/[id]/imagens`, um ficheiro por pedido, `multipart`.
Zero bytes directos.

> Há um pormenor que vale a pena: **o caminho directo já existe no repositório** —
> `POST /api/temas/[id]/imagens/url` emite bilhetes de escrita
> (`createThemeUploadTickets`, `createSignedUploadUrl`) — **e o ecrã dos Temas não
> o usa**. A carruagem está construída e o comboio anda ao lado da linha.

**Quando são geradas as derivadas.** No cliente, no momento do carregamento,
todas na mesma descodificação (Web Worker + `OffscreenCanvas`): original 2200 px,
miniatura 400 px, micro 96 px e um LQIP de 16 px em `data:` URI. Não há 900 px,
1600 px nem versão de impressão, e não há nada gerado no caminho de leitura.

**Nós no DOM.** 892 no fim, com as 49 células todas no DOM. Não é um problema aos
49; a 300 é (Bloco 6).

**A thread principal bloqueia?** Não bloqueia de forma perceptível, mas também
não está limpa: **192 long tasks, 20,9 s no total, a maior de 268 ms**. Com o
CPU a 1/4 e o trabalho pesado já fora da thread principal, o que sobra é o React
a redesenhar a grelha a cada foto que entra.

**O que acontece se a rede cair a meio.** *(lido do código, não medido — a
medição fica para a validação do Bloco 2.3.)* Cada ficheiro é apanhado por si:
a falha é guardada **com o `File`**, o lote continua, e no fim há um painel com
o que não subiu e um botão para repetir só esses. O que **não** existe: retoma
(um ficheiro interrompido a 90 % recomeça do zero), repetição automática com
recuo, e qualquer forma de continuar depois de fechar o separador.

## O que já lá está (e que a missão dava como em falta)

Vale dizê-lo antes de mexer, para não se reconstruir o que existe:

- **Processamento fora da thread principal** com `createImageBitmap` +
  `OffscreenCanvas` numa pool de Web Workers (`image-prep.ts`, `image-worker.ts`).
- **Placeholder local imediato** — o LQIP de 16 px e o URL de objeto do próprio
  ficheiro: a primeira célula tem conteúdo aos **82 ms**.
- **Compressão antes do envio** — 89,3 % dos bytes.
- **Deduplicação antes de subir** — o resumo é calculado no cliente e há uma
  verificação em lote (`POST …/repetidas`) antes de subir seja o que for.
- **O cabeçalho já diz «X de Y»** (4.3), e há relatório de falhas com repetição
  só das que falharam.

## O que está mesmo mal

1. **A percentagem conta ficheiros, não bytes** (`done / total`). Com fotos de
   4 a 10,7 MiB a barra salta — e o caso real («6 de 49 = 12 %») é exactamente
   isto.
2. **O botão «Adicionar fotos» está bloqueado** durante o lote (`loading` →
   `disabled`), ao lado de um texto que convida a ir fazer outra coisa.
3. **Não há como cancelar.** Nem tudo, nem um ficheiro. Não existe um único
   `AbortController` neste caminho.
4. **Não há estimativa de tempo**, e é o número que a pessoa quer: 5 m 20 s de
   silêncio com uma barra a saltar.
5. **A tarja preta «A carregar»** por cima de cada célula provisória é pesada
   para o que diz.
6. **Nada sobrevive ao separador.** Fechar a meio perde a fila.
7. **Um ficheiro interrompido recomeça do zero.**
8. **Aviso de tamanho só do lado do servidor** (12 MiB), depois de a foto subir.

## O que isto quer dizer para o plano

Como o cano está saturado a 99 %, a ordem de importância é:

1. **Menos bytes.** É o único caminho para menos tempo.
2. **Directo ao Storage.** Não poupa bytes de subida (é o mesmo cano), mas tira
   o salto extra, o limite de 4,5 MB de corpo, o tecto de 60 s de execução e o
   custo da função. É correcção de arquitectura, não de velocidade.
3. **A interface.** Cancelar, bytes na barra, estimativa, fila aberta — não
   tornam o carregamento mais rápido, tornam-no **suportável**, que é metade da
   queixa original.

### AVIF: medido, e não dá

A missão pede AVIF com WebP como alternativa. **Este navegador não sabe encodar
AVIF num canvas** — e, pior, não o diz: `convertToBlob({ type: "image/avif" })`
devolve **PNG** em silêncio.

| Formato pedido | Devolvido | Bytes |
| --- | --- | ---: |
| `image/avif` q0.60 | **`image/png`** | 6,98 MB |
| `image/avif` q0.45 | **`image/png`** | 6,98 MB |
| `image/webp` q0.80 | `image/webp` | 1,11 MB |
| `image/jpeg` q0.90 | `image/jpeg` | 1,53 MB |

Enviar «AVIF» sem verificar o tipo devolvido carregaria **PNG de 7 MB** — pior do
que o ficheiro original. Qualquer implementação tem de confirmar o `type` do
`Blob` que recebe, e não o que pediu.

Nas fotografias reais deste lote, a 2200 px:

| Codificação | Por foto | 49 fotos |
| --- | ---: | ---: |
| JPEG q90 (o de hoje) | 893 KiB | 42,7 MiB |
| WebP q80 | 441 KiB | 21,1 MiB |
| **WebP q72** | **342 KiB** | **16,4 MiB** |
| WebP q65 | 313 KiB | 15,0 MiB |

**O WebP dá ~2,6× menos bytes com a mesma leitura à vista.** É o caminho.

### Uma tensão que é preciso dizer agora

Os dois alvos da validação não cabem os dois, com este cano:

- **≥ 90 % menos bytes** que o original: 28,3 → ~11 MiB. Alcançável com WebP.
- **≥ 70 % menos tempo**: 320 s → ≤ 96 s. A 750 kbit/s, 96 s são **~8,8 MiB** no
  total, ou **184 KiB por foto** — abaixo do WebP q65, e portanto com perda
  visível numa capa impressa em grande (é por isso que a capa está hoje a
  2200 px q0.9, com a medição de PSNR escrita no `image-prep.ts`).

O que se pode prometer sem estragar o produto: **~11 MiB (96 % menos bytes) e
~130 s (59 % menos tempo)**. Chegar aos 70 % exige degradar a capa impressa, e
essa é uma decisão de negócio, não de engenharia — fica escrita aqui em vez de
ser tomada em silêncio dentro de um `quality: 0.5`.
