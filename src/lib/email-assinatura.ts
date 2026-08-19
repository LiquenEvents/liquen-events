import "server-only";
import { esc, MAIL_TO, type Attachment } from "./mail";
import { SITE } from "./site";
import { EMAIL_LOGO_CID, emailLogoAttachment } from "./email-logo";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ASSINATURA DA CASA — UMA SÓ, PARA TODO O CORREIO QUE SAI PARA O CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada rota que escrevia a um cliente inventava o seu próprio rodapé, e havia
 * cinco versões da mesma linha («Líquen Events · email · telefone») espalhadas
 * por cinco ficheiros. Mudar o telefone obrigava a caçá-las uma a uma, e quem
 * escrevesse a sexta rota copiava a que tivesse mais à mão. Isto é a fonte
 * única: mudar aqui muda em todos os emails, e um caminho novo que use o
 * {@link emailAoCliente} leva a assinatura sem ter de se lembrar dela.
 *
 * ── QUEM ASSINA: QUEM ENVIOU, COM A CASA COMO RECURSO ─────────────────────
 *
 * Era fixo — assinava sempre «Catarina Gaspar», saísse o email de quem saísse.
 * Fazia sentido quando havia uma conta; com várias (`admin-auth.ts`) deixou de
 * fazer: quem escreve ao casal assina o que escreveu, e o casal responde a uma
 * pessoa. O nome vem da sessão (ver `email-quem-assina.ts`), e o da casa é o
 * recurso — para o correio que ninguém enviou à mão (a confirmação automática
 * do formulário público) e para quando a sessão não traz nome.
 *
 * O CARGO continua a ser um só e é dela. Não acompanha outro nome: «Manager»
 * debaixo do nome de outra pessoa é uma promoção inventada pelo software, e
 * nenhum cargo é melhor do que um cargo falso. O dia em que as contas tiverem
 * um campo `cargo` (`ADMIN_USERS`, no `admin-auth.ts`) é o dia em que isto
 * deixa de ser preciso.
 *
 * Os CONTACTOS não estão escritos aqui: vêm do `SITE`/`MAIL_TO`. É de
 * propósito e não é zelo — a assinatura que ela usa hoje no telemóvel tem
 * «líquen.alentejo@gmail.com» e «líquen-events.com» COM ACENTO no i. Um
 * endereço com acento não existe e uma ligação para `líquen-events.com` não
 * abre. Escrever os contactos à mão aqui era copiar esse erro para dentro de
 * todos os emails que saem; lidos do `SITE` são, por construção, os
 * verdadeiros. O mesmo para o espaçamento do número: um só, o do `SITE`.
 *
 * ── IMAGENS: SÓ POR `cid:` ────────────────────────────────────────────────
 *
 * Vale aqui, e com mais força, tudo o que está escrito no `email-logo.ts`: uma
 * imagem remota parte-se enquanto o deploy não subiu e é bloqueada por
 * omissão pelo Gmail/Outlook/Apple Mail quando o remetente é desconhecido —
 * que é o caso de metade destes emails. Nenhum `<img>` daqui aponta para um
 * URL: os bytes viajam com a mensagem.
 *
 * ── AS REDES SÃO TEXTO, NÃO ÍCONES ────────────────────────────────────────
 *
 * A assinatura de origem tem três ícones sociais pretos. Aqui saem como
 * palavras, e a escolha tem três razões:
 *
 *   1. PESO. Cada ícone seria mais um anexo `cid` em CADA email. O logótipo já
 *      são ~7KB de base64 por mensagem, e a proposta ainda leva um PDF atrás;
 *      três imagens de 16px por cima disso é peso que se paga em todos os
 *      envios para ganhar um enfeite.
 *   2. O OUTLOOK. Escala imagens minúsculas ao seu critério em ecrãs de alta
 *      densidade — um ícone de 16px sai borratado ou com um pixel de desalinho
 *      que não se consegue corrigir por CSS, porque metade do CSS moderno lá
 *      não existe. Uma palavra sai sempre bem.
 *   3. LEGIBILIDADE. Um ícone de 16px sem etiqueta é um enigma para quem lê com
 *      as imagens desligadas ou com um leitor de ecrã; «Instagram» não é.
 *
 * Trocar para ícones `cid:` é uma mudança pequena e localizada (juntar os
 * anexos em {@link assinaturaDeEmail} e trocar as palavras por `<img>`), se
 * ela preferir o desenho ao peso.
 */

