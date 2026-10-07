import { esc } from "./mail";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE A EQUIPA RECEBE, NO MESMO DESENHO DO QUE VAI AO CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela, com a fotografia do email «Novo pedido de orçamento» à frente:
 * «quando recebemos está assim. coloca também com a mesma estrutura e design
 * quando enviamos para o cliente o email».
 *
 * O desenho é o de `docs/email-pedido-recebido-apple.html` (ver
 * `email-pedido-recebido.ts`): a mesma folha de estilo, o mesmo cartão de
 * 640 px, o mesmo logótipo, o mesmo título grande, o mesmo botão em cápsula, os
 * mesmos cartões cinzentos com linhas e o mesmo rodapé. O que muda é o
 * CONTEÚDO, que é o da equipa e não o do cliente:
 *
 *   · o título é o nome de quem pediu, e a data vem logo a seguir, em
 *     destaque — é ela que decide se o trabalho cabe na agenda;
 *   · os botões falam COM o cliente (WhatsApp com a mensagem já escrita,
 *     `mailto` com o assunto já escrito) — os mesmos de antes;
 *   · todos os campos que o email anterior mostrava continuam cá, incluindo a
 *     decoração, a cerimónia, o orçamento e as notas;
 *   · a referência fica, no rodapé: este email é interno, e é por ela que se
 *     procura o pedido mais tarde. (A regra «não mostrar a referência» é do
 *     email ao CLIENTE.)
 *
 * Não leva a assinatura nem o banner: não é a casa a escrever a alguém, é um
 * aviso para dentro — e o email anterior também não os levava.
 *
 * Este ficheiro só desenha. Quem decide os valores (o que é a data em
 * destaque, que linhas há, os `href` dos botões) continua a ser o `buildEmail`
 * da rota, que é onde essas decisões já estavam escritas e testadas.
 */

/**
 * A folha de estilo do desenho, igual à do email ao cliente. Está aqui escrita
 * outra vez, e não importada, porque o corpo daquele email é gerado a partir
 * do ficheiro dela; a igualdade das duas está presa por teste
 * (`email-pedido-equipa.test.ts`), para não se afastarem sem ninguém dar por
 * isso.
 */
export const ESTILO_DO_EMAIL = `<style>
  body { margin:0; padding:0; width:100% !important; background:#f5f5f7; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:#4d6650; }
  .sf { font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif; }

  @media only screen and (max-width:660px) {
    .canvas { padding:0 !important; }
    .card { border-radius:0 !important; }
    .pad { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:32px !important; line-height:36px !important; letter-spacing:0 !important; }
    .intro { font-size:19px !important; line-height:27px !important; }
    .h2 { font-size:21px !important; line-height:25px !important; }
    .cta-gap { display:block !important; height:14px !important; width:100% !important; }
    .cta-cell { display:block !important; width:100% !important; text-align:center !important; }
    .box-pad { padding-left:20px !important; padding-right:20px !important; }
  }

  @media (prefers-color-scheme: dark) {
    body, .canvas { background:#000000 !important; }
    .card { background:#1d1d1f !important; }
    .t1 { color:#f5f5f7 !important; }
    .t2 { color:#a1a1a6 !important; }
    .t3 { color:#86868b !important; }
    .box { background:#2a2a2c !important; }
    .line { border-color:#424245 !important; }
    .accent { color:#9dc0a2 !important; }
    .btn { background:#5d7a61 !important; }
    .step { background:#5d7a61 !important; }
  }
</style>`;

/** Uma linha de um cartão. Com `href`, o valor é uma ligação (mailto, tel). */
export interface LinhaDoCartao {
  rotulo: string;
  valor: string;
  href?: string;
}

export interface DadosDoPedidoParaAEquipa {
  /** `cid:` do logótipo. */
  logo: string;
  nome: string;
  /** «sexta, 6 nov 2026», ou o intervalo de um evento de vários dias. */
  data: string;
  fimDeSemana: boolean;
  /** «Conferências & Congressos · Eventos Empresariais». */
  subtitulo: string;
  /** O texto escondido que a caixa de correio mostra por baixo do assunto. */
  preheader: string;
  whatsapp: string;
  mailto: string;
  /** O lembrete de responder depressa — o do pedido urgente, quando o é. */
  lembrete: string;
  primeiroNome: string;
  pedido: LinhaDoCartao[];
  contacto: LinhaDoCartao[];
  notas: string;
  referencia: string;
  /** Quando chegou, já escrito para ela ler. */
  quando: string;
}

