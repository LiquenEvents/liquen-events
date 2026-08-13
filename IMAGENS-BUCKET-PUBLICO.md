# Bucket público? — a recomendação, com o que ela custa

Pilar 2 da missão: *"Avalia e recomenda: bucket público com nomes opacos e
imprevisíveis. (…) Se houver motivo real de privacidade que o impeça,
explica-o."*

**Recomendação: sim para a biblioteca de temas, não para as propostas.** As
razões, e o que decide a diferença, estão abaixo.

---

## O que isto compra — medido, não argumentado

Da linha de base (`IMAGENS-BEFORE.md`), reabrir o seletor de temas:

| | Hoje | Com bucket público |
| --- | --- | --- |
| Tempo | **1835 ms** | ~0 |
| Pedidos que atravessam a rede | **9** | **0** |
| Bytes | **188 KB** | **0** |

E, no servidor, cada página de fotos perde uma ida ao Storage — a assinatura
(`createSignedUrls`, ~90 ms modelados) deixa de existir. Não é optimizada: deixa
de acontecer.

### Porque é que hoje não funciona

O Storage já serve `Cache-Control: max-age=3600`. **O cabeçalho está certo.** O
que o anula é o URL:

```
…/theme-thumbs/terracotta/ab12….jpg?token=<JWT novo a cada assinatura>
```

Cada assinatura mete um token diferente → URL diferente → entrada de cache
diferente. Bytes idênticos, buscados outra vez. Prolongar o `SIGNED_TTL` não
ajuda, e o comentário no código já o dizia: *"o token muda a cada assinatura,
logo o URL muda na mesma"*.

**Enquanto o bucket for privado, `immutable` é impossível.** Não por
configuração — por construção.

---

## A pergunta de privacidade, respondida a sério

O argumento fácil é "nomes imprevisíveis chegam". É verdade, mas não é a parte
que interessa. A parte que interessa é esta:

> **Um URL assinado que escape já é um URL público durante seis horas.**

Um print de ecrã, uma linha de log, o histórico do navegador, um link colado
numa conversa — qualquer um deles entrega a fotografia a quem o tiver, sem
autenticação nenhuma, até o token expirar. A assinatura não protege a
fotografia de quem tem o link; protege-a de quem **adivinha o caminho**.

E o caminho já é imprevisível: o nome do ficheiro é o **resumo do conteúdo**,
32 hexadecimais — 128 bits. Não se adivinha, não se enumera (o bucket não lista
para quem não tem a chave de serviço), e não se deriva de nada.

Ou seja: contra o atacante que adivinha, o nome-resumo já faz o trabalho todo.
Contra o atacante que tem o link, a assinatura faz um trabalho **temporário** —
seis horas.

### A diferença real, e é a única

**Revogação.** Um URL assinado expira sozinho. Num bucket público, o único modo
de tirar uma fotografia de circulação é **apagá-la ou mudar-lhe o nome**.

Isso decide tudo o resto.

---

## Por isso a resposta é diferente para cada bucket

### `theme-assets` / `theme-thumbs` → **público, com nomes-resumo**

São fotografias de INSPIRAÇÃO da biblioteca do estúdio: bouquets, seating
plans, mesas em terracotta. Reutilizadas de casamento para casamento, sem nome
de cliente, sem data, sem contexto que identifique alguém. Metade delas
acabariam publicadas no Instagram do estúdio de qualquer maneira.

Uma fotografia destas em circulação permanente não é um incidente. Não há nada
para revogar, porque não há nada que a ligue a uma pessoa.

**O que muda:** `public: true` no bucket, `cacheControl: 31536000, immutable`
no upload, e as rotas passam a devolver o URL público em vez de assinar. O nome
do ficheiro fica como está — já é o resumo do conteúdo, que é exactamente o
"nome opaco e imprevisível" que a missão pede, e que dá invalidação automática
de graça (conteúdo diferente = nome diferente).

### `proposal-assets` / `proposal-thumbs` → **ficam privados**

São as fotografias DE UMA PROPOSTA: a capa e os mood boards que foram para o
casal X, com a data e o local do casamento deles ao lado no mesmo documento.
Aqui a revogação deixa de ser teórica — uma proposta cancelada, um casal que
pede que se apague tudo, um engano numa proposta enviada. A expiração
automática é uma propriedade que se quer mesmo.

O ganho de cache também é menor: uma proposta é vista poucas vezes, por poucas
pessoas, ao contrário da biblioteca, que é aberta dezenas de vezes por dia pela
mesma pessoa.

---

## O que isto NÃO resolve, dito antes de alguém contar com isso

- **Não torna a primeira abertura mais rápida.** Os bytes continuam a ter de
  chegar. O que fica instantâneo é a SEGUNDA vez, e todas as seguintes — que é
  o caso real: abrir o seletor uma vez por mood board.
- **Não substitui o LQIP.** Continua a haver um primeiro carregamento, e é o
  placeholder que trata dele.
- **Não muda a autorização da API.** As rotas continuam a exigir sessão de
  admin para LISTAR fotos. O que passa a ser público é o ficheiro, para quem já
  tem o endereço de 128 bits — não a biblioteca.

---

## A ordem de execução, e porquê esta

1. **Criar os buckets novos como públicos** — não converter os que existem. Um
   `updateBucket` para público é uma alteração de visibilidade que não se
   desfaz sem consequências, e não há ensaio possível.
2. **Copiar** as 104 fotos (e as miniaturas) para o bucket público, com o
   `cacheControl` novo.
3. **Passar as rotas a devolver o URL público**, com bandeira para poder voltar
   atrás sem deploy.
4. **Medir outra vez** — a reabertura tem de ir a zero pedidos, ou a mudança não
   valeu o que custou.
5. Só depois **apagar os buckets privados**.

O passo 3 é o único que precisa de código; os outros são operação. E os passos
1 e 5 estão propositadamente afastados um do outro: entre eles há um estado em
que tudo existe nos dois sítios, e é esse estado que torna a decisão
reversível.

---

## O que decide isto não é técnico

A pergunta é uma só, e é dela:

> **Uma fotografia da biblioteca de temas, em circulação permanente para quem
> tenha o endereço, é um problema?**

Se a resposta for não — e é o que a natureza destas fotografias sugere —, o
resto é execução. Se for sim, fica tudo como está e o custo é conhecido: 1835
ms e 188 KB em cada reabertura, para sempre.
