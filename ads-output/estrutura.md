# Fase 2 — Estrutura de campanhas

Gerada por `src/lib/ads/campanhas.ts`, que deriva de `src/lib/ads/polos.ts` — o
mesmo ficheiro que gera as landing pages. Não é elegância: é o que torna
**impossível** um anúncio apontar para uma página que não existe, ou a campanha
do Algarve mandar tráfego para a página do Alentejo. Os dois erros mais banais e
mais caros de uma conta de Ads deixam de depender de alguém reparar.

Regenerar: `node scripts/gen-ads.mjs 50` (50 = orçamento mensal em euros).

---

## O que sai com 50 €/mês

**Uma campanha.** `PT · alentejo`, 1,64 €/dia, dois grupos, 13 keywords.

A justificação está em `00-LEIA-PRIMEIRO.md`. Em resumo: 50 € compram ~83
cliques, são precisos 40 a 80 cliques para se poder concluir alguma coisa, logo
há orçamento para **uma** resposta. Duas campanhas seriam duas não-respostas.

| Grupo | Keywords | Página de destino |
|---|---|---|
| `alentejo · intenção local` | "decoração de casamento Évora", "decoração casamentos Évora", … | `/casamentos/alentejo` |
| `alentejo · espaços` | "casamento Herdade Vale Lameira", "decoração Quinta do Louredo", … | `/casamentos/alentejo` |

## O plano completo, para quando houver orçamento

Quinze campanhas desenhadas, todas com anúncios escritos e página de destino a
existir. Abrem por esta ordem, e o orçamento é que decide quantas:

| Ordem | Campanha | Abre a partir de | Porquê nesta posição |
|---|---|---|---|
| 1 | PT · alentejo | 50 €/mês | Casa. Sem custo de deslocação, cliques mais baratos, presença local já feita |
| 2 | PT · lisboa | 160 €/mês | Maior mercado doméstico ainda ao alcance de uma ida e volta no dia |
| 3 | EN · Reino Unido | 240 €/mês | Maior valor por casamento da conta, mas cliques caros: precisa de verba a sério |
| 4 | PT · nacional genérico | 320 €/mês | Maior volume e maior preço; metade de quem pesquisa ainda não sabe o que quer |
| 5 | PT · algarve | 400 €/mês | Mercado internacional dentro de Portugal |
| 6 | PT · porto-douro | 480 €/mês | Mercado grande, concorrência local forte e enraizada |
| 7 | EN · Irlanda | 560 €/mês | Segundo mercado de destination weddings |
| 8–15 | Minho, Centro, Madeira, Açores, EUA, Brasil, França, Alemanha | 640 €/mês+ | Ver `polos.ts` |

## As decisões, com as razões

### Uma campanha por polo, nunca uma nacional única

O orçamento é a única alavanca que a Google não pode contornar. Numa campanha
nacional única o algoritmo leva o dinheiro para onde há mais volume — Lisboa — e
o Alentejo, que é onde a margem é melhor por não haver deslocação, **nunca
chega a ser testado**. Com uma campanha por polo, cada região tem um tecto que
ela decide, e a comparação entre regiões passa a ser possível.

### Segmentação por presença, excepto no internacional

- **Campanhas PT: "presença".** Quem está em Espanha a pesquisar "decoração
  casamento Lisboa" é quase sempre um curioso, um concorrente ou um agregador. O
  clique custa igual.
- **Campanhas EN: "interesse".** É o contrário, e tem de ser: o casal que
  interessa está em Londres a pesquisar sobre o Algarve. Segmentar por presença
  ali seria segmentar exactamente as pessoas erradas.

Há um teste que verifica que isto não se inverte.

### PT e EN nunca na mesma campanha

Idiomas diferentes, páginas de destino diferentes, custos por clique diferentes.
E os relatórios só são legíveis separados.

### Sem correspondência ampla

Nenhuma keyword em correspondência ampla. Com uma conta sem histórico de
conversões, a ampla não tem sinal nenhum para se guiar e transforma-se numa
torneira aberta — é onde as contas novas queimam o orçamento do primeiro mês. Só
frase e exacta.

### Licitação manual no arranque, não automática

`Manual CPC`. As estratégias automáticas (Maximizar conversões, tCPA) precisam
de conversões para aprender, e a conta tem zero. Ligá-las já seria pedir a um
algoritmo que optimize para um sinal que ainda não existe. Passar para
automática quando houver **15 a 30 conversões** registadas — está em
`rotina.md`.

### AI Max desligado

O AI Max é uma **definição dentro de campanhas de Pesquisa**, não um tipo de
campanha novo. Expande a correspondência de forma parecida com a ampla. Mesma
razão de cima: com uma conta sem histórico, gasta o orçamento a aprender o que
já sabemos.

### Sem Display nem Demand Gen

