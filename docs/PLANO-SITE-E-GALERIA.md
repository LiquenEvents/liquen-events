# Plano: o site e a galeria, ao pormenor

*Feito a 11/10/2026, a pedido dela. Não muda nada no site: é uma lista de
propostas para ela escolher o que se faz e o que não se faz.*

O que ela pediu, nas palavras dela:

> «quero que tu analises toda a parte da galeria, ou seja, toda a experiência
> que há à volta, ou seja, quando eu carrego numa foto … esse fundo preto, a
> forma como quando tu clicas noutra foto ela aparece … E quero que ataques
> todas as áreas do site. Todas e mais algumas. E mesmo as que não existem …
> E também toda a parte de segurança.»

---

## Parte −1 · Como se fez, e o que fica por verificar

**Quatro análises, em paralelo, só a ler e a medir.** Nenhuma mudou código,
dados ou configurações.

| Análise | Como se mediu |
|---|---|
| Galeria e o visualizador de fotografias | Build de produção (`next start`), Playwright a 1340×768, 1440×900 e 390×844, um fotograma de cada vez ao abrir, navegar e fechar; perfil de CPU; rede lenta simulada |
| Site público: desenho, textos, pedido de orçamento, SEO, acessibilidade, velocidade | 25 páginas em PT e EN nas duas larguras; axe-core em 12; Lighthouse em modo telemóvel; o formulário de orçamento de ponta a ponta, com o envio interceptado (nada foi gravado nem enviado) |
| Segurança, infraestrutura e fiabilidade | O código, os avisos do Supabase (só leitura), `npm audit`, o CI, e uma verificação por método de todas as rotas |
| Áreas novas e funções «inteligentes» | O que já existe no código, as decisões dela já escritas, e o que fazem as melhores casas do sector |

**Confirmei eu, com os meus olhos:** a mancha desfocada ao abrir uma foto, a
dupla exposição ao passar para a seguinte, que o repositório do código está
público, e que a cópia de segurança diária segue em frente mesmo quando o email
não saiu.

**Não verificado, e porquê:**

- **O iPhone e o Safari reais.** As medições foram em Chromium, sem placa
  gráfica, por isso os tempos de pintura saem mais altos do que num telemóvel. As
  comparações entre casos valem.
- **As definições da Vercel** (variáveis, protecção das pré-visualizações,
  registos). A API respondeu 403.
- **O plano do Supabase e as cópias automáticas.** Não aparecem no que se
  consegue ler.
- **Os cabeçalhos do site publicado e o DNS do email.** Esta máquina não chega lá.
- **O peso real do Google e da Meta.** Esta máquina não os alcança, por isso os
  números de velocidade são optimistas.

**As decisões dela que este plano respeita:**

- não há portal do cliente;
- a página da proposta não regista nada;
- o formulário não mostra preços;
- o automático nunca passa por cima do que uma pessoa decidiu;
- a Líquen faz decoração e coordenação do dia, não é *wedding planner*;
- ao cliente fala-se por «você», à equipa por «tu»;
- a morada e o «Alentejo» saíram dos dados estruturados;
- o slideshow da galeria saiu.

Quando uma proposta toca numa destas decisões, aparece como **pergunta**, não
como recomendação.

**Medidas:**

- **Esforço:** P = até 3 dias · M = 1 a 3 semanas · G = mais de um mês.
- **Impacto:** o que muda para quem visita ou para o negócio.

---

## Parte 0 · O essencial

1. **A galeria tem três defeitos que se vêem logo.** São exactamente os da
   captura dela.
   - Ao abrir uma foto, durante quase um segundo aparece uma **mancha
     desfocada do tamanho do ecrã** por cima da própria foto.
   - Ao passar para a seguinte, **vê-se a anterior por baixo** durante um
     instante.
   - **A foto fica pequena**: 79 % das fotografias são ao alto, e num portátil
     ficam com cerca de um quarto do ecrã. O resto é preto, barras e miniaturas.
2. **O site tem boa base técnica:**
   - nada salta ao carregar;
   - o SEO técnico está certo;
   - o inglês está completo;
   - a acessibilidade de base está acima dos 96;
   - o formulário de orçamento está muito bem pensado.

   **Mas diz pouco.** A página inicial tem cerca de 75 palavras próprias, os
   testemunhos são quatro, curtos e em maiúsculas, e não há casamentos contados.
3. **O aviso de cookies tapa o título ou o botão principal** em várias páginas
   na primeira visita, e no telemóvel esconde o «Pedir orçamento».
4. **As fotografias de topo ficam moles no telemóvel.** O ficheiro é escolhido
   pela largura, mas a foto é recortada pela altura.
5. **A segurança está bem desenhada no código, mas há quatro pontas soltas fora
   dele:**
   - **o código está público**: a fotografia que ela mandou retirar hoje ainda
     se descarrega do histórico;
   - a cópia diária pode apagar coisas sem a cópia ter saído;
   - as cópias vão sem cifra para uma caixa Gmail;
   - as fotografias não têm cópia nenhuma.
6. **A inteligência que falta está toda do lado público.** O back office já está
   à frente do site.

   A base de quase tudo é **cada fotografia saber o que mostra**: texto
   alternativo, pesquisa, «Inspira-me», quiz, SEO e assistente.

---

## Parte 1 · A galeria

### O que está bem (e não se pode estragar)

- **A foto seguinte já está à espera.** Depois de uma pausa abre em 0 ms; com a
  rede a 1,6 Mbit/s, em 29 ms.
- **O teclado está bem tratado:**
  - o foco vai para o visualizador e fica preso dentro dele;
  - Esc devolve o foco à miniatura de onde se veio;
  - o leitor de ecrã anuncia «foto n de N».
- **Os gestos:** arrastar para baixo para fechar funciona, e é bonito.
- **Movimento reduzido** respeitado.
- **Uma falha nunca deixa o ecrã preto.**
- **A ordem inteligente de ontem** (cenas afastadas, nunca duas a preto e branco
  seguidas, o mosaico do topo deitado e a cores).

### O que se vê de errado, por ordem de gravidade

