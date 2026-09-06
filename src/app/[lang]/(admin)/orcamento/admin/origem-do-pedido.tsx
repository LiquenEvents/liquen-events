"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE ONDE VEIO O PEDIDO — o nome, a marca, e A CHAVE POR QUE SE CONTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── PORQUE É QUE ISTO NÃO É COSMÉTICA ─────────────────────────────────────
 *
 * O `referralSource` não é escrito por ninguém: é composto pelo
 * `LeadSourceCapture` no primeiro ecrã da visita, e o que lá fica é notação de
 * máquina — os `utm_*` sem o prefixo, o referenciador como `ref:<domínio>`, os
 * dois juntos por ` · `:
 *
 *     source=ig medium=social content=link_in_bio · ref:l.instagram.com
 *     source=ig medium=social content=link_in_bio
 *     ref:www.instagram.com
 *     ref:www.google.com
 *     Contacto direto
 *
 * As TRÊS PRIMEIRAS são o mesmo sítio — o Instagram. A diferença entre elas é
 * só o que o browser deu a conhecer nessa visita: uma trouxe referenciador,
 * outra não, a terceira veio sem campanha nenhuma. Como o `StatsDashboard`
 * agrupava pela cadeia CRUA, cada uma contava por si.
 *
 * Medido nos dados de trabalho semeados para isto (56 pedidos com etiqueta):
 *
 *     ANTES                                        DEPOIS
 *     …link_in_bio · ref:l.instagram.com   9       Instagram          18
 *     …link_in_bio                         6       Google             11
 *     ref:www.instagram.com                3       Contacto direto     6
 *     ref:www.google.com                   7       Facebook            5
 *     source=google medium=cpc…            4       Passa-a-palavra     5
 *
 * O Instagram estava a aparecer com 9 num quadro onde vale 18 — abaixo do
 * Google, quando na verdade está acima dele. Uma decisão de orçamento tomada
 * em cima daquela lista era uma decisão tomada ao contrário. E na «Conversão
 * por fonte» era pior do que menor: a MESMA origem dava duas taxas diferentes
 * na mesma lista (11% e 17%), e nenhuma delas era a taxa do Instagram.
 *
 * Por isso o agrupamento vive AQUI, num sítio só, e os dois quadros bebem da
 * mesma função ({@link agruparOrigens}). Se cada um normalizasse por sua
 * conta, o próximo defeito seria os dois discordarem — que é pior do que
 * estarem os dois errados, porque não há maneira de saber qual acreditar.
 *
 * ── AS REGRAS DE RECONHECIMENTO, E PORQUE SÃO ESTAS ───────────────────────
 *
 * A ordem é: primeiro o que a CAMPANHA declara (`source=`), depois o que o
 * BROWSER deu (`ref:`), e por fim o que uma PESSOA escreveu à mão.
 *
 *  1. `source=` ganha ao `ref:`. O `utm_source` é escrito por quem montou o
 *     anúncio (o `UTM-PLAN.md` diz quais são os valores permitidos); o
 *     referenciador é o que o browser calhou de mandar, e o Instagram manda
 *     `l.instagram.com` — um encurtador — só às vezes. Declarado vence
 *     observado.
 *
 *  2. Só se reconhecem valores de `source` INEQUÍVOCOS. `ig` e `fb` estão
 *     aqui porque o `UTM-PLAN.md` desta casa os fixa como os dois únicos
 *     valores permitidos. `wa`, `yt`, `li`, `tt` e `pin` NÃO estão: são
 *     abreviaturas que ninguém escreveu neste projecto e que podem ser outra
 *     coisa qualquer. Na dúvida, não se junta.
 *
 *  3. O domínio casa por igualdade ou por SUBDOMÍNIO (`x` ou `*.x`), nunca por
 *     «contém». `notgoogle.com` e `googleusercontent.com` não são a Google.
 *
 *  4. E há uma excepção que vale a pena escrever, porque é a que faria uma
 *     conta errada com ar de certa: `mail.google.com` NÃO é a Google. É o
 *     Gmail — alguém que clicou num link dentro de um email — e contá-lo como
 *     «vieram da pesquisa» inflaciona a única linha que a dona do produto usa
 *     para decidir se paga anúncios. Mesma razão para o Outlook. Vão os dois
 *     para «Email», que é o que são.
 *
 *  5. O passa-a-palavra é a única regra que olha para prosa, e olha para uma
 *     lista curta de raízes (`recomend`, `passa a palavra`, `boca a boca`).
 *     `indicaç…` ficou DE FORA de propósito: «Não indicado» contém-no, e uma
 *     regra que arrasta o «não indicado» para dentro do passa-a-palavra
 *     estragava as duas linhas de uma vez.
 *
 * ── E O QUE NÃO SE RECONHECE NÃO SE DEITA FORA ────────────────────────────
 *
 * Uma etiqueta desconhecida continua a contar e continua a aparecer — apenas
 * ARRUMADA. `source=parceiro medium=referral content=folheto-2026` é ilegível;
 * «Parceiro» é a mesma informação, legível, e a etiqueta crua continua à vista
 * na linha de detalhe. Esconder o que não se percebe seria perder pedidos da
 * conta em silêncio, que é exactamente o defeito que isto vem corrigir.
 *
 * ── E QUANDO SE JUNTA, VÊ-SE DO QUE É FEITO ───────────────────────────────
 *
 * Um número agregado sem maneira de o abrir é um número em que não se pode
 * confiar. Por isso cada linha que junta duas ou mais etiquetas mostra as
 * partes por baixo, com a contagem de cada uma ({@link detalheDaOrigem}) — À
 * VISTA, e não só no `title`. O `title` também lá está, mas só serve o rato, e
 * esta casa já apanhou esse erro uma vez (ver o `VBars` do `StatsDashboard`).
 */

