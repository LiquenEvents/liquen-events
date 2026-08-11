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

Cinco layouts, escolhidos por moodboard, com sugestão automática pelo número de
fotos. Medidas reais da área útil: **706 × 415 pt**.

| Layout | Fotos | Célula |
| --- | --- | --- |
| Grelha larga (2×5) | até 10 | 137 × 203 pt |
| Fila única | 5 | 137 × 415 pt |
| Mosaico orgânico | 6 a 10 | variável |
| Destaque + satélites | 4 a 7 | variável |
| Texto + imagem de apoio | 1 | ~340 × 415 pt |

**Como é que o mosaico é orgânico E ordenado.** As caixas não podem ser
sorteadas — sai desalinhado e nota-se. Saem de uma grelha fina (12 colunas × 6
linhas) onde cada foto ocupa um rectângulo de células diferente. Tamanhos
variados, linhas e colunas rigorosamente alinhadas: é esse o efeito da antiga.

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
