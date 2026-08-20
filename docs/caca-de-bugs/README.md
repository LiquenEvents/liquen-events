# Caça exaustiva a bugs — registo

Auditoria pedida por ela: **nenhum agente corrige nada na primeira passagem.**
Primeiro encontra-se e cataloga-se; só depois de ela aprovar o relatório é que se
corrige.

## Porque é que são dez ficheiros e não um

Ela pediu um registo único, e é isso que o `registo.md` é — mas escrito por
MERGE e não por dez escritas concorrentes no mesmo sítio.

Dez processos a acrescentar ao mesmo ficheiro ao mesmo tempo perdem entradas: o
último a gravar escreve por cima do que os outros acrescentaram entretanto. Seria
uma perda de dados silenciosa dentro de uma auditoria que existe para as
encontrar.

Cada agente escreve o seu (`agente-01.md` … `agente-10.md`); o `registo.md` é a
junção, com os totais e as listas que ela pediu.

## O formato de cada entrada

```
[ID] [Agente] [Módulo] [Severidade] Título
     Reproduzir: passos exatos
     Esperado: o que devia acontecer
     Observado: o que acontece
     Onde: ficheiro:linha
     Causa provável:
     Correção proposta:
     Chega ao cliente? sim/não
```

## Severidades

- **Crítico** — perda de dados, erro que chega ao cliente, ou impede trabalho
- **Grave** — resultado errado ou funcionalidade partida com contorno
- **Médio** — comportamento incorreto sem consequência grave
- **Menor** — imperfeição

**A coluna «chega ao cliente» manda.** Um bug médio que produz um PDF errado vale
mais do que um crítico interno.
