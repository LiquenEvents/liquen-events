# Os CSV de importação

Gerados por `node scripts/gen-ads.mjs 50` (50 = orçamento mensal em euros).
Não editar à mão: a próxima geração apaga as alterações. Editar
`src/lib/ads/polos.ts` ou `src/lib/ads/campanhas.ts` e voltar a gerar.

## Ordem de importação — é obrigatória

No Google Ads Editor: **Conta → Importar → Do ficheiro**.

| # | Ficheiro | O que cria |
|---|---|---|
| 1 | `1-campanhas.csv` | As campanhas, com orçamento, segmentação e idioma |
| 2 | `2-grupos.csv` | Os grupos de anúncios |
| 3 | `3-keywords.csv` | As keywords, com correspondência e URL final |
| 4 | `4-anuncios.csv` | Os anúncios responsivos (15 títulos, 4 descrições) |
| 5 | `5-negativas.csv` | As negativas, por campanha |
| 6 | `6-sitelinks.csv` | Os sitelinks |

Um grupo não pode ser criado antes da campanha dele, e o Editor **não reordena**.

São ficheiros separados de propósito: quando uma linha está mal, o Editor
recusa o lote inteiro e não diz qual. Assim o erro fica confinado.

## Antes de activar seja o que for

**TODAS as campanhas são importadas em PAUSA.** É deliberado — uma importação
que começa a gastar no segundo em que acaba não dá hipótese de conferir nada.

Conferir, por esta ordem:

1. **A segmentação geográfica.** É o erro que mais dinheiro custa e o mais fácil
   de detectar em trinta segundos.
2. **O modo de localização.** Campanhas PT: *presença*. Campanhas EN:
   *presença ou interesse*. Se estiver trocado, a conta compra exactamente as
   pessoas erradas dos dois lados.
3. **Os URL finais.** Abrir um de cada grupo e confirmar que a página carrega.
4. **O orçamento diário.** Somar e confirmar que dá os 50 €/mês.

## Os outros ficheiros

- **`5b-lista-partilhada.txt`** — as 174 negativas prontas a colar numa **lista
  de exclusão partilhada** (Ferramentas → Listas de exclusão de palavras-chave).
  É a forma correcta: uma lista aplicada à conta, em vez de negativas repetidas
  campanha a campanha. O `5-negativas.csv` fica como alternativa para quem
  prefira tê-las por campanha.

- **`keywords-seed.csv`** — 293 termos, um por linha, para colar no **Keyword
  Planner** (Ferramentas → Planeador de palavras-chave → Obter volume de
  pesquisa). É a única forma honesta de obter volumes e CPCs reais; ver
  `../mercado.md`.

## Uma advertência sobre os cabeçalhos

Os nomes das colunas do Ads Editor dependem do **idioma** da aplicação. Estes
ficheiros usam os cabeçalhos ingleses. Se o Editor estiver em português, ou se
muda o idioma antes de importar (Tools → Settings → Language), ou o Editor pede
para mapear as colunas à mão — funciona na mesma, dá é mais trabalho.

## As localizações vão por nome, não por ID

Os IDs de critério geográfico da Google publicam-se num CSV em
developers.google.com que o ambiente onde isto foi gerado não conseguiu
descarregar. **Inventar IDs seria pior do que não os pôr**: um ID errado
segmenta silenciosamente a região errada, e ninguém repara durante meses.

O Editor resolve os nomes ao importar e assinala os ambíguos, o que é o
comportamento seguro. É mais uma razão para o ponto 1 da lista de verificação.
