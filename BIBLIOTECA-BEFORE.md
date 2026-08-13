# BIBLIOTECA-BEFORE — o que o modal da Biblioteca de Temas faz hoje

Fase 0 da missão do modal lento. **Diagnóstico por leitura do código**, com os
limites dessa leitura ditos onde existem.

> ## ⚠️ O que NÃO foi medido, e porquê
>
> Os tempos e os bytes desta missão **não foram medidos**. As fotos vivem num
> bucket **privado** de Supabase e esta máquina não tem as chaves; sem elas o
> modal abre vazio e não há grelha nenhuma para cronometrar.
>
> O que se segue é o que o **código faz** — contagens de pedidos, ordem, e onde
> um espera pelo outro. Isso lê-se com certeza. Os milissegundos e os KB ficam
> por medir e estão marcados como tal, em vez de preenchidos com estimativas
> que pareceriam medições.

---

## Resposta directa às 6 perguntas

### 1. Quantos pedidos de imagem dispara ao abrir? 14 ou 104?

**Nem um nem outro: dispara os do tema activo, e mais nada.** Com 104 fotos em
6 temas, são as ~17 do tema que abre.

`ThemePicker.tsx:278` pede **uma página**:

```
GET /api/temas/{id}/imagens?offset=0&limit=60
```

`THEME_PAGE_SIZE = 60` (`theme-types.ts:68`). Os outros 5 temas **não são
pedidos** até alguém lhes tocar no separador.

**A hipótese central da missão não se confirma.** Não há 104 pedidos, e
portanto não há 90 pedidos indesejados a entupir a fila.

### 2. As 14 que interessam ficam presas atrás de 90 que não interessam?

**Não.** Decorre da resposta 1: as outras 90 nunca chegam a ser pedidas.

O limite de 6 ligações por servidor também não se aplica como a pergunta supõe:
os URLs das fotos apontam para o domínio do **Supabase Storage**, não para o
domínio da aplicação, e são HTTP/2 — onde o limite de 6 não existe.

### 3. Os URLs são assinados um a um? Quantos round trips antes do primeiro byte?

**Assinados em LOTE, um pedido para a página toda.** `theme-storage.ts:933` usa
`createSignedUrls` (plural) com a lista dos caminhos de uma vez.

Melhor ainda: os originais e as miniaturas são assinados **em paralelo**
(`Promise.all` em `listThemeImagePage`, linha 1033), portanto são duas chamadas
ao Storage, não duas sequenciais.

**Round trips antes do primeiro byte de imagem: 4.**

| # | O quê | Quem espera por quem |
| --- | --- | --- |
| 1 | `GET /api/temas` | — |
| 2 | listagem da pasta no Storage | dentro do #3 |
| 3 | `GET /api/temas/{id}/imagens` | **espera pelo #1** |
| 4 | primeira imagem | espera pelo #3 |

### 4. Que tamanho tem cada ficheiro, e em que tamanho é exibido?

**Não medido** (ver o aviso no topo). O que o código diz:

- **Com miniatura** — `theme-storage.ts` gera-as no carregamento; o comentário
  em `ThemePicker.tsx:60` regista **~25 KB** medidos noutra ocasião.
- **Sem miniatura** — as fotos anteriores às miniaturas existirem obrigam a
  puxar o **original**, registado como **~2,6 MB**, para desenhar uma célula de
  **150 px**.

**Quantas das 104 fotos dela têm miniatura é a incógnita que decide tudo**, e
não se pode responder daqui. Se forem todas, a grelha são ~2,6 MB no total; se
nenhuma tiver, são ~270 MB. É a primeira coisa a confirmar com o Supabase
ligado.

Existe já mitigação para o caso mau: um tecto de **3 originais em voo**
(`HEAVY_IMAGE_CONCURRENCY`), com a medição que o justifica escrita no código —
sem tecto, a primeira foto aparecia aos 26 351 ms; com ele, aos 1405 ms.

### 5. Há um pedido que bloqueia todos os outros?

**Sim — e é esta a causa verdadeira do que ela vê.**

`GET /api/temas` tem de **terminar** antes de qualquer imagem ser pedida. A
razão está na forma como os dois efeitos se encadeiam:

```
efeito A (linha 233): fetch /api/temas  →  setThemeId(...)
efeito B (linha 263): [themeId]         →  fetch das imagens
```

O efeito B tem `themeId` nas dependências e desiste com `if (!themeId) return`.
Logo: **enquanto `/api/temas` não responder, não se pede uma única imagem.**

E é exactamente isto que explica o sintoma descrito — *"os separadores com as
contagens aparecem logo, mas a grelha fica em skeletons cinzentos durante
segundos"*. Os separadores aparecem quando o #1 responde; a grelha só arranca
**depois** disso.

### 6. Trocar de separador refaz tudo? Fechar e reabrir perde tudo?

**Sim às duas.**

- **Trocar de separador** — o efeito da linha 263 corre outra vez e começa por
  `setImages([])`, `setTotal(null)`, … Um tema já visitado é **integralmente
  repedido**. Não há memória nenhuma.
- **Fechar e reabrir** — o componente desmonta e todo o estado morre com ele.
  A reabertura repete **os dois** pedidos, incluindo `/api/temas`, que nunca
  muda de um minuto para o outro.

O único fio de memória é `localStorage`, e guarda só o **id** do último tema
(`LAST_THEME_KEY`) — o suficiente para abrir no sítio certo, nada do conteúdo.

---

## O que isto muda no plano da missão

Três dos seis agentes assentam em premissas que o código não confirma. Fica
dito antes de se gastar trabalho nelas.

| Agente | Premissa | Verdade |
| --- | --- | --- |
| 1 — carregar só o tema activo | pede os 6 temas | **já faz isso** (`limit=60`, um tema) |
| 4 — assinar em lote | assina um a um | **já assina em lote** (`createSignedUrls`) |
| 2, 5, 6 | — | continuam a valer inteiros |

**O que sobra, por ordem de efeito:**

1. **Matar a espera de `/api/temas`** (o achado 5). É o único bloqueio a sério.
   Duas saídas, e a segunda é melhor: pedir as imagens do último tema **em
   paralelo** com a lista (o id já está em `localStorage`, não é preciso
   esperar por ninguém para o saber); ou o servidor devolver a lista de temas
   **com a primeira página do primeiro tema já lá dentro**, num pedido só.
2. **Cache entre aberturas** (Agente 5). Hoje reabrir repete tudo, e é a
   diferença entre "instantâneo" e "outra vez os segundos todos".
3. **Pré-carregar ao passar o rato** (Agente 2).
4. **Nunca mostrar caixas cinzentas** (Agente 6).
5. **Miniaturas para as que não têm** (Agente 3) — mas primeiro **medir quantas
   são**. Se forem todas as 104 a ter, este agente não tem trabalho.

---

## O que falta medir, e como

Com o Supabase ligado, por esta ordem:

1. **Quantas das 104 têm miniatura.** Decide se o Agente 3 é a prioridade ou
   trabalho nenhum.
2. **Quanto demora `/api/temas` a responder.** É a duração exacta do bloqueio.
3. **Região do bucket vs. região da Vercel.** Cada round trip paga a travessia,
   e são 4 antes do primeiro pixel.
4. **Bytes e tempo até à primeira imagem**, com 4G lento e CPU 4×, para ter a
   coluna "antes" a sério desta tabela.
