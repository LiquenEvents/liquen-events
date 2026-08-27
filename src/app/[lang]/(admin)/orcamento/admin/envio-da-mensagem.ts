/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ACONTECEU A UMA MENSAGEM, E A FRASE QUE O HISTÓRICO GUARDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um pedido que entrou por telefonema não tem email. A rota da mensagem grava-a
 * à mesma — o registo interno vale por si — e responde que o email NÃO saiu. O
 * mensageiro mostra isso a vermelho, mas esse aviso dura o tempo do ecrã
 * aberto; a linha do histórico dura para sempre, e era ela que jurava «Mensagem
 * enviada ao cliente» sobre uma que ninguém recebeu. O histórico é o que se lê
 * meses depois para saber o que se disse a quem.
 *
 * ── PORQUE É QUE ISTO VIVE NUM MÓDULO SÓ SEU ─────────────────────────────
 * Escrevem no histórico DOIS sítios — a zona de comunicações do dossiê e a
 * gaveta do pedido — e a frase tem de ser a mesma nos dois. Escrita à mão em
 * cada um, já divergiu: a gaveta continuou a dizer «enviada» durante o tempo em
 * que o dossiê já dizia a verdade.
 *
 * E é um ficheiro à parte, e não uma exportação do `ClientMessenger`, porque a
 * gaveta importa o mensageiro TARDE (ver `lazy.tsx`): buscar-lhe uma função de
 * três linhas por um `import` estático arrastava o componente inteiro — e o
 * editor de texto que ele traz — para dentro do pacote que carrega primeiro.
 */

/** O que a rota respondeu sobre o envio: se o email saiu, e porque não saiu. */
export interface EnvioDaMensagem {
  emailed: boolean;
  emailError?: string;
}

/**
 * A frase para o histórico, a partir do que aconteceu de facto.
 *
 * Sem informação nenhuma (`undefined`) assume-se que saiu: é o que estes ecrãs
 * sempre fizeram até haver forma de saber, e afirmar uma falha que não se mediu
 * é a mesma espécie de mentira, virada ao contrário.
 *
 * A razão (`emailError`) fica de fora de propósito — é uma frase de duas linhas
 * com instruções para AGORA, e o que aqui interessa é o facto, curto e legível
 * numa lista de trinta linhas.
 */
export function resumoDoEnvio(envio?: EnvioDaMensagem): string {
  return envio && !envio.emailed
    ? "Mensagem registada — o e-mail não saiu, o cliente não recebeu"
    : "Mensagem enviada ao cliente";
}
