# Fase 4 — Medição

Sem isto, nada do resto funciona. Metade já estava feita no site e está bem
feita; digo o que já existia para não reclamar trabalho alheio.

---

## O que já existia antes deste trabalho

- **Google tag** com Google Ads (`AW-16724349653`) e GA4 (`G-29CZZ76H6F`).
- **Consent Mode v2** correctamente implementado: tudo negado por omissão,
  arranque síncrono antes do gtag.js, escolha guardada entre visitas. Sob
  "negado" continuam a sair pings sem cookies, para a Google poder **modelar**
  conversões — que é o que impede a perda de sinal na Europa.
- **Enhanced conversions**: o email e o telefone do formulário são entregues ao
  tag, que os normaliza e faz o SHA-256 **no browser** antes de saírem. Só com
  consentimento explícito.
- **`generate_lead`** disparado na página de confirmação, com `transaction_id`
  para a Google desduplicar do lado dela.
- **Sanitização do `page_location`** nas rotas com token, e o tag simplesmente
  não é montado lá.
- Eventos `QuoteStart`, `QuoteSubmit`, `CTAClick`, `WhatsAppClick`.

## O que este trabalho acrescentou

### 1. Captura do identificador do clique pago

`src/lib/ads/click-id.ts`. É a peça que liga o anúncio à venda.

- Apanha `gclid` **e** `gbraid`/`wbraid`. Estes dois existem porque a partir do
  iOS 14.5 a Google deixou de poder usar o `gclid` em parte do tráfego. Uma
  conta que só capte `gclid` perde a atribuição de uma fatia do tráfego de
  iPhone **sem dar qualquer sinal de que a está a perder**.
- Guardado em `localStorage`, **90 dias** — a janela da Google. Em
  `sessionStorage` (como a atribuição de origem que já existia) um clique de
  Janeiro desapareceria antes do pedido de Março, e a campanha que gerou o
  negócio não levava crédito nenhum.
- **Primeiro toque vence.** Um clique novo não substitui o guardado. É o que
  impede a campanha de marca de roubar o crédito: quem já nos conhece pesquisa
  "Líquen Events", e dar-lhe o crédito faria a campanha de marca parecer
  brilhante e a que faz o trabalho real parecer inútil.
- Viaja no formulário como campo `adClick` e fica gravado na base de dados.

> **Nota de implementação que quase correu mal:** o esquema de validação faz
> `.strip()`. Um campo não declarado é descartado em silêncio — o formulário
> enviaria o identificador, a rota aceitaria o pedido, e a medição de receita
> ficava vazia sem nada rebentar. `adClick` está declarado, com o comentário a
> dizer porquê.

### 2. Eventos que faltavam

| Evento | Onde | Porquê |
|---|---|---|
| `PhoneClick` | Rodapé, landing pages | Quem liga quer falar hoje. É o sinal mais forte que o site produz, e a Google não o via |
| `EmailClick` | Página internacional | O casal estrangeiro escreve antes de preencher |
| `GaleriaTempo` | Galeria, aos 15/30/60/120 s | A galeria é a peça que vende. Sem isto há um buraco entre "chegou" e "pediu" |

O tempo na galeria conta **só com o separador visível**. Sem isso, um separador
esquecido aberto uma tarde inteira dispararia todos os marcos e ensinaria à
Google que aquele visitante foi o melhor do dia — transformar esquecimento em
sinal de compra é o erro clássico das métricas de tempo.

### 3. Importação de conversões offline

**É isto que separa uma conta amadora de uma profissional.**

Um pedido de orçamento não é uma venda. Sem devolver o valor real, a Google
optimiza para **mais formulários** — o que quase sempre quer dizer os
formulários mais fáceis de obter, ou seja os piores. A conta enche-se de pedidos
de casamentos de 3 000 € e a campanha que trazia os de 25 000 € é cortada por
"converter menos".

**Como funciona, uma vez por mês:**

1. Abrir `/api/admin/conversoes` (sessão de administração). Sai o **relatório**:
   quantos casamentos fecharam, quanto valem, e o que ficou de fora e porquê.
2. Ler o relatório. Se disser `sem-valor`, é um casamento fechado sem preço
   final gravado — corrigir no back office e voltar a abrir.
3. Descarregar `/api/admin/conversoes?ficheiro=gclid`.
4. Google Ads → Ferramentas → Conversões → Carregamentos → Carregar ficheiro.
5. Se o relatório listar linhas `gbraid`/`wbraid`, repetir com esse ficheiro.
   São ficheiros separados porque a Google pede uma coluna com nome diferente
   para cada tipo, e misturá-los faz o carregamento falhar inteiro.

**O valor enviado é SEM IVA.** O IVA não é receita — é dinheiro do Estado a
passar pela conta — e enviá-lo inflacionaria o ROAS em 23%, levando a Google a
licitar mais alto do que o negócio aguenta. Este projecto já teve exactamente
este erro noutro sítio, com o `quotedPrice` gravado com IVA num campo rotulado
"sem IVA".

**O relatório diz sempre o que ficou de fora.** Um exportador que devolve seis
linhas quando havia dez negócios fechados, calado, leva alguém a concluir que a
publicidade só trouxe seis e a cortar o orçamento. Há um teste que garante que
cada casamento fechado sai como linha **ou** como exclusão explicada, nunca
desaparecido.

---

## O que ela tem de configurar no Google Ads

**Uma só vez, e é bloqueante:**

1. **Acção de conversão "Pedido de orçamento"** — importada do GA4, a partir do
   evento `generate_lead` marcado como evento-chave. Contagem: **uma** por
   clique (é um lead, não uma compra repetível).
2. **Acção de conversão "Casamento fechado"** — origem "Importar →
   Carregamentos", categoria **Compra**, valor **variável** (vem no ficheiro),
   janela de conversão **90 dias**.
   **O nome tem de ser exactamente `Casamento fechado`** — é o que vai escrito
   no CSV, e um nome diferente faz o carregamento falhar.
3. **Conversões primárias vs secundárias.** No arranque: "Pedido de orçamento"
   como **primária** (é o único sinal com volume). Quando houver 15 a 30
   casamentos fechados carregados, passar "Casamento fechado" a primária e
   "Pedido de orçamento" a secundária — e só aí ligar licitação automática.

---

## O painel: custo por lead, custo por casamento, ROAS

Foi pedido um painel num ficheiro que ela consiga abrir sozinha. **Não construí
um ecrã novo**, e explico porquê: um painel escrito por mim mostraria os números
do Google Ads que só a Google tem, o que obrigaria à API, a credenciais OAuth no
servidor e a manutenção — para uma leitura mensal de meia dúzia de linhas.

Em vez disso:

- **O lado do dinheiro real** (quantos fechados, quanto valem, quais vieram de
  anúncio) está em `/api/admin/conversoes`, que é texto simples e abre no
  browser.
- **O lado do custo** (impressões, cliques, custo) já está no Google Ads, e é
  ele a fonte de verdade.
- **O cruzamento dos dois** faz-se em `scripts/ads-semanal.mjs`, que lê os
  exports semanais dela e escreve em português o que mudar — incluindo custo por
  lead e, quando houver dados, custo por casamento fechado e ROAS por campanha.

O procedimento está em `rotina.md`. Se ao fim de três meses isto se revelar
insuficiente, aí vale a pena discutir um ecrã a sério — com dados a justificá-lo.
