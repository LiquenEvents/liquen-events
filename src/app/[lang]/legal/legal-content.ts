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
          "Dados técnicos recolhidos automaticamente e de forma agregada para segurança e estatística: endereço IP (de forma efémera, para limitação de abusos) e informação básica do pedido. Utilizamos estatísticas de visita sem cookies e sem identificação individual.",
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
          "Poderemos divulgar dados quando exigido por lei ou por autoridade competente.",
        ],
      },
      {
        heading: "6. Transferências internacionais",
        body: [
          "Alguns prestadores podem tratar dados fora do Espaço Económico Europeu. Nesses casos, asseguramos garantias adequadas (por exemplo, cláusulas contratuais-tipo da Comissão Europeia) para proteger os seus dados.",
        ],
      },
      {
        heading: "7. Os seus direitos",
        body: [
          "Tem o direito de aceder, retificar, apagar, limitar e opor-se ao tratamento dos seus dados, bem como o direito à portabilidade e a retirar o consentimento a qualquer momento, sem afetar a licitude do tratamento anterior.",
          `Para exercer estes direitos, contacte-nos através de ${SITE.email}. Tem ainda o direito de apresentar reclamação junto da Comissão Nacional de Proteção de Dados (CNPD).`,
        ],
      },
      {
        heading: "8. Cookies e estatísticas",
        body: [
          "Este site não utiliza cookies de rastreamento publicitário. Caso estejam ativas, as estatísticas de visita são recolhidas de forma anónima e sem cookies, não permitindo identificá-lo individualmente.",
          "Os cookies estritamente necessários ao funcionamento (por exemplo, a memória do idioma escolhido) não requerem consentimento.",
        ],
      },
      {
        heading: "9. Alterações a esta política",
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
          "Envidamos os melhores esforços para manter a informação do site correta e atualizada, mas não garantimos a ausência de erros ou interrupções. Não nos responsabilizamos por danos decorrentes da utilização do site ou de sites de terceiros para os quais existam ligações.",
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
          "Technical data collected automatically and in aggregate for security and statistics: IP address (ephemerally, for abuse limiting) and basic request information. We use cookieless visit statistics with no individual identification.",
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
          "We may disclose data where required by law or by a competent authority.",
        ],
      },
      {
        heading: "6. International transfers",
        body: [
          "Some providers may process data outside the European Economic Area. In such cases we ensure appropriate safeguards (for example, the European Commission's standard contractual clauses) to protect your data.",
        ],
      },
      {
        heading: "7. Your rights",
        body: [
          "You have the right to access, rectify, erase, restrict and object to the processing of your data, as well as the right to data portability and to withdraw consent at any time, without affecting the lawfulness of prior processing.",
          `To exercise these rights, contact us at ${SITE.email}. You also have the right to lodge a complaint with the Portuguese Data Protection Authority (CNPD).`,
        ],
      },
      {
        heading: "8. Cookies and statistics",
        body: [
          "This site does not use advertising tracking cookies. Where enabled, visit statistics are collected anonymously and without cookies, and do not allow individual identification.",
          "Cookies strictly necessary for the site to work (for example, remembering your chosen language) do not require consent.",
        ],
      },
      {
        heading: "9. Changes to this policy",
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
          "We make our best efforts to keep the site's information correct and up to date, but we do not guarantee the absence of errors or interruptions. We are not liable for damages arising from use of the site or of third-party sites to which links exist.",
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
