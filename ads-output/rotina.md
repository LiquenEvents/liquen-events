# Fase 7 — Rotina

O que rever, quando, e o que dispara alarme. Escrito para uma conta de
50 €/mês, o que muda mais coisas do que parece: com ~83 cliques por mês, a maior
parte do que as ferramentas chamam "insights" é ruído.

---

## A regra que manda em todas as outras

> **Abaixo de 15 cliques, a resposta é "ainda não sei" — nunca "não funciona".**

Uma keyword com três cliques e zero conversões não é uma keyword má: é uma
keyword sobre a qual não se sabe nada. Pausá-la é deitar fora tráfego às cegas.
Com este orçamento isto acontece a toda a hora, e é o erro mais comum e mais
caro numa conta pequena — quem o comete acaba com cinco keywords e a
convencer-se de que "o Google Ads não funciona para este negócio".

O script `scripts/ads-semanal.mjs` aplica esta regra por ela e separa
explicitamente as três categorias: **pausar**, **ainda não sei**, **funciona**.

---

## Todas as semanas — 10 minutos

Segunda de manhã. Exportar do Google Ads para `ads-data/`:

- Relatórios → Descarregar → CSV
- `termos-de-pesquisa.csv`, `keywords.csv`, `campanhas.csv`
- Últimos 7 dias

Depois:

```
node scripts/ads-semanal.mjs
```

Sai uma lista de acções, cada uma com o número que a justifica. **Fazer só o que
está em "O QUE FAZER".** Se disser "Nada a mudar esta semana", não mudar nada —
mexer numa campanha sem motivo é a forma mais rápida de nunca acumular dados
comparáveis.

O que rever à mão, e que o script não faz:

1. **Os anúncios foram aprovados?** Um anúncio reprovado não serve, e a Google
   avisa por email que se perde facilmente.
2. **O orçamento está a ser gasto?** Se ao fim da semana gastou muito menos do
   que 1,64 €/dia × 7, o problema é de alcance: ou o CPC máximo é baixo de mais,
   ou as keywords têm pouco volume.

## Todos os meses — 30 minutos

**1. Carregar as conversões offline** (o passo que mais vale a pena de toda esta
rotina):

- Abrir `/api/admin/conversoes` → ler o relatório
- Se aparecer `sem-valor`, corrigir o preço final no back office e voltar a abrir
- Descarregar `?ficheiro=gclid` → Google Ads → Ferramentas → Conversões →
  Carregamentos
- Procedimento completo em `medicao.md`

**2. Rever a lista de negativas** contra o relatório de termos de pesquisa do
mês inteiro. As negativas de arranque foram feitas a partir do que se sabe do
mercado, não dos dados dela — o mês real vai mostrar coisas que ninguém previu.

**3. Confrontar os pressupostos com a realidade.** Ao fim do mês 1, três números
deixam de ser palpite:

| Pressuposto | Valor usado | Onde ler o real |
|---|---|---|
| Custo por clique | 0,60 € | Relatório de campanhas |
| Conversão da landing page | 5% | Leads ÷ cliques |
| Taxa de fecho | 1 em 5 | Back office |

Se o CPC real for muito diferente, actualizar `CPC_REFERENCIA` em
`src/lib/ads/campanhas.ts` e voltar a correr `node scripts/gen-ads.mjs 50` — o
número de keywords que o orçamento sustenta ajusta-se sozinho.

**4. Verificar os Core Web Vitals** no Search Console. É a medição real de
velocidade que a Google usa, ao contrário da medição de laboratório em
`desempenho.md`.

## De três em três meses

- **Rever se a região aberta continua a ser a certa.** Critério de abertura da
  seguinte em `arranque.md`.
- **Trocar as fotografias das landing pages** por trabalho recente. As fotos por
  polo estão semeadas com o conjunto geral e substituí-las pelas da zona é a
  alteração isolada que mais converte.
- **Reconsiderar a licitação automática.** Com 15 a 30 conversões acumuladas,
  passar de CPC manual para Maximizar conversões. Antes disso não.

---

## O que dispara alarme

O script assinala os três primeiros sozinho.

| Alarme | Limiar | O que fazer |
|---|---|---|
| **Custo por lead alto** | acima de 60 € | Apertar negativas e cortar as keywords mais caras. **Não** subir orçamento |
| **Gastou sem um único lead** | 40 € sem conversões | **Primeiro confirmar que a conversão está a registar.** Uma acção de conversão mal configurada parece exactamente isto, e já custou meses a muita gente |
| **Leads mas sem valor de conversão** | qualquer | As conversões offline não estão a ser carregadas. A Google está a optimizar para formulários em vez de casamentos |
| **CTR abaixo de 2%** | 200+ impressões | O anúncio não fala do que a pessoa pesquisou, ou a correspondência é larga de mais |
| **Gasto muito abaixo do orçamento** | < 60% do previsto | CPC máximo baixo de mais, ou keywords sem volume |
| **Gasto acima do orçamento** | qualquer | A Google pode gastar até ao dobro num dia, compensando noutros. Só é alarme se o **total mensal** passar dos 50 € |
| **Formulário sem chegar** | 1 semana sem leads com cliques a subir | Testar o formulário de ponta a ponta. Um erro de envio é silencioso do lado de quem preenche |

## O que NÃO é alarme

Vale a pena escrever, porque cada um destes já fez gente estragar uma conta:

- **Uma semana sem conversões.** Com ~19 cliques por semana e 5% de conversão, o
  valor esperado é **uma** conversão. Zero numa semana é perfeitamente normal.
- **Uma keyword com 5 cliques e 0 conversões.** Ainda não se sabe nada.
- **A posição média do anúncio.** Não é uma métrica de sucesso, e perseguir a
  primeira posição num orçamento pequeno é a forma mais rápida de o gastar.
- **O Índice de Qualidade de uma keyword isolada.** Olha-se para a média, e
  sobretudo para a experiência da página de destino, que é o único componente
  sobre o qual se pode agir directamente.
- **A Google a sugerir "aplicar recomendações".** Quase todas empurram para mais
  gasto, correspondência mais larga ou automatismos que precisam de dados que
  esta conta não tem. **Desligar a aplicação automática de recomendações** é dos
  primeiros ajustes a fazer na conta.