/** As linhas de um cartão, com o filete por baixo de todas menos a última. */
function linhas(lista: readonly LinhaDoCartao[]): string {
  return lista
    .map((l, i) => {
      const ultima = i === lista.length - 1;
      const filete = ultima ? "" : "border-bottom:1px solid #d2d2d7;";
      const classe = ultima ? "" : " line";
      const valor = l.href
        ? `<a href="${esc(l.href)}" class="accent" style="color:#4d6650;text-decoration:none;">${esc(l.valor)}</a>`
        : esc(l.valor);
      return `          <tr>
            <td class="t2${classe}" style="padding:14px 12px 14px 0;${filete}color:#6e6e73;">${esc(l.rotulo)}</td>
            <td class="t1${classe}" align="right" style="padding:14px 0;${filete}color:#1d1d1f;">${valor}</td>
          </tr>
`;
    })
    .join("");
}

/** Um cartão cinzento com título e linhas — o «O seu pedido.» do desenho dela. */
function cartao(titulo: string, lista: readonly LinhaDoCartao[], espacoEmCima: number): string {
  if (lista.length === 0) return "";
  return `  <tr><td class="pad" style="padding:${espacoEmCima}px 56px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box" style="background:#f5f5f7;border-radius:18px;">
      <tr><td class="box-pad" style="padding:28px 28px 6px;">
        <h2 class="h2 t1" style="margin:0;font-size:24px;line-height:28px;font-weight:600;letter-spacing:0.2px;color:#1d1d1f;">${esc(titulo)}</h2>
      </td></tr>
      <tr><td class="box-pad" style="padding:0 28px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:17px;line-height:22px;">
${linhas(lista)}        </table>
      </td></tr>
    </table>
  </td></tr>

`;
}

/**
 * Os botões. Três casos, agora que um pedido pode chegar só com telefone OU só
 * com email: a cápsula do WhatsApp e a ligação do email; só a cápsula; ou a
 * cápsula a ser o email. Um botão com `href` vazio parecia um botão e não fazia
 * nada — a pior das avarias num email que a equipa lê com pressa.
 */
function botoes(whatsapp: string, mailto: string): string {
  const capsula = (href: string, texto: string) => `          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(href)}" style="height:46px;v-text-anchor:middle;width:210px;" arcsize="50%" stroke="f" fillcolor="#4d6650">
            <w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:17px;">${esc(texto)}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${esc(href)}" class="btn" style="display:inline-block;background:#4d6650;color:#ffffff;text-decoration:none;font-size:17px;line-height:20px;font-weight:400;padding:13px 24px;border-radius:980px;">${esc(texto)}</a>
          <!--<![endif]-->`;

  if (whatsapp && mailto) {
    return `        <td class="cta-cell" align="center">
${capsula(whatsapp, "Enviar WhatsApp")}
        </td>
        <td class="cta-gap" width="24" style="width:24px;font-size:0;line-height:0;">&nbsp;</td>
        <td class="cta-cell" align="center">
          <a href="${esc(mailto)}" class="accent" style="color:#4d6650;text-decoration:none;font-size:17px;line-height:20px;white-space:nowrap;">Responder por email&nbsp;›</a>
        </td>`;
  }
  if (whatsapp || mailto) {
    return `        <td class="cta-cell" align="center">
${capsula(whatsapp || mailto, whatsapp ? "Enviar WhatsApp" : "Responder ao cliente")}
        </td>`;
  }
  // Inalcançável pelo esquema (exige email ou telefone), mas se alguém afrouxar
  // essa regra é melhor um aviso do que um botão morto.
  return `        <td class="cta-cell t2" align="center" style="font-size:17px;line-height:25px;color:#6e6e73;">Sem contacto registado.</td>`;
}

