# PDF editorial — o redesenho da proposta

Este é o documento dela, tal como o mandou no chat a 9 de outubro de 2026, com
o exemplo «Mafalda & João» e o `referencia-liquen.zip`. Fica aqui para não se
perder, como os outros: **um documento que ela manda guarda-se em `docs/` no
mesmo dia.**

As referências (`referencia/` na raiz) **não vão para o git**: são 22 MB e
trazem fotografias de clientes. Estão no `.gitignore`. Quem continuar este
trabalho precisa de lhas pedir outra vez se a pasta não estiver lá.

O código está em `src/lib/pdf-editorial/`. O gerador antigo
(`src/lib/proposal-doc-pdf.ts`) não foi tocado e continua a ser o do envio até
ela aprovar o novo.

## Parte −1 — o que ela decidiu e onde a execução se afastou do texto

**O que já está feito, e o que falta** (auditado no código):

| Parte | O quê | Estado |
|---|---|---|
| 1 | Componentes de página, capa, índice, «A proposta», separadores, citação, contracapa, rodapé | feito, à espera da aprovação dela |
| 1 | Botão «Ver desenho novo» no estúdio (só pré-visualização, `desenho: "editorial"`) | feito |
| 2 | «O que propomos», paleta e ambiente (5 cores extraídas), as galerias de cada tema (1, 2–3, 4, 5, 6+, >12, 0 fotografias) | por fazer |
| 3 | Separador «Investimento», orçamento, total, notas, condições gerais, pagamento e cancelamento | por fazer |
| — | Trocar o envio para o desenho novo | só depois de ela aprovar |

**Decisões dela:**

- **Grupos de inspiração: «Pelo nome do tema».** O sistema não guarda o grupo
  de cada tema; lê-se das palavras do título (`grupos.ts`). Nenhum campo novo.
  O que não encaixa vai para «Ambiente».

**Onde a execução se afasta do texto, e porquê:**

1. **A cor de destaque é uma só, `#d8bd5a`** — o dourado do logótipo
   (`#cfb12a`) aclarado para o fundo escuro, que é o do exemplo. O exemplo tem
   um segundo dourado (`#e6d28a`) no «&» e nos sobretítulos sobre fotografia;
   o texto abaixo diz «uma cor de destaque, não duas», e foi o texto que
   ganhou.
2. **O rodapé segue o texto, não o exemplo.** O exemplo escreve «LÍQUEN
   EVENTS» no lugar do símbolo; o texto pede «símbolo pequeno da marca à
   esquerda, uma linha vertical fina». O símbolo é recortado do logótipo que
   já existe (`proposal-assets.ts`), não redesenhado.
3. **Os tamanhos dos títulos são os do exemplo** (46 px nas páginas, 76 px na
   capa, 58 px nos separadores), e não os «cerca de 39 px» do texto: o
   exemplo é «o alvo».
4. **O logótipo e o símbolo do rodapé são as duas únicas imagens com
   transparência.** São formas recortadas, não ficam por cima de fotografias
   de forma a criar o «cor-de-rosa», e o gerador antigo já fazia o mesmo na
   capa. Todos os degradés, desfoques e sombras estão fundidos nas JPEG; o
   teste `montar.test.ts` conta as máscaras e as opacidades.
5. **A Cormorant tem os algarismos direitos cozidos no ficheiro.** O pdf-lib
   não aplica `font-feature-settings: 'lnum'`; os algarismos 0–9 da letra
   embutida apontam para os glifos direitos (ver o cabeçalho de `letras.ts`).
6. **Peso:** página inteira até 1 800 px, fundos desfocados até 1 200 px,
   células até 1 250 px, JPEG mozjpeg 70–78. O limite que se persegue é o do
   anexo de email desta casa (8 MB), que é mais apertado do que os 10 MB do
   texto. A amostra da parte 1 (9 páginas) pesa 0,9 MB.
7. **A capa e a contracapa usam as duas fotografias de capa que ela já
   escolhe hoje** (`coverImages`): a primeira desfocada de fundo, a segunda no
   painel. Os fundos do índice e de «A proposta» e a fotografia da citação são
   escolhidos entre as de inspiração — deitadas e de maior resolução primeiro,
   sem repetir.

---

# Redesenho do PDF de proposta da Líquen Events

## O que quero

O back office da Líquen Events já gera um PDF de proposta de decoração para cada cliente. Eu preencho os dados do evento, escrevo os títulos e as notas de cada tema, carrego as fotografias de inspiração, e o sistema monta o documento.

