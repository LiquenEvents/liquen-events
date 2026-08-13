import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
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
 * ── O QUE ESTÁ AQUI FIXO, E PORQUÊ ────────────────────────────────────────
 *
 * O nome e o cargo são da CASA, não de quem tem a sessão iniciada. É sempre a
 * mesma pessoa a assinar, independentemente de quem carregou no botão — é uma
 * assinatura de empresa, não um crachá de utilizador.
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

/** Quem assina. Da casa, sempre a mesma — nunca de quem tem a sessão aberta. */
export const ASSINATURA_NOME = "Catarina Gaspar";
export const ASSINATURA_CARGO = "Manager";

/** Referência `cid:` do banner (o logótipo tem a sua, no `email-logo.ts`). */
export const BANNER_EMAIL_CID = "liquen-banner";

/**
 * O BANNER É UM FICHEIRO QUE SE LARGA, NÃO CÓDIGO QUE SE ESCREVE.
 *
 * Ainda não existe. Quando existir, basta pô-lo em `public/email/` com um
 * destes nomes e passa a ir em todos os emails — sem tocar em código, sem
 * constante nenhuma para regenerar. Enquanto não estiver lá, a assinatura
 * fecha no rodapé e não fica nem espaço vazio nem imagem partida: o bloco do
 * banner simplesmente não é escrito, e nenhum `<img>` é emitido.
 *
 * O PNG é o nome preferido; o JPEG está aceite porque é o que costuma sair de
 * quem desenha a peça, e um ficheiro certo com a extensão «errada» calado é
 * como se perde uma tarde.
 *
 * Medidas recomendadas: 1120×280 px no ficheiro, para sair nítido nos ecrãs de
 * alta densidade, apresentado a 560×140 (é a largura do corpo destes emails).
 * Abaixo de ~120KB — vai em TODOS os emails.
 */
const BANNER_NOMES = ["banner-liquen-email.png", "banner-liquen-email.jpg"] as const;
export const BANNER_EMAIL_FICHEIRO = BANNER_NOMES[0];

/** Largura de apresentação do banner: a mesma do corpo destes emails. */
const BANNER_LARGURA = 560;
const BANNER_ALTURA = 140;

/** Acima disto o banner passa a pesar mais do que tudo o resto da mensagem. */
const BANNER_TECTO_BYTES = 200_000;

type BannerLido = { conteudo: Buffer; tipo: string };

/**
 * Lido do disco UMA vez e guardado — incluindo a ausência (`null`). Um
 * `readFileSync` por email seria uma ida ao disco em cada envio para, na
 * esmagadora maioria das vezes, confirmar que o ficheiro continua a não
 * existir. O ficheiro só muda com um deploy novo, que traz um processo novo.
 */
let bannerCache: BannerLido | null | undefined;

function bannerDoEmail(): BannerLido | null {
  if (bannerCache !== undefined) return bannerCache;
  for (const nome of BANNER_NOMES) {
    try {
      const conteudo = readFileSync(path.join(process.cwd(), "public", "email", nome));
      if (conteudo.byteLength > BANNER_TECTO_BYTES) {
        // Vai na mesma — um banner que não aparece por causa de um limite que
        // ninguém vê é pior do que um email pesado —, mas fica registado para
        // quem for ver porque é que o correio engordou.
        log.warn("assinatura: o banner do email é grande demais", {
          ficheiro: nome,
          bytes: conteudo.byteLength,
          tecto: BANNER_TECTO_BYTES,
        });
      }
      bannerCache = { conteudo, tipo: nome.endsWith(".png") ? "image/png" : "image/jpeg" };
      return bannerCache;
    } catch {
      // Não está lá (ou não se consegue ler): passa ao nome seguinte. A falta
      // do banner é o estado NORMAL de hoje, não uma avaria — nada a registar.
    }
  }
  bannerCache = null;
  return null;
}

