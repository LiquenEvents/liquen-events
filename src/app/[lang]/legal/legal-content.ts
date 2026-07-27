import { SITE } from "@/lib/site";
import type { Locale } from "@/lib/i18n";

// Structured legal content (RGPD/GDPR privacy policy + terms) for both locales.
// Kept out of the main i18n dictionaries so those stay focused on UI copy.
//
// ⚠️ Conteúdo-base, redigido segundo o RGPD (Regulamento (UE) 2016/679) e a Lei
// n.º 58/2019. DEVE ser revisto por um advogado e completado com a identificação
// legal exata do responsável pelo tratamento (denominação, NIF, morada e sede)
// antes de considerado definitivo.

export interface LegalSection {
  heading: string;
  body: string[];
}
export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const UPDATED_PT = "Última atualização: julho de 2026";
const UPDATED_EN = "Last updated: July 2026";

function privacyPt(): LegalDoc {
  return {
    title: "Política de Privacidade",
    updated: UPDATED_PT,
    intro: `A ${SITE.legalName} respeita a sua privacidade e trata os seus dados pessoais de acordo com o Regulamento Geral sobre a Proteção de Dados (RGPD) e a legislação portuguesa aplicável. Esta política explica que dados recolhemos, para quê, com que fundamento e quais os seus direitos.`,
    sections: [
      {
        heading: "1. Responsável pelo tratamento",
        body: [
          `${SITE.legalName}, com contacto através de ${SITE.email} e ${SITE.phoneDisplay}, é a entidade responsável pelo tratamento dos dados pessoais recolhidos neste site.`,
          "Para qualquer questão relacionada com os seus dados pessoais ou com esta política, pode contactar-nos por e-mail.",
        ],
      },
      {
        heading: "2. Que dados recolhemos",
        body: [
          "Dados que nos fornece diretamente ao preencher o formulário de contacto ou de pedido de orçamento: nome, e-mail, telefone, tipo e data do evento, número de convidados, orçamento aproximado e a mensagem que nos enviar.",
          "Dados de aceitação de propostas e contratação: se aceitar uma proposta através da ligação que lhe enviamos, registamos o nome indicado por quem aceita, a data e hora e o endereço IP, como prova da aceitação dos Termos e Condições.",
          "Dados de faturação e pagamentos do seu evento (valores, faturas de sinal e de saldo e o estado dos pagamentos), acessíveis na sua área de cliente e conservados para cumprimento das obrigações fiscais.",
          "Origem da visita: se chegar ao site através de uma ligação com parâmetros de campanha (UTM) ou a partir de outro site, podemos registar essa proveniência, associada ao pedido, para percebermos como nos encontrou.",
          "Dados técnicos recolhidos automaticamente para segurança e estatística: endereço IP (de forma efémera, para limitação de abusos) e informação básica do pedido.",
          "Dados de análise e de publicidade (apenas com o seu consentimento): se aceitar os cookies no aviso apresentado, utilizamos o Google Analytics e o Google Ads. Estes serviços recolhem identificadores associados a cookies, informação do dispositivo e do navegador e as páginas e interações no site, para medirmos a audiência e a eficácia da nossa publicidade. Se recusar os cookies, estes dados não são recolhidos.",
          "Rascunho do formulário: para não perder o que escreve, o formulário de pedido de orçamento guarda temporariamente as suas respostas no armazenamento local do navegador (localStorage), apenas no seu dispositivo. Pode limpá-lo a qualquer momento nas definições do navegador; não é enviado enquanto não submeter o pedido.",
        ],
      },
      {
        heading: "3. Finalidades e fundamento legal",
        body: [
          "Responder a pedidos de contacto e elaborar orçamentos — com base no seu consentimento e nas diligências pré-contratuais que solicita (art. 6.º, n.º 1, al. a) e b) do RGPD).",
          "Gerir a relação com clientes e a prestação dos nossos serviços de organização de eventos — execução do contrato (al. b).",
          "Garantir a segurança do site e prevenir abusos — interesse legítimo (al. f).",
          "Cumprir obrigações legais, nomeadamente fiscais e contabilísticas — obrigação legal (al. c).",
        ],
      },
      {
        heading: "4. Prazos de conservação",
        body: [
          "Conservamos os dados de pedidos de contacto e orçamento apenas durante o tempo necessário para lhe responder e, caso avance, durante a relação contratual.",
          "Dados associados a faturação e obrigações fiscais são conservados pelos prazos legais aplicáveis. Findos os prazos, os dados são eliminados ou anonimizados.",
        ],
      },
      {
        heading: "5. Subcontratantes e partilha de dados",
        body: [
          "Não vendemos os seus dados. Podemos recorrer a prestadores de serviços que os tratam em nosso nome e sob instruções, com garantias de segurança adequadas: alojamento e infraestrutura do site, envio e receção de e-mail, e base de dados. Sempre que aplicável, celebramos contratos de subcontratação nos termos do art. 28.º do RGPD.",
          "Recorremos ainda ao Google (Google Ireland Limited) para estatísticas de utilização (Google Analytics) e para medição e otimização de publicidade (Google Ads) — mas apenas quando aceita os cookies respetivos no aviso de cookies. Se recusar, estes dados não são partilhados.",
          "Poderemos divulgar dados quando exigido por lei ou por autoridade competente.",
        ],
      },
      {
        heading: "6. Transferências internacionais",
        body: [
          "Alguns prestadores podem tratar dados fora do Espaço Económico Europeu. Nesses casos, asseguramos garantias adequadas (por exemplo, cláusulas contratuais-tipo da Comissão Europeia) para proteger os seus dados.",
          "Em concreto, se aceitar os cookies de análise e publicidade, o Google poderá tratar dados nos Estados Unidos, ao abrigo dessas garantias (cláusulas contratuais-tipo e/ou o EU-US Data Privacy Framework).",
        ],
      },
      {
        heading: "7. Segurança dos dados",
        body: [
          "Adotamos medidas técnicas e organizativas adequadas para proteger os seus dados contra o acesso não autorizado, a perda, a alteração ou a divulgação indevida — por exemplo, o acesso restrito à informação e a utilização de ligações encriptadas (HTTPS).",
          "Nenhum sistema é totalmente inviolável; caso ocorra uma violação de dados que implique risco elevado para os seus direitos, cumpriremos os deveres de comunicação previstos no RGPD.",
        ],
      },
      {
        heading: "8. Os seus direitos",
        body: [
          "Tem o direito de aceder, retificar, apagar, limitar e opor-se ao tratamento dos seus dados, bem como o direito à portabilidade e a retirar o consentimento a qualquer momento, sem afetar a licitude do tratamento anterior.",
          "Não tomamos decisões exclusivamente automatizadas, incluindo a definição de perfis, que produzam efeitos jurídicos na sua esfera ou que o afetem de forma significativa e similar.",
          `Para exercer estes direitos, contacte-nos através de ${SITE.email}. Tem ainda o direito de apresentar reclamação junto da Comissão Nacional de Proteção de Dados (CNPD).`,
        ],
      },
      {
        heading: "9. Direitos de imagem",
        body: [
          "Nos eventos que organizamos podem ser captadas fotografias e vídeos. Algumas destas imagens poderão ser publicadas no nosso portefólio — neste site e nas nossas redes sociais — para divulgar o nosso trabalho.",
          "A publicação de imagens em que seja identificável assenta no seu consentimento, recolhido de forma específica (por exemplo, no contrato de prestação de serviços ou em autorização própria). Pode não autorizar essa utilização, sem que isso afete a prestação dos nossos serviços.",
          `Pode, a qualquer momento, retirar o consentimento e pedir a remoção de imagens em que seja identificável, através de ${SITE.email}. Removê-las-emos, num prazo razoável, dos canais que controlamos — note-se que imagens eventualmente já partilhadas ou reproduzidas por terceiros podem não estar sob o nosso controlo.`,
        ],
      },
      {
        heading: "10. Cookies",
        body: [
          "Cookies estritamente necessários ao funcionamento (por exemplo, a memória do idioma escolhido e o registo da sua preferência de cookies) — não requerem consentimento.",
          "Cookies de análise e de publicidade (Google Analytics e Google Ads) — só são ativados se os aceitar no aviso de cookies apresentado na primeira visita. Servem para medir as visitas e a eficácia da nossa publicidade e podem implicar a partilha de dados com o Google (ver secções 5 e 6). Utilizamos o Modo de Consentimento da Google: enquanto não aceitar, não são colocados cookies de análise nem de publicidade.",
          "Pode recusar, ou alterar a sua escolha a qualquer momento, através da ligação «Gerir cookies» no rodapé do site. Recusar os cookies não essenciais não afeta o funcionamento do site.",
          "Principais cookies utilizados: «liquen-consent» (guarda a sua escolha de cookies, apenas no seu navegador); «_ga» e «_ga_*» (Google Analytics — distinguem visitantes e sessões, até 2 anos); «_gcl_au» (Google Ads — medição de conversões, cerca de 90 dias). Os cookies de análise e de publicidade só existem se os tiver aceitado.",
        ],
      },
      {
        heading: "11. Alterações a esta política",
        body: [
          "Podemos atualizar esta política para refletir alterações legais ou dos nossos serviços. A versão em vigor é sempre a publicada nesta página, com a respetiva data de atualização.",
        ],
      },
    ],
  };
}