Quero mudar **só o aspeto e a paginação** desse PDF. O conteúdo, os dados, os cálculos e a forma como eu preencho a proposta ficam como estão. O objetivo é que todas as propostas da Líquen passem a sair com o nível de design gráfico da proposta de referência que te dou, adaptado à marca Líquen.

Hoje o PDF é branco, com as fotografias em grelhas pequenas e o texto em Carlito. Parece um documento de escritório. Quero que pareça uma peça editorial de uma marca de casamentos: fundo escuro, fotografia em grande, títulos em letra serifada, páginas só de imagem a separar as partes.

## Ficheiros de referência

Pus três PDF na pasta `referencia/` na raiz do projeto. Lê os três antes de escrever código, abrindo as páginas como imagem, porque o que interessa é o aspeto.

- `referencia/Proposta-Bouquet-de-Liz.pdf`: **a referência de design**. É uma proposta que fiz para outro cliente, de outro tipo (um website). Copia dela a linguagem visual e os tipos de página. Não copies o conteúdo nem a estrutura de secções, que não têm nada a ver com a Líquen.
- `referencia/Maquetes-Bouquet-de-Liz.pdf`: mais exemplos da mesma linguagem visual, sobretudo páginas com fotografia a página inteira e separadores.
- `referencia/Exemplo-Proposta-Liquen-Events.pdf`: **o alvo**. É a proposta da Mafalda e do João já no novo design, montada à mão como exemplo. É assim que quero que o sistema passe a gerar. As fotografias deste exemplo têm pouca resolução porque foram tiradas de dentro do PDF antigo; com os originais do back office, as imagens grandes e de página inteira têm de ficar nítidas.
- `referencia/modelo-html/`: o HTML e o CSS com que esse exemplo foi feito (`proposta-exemplo.html`), os dados usados (`dados-exemplo.json`), as imagens e os tipos de letra. Usa-o como implementação de referência dos tipos de página: podes aproveitar o CSS e a estrutura, adaptando-os à tecnologia do projeto. Os fundos escurecidos já vêm fundidos nas imagens (ficheiros `bg3_*` e `bk_*`), pela razão explicada mais abaixo.
- `referencia/Proposta-Liquen-atual.pdf`: **o que o sistema gera hoje**. É a fonte do conteúdo, da ordem das secções e de todos os textos legais.

Se a pasta não existir ou estiver vazia, pára e pede-me os ficheiros.

## Antes de mexer: perceber o que existe

Não sei dizer-te de cor como o gerador está feito, por isso começa por o descobrir:

1. Encontra o código que gera o PDF da proposta (procura por «PROPOSTA · DECORAÇÃO», «Orçamento Proposto», «Faseamento do Pagamento», «de 17», ou pelo nome do ficheiro gerado, do tipo `Proposta-Liquen-Events-<noivos>-<data>.pdf`).
2. Percebe com que tecnologia o PDF é produzido (HTML renderizado por um browser, uma biblioteca de PDF, outra coisa) e que dados recebe: campos do evento, lista de serviços, temas de inspiração com as suas fotografias, linhas de orçamento, deslocação, IVA, datas.
3. Percebe como as fotografias chegam ao gerador (URL, ficheiro, base64), que resolução têm, e quantas pode haver por tema.
4. Escreve-me um resumo curto do que encontraste e do plano, e **espera pela minha confirmação antes de alterar ficheiros**. Se a tecnologia atual não conseguir fazer o que peço abaixo (fotografia a sangrar a página, tipos de letra próprios, sobreposições), diz-me isso nesse resumo e propõe a alternativa, em vez de a trocar por tua conta.

## O que não pode mudar

- **Os dados e o formulário do back office.** Não quero campos novos obrigatórios. Se precisares de um campo novo opcional (por exemplo, escolher a fotografia de capa), propõe-no e dá-lhe um comportamento por omissão que funcione sem eu lhe tocar.
- **Os cálculos.** Subtotal, deslocação, total sem IVA, IVA a 23%, total a pagar, sinal de 30% e saldo de 70% continuam a ser calculados pelo código que já existe. Tu só mudas a forma como aparecem.
- **Os textos legais.** Condições gerais, notas importantes, incluído e não incluído, próximos passos, observações gerais, faseamento do pagamento e cancelamento ficam **palavra por palavra** como estão hoje. São texto contratual. Podes mudar a paginação e a tipografia, nunca a redação.
- **Os contactos e a identificação da marca** que o sistema já usa (logótipo, e-mail, telefone, a frase da contracapa). Usa os ficheiros de logótipo que já estão no projeto; não redesenhes o logótipo.

