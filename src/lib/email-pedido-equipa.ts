import { esc } from "./mail";
import { ESTILO_DA_CARTA } from "./email-pedido-recebido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE A EQUIPA RECEBE, COM A ESTRUTURA DA CARTA AO CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela, a 14/10: «quero que coloques a estrutura do email que enviamos
 * para o cliente a dizer que recebemos o pedido no email que recebemos quando
 * recebemos o pedido do cliente».
 *
 * O email ao cliente passou à CARTA (`email-pedido-recebido.ts`, o desenho dela
 * em `docs/email-pedido-recebido-carta.html`), e este ficou para trás no
 * desenho anterior (fundo cinzento, cartão, cápsula, cartões cinzentos). Passa
 * à mesma estrutura, pela mesma ordem:
 *
 *   · página branca de 600 px, o logótipo à esquerda;
 *   · o título grande e, por baixo, em cinzento, o que é e quando é;
 *   · o filete;
 *   · o que fazer (responder por WhatsApp ou por email), como ligações — a
 *     carta não tem cápsulas;
 *   · o resumo numa tabela de linhas finas, com o mesmo desenho das linhas da
 *     carta (rótulo de 140 px, filete de `#d2d2d7`), o contacto incluído, e a
 *     referência no fim;
 *   · as notas do cliente como texto da carta;
 *   · o rodapé por baixo de um filete.
 *
 * A folha de estilo é a MESMA constante (`ESTILO_DA_CARTA`), importada e não
 * copiada: o modo escuro e o telemóvel ficam iguais nos dois sem ninguém ter
 * de os manter em dois sítios.
 *
 * O título é quem é — o casal, quando quem escreveu é outra pessoa (ver
 * `quem-pede.ts`) — porque é isso que a equipa procura primeiro. Não leva a
 * assinatura nem o banner: não é a casa a escrever a alguém, é um aviso para
 * dentro.
 *
 * Este ficheiro só desenha. Quem decide os valores (a data, que linhas há, os
 * `href`) continua a ser o `buildEmail` da rota.
 */

/** A folha de estilo, a da carta. O nome antigo fica para quem já o usa. */
export const ESTILO_DO_EMAIL = ESTILO_DA_CARTA;

export interface LinhaDoCartao {
  rotulo: string;
  valor: string;
  href?: string;
}

export interface DadosDoPedidoParaAEquipa {
  /** `cid:` do logótipo. */
  logo: string;
  /** O que vai em grande: o casal, ou quem escreveu (ver `quem-pede.ts`). */
  nome: string;
  /** Quem escreveu, quando não é um dos noivos: uma linha por baixo do nome. */
  feitoPor?: string | null;
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
  /** Para onde vai a resposta a este email (o email do pedido), se o houver. */
  respostaPara?: string;
  pedido: LinhaDoCartao[];
  contacto: LinhaDoCartao[];
  notas: string;
  referencia: string;
  /** Quando chegou, já escrito para ela ler. */
  quando: string;
}

/**
 * Uma linha do resumo, com o desenho das linhas da carta: todas com o filete
 * de cima, e a última também com o de baixo.
 */
function linhaDoResumo(l: LinhaDoCartao, ultima: boolean, quebra = false): string {
  const fundo = ultima ? "border-bottom:1px solid #d2d2d7;" : "";
  const valor = l.href
    ? `<a href="${esc(l.href)}" class="accent" style="color:#4d6650;text-decoration:none;">${esc(l.valor)}</a>`
    : esc(l.valor);
  return `      <tr>
        <td class="lbl t2 line" width="140" valign="top" style="width:140px;padding:12px 12px 12px 0;border-top:1px solid #d2d2d7;${fundo}color:#6e6e73;">${esc(l.rotulo)}</td>
        <td class="t1 line" valign="top" style="padding:12px 0;border-top:1px solid #d2d2d7;${fundo}color:#1d1d1f;${quebra ? "word-break:break-all;" : ""}">${valor}</td>
      </tr>
`;
}

/**
 * O que fazer, em ligações e não em cápsulas (a carta não as tem). Três casos,
 * agora que um pedido pode chegar só com telefone OU só com email; uma ligação
 * com `href` vazio parecia uma acção e não fazia nada.
 */
function responder(whatsapp: string, mailto: string): string {
  const ligacao = (href: string, texto: string) =>
    `<a href="${esc(href)}" class="accent" style="color:#4d6650;text-decoration:none;font-weight:600;white-space:nowrap;">${esc(texto)}&nbsp;›</a>`;
  const partes = [
    whatsapp ? ligacao(whatsapp, "Enviar WhatsApp") : "",
    mailto ? ligacao(mailto, "Responder por email") : "",
  ].filter(Boolean);
  if (partes.length === 0) {
    // Inalcançável pelo esquema (exige email ou telefone), mas se alguém
    // afrouxar essa regra é melhor um aviso do que uma ligação morta.
    return `<span class="t2" style="color:#6e6e73;">Sem contacto registado.</span>`;
  }
  // Espaços normais à volta do «·»: num telemóvel estreito as duas ligações
  // quebram para duas linhas em vez de saírem da largura do ecrã.
  return partes.join(` <span class="t3" style="color:#86868b;">&nbsp;·&nbsp;</span> `);
}