/** Só para os testes: obriga a próxima leitura a ir outra vez ao disco. */
export function esquecerBannerDoEmail(): void {
  bannerCache = undefined;
}

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
export function assinaturaDeEmail(): { html: string; texto: string; anexos: Attachment[] } {
  const banner = bannerDoEmail();
  const redes = redesConfiguradas();
  const dominio = SITE.url.replace(/^https?:\/\//, "");

  const ligacao = (href: string, texto: string) =>
    `<a class="em-link" href="${esc(href)}" style="color:${LIGACAO};text-decoration:underline">${esc(texto)}</a>`;

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

  // Sem banner NÃO se escreve linha nenhuma — nem um `<td>` vazio, que numa
  // tabela de email deixa na mesma um degrau de espaço por baixo da assinatura.
  const linhaBanner = banner
    ? `<tr><td style="padding-top:18px">
           <img src="cid:${BANNER_EMAIL_CID}" alt="Líquen Events" width="${BANNER_LARGURA}" height="${BANNER_ALTURA}" style="display:block;width:100%;max-width:${BANNER_LARGURA}px;height:auto;border:0;border-radius:8px">
         </td></tr>`
    : "";

  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td class="em-hair" style="border-top:1px solid ${RISCO};padding-top:18px">
    <img src="cid:${EMAIL_LOGO_CID}" alt="Líquen Events" width="96" height="48" style="display:block;width:96px;height:48px;border:0">
  </td></tr>
  <tr><td style="padding-top:14px">
    <div class="em-strong" style="color:${TINTA};font-size:15px;font-weight:700;mso-line-height-rule:exactly;line-height:20px">${esc(ASSINATURA_NOME)}</div>
    <div class="em-muted" style="color:${CINZA};font-size:13px;font-style:italic;mso-line-height-rule:exactly;line-height:19px">${esc(ASSINATURA_CARGO)}</div>
  </td></tr>
  <tr><td style="padding-top:12px">
    <div style="mso-line-height-rule:exactly;line-height:21px"><a class="em-strong" href="tel:${esc(SITE.phone)}" style="color:${TINTA};text-decoration:none;font-size:13px;white-space:nowrap">${esc(SITE.phoneDisplay)}</a></div>
    <div style="mso-line-height-rule:exactly;line-height:21px;font-size:13px">${ligacao(`mailto:${MAIL_TO}`, MAIL_TO)}</div>
    <div style="mso-line-height-rule:exactly;line-height:21px;font-size:13px">${ligacao(SITE.url, dominio)}</div>
  </td></tr>
  ${linhaRedes}
  ${linhaBanner}
</table>`;

  // Coerente com o HTML, e não uma versão pobre dele: quem lê em texto tem de
  // ficar com os MESMOS contactos. Um email cujas duas alternativas divergem
  // muito é, por si só, um sinal de spam.
  const texto = [
    "--",
    ASSINATURA_NOME,
    ASSINATURA_CARGO,
    SITE.name,
    "",
    SITE.phoneDisplay,
    MAIL_TO,
    SITE.url,
    ...(redes.length ? ["", ...redes.map((r) => `${r.nome}: ${r.url}`)] : []),
  ].join("\n");

  const anexos: Attachment[] = [emailLogoAttachment()];
  if (banner) {
    anexos.push({
      // Buffer novo a cada chamada, pela mesma razão que está escrita no
      // `emailLogoAttachment`: o nodemailer consome o conteúdo, e um Buffer
      // partilhado ia vazio no segundo envio.
      filename: BANNER_EMAIL_FICHEIRO,
      content: Buffer.from(banner.conteudo),
      contentType: banner.tipo,
      cid: BANNER_EMAIL_CID,
    });
  }

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
 * logótipo e o banner de fora e punha duas cruzes vermelhas no email.
 */
export function emailAoCliente({ html, texto }: { html: string; texto: string }): {
  html: string;
  text: string;
  attachments: Attachment[];
} {
  const assinatura = assinaturaDeEmail();
  return {
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:${TINTA}">
${html}
${assinatura.html}
</div>`,
    text: `${texto}\n\n${assinatura.texto}`,
    attachments: assinatura.anexos,
  };
}
