# UTM-PLAN — como se escreve o URL de um anúncio

Serve para não inventares os parâmetros de cada vez. Copia o modelo, troca o
que está entre `<>`, e mais nada.

---

## O modelo

```
https://liquen-events.com/s/<variante>?utm_source=<rede>&utm_medium=paid_social&utm_campaign=<campanha>&utm_content=<criativo>
```

A Meta acrescenta o `fbclid` sozinha. **Não o escrevas.**

| parâmetro | valores permitidos | o que responde |
| --- | --- | --- |
| `utm_source` | `ig` \| `fb` | em que rede foi visto |
| `utm_medium` | `paid_social` (sempre) | separa isto do Google (`cpc`) e do orgânico |
| `utm_campaign` | ver abaixo | que campanha pagou |
| `utm_content` | `<conceito>-<formato>-<gancho>` | que criativo em concreto |

### `utm_campaign`

Três partes, com hífen: `<objetivo>-<publico>-<zona>`

| parte | valores |
| --- | --- |
| objetivo | `frio` (prospecção) \| `retarget` \| `similar` |
| público | `noivos` \| `planners` \| `visitantes` \| `leads` |
| zona | `comporta` \| `alentejo` \| `lisboa` \| `algarve` \| `nacional` \| `intl` |

Exemplos reais, prontos a colar:

```
frio-noivos-comporta
retarget-visitantes-nacional
similar-leads-nacional
frio-planners-nacional
```

### `utm_content`

`<conceito>-<formato>-<gancho>`, onde:

- **conceito** — o número do conceito em `/meta-ads/criativos.md`: `c01` … `c10`
- **formato** — `916` (Reels e Stories) \| `45` (feed)
- **gancho** — `a` \| `b`, e **tem de bater certo com a página**: o gancho `b`
  aponta para `/s/<variante>-b`, nunca para `/s/<variante>`

---

## As dez linhas que vais mesmo usar

Copia daqui. A coluna da esquerda é o que escreves no campo "Website URL" do
anúncio.

| URL do anúncio | quando |
| --- | --- |
| `https://liquen-events.com/s/comporta?utm_source=ig&utm_medium=paid_social&utm_campaign=frio-noivos-comporta&utm_content=c01-916-a` | arranque, semana 1 |
| `https://liquen-events.com/s/comporta-b?utm_source=ig&utm_medium=paid_social&utm_campaign=frio-noivos-comporta&utm_content=c01-916-b` | o par A/B do de cima |
| `https://liquen-events.com/s/alentejo?utm_source=ig&utm_medium=paid_social&utm_campaign=frio-noivos-alentejo&utm_content=c03-916-a` | semana 3 |
| `https://liquen-events.com/s/alentejo-b?utm_source=ig&utm_medium=paid_social&utm_campaign=frio-noivos-alentejo&utm_content=c03-916-b` | o par |
| `https://liquen-events.com/s/lisboa?utm_source=ig&utm_medium=paid_social&utm_campaign=frio-noivos-lisboa&utm_content=c05-45-a` | quando houver folga |
| `https://liquen-events.com/s/algarve?utm_source=ig&utm_medium=paid_social&utm_campaign=frio-noivos-algarve&utm_content=c07-916-a` | Verão |
| `https://liquen-events.com/en/s/portugal?utm_source=ig&utm_medium=paid_social&utm_campaign=frio-noivos-intl&utm_content=c09-916-a` | público internacional |
| `https://liquen-events.com/s/comporta?utm_source=ig&utm_medium=paid_social&utm_campaign=retarget-visitantes-nacional&utm_content=c02-916-a` | remarketing |
| `https://liquen-events.com/s/alentejo?utm_source=fb&utm_medium=paid_social&utm_campaign=retarget-visitantes-nacional&utm_content=c04-45-a` | remarketing no Facebook |
| `https://liquen-events.com/s/lisboa?utm_source=ig&utm_medium=paid_social&utm_campaign=frio-planners-nacional&utm_content=c10-45-a` | wedding planners |

---

## As seis regras que evitam os erros que custam dinheiro

1. **Minúsculas, sempre.** `IG` e `ig` são duas fontes diferentes nos
   relatórios, e ninguém percebe porque é que a mesma campanha aparece
   dividida em duas.
2. **Nunca `utm_source=facebook` num anúncio de Instagram.** Se puseres a
   colocação a decidir, usa `ig` — a esmagadora maioria vai lá parar.
3. **O gancho no `utm_content` tem de bater certo com o slug da página.**
   `-b` no conteúdo e página sem `-b` faz o teste A/B medir a mesma página
   duas vezes e concluir que os ganchos são iguais.
4. **Nunca acrescentes `fbclid` à mão.** A Meta põe-no; um `fbclid` inventado
   estraga a atribuição em vez de a criar.
5. **Não uses o construtor de URL da Meta com `{{placeholders}}`** nestes
   URL. Os `{{campaign.name}}` do gestor de anúncios entram com espaços e
   acentos, e o que aparece no relatório fica ilegível. Escreve à mão.
6. **Um URL por linha da tabela, e a tabela é esta.** Um parâmetro novo
   inventado numa terça-feira é um parâmetro que ninguém vai saber ler em
   Setembro.

---

## O que o sítio faz com isto

| onde | o quê |
| --- | --- |
| `LeadSourceCapture` | grava os UTM de PRIMEIRO toque em `sessionStorage` |
| `MetaPixel` | grava o `fbclid` em `localStorage`, 90 dias, primeiro toque |
| `PedidoRelampago` | envia ambos com o pedido de orçamento |
| email à equipa | mostra-os em "Como nos conheceu" |
| `/api/meta/fechos` | usa o `fbc` para devolver à Meta o valor do casamento |

**Primeiro toque vence, dos dois lados.** Quem clicou num anúncio frio em
Janeiro e num de remarketing em Março aparece atribuído ao de Janeiro. É
deliberado: o crédito é de quem descobriu a pessoa, não de quem a reencontrou.
Sem isto, o remarketing pareceria brilhante e a prospecção inútil, e a decisão
seguinte seria cortar o orçamento à campanha que faz o trabalho.