/** Quem assina quando não há sessão com nome — e quem assina a protecção. */
export const ASSINATURA_NOME = "Catarina Gaspar";
export const ASSINATURA_CARGO = "Manager";

/** Um nome não vai além disto na assinatura: cabe numa linha em qualquer ecrã. */
const MAXIMO_NOME = 60;

export interface QuemAssina {
  /** O nome de quem tem a sessão iniciada. Vazio → assina a casa. */
  nome?: string;
  /**
   * O nome de quem RECEBE. Não aparece em lado nenhum do email: existe só para
   * a protecção abaixo poder comparar os dois.
   */
  destinatario?: string;
}

/**
 * Dois nomes comparam-se sem acentos, sem maiúsculas e sem pontuação: «MÓNICA
 * Teófilo», «monica teofilo» e «Mónica  Teófilo.» são a mesma pessoa, e a
 * protecção não pode desfazer-se por causa de um acento que alguém não escreveu
 * no formulário.
 */
function normalizarNome(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM EMAIL SAI ASSINADO COM O NOME DE QUEM O VAI LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Saiu um email a uma cliente com duas assinaturas contraditórias, e uma delas
 * era o nome DELA. A causa estava no corpo — um `{nome}` que ficou no rodapé de
 * um modelo guardado no back office (ver `email-modelos.ts`), e portanto texto
 * dela, não código nosso —, mas a regra vale à mesma e vale daqui para a
 * frente: se o nome de quem assina for o nome de quem recebe, alguma coisa se
 * trocou pelo caminho, e o que se faz nesse caso não é adivinhar — é assinar a
 * casa, que nunca está errada, e deixar rasto.
 *
 * O rasto NÃO leva os nomes. O `log.warn` acaba no webhook de alertas
 * (`logger.ts`), que serializa o contexto para dentro de um `fetch`: o nome de
 * uma cliente não sai daqui para fora por causa de um aviso. Saber que
 * aconteceu, e em que envio, chega para ir ver.
 */
export function assinanteDoEmail(quem: QuemAssina = {}): { nome: string; cargo: string } {
  const daCasa = { nome: ASSINATURA_NOME, cargo: ASSINATURA_CARGO };

  const candidato = String(quem.nome ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAXIMO_NOME);
  if (!candidato) return daCasa;

  const destinatario = normalizarNome(quem.destinatario);
  if (destinatario && destinatario === normalizarNome(candidato)) {
    log.warn("assinatura: o nome de quem envia era igual ao do destinatário — assinou a casa");
    return daCasa;
  }

  // O cargo é dela e só acompanha o nome dela — incluindo quando a conta se
  // chama só «Catarina» e a assinatura da casa é «Catarina Gaspar».
  const nome = normalizarNome(candidato);
  const casa = normalizarNome(ASSINATURA_NOME);
  const ehDaCasa = nome === casa || casa.startsWith(`${nome} `);
  return { nome: candidato, cargo: ehDaCasa ? ASSINATURA_CARGO : "" };
}

/**
 * ── O BANNER FOI-SE, E NÃO VOLTA POR SE LARGAR UM FICHEIRO ────────────────
 *
 * Havia aqui um segundo bloco de imagem no fim da assinatura: bastava pôr um
 * `banner-liquen-email.png` em `public/email/` e ele passava a ir em todos os
 * emails, sem tocar em código. O ficheiro foi lá posto, e o que chegava à caixa
 * do cliente era um rectângulo verde de 560×140 (~200 px de altura no
 * telemóvel) com o logótipo outra vez — o mesmo logótipo que está três linhas
 * acima, no topo da assinatura. Metade da peça era verde vazio.
 *
 * Tirou-se o FICHEIRO e tirou-se o MECANISMO, e a segunda metade é que é a
 * correcção: só apagar o PNG deixava a porta aberta para o próximo que largasse
 * um ficheiro com aquele nome — o banner voltava a todos os emails sem que
 * ninguém tivesse escrito uma linha, que foi exactamente como ele apareceu.
 *
 * Se um dia houver uma peça gráfica que valha o peso (vai em TODOS os envios) e
 * que diga alguma coisa que a assinatura ainda não diz, escreve-se aqui, à
 * vista, com o `cid:` e o anexo ao lado — como o logótipo. Uma imagem que entra
 * no correio da casa é uma decisão, não um efeito secundário de copiar um
 * ficheiro para uma pasta.
 */

type Rede = { nome: string; url: string };

/**
 * As redes que ESTÃO configuradas. O LinkedIn ainda não tem endereço
 * (`SITE.linkedin` está vazio de propósito, com a nota lá): fica de fora
 * enquanto assim for, porque um link social que não vai a lado nenhum é pior
 * do que não ter link nenhum. Assim que o endereço lá estiver, aparece sozinho.
 */
function redesConfiguradas(): Rede[] {
  const todas: Rede[] = [
    { nome: "Instagram", url: SITE.instagram },
    { nome: "Facebook", url: SITE.facebook },
    { nome: "LinkedIn", url: SITE.linkedin },
  ];
  return todas.filter((r) => r.url.trim() !== "");
}

// Cores em linha, porque um `<style>` no cabeçalho não sobrevive ao Gmail e
// estes blocos entram tanto num email com folha de estilo (a confirmação)
// como num fragmento sem nenhuma. As classes `em-*` não fazem falta a
// ninguém — onde a folha existe, dão o modo escuro de borla; onde não existe,
// não são nada.
const TINTA = "#2a2620";
const CINZA = "#8f8a7a";
const RISCO = "#ece7dc";
const LIGACAO = "#1155cc";

/**
 * A assinatura, nas duas versões e com os anexos que ela precisa.
 *
 * As três peças vêm juntas de propósito: o HTML refere `cid:`s que só existem
 * se os anexos forem os que vêm aqui, e quem lê em texto simples não pode
 * ficar sem os contactos que o HTML mostra. Devolvê-las separadamente era
 * abrir a porta a um email com um `<img>` a apontar para um anexo que ficou
 * para trás — uma cruz vermelha na caixa de correio do cliente.
 */
export function assinaturaDeEmail(quem: QuemAssina = {}): {
  html: string;
  texto: string;
  anexos: Attachment[];
} {
  const assinante = assinanteDoEmail(quem);
  const redes = redesConfiguradas();
  const dominio = SITE.url.replace(/^https?:\/\//, "");

  const ligacao = (href: string, texto: string) =>
    `<a class="em-link" href="${esc(href)}" style="color:${LIGACAO};text-decoration:underline">${esc(texto)}</a>`;

  // Sem cargo NÃO se escreve a linha — um `<div>` vazio deixa na mesma um
  // degrau de espaço por baixo do nome, e um degrau que só aparece a algumas
  // pessoas é do género de defeito que ninguém consegue descrever ao telefone.
  const linhaCargo = assinante.cargo
    ? `<div class="em-muted" style="color:${CINZA};font-size:13px;font-style:italic;mso-line-height-rule:exactly;line-height:19px">${esc(assinante.cargo)}</div>`
    : "";

  const linhaRedes = redes.length
    ? `<tr><td style="padding-top:12px">${redes
        .map(
          (r) =>
            `<a class="em-strong" href="${esc(r.url)}" style="color:${TINTA};text-decoration:underline;font-size:12px">${esc(r.nome)}</a>`,
        )
        .join(
          `<span class="em-muted" style="color:${CINZA};font-size:12px">&nbsp;·&nbsp;</span>`,
        )}</td></tr>`
    : "";

  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td class="em-hair" style="border-top:1px solid ${RISCO};padding-top:18px">
    <img src="cid:${EMAIL_LOGO_CID}" alt="Líquen Events" width="96" height="48" style="display:block;width:96px;height:48px;border:0">
  </td></tr>
  <tr><td style="padding-top:14px">
    <div class="em-strong" style="color:${TINTA};font-size:15px;font-weight:700;mso-line-height-rule:exactly;line-height:20px">${esc(assinante.nome)}</div>
    ${linhaCargo}
  </td></tr>
  <tr><td style="padding-top:12px">
    <div style="mso-line-height-rule:exactly;line-height:21px"><a class="em-strong" href="tel:${esc(SITE.phone)}" style="color:${TINTA};text-decoration:none;font-size:13px;white-space:nowrap">${esc(SITE.phoneDisplay)}</a></div>
    <div style="mso-line-height-rule:exactly;line-height:21px;font-size:13px">${ligacao(`mailto:${MAIL_TO}`, MAIL_TO)}</div>
    <div style="mso-line-height-rule:exactly;line-height:21px;font-size:13px">${ligacao(SITE.url, dominio)}</div>
  </td></tr>
  ${linhaRedes}
</table>`;

  // Coerente com o HTML, e não uma versão pobre dele: quem lê em texto tem de
  // ficar com os MESMOS contactos. Um email cujas duas alternativas divergem
  // muito é, por si só, um sinal de spam.
  const texto = [
    "--",
    assinante.nome,
    ...(assinante.cargo ? [assinante.cargo] : []),
    SITE.name,
    "",
    SITE.phoneDisplay,
    MAIL_TO,
    SITE.url,
    ...(redes.length ? ["", ...redes.map((r) => `${r.nome}: ${r.url}`)] : []),
  ].join("\n");

  // Só o logótipo. Buffer novo a cada chamada — o porquê está no
  // `emailLogoAttachment`: o nodemailer consome o conteúdo, e um Buffer
  // partilhado ia vazio no segundo envio.
  const anexos: Attachment[] = [emailLogoAttachment()];

  return { html, texto, anexos };
}

/**
 * Um email para o cliente, pronto a entregar ao `sendMail`.
 *
 * Recebe o CORPO (o que aquele email tem de particular) e devolve a mensagem
 * inteira — moldura, assinatura e anexos. É a forma de a assinatura não
 * depender de cada rota se lembrar dela: quem escreve ao cliente chama isto e
 * fica servido.
 *
 * O `html` do corpo é markup já montado por quem chama (e já escapado com
 * `esc` onde tem valores de fora); o `texto` é a versão em texto simples do
 * mesmo corpo, sem escape nenhum — escapar é uma preocupação de HTML.
 *
 * Quem tiver anexos próprios (o PDF da proposta, o do recibo) junta-os aos
 * `attachments` devolvidos, em vez de os substituir — substituí-los deixava o
 * logótipo de fora e punha uma cruz vermelha no email.
 */
export function emailAoCliente({
  html,
  texto,
  quem,
}: {
  html: string;
  texto: string;
  /** Quem envia (e quem recebe, para a protecção). Ausente → assina a casa. */
  quem?: QuemAssina;
}): {
  html: string;
  text: string;
  attachments: Attachment[];
} {
  const assinatura = assinaturaDeEmail(quem);
  return {
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:${TINTA}">
${html}
${assinatura.html}
</div>`,
    text: `${texto}\n\n${assinatura.texto}`,
    attachments: assinatura.anexos,
  };
}
