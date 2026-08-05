# Cor e tipografia no back office

Regras para a página **Fazer proposta** e, por extensão, para o resto do back
office. Não são gosto: são um contrato. Num formulário de trabalho, cada cor
tem de querer dizer uma coisa e só uma — senão nenhuma quer dizer nada, e a
única forma de saber o que é urgente passa a ser ler tudo.

## As cinco regras

| Cor | Só para | Valor |
| --- | --- | --- |
| **Cinzento neutro** | etiquetas de campo e texto de apoio | `rgba(13, 13, 13, .48–.82)` |
| **Verde da marca** | a acção afirmativa — uma por secção | `#4d6350` (`--bo-accent`) |
| **Laranja** | avisos e o que falta preencher | `#c98a2e` |
| **Vermelho** | erros e acções destrutivas | `--color-danger` |
| **Serifa** (Playfair) | títulos de secção | nunca em etiquetas |

## O que cada uma quer dizer

**Cinzento é o andaime.** Etiquetas, notas, contagens, tudo o que ajuda a
perceber onde se está. Se algo em cinzento chama a atenção, está mal
escrito, não mal pintado.

**Verde é «faz isto» e «está aqui».** «Criar a partir de…», «Pré-visualizar»,
«Adicionar 5 fotos», «Guardar» — e o passo actual no indicador «1 Conteúdo →
2 Pré-visualizar → 3 Enviar».

A regra é **uma acção afirmativa por REGIÃO**, não uma por ecrã. Medido com
`--cores`, o estúdio mostra três verdes ao mesmo tempo, e os três estão certos
porque cada um vive na sua região e responde a uma pergunta diferente:

| Verde | Região | Pergunta |
| --- | --- | --- |
| Criar a partir de… | cabeçalho do estúdio | o que faço agora? |
| 1 Conteúdo | indicador de passos | onde estou? |
| Pré-visualizar → | barra fixa do fundo | como avanço? |

Duas acções verdes na MESMA região é que obrigam a escolher, e escolher é
trabalho. As acções secundárias são `ghost`: existem, não pedem.

Uma nota sobre os atalhos dentro de avisos («Usar 5.700 €», «Passar a usar 45
dias»): são verdes de propósito, mesmo estando dentro de uma caixa laranja. O
laranja é o problema; o verde é a saída. Pintá-los de laranja seria pintar a
solução com a cor do erro.

**Laranja é «olhe para aqui antes de enviar».** Os campos que vieram copiados
de outra proposta e ainda não foram confirmados; o total que não bate com a
soma das linhas; o que falta para poder enviar; «alterações por guardar». Um
laranja que aparece sempre deixa de ser lido — é por isso que o aviso do
orçamento se cala quando não há preços nenhuns, em vez de dizer «a soma é
0,00 €» desde o primeiro segundo.

**Vermelho é «isto correu mal» ou «isto apaga».** Nunca um aviso. A diferença
entre laranja e vermelho é a diferença entre rever e perder.

**A serifa é a voz da Líquen, e vive nos títulos.** Uma etiqueta de campo em
serifa lê-se como um título e faz a página parecer um folheto. Os títulos de
secção são `font-display` (Playfair Display); tudo o resto é Inter.

## O que foi corrigido nesta passagem

**As etiquetas estavam num castanho quente.** `.bo-eyebrow` usava
`rgba(42, 38, 32, .66)` enquanto a navegação, o texto de apoio e os tokens
`--bo-*` já tinham passado para o neutro `rgba(13, 13, 13, …)`. Sobre fundo
creme, um castanho quente ao lado de cinzentos neutros lê-se como uma cor com
significado — e é essa a impressão de «laranja nas etiquetas». Passou para
`rgba(13, 13, 13, .64)`.

O contraste melhora com a troca: `#0d0d0d` a 64% é mais escuro do que
`#2a2620` a 66% sobre branco, portanto a garantia de AA (WCAG 1.4.3)
mantém-se. Isto foi medido no browser, não estimado —
`scripts/medir-estudio-propostas.mjs --cores` volta a lê-lo.

**O botão de adicionar fotos era da variante por omissão** e, ao lado do
«Cancelar», lia-se como desactivado mesmo com fotos escolhidas. Passou a
`primary`.

## O que NÃO foi mexido, e porquê

O logótipo continua dourado. É a identidade da marca no canto do ecrã, não um
elemento de interface: não compete com nada porque não está dentro do
formulário.

O `ui/DESIGN.md` descreve a fundação visual do back office (cartões, sombras,
espaçamentos). Este documento é sobre o SIGNIFICADO das cores e não o
substitui.

## Como verificar

```
npm run dev
node scripts/medir-estudio-propostas.mjs --cores
```

Lê as cores computadas das etiquetas, dos títulos e dos botões e assinala o
que sair das regras acima. É a mesma régua que mediu os campos, os cliques e o
scroll na Fase 0 — e a razão é a mesma: uma verificação feita a olho hoje e
outra daqui a três dias não se comparam.