/** As origens que esta casa sabe reconhecer. `outra` é «não reconhecida». */
export type ChaveDeMarca =
  | "instagram"
  | "facebook"
  | "google"
  | "whatsapp"
  | "pinterest"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "email"
  | "directo"
  | "passa-palavra"
  | "nao-indicado"
  | "outra";

/**
 * ── AS MARCAS SÃO SIMPLIFICADAS, E ISSO É A ESCOLHA, NÃO A CEDÊNCIA ───────
 *
 * Não há biblioteca de ícones (nenhuma dependência nova), portanto os
 * logótipos teriam de ser desenhados à mão. Um logótipo desenhado de memória
 * sai errado — e um logótipo errado é pior do que nenhum: é a marca de outra
 * pessoa, mal feita, num painel que ela mostra a clientes.
 *
 * Por isso não se replica nenhum. Duas famílias, e a fronteira entre elas é
 * uma pergunta só — «consigo reproduzir esta forma com primitivas, sem me
 * lembrar dela?»:
 *
 *   · **Formas geométricas** para as que SÃO primitivas: a câmara do
 *     Instagram (rectângulo arredondado + círculo + ponto), o rectângulo com
 *     triângulo do YouTube, o balão do WhatsApp, o envelope do email, o balão
 *     de conversa do passa-a-palavra, a pessoa do contacto directo. Nenhuma
 *     depende de uma curva que eu tenha de recordar.
 *   · **A inicial da marca**, na cor da marca, para as outras: o `f`, o `G`, o
 *     `P`, o `T`, o `in`. O `G` da Google é quadricolor e o `f` tem um recorte
 *     preciso; desenhá-los de cor sairia torto. Uma letra na cor certa
 *     identifica sem fingir que é o logótipo — é o que os painéis de análise
 *     fazem, e é honesto.
 *
 * A cor da marca entra como ACENTO — o glifo e um azulejo do mesmo tom a 10% —
 * e não como bloco de cor: o quadro continua a ser o da casa, e o que salta à
 * vista continua a ser a barra. Onde não há marca (contacto directo,
 * passa-a-palavra, não indicado, desconhecida), a cor é a tinta da casa.
 */
