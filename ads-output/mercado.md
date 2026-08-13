# Fase 1 — Mercado

## O que é medido e o que não é

Antes de qualquer tabela, a separação que interessa:

| | Fonte | Confiança |
|---|---|---|
| Dimensão do mercado, sazonalidade, destination weddings | INE, Turismo de Portugal, imprensa do sector | **Publicada.** Citada abaixo com o ano |
| Nomes de espaços de casamento por região | casamentos.pt, zankyou.pt, sites dos espaços | **Verificada.** Recolhida em pesquisa, não de memória |
| Concorrentes por região | Sites e directórios públicos | **Verificada**, mas incompleta |
| **Volume de pesquisa por keyword** | — | **NÃO TENHO.** Ver abaixo |
| **Custo por clique por keyword** | — | **NÃO TENHO.** Ver abaixo |

### Porque é que não há volumes nem CPCs nesta tabela

Esses números vivem no **Keyword Planner da conta dela** e em mais lado nenhum.
Não há forma honesta de os obter de fora: os valores que circulam em
ferramentas de terceiros para o mercado português de casamentos são modelados,
não medidos, e para nichos deste tamanho erram por múltiplos.

Podia ter enchido uma coluna com estimativas plausíveis. Seria a pior coisa que
podia entregar: números que parecem dados e que ela usaria para decidir
orçamento.

**O que fiz em vez disso:** `csv/keywords-seed.csv` traz 300 e tal termos, um
por linha, prontos para colar no Keyword Planner (Ferramentas → Planeador de
palavras-chave → Obter volume de pesquisa). Cinco minutos, e passa a haver
números **dela**.

---

## O mercado, em números publicados

- **37 702 casamentos** em Portugal em 2025, mais 2,9% do que em 2024 (36 633).
  Fonte: INE.
- **Mais de 2 500 casamentos** em 2024 com **ambos os cônjuges estrangeiros** —
  e o Turismo de Portugal considera este número muito abaixo da dimensão real do
  mercado.
- **Mais de 160 milhões de euros por ano** gerados por casais estrangeiros que
  escolhem Portugal. Britânicos e irlandeses à frente, seguidos de brasileiros e
  indianos.
- O turismo de casamentos em Portugal gera **mais de 200 milhões de euros por
  ano**, puxado por Algarve, Alentejo e Douro.
- **Custo médio de uma cerimónia de casal estrangeiro: cerca de 30 000 €**,
  podendo chegar a 40 000–50 000 € nos Açores.
- A Madeira lançou em 2025 uma estratégia dedicada a captar este segmento,
  juntando-se ao Algarve e a Lisboa como destino estabelecido.
- Custo médio de um casamento em Portugal em 2026: cerca de **21 000 €**.

**A leitura que conta para a decisão:** o casal estrangeiro vale à volta de
**1,4 vezes** o casal português em ticket médio. É muito, mas não é o suficiente
para compensar um custo por clique várias vezes superior — que é a razão pela
qual o Reino Unido não é a primeira campanha a abrir com 50 €/mês.

## Sazonalidade

**Não pude medir a dela**, e é o que mais falta (ver `diagnostico.md`). O que
se sabe publicamente: o INE regista variações mensais e 2025 teve descidas em
Março, Abril, Junho e Agosto, com a maior subida em Janeiro. Isso descreve
variação homóloga, **não** a distribuição dos casamentos pelo ano, que é o que
serviria para calendarizar campanhas.

O que é conhecido do sector e que uso como moldura, com a etiqueta de moldura:

- Os casamentos concentram-se de **Maio a Setembro**, com pico em Junho,
  Julho e Setembro.
- **As pesquisas antecedem os casamentos em seis a doze meses.** Quem casa em
  Junho de 2027 anda a procurar fornecedores entre o Verão e o Outono de 2026.
- Consequência prática: **o pico de anunciar não é o pico de casar.** Anunciar
  em Julho para casamentos de Julho é chegar um ano atrasado.

**O que isto significa para 31 de Julho de 2026:** estamos exactamente na
janela em que os casais de 2027 estão a decidir fornecedores. É boa altura para
começar. Confirma-se com os dados dela ao fim de dois meses, cruzando a data do
pedido com a data do evento — os dois campos já existem no back office.

---

## Os polos, por oportunidade

Ordenados por onde o dinheiro rende mais primeiro, não alfabeticamente. A coluna
"concorrência" é qualitativa, a partir da densidade de fornecedores encontrada
nos directórios.

| # | Polo | Concorrência | Notas |
|---|---|---|---|
| 1 | **Alentejo e Comporta** | **Fraca** | Menos fornecedores dedicados. Base da equipa em Évora: sem custo de deslocação. Comporta puxa ticket alto |
| 2 | **Lisboa, Cascais, Sintra** | Muito forte | Maior volume doméstico. Muitos decoradores e planners estabelecidos |
| 3 | **Algarve** | Forte, mas internacional | Muitos fornecedores orientados a estrangeiros. Site bilingue é vantagem real |
| 4 | **Porto e Douro** | Forte e enraizada | Mercado grande, relações locais antigas. Difícil entrar de fora |
| 5 | **Minho e Braga** | **Muito forte** | Maior densidade de quintas do país, no triângulo Braga–Guimarães–Barcelos. Formato muito estabelecido e sensível a preço |
| 6 | **Coimbra e Centro** | Fraca | Mercado disperso, sem polo dominante. Pouca concorrência mas pouco volume |
| 7 | **Madeira** | Fraca | Pequeno, ticket alto, estratégia oficial de captação desde 2025. Logística de ilha |
| 8 | **Açores** | Muito fraca | O ticket médio mais alto do país segundo a imprensa do sector. Mercado minúsculo |