function termsPt(): LegalDoc {
  return {
    title: "Termos e Condições",
    updated: UPDATED_PT,
    intro: `Estes termos regem a utilização do site da ${SITE.legalName}. Ao navegar e utilizar este site, aceita as condições descritas abaixo.`,
    sections: [
      {
        heading: "1. Objeto",
        body: [
          `Este site apresenta os serviços de organização e planeamento de eventos da ${SITE.legalName} e permite o envio de pedidos de contacto e de orçamento. O envio de um pedido não constitui, por si só, um contrato — a prestação de serviços é formalizada em documento próprio.`,
        ],
      },
      {
        heading: "2. Utilização do site",
        body: [
          "Compromete-se a utilizar o site de forma lícita, a fornecer informação verdadeira nos formulários e a não realizar ações que prejudiquem o funcionamento, a segurança ou a disponibilidade do serviço.",
        ],
      },
      {
        heading: "3. Propriedade intelectual",
        body: [
          `Os conteúdos deste site — textos, imagens, fotografias, marca e identidade visual — são propriedade da ${SITE.legalName} ou usados com autorização, e estão protegidos por direitos de autor. Não é permitida a sua reprodução sem autorização prévia e escrita.`,
        ],
      },
      {
        heading: "4. Orçamentos e propostas",
        body: [
          "Os valores indicados em propostas são válidos pelo período nelas mencionado e podem variar em função dos detalhes finais do evento. Uma proposta só se torna vinculativa após aceitação por ambas as partes.",
        ],
      },
      {
        heading: "5. Limitação de responsabilidade",
        body: [
          "Envidamos os melhores esforços para manter a informação do site correta, atualizada e disponível, mas não garantimos a ausência de erros ou imprecisões, nem que o site esteja permanentemente acessível ou livre de interrupções. O conteúdo do site tem caráter informativo e não dispensa a confirmação connosco.",
          "Na medida máxima permitida pela lei, não nos responsabilizamos por danos indiretos decorrentes da utilização ou da impossibilidade de utilização do site, nem pelo conteúdo de sites de terceiros para os quais existam ligações.",
          "Estes termos regem a utilização do site. As condições da prestação de serviços de eventos (âmbito, preços, pagamentos, prazos e responsabilidades) regem-se pelo contrato específico celebrado com o cliente, que prevalece em caso de divergência.",
        ],
      },
      {
        heading: "6. Lei aplicável e foro",
        body: [
          "Estes termos regem-se pela lei portuguesa. Para a resolução de qualquer litígio é competente o foro da comarca da sede da empresa, com renúncia a qualquer outro.",
        ],
      },
    ],
  };
}

