# Meta Ads — relatório final e plano de arranque

O que foi construído, o que foi medido, e o que tens de fazer a seguir.

Tu não precisas de tocar em código. Precisas de configurar duas coisas no
Gestor de Anúncios e de carregar quatro variáveis de ambiente na Vercel.

---

## 1. O que tens de fazer, por ordem

### Passo 1 — as quatro variáveis (10 minutos)

Em **Vercel → Settings → Environment Variables**:

| variável | onde a vais buscar | obrigatória? |
| --- | --- | --- |
| `NEXT_PUBLIC_META_PIXEL_ID` | Events Manager → o teu conjunto de dados → o ID em cima | sim, para o pixel |
| `META_DATASET_ID` | o mesmo número | sim, para a CAPI |
| `META_CAPI_ACCESS_TOKEN` | Events Manager → Definições → Conversions API → Gerar token de acesso | sim, para a CAPI |
| `META_CAPI_TEST_CODE` | Events Manager → Testar eventos → o código `TEST12345` | **só enquanto testas** |

**Enquanto nenhuma delas estiver definida, nada disto faz nada.** Sem pixel não
há script, sem token não há socket aberto, e a política de segurança do site
não abre um único host novo. Podes carregar o código hoje e configurar a conta
para a semana.

**O `META_CAPI_TEST_CODE` tem de ser APAGADO depois de testares.** Enquanto
estiver lá, os eventos vão para o separador de testes e **não contam para a
optimização** — a conta parece estar a medir e não está.

### Passo 2 — verificar que chega lá (15 minutos)

1. Com o `META_CAPI_TEST_CODE` definido, abre `liquen-events.com/s/comporta`
   no telemóvel.
2. **Aceita** os cookies (sem isso não sai nada, e é de propósito).
3. Em Events Manager → Testar eventos, tens de ver `PageView`.
4. Toca no formulário → tem de aparecer `InitiateCheckout`.
5. Submete → `Lead`, e **uma vez só**. Se aparecer duas vezes, a deduplicação
   está partida e é preciso avisar-me.
6. Toca no botão de WhatsApp → `Contact`.
7. Apaga o `META_CAPI_TEST_CODE`.

O ponto 5 é o mais importante da lista. Contar a dobrar faz o custo por
resultado aparecer a metade, e o algoritmo passa a acreditar que a campanha
rende o dobro do que rende.

### Passo 3 — criar os públicos

Segue `publicos.md`, pela ordem em que lá estão. Os dois primeiros
(retargeting e semelhantes) só ficam úteis passadas duas a três semanas de
tráfego — o público está vazio no dia um.

### Passo 4 — filmar o que falta

`criativos.md` traz dez conceitos. **Sete funcionam com fotografia que já
existe**; três precisam de filmagem nova (C02, C06, C08). Começa pelos que não
precisam.

### Passo 5 — a rotina semanal, que não é opcional

**Uma vez por semana**, abre o back office → **Estatísticas**. No fim da
página está «Casamentos fechados · Meta»: diz quantos há por enviar, quanto
valem, e quantos dias faltam antes de a Meta deixar de os aceitar. Se houver
algum, carrega em **Enviar à Meta** e confirma.

(O relatório em texto continua em `liquen-events.com/api/meta/fechos`, para
quem quiser ver os detalhes de tudo o que ficou de fora.)

Isto **não é** como as conversões offline do Google, que se podiam acumular e
carregar uma vez por mês. **A Meta recusa eventos de fecho com mais de sete
dias, e recusa-os em silêncio.** Um casamento que feche numa segunda-feira e só
seja enviado no fim do mês não conta para nada, e a conta fica a optimizar para
formulários preenchidos em vez de casamentos fechados — que é o erro que este
trabalho todo existe para evitar.

---

## 2. Plano de arranque, com números

**Orçamento: 50 €/mês no total, Google e Meta juntos.**

A repartição que proponho, e a razão:

| mês | Google | Meta | porquê |
| ---: | ---: | ---: | --- |
| 1 | 50 € | 0 € | a campanha do Alentejo no Google já está a aprender. Cortá-la a meio para financiar um arranque na Meta é perder as duas |
| 2 | 30 € | 20 € | a Meta entra com **um** conjunto de anúncios, prospecção fria na Comporta |
| 3 | 25 € | 25 € | entra o retargeting, que a esta altura já tem público |
| 4+ | conforme o que fechar | | ver abaixo |

**20 € por mês são cerca de 0,66 € por dia.** É pouco, e é preciso ser honesta
sobre o que isso compra: **impressões suficientes para testar criativo, não
para gerar volume.** O objectivo do mês 2 não é fechar casamentos — é descobrir
qual dos ganchos e qual dos formatos faz parar o dedo.

