# Tudo o que se faz tem volta atrás

> «Tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
> atrás ou que seja reversível. Eu quero o sistema mesmo super inteligente. Quero
> que faças uma análise a todo o back office e vejas que tudo aquilo que é feito
> por nós pode também ser reversível caso queiramos voltar atrás.» — 10/10/2026

O exemplo dela foi «Marcar como assinado» nas Propostas Aceites, que não tinha
volta atrás (a rota respondia 409).

## As decisões dela

| Pergunta | Resposta |
|---|---|
| Ao apagar (pedido, proposta, tema, fornecedor, tarefa…) | **Reciclagem 30 dias**: vai para a Reciclagem, de onde se repõe tal e qual; só depois de 30 dias sai de vez. |
| Ao enviar ao cliente (mensagem, proposta) | **10 s para cancelar**: «A enviar… Cancelar», como no Gmail, depois da confirmação que já existe. |

## O padrão da casa

- **`useAnular`** (`admin/ui/anular.ts`): `anular(«o que aconteceu», repor)`. Aparece o
  aviso com «Anular» durante **10 s** (`TOAST_ANULAR_MS`, em `Toast.tsx`), que pára com o
  rato ou o foco por cima. `repor` é o gesto ao contrário, gravado no servidor como
  qualquer outro. Se falhar, diz-se.
- **As listas da gaveta** já gravam com `{campo, base}` e 409 — o «Anular» manda a lista
  como estava, com a `base`, e não pisa o trabalho de outra pessoa.
- **Apagar** passa pela Reciclagem (fase R3).
- **Enviar** espera 10 s no browser antes de sair.

## Onde está cada fase