export function htmlDoPedidoParaAEquipa(d: DadosDoPedidoParaAEquipa): string {
  const quando = `${d.data}${d.fimDeSemana ? " · fim de semana" : ""}`;
  const subtitulo = ["Novo pedido de orçamento", d.subtitulo, quando].filter(Boolean).join(" · ");
  const feitoPor = d.feitoPor
    ? `
    <p class="t2" style="margin:6px 0 0;font-size:17px;line-height:24px;color:#6e6e73;">Pedido feito por ${esc(d.feitoPor)}</p>`
    : "";

  // O resumo: o pedido, depois o contacto, e a referência no fim — por onde se
  // procura o pedido mais tarde.
  const todas: { l: LinhaDoCartao; quebra: boolean }[] = [
    ...d.pedido.map((l) => ({ l, quebra: false })),
    ...d.contacto.map((l) => ({ l, quebra: false })),
    { l: { rotulo: "Referência", valor: d.referencia }, quebra: true },
  ].filter(({ l }) => l.valor.trim() !== "");
  const linhas = todas
    .map(({ l, quebra }, i) => linhaDoResumo(l, i === todas.length - 1, quebra))
    .join("");

  const notas = d.notas.trim()
    ? `  <!-- Notas do cliente -->
  <tr><td class="pad" style="padding:28px 40px 0;">
    <p class="t2" style="margin:0;font-size:15px;line-height:22px;color:#6e6e73;">Notas do cliente</p>
    <p class="t1" style="margin:6px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;white-space:pre-wrap;">${esc(d.notas.trim())}</p>
  </td></tr>

`
    : "";

  const resposta =
    d.feitoPor && d.respostaPara
      ? `a resposta vai para ${esc(d.respostaPara)}`
      : `a resposta vai direta para ${esc(d.primeiroNome)}`;

  return `<!DOCTYPE html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Novo pedido de orçamento</title>
<!--[if mso]>
<style>table,td,div,p,a,h1{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
<![endif]-->
${ESTILO_DO_EMAIL}
</head>
<body style="margin:0;padding:0;background:#ffffff;">

<!-- Pré-visualização na caixa de entrada -->
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${esc(d.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background:#ffffff;">
<tr><td align="center">

<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f;">

  <!-- Logótipo -->
  <tr><td class="pad top" style="padding:48px 40px 0;">
    <img src="${esc(d.logo)}" width="96" alt="LÍQUEN EVENTS" style="display:block;width:96px;height:auto;font-size:12px;line-height:16px;font-weight:600;letter-spacing:2px;color:#4d6650;">
  </td></tr>

  <!-- Título: quem é, e o que é e quando -->
  <tr><td class="pad" style="padding:40px 40px 0;">
    <h1 class="h1 t1" style="margin:0;font-size:32px;line-height:36px;font-weight:600;letter-spacing:0.1px;color:#1d1d1f;">${esc(d.nome)}</h1>
    <p class="t2" style="margin:6px 0 0;font-size:17px;line-height:24px;color:#6e6e73;">${esc(subtitulo)}</p>${feitoPor}
  </td></tr>

  <!-- Linha -->
  <tr><td class="pad" style="padding:28px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="line" style="border-top:1px solid #d2d2d7;font-size:0;line-height:0;">&nbsp;</td></tr></table>
  </td></tr>

  <!-- Responder ao cliente -->
  <tr><td class="pad" style="padding:28px 40px 0;">
    <p class="t1" style="margin:0;font-size:17px;line-height:27px;color:#1d1d1f;">${responder(d.whatsapp, d.mailto)}</p>
    <p class="t2" style="margin:6px 0 0;font-size:15px;line-height:22px;color:#6e6e73;">${esc(d.lembrete)}</p>
  </td></tr>

  <!-- O pedido: tabela de linhas finas -->
  <tr><td class="pad" style="padding:24px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;line-height:22px;">
${linhas}    </table>
  </td></tr>

${notas}  <!-- Rodapé -->
  <tr><td class="pad" style="padding:28px 40px 48px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="line" style="border-top:1px solid #d2d2d7;padding-top:16px;">
        <p class="t3" style="margin:0;font-size:12px;line-height:17px;color:#86868b;">Também pode responder a este email — ${resposta}.</p>
        <p class="t3" style="margin:6px 0 0;font-size:12px;line-height:17px;color:#86868b;">Chegou a ${esc(d.quando)}.</p>
      </td></tr>
    </table>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>

</body>
</html>
`;
}
