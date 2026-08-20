/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FALHOU, QUANDO O SERVIDOR NEM CHEGA A EXPLICAR-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todas as falhas do envio caíam na MESMA frase de oito palavras — «Não foi
 * possível enviar a proposta.» — porque o código lia a explicação do corpo da
 * resposta, e as falhas que não trazem corpo nenhum ficavam sem nada.
 *
 * A pior delas é o TEMPO ESGOTADO: a plataforma mata a função e responde com
 * uma página de erro que não é sequer JSON. Do lado dela, um botão que roda e
 * uma frase que não distingue «a base recusou» de «demorou demais» de «não
 * estás autenticada». Foi com essa frase que este problema chegou até mim, e é
 * também por isso que demorou a ser encontrado.
 *
 * O código de estado não é um detalhe técnico a esconder: é a única coisa que
 * distingue estes casos, e cada um tem uma acção diferente do outro lado.
 */
export function porqueFalhouOEnvio(status: number): string {
  if (status === 504 || status === 502 || status === 408) {
    return (
      "O servidor demorou demasiado a preparar a proposta e desistiu a meio. " +
      "Propostas com muitas fotografias demoram mais — tenta outra vez; se voltar a " +
      "acontecer, tira algumas fotos dos mood boards."
    );
  }
  if (status === 401 || status === 403) {
    return "A sessão expirou. Volta a entrar e tenta de novo — o rascunho está guardado.";
  }
  if (status === 413) {
    return "A proposta é grande demais para ser guardada. Tira algumas fotos ou encurta os textos.";
  }
  if (status === 503) {
    return "O serviço não está disponível neste momento. Tenta daqui a pouco.";
  }
  return `Não foi possível enviar a proposta (erro ${status}).`;
}