| Fase | Estado |
|---|---|
| **R1** — o padrão, os estados do pedido e a cadeia do Ganho, Propostas e Acompanhamento, Propostas Aceites, pagamentos, os dois envios | Feita no ramo `feat/anular-r1` |
| **R2a** — a gaveta do pedido: os campos do «Guardar» e todas as listas | Feita (#188) |
| **R2b** — o resto do back office, e os «Anular» antigos passam ao padrão | Feita no ramo `feat/anular-r2b` |
| **R3** — a Reciclagem de 30 dias | Por fazer (precisa de uma migração, que só corre com a aprovação dela) |

**Onde a R1 se afastou do plano.** Apagar um pagamento ficou com «Anular» e
**sem** pergunta de confirmação: o «Anular» repõe-no tal e qual, e uma pergunta
a seguir a outra pergunta é o que faz as pessoas carregarem «Sim» sem ler. O
envio da proposta só espera no **email**: no WhatsApp a janela tem de abrir
dentro do clique, e é ela quem carrega em «Enviar» lá dentro.

**A produção semeada ao «Ganho» fica** quando se anula: a sementeira é
idempotente (marcar «Ganho» outra vez não duplica nada), e tirar tarefas que
alguém pode já ter começado seria apagar trabalho a meio de um «Anular».

**Na R2a, de passagem:** a lista de convidados gravava sem `base`, e por isso duas pessoas
a mexer nela pisavam-se sem aviso (o servidor protege `guestList`, mas só pode recusar quando
a `base` vem). Passou a mandá-la, como as outras listas da gaveta. Riscar/desriscar, o RSVP e o
número de pessoas não levam «Anular»: desfazem-se no mesmo sítio, com o mesmo toque.

**Na R2b:**

- **Passaram ao padrão os «Anular» feitos à mão:**
  - a linha removida de uma lista de material, que tinha uma barra de 8 s;
  - os serviços do estúdio, que tinham uma barra de 5 s; o ⌘Z fica;
  - o mover fotos por arrasto dos Temas.
- **O reordenar das tarefas passou a esperar pelo servidor**, e diz quando falha.
- **Ficam como estão, de propósito, o `EditorDeEscolhas`, o construtor e o «Limpar» do
  estúdio.** Já duram 10 s e mostram a contagem decrescente à vista, que é o desenho do
  estúdio inteiro. Trocá-los pelo aviso comum, dentro do mesmo ecrã, punha ali dois
  desenhos diferentes para o mesmo gesto.
- **Acrescentar anula-se apagando o que se criou** (tarefa, marcação do calendário, item do
  catálogo ou do inventário): nada aponta ainda para uma coisa acabada de nascer.
- **Remover uma marcação do calendário anula-se recriando-a**, com o mesmo título, tipo,
  hora, nota e dia, mas com um id novo. Nada aponta para o id de uma marcação; a ligação às
  datas-chave de um «Ganho» vive dentro da nota, que vai igual.
- **Definições da proposta:** o «Anular» repõe o que estava **gravado** antes do
  «Guardar», e não o que estava escrito no campo, que muda a cada tecla.
- **Notas da equipa:** o «Anular» é o da sessão de escrita e aparece ao **fechar** o
  editor, porque elas gravam sozinhas a cada pausa. **Notas e meta** voltam com a revisão
  de agora: se outra pessoa gravou entretanto, aparece o aviso de conflito de sempre, com
  as duas versões lado a lado, e não aparece «Anulado.».
- **De passagem:** o «Anular» de arquivar um serviço que nunca tinha sido arquivado ia
  vazio, porque o campo não existia e `undefined` não chega ao servidor. Volta como `false`,
  e há um teste que o prende.

**Ficou para a R3, e porquê:**
- **Apagar material, listas, regras, fornecedores e tarefas.** O id tem de voltar igual,
  porque as listas base e as regras apontam para ele, e os POST de hoje ignoram um id
  vindo de fora.
- **Fundir temas e apagar etiquetas de fotos.** As rotas não devolvem o que mudaram, por
  isso não há com que repor.
- **O «Mover/duplicar» por diálogo dos Temas.** Não guarda os destinos de cada foto.
- **«Voltar a gerar» o material do evento, importar CSV e criar uma lista a partir de
  outra.** Criam dezenas de linhas de uma vez, e anulá-los é a Reciclagem em lote.
- **A capa de um tema, quando a capa de antes não está carregada na grelha.** Não há os
  campos de que o cartão da lista precisa; aí não se oferece «Anular».

## O mapa — o que tinha e o que não tinha volta atrás (análise de 10/10)

A coluna «Fase» diz quando passa a ter. ✅ = já tinha antes desta análise.

### Pedidos, Kanban e gaveta do pedido
| Acção | Onde | Volta atrás | Fase |
|---|---|---|---|
| Arrastar no Kanban / mover pelo teclado | `Kanban.tsx` | «Anular» repõe o estado anterior (e a cadeia do Ganho) | R1 |
| «Marcar como» em massa | `AdminClient.tsx` | «Anular» repõe o estado de cada um | R1 |
| «Ganhou? / Perdeu?» e motivo | `PerguntaDeDesfecho.tsx` | «Anular» | R1 |
| Guardar os campos da gaveta (estado, preço, data, convidados, local, contactos, responsável) | `AdminClient.tsx` | «Anular» repõe todos os campos que o gesto mudou | ✅ R1 (estado) · R2a (resto) |
| Arquivar / Restaurar pedido | `AdminClient.tsx` | ✅ «Restaurar pedido» | — |
| Duplicar / Novo pedido | `AdminClient.tsx`, `NewQuoteModal.tsx` | Arquivar ou apagar a cópia | R2 |
| Apagar pedido (e em massa) | `AdminClient.tsx` | Reciclagem | R3 |
| Etiquetas (tirar), seguimento (atalhos), convidados, custos, guião, plano de produção | vários | «Anular» — gesto ao contrário, com a `base` | ✅ R2a |
| Notas e motivo (gravam sozinhos ao escrever) | `AdminClient.tsx` | Anulam-se pelo «Guardar» quando vão nele; ao escrever, não — um aviso por tecla seria ruído | — |
| Lista de verificação: remover, «Marcar todas» | `EventChecklist.tsx` | «Anular» da casa (era uma tira própria de 8 s) | ✅ R2a |
| Lista de verificação: «Limpar concluídas», gerar, modelo, editar | `EventChecklist.tsx` | «Anular» | ✅ R2a |
| Pagamentos: apagar, «Pago», editar | `PaymentsPanel.tsx` | «Anular» (repõe a lista como estava) | R1 |
| Pagamentos: nº de contrato | `PaymentsPanel.tsx` | «Anular» | R2 |
| Mensagem ao cliente (email, sem confirmação) | `ClientMessenger.tsx` | 10 s para cancelar | R1 |
| «Voltar a gerar» o material do evento | `EventMaterial.tsx` | Confirma o que se perde; reciclagem do anterior | R3 |
| «Gerar» ao ganhar | `PainelGeracaoAoGanhar.tsx` | Mostra antes; desfazer o que gerou | R2 |
| «Cortar os links» | `Versoes.tsx` | Fica sem volta, de propósito: a saída é reenviar | — |

**A cadeia do Ganho.** Pôr um pedido em «Ganho», venha de onde vier, também aceita a
proposta, cria o contrato (`nascerContratoDoGanho`) e pré-preenche a produção. O «Anular»
do estado desfaz a cadeia: o contrato desse gesto sai se ainda estiver pendente e sem
registo, e a proposta volta a enviada. A produção semeada fica (ver acima). Mover um
pedido de «Ganho» para «Perdido» SEM ser pelo «Anular» não desfaz nada: um casamento
que caiu não é um engano.

### Fazer proposta / Estúdio
| Acção | Volta atrás | Fase |
|---|---|---|
| Editar o documento | ✅ «Desfazer» e ⌘Z (50 estados, na sessão) | — |
| Limpar, remover foto/fase/linha/extra, «Criar a partir de…» | ✅ «Anular» 10 s | — |
| Versões, resgate, «Repor os valores que seguiram» | ✅ | — |
| Serviços | ✅ «Anular» da casa (era uma barra de 5 s); o ⌘Z fica | R2b |
| Escolhas do casal, construtor, curadoria | ✅ «Anular» de 10 s com contagem à vista — fica, é o desenho do estúdio | — |
| Enviar a proposta | 10 s para cancelar (depois da confirmação) | R1 |
| Guardar como modelo / biblioteca | Apagar o modelo | R2 |

### Propostas / Acompanhamento
| Acção | Volta atrás | Fase |
|---|---|---|
| Aceitar / Recusar | «Anular» (e a cadeia do Ganho) | R1 |
| Estado, motivo, seguimento, versão escolhida no Acompanhamento | «Anular» | R1 |
| Apagar proposta | Reciclagem | R3 |

### Propostas Aceites
| Acção | Volta atrás | Fase |
|---|---|---|
| Marcar como assinado | «Anular registo», e «Voltar a pendente» a qualquer momento | R1 |
| Criar contrato | «Anular» enquanto pendente | R1 |

### Calendário, Tarefas
| Acção | Volta atrás | Fase |
|---|---|---|
| Novo / duplicar evento | ✅ «Anular» (apaga o que se criou) | R2b |
| Remover evento | ✅ «Anular» (recria) → Reciclagem | R2b · R3 |
| Concluir tarefa, reordenar | ✅ «Anular» (o reordenar espera pelo servidor) | R2b |
| Editar, notas, subtarefas, anexos, «Hoje/Amanhã», acrescentar | ✅ «Anular» | R2b |
| Apagar tarefa | Reciclagem | R3 |

### Material, inventário, fornecedores, serviços, temas, definições
| Acção | Volta atrás | Fase |
|---|---|---|
| Acrescentar / editar item (catálogo e inventário) | ✅ «Anular» | R2b |
| Importar CSV, criar lista a partir de outra, «Voltar a gerar» | Reciclagem em lote | R3 |
| Remover item / lista / regra / fornecedor | Reciclagem | R3 |
| Linha de lista removida | ✅ «Anular» da casa (era uma barra de 8 s) | R2b |
| Regra ligada/desligada | ✅ «Anular» | R2b |
| Fornecedores: editar, preferido, estrelas | ✅ «Anular» | R2b |
| Serviços da biblioteca: arquivar, desarquivar, corrigir | ✅ «Anular» | R2b |
| Temas: mover fotos por arrasto | ✅ «Anular» da casa | R2b |
| Temas: arquivar, fixar | ✅ «Anular» | R2b |
| Temas: renomear (na lista e na pasta), capa, ordem das fotos | ✅ «Anular» | R2b |
| Temas: etiquetas, fundir, «Mover/duplicar» por diálogo | Reciclagem | R3 |
| Temas: remover fotos / apagar tema | Reciclagem (as fotos vão para `reciclagem/`) | R3 |
| Modelos de email (bilingues) | ✅ 10 versões e «Repor» | — |
| Modelos de email (editor clássico), definições da proposta, notas e meta da Visão Geral | ✅ «Anular» | R2b |
| Repor cópia de segurança | ✅ guarda «antes do restauro» | — |

### O que não se pode desfazer, por natureza
- **Um email que saiu** não volta. Por isso: 10 s para cancelar antes de sair.
- **Os fechos enviados à Meta** e o email do modelo do dossier: já mostram tudo antes
  de enviar; ficam assim.

## Erro encontrado de passagem — corrigido
Os números de adultos, crianças e equipa dos Guiões não ficavam gravados: o
`Guioes.tsx` manda `folhaDaTimeline` e a rota do pedido não o tinha na lista do que
aceita — deitava-o fora e respondia 200, por isso o ecrã não mostrava erro e o PDF do
guião nunca via os números. Confirmado com um teste que falhava antes da correcção e
com um pedido TESTE no servidor local (grava, recarrega, volta igual).