const MARCAS: Record<ChaveDeMarca, { nome: string; cor: string }> = {
  instagram: { nome: "Instagram", cor: "#C13584" },
  facebook: { nome: "Facebook", cor: "#1877F2" },
  google: { nome: "Google", cor: "#4285F4" },
  whatsapp: { nome: "WhatsApp", cor: "#1FA855" },
  pinterest: { nome: "Pinterest", cor: "#E60023" },
  tiktok: { nome: "TikTok", cor: "#1F1F22" },
  youtube: { nome: "YouTube", cor: "#CC0000" },
  linkedin: { nome: "LinkedIn", cor: "#0A66C2" },
  email: { nome: "Email", cor: "#7c854b" },
  directo: { nome: "Contacto direto", cor: "#7c854b" },
  "passa-palavra": { nome: "Passa-a-palavra", cor: "#7c854b" },
  "nao-indicado": { nome: "Não indicado", cor: "#8a8a82" },
  outra: { nome: "Outra origem", cor: "#8a8a82" },
};

/** O que a casa já escreve em português e não precisa de tradução nenhuma. */
const FRASES_DA_CASA: { padrao: RegExp; marca: ChaveDeMarca }[] = [
  { padrao: /^nao indicad[oa]$/, marca: "nao-indicado" },
  { padrao: /^contacto (direto|directo)$/, marca: "directo" },
  { padrao: /^cliente recorrente$/, marca: "directo" },
  // A lista do passa-a-palavra é curta de propósito — ver o cabeçalho, regra 5.
  { padrao: /\brecomend/, marca: "passa-palavra" },
  { padrao: /\bpassa[ -]?(a[ -])?palavra\b/, marca: "passa-palavra" },
  { padrao: /\bboca[ -]a[ -]boca\b/, marca: "passa-palavra" },
];

/** `utm_source` → marca. Só valores inequívocos (ver o cabeçalho, regra 2). */
const POR_SOURCE: Record<string, ChaveDeMarca> = {
  ig: "instagram",
  instagram: "instagram",
  fb: "facebook",
  facebook: "facebook",
  google: "google",
  googleads: "google",
  google_ads: "google",
  adwords: "google",
  whatsapp: "whatsapp",
  pinterest: "pinterest",
  tiktok: "tiktok",
  youtube: "youtube",
  linkedin: "linkedin",
  email: "email",
  newsletter: "email",
};

/**
 * Domínios que são EMAIL e não a plataforma que os aloja. Vai primeiro: sem
 * isto, `mail.google.com` casava com a regra da Google (ver a regra 4).
 */
const CAIXAS_DE_CORREIO = [
  "mail.google.com",
  "outlook.com",
  "outlook.live.com",
  "outlook.office.com",
  "outlook.office365.com",
  "mail.yahoo.com",
];

/** Domínio → marca. Igualdade ou subdomínio, nunca «contém». */
const POR_DOMINIO: { hosts: string[]; marca: ChaveDeMarca }[] = [
  { hosts: ["instagram.com", "instagr.am", "ig.me"], marca: "instagram" },
  { hosts: ["facebook.com", "fb.com", "fb.me", "fb.watch"], marca: "facebook" },
  { hosts: ["whatsapp.com", "wa.me"], marca: "whatsapp" },
  { hosts: ["pinterest.com", "pinterest.pt", "pinterest.co.uk", "pin.it"], marca: "pinterest" },
  { hosts: ["tiktok.com"], marca: "tiktok" },
  { hosts: ["youtube.com", "youtu.be"], marca: "youtube" },
  { hosts: ["linkedin.com", "lnkd.in"], marca: "linkedin" },
];

