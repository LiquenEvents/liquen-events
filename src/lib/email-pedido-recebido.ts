import { esc } from "./mail";
import { longDate } from "./workdays";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL «PEDIDO RECEBIDO», NO DESENHO NOVO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O desenho é dela e está guardado, tal como chegou, em
 * `docs/email-pedido-recebido-apple.html`. As regras dela para este email:
 *
 *   · não se alteram textos, cores, tamanhos nem espaçamentos do HTML;
 *   · a referência do pedido NÃO aparece (nem no corpo, nem no pré-cabeçalho,
 *     nem na mensagem do WhatsApp — o botão abre o WhatsApp sem texto);
 *   · o assunto é «Recebemos o seu pedido.», com o ponto;
 *   · registo singular («o seu pedido») para toda a gente, casais incluídos;
 *   · a data por definir diz «Ainda a definir», e os convidados dizem a
 *     estimativa que a pessoa escolheu no formulário;
 *   · o bloco da Catarina, os contactos, as redes e o banner mantêm-se.
 *
 * ── PORQUE É QUE ESTE FICHEIRO NÃO LÊ O DISCO ───────────────────────────
 *
 * É só o desenho: recebe os valores e devolve o HTML. Quem sabe onde estão as
 * imagens e quem assina é o `client-confirmation.ts`. Assim o teste de
 * fidelidade (`email-pedido-recebido.test.ts`) pode pôr este HTML lado a lado
 * com o ficheiro dela e exigir que sejam IGUAIS, byte a byte, com os valores
 * de exemplo — que é a única forma de provar «não se alterou nada».
 *
 * O corpo do HTML foi gerado a partir do ficheiro dela por substituições
 * exactas, e não reescrito à mão. Saiu só o comentário «A TROCAR antes de
 * usar…», que era uma instrução para quem integra e não tem nada a fazer na
 * caixa de correio de um cliente.
 *
 * ── AS IMAGENS SÃO ANEXOS `cid:` ────────────────────────────────────────
 *
 * Nunca endereços remotos (ver `email-logo.ts`): o Gmail, o Outlook e o Apple
 * Mail bloqueiam imagens remotas de um remetente que a pessoa não conhece, que
 * é o caso de quem acabou de mandar o primeiro pedido.
 */

export type IdiomaDoPedidoRecebido = "pt" | "en";

/** Uma rede social que tem endereço E ícone anexado. */
export interface RedeDoEmail {
  nome: string;
  url: string;
  /** O `cid` do anexo com o ícone (sem o prefixo `cid:`). */
  cid: string;
}

export interface DadosDoPedidoRecebido {
  locale: IdiomaDoPedidoRecebido;
  /** Primeiro nome, já limpo. Vazio → o email começa em «O seu pedido…». */
  nome: string;
  pedido: {
    /** A etiqueta do evento, já na língua do email. */
    evento: string;
    /** ISO `aaaa-mm-dd`. Vazio quando ela escolheu «ainda a definir». */
    data: string;
    /** Número exacto, quando o deu. */
    convidados?: number;
    /** A estimativa que escolheu («50 a 100»), já na língua do email. */
    convidadosEstimativa?: string;
    local: string;
    /** Já com o rótulo na língua do email («Interior», «Indoors»). */
    espaco: string;
  };
  casa: {
    nome: string;
    cargo: string;
    /** `+351919259820` — vai para o `tel:` e para o `wa.me`. */
    telefone: string;
    /** `+351 919 259 820` — o que se lê. */
    telefoneVisivel: string;
    email: string;
    /** `https://liquen-events.com` */
    site: string;
  };
  imagens: {
    /** `cid:…` do logótipo. */
    logo: string;
    /** `cid:…` do banner, ou `null` se o ficheiro faltar (o bloco não sai). */
    banner: string | null;
    redes: RedeDoEmail[];
  };
}

/**
 * Os textos. O português é o do HTML dela, à letra. O inglês é tradução e
 * segue a voz que o email inglês anterior já tinha («We've received your
 * request», «Message us on WhatsApp», «Warmly,»).
 */
