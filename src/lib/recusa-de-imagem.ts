/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE DIZ A QUEM CARREGOU UMA FOTO QUE NÃO SERVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas rotas de carregamento (a biblioteca de temas e os anexos da proposta)
 * respondiam a mesma frase a três avarias diferentes:
 *
 *     «Não foi possível processar a imagem: IMG_4821.HEIC.»
 *
 * É verdade e não serve para nada. Não diz o que aconteceu, não diz o que
 * fazer, e a pessoa fica a tentar a mesma foto outra vez — que vai falhar
 * outra vez, exactamente da mesma maneira.
 *
 * As três avarias têm respostas diferentes, e todas elas estão nas mãos de quem
 * está a carregar:
 *
 *   · HEIC — o formato da câmara do iPhone. Não é uma foto partida: é um
 *     formato que a nossa biblioteca de imagem não sabe abrir (o descodificador
 *     de HEVC não vem nas versões que se distribuem, por causa das patentes).
 *     O caminho é mudar o formato da câmara ou exportar como JPEG.
 *
 *   · INCOMPLETA — o ficheiro chegou a meio. Voltar a carregar resolve quase
 *     sempre, porque a causa costuma ser a ligação e não a fotografia.
 *
 *   · ILEGÍVEL — não é uma imagem que se consiga abrir de todo. Aqui a frase
 *     antiga estava certa, e fica.
 *
 * ── PORQUE É QUE ISTO VIVE NUM MÓDULO SÓ SEU ──────────────────────────────
 *
 * Porque a mesma explicação é precisa nos DOIS lados. No iPhone e no Safari o
 * HEIC é convertido no próprio navegador antes de subir (é de lá que ele vem, e
 * é lá que se sabe lê-lo); num computador com Chrome, o mesmo ficheiro falha
 * ANTES de chegar ao servidor. Se a explicação vivesse do lado do servidor, o
 * caso mais provável — arrastar um HEIC do telemóvel para o computador — nunca
 * a veria. Este módulo não importa `sharp` nem nada de servidor, de propósito.
 */

/** Porque é que estes bytes não servem. */
export type MotivoDeRecusa = "incompleta" | "heic" | "ilegivel";

/** A explicação do HEIC, igual em todo o lado. Sem o nome do ficheiro: quem
 *  chama põe-no à frente, porque é aí que ele faz sentido na frase. */
export const CONSELHO_HEIC =
  "está em HEIC, o formato da câmara do iPhone, e não o conseguimos abrir. " +
  "No telemóvel: Definições → Câmara → Formatos → «Mais compatível», e as fotos " +
  "seguintes ficam em JPEG. Para esta, abre-a e exporta como JPEG.";

/** Isto parece um ficheiro HEIC, pelo nome ou pelo tipo que o browser declara?
 *  Do lado do navegador não há bytes para inspeccionar — há um `File`. */
export function nomeOuTipoDeHeic(nome: string, tipo: string): boolean {
  return /\.hei[cf]$/i.test(nome.trim()) || /^image\/hei[cf]/i.test(tipo);
}

export function recusaDeImagem(motivo: MotivoDeRecusa, nome: string): string {
  if (motivo === "heic") return `${nome} ${CONSELHO_HEIC}`;
  if (motivo === "incompleta") {
    return (
      `${nome} chegou incompleta — falta-lhe o fim do ficheiro, o que costuma ser a ` +
      `ligação a falhar a meio. Volta a carregá-la. (Se ficasse guardada assim, ` +
      `apareceria meia cinzenta na proposta.)`
    );
  }
  return `Não foi possível processar a imagem: ${nome}.`;
}