## A linguagem visual a aplicar

Estes são os valores usados na proposta de referência. Usa-os como ponto de partida e ajusta o que for preciso para a Líquen.

**Formato.** A4 ao alto deitado (paisagem), 1123 × 794 px a 96 dpi, sem margens de impressão: as imagens vão até ao limite da página. Margem interior do conteúdo de 98 px à esquerda e à direita.

**Cor.**
- Fundo das páginas: quase preto quente, `#1f2022`.
- Texto principal: marfim, `#f3f0ea`. Texto secundário: `#e2ddd3` e `#d2cdc3`.
- Cor de destaque para etiquetas e números: na referência é um dourado claro, `#e0cfa8`. Para a Líquen, **tira a cor de destaque do logótipo da Líquen** (o verde-azeitona/dourado do símbolo) e usa-a só aí. Uma cor de destaque, não duas.
- Linhas divisórias: branco a 18–30% de opacidade, 1 px.

**Tipografia.**
- Títulos: Cormorant Garamond, peso 500, com algarismos alinhados (`font-feature-settings: 'lnum'`). Títulos de página a cerca de 39 px, títulos de capa e de separador entre 52 e 78 px, entrelinha apertada (1,0 a 1,1).
- Texto corrente: Inter, 13 a 15 px, entrelinha 1,55 a 1,6.
- Etiquetas (o pequeno texto por cima de cada título, como «INSPIRAÇÃO»): Inter 11,5 px, peso 600, maiúsculas, espaçamento entre letras de 0,2em, na cor de destaque.
- Citações e frases de marca: Cormorant Garamond itálico.
- Os dois tipos de letra são livres (Google Fonts). Inclui os ficheiros no projeto para o PDF não depender de rede.

**Rodapé de todas as páginas de conteúdo.** Símbolo pequeno da marca à esquerda, uma linha vertical fina, o texto «Proposta de decoração · <noivos> · <data do evento>», e o número da página à direita com dois algarismos. Fica a 38 px do fundo, em 12 px, numa cor discreta. Capa, separadores e contracapa não têm rodapé.

**Fotografia.** É o elemento principal. Sem filtros de cor, sem cantos muito arredondados (0 a 4 px), sem molduras nem sombras decorativas. Quando há texto por cima de uma fotografia, a fotografia é escurecida por um degradé só do lado ou da base onde está o texto, e fica quase intacta no resto.

## Tipos de página (o «kit»)

A proposta de referência é feita com um conjunto pequeno de tipos de página, que se repetem. Constrói estes tipos como componentes reutilizáveis e monta a proposta com eles.

1. **Capa.** Uma fotografia a página inteira. Degradé escuro da esquerda para a direita. Símbolo da marca em cima à esquerda, título muito grande em serifada, uma linha de descrição, e em baixo uma faixa com três blocos de dados separados por uma linha fina.
2. **Separador.** Página só de fotografia: uma imagem a página inteira, ou duas ou três lado a lado com 4 a 6 px de intervalo. Em baixo à esquerda, sobre um degradé escuro, uma etiqueta pequena e o título da parte que se segue em serifada grande. Sem mais texto.
3. **Página com fotografia de fundo e texto ao lado.** A fotografia ocupa a página inteira; um degradé escuro cobre o lado do texto (cerca de 60% da largura) e desaparece para o outro lado. Serve para as páginas de texto curto.
4. **Página de galeria editorial.** É o tipo mais importante para a Líquen, porque é onde entram as fotografias de inspiração. Três variantes, descritas na secção seguinte.
5. **Página de citação.** Fotografia a página inteira, sem escurecimento exceto na base, com uma frase em serifada itálica e o nome da marca.
6. **Página de tabela.** Fundo escuro com uma fotografia desfocada e muito escurecida por trás (ou uma faixa de quatro fotografias no topo, com cerca de 72 a 104 px de altura). Tabela com linhas finas, cabeçalhos em etiqueta, valores alinhados à direita.
7. **Página de valor.** O total em serifada muito grande (cerca de 100 px), com a descrição por baixo e os marcos de pagamento em três blocos.
8. **Página de condições.** Texto em duas colunas, em listas com linhas finas a separar os pontos, sobre fundo escuro com fotografia desfocada.
9. **Contracapa.** Fotografia a página inteira ou painel lateral com o logótipo, a frase de agradecimento, e os contactos.