/** `x` ou `*.x`, e nada mais. `googleusercontent.com` não é `google.com`. */
function ehDominio(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

/** Qualquer `google.<tld>` — `google.pt`, `google.com`, `google.co.uk`. */
const GOOGLE = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/;

/** Sem acentos, minúsculas, espaços arrumados. Só para COMPARAR. */
function achatar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Etiqueta = {
  /** Os `utm_*` sem prefixo, como o `LeadSourceCapture` os grava. */
  utm: Record<string, string>;
  /** Os `ref:<host>`, em minúsculas e sem `www.`. */
  hosts: string[];
  /** O que sobra — o que uma pessoa escreveu à mão. */
  texto: string;
};

/** Parte a cadeia crua nas três coisas que lá podem estar. */
function lerEtiqueta(bruto: string): Etiqueta {
  const utm: Record<string, string> = {};
  const hosts: string[] = [];
  const sobra: string[] = [];

  for (const pedaco of bruto.split(/[·\s]+/)) {
    if (!pedaco) continue;
    const ref = /^ref:(.+)$/i.exec(pedaco);
    if (ref) {
      hosts.push(ref[1].toLowerCase().replace(/^www\./, ""));
      continue;
    }
    const par = /^(source|medium|campaign|term|content)=(.*)$/i.exec(pedaco);
    if (par) {
      utm[par[1].toLowerCase()] = par[2].toLowerCase();
      continue;
    }
    sobra.push(pedaco);
  }
  return { utm, hosts, texto: sobra.join(" ").trim() };
}

/** Do domínio para a marca, ou `null` se não for nenhuma que se conheça. */
function marcaDoHost(host: string): ChaveDeMarca | null {
  // Primeiro as caixas de correio: senão o Gmail passava por Google.
  if (CAIXAS_DE_CORREIO.some((c) => ehDominio(host, c))) return "email";
  for (const { hosts, marca } of POR_DOMINIO) {
    if (hosts.some((h) => ehDominio(host, h))) return marca;
  }
  if (GOOGLE.test(host)) return "google";
  return null;
}

/** `folheto-2026` → «Folheto 2026»; `parceiro` → «Parceiro». */
function arrumar(cru: string): string {
  const limpo = cru.replace(/[_-]+/g, " ").trim();
  return limpo ? limpo[0].toUpperCase() + limpo.slice(1) : limpo;
}

export type Origem = {
  /** A chave por que se AGRUPA. Duas etiquetas com a mesma chave são a mesma origem. */
  chave: string;
  /** O nome legível, o que se mostra. */
  nome: string;
  /** A marca a desenhar. `outra` quando não se reconheceu nada. */
  marca: ChaveDeMarca;
};

/**
 * A etiqueta crua → nome legível, marca e chave de agrupamento.
 *
 * Pura, e é de propósito: é o que permite ao teste medir as contagens sem
 * montar ecrã nenhum.
 */
export function reconhecerOrigem(bruto: string): Origem {
  const cru = (bruto ?? "").trim();
  if (!cru) return { chave: "marca:nao-indicado", nome: "Não indicado", marca: "nao-indicado" };

  const { utm, hosts, texto } = lerEtiqueta(cru);
  const temSinalDeMaquina = Object.keys(utm).length > 0 || hosts.length > 0;

  // ── 1. O que uma pessoa escreveu ────────────────────────────────────────
  if (!temSinalDeMaquina) {
    const chato = achatar(texto || cru);
    for (const { padrao, marca } of FRASES_DA_CASA) {
      if (padrao.test(chato)) return { chave: `marca:${marca}`, nome: MARCAS[marca].nome, marca };
    }
    // Não se reconheceu — mas continua a contar, com o que a pessoa escreveu.
    return { chave: `texto:${chato}`, nome: cru, marca: "outra" };
  }

  // ── 2. O que a campanha declara ─────────────────────────────────────────
  const source = utm.source ?? "";
  const porSource = POR_SOURCE[source];
  if (porSource) {
    return { chave: `marca:${porSource}`, nome: MARCAS[porSource].nome, marca: porSource };
  }
  // O `medium` não é uma marca — excepto quando o canal É o email.
  if (!source && (utm.medium === "email" || utm.medium === "newsletter")) {
    return { chave: "marca:email", nome: "Email", marca: "email" };
  }

  // ── 3. O que o browser deu ──────────────────────────────────────────────
  for (const host of hosts) {
    const porHost = marcaDoHost(host);
    if (porHost) return { chave: `marca:${porHost}`, nome: MARCAS[porHost].nome, marca: porHost };
  }

  // ── 4. Nada reconhecido: arruma-se, não se esconde ──────────────────────
  if (source) return { chave: `utm:${source}`, nome: arrumar(source), marca: "outra" };
  if (hosts.length) return { chave: `ref:${hosts[0]}`, nome: hosts[0], marca: "outra" };
  return { chave: `texto:${achatar(cru)}`, nome: cru, marca: "outra" };
}

/**
 * A parte de uma etiqueta que a DISTINGUE das outras da mesma origem.
 *
 * Serve a linha de detalhe: repetir `source=ig medium=social content=link_in_bio`
 * três vezes não explica nada — o que muda entre elas é o referenciador (ou a
 * falta dele), e é isso que se mostra.
 */
export function resumoDaEtiqueta(bruto: string): string {
  const cru = (bruto ?? "").trim();
  if (!cru) return "sem etiqueta";
  const { utm, hosts, texto } = lerEtiqueta(cru);
  if (hosts.length) return hosts.join(" + ");
  if (utm.content) return utm.content;
  if (utm.campaign) return utm.campaign;
  if (utm.medium) return utm.medium;
  if (utm.source) return utm.source;
  return texto || cru;
}

/** Uma etiqueta crua que caiu nesta linha, e quantos pedidos trouxe. */
export type ParteDaOrigem = { bruto: string; resumo: string; total: number };

/** Uma linha dos dois quadros. É a MESMA para os dois — ver o cabeçalho. */
export type LinhaDeOrigem = {
  chave: string;
  nome: string;
  marca: ChaveDeMarca;
  total: number;
  aceites: number;
  /** Percentagem inteira de leads que se tornaram evento ganho. */
  taxa: number;
  /** As etiquetas cruas que a compõem, da mais frequente para a menos. */
  partes: ParteDaOrigem[];
};

/**
 * Agrupa os pedidos por origem RECONHECIDA.
 *
 * Uma função só para os dois quadros: assim não há maneira de eles discordarem
 * um do outro, que era o defeito seguinte à espera de acontecer.
 */
export function agruparOrigens(pedidos: { origem: string; aceite: boolean }[]): LinhaDeOrigem[] {
  const porChave = new Map<
    string,
    {
      nome: string;
      marca: ChaveDeMarca;
      total: number;
      aceites: number;
      partes: Map<string, number>;
    }
  >();

  for (const { origem, aceite } of pedidos) {
    const { chave, nome, marca } = reconhecerOrigem(origem);
    let linha = porChave.get(chave);
    if (!linha) {
      linha = { nome, marca, total: 0, aceites: 0, partes: new Map() };
      porChave.set(chave, linha);
    }
    linha.total += 1;
    if (aceite) linha.aceites += 1;
    const bruto = (origem ?? "").trim();
    linha.partes.set(bruto, (linha.partes.get(bruto) ?? 0) + 1);
  }

  return (
    [...porChave.entries()]
      .map(([chave, l]) => ({
        chave,
        nome: l.nome,
        marca: l.marca,
        total: l.total,
        aceites: l.aceites,
        taxa: l.total > 0 ? Math.round((l.aceites / l.total) * 100) : 0,
        partes: [...l.partes.entries()]
          .map(([bruto, total]) => ({ bruto, resumo: resumoDaEtiqueta(bruto), total }))
          .sort((a, b) => b.total - a.total || a.resumo.localeCompare(b.resumo, "pt")),
      }))
      // Empate desempatado pelo nome, para a ordem não dançar entre períodos.
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt"))
  );
}

/**
 * A linha de detalhe — só quando a linha JUNTA duas ou mais etiquetas.
 *
 * Uma linha que não juntou nada não tem nada a explicar, e escrever o óbvio
 * por baixo de todas as barras era ruído.
 */
export function detalheDaOrigem(linha: LinhaDeOrigem): string | null {
  if (linha.partes.length < 2) return null;
  return linha.partes.map((p) => `${p.resumo} ×${p.total}`).join(" · ");
}

/** O `title` completo — o rato tem direito à conta toda, em linhas. */
export function tituloDaOrigem(linha: LinhaDeOrigem): string {
  const cabeca = `${linha.nome}: ${linha.total} ${linha.total === 1 ? "pedido" : "pedidos"}`;
  if (linha.partes.length < 2) return cabeca;
  return [cabeca, ...linha.partes.map((p) => `· ${p.bruto || "(sem etiqueta)"} — ${p.total}`)].join(
    "\n",
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O MOVIMENTO — a marca chega DE ONDE A BARRA COMEÇA, e no tempo da barra
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O gesto ───────────────────────────────────────────────────────────────
 *
 * A barra cresce da esquerda (`origin-left`, `scaleX`). A marca está à
 * esquerda do rótulo, ou seja: NA ORIGEM DA BARRA. Por isso o movimento é ela
 * a percorrer seis píxeis a partir daí e a assentar, com a opacidade a
 * acompanhar. Diz «esta barra vem daqui, e é isto que ela é» — direcção e
 * origem, que é o que a casa pede ao movimento. Não pisca, não salta, não
 * cresce: uma marca que crescesse estaria a codificar o valor uma segunda vez,
 * e nesta casa os números não pulsam.
 *
 * ── O tempo: 250 ms, e são os da barra ────────────────────────────────────
 *
 * `PROGRESSO_MS` — o degrau `elemento` da casa, o mesmo que o `PROGRESSO` do
 * `ui/movimento.ts` dá às barras. Não se soma um segundo tempo por cima de um
 * que já existe: quando as barras andam, a marca anda com elas, e o quadro
 * inteiro tem UM tempo.
 *
 * `transition-[translate,opacity]` e não `transform`: no Tailwind v4 a classe
 * `-translate-x-1.5` emite a propriedade AUTÓNOMA `translate`, e um
 * `transition-transform` não lhe toca — é a armadilha que já deixou o toque do
 * `Button` meses sem transição, e está contada no `ui/movimento.ts`.
 *
 * ── E porquê SEM escada por linha ─────────────────────────────────────────
 *
 * A tentação era escalonar as marcas, uma a uma. Não se faz, e a regra da casa
 * é explícita (`ui/gaveta.ts`): «a escada é POR BLOCO e nunca por linha — uma
 * cascata que anima os filhos de um bloco não é uma cascata, é um tremor». O
 * caso aqui é ainda mais claro do que o que gerou a regra: as «Repartições»
 * são QUATRO listas lado a lado, ou seja até vinte e quatro linhas no mesmo
 * bloco. Com o tecto de cinco degraus (`--bo-degraus-max`), da sexta linha em
 * diante todas partiriam ao mesmo tempo — uma escada que só escalona o
 * princípio e desiste a meio lê-se como avaria, não como ordem de leitura.
 * Todas as marcas de um quadro partem juntas: são a MESMA coisa a acontecer
 * («estas são as origens»), e uma coisa só tem um arranque só.
 *
 * ── E O GATILHO É O GESTO, NUNCA A MONTAGEM ───────────────────────────────
 *
 * A regra dos sete `<details>` desta casa: «só anima o que ELA abriu, com o
 * gesto, agora». Uma entrada à montagem batia de frente com a `.bo-cena` da
 * vista (que já apresenta este painel inteiro) e voltava a correr sempre que o
 * React remontasse — a mesma avaria intermitente que a `ui/gaveta.ts` conta.
 *
 * Daí o {@link GestoQueApresenta}: a `Section` arma-o quando o gesto abre a
 * gaveta, e desarma-o no resto do tempo. E o estado DESARMADO é a marca
 * VISÍVEL e sem transição nenhuma — sem JavaScript, com movimento reduzido, ou
 * numa gaveta reaberta pelo «localizar na página», a marca está lá, quieta.
 * Uma animação que possa esconder conteúdo para sempre é pior do que animação
 * nenhuma.
 */
export const MARCA_A_CHEGAR =
  "motion-safe:transition-[translate,opacity] motion-safe:duration-[250ms] motion-safe:ease-out";

/** Antes de partir: seis píxeis atrás, na origem da barra. */
export const MARCA_NA_ORIGEM = "opacity-0 -translate-x-1.5";

/** Depois: no sítio. */
export const MARCA_ASSENTE = "opacity-100 translate-x-0";

export type GestoQueApresenta = {
  /** Houve um gesto e a marca deve viajar. */
  animar: boolean;
  /** Já se pode largar — o fotograma de partida foi pintado. */
  assente: boolean;
};

const CONTEXTO = createContext<GestoQueApresenta>({ animar: false, assente: true });

/**
 * O estado que a `Section` calcula a partir do seu `useGaveta().aAbrir`.
 *
 * ── PORQUE É QUE O DESARME É DURANTE A RENDERIZAÇÃO ───────────────────────
 *
 * O fotograma de PARTIDA (a marca seis píxeis atrás e transparente) tem de
 * existir ANTES de o browser pintar a gaveta aberta. Feito num efeito, chegava
 * tarde: a marca já tinha sido pintada no sítio final, e uma transição que
 * começa no sítio final não é transição nenhuma — não há de onde interpolar, e
 * a marca salta. Por isso o ajuste é DURANTE a renderização, que é o padrão
 * que o React documenta para «estado derivado de uma prop que mudou» — e é
 * também o que evita a cascata de um `setState` síncrono dentro do efeito.
 *
 * Movimento reduzido nem chega a armar: sem essa guarda a marca ficava um par
 * de fotogramas invisível SEM transição a justificá-lo — um piscar, que é o
 * contrário do que quem pediu menos movimento pediu. A leitura só acontece na
 * TRANSIÇÃO de `aAbrir`, ou seja nunca no servidor nem na primeira
 * renderização: não há hidratação a divergir.
 *
 * E são DOIS `requestAnimationFrame` para largar, e não um: um só ainda cai no
 * mesmo fotograma em que a classe de partida entrou, e o browser agrega as
 * duas mudanças numa só.
 */
export function useGestoQueApresenta(aAbrir: boolean): GestoQueApresenta {
  const [anterior, setAnterior] = useState(aAbrir);
  const [assente, setAssente] = useState(true);

  if (anterior !== aAbrir) {
    setAnterior(aAbrir);
    setAssente(!aAbrir || prefersReducedMotion());
  }

  useEffect(() => {
    if (assente) return;
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setAssente(true));
    });
    return () => {
      cancelAnimationFrame(primeiro);
      cancelAnimationFrame(segundo);
    };
  }, [assente]);

  return { animar: aAbrir, assente };
}

