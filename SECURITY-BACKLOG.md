# Backlog de segurança — Médios e Baixos

Da auditoria de Julho de 2026. Os Altos foram corrigidos e estão em
[SECURITY-AUDIT.md](./SECURITY-AUDIT.md).

Estão por ordem de valor, não de severidade. Um Médio que expõe legalmente vale
mais atenção do que um Médio que precisa de um atacante com sorte.

---

## Primeiro, os que expõem legalmente

### B1 · A política promete um expurgo que não existe · `legal-content.ts:64`
*"Pedidos que não deem origem a contrato são eliminados no prazo máximo de 12
meses."* Não há cron, tarefa nem anonimização em todo o `src/` e `db/`. Só
apagamento manual. Na prática ficam para sempre.

Duas saídas, ambas decisão da dona: **construir** o expurgo, ou **corrigir a
promessa**. A segunda é honesta e custa uma frase; a primeira é o que a maior
parte das pessoas espera de quem lhes pede os dados.

### B2 · Subcontratantes não declarados · `legal-content.ts:71`
A secção lista alojamento, email, base de dados e Google. **Não menciona o
Sentry nem o webhook de erros**, para onde os erros seguem — e seguiam com
dados pessoais dentro, até à redacção central de `logger.ts`. Provavelmente há
transferência para fora do EEE sem base declarada.

### B3 · O direito ao apagamento é parcial
Apagar um pedido não toca em mensagens, contratos, facturas, propostas nem nos
ficheiros do Storage. Um pedido de apagamento deixa resíduo em cinco sítios.

### B4 · Descrição inexacta do que a Google recebe · `legal-content.ts:47`
Diz *"sinais técnicos agregados e sem cookies (por exemplo, país e tipo de
página)"*. Os pings sem cookies levam o **URL completo e o IP** — que não são
agregados. (O URL já vai saneado desde esta auditoria; a frase continua
inexacta.)

### B5 · Consentimento retirado não apaga os cookies já postos
Os `_ga` / `_gcl_au` ficam. E `ads-conversion.ts:80` faz um
`gtag('set','user_data',…)` **global e persistente**: o email fica agarrado aos
eventos seguintes do mesmo separador, para lá da conversão que a política
descreve.

---

## Configuração — pequenos, e alguns são de um minuto

### B6 · `connect-src` não inclui o Supabase · `next.config.ts`
Hoje não parte nada porque nenhum cliente chama as rotas que emitem bilhetes de
escrita directa no Storage. Parte no dia em que ligarem — e **o recurso não
dispara**, porque um bloqueio de CSP é `TypeError`, não erro HTTP. Uma linha,
antes de alguém ligar essa funcionalidade.

### B7 · Custo do bcrypt a 10 · `.env.example:44`
O exemplo manda gerar com custo 10 e o hash partilhado de desenvolvimento está
a 10; as contas reais devem ser 12. Nada verifica. Com o tecto de 20/hora o
impacto directo é pequeno — conta se o hash vazar.

### B8 · O tecto não é global sem Upstash
O limitador recua para memória **por instância**. Em serverless o tecto real
multiplica-se pelo número de instâncias. `.env.example:69-70` está vazio.

### B9 · Sessão de 30 dias sem renovação nem rotação
Não há janela deslizante (bom), mas um cookie roubado vale 30 dias. E o logout
não revoga o token — só apaga o cookie do lado do browser. A única revogação
real é global (`SESSION_VERSION`, ver o RUNBOOK).

### B10 · Sem códigos de recuperação do segundo factor
Perder o telemóvel implica editar variáveis de ambiente. Se forem
acrescentados: com hash e de uso único.

### B11 · Falha-aberto de configuração no 2FA
Se o `ADMIN_USERS` ficar malformado **e** o `ADMIN_PASSWORD_HASH` estiver
definido, volta-se à palavra-passe partilhada e **o segundo factor desliga-se
em silêncio** (fica só um `log.error`). Sem `ADMIN_PASSWORD_HASH` falha
fechado, que é o caso bom.

