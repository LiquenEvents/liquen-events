# Fazer proposta — o depois, medido

Continuação de `PROPOSTA-BEFORE.md`, com a mesma régua:

```
npm run dev                                             # noutro terminal
node scripts/medir-estudio-propostas.mjs                # o estúdio recém-aberto
node scripts/medir-estudio-propostas.mjs --completa     # a proposta da Catarina, construída
node scripts/medir-estudio-propostas.mjs --cores        # as regras do DESIGN-TOKENS.md
```

Portátil 1440×900, vista **Fazer proposta**, pedido sem pontos de decoração
escolhidos (para a linha de partida não vir já preenchida).

## O caso comum: criar a partir de outra proposta

É aqui que a missão se ganha ou se perde. **Antes este caminho não existia** —
uma variação de uma proposta anterior fazia-se do zero, com o mesmo custo de
qualquer outra.

| | antes | depois |
|---|---:|---:|
| cliques | 16 | **2** |
| campos escritos à mão | 23 | **0** |
| campos a confirmar | — | 5, marcados a laranja |

Os dois cliques são abrir «Criar a partir de…» e escolher a proposta. Vêm os
serviços, os mood boards, as linhas de orçamento, as condições, o faseamento,
a validade, o modo de IVA e a taxa. Não vêm o nome, a data, o local, os
convidados, a cerimónia, a hora nem o valor — esses passam a ser os do pedido
novo, ou ficam vazios, e ficam assinalados até ela lhes tocar.

Exercitado no browser de ponta a ponta e preso por um passeio Playwright
(`e2e/proposta-fluxos.spec.ts`), que verifica as duas metades: que o trabalho
vem todo, e que **em lado nenhum do ecrã sobra o casal anterior**.

## O estúdio recém-aberto

| | antes | depois |
|---|---:|---:|
| campos | 15 | 15 |
| botões | 17 | 26 |
| altura do conteúdo | 2246px | **1997px** |
| ecrãs de scroll | 2,5 | **2,22** |
| caixa de capa vazia | 391px | **96px** |

## A proposta completa (a da Catarina Martins)

| | antes | depois |
|---|---:|---:|
| campos | 37 | **42** |
| altura do conteúdo | 4986px | **4579px** |
| ecrãs de scroll | 5,54 | **5,09** |
| cliques para lá chegar | 16 | 16 |
| campos escritos à mão | 23 | 23 |

## O que estes números dizem, incluindo o que não é bom

**Construir do zero não ficou mais barato.** Os 16 cliques e os 23 campos são
os mesmos. Não os reduzi, e não vou fingir que sim: continuam a ser um clique
por grupo, por item, por mood board e por linha de orçamento, porque é isso
que montar uma proposta nova é. O que mudou nesse caminho foi a orientação (a
coluna diz o que falta), o espaço (menos meio ecrã de scroll) e a segurança
(desfazer, anular, e saber que ficou guardado).

**Os campos SUBIRAM de 37 para 42.** São os cinco preços por linha, e são uma
troca deliberada: cinco campos opcionais a mais em troca do total deixar de
poder discordar das linhas em silêncio. Ela escreve-os se quiser; a soma só
aparece quando há preços.

**Os botões subiram de 17 para 26.** Nove são navegação e avisos — as seis
secções da coluna lateral e as ligações do «falta para enviar» — mais «Criar a
partir de…», «Guardar como modelo» e os dois «De um modelo…». Não é ruído a
competir com o trabalho: nenhum deles muda o documento.

**As caixas de capa passaram de 391px para 96px cada.** O ganho bruto foi de
295px; ficaram 249px porque acrescentei 80px de folga por baixo do conteúdo
para a barra fixa deixar de tapar o último campo.

## O que a medição apanhou e nenhum teste via

Três defeitos de disposição só apareceram nas capturas de ecrã:

- `.bo-input` tem `width: 100%` escrito em CSS, que ganha a um `w-28` do
  Tailwind — o preço comia a linha e o nome ficava numa caixa de trinta pixels;
- `bg-background` **não existe** neste projecto (não há token `--background`),
  por isso a barra do fundo nunca teve fundo nenhum;
- e sem `z-index` os cartões das secções desenhavam-se por cima dela.

E dois erros meus na própria medição, ambos corrigidos no guião para não se
repetirem: contar o back office inteiro em vez do estúdio (53 campos), e medir
o estúdio embutido no dossier do pedido em vez do da vista certa (as capas
davam 222px em vez de 391px). O guião passou a verificar em que vista está
antes de medir, e a limpar o rascunho antes de construir — sem isso a segunda
passagem construía por cima da primeira e dava 59 campos e 8,4 ecrãs com toda
a confiança do mundo.

## O que ficou por fazer, e porquê

**O sinal com percentagem editável.** O 30/70 está enraizado na facturação em
cinco sítios (`/api/faturas`, `/api/faturas/[id]`, `/api/proposta`, o painel de
Faturas). Torná-lo editável só no estúdio recriava o problema das duas
verdades que foi resolvido no preço: a proposta dizia 40% e a factura saía a
30%. Tem de atravessar as facturas, e isso é uma alteração própria.

**A pesquisa de FOTOS na biblioteca.** A procura implementada é de temas (nome
e nota interna). Procurar fotos precisa de metadados por foto que hoje não
existem — depois de importadas, as fotos são identificadores sem nome nem
descrição. Precisa de uma decisão sobre etiquetar fotos, que é trabalho de
quem as arruma.

**Os preços por linha no PDF.** Está feito o caminho (b): os preços vivem só
do lado de dentro e o cliente continua a ver um total único, como nas propostas
reais. Se ela preferir (a) — preço por linha impresso —, é uma linha de
configuração e uma decisão de negócio.