## Como as fotografias de inspiração se arrumam sozinhas

Hoje cada tema de inspiração mostra as fotografias numa grelha de miniaturas iguais, com margens brancas à volta. No exemplo, as fotografias **ocupam a página de ponta a ponta**, sem margens, e o texto do tema vive num mosaico escuro que faz parte da composição. É esta a mudança mais importante.

O sistema escolhe a composição conforme **o número de fotografias que eu carreguei nesse tema**, sem eu ter de decidir nada:

| Fotografias no tema | Composição |
|---|---|
| 1 | Uma fotografia a página inteira, com o título por cima, em baixo à esquerda, sobre um escurecimento só na base |
| 2 ou 3 | Uma só fila a toda a altura da página: o mosaico de texto e as fotografias lado a lado |
| 4 | Duas filas em «tijolo»: em cima o mosaico de texto e duas fotografias; em baixo outras duas, com larguras diferentes das de cima |
| 5 | Cinco fotografias ao alto, lado a lado, **desalinhadas em altura**, sobre um fundo desfocado, com o título em baixo. É a única composição com margens, e serve para quebrar o ritmo |
| 6 ou mais | **Mosaico de ponta a ponta** em duas filas de altura igual. Uma fila leva o mosaico de texto e cerca de 40% das fotografias; a outra leva as restantes |
| Mais de 12 | Reparte por duas páginas do mesmo tema; a segunda leva o subtítulo «Mais ideias» |

Regras do mosaico de ponta a ponta:

- A página é uma coluna de duas filas com 4 px de intervalo, cada fila com metade da altura da página. Dentro de cada fila, as fotografias crescem em largura **na proporção do seu formato** (uma fotografia mais larga ocupa mais largura), e são cortadas para encher a célula (`object-fit: cover`). Assim nunca há espaço vazio nem imagens deformadas.
- O **mosaico de texto** tem largura fixa (330 px), fundo `#1f2022`, e leva: a etiqueta «INSPIRAÇÃO · <grupo>», o título em serifada, o subtítulo em itálico, a nota que eu escrevo, o número do tema em grande a 9% de opacidade no canto, e em baixo «LÍQUEN EVENTS» e o número da página. Estas páginas não têm o rodapé normal.
- **O mosaico de texto alterna de posição**: nos temas ímpares fica em cima à esquerda; nos pares, em baixo à direita. Dá ritmo ao folhear.
- A fotografia com maior resolução do tema vai para a célula maior. Se uma fotografia tiver resolução insuficiente para a célula que lhe calhou, troca-a por outra do mesmo tema em vez de a esticar.
- Uma nota muito longa faz o texto do mosaico diminuir de tamanho até caber; nunca transborda nem tapa fotografias.
- Um tema sem fotografias gera uma página só de texto, sem caixas vazias.

## Estrutura da nova proposta

Segue a estrutura do exemplo `Exemplo-Proposta-Liquen-Events.pdf`, página a página. O conteúdo é o da proposta atual; as páginas novas são todas geradas a partir de dados que o sistema já tem.

1. **Capa.** Fotografia de fundo a página inteira, escurecida do lado do texto, e uma segunda fotografia ao alto num painel à direita, com sombra. Logótipo, etiqueta «PROPOSTA · DECORAÇÃO», nomes dos noivos em serifada grande com o «&» na cor de destaque, e a faixa com evento, data e local.
2. **Índice.** Gerado automaticamente: «A proposta», uma linha por grupo de inspiração, «Investimento» e «Condições», com os números de página reais.
3. **A proposta.** Título em serifada e os dados do evento em oito blocos de etiqueta e valor (evento, data, local, convidados, noivos, cerimónia, número de serviços, validade).
4. **O que propomos.** Um cartão por serviço, com fotografia, número e nome. A fotografia de cada cartão é a primeira do tema de inspiração correspondente.
5. **Paleta e ambiente.** Cinco cores **extraídas automaticamente** das fotografias de inspiração dessa proposta (quantização das imagens, descartando os tons quase pretos e quase brancos e as cores demasiado parecidas entre si), mostradas como amostras com o código hexadecimal, e uma fila de seis fotografias. Se eu vier a ter um campo para escolher as cores à mão, esse campo tem prioridade.
6. **Inspiração, por grupos.** Cada grupo (Cerimónia, Cocktail, Jantar, Complementos) abre com um **separador** de quatro fotografias lado a lado a página inteira, com o número e o nome do grupo. Seguem-se os temas desse grupo, cada um com a composição automática descrita acima, numerados em sequência (01, 02, 03…). Se o sistema não guardar o grupo de cada tema, propõe-me como o obter (um campo opcional, ou uma regra pelo nome do tema) em vez de inventar.
7. **Página de citação**, a meio da inspiração: **uma fotografia a página inteira**, escurecida só na base, com a frase «Decoramos eventos, eternizamos memórias.» em serifada itálica grande. O sistema escolhe para ela a fotografia horizontal de maior resolução da proposta. Sem rodapé.
8. **Separador «Investimento».**
9. **Orçamento proposto.** Tabela numerada com os itens.
10. **Total.** O total a pagar em serifada muito grande, com subtotal, deslocação, total sem IVA e IVA ao lado, e os dois blocos de sinal e saldo, com os valores que o sistema já calcula.
11. **Notas, condições de reserva e próximos passos**, em três colunas.
12. **Condições gerais**, em duas colunas.
13. **Pagamento e cancelamento**, com os contactos.
14. **Contracapa.** Mesmo tratamento da capa: agradecimento, frase da marca, logótipo, contactos e validade.