const TEXTOS = {
  pt: {
    lang: "pt",
    assunto: "Recebemos o seu pedido.",
    titulo: "Recebemos o seu pedido.",
    preheader: "O seu pedido já está connosco.",
    eyebrow: "Pedido recebido",
    ola: (nome: string) => `Olá ${nome}. `,
    chegou: "O seu pedido já está connosco.",
    emBreve: "Em breve enviamos uma proposta.",
    whatsapp: "Falar por WhatsApp",
    responder: "Responder por email",
    oSeuPedido: "O seu pedido.",
    rotulos: {
      evento: "Evento",
      data: "Data",
      convidados: "Convidados",
      local: "Local",
      espaco: "Espaço",
    },
    aDefinir: "Ainda a definir",
    cerca: (n: number) => `Cerca de ${n}`,
    aSeguir: "A seguir.",
    passos: ["Analisamos o pedido.", "Enviamos a proposta.", "Conversamos."],
    maisAlgumaCoisa: "Mais alguma coisa?",
    respondaOuFale: "Responda a este email ou fale connosco.",
    abrirWhatsapp: "Abrir o WhatsApp",
    obrigado: "Obrigado por se lembrar de nós.",
    despedida: "Com carinho,",
    porque: (dominio: string) => `Recebeu este email porque enviou um pedido em ${dominio}.`,
  },
  en: {
    lang: "en",
    assunto: "We've received your request.",
    titulo: "We've received your request.",
    preheader: "Your request is already with us.",
    eyebrow: "Request received",
    ola: (nome: string) => `Hello ${nome}. `,
    chegou: "Your request is already with us.",
    emBreve: "We'll send you a proposal soon.",
    whatsapp: "Message us on WhatsApp",
    responder: "Reply by email",
    oSeuPedido: "Your request.",
    rotulos: {
      evento: "Event",
      data: "Date",
      convidados: "Guests",
      local: "Location",
      espaco: "Space",
    },
    aDefinir: "Still to be decided",
    cerca: (n: number) => `Around ${n}`,
    aSeguir: "What's next.",
    passos: ["We review your request.", "We send you the proposal.", "We talk it through."],
    maisAlgumaCoisa: "Anything else?",
    respondaOuFale: "Reply to this email or get in touch.",
    abrirWhatsapp: "Open WhatsApp",
    obrigado: "Thank you for thinking of us.",
    despedida: "Warmly,",
    porque: (dominio: string) =>
      `You're receiving this email because you sent a request at ${dominio}.`,
  },
} as const;

/**
 * Uma linha do cartão «O seu pedido.». A última não leva o filete de baixo —
 * é assim no desenho dela, e o filete fica sempre na linha que é a última de
 * facto, mesmo que alguma linha falte.
 */
function linhaDoPedido(rotulo: string, valor: string, ultima: boolean): string {
  if (ultima) {
    return `          <tr>
            <td class="t2" style="padding:14px 12px 14px 0;color:#6e6e73;">${esc(rotulo)}</td>
            <td class="t1" align="right" style="padding:14px 0;color:#1d1d1f;">${esc(valor)}</td>
          </tr>
`;
  }
  return `          <tr>
            <td class="t2 line" style="padding:14px 12px 14px 0;border-bottom:1px solid #d2d2d7;color:#6e6e73;">${esc(rotulo)}</td>
            <td class="t1 line" align="right" style="padding:14px 0;border-bottom:1px solid #d2d2d7;color:#1d1d1f;">${esc(valor)}</td>
          </tr>
`;
}

/** Os ícones das redes, com o espaço de 14 px entre eles e nenhum depois do último. */
function blocoDasRedes(redes: readonly RedeDoEmail[]): string {
  if (redes.length === 0) return "";
  const icones = redes
    .map(
      (r, i) =>
        `          <a href="${esc(r.url)}"><img src="cid:${esc(r.cid)}" width="18" height="18" alt="${esc(r.nome)}" style="display:inline-block;${
          i < redes.length - 1 ? "margin-right:14px;" : ""
        }font-size:11px;color:#6e6e73;"></a>
`,
    )
    .join("");
  return `        <p style="margin:12px 0 0;font-size:0;line-height:0;">
${icones}        </p>
`;
}