| # | O que acontece | Medido |
|---|---|---|
| 1 | **Mancha desfocada ao abrir.** Ocupa a área inteira, não a forma da foto, e tapa a pré-visualização nítida que já estava pronta. | A pré-visualização está pronta aos 140 ms; a mancha só sai aos 770 ms (900 ms em rede lenta). Pintar a mancha custa 20 vezes mais do que pintar sem ela. Só as primeiras 48 fotos a têm, por isso a experiência muda de foto para foto. |
| 2 | **Dupla exposição ao navegar:** a foto anterior fica visível por baixo da nova. | Visto num fotograma aos 265 ms. |
| 3 | **A foto ocupa pouco do ecrã.** | A barra de topo, a tira de miniaturas e a linha de dicas gastam 22 % da altura. Uma foto ao alto num portátil 1440×900 fica com 27 % da área; no telemóvel deitado, com 10 %. |
| 4 | **O visualizador não tem endereço.** O «voltar» do telemóvel **sai da galeria** em vez de fechar a foto, e não se consegue mandar uma foto a ninguém. | Abrir não muda o endereço nem o histórico. |
| 5 | **O aviso de cookies fica por cima do visualizador.** | No telemóvel tapa a tira e o fundo da foto. Acontece a todos os casais que chegam pela publicidade. |
| 6 | **A foto não cresce da miniatura nem volta para ela.** Ao fechar fica um **buraco cinzento** na grelha. | O código da transição ainda lá está, mas já não corre, e continua a custar trabalho ao browser. |
| 7 | **É difícil fechar clicando no preto**: só a margem exterior de 80 px fecha. | — |
| 8 | **O deslize não segue o dedo.** Um gesto rápido e curto é ignorado. Da foto 1, para trás, salta para a 917 sem aviso. | — |
| 9 | **Não há zoom**: nem pinça, nem duplo toque. | Os pormenores (flores, louça, caligrafia) são o que um casal quer ver. |
| 10 | **A nitidez está errada nos dois sentidos.** | Fica mole num ecrã Retina (recebe 1280 px onde precisava de 2188), e no telemóvel deitado descarrega 9 vezes mais do que precisa. |
| 11 | **A tira de miniaturas fica cortada no telemóvel** e muda aos saltos. | Ocupa de −33 a 423 px num ecrã de 390. |
| 12 | **A legenda não diz nada a um casal.** «55 / 918 · EVENTO», a 10 px e meio apagada. | 435 fotos (as do Instagram) não têm nome de evento. |
| 13 | **Pequenos:** <br>· abrir perto do topo desloca a página uns 70 px; <br>· o erro mostra o ícone de imagem partida; <br>· a dica fala em «deslizar» num computador; <br>· restos do slideshow nos textos; <br>· valores fixos em vez dos tokens. | — |
| 14 | **Não se sabe que fotos vendem**: o visualizador não mede nada. | — |

### As propostas

**GAL-1 · Abrir como nas Fotografias da Apple** · M · impacto **alto**
- **Como se sente:**
  - a foto cresce do sítio exacto onde se tocou até ao lugar final, em cerca de
    300 ms, enquanto o fundo escurece;
  - ao fechar, encolhe de volta à miniatura, sem buraco na grelha;
  - a mancha desfocada desaparece: vê-se logo a miniatura nítida, e a versão
    grande entra por cima só quando estiver pronta.
- **Com movimento reduzido:** aparece e desaparece sem animação, e sem os
  260 ms de espera de hoje.
- **Risco:** se a miniatura saiu do ecrã entretanto, fecha só a esbater.

**GAL-2 · Navegar sem fantasma, com o dedo** · M · impacto **alto**
- **Como se sente:**
  - a anterior, a actual e a seguinte estão lado a lado, e a foto acompanha o
    dedo com mola;
  - muda com um gesto rápido, mesmo curto, ou a passar de 20 % da largura;
  - nas pontas, resistência elástica em vez de saltar para a 917.

**GAL-3 · O fundo com a cor da fotografia** · P · impacto **alto**
- **Como se sente:**
  - em vez de preto liso, um degradé que nasce da cor da própria foto e cai para
    quase preto;
  - ao passar à seguinte, a cor muda suavemente;
  - as cores das 917 já estão calculadas.
- **Variante:** a miniatura muito desfocada atrás. Não conta como vidro para a
  regra de uma camada por ecrã.
- **Cuidado:** os botões têm de continuar legíveis (contraste ≥ 4,5:1); a barra
  de topo mantém um degradé escuro.

**GAL-4 · Mais fotografia no ecrã** · M · impacto **alto**
- **Como se sente:**
  - a barra de topo e a tira passam a flutuar por cima da foto;
  - escondem-se ao fim de uns 2,5 s parados, e um toque na foto mostra-as ou
    esconde-as;
  - margens de 16 a 24 px;
  - no telemóvel ficam só os gestos;
  - a linha de dicas passa a um «?».
- **Ganho medido:** num portátil, a foto ao alto passa de 597 para cerca de
  720 px de altura (+46 % de área). No telemóvel deitado, de 219 para cerca de
  350 px.
- **Experimental, para ela ver antes:** em ecrã largo, duas fotos ao alto
  seguidas lado a lado, como um álbum aberto.

**GAL-5 · Cada foto com endereço, voltar fecha, partilhar** · M · impacto **alto**
- **Como se sente:**
  - o «voltar» do telemóvel fecha a foto em vez de sair do site;
  - cada foto tem endereço próprio, que se pode mandar pelo WhatsApp com a
    própria foto na pré-visualização;
  - um botão «Partilhar» abre a partilha do telemóvel; no computador, copia o
    endereço.
- **Cuidado:** não estragar o regresso ao mesmo sítio da grelha, que hoje está
  muito bem feito.

**GAL-6 · Zoom e nitidez honesta** · M · impacto **médio**
- **Como se sente:** duplo toque ou duplo clique faz zoom a 2×, a pinça faz zoom
  com arrasto, e o ficheiro grande só se pede quando se faz zoom.
- **Como se faz:**
  - acrescentar versões de 1920 px só para o visualizador;
  - pedir o tamanho certo para a forma da foto;
  - nunca ampliar acima do tamanho original.
- **Custo:** mais ficheiros no disco e um build mais longo.

**GAL-7 · Legenda com história** · M · impacto **médio-alto** · *precisa de conteúdo dela*
- **Como se sente:**
  - a legenda diz «Ana & João · Quinta X · setembro» (nomes de exemplo) e «4 de 29» desse
    casamento, em vez de «55 / 917»;
  - há um botão claro «Ver o casamento inteiro (29)» e um «Pedir orçamento»
    discreto.
- **Precisa:** que ela diga a que casamento pertence cada publicação do
  Instagram. As fotos sem casal ficam como hoje.