export function htmlDoPedidoParaAEquipa(d: DadosDoPedidoParaAEquipa): string {
  const data = `${esc(d.data)}${d.fimDeSemana ? " · fim de semana" : ""}`;
  const notas = d.notas.trim()
    ? `  <tr><td class="pad" style="padding:20px 56px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box" style="background:#f5f5f7;border-radius:18px;">
      <tr><td class="box-pad" style="padding:24px 28px 26px;">
        <p class="t1" style="margin:0;font-size:19px;line-height:23px;font-weight:600;color:#1d1d1f;">Notas do cliente</p>
        <p class="t2" style="margin:6px 0 0;font-size:17px;line-height:25px;color:#6e6e73;white-space:pre-wrap;">${esc(d.notas.trim())}</p>
      </td></tr>
    </table>
  </td></tr>

`
    : "";

  return `<!DOCTYPE html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Novo pedido de orçamento</title>
<!--[if mso]>
<style>table,td,div,p,a,h1,h2{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
<![endif]-->
${ESTILO_DO_EMAIL}
</head>
<body class="sf" style="margin:0;padding:0;background:#f5f5f7;">

<!-- Pré-visualização na caixa de entrada -->
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f5f5f7;">${esc(d.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="canvas" style="background:#f5f5f7;">
<tr><td align="center" class="canvas" style="padding:40px 12px;">

<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card sf" style="max-width:640px;background:#ffffff;border-radius:18px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f;">

  <!-- 1. LOGÓTIPO -->
  <tr><td align="center" class="pad" style="padding:44px 56px 0;">
    <img src="${esc(d.logo)}" width="104" alt="LÍQUEN EVENTS" class="t1" style="display:block;width:104px;height:auto;font-size:13px;line-height:18px;font-weight:600;letter-spacing:2px;color:#4d6650;">
  </td></tr>

  <!-- 2. QUEM PEDIU -->
  <tr><td align="center" class="pad" style="padding:48px 56px 0;">
    <p class="accent" style="margin:0 0 12px;font-size:17px;line-height:21px;font-weight:600;color:#4d6650;">Novo pedido de orçamento</p>
    <h1 class="h1 t1" style="margin:0;font-size:40px;line-height:44px;font-weight:600;letter-spacing:-0.3px;color:#1d1d1f;">${esc(d.nome)}</h1>
  </td></tr>

  <!-- 3. A DATA, EM DESTAQUE: é ela que decide se o trabalho cabe na agenda -->
  <tr><td align="center" class="pad" style="padding:20px 56px 0;">
    <p class="intro t1" style="margin:0;font-size:21px;line-height:29px;font-weight:400;color:#1d1d1f;">${data}</p>
${d.subtitulo ? `    <p class="t2" style="margin:14px 0 0;font-size:17px;line-height:25px;color:#6e6e73;">${esc(d.subtitulo)}</p>\n` : ""}  </td></tr>

  <!-- 4. RESPONDER AO CLIENTE -->
  <tr><td align="center" class="pad" style="padding:30px 56px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
      <tr>
${botoes(d.whatsapp, d.mailto)}
      </tr>
    </table>
    <p class="t2" style="margin:16px 0 0;font-size:14px;line-height:20px;color:#6e6e73;">${esc(d.lembrete)}</p>
  </td></tr>

  <!-- 5. O PEDIDO -->
${cartao("O pedido.", d.pedido, 56)}  <!-- 6. CONTACTO -->
${cartao("Contacto.", d.contacto, 20)}  <!-- 7. NOTAS DO CLIENTE -->
${notas}  <!-- 8. RODAPÉ -->
  <tr><td class="pad" style="padding:32px 56px 44px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="line" style="border-top:1px solid #d2d2d7;padding-top:18px;">
        <p class="t2" style="margin:0;font-size:12px;line-height:16px;color:#6e6e73;">Também pode responder a este email — a resposta vai direta para ${esc(d.primeiroNome)}.</p>
        <p class="t3" style="margin:8px 0 0;font-size:12px;line-height:16px;color:#86868b;">Ref. ${esc(d.referencia)} · ${esc(d.quando)}</p>
      </td></tr>
    </table>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>`;
}
