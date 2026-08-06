# Sem teclado

**A regra:** no telemóvel, tudo o que o back office faz tem de se poder fazer
com o dedo. Um atalho de teclado é um caminho mais rápido para quem tem teclas
— nunca o único caminho, e nunca uma instrução dada a quem não as tem.

São duas exigências, e falha-se as duas de maneiras diferentes:

1. **Nenhuma acção só por tecla.** Se a única forma de desfazer é `Cmd+Z`,
   então desfazer é uma coisa que não se pode fazer no telemóvel.
2. **Nenhuma etiqueta de tecla à vista.** Um `ESC` desenhado num ecrã de toque
   é uma instrução impossível de seguir, e ocupa espaço que ali falta.

O CI guarda as duas: `e2e/admin-mobile.spec.ts`, teste
_"nada precisa de teclado, e nada anuncia teclas"_.

---

## Como se esconde uma dica de teclado

Com a variante `pointer-coarse:` do Tailwind — **não** com a largura do ecrã.
São dois eixos independentes: a largura decide o LAYOUT, o ponteiro decide os
ALVOS e as dicas. Um iPad de 1024 px é um ecrã largo e é um ecrã de toque.

```tsx
<kbd className="pointer-coarse:hidden …">⌘K</kbd>
```

### A armadilha que isto tem, medida

Para o caso inverso — mostrar SÓ no toque — o que parece natural não funciona:

```tsx
/* ERRADO: nunca aparece, em ecrã de toque nenhum. */
className = "hidden pointer-coarse:flex";
```

O Tailwind arruma todas as classes de `display` no mesmo grupo, e dentro dele
`.hidden` sai depois de `.flex`. Ganha à variante, media query e tudo. Medido no
botão de fechar da paleta de comandos: `display: none`, 0x0, num aparelho com
`(pointer: coarse)` verdadeiro.

```tsx
/* CERTO: visível por omissão, escondido em quem tem ponteiro fino. */
className = "flex pointer-fine:hidden";
```

A regra que sobra: **a variante tem de estar do lado de quem esconde.**

---

## O que existia só por tecla, e o que passou a ter botão

| Acção | Tecla | Botão (toque) |
| --- | --- | --- |
| Desfazer no estúdio de propostas | `Cmd/Ctrl+Z` | **"Desfazer"**, ao lado de "Limpar rascunho" — apagado quando não há para onde voltar |
| Pesquisa global / navegação | `⌘K` | **Lupa** na barra de topo. Estava `hidden sm:flex`: abaixo de 640 px não existia botão nenhum, e o ⌘K não existe num telemóvel — a pesquisa por nome de casal simplesmente não estava lá |
| Fechar a paleta de comandos | `Esc` | **×** no canto do campo de procura. Tocar no fundo escuro também fecha, mas isso descobre-se por acaso; não é um controlo |
| Guardar / cancelar uma nota | `Ctrl+Enter` / `Esc` | Os botões **"Guardar"** e **"Cancelar"**, que já lá estavam sempre |
| Fechar diálogos e folhas | `Esc` | O × está sempre presente — ver `ui/FolhaOuDialogo.tsx` |

## O que deixou de se anunciar em ecrã de toque

| Onde | O que desaparece |
| --- | --- |
| Barra de topo | O `⌘K` dentro do botão de pesquisa |
| Paleta de comandos | O `ESC` no campo, o `↵` na linha activa, e o rodapé inteiro (`↑↓ navegar · ↵ abrir · esc fechar`) — três linhas de instrução a roubar altura aos resultados |
| Gaveta de navegação | O botão **"Atalhos"**, que abre a folha de atalhos de teclado. Meia gaveta a ensinar teclas a quem não as tem |
| Registo de actividade | `Ctrl+Enter para guardar · Esc para cancelar` |
| Ajuda e glossário | A frase "ou com a tecla `?`" e o "Feche com Escape" |

---

## O que fica de fora, de propósito

**Os atalhos continuam todos a funcionar.** Nada foi desligado — `⌘K`, `?`,
`Cmd+Z`, `Esc` respondem na mesma, inclusive num iPad com teclado ligado. O que
muda é só o que se DESENHA e o que é o caminho principal.

**Um teclado Bluetooth num telemóvel não é detectado.** `(pointer: coarse)` fala
do ponteiro, não do teclado, e não há em CSS forma de perguntar "há teclas?".
Quem ligar um teclado ao telemóvel deixa de ver as dicas — mas os atalhos
continuam lá, e a troca é a certa: o caso comum é não haver teclado.

**A navegação por TAB não é uma dica de teclado.** É acessibilidade, é para
todos os ecrãs, e não se toca. O que este documento trata é de atalhos
anunciados, não de foco.

**A folha de atalhos não foi apagada.** Continua a abrir com `?` em quem tem
teclado; só deixou de se oferecer a quem não tem.

---

## Ao acrescentar um atalho novo

1. Escreva primeiro o **botão**. O atalho é o acelerador, e um acelerador sem
   pedal não leva ninguém a lado nenhum.
2. Se desenhar a tecla no ecrã, marque-a `pointer-coarse:hidden`.
3. Se precisar de mostrar alguma coisa SÓ no toque, ponha a variante do lado de
   quem esconde (`flex pointer-fine:hidden`), nunca `hidden pointer-coarse:flex`.
4. Corra `npx playwright test e2e/admin-mobile.spec.ts`. O teste falha com o
   texto da etiqueta que ficou à vista.