**GAL-8 · Cartão de fim** · P · impacto **médio**
- Depois da última foto de um casamento: «Gostou? Pedir orçamento · Ver outro
  casamento».

**GAL-9 · Correcções rápidas** · P · impacto **médio**
- a tira de miniaturas cabe no telemóvel, com a activa ao centro;
- o aviso de cookies recolhe-se enquanto se vê uma foto;
- clicar em qualquer preto fecha;
- abrir já não desloca a página por trás;
- o erro diz «Esta fotografia não carregou · Tentar de novo»;
- teclas Início/Fim, «f» para ecrã inteiro;
- as dicas só aparecem com rato;
- os restos do slideshow saem dos textos;
- o preto e as durações passam a tokens.

> **GAL-1, GAL-3 e GAL-9 — FEITAS a 11/10/2026** (ramo `feat/galeria-abrir`).
> Verificadas com `next start` a 1340×768, 1440×900 e 390×844, fotograma a
> fotograma, e com movimento reduzido. Onde a execução se afastou do texto:
>
> - **o voo dura 350 ms** e não «cerca de 300»: é o `DUR_VISTA_MS` da casa (o
>   degrau de «troca um ecrã»), para não haver um número novo;
> - **«abrir já não desloca a página por trás» não era do site.** O salto de
>   54–84 px vinha da ferramenta de medição: o clique do Playwright rola a
>   miniatura para fora da `scroll-padding-top` (144 px) antes de clicar. Com
>   um clique de rato a sério a página não se mexe — medido, ao abrir e ao
>   fechar. Ficou na mesma o `preventScroll` ao devolver o foco;
> - **o fundo é discreto de propósito:** 35 % da cor da foto no centro, a cair
>   para quase preto, para o branco dos controlos ficar acima de 7:1 mesmo
>   numa foto branca;
> - **a dica do teclado** passou a «← → navegar · f ecrã inteiro · esc
>   fechar»: só aparece com rato, portanto o «deslize no telemóvel» deixou de
>   ter a quem falar;
> - **a navegação entre fotos** mantém o esbatimento de sempre. Do 2×2 para uma
>   satélite vêem-se ~200 ms de fundo antes da foto, porque a satélite guarda
>   uma miniatura mais pequena do que a que o visualizador pede; antes, a foto
>   anterior tapava isto por baixo (era a dupla exposição). Fica para a 2.ª
>   parte, com o GAL-2.

> **GAL-2 e GAL-4 — FEITAS a 14/10/2026** (ramo `feat/galeria-dedo`), a
> pedido dela («Galeria, 2.ª parte»). Onde a execução se afastou do texto:
>
> - **a pista são três fotografias** (a anterior, a aberta e a seguinte), com
>   24 px entre elas. As vizinhas mostram a pré-visualização que já está em
>   cache e só se montam depois de a aberta chegar, ou quando um gesto começa
>   — a mesma porta da pré-carga;
> - **a mola é a da casa** (`src/lib/motion/mola.ts`, a da curadoria de
>   fotografias), com a velocidade com que o dedo sai. Quem decide se muda é
>   `decidirDeslize` (`voo.ts`): 20 % da largura, ou um gesto rápido
>   (≥ 0,3 px/ms, medido com toques simulados) a partir de 12 px. Um gesto rápido ao contrário desiste;
> - **as pontas deixaram de dar a volta em todos os caminhos**: o dedo, as
>   setas do teclado, o ‹ › (que desaparecem na primeira e na última) e a
>   pré-carga. No dedo há um elástico (`elastico`, nunca mais de ⅓ da
>   largura); nas setas, um empurrão curto;
> - **o ‹ › e as setas do teclado também deslizam**, e a tira e o Início/Fim
>   continuam a esbater-se: isto resolve os ~200 ms de fundo que a 1.ª parte
>   deixou anotados;
> - **o deslize é só na foto**: antes, deslizar na tira também mudava de foto;
> - **a barra, as setas e a tira** ficam numa só camada (`.lb-cromagem`) que se
>   esconde aos 2,5 s e fica `inert`. Um toque na foto alterna-a, mexer o rato
>   trá-la, e o primeiro Tab também;
> - **no telemóvel** (ponteiro grosso) não há tira nem ‹ ›, e a barra de cima
>   fica com o fechar;
> - **com movimento reduzido** o dedo continua a mover a foto (é manipulação
>   directa), mas ao largar a troca é imediata;
> - **ficou de fora** a experiência das duas fotos ao alto lado a lado, que o
>   texto marca como «para ela ver antes».

> **Nenhuma foto é cortada — FEITO a 15/10/2026** (ramo `fix/galeria-sem-cortes`).
> Fora da lista, a pedido dela, depois de ver uma foto ao alto (um casal à frente
> de uma capela) numa caixa deitada de 958×600, só com o céu à vista: «as fotos
> têm que ser apresentadas de acordo com as suas dimensões… torna o sistema
> super inteligente para perceber isso e fazê-lo sozinho».
>
> - **O topo deixou de ser o mosaico 2×2.** Era uma grelha de altura fixa
>   (320/480/600 px), em que a forma das caixas mudava com a largura e tudo era
>   recortado. Medido com as fotos reais: as quatro satélites recebiam uma foto
>   ao alto 87 % das vezes.
> - **Agora é uma fila «justificada»** (`FotoDaFila` em `GaleriaClient.tsx`):
>   - cada foto tem uma caixa com o SEU rácio e `flex: <rácio> 1 0%`, por isso
>     todas ficam com a mesma altura e nenhuma é recortada;
>   - é só CSS, e a altura fica reservada desde o servidor, sem salto;
>   - **quantas entram depende da largura:** 1 no telemóvel, 2 a partir de 640 px,
>     3 a partir de 768 px e 4 a partir de 1536 px. As restantes ficam na grelha.
> - **O destaque é sempre uma foto deitada** (`comMosaico`). Se não houver
>   nenhuma nas primeiras 24, procura-se na lista inteira; sem dados de análise,
>   fica a mais deitada.
> - **A grelha de baixo já usava a forma real de cada foto** e não mudou. O
>   visualizador também não, porque mostra a foto inteira.

**GAL-10 · Saber que fotografias vendem** · P · impacto **médio**
- Contar as fotos abertas, as navegações, os «Ver o casamento», as partilhas e
  os guardados. Só com consentimento, como o resto do site.
