# A entrada no painel de gestão

O que mudou, e o que tens de fazer do teu lado. Não é preciso perceber de
programação — é tudo no painel da Vercel, em **Settings → Environment
Variables**.

---

## 1. Passou a entrar-se com o EMAIL

Antes escrevia-se o nome próprio. Agora escreve-se o email.

Porquê: um nome próprio é curto, está no site, repete-se quando a equipa
crescer, e nenhum gestor de palavras-passe (o do telemóvel, o do browser) o sabe
guardar — o que empurra toda a gente para palavras-passe decoradas e repetidas.

**Nada se parte no dia do deploy.** Enquanto não fizeres o passo 2, continua a
entrar-se com o nome, exactamente como hoje. E quem estiver com o painel aberto
não é posto fora: as sessões abertas continuam abertas.

---

## 2. O que tens de escrever na Vercel

Uma variável chamada `ADMIN_USERS`, com uma linha por pessoa:

```json
[
  {
    "name": "Catarina",
    "email": "catarina@liquen-events.com",
    "passwordHash": "$2b$12$..."
  },
  { "name": "Rui", "email": "rui@liquen-events.com", "passwordHash": "$2b$12$..." }
]
```

- `name` — o nome que aparece no ecrã («Bem-vinda, Catarina») e nas tarefas.
  **Mantém o que já lá está**: mudá-lo muda quem está apontado como dono das
  tarefas antigas.
- `email` — o que se escreve para entrar. É este o campo novo.
- `passwordHash` — a palavra-passe, embaralhada. **Nunca se escreve aqui a
  palavra-passe em claro.**

Para gerar um `passwordHash`, no computador, dentro da pasta do projecto:

```
node -e "console.log(require('bcryptjs').hashSync('a-palavra-passe-aqui', 12))"
```

Copia o resultado (começa por `$2b$12$`) para o `passwordHash`. **Usa sempre o
12** — números diferentes entre pessoas fazem o site demorar tempos diferentes a
responder, e esse tempo diz a quem tenta entrar quais os endereços que existem.

Depois de todos terem `email`, avisa quem faz a manutenção: há um caminho antigo
no código (entrar pelo nome) que só depois disso pode ser removido.

---

## 3. Recuperação de palavra-passe

Na página de entrada há agora **«Esqueceste-te da palavra-passe?»**. Escreve-se
o email, chega uma mensagem com uma ligação, e por essa ligação define-se uma
palavra-passe nova.

- A ligação **dura 30 minutos** e **só serve uma vez**.
- Pedir outra **cancela a anterior**.
- A resposta no ecrã é sempre a mesma, **exista ou não exista essa conta**. É de
  propósito: se dissesse «não temos esse email», qualquer pessoa na internet
  podia usar esta caixa para descobrir os endereços da equipa.
- Quem não foi o autor do pedido não tem nada a fazer: a palavra-passe actual
  continua a valer.

Para isto funcionar, são precisas duas coisas já configuradas na Vercel:

| Variável | Para quê | Se faltar |
| --- | --- | --- |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | enviar a mensagem | o pedido não rebenta, mas **ninguém recebe nada** (fica registado como erro) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | guardar a ligação | o ecrã **diz que não conseguiu**, em vez de fingir que enviou |

A palavra-passe nova tem de ter **pelo menos 12 caracteres**. Não precisa de
símbolos nem de números: uma frase de que te lembres é melhor do que
`Liquen2026!`.

**A Vercel manda sempre.** Se mudares o `passwordHash` de alguém no
`ADMIN_USERS`, qualquer palavra-passe que essa pessoa tenha definido pela
recuperação deixa imediatamente de funcionar. É assim de propósito: é o que
garante que podes fechar uma conta a partir daqui, sem surpresas.

---

## 4. Tentativas falhadas

Para travar quem tente adivinhar palavras-passe, a mesma conta vai sendo
fechada por períodos cada vez maiores:

| Falhas seguidas na mesma conta | Fica fechada |
| --- | --- |
| 5 | 5 minutos |
| 10 | 30 minutos |
| 20 | 1 hora |

Duas coisas que interessa saberes:

- **quem acerta na palavra-passe entra sempre**, mesmo que um estranho tenha
  gasto todas as tentativas dessa conta. O bloqueio só conta tentativas
  falhadas, e só é consultado depois de a palavra-passe falhar;
- a mensagem de erro é sempre a mesma — «Credenciais incorretas» — quer a conta
  exista, quer não. Também é de propósito, e pela mesma razão do ponto 3.

Pedidos de recuperação: no máximo **3 por hora por conta** e **5 por hora por
computador**, para ninguém poder encher a caixa de correio de outra pessoa.

---

## 5. As outras variáveis, em duas linhas

| Variável | Para quê |
| --- | --- |
| `SESSION_SECRET` | assina o que mantém a sessão aberta. 32+ caracteres ao acaso. **Trocá-la põe toda a gente fora.** |
| `SESSION_VERSION` | mudar este valor (para qualquer outro) põe toda a gente fora de propósito — é a alavanca para usar se um portátil se perder |
| `ADMIN_PASSWORD_HASH` | a palavra-passe única e partilhada, do tempo em que não havia contas. Com `ADMIN_USERS` configurado, deixa de ser usada |
