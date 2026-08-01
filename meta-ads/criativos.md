# Criativos — dez conceitos para casamentos

Dez anúncios para o Instagram e o Facebook. Cada um traz: o gancho dos três
primeiros segundos, o guião em quatro tempos, o texto, o título, o botão, e a
página para onde aponta.

---

## Antes de tudo: o que decide se um anúncio funciona

**Os três primeiros segundos, sem som.** A pessoa está a fazer scroll com o
telemóvel na vertical e o som desligado. Se o primeiro fotograma não a fizer
parar, nada do resto é visto. Por isso cada conceito abaixo começa pelo que se
vê no fotograma um, não pela ideia bonita.

**A página tem de continuar o anúncio.** A fotografia de capa da variante é a
MESMA imagem que o anúncio mostrou. Se o anúncio for um vídeo, o fotograma
final tem de ser a fotografia da capa. Quebra de continuidade visual é a
primeira causa de ressalto em tráfego social, e nenhuma optimização de
velocidade a compensa.

**Tom.** Contido, editorial. Sem exclamações, sem "o dia mais feliz da vossa
vida", sem emojis no texto principal (no botão nunca). O que separa esta marca
da concorrência é dizer coisas concretas — vento, chão, electricidade, horas de
sol — onde os outros dizem adjectivos.

---

## Especificações técnicas

### 9:16 — Reels e Stories

| | |
| --- | --- |
| dimensões | **1080 × 1920 px** |
| proporção | 9:16 |
| duração | 6 a 15 s (o ideal é **8 a 10**; abaixo de 6 s o Reels repete e nota-se) |
| formato | MP4, H.264, som AAC |
| taxa | 30 fps |
| tamanho | até 4 GB, mas manda **abaixo de 15 MB** — o carregamento no telemóvel de quem vê é o que decide |
| som | tem de existir na peça, mas o anúncio TEM de funcionar sem ele |
| legendas | queimadas na imagem, sempre |

**Zonas seguras (9:16).** Nada de texto nem logótipo:

- **topo: 250 px** — a fotografia de perfil, o nome da conta e o "Patrocinado"
- **fundo: 420 px** — a legenda, o botão de acção e os ícones laterais
- **direita: 120 px** — a coluna de gostos, comentários e partilhas

Sobra uma faixa central de **1080 × 1250 px**. Todo o texto vive aí.

### 4:5 — feed

| | |
| --- | --- |
| dimensões | **1080 × 1350 px** |
| proporção | 4:5 |
| duração (vídeo) | 6 a 15 s |
| imagem estática | JPG ou PNG, até 30 MB |

**Zonas seguras (4:5).** O feed corta pouco, mas o texto do anúncio aparece por
baixo e come as duas primeiras linhas com um "ver mais". Deixa **80 px** de
margem em toda a volta e não ponhas informação essencial nos 120 px de baixo.

### Texto, em ambos os formatos

| campo | limite prático | onde corta |
| --- | ---: | --- |
| texto principal | **125 caracteres** | além disso vira "ver mais" e quase ninguém abre |
| título | **27 caracteres** | corta com reticências no telemóvel |
| descrição do link | 27 caracteres | muitas colocações nem a mostram |

---

## As peças que já existem, prontas a publicar

`meta-ads/criativos/` — **22 ficheiros**, gerados a partir das fotografias
dela e dos ganchos do catálogo:

```
<variante>-<gancho>-916.jpg    1080x1920    Reels e Stories
<variante>-<gancho>-45.jpg     1080x1350    feed
```

Cinco variantes × dois ganchos × dois formatos, mais duas versões `-guia` com
as zonas tapadas pela app desenhadas a vermelho, para se conferir o
enquadramento. **As `-guia` são para ver, não para publicar.**

Para as refazer depois de mexer nos ganchos ou nas capas:

```
npm run build && npx next start -p 3131 &
node scripts/gen-criativos.mjs http://127.0.0.1:3131
```

**Duas decisões de composição que estão lá dentro, e porquê.** O texto é
desenhado nas faces da marca (Inter e Playfair), e por isso o gerador abre uma
página real do sítio e desenha lá dentro em vez de compor a imagem com o
`sharp` — não há ficheiro de tipografia no repositório para embutir, e esta
máquina só tem DejaVu. E no formato 9:16 a fotografia leva uma ampliação de
1,32 com origem em baixo: uma fotografia em paisagem cortada para vertical
mostra a altura toda, o casamento está sempre na metade de baixo do
enquadramento, e a metade de baixo do story é exactamente a que a app tapa.
Sem a ampliação, a faixa visível ficava com céu e telhado.

## ⚠ O que é preciso filmar (não existe ainda)

Hoje o repositório **não tem um único ficheiro de vídeo**
(`find public -name "*.mp4" -o -name "*.webm"` devolve zero). Os dez conceitos
abaixo estão escritos para serem produzidos; sete deles funcionam com
fotografia que já existe (marcados **[foto]**), três precisam mesmo de filmagem
nova (**[filmar]**).