- Diz-lhe que fotografias trazem pedidos.

**As outras ideias de galeria estão na Parte 6 (IA):** «Inspira-me», pesquisa por
palavras e quiz de estilo.

---

## Parte 2 · Desenho e marca do site

**DES-1 · O aviso de cookies deixa de tapar títulos e botões** · P · impacto **alto**
- **O problema:** a página inicial já está resolvida, mas noutras páginas o
  aviso tapa:
  - o título em «Sobre», nas duas larguras;
  - o título em «Clientes» e «Galeria», no telemóvel;
  - o botão «Pedir orçamento» em «Serviços»;
  - o primeiro contacto em «Contacto».
- **A solução:** o mesmo recuo da página inicial, em todas.
- **Verificar:** um teste passa a cruzar o aviso com o título e o primeiro botão
  em todas as páginas.

**DES-2 · Fotografias de topo nítidas no telemóvel** · M · impacto **alto**
- **Medido:** no telemóvel a foto do topo aparece ampliada 2 a 3,3 vezes.
- **A solução:** recortes ao alto próprios para o telemóvel, com o ponto de
  interesse de cada foto, e uma versão maior para os portáteis Retina.
- **Precisa:** que ela escolha o recorte de cada fotografia de drone.
- **Risco:** um pouco mais de peso na primeira imagem; mede-se antes de juntar.

**DES-3 · Uma escala de letra com regra** · M · impacto **alto**
- **Hoje:**
  - o título principal vai de 88 px na página inicial a 18 px nas outras;
  - na mesma página, o título principal chega a ser mais pequeno do que os
    subtítulos;
  - há 8 a 23 textos com menos de 12 px por página;
  - os dois botões do topo da página inicial têm 9 px no telemóvel.
- **A solução:** uma escala nos tokens:
  - nenhum texto abaixo de 12 px;
  - botões e etiquetas com 14 px no mínimo;
  - o título de uma página interna nunca abaixo de uns 40 px.
- **Como se faz:** página a página, com capturas antes e depois.

**DES-4 · Uma só voz visual** · G · impacto **muito alto** · *decisão dela*
- **Hoje o site fala em três linguagens:**
  - Inter em maiúsculas sobre fotografia escura (a maior parte);
  - Playfair sobre creme (confirmação, 404, páginas legais, testemunhos);
  - a letra condensada do logótipo.
- **E também:**
  - a cor de destaque muda entre verde e ouro;
  - a página inicial são seis ecrãs seguidos do mesmo módulo (foto escura com
    legenda).
- **Proposta:**
  - um par editorial em todo o site: o Playfair nos títulos e o Inter no corpo;
  - maiúsculas só em etiquetas curtas;
  - uma cor de destaque;
  - alternar fotografia com secções claras de texto e pormenor (mesa, flores,
    papelaria).
- **Como se decide:** ela escolhe entre dois ou três estudos lado a lado antes
  de se mexer em código.

**DES-5 · O logótipo legível em qualquer fundo** · P
- Um véu suave atrás da barra, ou a versão branca do logótipo sobre fotografia.
- Corrige também o logótipo a cavalo da barra nas páginas de anúncio.

**DES-6 · Texto alinhado à esquerda no telemóvel** · P
- O justificado de que ela gosta fica no computador.
- Abaixo de 640 px abre rios entre as palavras.

**DES-7 · Menos coisas a mexer ao mesmo tempo** · P
- Hoje cada secção da página inicial «entra» com três animações, e a página
  parece sempre a carregar.
- Proposta: o topo anima, e cada secção tem um só gesto.

---

## Parte 3 · Textos e confiança

**TXT-1 · Uma página inicial que diz quem são** · M · impacto **alto** · *texto e fotos dela*
- **Hoje:** cerca de 75 palavras. O primeiro ecrã diz só «Eternizamos
  memórias»; não há um número, um testemunho nem um sítio onde trabalharam.
- **A ordem proposta:**
  1. uma frase que diz o quê e onde;
  2. três números verificáveis: eventos desde 2018, ★ 5,0 com 56 avaliações no
     Google, clientes empresariais;
  3. os serviços;
  4. um casamento em destaque;
  5. o método em quatro passos;
  6. dois testemunhos longos com fotografia;
  7. espaços onde já trabalharam;
  8. o pedido de orçamento.
- **«Sobre»:** uma carta dela, a equipa a trabalhar, o atelier.

**TXT-2 · Um só processo, uma só antecedência** · P · *decisão dela*
- **O processo está escrito de três maneiras diferentes:**
  - na página de contacto;
  - no formulário de orçamento;
  - na confirmação do pedido.
- **A antecedência:** «pelo menos 12 meses» num sítio e «alguns meses» noutro.
- **O âmbito:** há frases que prometem escolha de local, alojamento e transfers.
- Ela diz qual é a verdade, e escreve-se uma vez para servir em todo o lado.

**TXT-3 · Testemunhos que convencem** · P/M · impacto **alto**
- 15 a 20 avaliações escolhidas à mão entre as 56 do Google, por tipo de evento,
  em letra normal e não em maiúsculas, com o espaço e o mês.
- Ao lado do 5,0, a fonte: «Ver no Google · 56 avaliações».
- **Fica de fora:** avaliações em directo pela API do Google, pelas regras deles
  e pelo custo.

**TXT-4 · Botões que dizem para onde vão** · P
- Em vez de três «Ver serviços» que levam a sítios diferentes: «Ver
  casamentos», «Eventos para empresas», «Festas e celebrações».

**TXT-5 · O que as IAs lêem sobre a Líquen** · P · impacto **médio, a crescer**
- **O problema:** o ficheiro `llms.txt` contradiz o site. Diz «event-planning»
  e «wedding planning», usa o domínio com www e ainda diz «based in the
  Alentejo».
- **A solução:** passa a ser gerado das mesmas fontes que as páginas, como o
  mapa do site.

**TXT-6 · Dados legais em falta** · P · impacto **alto (obrigatório)**
- **O que falta:**
  - denominação legal, NIF e morada do responsável na política de privacidade;
  - a ligação ao **Livro de Reclamações Electrónico** no rodapé (obrigatória
    para quem presta serviços a consumidores) — **feita a 17/10**, a pedido
    dela: o logótipo oficial que ela mandou, em silhueta branca, no canto do
    rodapé ao lado de «Privacidade» (a escolha dela: transparente, como o
    resto), em todas as páginas, a abrir `livroreclamacoes.pt` numa janela nova;
  - uma **declaração de acessibilidade**.