### Que criativos testar primeiro

Semana 1 e 2, um conjunto só (`frio-noivos-comporta`), dois anúncios:

| anúncio | criativo | página | `utm_content` |
| --- | --- | --- | --- |
| A | C01, 9:16 | `/s/comporta` | `c01-916-a` |
| B | C01, 9:16, outro gancho | `/s/comporta-b` | `c01-916-b` |

**Mesmo criativo, ganchos diferentes, páginas diferentes.** É a única forma de
saber se o que muda o resultado é a promessa ou a imagem. Se trocares as duas
coisas ao mesmo tempo, o resultado não te diz nada.

Semanas 3 e 4: mantém o gancho vencedor, troca o criativo (C03 no Alentejo).

### Quando é que se decide

| ao fim de | olha para | e decide |
| --- | --- | --- |
| 7 dias | retenção do vídeo aos 3 s | se estiver abaixo de 25%, o problema é o primeiro fotograma. Muda-o antes de mudar mais nada |
| 14 dias | custo por `Contact` | fica o gancho mais barato; o outro pausa |
| 30 dias | nº de `Lead` | se for zero, o problema não é o anúncio — é a oferta ou a página. Fala comigo antes de gastar mais |
| 90 dias | casamentos fechados | é o único número que importa, e é o que a rota `/api/meta/fechos` devolve à Meta |

---

## 3. O que foi construído

### Páginas (dez URL novos)

`/s/comporta`, `/s/alentejo`, `/s/lisboa`, `/s/algarve` e `/en/s/portugal`,
cada uma com a sua versão de gancho B (`-b`). São páginas **próprias**, não as
do Google com um parâmetro: os números de uma fonte nunca contaminam os da
outra.

Desenhadas a 390 px primeiro, em coluna única:

1. **capa a ecrã inteiro** — a fotografia do anúncio, uma frase, um botão
2. **prova social imediatamente a seguir** — a avaliação e uma frase concreta
3. **três linhas do que fazemos** + quatro fotografias
4. **espaços da zona**
5. **formulário de quatro campos**

Com **barra fixa no fundo** (WhatsApp + formulário), sempre visível. Sem menu,
sem rodapé do sítio, sem transições. `noindex`, para não competirem com o site
na pesquisa orgânica.

### Medição

- **Pixel** no cliente, só com consentimento
- **Conversions API** no servidor, com `event_id` partilhado (a deduplicação
  que impede contar tudo a dobrar)
- **`fbclid` → `fbc`** no formato documentado, guardado 90 dias, primeiro toque
- **Casamentos fechados** devolvidos à Meta com o valor **sem IVA**
- **Eventos:** `PageView`, `ViewContent`, `InitiateCheckout`, `Lead`,
  `Contact`, `Purchase`

### Documentos

| ficheiro | para quê |
| --- | --- |
| `/LP-AUDIT.md` | a auditoria das páginas que já existiam, com números medidos |
| `/UTM-PLAN.md` | os URL dos anúncios, para não os inventares |
| `/meta-ads/criativos.md` | os dez conceitos e as especificações técnicas |
| `/meta-ads/publicos.md` | os públicos, as exclusões e a ordem de abertura |

---

## 4. O que foi medido

Condições: Chromium com a cadeia de agente real do Instagram e do Facebook,
ecrã de 390 × 844, rede a 1,6 Mbps com 150 ms de latência, CPU a um quarto.
Sessenta pares de página × perfil. Corre com `node scripts/medir-social.mjs`.

| | páginas do Google (antes) | variantes sociais |
| --- | ---: | ---: |
| LCP, sem o banner de cookies | 1864 – 2472 ms | **1344 – 1432 ms** |
| LCP, com o banner (visita real) | — | **3488 – 3908 ms** |
| bytes totais | 843 – 1858 KB | **630 – 853 KB** |
| elemento do LCP, sem banner | a fotografia | **o `<h1>`** |
| elemento do LCP, com banner | — | **o `<p>` do banner** |

**Alvo pedido: abaixo de 2500 ms no browser interno. NÃO cumprido na visita
real** — e a versão anterior deste documento dizia que sim, porque media o
caso sem banner. Correcção de 01/08/2026.

A página em si é rápida: sem o banner desenhado, o elemento de LCP é o `<h1>` e
ele pinta em 1,4 s. O que empurra o número para 3,6 s é o **banner de cookies**,
que só se desenha depois de o JavaScript hidratar e cujo parágrafo é maior do
que o título. Quem chega de um anúncio nunca esteve no sítio, portanto vê-o
sempre.