function privacyEn(): LegalDoc {
  return {
    title: "Privacy Policy",
    updated: UPDATED_EN,
    intro: `${SITE.legalName} respects your privacy and processes your personal data in accordance with the General Data Protection Regulation (GDPR) and applicable Portuguese law. This policy explains what data we collect, why, on what basis, and what your rights are.`,
    sections: [
      {
        heading: "1. Data controller",
        body: [
          `${SITE.legalName}, reachable at ${SITE.email} and ${SITE.phoneDisplay}, is the controller of the personal data collected on this website.`,
          "For any question about your personal data or this policy, you can contact us by e-mail.",
        ],
      },
      {
        heading: "2. What data we collect",
        body: [
          "Data you provide directly when filling in the contact or quote-request form: name, e-mail, phone, event type and date, number of guests, approximate budget and the message you send us.",
          "Proposal-acceptance and contracting data: if you accept a proposal through the link we send you, we record the name given by whoever accepts, the date and time and the IP address, as proof of acceptance of the Terms and Conditions.",
          "Billing and payment data for your event (amounts, deposit and balance invoices and payment status), available in your client area and retained to meet tax obligations.",
          "Visit source: if you reach the site via a link carrying campaign parameters (UTM) or from another website, we may record that origin, linked to your request, to understand how you found us.",
          "Technical data collected automatically for security and statistics: IP address (ephemerally, for abuse limiting) and basic request information.",
          "Analytics and advertising data (only with your consent): if you accept cookies in the notice shown, we use Google Analytics and Google Ads. These services collect cookie-based identifiers, device and browser information and the pages and interactions on the site, so we can measure our audience and the effectiveness of our advertising. If you decline cookies, this data is not collected.",
          "Form draft: so you don't lose what you type, the quote-request form temporarily saves your answers in the browser's local storage (localStorage), on your device only. You can clear it at any time in your browser settings; nothing is sent until you submit the request.",
        ],
      },
      {
        heading: "3. Purposes and legal basis",
        body: [
          "Responding to contact requests and preparing quotes — based on your consent and the pre-contractual steps you request (Art. 6(1)(a) and (b) GDPR).",
          "Managing the client relationship and delivering our event-planning services — performance of a contract (b).",
          "Ensuring the security of the site and preventing abuse — legitimate interest (f).",
          "Complying with legal obligations, notably tax and accounting — legal obligation (c).",
        ],
      },
      {
        heading: "4. Retention periods",
        body: [
          "We keep contact and quote-request data only for as long as needed to respond and, if you proceed, for the duration of the contractual relationship.",
          "Data linked to invoicing and tax obligations is kept for the applicable legal periods. Once those periods lapse, data is deleted or anonymised.",
        ],
      },
      {
        heading: "5. Processors and data sharing",
        body: [
          "We do not sell your data. We may use service providers who process it on our behalf and under our instructions, with appropriate security safeguards: website hosting and infrastructure, sending and receiving e-mail, and database. Where applicable, we enter into processing agreements under Art. 28 GDPR.",
          "We also use Google (Google Ireland Limited) for usage statistics (Google Analytics) and for advertising measurement and optimisation (Google Ads) — but only when you accept the relevant cookies in the cookie notice. If you decline, this data is not shared.",
          "We may disclose data where required by law or by a competent authority.",
        ],
      },
      {
        heading: "6. International transfers",
        body: [
          "Some providers may process data outside the European Economic Area. In such cases we ensure appropriate safeguards (for example, the European Commission's standard contractual clauses) to protect your data.",
          "In particular, if you accept analytics and advertising cookies, Google may process data in the United States, under those safeguards (standard contractual clauses and/or the EU-US Data Privacy Framework).",
        ],
      },
      {
        heading: "7. Data security",
        body: [
          "We put in place appropriate technical and organisational measures to protect your data against unauthorised access, loss, alteration or improper disclosure — for example, restricted access to information and the use of encrypted connections (HTTPS).",
          "No system is entirely secure; should a data breach occur that is likely to result in a high risk to your rights, we will comply with the notification duties set out in the GDPR.",
        ],
      },
      {
        heading: "8. Your rights",
        body: [
          "You have the right to access, rectify, erase, restrict and object to the processing of your data, as well as the right to data portability and to withdraw consent at any time, without affecting the lawfulness of prior processing.",
          "We do not carry out solely automated decision-making, including profiling, that produces legal effects concerning you or similarly significantly affects you.",
          `To exercise these rights, contact us at ${SITE.email}. You also have the right to lodge a complaint with the Portuguese Data Protection Authority (CNPD).`,
        ],
      },
      {
        heading: "9. Image rights",
        body: [
          "At the events we organise, photographs and video may be taken. Some of these images may be published in our portfolio — on this website and on our social media — to showcase our work.",
          "Publishing images in which you are identifiable is based on your consent, obtained specifically (for example, in the service contract or in a separate authorisation). You may decline this use without it affecting the delivery of our services.",
          `You may, at any time, withdraw your consent and ask us to remove images in which you are identifiable, by contacting ${SITE.email}. We will remove them, within a reasonable period, from the channels we control — note that images already shared or reproduced by third parties may be outside our control.`,
        ],
      },
      {
        heading: "10. Cookies",
        body: [
          "Strictly necessary cookies for the site to work (for example, remembering your chosen language and recording your cookie preference) — these do not require consent.",
          "Analytics and advertising cookies (Google Analytics and Google Ads) — these are only activated if you accept them in the cookie notice shown on your first visit. They are used to measure visits and the effectiveness of our advertising and may involve sharing data with Google (see sections 5 and 6). We use Google Consent Mode: until you accept, no analytics or advertising cookies are set.",
          "You can decline, or change your choice at any time, via the “Manage cookies” link in the site footer. Declining non-essential cookies does not affect how the site works.",
          "Main cookies used: “liquen-consent” (stores your cookie choice, in your browser only); “_ga” and “_ga_*” (Google Analytics — distinguish visitors and sessions, up to 2 years); “_gcl_au” (Google Ads — conversion measurement, about 90 days). Analytics and advertising cookies only exist if you have accepted them.",
        ],
      },
      {
        heading: "11. Changes to this policy",
        body: [
          "We may update this policy to reflect legal or service changes. The version in force is always the one published on this page, with its update date.",
        ],
      },
    ],
  };
}