- **Precisa:** os dados são dela, e o texto deve ser revisto por um advogado.

**TXT-7 · A política de privacidade de acordo com o que o site faz** · M · impacto **médio (RGPD)**
- Acrescentar a Meta, a DeepL e os outros serviços pelo nome.
- Tirar a «área de cliente» e a «aceitação com IP», que já não existem.
- Trocar «Não partilhamos os seus dados» por «Não vendemos os seus dados».
- **Decisão dela:** o Google carregar só depois de «Aceitar». Mede-se um pouco
  menos, mas fica do lado seguro da lei europeia.

**TXT-8 · Limpeza** · P
- Os títulos passam a minúsculas, à portuguesa.
- Saem os textos mortos dos dicionários (um formulário inteiro que já não
  existe) e o código do fundo animado que está desligado.

---

## Parte 4 · O pedido de orçamento

**O que está muito bem:**
- pede email OU telemóvel;
- aceita «data ainda a definir»;
- os nomes do casal não presumem o género;
- guarda o rascunho na sessão;
- a confirmação é pessoal.

**PED-1 · A cortina verde nas páginas de anúncio e no formulário** · P · *decisão dela (a A3 da auditoria anterior)*
- **Medido:** no telemóvel são 2,3 s de ecrã verde antes da primeira coisa útil,
  também em `/orcamento` e nas páginas de anúncio. É quem chega pelo Instagram,
  com rede fraca, a pagar por cada clique.
- **Proposta:** a cortina continua no resto do site, mas nessas páginas não
  aparece, ou só aparece uma vez por visita.

**PED-2 · «Pedir orçamento» sempre à mão no telemóvel** · P · impacto **alto**
- **Hoje:**
  - o cabeçalho do telemóvel não tem botão de orçamento;
  - o botão flutuante esconde-se enquanto o aviso de cookies está aberto;
  - com o menu aberto, o «Pedir orçamento» fica por baixo do aviso.
- **Proposta:** «Orçamento» compacto no cabeçalho, ao lado do menu. O PT/EN
  passa para dentro do menu.

**PED-3 · Uma só barra em baixo no telemóvel** · M
- Hoje o «Pedir orçamento», o WhatsApp e a seta empilham-se, e o WhatsApp fica
  por cima do texto.
- Proposta: um só elemento com os dois lado a lado.

**PED-4 · Tranquilizar à beira do formulário** · P · impacto **alto**
- Uma frase com o prazo de resposta (por exemplo «Respondemos em até 2 dias
  úteis»; o prazo é ela que diz) por baixo do botão e na confirmação.
- No computador, um testemunho e o «★ 5,0 · 56 avaliações» ao lado do
  formulário.

**PED-5 · Erros do formulário mais claros** · P
- Hoje, ao enviar vazio, o leitor de ecrã anuncia 7 erros seguidos, e os erros
  têm 11 px.
- Proposta: um resumo no topo («Faltam 3 campos») e os erros com letra maior.

**PED-6 · Marcar uma conversa logo a seguir ao pedido** · P (ligação) a M (marcações) · impacto **médio-alto**
- Na confirmação: «Quer já marcar 20 minutos por videochamada?»
- **Precisa:** que ela diga os dias e as horas.

**PED-7 · Uma confirmação que continua a conversa** · P
- O que acontece a seguir, com prazos reais.
- Duas ou três histórias da mesma região ou estilo.
- «Guardar as minhas inspirações».
- **Sem mexer** na medição das conversões que lá está.

**PED-8 · WhatsApp com contexto** · P
- A mensagem pré-escrita diz de onde vem («Olá! Vi a página de casamentos no
  Alentejo…»).

**PED-9 · Investimento opcional** · M · *decisão dela*
- Um campo opcional («até 5 k / 5–15 k / 15–30 k / 30 k+ / prefiro conversar»),
  só em casamentos e eventos de empresa.
- Ajuda a qualificar o pedido e a desenhar a proposta, e não mostra preços.

**PED-10 · Acabar o pedido mais tarde** · M
- Só com o «sim» da pessoa: «Envie-me um link para acabar depois».
- Apanhar o email sem a pessoa carregar em Enviar, não.

**PED-11 · A data está livre?** · M · *decisão dela*
- **Como seria:** «disponível» ou «temos compromissos perto desta data — fale
  connosco»; nunca «ocupado».
- **A favor:** dá urgência.
- **Contra:**
  - mostra aos concorrentes quanto trabalho há;
  - a regra interna de «ocupado» depende da distância e da equipa, e pode
    afastar um evento que ela aceitaria.

---

## Parte 5 · Navegação, velocidade, pesquisa e acessibilidade

**NAV-1 · Rodapé completo** · P · ajuda também a pesquisa
- Quatro colunas: Páginas, Serviços, Casamentos por região, Contacto.
- Mais o LinkedIn, o Livro de Reclamações e o NIF.

**NAV-2 · `/casamentos` como página-índice** · M
- **Hoje:** dá 404, apesar de haver 13 páginas de regiões, 3 de estilos e a de
  casamentos de destino. Nenhuma está ligada a partir do menu ou do rodapé.
- **A solução:** uma página com o mapa ou a lista das regiões, ligada a partir de
  «Serviços › Casamentos».

**NAV-3 · Cabeçalho do telemóvel** · P
- A área de toque do «EN» mede 24 px (devia ter 44).
- A barra translúcida deixa ler o texto por baixo.

**NAV-4 · Uma letra a menos à frente de tudo** · P
- O Playfair (38 KB) é pré-carregado em todas as páginas, à frente da foto de
  topo, e só é usado em algumas.

**NAV-5 · Imagens de partilha próprias** · P/M
- Hoje, ao partilhar uma página, vai uma foto de até 900 KB, no formato errado e
  com «&» no nome.
- A solução: uma imagem de 1200×630 por página, com a fotografia e o título.

**NAV-6 · Contraste** · P
- Quatro sítios com texto pequeno e claro demais:
  - as etiquetas da página de contacto;
  - o contador de clientes;
  - as páginas das regiões;
  - «MEMÓRIAS» sobre a foto.

**NAV-7 · Texto alternativo nas fotografias de trabalho** · P (à mão) / M (com IA, ver IA-1)
- Hoje é vazio ou genérico.
- Ajuda o Google Imagens e quem usa leitor de ecrã.