function blocoDoBanner(banner: string | null, site: string): string {
  if (!banner) return "";
  return `  <!-- 10. MANTIDO: banner Líquen -->
  <tr><td class="pad" style="padding:22px 56px 0;">
    <a href="${site}" style="text-decoration:none;display:block;">
      <img src="${esc(banner)}" width="528" alt="LÍQUEN EVENTS" style="display:block;width:100%;max-width:528px;height:auto;border-radius:18px;background:#4d6650;color:#ffffff;font-size:20px;line-height:150px;font-weight:600;letter-spacing:3px;text-align:center;">
    </a>
  </td></tr>

`;
}

export function emailPedidoRecebido(d: DadosDoPedidoRecebido): {
  subject: string;
  html: string;
  text: string;
} {
  const t = TEXTOS[d.locale];
  const dominio = d.casa.site.replace(/^https?:\/\//, "");
  const site = esc(d.casa.site);
  const email = esc(d.casa.email);
  const telefone = esc(d.casa.telefone);
  const telefoneVisivel = esc(d.casa.telefoneVisivel);
  const nomeDaCasa = esc(d.casa.nome);
  const logo = esc(d.imagens.logo);
  // O WhatsApp abre sem mensagem: decisão dela (nada de texto pré-escrito, e
  // portanto nenhuma referência a viajar por ele).
  const whatsapp = esc(`https://wa.me/${d.casa.telefone.replace(/\D/g, "")}`);

  const nome = d.nome.trim();
  const intro = `${nome ? esc(t.ola(nome)) : ""}${t.chegou}`;

  // ── O QUE ELA ESCOLHEU NO FORMULÁRIO, DITO COMO ELA O ESCOLHEU ─────────
  const dataLonga = d.pedido.data ? longDate(d.pedido.data, d.locale) : "";
  const valores = {
    evento: d.pedido.evento.trim(),
    data: dataLonga || t.aDefinir,
    convidados: d.pedido.convidados
      ? t.cerca(d.pedido.convidados)
      : (d.pedido.convidadosEstimativa ?? "").trim(),
    local: d.pedido.local.trim(),
    espaco: d.pedido.espaco.trim(),
  };
  // O formulário pede os cinco. Uma linha só fica de fora se, ainda assim,
  // chegar vazia — uma linha com o rótulo e nada à frente lê-se como avaria.
  const presentes = (["evento", "data", "convidados", "local", "espaco"] as const).filter(
    (k) => valores[k] !== "",
  );
  const linhas = presentes
    .map((k, i) => linhaDoPedido(t.rotulos[k], valores[k], i === presentes.length - 1))
    .join("");

  const linhaCargo = d.casa.cargo
    ? `        <p class="t2" style="margin:0;font-size:14px;line-height:20px;font-style:italic;color:#6e6e73;">${esc(d.casa.cargo)}</p>
`
    : "";
  const blocoRedes = blocoDasRedes(d.imagens.redes);
  const blocoBanner = blocoDoBanner(d.imagens.banner, site);

  const html = `<!DOCTYPE html>
<html lang="${t.lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${t.assunto}</title>
<!--[if mso]>
<style>table,td,div,p,a,h1,h2{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
<![endif]-->
<style>
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
</style>
</head>
<body class="sf" style="margin:0;padding:0;background:#f5f5f7;">

<!-- Pré-visualização na caixa de entrada -->
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f5f5f7;">${t.preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="canvas" style="background:#f5f5f7;">
<tr><td align="center" class="canvas" style="padding:40px 12px;">

<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card sf" style="max-width:640px;background:#ffffff;border-radius:18px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f;">

  <!-- 1. LOGÓTIPO -->
  <tr><td align="center" class="pad" style="padding:44px 56px 0;">
    <a href="${site}" style="text-decoration:none;">
      <img src="${logo}" width="104" alt="LÍQUEN EVENTS" class="t1" style="display:block;width:104px;height:auto;font-size:13px;line-height:18px;font-weight:600;letter-spacing:2px;color:#4d6650;">
    </a>
  </td></tr>

  <!-- 2. TÍTULO -->
  <tr><td align="center" class="pad" style="padding:48px 56px 0;">
    <p class="accent" style="margin:0 0 12px;font-size:17px;line-height:21px;font-weight:600;color:#4d6650;">${t.eyebrow}</p>
    <h1 class="h1 t1" style="margin:0;font-size:40px;line-height:44px;font-weight:600;letter-spacing:-0.3px;color:#1d1d1f;">${t.titulo}</h1>
  </td></tr>

  <!-- 3. INTRODUÇÃO -->
  <tr><td align="center" class="pad" style="padding:20px 56px 0;">
    <p class="intro t1" style="margin:0;font-size:21px;line-height:29px;font-weight:400;color:#1d1d1f;">${intro}</p>
    <p class="t2" style="margin:14px 0 0;font-size:17px;line-height:25px;color:#6e6e73;">${t.emBreve}</p>
  </td></tr>

  <!-- 4. AÇÕES: um botão em cápsula + uma ligação -->
  <tr><td align="center" class="pad" style="padding:30px 56px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
      <tr>
        <td class="cta-cell" align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${whatsapp}" style="height:46px;v-text-anchor:middle;width:210px;" arcsize="50%" stroke="f" fillcolor="#4d6650">
            <w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:17px;">${t.whatsapp}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${whatsapp}" class="btn" style="display:inline-block;background:#4d6650;color:#ffffff;text-decoration:none;font-size:17px;line-height:20px;font-weight:400;padding:13px 24px;border-radius:980px;">${t.whatsapp}</a>
          <!--<![endif]-->
        </td>
        <td class="cta-gap" width="24" style="width:24px;font-size:0;line-height:0;">&nbsp;</td>
        <td class="cta-cell" align="center">
          <a href="mailto:${email}" class="accent" style="color:#4d6650;text-decoration:none;font-size:17px;line-height:20px;white-space:nowrap;">${t.responder}&nbsp;›</a>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- 5. O SEU PEDIDO: cartão cinzento -->
  <tr><td class="pad" style="padding:56px 56px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box" style="background:#f5f5f7;border-radius:18px;">
      <tr><td class="box-pad" style="padding:28px 28px 6px;">
        <h2 class="h2 t1" style="margin:0;font-size:24px;line-height:28px;font-weight:600;letter-spacing:0.2px;color:#1d1d1f;">${t.oSeuPedido}</h2>
      </td></tr>
      <tr><td class="box-pad" style="padding:0 28px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:17px;line-height:22px;">
${linhas}        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- 6. A SEGUIR -->
  <tr><td class="pad" style="padding:56px 56px 0;">
    <h2 class="h2 t1" style="margin:0 0 10px;font-size:24px;line-height:28px;font-weight:600;letter-spacing:0.2px;color:#1d1d1f;">${t.aSeguir}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="48" valign="top" class="line" style="width:48px;padding:20px 0;border-bottom:1px solid #d2d2d7;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="step" align="center" width="32" height="32" style="width:32px;height:32px;border-radius:16px;background:#4d6650;color:#ffffff;font-size:15px;line-height:32px;font-weight:600;">1</td></tr></table>
        </td>
        <td valign="top" class="line" style="padding:20px 0;border-bottom:1px solid #d2d2d7;">
          <p class="t1" style="margin:0;font-size:19px;line-height:32px;font-weight:600;color:#1d1d1f;">${t.passos[0]}</p>
        </td>
      </tr>
      <tr>
        <td width="48" valign="top" class="line" style="width:48px;padding:20px 0;border-bottom:1px solid #d2d2d7;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="step" align="center" width="32" height="32" style="width:32px;height:32px;border-radius:16px;background:#4d6650;color:#ffffff;font-size:15px;line-height:32px;font-weight:600;">2</td></tr></table>
        </td>
        <td valign="top" class="line" style="padding:20px 0;border-bottom:1px solid #d2d2d7;">
          <p class="t1" style="margin:0;font-size:19px;line-height:32px;font-weight:600;color:#1d1d1f;">${t.passos[1]}</p>
        </td>
      </tr>
      <tr>
        <td width="48" valign="top" style="width:48px;padding:20px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="step" align="center" width="32" height="32" style="width:32px;height:32px;border-radius:16px;background:#4d6650;color:#ffffff;font-size:15px;line-height:32px;font-weight:600;">3</td></tr></table>
        </td>
        <td valign="top" style="padding:20px 0;">
          <p class="t1" style="margin:0;font-size:19px;line-height:32px;font-weight:600;color:#1d1d1f;">${t.passos[2]}</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- 7. MAIS ALGUMA COISA -->
  <tr><td class="pad" style="padding:20px 56px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box" style="background:#f5f5f7;border-radius:18px;">
      <tr><td class="box-pad" style="padding:24px 28px 26px;">
        <p class="t1" style="margin:0;font-size:19px;line-height:23px;font-weight:600;color:#1d1d1f;">${t.maisAlgumaCoisa}</p>
        <p class="t2" style="margin:6px 0 0;font-size:17px;line-height:25px;color:#6e6e73;">${t.respondaOuFale}</p>
        <p style="margin:12px 0 0;font-size:17px;line-height:22px;"><a href="${whatsapp}" class="accent" style="color:#4d6650;text-decoration:none;">${t.abrirWhatsapp}&nbsp;›</a></p>
      </td></tr>
    </table>
  </td></tr>

  <!-- 8. FECHO -->
  <tr><td class="pad" style="padding:56px 56px 0;">
    <p class="t1" style="margin:0;font-size:28px;line-height:32px;font-weight:600;letter-spacing:0.2px;color:#1d1d1f;">${t.obrigado}</p>
    <p class="t2" style="margin:16px 0 0;font-size:17px;line-height:25px;color:#6e6e73;">${t.despedida}</p>
  </td></tr>

  <!-- 9. MANTIDO DO EMAIL ATUAL: Catarina, contactos, redes -->
  <tr><td class="pad" style="padding:22px 56px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="line" style="border-top:1px solid #d2d2d7;padding-top:20px;">
        <p class="t1" style="margin:0;font-size:17px;line-height:22px;font-weight:600;color:#1d1d1f;">${nomeDaCasa}</p>
${linhaCargo}        <p class="t1" style="margin:12px 0 0;font-size:14px;line-height:22px;color:#1d1d1f;">
          <a href="tel:${telefone}" class="t1" style="color:#1d1d1f;text-decoration:none;">${telefoneVisivel}</a><br>
          <a href="mailto:${email}" class="accent" style="color:#4d6650;text-decoration:none;">${email}</a><br>
          <a href="${site}" class="accent" style="color:#4d6650;text-decoration:none;">${dominio}</a>
        </p>
${blocoRedes}      </td></tr>
    </table>
  </td></tr>

${blocoBanner}  <!-- 11. RODAPÉ LEGAL -->
  <tr><td class="pad" style="padding:32px 56px 44px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="line" style="border-top:1px solid #d2d2d7;padding-top:18px;">
        <p class="t2" style="margin:0;font-size:12px;line-height:16px;color:#6e6e73;">Líquen Events &nbsp;|&nbsp; Portugal &nbsp;|&nbsp; <a href="${site}" class="t2" style="color:#6e6e73;text-decoration:none;">${dominio}</a></p>
        <p class="t3" style="margin:8px 0 0;font-size:12px;line-height:16px;color:#86868b;">${t.porque(dominio)}</p>
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

  // Paralelo ao HTML — os filtros lêem esta parte, e duas alternativas muito
  // diferentes são, por si só, um sinal de spam.
  const text = [
    t.titulo,
    "",
    `${nome ? t.ola(nome) : ""}${t.chegou}`,
    t.emBreve,
    "",
    `${t.whatsapp}: https://wa.me/${d.casa.telefone.replace(/\D/g, "")}`,
    `${t.responder}: ${d.casa.email}`,
    "",
    t.oSeuPedido,
    ...presentes.map((k) => `${t.rotulos[k]}: ${valores[k]}`),
    "",
    t.aSeguir,
    ...t.passos.map((p, i) => `${i + 1}. ${p}`),
    "",
    t.maisAlgumaCoisa,
    t.respondaOuFale,
    "",
    t.obrigado,
    t.despedida,
    "",
    d.casa.nome,
    ...(d.casa.cargo ? [d.casa.cargo] : []),
    d.casa.telefoneVisivel,
    d.casa.email,
    dominio,
    ...d.imagens.redes.map((r) => `${r.nome}: ${r.url}`),
    "",
    `Líquen Events | Portugal | ${dominio}`,
    t.porque(dominio),
  ].join("\n");

  return { subject: t.assunto, html, text };
}