Os textos das páginas 11 a 13 são os de hoje, palavra por palavra.

**De onde vêm as fotografias de fundo, capa e separadores.** Não quero ter de carregar fotografias a mais. Por omissão, o sistema escolhe-as de entre as fotografias de inspiração já carregadas nessa proposta, dando preferência às de maior resolução e de orientação horizontal, e sem repetir a mesma imagem em duas páginas seguidas. Se o projeto já tiver um conjunto de fotografias da própria Líquen (as da capa e da contracapa atuais, por exemplo), usa essas para a capa e a contracapa.

## Dois problemas que já me aconteceram e que quero evitados

- **Sobreposições que mudam de cor.** Na proposta de referência, os degradés escuros por cima das fotografias estavam feitos com transparência (CSS `linear-gradient` com `rgba`). Num leitor de PDF apareceram **cor-de-rosa** em vez de pretos. A solução foi fundir o escurecimento na própria imagem antes de a pôr no PDF, de modo que o ficheiro final não tenha camadas transparentes por cima de fotografias. Faz o mesmo: escurecimentos e degradés são aplicados à imagem (no servidor, ao gerar), e o PDF recebe uma imagem já final.
- **Peso do ficheiro.** O PDF de referência ficou com 13 MB e não cabia num e-mail com outro anexo. Redimensiona cada fotografia para o tamanho a que vai ser usada (no máximo cerca de 1250 px no lado maior para células, 2000 px para página inteira) e grava em JPEG de qualidade 62 a 80. O objetivo é uma proposta normal ficar **abaixo de 10 MB**.

## Como sei que está pronto

- Gero a proposta de teste com os mesmos dados da `Proposta-Liquen-atual.pdf` e o resultado tem todo o conteúdo dela: os mesmos campos, os mesmos temas, as mesmas fotografias, os mesmos valores (3.200,00 €, 460,00 €, 3.660,00 €, 841,80 €, 4.501,80 €, 1.350,54 €, 3.151,26 €) e os textos legais iguais, palavra por palavra.
- Gero propostas de teste com temas de 1, 2, 3, 4, 5, 8 e 12 fotografias e com um tema sem fotografias, e nenhuma página tem texto por cima do rodapé, fotografias deformadas, caixas vazias ou texto ilegível sobre a imagem.
- Uma nota muito longa num tema e uns nomes de noivos muito compridos na capa não partem a paginação.
- Converte as páginas do PDF gerado em imagem e **olha para elas** antes de me dizeres que acabaste. Compara-as com a referência. Diz-me o que verificaste e o que não conseguiste verificar.
- O fluxo no back office é o mesmo de hoje: preencho, carrego fotografias, gero.

## Como quero que trabalhes

1. Lê as referências e o código, e manda-me o resumo e o plano. Espera pela minha resposta.
2. Faz primeiro os componentes de página e a capa, gera um PDF de teste e mostra-me.
3. Depois as composições automáticas de fotografias, que é a parte mais delicada.
4. Depois o orçamento e as condições.
5. Trabalha num ramo próprio e mantém o gerador antigo a funcionar até eu aprovar o novo, para eu poder continuar a enviar propostas entretanto.

Se alguma coisa do que peço for contra a forma como o sistema está construído, pergunta-me antes de decidir.