**NAV-8 · Sugerir inglês a quem chega em inglês** · P
- Uma faixa discreta, nunca um redireccionamento.

**NAV-9 · Endereços em inglês** (`/en/services/weddings`) · G
- Só se o mercado de casamentos de destino o justificar.

---

## Parte 6 · Um site inteligente

**As quatro regras:**

1. **Sabe tudo, mas só diz o que é verdade.** Responde a partir do que a Líquen
   escreveu, e nunca inventa preços, datas livres ou fornecedores.
2. **Ajuda a pessoa a explicar o que imagina.** A inteligência que mais rende é a
   que traz pedidos mais ricos, não a que conversa mais.
3. **Quem decide é uma pessoa.** A IA sugere, resume e ordena; ela aprova.
4. **A privacidade faz parte da marca.**

**IA-0 · As regras da IA, antes de tudo** · P/M
- Um módulo único com:
  - um interruptor para desligar tudo;
  - um tecto de custo;
  - registos sem dados pessoais;
  - perguntas de teste;
  - o acordo de tratamento de dados com o fornecedor;
  - uma linha na política de privacidade.

**IA-1 · Cada fotografia sabe o que mostra** · M · impacto **é a base de tudo**
- **O que cada foto passa a ter:**
  - texto alternativo em PT e EN;
  - legenda curta;
  - etiquetas de peça, paleta, estilo, momento do dia, interior ou exterior.
- **Como se faz:** uma IA descreve as 917 de uma vez. O vocabulário é o mesmo das
  etiquetas da Biblioteca dos Temas, para não haver dois.
- **Revisão:** ela aceita ou corrige num ecrã de revisão, como o da Biblioteca.
  A IA nunca escreve por cima do que uma pessoa pôs, e nunca nomeia ninguém.
- **Custo estimado:** menos de 50 € de API, uma vez só. A página não chama a IA.

**IA-2 · «Inspira-me»: guardar fotografias e mandá-las com o pedido** · M · impacto **alto**
- **Como se sente:**
  - um coração em cada foto;
  - um botão «As suas inspirações (7)»;
  - «Enviar com o pedido» abre o formulário com o quadro anexado.
- **No back office:** o pedido mostra o quadro, e há um botão «Começar um tema a
  partir destas».
- **Privacidade:** os guardados ficam só no telemóvel ou computador da pessoa
  até ao envio.
- **Porque vale:** é a ideia com melhor relação entre esforço e ganho. Com doze
  fotografias escolhidas, a primeira proposta acerta.

**IA-3 · Pesquisar a galeria por palavras** · M · impacto **médio** · precisa de IA-1
- **Como se sente:**
  - «mesas rústicas com velas», «tons de sálvia», «arco de flores secas»;
  - sem resultados, a página diz: «Não temos esta fotografia, mas podemos
    desenhá-la — peça-nos», e leva ao formulário com a frase escrita.
- **Privacidade:** corre no browser e não guarda pesquisas.

**IA-4 · Quiz de estilo** · P/M · impacto **médio** · precisa de IA-1
- **Como se sente:**
  - seis ou sete ecrãs de «qual destas duas?», com fotografias da Líquen;
  - o resultado é um dos estilos que já existem, com a paleta;
  - leva para a página desse estilo, com o quadro de inspirações já preenchido.
- **Porque vale:** é uma boa porta de entrada para os anúncios.

**IA-5 · Resumo automático de cada pedido, no back office** · M · impacto **médio-alto**
- **O que faz:**
  - três linhas de resumo;
  - os sinais de estilo e de paleta;
  - temas da biblioteca sugeridos;
  - o que falta perguntar.
- **Como aparece:** como sugestão, escrita por «tu».
- **Privacidade:** o telefone e o email não vão para a IA.

**IA-6 · Triar e responder depressa** · P/M · impacto **alto**
- **Cartão de prioridade em cada pedido, com o porquê.** Os critérios:
  - a data;
  - a região;
  - os convidados;
  - o tipo de evento;
  - a mensagem;
  - um choque de datas.

  É uma ordenação, não uma decisão.
- **Nas Estatísticas:** o tempo até à primeira resposta (pela mediana).
- **Um segundo aviso** se um pedido importante ficar sem resposta. Isto precisa
  de correr mais vezes do que uma por dia (ver SEG-9).

**IA-7 · O assistente no site («Perguntar à Líquen»)** · M→G · impacto **incerto** · *decisão dela*
- **Como abre:** «Sou um assistente automático. Para propostas, falamos nós.»
  Esta frase é obrigatória desde agosto de 2026 (Regulamento Europeu da IA,
  art. 50.º).
- **Como funciona:**
  - responde só com o que a Líquen escreveu;
  - quando a conversa fica séria, passa-a à Catarina com o pedido já
    preenchido.
- **Nunca:**
  - dá preços;
  - confirma datas;
  - diz *wedding planner*.
- **Para começar, mais pequeno:** uma pesquisa nas perguntas frequentes que
  responde e cita de onde tirou a resposta.
- **O risco:** num estúdio boutique, um robô mal afinado custa mais do que rende.

**IA-8 · Um revisor da tradução** · P
- Compara o PT e o EN com um glossário («coordenação do dia», nunca *planner*)
  e aponta as diferenças, sem corrigir sozinho.

**IA-9 · A página inicial adapta-se a quem chega** · M · impacto **médio**
- Quem vem de uma página de empresas vê primeiro a prova corporativa.
- Quem vem do Alentejo ou da Comporta vê histórias dessa região.
- Na época alta: «Estamos a fechar datas de 2027».
- Nada vai para o servidor.

---

## Parte 7 · Conteúdo que traz pedidos

**CON-1 · Casamentos reais contados** · M (modelo) + P por história · impacto **muito alto**
- **Uma página por casal:**
  - o espaço, a paleta e o estilo;
  - 15 a 25 fotografias;
  - uma frase do casal;
  - os créditos dos fornecedores;
  - «Quero algo assim» leva ao formulário com as fotos no quadro de
    inspirações.
- **Porque vale:** é o padrão número um das melhores casas, e o que mais pesa
  nas pesquisas («casamento quinta Alentejo terracota») e na confiança.
- **Precisa:** autorização escrita de cada casal e do fotógrafo.
- **Como se escreve:** a IA faz um rascunho a partir do guião e da proposta, e ela
  reescreve na voz dela.

