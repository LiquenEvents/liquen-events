/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ÚNICA VARIÁVEL QUE AINDA NÃO EXISTE QUANDO O ECRÃ DE ENVIO ABRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã de envio abre com o corpo JÁ RESOLVIDO: o nome do casal, a data, o
 * local, o valor — tudo lá dentro, pronto a sair sem se lhe tocar. Com uma
 * excepção, e é uma excepção de facto e não de desenho: a `{{link_proposta}}`.
 *
 * O endereço de aceitação é `SITE.url/proposta/<token>`, e o token é um HMAC
 * sobre o ID DA PROPOSTA. A proposta é criada no envio — é a linha que a rota
 * grava depois de desenhar o PDF —, portanto no instante em que o ecrã abre
 * ainda não há id nenhum para assinar. As saídas que se consideraram:
 *
 *  · MOSTRAR O LINK DA PROPOSTA ANTERIOR. É o que uma leitura distraída faria,
 *    e mandava ao casal o endereço de um documento que já não é o que segue em
 *    anexo. Pior do que não haver link nenhum.
 *  · CRIAR A LINHA DA PROPOSTA AO ABRIR O ECRÃ. Dava o link verdadeiro, e
 *    deixava uma proposta «por enviar» no quadro por cada vez que alguém
 *    espreita o passo 3 e fecha o portátil.
 *  · DEIXAR O ID VIR DO NAVEGADOR. Um id escolhido de fora a entrar numa
 *    chave primária, e um link morto sempre que a reserva não fosse honrada.
 *
 * Fica então o MARCADOR: o corpo do rascunho leva `{{link_proposta}}` tal e
 * qual, e o envio troca-o pelo endereço a sério no momento em que ele passa a
 * existir — uma substituição literal de uma cadeia que fomos NÓS que lá
 * pusemos, feita no servidor, depois de a proposta estar gravada.
 *
 * ── PORQUE É QUE ISTO NÃO É «VOLTAR AO INTERPRETADOR» ─────────────────────
 *
 * O `email-template-engine` tem escrito, com todas as letras, que um valor
 * substituído NUNCA volta ao interpretador: um cliente chamado
 * «{{remetente_nome}}» não pode passar a assinar o email. Isso continua a
 * valer. Aqui não se interpreta nada — não se analisa a fonte, não se avaliam
 * blocos, não se lê nenhum mapa de valores. Troca-se UM texto conhecido por UM
 * endereço que o servidor acabou de assinar. Um corpo onde alguém escreva
 * `{{cliente_nome}}` sai com `{{cliente_nome}}` lá escrito, como sairia
 * qualquer outra palavra — e é isso que se quer, porque o corpo do envio é
 * texto de uma pessoa, não um modelo.
 *
 * ── E SE ELA APAGAR O MARCADOR ────────────────────────────────────────────
 *
 * Sai um email sem ligação, e o casal fica com o PDF em anexo e mais nada.
 * É uma escolha legítima (há quem prefira falar antes), mas não pode ser uma
 * escolha por acidente: o ecrã de envio pergunta-lho ANTES, com o
 * {@link temLigacaoDaProposta}. Aqui não se repõe nada — pôr um link que ela
 * apagou era decidir por ela dentro do texto que ela escreveu.
 */

/**
 * O marcador, escrito exactamente como a variável do modelo dela.
 *
 * É o MESMO texto que ela vê no editor de «Modelos de email», e não um
 * inventado (`[ligação]`, `<link>`): quem escreve os modelos já sabe ler
 * `{{link_proposta}}`, e um segundo dialecto só para o ecrã de envio era mais
 * uma coisa para aprender e mais uma para o envio poder falhar a substituir.
 */
export const MARCADOR_DA_LIGACAO = "{{link_proposta}}";

/**
 * O valor que o interpretador recebe para a `link_proposta` num RASCUNHO.
 *
 * Não é vazio de propósito, e a diferença é grande: com vazio, o
 * `{{#se link_proposta}}` de um modelo fechava-se e a frase que anuncia a
 * ligação desaparecia do rascunho — para reaparecer no email, onde já não dava
 * para a ler antes de mandar. E o aviso de variáveis por preencher acusava
 * TODOS os envios, sempre, de lhe faltar o link: gritar em todos os casos é a
 * maneira mais segura de ninguém voltar a ler um aviso.
 */
export const VALOR_DA_LIGACAO_NO_RASCUNHO = MARCADOR_DA_LIGACAO;

/** O corpo já tem por onde o casal chegar à proposta? */
export function temLigacaoDaProposta(texto: string): boolean {
  return String(texto ?? "").includes(MARCADOR_DA_LIGACAO);
}

/**
 * O corpo pronto a sair: o marcador trocado pelo endereço verdadeiro.
 *
 * TODAS as ocorrências, não só a primeira — um modelo pode citar a ligação no
 * meio e outra vez no fim, e um segundo `{{link_proposta}}` por trocar era
 * exactamente o «Olá ,» desta funcionalidade, com outro nome.
 *
 * Um corpo sem marcador nenhum volta byte a byte como entrou: é o caminho de
 * todos os envios anteriores a este ecrã existir, e não pode ganhar um link
 * que ninguém pediu.
 */
export function resolverLigacaoDaProposta(texto: string, url: string): string {
  const corpo = String(texto ?? "");
  const endereco = String(url ?? "").trim();
  if (!endereco) return corpo;
  return corpo.split(MARCADOR_DA_LIGACAO).join(endereco);
}
