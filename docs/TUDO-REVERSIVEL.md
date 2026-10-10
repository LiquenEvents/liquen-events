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
| **R2** — o resto do dia a dia, e os «Anular» antigos passam ao padrão | Por fazer |
| **R3** — a Reciclagem de 30 dias | Por fazer (precisa de uma migração, que só corre com a aprovação dela) |

**Onde a R1 se afastou do plano.** Apagar um pagamento ficou com «Anular» e
**sem** pergunta de confirmação: o «Anular» repõe-no tal e qual, e uma pergunta
a seguir a outra pergunta é o que faz as pessoas carregarem «Sim» sem ler. O
envio da proposta só espera no **email**: no WhatsApp a janela tem de abrir
dentro do clique, e é ela quem carrega em «Enviar» lá dentro.

**A produção semeada ao «Ganho» fica** quando se anula: a sementeira é
idempotente (marcar «Ganho» outra vez não duplica nada), e tirar tarefas que
alguém pode já ter começado seria apagar trabalho a meio de um «Anular».

## O mapa — o que tinha e o que não tinha volta atrás (análise de 10/10)

A coluna «Fase» diz quando passa a ter. ✅ = já tinha antes desta análise.

### Pedidos, Kanban e gaveta do pedido
| Acção | Onde | Volta atrás | Fase |
|---|---|---|---|
| Arrastar no Kanban / mover pelo teclado | `Kanban.tsx` | «Anular» repõe o estado anterior (e a cadeia do Ganho) | R1 |
| «Marcar como» em massa | `AdminClient.tsx` | «Anular» repõe o estado de cada um | R1 |
| «Ganhou? / Perdeu?» e motivo | `PerguntaDeDesfecho.tsx` | «Anular» | R1 |
| Guardar os campos da gaveta (estado, preço, data, convidados, local, contactos, responsável) | `AdminClient.tsx` | «Anular» com os valores anteriores | R1 (estado) · R2 (resto) |
| Arquivar / Restaurar pedido | `AdminClient.tsx` | ✅ «Restaurar pedido» | — |
| Duplicar / Novo pedido | `AdminClient.tsx`, `NewQuoteModal.tsx` | Arquivar ou apagar a cópia | R2 |
| Apagar pedido (e em massa) | `AdminClient.tsx` | Reciclagem | R3 |
| Etiquetas, seguimento, convidados, custos, guião, plano de produção, notas | vários | «Anular» | R2 |
| Lista de verificação: remover, «Marcar todas» | `EventChecklist.tsx` | ✅ «Anular» 8 s → passa ao padrão | R2 |
| Lista de verificação: «Limpar concluídas», gerar, modelo | `EventChecklist.tsx` | «Anular» | R2 |
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
| Serviços, escolhas do casal, construtor, curadoria | ✅ «Anular» (5–10 s) → passa ao padrão | R2 |
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
| Novo / duplicar evento | Apagar | R2 |
| Remover evento | «Anular» (recria) → Reciclagem | R2 · R3 |
| Concluir tarefa, reordenar | ✅ «Anular» | — |
| Editar, «Hoje/Amanhã», acrescentar | «Anular» | R2 |
| Apagar tarefa | Reciclagem | R3 |

### Material, inventário, fornecedores, serviços, temas, definições
| Acção | Volta atrás | Fase |
|---|---|---|
| Acrescentar / editar item, listas, importar CSV | «Anular» | R2 |
| Remover item / lista / regra / fornecedor | Reciclagem | R3 |
| Linha de lista removida, regra ligada/desligada, serviço arquivado | ✅ | — |
| Temas: mover fotos, arquivar | ✅ | — |
| Temas: renomear, capa, ordem, etiquetas, fundir | «Anular» | R2 |
| Temas: remover fotos / apagar tema | Reciclagem (as fotos vão para `reciclagem/`) | R3 |
| Modelos de email (bilingues) | ✅ 10 versões e «Repor» | — |
| Modelos de email (editor clássico), definições da proposta, notas da Visão Geral | «Anular» e versões | R2 |
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