O componente que põe o vídeo em ciclo na landing page já está escrito e testado
(`src/components/meta/VideoCiclo.tsx`), e nenhuma variante o usa — porque não se
aponta um `<video>` a um ficheiro que não existe. Assim que houver material,
preenche o campo `video` da variante em `src/lib/meta/variantes.ts`.

---

## C01 — "A mesa antes de alguém se sentar" [foto]

- **Formato:** 9:16 · **Zona:** Comporta · **Página:** `/s/comporta`
- **Gancho (0–3 s):** a mesa posta, vazia, com o sol rasante a atravessar os
  copos. Nada se mexe. O texto entra a meio: *"Ninguém se sentou ainda."*
- **Guião:**
  1. plano largo da mesa vazia, luz de fim de tarde
  2. detalhe: a flor, a loiça, a sombra da vegetação no linho
  3. plano largo outra vez, agora com as pessoas a chegar
  4. cartão final: a fotografia da capa da página + "Líquen Events"
- **Texto:** Uma mesa na Comporta pede sombra a horas certas e flor que aguente o sal. Fazemos as duas contas antes de desenhar.
- **Título:** Casamentos na Comporta
- **CTA:** Saber mais

**EN** — *Texto:* A table in Comporta needs shade at the right hour and flowers that survive the salt. We do both sums before we design. · *Título:* Weddings in Comporta

---

## C02 — "A montagem em três horas" [filmar]

- **Formato:** 9:16 · **Zona:** nacional (remarketing) · **Página:** `/s/comporta`
- **Gancho:** um espaço vazio ao amanhecer, e o contador "06:12" no canto. Em
  três segundos já se vê a primeira estrutura a subir.
- **Guião:**
  1. espaço vazio, 06:12
  2. aceleração: estruturas, mesas, têxteis a aparecerem
  3. 16:40, tudo montado, ninguém ainda
  4. cartão final
- **Texto:** Do chão vazio à mesa posta. É isto que se contrata quando se contrata produção.
- **Título:** Montamos na véspera
- **CTA:** Falar connosco

**EN** — *Texto:* From bare ground to a set table. This is what you are buying when you buy production. · *Título:* We build the day before

---

## C03 — "Espaço a mais, sombra a menos" [foto]

- **Formato:** 9:16 · **Zona:** Alentejo · **Página:** `/s/alentejo`
- **Gancho:** plano de drone de uma herdade, a sombra de uma azinheira a
  atravessar o enquadramento. Texto: *"Aqui a sombra decide as horas."*
- **Guião:**
  1. a herdade de cima, sol alto
  2. a mesma, ao fim da tarde, com a sombra já longa
  3. as pessoas debaixo da sombra
  4. cartão final
- **Texto:** Uma herdade dá espaço a mais e sombra a menos. As duas coisas decidem onde se põem as pessoas.
- **Título:** Casamentos no Alentejo
- **CTA:** Saber mais

**EN** — *Texto:* An estate gives you too much space and too little shade. Both decide where the people go. · *Título:* Weddings in the Alentejo

---

## C04 — "Sessenta ou trezentos" [foto]

- **Formato:** 4:5 · **Zona:** Alentejo · **Página:** `/s/alentejo`
- **Gancho:** duas fotografias lado a lado no mesmo fotograma — uma mesa de
  sessenta e um jantar de trezentos, do mesmo ângulo.
- **Guião:**
  1. as duas escalas lado a lado
  2. detalhe da pequena
  3. detalhe da grande
  4. cartão final
- **Texto:** De sessenta convidados a trezentos, com a mesma equipa e o mesmo material.
- **Título:** Qualquer escala
- **CTA:** Pedir orçamento

**EN** — *Texto:* From sixty guests to three hundred, with the same team and the same stock. · *Título:* Any scale

---

## C05 — "A vinte minutos de casa" [foto]

- **Formato:** 4:5 · **Zona:** Lisboa · **Página:** `/s/lisboa`
- **Gancho:** uma quinta em Sintra vista da entrada, com a neblina da manhã.
  Texto: *"Isto fica a vinte minutos de Lisboa."*
- **Guião:**
  1. a entrada da quinta
  2. o espaço do jantar montado
  3. detalhe floral
  4. cartão final
- **Texto:** Uma quinta a vinte minutos de casa, montada como se fosse longe de tudo.
- **Título:** Casamentos em Lisboa
- **CTA:** Saber mais

**EN** — *Texto:* A venue twenty minutes from home, built as though it were miles from anywhere. · *Título:* Weddings near Lisbon

---

## C06 — "O que não aparece nas fotografias" [filmar]

- **Formato:** 9:16 · **Zona:** nacional · **Página:** `/s/alentejo`
- **Gancho:** um cabo eléctrico a ser enterrado, em grande plano. Texto:
  *"Isto nunca aparece nas fotografias."*
