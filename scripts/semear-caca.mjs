#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DADOS DE STRESS PARA A CAÇA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um back office com um pedido funciona sempre. Os defeitos vivem no que este
 * ficheiro cria: cinquenta pedidos, nomes de 300 caracteres, emojis, acentos,
 * campos nulos, datas no passado, valores absurdos, e um pedido com TUDO
 * preenchido ao máximo.
 *
 * Guarda uma cópia do que estava antes (`data/.antes-da-caca/`) para se poder
 * repor — os dados de desenvolvimento de alguém não se deitam fora por causa
 * de um teste.
 */
import { mkdirSync, writeFileSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";

const DATA = join(process.cwd(), "data");
const COPIA = join(DATA, ".antes-da-caca");

const LONGO = "Quinta da Boa Vista com jardim de buxo e oliveiras centenárias "
  .repeat(5)
  .slice(0, 300);
const EMOJI = "Ana 💍 & João 🌿 — casamento 🎉 no Alentejo ☀️";
const ACENTOS = "Coração de Ouro, Montemor-o-Novo — Ação & Emoção";
const ASPAS = "O «Casamento» do \"Século\" — 50% 'desconto'";

const LOCAIS = [
  "Évora",
  "Estremoz",
  "Palmela",
  "Sintra",
  "Ponte de Lima",
  "Funchal",
  "Ponta Delgada",
  "Faro",
  "Braga",
  "Coimbra",
  "",
  "Portugal",
];
const ESTADOS = ["pendente", "em_revisao", "cotado", "aceite", "rejeitado"];

const dia = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const instante = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};

function pedidos() {
  const out = [];

  // 1. O caso normal, para haver com que comparar.
  out.push({
    id: "LIQ-NORMAL-0001",
    name: "Maria e Pedro",
    email: "maria@exemplo.pt",
    phone: "+351 912 345 678",
    company: "",
    nif: "",
    guests: 120,
    date: dia(180),
    location: "Évora",
    notes: "Casamento ao ar livre, fim da tarde.",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    submittedAt: instante(-3),
    status: "pendente",
    lastUpdated: instante(-3),
    guestList: [],
  });

  // 2. Tudo no máximo: nome longo, notas longas, emojis, muitos convidados.
  out.push({
    id: "LIQ-EXTREMO-0002",
    name: LONGO,
    email: "extremo@exemplo.pt",
    phone: "+351 900 000 000",
    company: LONGO,
    nif: "999999999",
    guests: 5000,
    date: dia(400),
    location: LONGO,
    notes: LONGO + " " + EMOJI + " " + ASPAS,
    category: "particulares",
    eventType: "casamentos",
    eventName: EMOJI,
    submittedAt: instante(-40),
    status: "cotado",
    quotedPrice: 999999.99,
    lastUpdated: instante(-1),
    adminNotes: LONGO,
    guestList: [],
  });

  // 3. Emojis e acentos, dimensões normais.
  out.push({
    id: "LIQ-EMOJI-0003",
    name: EMOJI,
    email: "emoji@exemplo.pt",
    phone: "+351 911 111 111",
    guests: 80,
    date: dia(60),
    location: ACENTOS,
    notes: ACENTOS,
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    submittedAt: instante(-12),
    status: "em_revisao",
    lastUpdated: instante(-2),
    guestList: [],
  });

  // 4. Nulos e vazios por todo o lado — o pedido que chega por engano.
  out.push({
    id: "LIQ-VAZIO-0004",
    name: "",
    email: "",
    phone: "",
    guests: 0,
    date: "",
    location: "",
    notes: "",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: instante(-30),
    status: "pendente",
    lastUpdated: instante(-30),
    guestList: [],
  });

  // 5. Data no PASSADO com estado ainda aberto — o casamento já foi.
  out.push({
    id: "LIQ-PASSADO-0005",
    name: "Casamento Que Já Foi",
    email: "passado@exemplo.pt",
    guests: 100,
    date: dia(-90),
    location: "Sintra",
    notes: "Este evento já passou e o estado ficou por fechar.",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: instante(-200),
    status: "cotado",
    quotedPrice: 12000,
    lastUpdated: instante(-150),
    guestList: [],
  });

  // 6. Aspas e caracteres especiais — o que parte a pesquisa.
  out.push({
    id: "LIQ-ASPAS-0006",
    name: ASPAS,
    email: "aspas@exemplo.pt",
    guests: 60,
    date: dia(90),
    location: "Faro",
    notes: "<script>alert(1)</script> & <b>negrito</b>",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: instante(-6),
    status: "pendente",
    lastUpdated: instante(-6),
    guestList: [],
  });

  // 7. DOIS no mesmo dia e perto um do outro — o choque de datas.
  const diaChoque = dia(120);
  out.push({
    id: "LIQ-CHOQUE-A-0007",
    name: "Choque A",
    email: "a@exemplo.pt",
    guests: 150,
    date: diaChoque,
    location: "Évora",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: instante(-9),
    status: "cotado",
    quotedPrice: 15000,
    lastUpdated: instante(-9),
    guestList: [],
  });
  out.push({
    id: "LIQ-CHOQUE-B-0008",
    name: "Choque B",
    email: "b@exemplo.pt",
    guests: 90,
    date: diaChoque,
    location: "Estremoz",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: instante(-8),
    status: "pendente",
    lastUpdated: instante(-8),
    guestList: [],
  });

  // 8..60 — volume. É aqui que se vê o scroll, a paginação e a performance.
  for (let i = 9; i <= 60; i += 1) {
    const n = String(i).padStart(4, "0");
    out.push({
      id: `LIQ-VOLUME-${n}`,
      name: `Casal ${n} ${i % 7 === 0 ? "— com acentuação çãõ" : ""}`,
      email: `casal${n}@exemplo.pt`,
      phone: `+351 9${String(10000000 + i)}`,
      company: i % 5 === 0 ? `Planner ${(i % 3) + 1}` : "",
      guests: [20, 60, 120, 200, 350][i % 5],
      date: dia(((i * 13) % 500) - 60),
      location: LOCAIS[i % LOCAIS.length],
      notes: i % 4 === 0 ? LONGO.slice(0, 180) : "Pedido normal.",
      category: "particulares",
      eventType: "casamentos",
      eventName: "Casamento",
      submittedAt: instante(-((i * 3) % 90)),
      status: ESTADOS[i % ESTADOS.length],
      ...(i % 3 === 0 ? { quotedPrice: 3000 + i * 137 } : {}),
      lastUpdated: instante(-((i * 2) % 60)),
      guestList: [],
    });
  }

  return out;
}