### B12 · `NODE_ENV` é o interruptor de tudo
Prefixo `__Host-`, `secure`, recusa do hash público, chave de sessão. Um
arranque sem `NODE_ENV=production` deixa activas ao mesmo tempo a chave pública
e a palavra-passe pública. O Dockerfile e a Vercel definem-no, por isso não é
explorável nos caminhos reais — é uma dependência frágil.

---

## Robustez de dados

### B13 · Tecto por destinatário contornável · `api/orcamento/route.ts:474`
A chave é o endereço em bruto, e o Gmail ignora pontos e sufixos `+`. Medido: 5
endereços → **4 chaves distintas, uma só caixa de correio**. O tecto de 5/dia
que o comentário descreve como anti-mail-bomb não cobre o caminho todo.

### B14 · Escrita de ficheiros não atómica · `lib/repository.ts:274-285`
`read()` engole todos os erros — um ficheiro truncado lê-se como conjunto
vazio, e a escrita seguinte grava esse vazio por cima. `write()` trunca-e-
escreve, sem `rename`. Só afecta desenvolvimento e auto-alojamento.

### B15 · Numeração de facturas em produção sem Supabase · `lib/invoices-store.ts:162`
O comentário diz "APENAS dev" e nada o impõe. O contador cairia no `app-state`,
que escreve num sistema de ficheiros só-de-leitura e **engole o erro** — o
número nunca avançaria. Atenuante: o `createInvoice` seguinte rebenta, por isso
o número repetido nunca chega ao livro.

### B16 · Segredo constante na derivação de ids · `lib/quotes-store.ts:30`
Sem `SESSION_SECRET`, a chave é uma constante versionada, e o comentário logo
acima (*"so the id can't be computed from the submissionId alone"*) passa a ser
falso. Não explorável isoladamente — o `submissionId` é `crypto.randomUUID()`.
O padrão certo está ao lado, em `proposal-token.ts:31-50`.

### B17 · Aviso falso de configuração · `lib/env.ts:28`
Valida `SUPABASE_URL` mas o `getSupabase` aceita também
`NEXT_PUBLIC_SUPABASE_URL`. Um deploy correcto que use a variável pública leva
um `log.error "Missing critical"` a cada arranque — ruído que treina a equipa a
ignorar o alarme que interessa.

### B18 · `themeFolder()` coage em silêncio · `lib/theme-storage.ts:222`
`"../../secret"` → `"secret"`, e `"a.1"` e `"a1"` colapsam na mesma pasta. Hoje
inofensivo porque os ids são `randomUUID()`. Rejeitar seria mais seguro do que
limpar.

### B19 · `ensureBucket` pode saltar o endurecimento · `lib/proposal-storage.ts:69-91`
Marca `bucketReady` mesmo quando a leitura falhou de forma transitória e a
criação respondeu "já existe" — nesse caminho o `hardenBucket` nunca corre no
resto da vida do processo. Só importa se o bucket tiver sido tornado público
fora da aplicação.

### B20 · URLs assinados com validade de 10 anos · `lib/proposal-storage.ts:22`
Um URL que vaze é efectivamente permanente.

---

## Dependências

### B21 · `brace-expansion` (GHSA-mh99-v99m-4gvg)
Nove avisos Altos, todos desta raiz, pela cadeia do ESLint. **`npm audit
--omit=dev` → 0.** Nenhuma dependência de produção afectada; a exposição é a
máquina de quem corre o lint. Resolve-se quando o ESLint actualizar a sua
cadeia.

---

## Descartado com razão, para não voltar a ser investigado

`origin: *` em CORS (não existe CORS nenhum nas 55 rotas) · source maps em
produção (desligados; o único `.map` é um esqueleto vazio de 53 bytes) ·
segredos no bundle (zero, com controlo positivo a provar que a busca
alcançava) · `frame-ancestors 'none'` (sem vector, e arriscava a
pré-visualização de emails) · COEP (partiria a pilha de anúncios, que está lá
de propósito) · o endpoint de relatórios como amplificador (30/min por IP, 204,
não ecoa) · `next_invoice_seq` como `security definer` (não é) · travessia no
guarda de caminhos de temas (a regex é estanque — a armadilha do `$` antes de
`\n` é do Python, não do JavaScript).
