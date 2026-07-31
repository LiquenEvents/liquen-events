# Fase 0 — Diagnóstico

## Não havia nada para diagnosticar

A pasta `/ads-data/` não existe neste repositório. Não há exports de termos de
pesquisa, de keywords, de campanhas, de anúncios nem de páginas de destino.

Digo-o já e sem rodeios porque a alternativa seria pior: escrever um capítulo
com estimativas apresentadas como se fossem análise. Um relatório que inventa
os números que devia ter medido é mais perigoso do que um relatório vazio,
porque parece útil.

## O que a ausência destes dados impede de saber

Não são detalhes. São as três perguntas mais valiosas de toda a operação, e
nenhuma delas se responde sem histórico:

### 1. Onde estava a ser queimado orçamento

Sem o relatório de **termos de pesquisa** não há forma de saber que pesquisas
reais compraram cliques. É o único sítio onde aparece a verdade sobre a
sobreposição entre campanhas, os termos irrelevantes e as keywords com custo e
zero conversões. As 174 negativas que entrego em `csv/5b-lista-partilhada.txt`
são construídas a partir do que se sabe do mercado, **não** do que aconteceu na
conta dela — são um bom ponto de partida e não substituem o primeiro relatório
de termos de pesquisa a sério.

### 2. A distância entre a primeira pesquisa e o pedido de orçamento

Esta é a mais importante das três, e é a que mais gente ignora. O ciclo de
compra de um casamento é longo: a pessoa pesquisa em Janeiro, anda a ver, e
pede orçamento em Março. Sem saber essa distância não se sabe:

- **quanto tempo esperar antes de julgar uma campanha.** Julgar ao fim de duas
  semanas um ciclo de compra de dez semanas é desligar campanhas que estavam a
  funcionar;
- **que janela de conversão configurar** no Google Ads;
- **quanto tempo o identificador do clique tem de sobreviver** no dispositivo.

Como não sabia, tomei a decisão conservadora e disse-o no código: o
identificador do clique é guardado **90 dias** (`src/lib/ads/click-id.ts`), que
é a janela por omissão da Google. Ao fim de dois ou três meses de dados reais,
esse número deve ser confrontado com a distância medida.

### 3. Que páginas de destino convertiam pior

Sem o relatório de páginas de destino não há linha de base. Isto tem uma
consequência concreta e desagradável: **não vou poder provar que as landing
pages novas são melhores do que o que lá estava**, porque não há com que
comparar. Vão ser melhores por razões que se sabem de antemão (nomeiam a
região, o formulário é mais curto, a página é mais rápida), mas isso é
argumento, não medida.

## O que fazer para a próxima vez ser diferente

Quando houver conta a correr, exportar para `/ads-data/` e voltar a pedir a
análise. Formato: CSV, últimos 12 meses, do Google Ads → Relatórios →
Descarregar.

| Ficheiro | Relatório | Colunas que não podem faltar |
|---|---|---|
| `termos-de-pesquisa.csv` | Termos de pesquisa | Termo, keyword, campanha, grupo, impressões, cliques, custo, conversões |
| `keywords.csv` | Palavras-chave | Keyword, tipo de correspondência, campanha, grupo, custo, conversões, Índice de Qualidade |
| `campanhas.csv` | Campanhas | Campanha, custo, conversões, valor de conversão, impressões, quota de impressões perdida por orçamento |
| `anuncios.csv` | Anúncios | Anúncio, grupo, CTR, conversões, estado de cada título |
| `paginas-destino.csv` | Páginas de destino | URL, cliques, conversões, taxa de conversão |

O guião de leitura semanal está em `rotina.md`, e o script
`scripts/ads-semanal.mjs` lê estes ficheiros e diz em português o que mudar.

## A sazonalidade, que também não pude medir

Foi pedida sazonalidade real **por região**, com a distinção entre "em que meses
se pesquisa" e "em que meses se fecha". Isso só sai dos dados dela cruzados com
as datas de fecho no back office — os dois lados existem neste projecto, mas
ainda não há histórico de um deles.

O que se sabe de fontes públicas, e que serve de moldura enquanto não há dados,
está em `mercado.md`. Não é a mesma coisa e não deve ser tratado como se fosse.