/** Propostas: uma por pedido cotado/aceite, mais casos-limite. */
function propostas(qs) {
  const out = [];
  const doc = (over = {}) => ({
    ref: "PO-2026-001",
    template: "decoracao",
    clientNames: "Maria e Pedro",
    eventDate: "12 de setembro de 2026",
    location: "Évora",
    guests: "120 pax",
    serviceGroups: [
      { id: "g1", letter: "a)", title: "Decoração Cerimónia", items: [{ label: "Arco floral" }] },
    ],
    moodBoards: [],
    budgetItems: ["Decoração Cerimónia", "Arranjos de mesa"],
    budgetAmounts: [4000, 2500],
    totalLabel: "Valor Total Decoração",
    totalText: "6.500,00 € + IVA",
    totalAmount: 6500,
    totalVatMode: "acrescer",
    ...over,
  });

  let n = 0;
  for (const q of qs) {
    if (!["cotado", "aceite", "rejeitado"].includes(q.status)) continue;
    n += 1;
    if (n > 24) break;
    const bruto = (q.quotedPrice ?? 5000) * 1.23;
    out.push({
      id: `prop-${String(n).padStart(4, "0")}`,
      quoteId: q.id,
      clientName: q.name || "Sem nome",
      clientEmail: q.email || "",
      currency: "EUR",
      lineItems: [],
      vatRate: 0.23,
      subtotal: q.quotedPrice ?? 5000,
      vat: bruto - (q.quotedPrice ?? 5000),
      total: bruto,
      validUntil: dia(((n * 7) % 60) - 20),
      status: q.status === "aceite" ? "aceite" : q.status === "rejeitado" ? "rejeitada" : "enviada",
      createdAt: instante(-((n * 5) % 120)),
      sentAt: instante(-((n * 5) % 120)),
      ...(q.status === "rejeitado"
        ? {
            lostReason: ["preco", "data", "escolheram-outro", "sem-resposta", "outro"][n % 5],
            respondedAt: instante(-((n * 4) % 100)),
          }
        : {}),
      ...(q.status === "aceite" ? { respondedAt: instante(-((n * 4) % 100)) } : {}),
      doc: doc({
        clientNames: q.name || "Sem nome",
        location: q.location || "",
        guests: `${q.guests ?? 0} pax`,
        totalAmount: q.quotedPrice ?? 5000,
        // Uma em cada três leva extras assinalados, para o Bloco 4 ter matéria.
        ...(n % 3 === 0
          ? {
              budgetItems: ["Decoração Cerimónia", "Arranjos de mesa", "Arco floral"],
              budgetAmounts: [4000, 2500, 1200],
              budgetOpcional: [false, false, true],
            }
          : {}),
        // Uma em cada quatro leva fotos de biblioteca, para o Bloco 8.
        ...(n % 4 === 0
          ? { fotosDeBiblioteca: ["temas/t1/foto-1.jpg", "temas/t1/foto-2.jpg"] }
          : {}),
      }),
    });
  }
  return out;
}

function main() {
  mkdirSync(DATA, { recursive: true });
  if (!existsSync(COPIA)) {
    mkdirSync(COPIA, { recursive: true });
    for (const f of ["quotes.json", "proposals.json", "tasks.json", "app-state.json"]) {
      const p = join(DATA, f);
      if (existsSync(p)) cpSync(p, join(COPIA, f));
    }
    console.log("cópia de segurança em data/.antes-da-caca/");
  }

  const qs = pedidos();
  writeFileSync(join(DATA, "quotes.json"), JSON.stringify(qs, null, 2));
  const ps = propostas(qs);
  writeFileSync(join(DATA, "proposals.json"), JSON.stringify(ps, null, 2));

  console.log(`semeados ${qs.length} pedidos e ${ps.length} propostas`);
  console.log("  extremos:", qs.filter((q) => q.name.length > 100).length);
  console.log("  vazios:", qs.filter((q) => !q.name).length);
  console.log("  datas passadas:", qs.filter((q) => q.date && q.date < dia(0)).length);
}

main();

// Reposição: `node scripts/semear-caca.mjs --repor`
if (process.argv.includes("--repor")) {
  for (const f of ["quotes.json", "proposals.json", "tasks.json", "app-state.json"]) {
    const p = join(COPIA, f);
    if (existsSync(p)) cpSync(p, join(DATA, f));
  }
  console.log("reposto");
}
