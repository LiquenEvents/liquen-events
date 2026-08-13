# Alinhar o gerador com a proposta feita à mão — plano e decisões

Referência: «PO Casamento Decoração Mariana e João · 5.06.2027».

Regra de ouro: copia-se a **estrutura**, não os erros. A manuscrita cursiva dos
títulos de moodboard não se replica — fica a serifa da marca.

---

## Decisões já tomadas

| O que | Decisão | Onde vive |
| --- | --- | --- |
| Validade da proposta | **60 dias** (como a antiga) | definições, editável |
| Confirmação do nº de convidados | **25 dias** antes (como a antiga) | definições, editável |
| Linha «Total a pagar» no orçamento | **existe e vem ligada** | por proposta, desligável |
| Orientação das páginas | **nada a decidir** — ver abaixo | — |

Sobre o «Total a pagar»: com cada linha adicional a poder ter o seu próprio
IVA, a soma deixa de ser trivial. Uma proposta não deve pedir contas de cabeça a
quem a lê.

---

## O que já existe e não precisa de ser construído

**A página já é horizontal.** O documento inteiro é A4 ao baixo — 841,89 ×
595,28 pt (`proposal-geometria.ts`). O B1 não tem duas opções para comparar: não
há nada a mudar. O que faz as páginas de moodboard parecerem apertadas é o
layout, não a orientação.

**Os serviços com título a negrito e descrição já existem.** `ServiceItem` tem
`label` + `desc` opcional, `ServiceGroup` tem `letter` + `title`, e o PDF já
desenha «Centros de mesa jantar: decor floral, integração de jarras…» com a
primeira parte a negrito (`proposal-doc-pdf.ts:896-901`). Falta confirmar se o
**estúdio** deixa escrever a descrição, ou só a linha.

---

## O que está mesmo por fazer

### Bloco A — orçamento, condições e serviços

- **A2** — itens do orçamento sem preço individual; abaixo, linhas de valor com
  rótulo editável e **IVA por linha** (na antiga a deslocação não leva «+ IVA» e
  as outras levam). Mais a linha final «Total a pagar».
- **A3** — «Notas importantes», com os três bullets por omissão.
- **A4** — «Condições de reserva», duas listas distintas: incluído e não
  incluído.
- **A5** — condições gerais, faseamento (30% na adjudicação, 70% um mês antes,
  adjudicação só válida depois da primeira), cancelamento e contactos. **Um só**
  título «Condições Gerais» — na antiga aparece repetido. Sem TUDO EM
  MAIÚSCULAS: hierarquia por peso, não por caixa.

### Bloco B — o layout das imagens

Hoje: **6 fotos no máximo** por moodboard e **um só layout** — uma grande à
esquerda, as restantes em grelha à direita. É exactamente o que a antiga não
faz.

Área útil real: **706 × 339 pt** (o valor que aqui estava, 415, era o topo da
mancha e não a altura dela).

**A descoberta que muda o desenho, e que só se vê no documento verdadeiro: cada
foto conserva as suas proporções.** Na página das mesas de jantar há dez fotos em
duas filas; dentro de cada fila todas têm a MESMA ALTURA e larguras diferentes —
a segunda é larga, a terceira é estreita. Não são células iguais. Uma grelha de
células iguais recortava as dez ao mesmo formato, e é exactamente isso que dá ao
PDF de hoje o aspecto de relatório.

Por isso os layouts pedem os ASPECTOS das fotos, e não só quantas são.

| Layout | Fotos | O que faz |
| --- | --- | --- |
| Filas justificadas | 4 a 12 | 2 ou 3 filas; dentro de cada fila, mesma altura e larguras conforme a foto |
| Fila única | 2 a 6 | uma linha só, de margem a margem |
| Mosaico orgânico | 4 a 8 | tamanhos muito diferentes, sem filas — a página do Decor Mesa Buffet |
| Destaque + satélites | 2 a 4 | uma grande com outras à volta (o que já existia) |
| Texto + imagem de apoio | 1 | o bloco de texto à esquerda, a foto à direita |

**A largura manda; a altura é o que sair.** As filas enchem sempre a largura da
mancha, e o bloco encosta ao topo — se sobrar branco em baixo, sobra, que é o que
a página antiga faz. Esticar a altura para encher a página seria errado: a
largura de cada foto é `aspecto × altura`, portanto esticar uma estica a outra.
A primeira versão disto fazia-o e as filas saíam 267 pontos para fora da página;
os testes apanharam-no.

**Como é que o mosaico é orgânico E ordenado.** As caixas não podem ser
sorteadas — sai desalinhado e nota-se. Saem de cortes sucessivos de um rectângulo
só, sempre em fronteiras de uma grelha fina de 12 × 6. Tamanhos todos diferentes,
arestas todas alinhadas, sem buracos nem sobreposições — e determinístico, senão
a pré-visualização mentia.

Mais: subtítulo opcional por moodboard, legendas por baixo do bloco de imagens,
e a serifa da marca em vez da manuscrita.

### Bloco C — os erros que não se copiam

«Seatting Plan» → «Seating Plan» (duas vezes) · «Seatting Charts» → «Seating
Charts» · «PAPEARIA» → «PAPELARIA» · «7O%» → «70%» · «encargosinerentes» →
«encargos inerentes» · «aszonas» → «as zonas» · «entregueslimpos» → «entregues
limpos» · «t'ligths» → «t-lights» · «CONDIÇÕES GERAIS» repetido → um só · «2.
Serviços» + «2. Serviços Disponibilizados» → numeração única · «ATÉ ATÉ ÀS 14H
HORAS» → «até às 14h» · página final em branco → não se gera · email centralizado
em definições, para migrar para domínio próprio.

---

## Validação

Gerar a proposta da Mariana e do João (300 pax, Cabeção/Mora, 7.890 € +
coordenação + deslocação) e comparar página a página com a antiga, lado a lado.
Mais: verificação ortográfica dos textos por omissão, e um teste que garante que
nenhuma página sai em branco e que nenhuma legenda leva marcas de rascunho.