- **Guião:**
  1. o cabo, o gerador, o nivelamento do chão
  2. a estrutura a assentar direita sobre terra batida
  3. a mesma zona, à noite, com as luzes acesas
  4. cartão final
- **Texto:** Um casamento no campo tem duas contas que não aparecem nas fotografias: a electricidade e o chão.
- **Título:** A parte que ninguém vê
- **CTA:** Falar connosco

**EN** — *Texto:* A countryside wedding has two costs that never show in the photographs: power and ground. · *Título:* The part nobody sees

---

## C07 — "O jantar começa quando o calor acaba" [foto]

- **Formato:** 9:16 · **Zona:** Algarve · **Página:** `/s/algarve`
- **Gancho:** o sol a bater a pique numa mesa vazia, e o mesmo enquadramento
  três segundos depois com o sol já baixo.
- **Guião:**
  1. sol alto, sombra curta
  2. a mesma mesa às sete
  3. o jantar a começar
  4. cartão final
- **Texto:** No Algarve, o jantar começa quando o calor acaba. Tudo se desenha a partir dessa hora.
- **Título:** Casamentos no Algarve
- **CTA:** Saber mais

**EN** — *Texto:* In the Algarve, dinner starts when the heat stops. Everything is designed around that hour. · *Título:* Weddings in the Algarve

---

## C08 — "A flor que aguenta seis horas" [filmar]

- **Formato:** 9:16 · **Zona:** nacional · **Página:** `/s/algarve`
- **Gancho:** mãos a cortar caules dentro de água, em grande plano, com o
  contador "07:40" no canto.
- **Guião:**
  1. a preparação da flor, de manhã
  2. a montagem, ao meio-dia
  3. a mesma flor às oito da noite, intacta
  4. cartão final
- **Texto:** Flor escolhida para aguentar seis horas de calor sem murchar à vista de toda a gente.
- **Título:** Flor que aguenta o dia
- **CTA:** Pedir orçamento

**EN** — *Texto:* Flowers chosen to hold six hours of heat without wilting in front of everyone. · *Título:* Flowers that hold

---

## C09 — "Viram o espaço uma vez. Alguns nem isso." [foto]

- **Formato:** 9:16 · **Zona:** internacional (EN) · **Página:** `/en/s/portugal`
- **Gancho:** o espaço vazio, e por cima o texto *"They saw this once."*
- **Guião:**
  1. o espaço vazio
  2. o documento de conceito no ecrã, com a planta e a paleta
  3. o mesmo espaço montado, no dia
  4. cartão final
- **Texto (EN):** Most of our couples see the venue once. Some not at all. Quoted in English, built by the people who designed it.
- **Título (EN):** Marrying in Portugal
- **CTA:** Learn more

**PT** (não servida — a página é só em inglês; fica escrita para o caso de a
decisão mudar): A maior parte dos nossos casais estrangeiros vê o espaço uma vez. Alguns nem isso.

---

## C10 — "Para quem já organiza casamentos" [foto]

- **Formato:** 4:5 · **Zona:** nacional, wedding planners · **Página:** `/s/lisboa`
- **Gancho:** uma planta técnica desenhada à mão sobre a fotografia do espaço
  montado.
- **Guião:**
  1. a planta técnica
  2. a sobreposição com o resultado
  3. detalhe de execução
  4. cartão final
- **Texto:** Trabalhamos com wedding planners como fornecedor de design e produção, com planta técnica e mapa de montagem.
- **Título:** Para wedding planners
- **CTA:** Falar connosco

**EN** — *Texto:* We work with wedding planners as a design and production supplier, with technical drawings and a build schedule. · *Título:* For wedding planners

---

## Mapa rápido: conceito → página → campanha

| conceito | formato | página | `utm_campaign` |
| --- | --- | --- | --- |
| C01 | 9:16 | `/s/comporta` | `frio-noivos-comporta` |
| C02 | 9:16 | `/s/comporta` | `retarget-visitantes-nacional` |
| C03 | 9:16 | `/s/alentejo` | `frio-noivos-alentejo` |
| C04 | 4:5 | `/s/alentejo` | `retarget-visitantes-nacional` |
| C05 | 4:5 | `/s/lisboa` | `frio-noivos-lisboa` |
| C06 | 9:16 | `/s/alentejo` | `frio-noivos-alentejo` |
| C07 | 9:16 | `/s/algarve` | `frio-noivos-algarve` |
| C08 | 9:16 | `/s/algarve` | `similar-leads-nacional` |
| C09 | 9:16 | `/en/s/portugal` | `frio-noivos-intl` |
| C10 | 4:5 | `/s/lisboa` | `frio-planners-nacional` |

Cada conceito tem de ser servido nas DUAS versões de página (gancho A e gancho
B) — ver `UTM-PLAN.md`. É o teste A/B, e sem ele não há como saber qual das
duas promessas convence.
