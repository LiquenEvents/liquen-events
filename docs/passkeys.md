# Entrar sem palavra-passe (passkeys)

Como funciona, o que é preciso configurar, e o que fazer quando corre mal.

---

## Em duas linhas

O aparelho — telemóvel, portátil — passa a ser a chave. Entra-se com o rosto, a
impressão digital ou o PIN **do próprio aparelho**, sem escrever nada. A
palavra-passe continua a funcionar ao lado; isto acrescenta um caminho, não
substitui o que já havia.

---

## O que isto resolve, e o que não resolve

**Resolve o phishing.** A chave privada nunca sai do aparelho e a assinatura
está presa à origem que o browser vê. Num site que imite o nosso — `liquen-eventos.com`,
um link num email — o aparelho não assina. Não porque desconfie: porque a chave
de `liquen-events.com` **não existe** nesse domínio. É a única defesa que não
depende de a pessoa reparar em nada.

**Resolve a fuga de credenciais.** O servidor guarda só a chave **pública**. Uma
cópia da tabela, ou do Supabase inteiro, não deixa ninguém entrar.

**NÃO resolve nada enquanto a palavra-passe existir ao lado.** Quem apanhar a
palavra-passe entra por aí, com passkeys registadas ou sem elas. As passkeys
tornam a porta boa mais segura; não fecham a antiga. Para fechar a antiga é
preciso decidir desligá-la — e isso traz o risco de bloqueio descrito no fim.

---

## Configuração

Nenhuma variável é obrigatória: sem configuração, o domínio sai do endereço do
pedido e tudo funciona. Em produção vale a pena ser explícito.

| Variável | Para quê |
| --- | --- |
| `WEBAUTHN_RP_ID` | O domínio a que as passkeys ficam presas. Em produção: `liquen-events.com`. |
| `WEBAUTHN_ORIGIN` | A origem exacta esperada. Em produção: `https://liquen-events.com`. |

E é preciso a tabela: correr `db/schema.sql` no Supabase (é idempotente, pode
repetir-se). Sem ela o ecrã dos dispositivos diz o que falta, em vez de falhar
em silêncio.

---

## Como se usa

**Registar um aparelho** — back office → barra lateral → **Os meus dispositivos**
→ *Registar*. Só se pode registar estando lá dentro, e é o ponto todo do
desenho: transformar um aparelho numa chave tem de ser feito por quem já provou
ser quem diz.

**Entrar** — no ecrã de entrada, *Entrar com este dispositivo*. Não é preciso
escrever nome nenhum: o aparelho mostra as passkeys que tem para este domínio.

**Remover** — na mesma lista. Cada pessoa vê e remove só os seus.

---

## O que esperar (e que não são defeitos)

**Uma passkey por aparelho e por endereço.** Telemóvel e portátil são dois
registos. Trocar de telemóvel obriga a registar de novo — é o preço exacto da
propriedade que a torna impossível de dar por engano.

**As passkeys de uma pré-visualização não funcionam em produção,** nem o
contrário. Cada deploy de pré-visualização tem o seu domínio. Quem testar numa
pré-visualização regista lá um aparelho; a palavra-passe entra em qualquer sítio.

**As passkeys NÃO vão na cópia de segurança.** É deliberado, e a razão está
escrita em `NOT_BACKED_UP` (`src/app/api/backup/route.ts`): se fossem, repor um
ficheiro de há dois meses **ressuscitava** o aparelho de alguém que entretanto
saiu — sem ninguém reparar, porque a atenção estaria toda nos dados. Ficando de
fora, a reposição não lhes toca.

---

## Pôr alguém fora

Três alavancas, para três situações:

1. **Aparelho perdido, pessoa fica** — a própria remove-o em *Os meus
   dispositivos*. As sessões já abertas nesse aparelho continuam válidas até
   expirarem; para as matar, ver o ponto 3.
2. **Pessoa sai da equipa** — tirá-la do `ADMIN_USERS`. Isso fecha **também** as
   passkeys dela: a entrada verifica que a conta ainda existe. Sem essa
   verificação, a chave do telemóvel continuava a abrir a porta para sempre.
3. **Fechar tudo, já** — mudar o `SESSION_VERSION` para qualquer texto novo.
   Invalida **todas** as sessões abertas, de toda a gente, na hora. É a alavanca
   para um cookie fugido ou uma saída à pressa. Note-se que apagar credenciais
   *não* faz isto: quem já está dentro continua dentro até a sessão expirar.

---

## O que fica por decidir

**Desligar a palavra-passe.** Enquanto ela existir, é por lá que um ataque vai
passar — as passkeys são a porta boa ao lado da antiga. Desligá-la é o passo que
transforma isto numa tranca a sério, e traz um risco que tem de ser aceite com
os olhos abertos: **quem perder o aparelho sem ter outro registado fica de fora**,
e a única saída é alguém com acesso às variáveis do Vercel voltar a ligá-la.

A recomendação é registar **dois** aparelhos por pessoa antes sequer de pôr a
hipótese, e só depois falar em desligar.

**Não foi implementado o "gastar" o desafio.** Um desafio vive dois minutos num
cookie assinado; dentro dessa janela pode em teoria ser reapresentado. Quem
conseguisse lá chegar teria de estar a ler o corpo de pedidos HTTPS já feitos —
e nesse mundo tem o cookie de sessão, que dura 30 dias e não precisa de
repetição nenhuma. Fica escrito porque o passo seguinte, se um dia isto proteger
mais do que o back office, é uma tabela de desafios com marca de gasto.

**A verificação do utilizador é exigida** (`userVerification: "required"`): o
aparelho tem de confirmar quem está lá — rosto, dedo ou PIN. Um autenticador que
não saiba fazê-lo não pode ser registado. É deliberado: sem isso, a passkey
valia o mesmo que uma chave esquecida na fechadura.