A correcção é desenhar o banner no servidor, guardando a escolha num cookie em
vez do `localStorage`. Toca em consentimento, é matéria legal, e por isso está
**por decidir**. O diagnóstico completo está em `LP-AUDIT.md`, secção "O banner
de cookies manda no LCP".

Nada parte em nenhum dos seis perfis, incluindo com o armazenamento bloqueado e
sem service worker. Dezasseis testes de Playwright cobrem o fluxo completo de
conversão dentro do agente do Instagram e do Facebook.

### Um defeito encontrado a medir, que já lá estava

O pré-aquecimento de capas (`HeroWarm`) descarregava as capas das **seis**
páginas institucionais em cima de cada landing page paga: 623 KB dos 1299 KB da
`/casamentos/estilo/boho`. Era o pior caso possível, porque nenhuma rota
`/casamentos/` estava no seu mapa e portanto nenhuma era saltada. Corrigido: a
boho passou de 1858 para 1104 KB, e a `/casamentos/alentejo` de 856 para 654 KB.

**Isto melhorou as páginas do Google, não as da Meta.** Estava lá desde o
primeiro dia.

---

## 5. Onde eu me enganei, e o que corrigi

Três coisas, e ficam aqui porque a alternativa era deixá-las escritas como se
fossem verdade.

**1. Disse que o esqueleto do sítio eram os 207 KB de JavaScript.** Construí a
separação em grupos de rotas com esse argumento. Depois medi: a página **sem**
esqueleto descarrega 225 KB, a que o tem descarrega 212 KB. O esqueleto são
9 KB; os 207 KB são o React e o encaminhador do Next, que qualquer página
paga. A separação fica — o que ela dá é o menu que deixa de existir e o
trabalho que deixa de acontecer, não bytes. Está corrigido no código e em
`LP-AUDIT.md`.

**2. O meu guião de medição reportou um erro por página** no perfil sem service
worker. O erro era da simulação, não do site.

**3. O mesmo guião reportou "0 KB de JavaScript"** em todas as páginas, porque
contava um cabeçalho que o Next não envia. Corrigido para contar os bytes que
passam mesmo pelo fio.

---

## 6. O que fica por fazer, e é decisão tua

| # | o quê | porquê não o fiz |
| --- | --- | --- |
| 1 | **Filmar C02, C06 e C08** | não há vídeo nenhum no repositório. O componente que os põe em ciclo está escrito e testado; nenhuma variante o usa, porque não se aponta um `<video>` a um ficheiro que não existe |
| 2 | **Trocar as fotografias por fotografias REAIS de cada zona** | o repositório não guarda a região de cada fotografia. Hoje as das variantes vêm distribuídas do conjunto geral. É a alteração isolada que mais converte: um casal que vai casar no Douro reconhece o Douro |
| 3 | **O banner de cookies continua a mandar no LCP de `/clientes`** | é matéria de consentimento, e já to disse antes. Não mexo sem tu dizeres |
| 4 | **Abrir o público internacional** | com 50 €/mês o clique em Londres custa demasiado para se aprender fosse o que for. A página existe e está pronta |

---

## 7. Uma coisa que tens de saber sobre o consentimento

**Sem consentimento não sai nada para a Meta.** Nem pixel, nem Conversions API.

Foi-me pedido que a CAPI "continuasse a enviar o que fosse legítimo enviar", e
a resposta franca é que, sem consentimento, não há nada de útil que seja
legítimo: o `fbp` e o `fbc` derivam de cookies, e o email e o telefone
continuam a identificar a pessoa mesmo cifrados — o objectivo declarado do
envio é encontrá-la na Meta. A base legal do formulário (diligência
pré-contratual) cobre **responder ao teu pedido de orçamento**; não cobre
mandar os dados dessa pessoa para a Meta para melhorar a segmentação.

O valor da Conversions API está inteiro para quem **aceitou**, e é grande: o
envio pelo servidor não é apanhado pelo bloqueio do Safari, nem por
bloqueadores de anúncios, nem pela expiração de cookies do iOS. Em Portugal,
com a fatia de iPhone que este mercado tem, é tipicamente a diferença entre
veres metade das conversões e veres quase todas — **de quem aceitou**.

Há um interruptor no código (`ENVIAR_SEM_CONSENTIMENTO`, em
`src/lib/meta/consentimento.ts`), **desligado**. Não está lá para ser ligado
sem pensar: está lá para a decisão ser visível e ter dono, se algum dia tiveres
aconselhamento jurídico próprio que diga o contrário.

O texto do banner de cookies passou a nomear a Meta. Foi a única alteração que
o consentimento precisou — usa a mesma escolha que já governa a Google, porque
dois banners acabariam, mais dia menos dia, com uma pessoa que recusou num a
aparecer como tendo aceitado no outro.