**CON-2 · Guias de espaços** («Casar na Herdade X») · G, contínuo · impacto **alto a prazo**
- **O que tem cada guia:**
  - capacidade;
  - onde fica a cerimónia;
  - o que funciona lá;
  - as fotografias da Líquen nesse espaço.
- Cada guia fica por baixo da página da região.

**CON-3 · Diário** · P por artigo
- Um artigo por mês, na voz dela. A IA ajuda a fazer o esqueleto, mas não
  escreve em série, porque o Google penaliza isso.

**CON-4 · Perguntas frequentes por serviço e por região** · P

**CON-5 · Imprensa e prémios** («onde nos viram») · P · *se houver*

---

## Parte 8 · Depois do pedido e depois do evento (sem portal)

**POS-1 · O guião do dia enviado a cada fornecedor** · P
- Por email, com PDF e só com a parte que lhe diz respeito.

**POS-2 · A folha de contactos do dia** · P
- Para a equipa e os fornecedores.

**POS-3 · O email duas a três semanas depois do evento** · P · impacto **alto e cumulativo**
- **O que leva:**
  - o agradecimento;
  - a ligação directa para a avaliação no Google;
  - o pedido de autorização para contar a história, com caixas para escolher:
    nome, fotografias, espaço.
- **Porque vale:** é o motor de TXT-3 e de CON-1.

**POS-4 · Um ano depois: «Feliz primeiro aniversário»** · P
- Com um pedido de recomendação, e a opção de sair em cada email.

**POS-5 · As inspirações do casal aparecem na proposta** · P/M · precisa de IA-2
- Como «as vossas referências», sem registar nada na página da proposta.

---

## Parte 9 · Saber o que funciona

**NEG-1 · O funil inteiro** · M · impacto **alto**
- Visita → pedido → proposta → ganho, por origem, campanha, região e estilo.
- O custo por evento ganho, com o gasto em anúncios lançado à mão.

**NEG-2 · Procura e época** · P
- Que fins de semana de 2027 são mais pedidos, com quanta antecedência, e que
  regiões crescem.

**NEG-3 · Um resumo do mês escrito pela IA** · P
- Só com números agregados, sem dados pessoais.

**NEG-4 · Testes A/B** · M · *só quando houver tráfego*
- Com dezenas de pedidos por mês, demoram meses a dar uma resposta.

---

## Parte 10 · Segurança e fiabilidade

**O que está bem, e muito:**
- a sessão da equipa;
- a protecção contra adivinhar palavras-passe;
- o segundo factor e as passkeys;
- todas as rotas do back office estão guardadas (verificado método a método);
- os links do casal;
- os cabeçalhos de segurança;
- o armazenamento privado;
- os registos sem dados pessoais;
- zero vulnerabilidades nas dependências do produto;
- análise automática do código em cada PR.

**O que falta está quase todo fora do código.** Os pormenores técnicos ficam fora
deste ficheiro, porque o repositório está público. Ficam no plano privado dela,
e entram aqui quando o repositório fechar.

**SEG-1 · Fechar o código ao público** · P · **urgente** · *decisão e definições dela*
- **O que se faz:**
  - o repositório passa a privado;
  - mudam-se as chaves principais;
  - **apaga-se do histórico a fotografia que ela mandou retirar hoje**, que ainda
    se descarrega de lá;
  - limpa-se a cópia dessa fotografia que a Vercel guarda.
- **O custo:** mudar a chave das sessões fecha as sessões abertas e os links de
  proposta antigos. Faz-se num momento escolhido por ela.

**SEG-2 · A cópia diária só avança se o email tiver saído** · P · impacto **alto**
- **Hoje:** se o envio falhar, a tarefa marca a cópia como feita, aplica a
  retenção e esvazia a Reciclagem na mesma, sem cópia desse dia.
- **A correcção:** cinco linhas e um teste. **Não precisa de decisão.**

**SEG-3 · Proteger o formulário público contra robôs** · M · impacto **alto**
- O que se faz:
  - uma verificação invisível (sem cookies de rastreio);
  - um limite partilhado entre servidores;
  - um tecto diário de confirmações.
- **Porque importa:** o email que leva as propostas é o mesmo que confirma os
  pedidos. Isto protege-o.

**SEG-4 · Cópias de segurança cifradas, fora de uma caixa pessoal, com prazo** · M · impacto **alto (RGPD)**
- **Hoje:** cada cópia diária, com todos os clientes, fica em claro num Gmail,
  para sempre.
- **A proposta:**
  - cifrar com uma chave que só ela guarda, offline e em duas cópias;
  - apagar as cópias antigas com um prazo escrito na política;
  - a prazo, passar o email para o domínio próprio, com acordo de tratamento de
    dados.

**SEG-5 · Cópia das fotografias e ensaio de reposição** · M · *custo mensal*
- **Hoje:** os mood boards, as fotos dos pedidos e a Biblioteca de Temas não têm
  cópia nenhuma.
- **A proposta:**
  - o plano pago do Supabase, com cópias automáticas;
  - uma cópia mensal das fotografias para fora;
  - **fazer uma vez o ensaio de reposição**, que está escrito e nunca foi feito
    (cerca de 1 h).

**SEG-6 · Saber logo quando alguma coisa cai** · P
- Alertas de erros ligados.
- Um vigia externo a ver o site de 5 em 5 minutos, e a base de dados também.
- Um aviso se a cópia diária tiver mais de 26 horas.

**SEG-7 · Entrada da equipa mais forte** · M/G
- **O que se faz:**
  - segundo factor obrigatório;
  - um email «novo dispositivo registado» e «nova entrada»;
  - um registo de entradas visível no back office;
  - tirar alguém da equipa fecha logo a sessão dessa pessoa.
- **Antes de exigir o segundo factor:** registar dois aparelhos, para ninguém
  ficar trancado fora.

**SEG-8 · As pré-visualizações não tocam na base de dados real** · P/M · *a confirmar nas definições*
- Cada versão de teste publicada pode estar a ler e escrever nos dados reais e a
  mandar emails reais.
- Confirma-se nas definições da Vercel, e separa-se.

**SEG-9 · Plano comercial na Vercel** · P · *custo mensal, decisão dela*
- **Porquê:** as condições do plano gratuito são para uso pessoal, não
  comercial, e uma suspensão deixava o site, o formulário e o back office em
  baixo ao mesmo tempo.