function termsEn(): LegalDoc {
  return {
    title: "Terms & Conditions",
    updated: UPDATED_EN,
    intro: `These terms govern the use of the ${SITE.legalName} website. By browsing and using this site, you accept the conditions described below.`,
    sections: [
      {
        heading: "1. Purpose",
        body: [
          `This site presents the event organisation and planning services of ${SITE.legalName} and allows contact and quote requests to be sent. Sending a request does not, in itself, constitute a contract — the provision of services is formalised in a separate document.`,
        ],
      },
      {
        heading: "2. Use of the site",
        body: [
          "You agree to use the site lawfully, to provide truthful information in the forms, and not to take actions that harm the operation, security or availability of the service.",
        ],
      },
      {
        heading: "3. Intellectual property",
        body: [
          `The contents of this site — text, images, photographs, brand and visual identity — are the property of ${SITE.legalName} or used with permission, and are protected by copyright. Reproduction without prior written authorisation is not permitted.`,
        ],
      },
      {
        heading: "4. Quotes and proposals",
        body: [
          "Amounts stated in proposals are valid for the period mentioned in them and may vary depending on the final event details. A proposal only becomes binding once accepted by both parties.",
        ],
      },
      {
        heading: "5. Limitation of liability",
        body: [
          "We make our best efforts to keep the site's information correct, up to date and available, but we do not guarantee the absence of errors or inaccuracies, nor that the site is permanently accessible or free of interruptions. The site's content is informational and does not replace confirmation with us.",
          "To the maximum extent permitted by law, we are not liable for indirect damages arising from the use of, or inability to use, the site, nor for the content of third-party sites to which links exist.",
          "These terms govern the use of the website. The conditions for the provision of event services (scope, prices, payments, deadlines and responsibilities) are governed by the specific contract entered into with the client, which prevails in the event of any conflict.",
        ],
      },
      {
        heading: "6. Governing law and jurisdiction",
        body: [
          "These terms are governed by Portuguese law. Any dispute shall be subject to the courts of the company's registered seat, with express waiver of any other.",
        ],
      },
    ],
  };
}

export function getLegal(locale: Locale): { privacy: LegalDoc; terms: LegalDoc } {
  return locale === "en"
    ? { privacy: privacyEn(), terms: termsEn() }
    : { privacy: privacyPt(), terms: termsPt() };
}
