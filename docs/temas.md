# Biblioteca de Temas

O objetivo: **deixar de andar à procura das fotos**. Em vez de ir ao Pinterest,
às fotos do telemóvel ou às pastas do computador de cada vez que se faz uma
proposta, as fotos de inspiração ficam guardadas **uma vez, por tema** — Itália,
Terracotta, Branco & Verde — e depois entram na proposta com dois cliques.

## Como se usa

### 1. Criar o tema e carregar as fotos (faz-se uma vez)

1. No back office, menu lateral → **Mais** → **Temas**.
2. **Novo tema** → nome (ex.: `Terracotta`) e, se quiser, uma nota
   (ex.: _"tons quentes, para espaços de pedra"_).
3. O tema abre logo: **arraste as fotos para dentro** (ou use "Adicionar fotos").
   Pode largar uma pasta inteira de fotos de uma vez.

As fotos são comprimidas no navegador antes de subirem, por isso fotos direitas
do telemóvel (incluindo HEIC do iPhone) funcionam sem tratamento prévio.

Passar o rato por cima de uma foto mostra um **×** para a remover. O nome do tema
edita-se clicando nele.

### 2. Usar o tema numa proposta

1. Abra o pedido → **Estúdio de propostas**.
2. Em **Mood boards**, no mood board onde quer as fotos, clique
   **Escolher da biblioteca de temas**.
3. Escolha o tema no topo (Itália, Terracotta…), toque nas fotos que quer e
   **Adicionar à proposta**.

As fotos entram no mood board como se as tivesse carregado à mão — aparecem na
pré-visualização e no PDF exatamente da mesma maneira. Nas **imagens de capa**
existe o mesmo botão, aí para escolher uma só foto.

O último tema usado fica memorizado, por isso na proposta seguinte abre logo no
sítio certo.

## Notas importantes

- **As propostas já feitas nunca são afetadas.** Ao escolher fotos da
  biblioteca, é feita uma **cópia** para a pasta dessa proposta. Pode depois
  mudar o tema, trocar fotos ou eliminá-lo — as propostas enviadas continuam
  iguais.
- **Eliminar um tema apaga as fotos desse tema** (só as da biblioteca, ver
  ponto acima). A ação pede confirmação e não pode ser anulada. Se as fotos não
  puderem ser apagadas naquele momento, o tema **não** é eliminado e aparece um
  aviso — repetir a ação mais tarde conclui-a, em vez de deixar fotos perdidas.
- **"Fotos indisponíveis"** num tema quer dizer que a pasta não pôde ser lida
  agora (falha temporária), **não** que as fotos desapareceram. Recarregue daqui
  a pouco.
- **Um tema não tem limite prático de fotos**; a grelha mostra as 500 mais
  recentes, e nesse caso a contagem aparece como "500+".
- Podem ser adicionadas até **40 fotos de uma vez** a uma proposta — o seletor
  avisa quando chega ao limite, antes de tentar.
- **A capa tem dois lugares fixos**, esquerda e direita: a foto que escolher
  para a direita sai à direita no PDF, mesmo que o lugar da esquerda fique
  vazio.

## Por trás (para quem mexe no código)

| Peça                                     | Onde                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Nome/nota de cada tema                   | tabela `proposal_themes` (`db/schema.sql`), via `src/lib/themes-store.ts` |
| Fotos                                    | bucket privado `theme-assets`, uma pasta por tema — `src/lib/theme-storage.ts` |
| Ecrã de gestão                           | `src/app/[lang]/orcamento/admin/Temas.tsx`                            |
| Seletor dentro do estúdio                | `src/app/[lang]/orcamento/admin/ThemePicker.tsx`                      |
| Cópia tema → proposta                    | `POST /api/orcamento/[id]/assets/importar`                            |

A pasta do bucket é a **única fonte de verdade** do que existe num tema (não há
lista de imagens duplicada na base de dados que possa dessincronizar), e os
caminhos que chegam do cliente são validados por `isThemePath` antes de tocar
no Storage, para que nada possa ler ou apagar fora da pasta do tema.

O bucket é criado sozinho no primeiro carregamento — não é preciso configurar
nada no Supabase além das variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
que o resto da aplicação já usa. Numa instalação já existente, corra a secção
`proposal_themes` de `db/schema.sql` (é idempotente: pode colar o ficheiro todo).