- **O que traz:**
  - tarefas agendadas mais frequentes (o segundo aviso de IA-6);
  - registos mais longos.

**SEG-10 · Higiene** · P cada uma
- uma protecção extra nas páginas do back office e da proposta;
- endereços das fotos do casal com prazo mais curto;
- três pendentes pequenos de auditorias anteriores;
- as acções do CI fixadas por versão exacta;
- aplicar as três migrações de base de dados que estão escritas e por aplicar
  (B1, B2, B4) — **com o «sim» dela**.

---

## Parte 11 · Áreas que ainda não existem

| Área | O que seria | Esforço | Pergunta para ela |
|---|---|---|---|
| **Empresas** | Uma página com casos corporativos, uma apresentação em PDF, informação para compras (faturação, seguros, prazos) e um pedido com campos próprios | M | O corporativo é para crescer? |
| **Aluguer de peças** | Um catálogo a partir do Inventário, para outros profissionais e casais que fazem eles próprios | G | É um negócio que quer ter? |
| **Espaços parceiros** | Uma página de espaços com recomendação mútua (liga a CON-2) | M | Há espaços com quem já tem essa relação? |
| **Trabalhe connosco** | Para montadores e freelancers | P | Precisa? |
| **Mais línguas** | FR, ES ou DE só nas páginas de casamentos de destino | M por língua | De que países chegam? |

---

## Parte 12 · Roteiro proposto

**A lógica:**
1. Primeiro o que é urgente ou tapa coisas.
2. Depois o que ela vê todos os dias (a galeria).
3. Depois o que traz e segura pedidos.
4. A base da inteligência (fotografias descritas).
5. Só no fim o que a usa.

### AGORA (2 a 4 semanas)

| | O quê | Esforço |
|---|---|---|
| 1 | **SEG-1** fechar o código e apagar do histórico a foto retirada *(precisa do «sim» dela)* | P |
| 2 | **SEG-2** a cópia diária não apaga sem cópia | P |
| 3 | **GAL-1 + GAL-3 + GAL-9** abrir sem mancha, crescer da miniatura, fundo com a cor da foto, correcções rápidas — **feito a 11/10** | M |
| 4 | **DES-1 + PED-2** o aviso deixa de tapar títulos e botões; «Orçamento» no cabeçalho do telemóvel | P |
| 5 | **TXT-6** dados legais, Livro de Reclamações, declaração de acessibilidade *(dados dela)* | P |
| 6 | **TXT-5 + TXT-4 + NAV-1 + NAV-4 + NAV-6** `llms.txt`, botões, rodapé, letra, contraste | P |
| 7 | **SEG-6** alertas e vigia | P |

### A SEGUIR (1 a 3 meses)

| | O quê | Esforço |
|---|---|---|
| 8 | **GAL-2 + GAL-4 + GAL-5** navegar com o dedo, mais foto no ecrã, endereço e partilha | M |
| 9 | **DES-2 + DES-3** fotos de topo nítidas no telemóvel, escala de letra | M |
| 10 | **POS-3 + TXT-3** email depois do evento; testemunhos verdadeiros | P |
| 11 | **IA-0 + IA-1** regras da IA e fotografias descritas | M |
| 12 | **IA-2** «Inspira-me» | M |
| 13 | **IA-6 + PED-4 + PED-6 + PED-7** triar e responder depressa, tranquilizar, marcar conversa, confirmação | P/M |
| 14 | **SEG-3 + SEG-4 + SEG-5 + SEG-8** formulário, cópias cifradas, fotos com cópia, ensaio, pré-visualizações | M |
| 15 | **TXT-1 + TXT-2 + NAV-2** página inicial, «Sobre», processo único, `/casamentos` *(texto dela)* | M |

### DEPOIS (3 a 12 meses)

| | O quê | Esforço |
|---|---|---|
| 16 | **DES-4** uma só voz visual *(ela escolhe entre estudos)* | G |
| 17 | **CON-1** casamentos reais (as primeiras 4 a 6) | M + P cada |
| 18 | **GAL-6 + GAL-7 + GAL-10** zoom, legendas com história, medir o que vende | M |
| 19 | **IA-3 + IA-4 + IA-5** pesquisa, quiz, resumo do pedido | M |
| 20 | **NEG-1 a NEG-3** o funil e o mês | M |
| 21 | **SEG-7 + SEG-10** entrada mais forte e higiene | M |
| 22 | **IA-7** o assistente, só se ela quiser e com conteúdo pronto | M→G |
| 23 | **CON-2 + CON-3**, áreas novas, mais línguas | G, contínuo |

---

## Parte 13 · Perguntas que só ela pode responder

1. **Segurança:** posso pôr o repositório privado, mudar as chaves e apagar a
   fotografia do histórico? Em que dia? (Fecha as sessões abertas e os links de
   proposta antigos.)
2. **Cortina verde:** fica também nas páginas de anúncio e no formulário, ou
   aparece só uma vez por visita nessas páginas?
3. **Prazo de resposta:** que frase posso pôr? «Respondemos em até … dias
   úteis.»
4. **Antecedência e âmbito:** quanto tempo antes devem marcar? Fazem escolha de
   local, alojamento e transfers, ou só decoração e coordenação?
5. **Preço:** algum valor de referência («a partir de»), um campo opcional de
   investimento, ou nada?
6. **Datas:** o site pode dizer se uma data está livre? Com que palavras?
7. **IA:**
   - posso descrever as fotografias com IA (custo único abaixo de 50 €)?
   - quer um assistente no site? O que é que ele nunca pode dizer?
8. **Histórias reais:** que casais aceitariam? Quem são os fotógrafos?
9. **Voz visual:** quer ver dois ou três estudos lado a lado antes de se mexer
   no desenho?
10. **Dados legais:** denominação, NIF e morada para a política e o rodapé.
11. **Custos mensais:**
    - plano comercial da Vercel;
    - plano pago do Supabase (cópias automáticas);
    - uma ferramenta de marcações;
    - API de IA.
12. **Conversas:** quer marcações automáticas de 20 minutos? Em que dias e
    horas?
13. **Empresas, aluguer, línguas:** alguma destas é para crescer?
14. **Números de hoje:** quantos pedidos por mês, que parte ganha, quanto tempo
    até à primeira resposta? É isto que decide o valor da IA-6 e dos testes A/B.
15. **Avaliações:** pode pedir-se a todos depois do evento? Quando: duas semanas
    depois, ou depois de entregues as fotografias?