### Onde a concorrência é mais fraca

Foi pedido explicitamente. A resposta é **Alentejo, Centro e ilhas** — e apenas
uma delas serve para começar.

O Centro e as ilhas têm pouca concorrência *porque têm pouco volume*. Pouca
concorrência num mercado sem procura não é oportunidade: é um sítio onde se
gasta pouco e não acontece nada.

O **Alentejo** é o único onde a concorrência fraca coincide com procura real,
com ticket a subir (efeito Comporta) e com a vantagem de a equipa já lá estar.
É por isso que é a primeira e única campanha.

---

## Concorrência: o que encontrei

Directórios que dominam as pesquisas genéricas — e são o principal concorrente
de facto, porque ficam à frente nos resultados orgânicos e também compram
anúncios: **casamentos.pt**, **zankyou.pt**, **zaask.pt**, **noivos.pt**,
**espacosparaeventos.pt**.

Isto tem uma consequência para a estratégia: nas pesquisas nacionais genéricas
("decoração de casamento") compete-se contra agregadores com orçamentos de outra
ordem. É mais uma razão para o dinheiro ir primeiro para pesquisas **locais**,
onde os agregadores são mais fracos e onde uma página que nomeia a região ganha
relevância que eles não têm.

**Preços públicos:** praticamente nenhum concorrente de decoração publica
preços. Os que aparecem são de **espaços**, por pessoa (60 €/pessoa na Herdade
Vale Lameira, 80 €/pessoa na Quinta da Pureza). Não são comparáveis com
decoração, mas são úteis para dimensionar o orçamento total do casal.

---

## Keywords, agrupadas por intenção

A estrutura está em `src/lib/ads/campanhas.ts`; a lista completa expandida está
em `csv/3-keywords.csv` e a lista para o Planner em `csv/keywords-seed.csv`.

### (a) Intenção alta e local — já tem data e zona

`decoração de casamento {cidade}` · `decoração casamentos {cidade}` ·
`wedding designer {cidade}` · `empresa decoração casamentos {cidade}`

Expandido pelas cidades de cada polo. **É onde está o dinheiro** e é o único
grupo que arranca com 50 €/mês.

### (b) Espaços — a montante, ainda não escolheu decoração

`casamento {espaço}` · `decoração {espaço}`

Quem procura o nome de uma quinta ainda não anda à procura de decoração — está a
escolher onde casar. Vale a pena porque é barato (poucos licitam nestes termos)
e porque chega antes dos concorrentes. **O anúncio tem de falar do espaço
primeiro**, senão parece que respondeu a outra pergunta.

Espaços recolhidos por região, todos verificados em fontes públicas:

- **Alentejo:** Herdade Vale Lameira, Quinta do Louredo, Herdade da Valeira,
  Quinta do Cerrado, Herdade do Sabroso, Sublime Comporta, Quinta da Pureza
- **Lisboa/Sintra/Cascais:** Penha Longa Resort, Quinta dos Lobos, Quinta da
  Barreta, Quinta de São Francisco, Quinta dos Alfinetes, Quinta Marquês da
  Serra, Quinta Cascata dos Sonhos
- **Algarve:** Quinta dos Vales, Quinta Bonita, Quinta das Oliveiras, Monte do
  Serrinho, Quinta do Lago, Vila Vita Parc
- **Porto/Douro:** Quinta da Torrebella, Quinta dos Bambus, Quinta da
  Morgadinha, Quinta dos Românticos, Quinta de Santo António, Quinta de Mosteirô
- **Minho:** Quinta D'Ávila, Solar das Bouças, Quinta Vila Marita, Quinta de
  Sabroso, Quinta das Carpas, Quinta do Retiro, Quinta do Outeiro

> Listar um espaço **não** afirma parceria nem trabalho feito lá, e as páginas
> nunca o dizem. São o vocabulário de quem procura.

### (c) Estilos — decide a estética, muitas vezes sem data marcada

`casamento minimalista` · `casamento boho` · `casamento no campo` ·
`decoração casamento {estilo}`

Páginas próprias em `/casamentos/estilo/*`. **Não abrem com 50 €/mês**: são
tráfego mais barato mas muito mais longe da compra.

### (d) Wedding planners — público-alvo, não concorrente

`decoração para wedding planners` · `parceiro decoração casamentos` ·
`fornecedor decoração casamentos` · `empresa cenografia eventos`

Um planner que goste do trabalho traz vários casamentos por ano e o custo de o
conquistar paga-se uma vez. Por isso "wedding planner" **não** está nas
negativas, e há um grupo de anúncios dedicado com texto próprio.

### (e) Internacional em inglês

`destination wedding portugal` · `wedding decor portugal` ·
`portugal wedding styling` · `wedding designer portugal` ·
`wedding florist portugal` · `getting married in portugal` · e por região
(`wedding algarve portugal`, `alentejo wedding designer`, …)

Página própria em `/casamentos/destination`, que responde às cinco perguntas que
um casal estrangeiro faz de facto. Abre a partir dos 240 €/mês.