export function OrigensQueChegam({
  gesto,
  children,
}: {
  gesto: GestoQueApresenta;
  children: ReactNode;
}) {
  return <CONTEXTO.Provider value={gesto}>{children}</CONTEXTO.Provider>;
}

/**
 * A MARCA DA ORIGEM — dezasseis píxeis, decorativa, e nunca sozinha.
 *
 * `aria-hidden` porque o nome está escrito ao lado em texto: anunciar «imagem,
 * Instagram» antes de «Instagram» é dizer duas vezes a mesma coisa a quem ouve
 * o ecrã.
 */
export function MarcaDaOrigem({ marca, nome }: { marca: ChaveDeMarca; nome: string }) {
  const { animar, assente } = useContext(CONTEXTO);
  const { cor } = MARCAS[marca];
  const movimento = animar ? `${MARCA_A_CHEGAR} ${assente ? MARCA_ASSENTE : MARCA_NA_ORIGEM}` : "";

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${movimento}`}
      style={{ color: cor }}
    >
      <rect x="0" y="0" width="16" height="16" rx="4.5" fill="currentColor" opacity="0.1" />
      {glifo(marca, nome)}
    </svg>
  );
}

/** Uma inicial na cor da marca — a saída honesta para as formas que não se replicam. */
function letra(texto: string, tamanho = 9) {
  return (
    <text
      x="8"
      y="8.4"
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={tamanho}
      fontWeight={700}
      fill="currentColor"
      fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    >
      {texto}
    </text>
  );
}

function glifo(marca: ChaveDeMarca, nome: string) {
  switch (marca) {
    // A câmara: rectângulo arredondado, círculo, ponto. Três primitivas.
    case "instagram":
      return (
        <>
          <rect
            x="4.2"
            y="4.2"
            width="7.6"
            height="7.6"
            rx="2.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <circle cx="8" cy="8" r="1.85" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="10.6" cy="5.4" r="0.62" fill="currentColor" />
        </>
      );
    // Rectângulo + triângulo. Também primitivas.
    case "youtube":
      return (
        <>
          <rect x="3.2" y="4.9" width="9.6" height="6.2" rx="2" fill="currentColor" />
          <path d="M6.9 6.9 10.1 8 6.9 9.1Z" fill="#fff" />
        </>
      );
    // O balão com a bicheira em baixo à esquerda.
    case "whatsapp":
      return (
        <path
          d="M8 3.7a4.3 4.3 0 0 0-3.66 6.56L3.7 12.3l2.1-.62A4.3 4.3 0 1 0 8 3.7Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      );
    case "email":
      return (
        <>
          <rect
            x="3.4"
            y="5"
            width="9.2"
            height="6"
            rx="1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="m4.1 6.1 3.9 2.8 3.9-2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    // Uma pessoa — não é marca de ninguém, é o que «contacto directo» é.
    case "directo":
      return (
        <>
          <circle cx="8" cy="6.3" r="1.85" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M4.7 12.1a3.3 3.3 0 0 1 6.6 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      );
    // Um balão de conversa com três pontos — alguém falou de nós a alguém.
    case "passa-palavra":
      return (
        <>
          <path
            d="M3.4 5.6a1.7 1.7 0 0 1 1.7-1.7h5.8a1.7 1.7 0 0 1 1.7 1.7v2.6a1.7 1.7 0 0 1-1.7 1.7H7.5l-2.6 1.8v-1.8a1.7 1.7 0 0 1-1.5-1.7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          <circle cx="6.1" cy="6.9" r="0.6" fill="currentColor" />
          <circle cx="8" cy="6.9" r="0.6" fill="currentColor" />
          <circle cx="9.9" cy="6.9" r="0.6" fill="currentColor" />
        </>
      );
    // Um anel interrompido: sabemos que houve alguém, não sabemos por onde veio.
    case "nao-indicado":
      return (
        <circle
          cx="8"
          cy="8"
          r="3.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="2 2"
        />
      );
    case "facebook":
      return letra("f");
    case "google":
      return letra("G", 8.5);
    case "pinterest":
      return letra("P", 8.5);
    case "tiktok":
      return letra("T", 8.5);
    case "linkedin":
      return letra("in", 7);
    // Uma origem que não se reconheceu leva a INICIAL do que lá está escrito.
    // Continua a ser uma linha com cara, e não um buraco.
    default:
      return letra((nome.trim()[0] ?? "?").toUpperCase(), 8.5);
  }
}