As campanhas de Display autónomas estão a ser migradas para Demand Gen. Não
gerei nenhuma. Neste negócio a procura já existe e é explícita — alguém escreve
"decoração casamento Alentejo" —, portanto o dinheiro rende mais a apanhar quem
está a pesquisar do que a interromper quem não está. Com 50 €/mês isto nem é
uma escolha difícil.

---

## Performance Max: NÃO, e a razão é estrutural

Foi pedida uma recomendação explícita. É não, e não por preconceito.

**1. Com este orçamento não funciona, ponto.** O PMax entrega licitação,
orçamento e colocações à IA da Google, e essa IA precisa de sinal de conversão
para funcionar. A recomendação da própria Google é ter conversões suficientes
para sair da fase de aprendizagem — dezenas por mês. A conta terá, no melhor
cenário, **dois ou três pedidos de orçamento por mês**. O PMax passaria a vida
inteira em aprendizagem, a gastar sem nunca convergir.

**2. Canibaliza as campanhas de Pesquisa.** O PMax serve nas mesmas pesquisas
que as campanhas de Pesquisa e tem prioridade sobre elas em muitos leilões. Com
uma campanha só, isso significaria o PMax a comer o orçamento da única coisa que
está a produzir dados legíveis.

**3. Tira a visibilidade exactamente onde ela é precisa.** O PMax não mostra
termos de pesquisa ao nível de detalhe da Pesquisa, e não deixa segmentar por
região com o mesmo controlo. Toda esta operação assenta em conseguir comparar
regiões e podar termos maus. O PMax retira as duas coisas.

**4. Um único serviço, sem catálogo.** O PMax brilha quando há muitos produtos
e um feed. Aqui há um serviço.

**Quando reconsiderar:** com mais de 30 conversões por mês registadas E
conversões offline a alimentar valor real há pelo menos três meses. Nessa
altura, testar PMax **a par** das campanhas de Pesquisa, com orçamento próprio e
uma leitura honesta da canibalização.

---

## Criativos

Quinze títulos e quatro descrições por grupo, em PT e EN, gerados a partir de
`campanhas.ts`.

**Tom:** contido, editorial, sem exclamações e sem clichés. Nada de "o dia mais
feliz da sua vida", "sonho", "mágico", "inesquecível" — é o que todos os
concorrentes escrevem, o que os torna invisíveis. Há um **teste** que rejeita
esse vocabulário e os pontos de exclamação, para o tom não se perder na terceira
alteração.

Os títulos das campanhas regionais **nomeiam a região** (também verificado por
teste): um anúncio regional que não diz a região é um anúncio genérico e tem o
desempenho de um.

Limites verificados por teste em cada título e descrição: **30 e 90
caracteres**. Isto apanhou três defeitos reais durante a escrita — grupos com 11
títulos em vez de 15, um título repetido, e duas descrições com 92 e 93
caracteres. Nenhum deles dá erro na Google: o anúncio entra na mesma, com menos
combinações para testar e desempenho pior, sem sintoma.

## Extensões

Em `csv/6-sitelinks.csv`: quatro sitelinks por campanha, com duas descrições
cada, PT e EN.

**Recomendo activar também, à mão na interface** (o Editor importa-as mal por
CSV):
- **Chamada** — com o 919 259 820. O clique no telefone já está medido.
- **Localização** — ligada ao Perfil de Empresa Google. Reforça "em Évora".
- **Destaques** — "Equipa própria", "Material próprio", "Desde 2018",
  "Montagem na véspera".
- **Excertos estruturados** — cabeçalho "Serviços": Conceito, Design floral,
  Cenografia, Coordenação, Produção.
- **Formulário de lead: NÃO.** Duplica o formulário do site, não deixa medir
  como as landing pages convertem, e os contactos ficam presos numa interface da
  Google em vez de entrarem no back office. Com uma só campanha, perder o
  circuito de medição por conveniência é mau negócio.

## Ajustes por dispositivo e por hora

Os noivos pesquisam **à noite e ao fim de semana, e maioritariamente em
telemóvel**.

**No arranque, não faço ajuste nenhum**, e é deliberado. Com 83 cliques por mês,
um ajuste de licitação por hora não tem dados que o sustentem — seria aplicar
uma crença. O que faço é o oposto e é mais eficaz com pouco orçamento: **o
horário de exibição fica completo no primeiro mês**, precisamente para se ver
onde caem as conversões dela, e só depois se concentra.

O que está preparado para o segundo mês, em `rotina.md`: concentrar a exibição
em 18h–24h nos dias úteis e o dia inteiro ao fim de semana, se os dados o
confirmarem. Com orçamento pequeno, concentrar as horas é mais eficaz do que
ajustar percentagens — passa de estar sempre presente com pouco a estar
plenamente presente quando interessa.
