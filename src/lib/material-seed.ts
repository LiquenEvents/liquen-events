import type { MaterialItem } from "./material-types";

/**
 * OS ESSENCIAIS DE CARRINHA, PRONTOS A SEMEAR.
 *
 * A lista que vai sempre, em todos os eventos. Está aqui em código, e não numa
 * migração de SQL, por uma razão prática: quem a semeia é o ecrã, uma vez, com
 * um botão — e semear a partir de dados que já existem no catálogo, em vez de
 * os inventar, é o que evita ficar com dois "Escadote" diferentes.
 *
 * Os `critical` são os que, faltando, mandam a equipa a uma loja a 200 km de
 * casa: sem escadote não se pendura nada, sem extensão não há luz, sem
 * ferramentas não se monta estrutura. O colete refletor é crítico por outra
 * razão: é o que faz descarregar em segurança na berma de uma estrada.
 */

export interface SementeLinha {
  /** O nome tal como vai ser procurado no catálogo (sem ligar a acentos). */
  nome: string;
  categoria: string;
  tipo: MaterialItem["kind"];
  unidade: string;
  qty: number;
  /** Escala com convidados: fração por pessoa. Ver `quantidadePara`. */
  qtyPerPax?: number;
  critical?: boolean;
}

export const ESSENCIAIS_CARRINHA: SementeLinha[] = [
  {
    nome: "Escadote 3 degraus",
    categoria: "Ferramentas",
    tipo: "reutilizavel",
    unidade: "unidade",
    qty: 1,
    critical: true,
  },
  {
    nome: "Extensão 20 m",
    categoria: "Iluminação",
    tipo: "reutilizavel",
    unidade: "unidade",
    qty: 2,
    critical: true,
  },
  {
    nome: "Ficha tripla",
    categoria: "Iluminação",
    tipo: "reutilizavel",
    unidade: "unidade",
    qty: 3,
  },
  {
    nome: "Caixa de ferramentas",
    categoria: "Ferramentas",
    tipo: "reutilizavel",
    unidade: "unidade",
    qty: 1,
    critical: true,
  },
  {
    nome: "Fita-cola americana",
    categoria: "Consumíveis",
    tipo: "consumivel",
    unidade: "rolo",
    qty: 2,
  },
  { nome: "X-ato", categoria: "Ferramentas", tipo: "reutilizavel", unidade: "unidade", qty: 2 },
  { nome: "Tesouras", categoria: "Ferramentas", tipo: "reutilizavel", unidade: "unidade", qty: 2 },
  { nome: "Abraçadeiras", categoria: "Consumíveis", tipo: "consumivel", unidade: "saco", qty: 1 },
  // Um saco por cada 50 pessoas, nunca menos de dois: mesmo um evento pequeno
  // produz lixo de montagem antes de haver convidados nenhuns.
  {
    nome: "Sacos do lixo 100 L",
    categoria: "Limpeza",
    tipo: "consumivel",
    unidade: "unidade",
    qty: 2,
    qtyPerPax: 1 / 50,
  },
  {
    nome: "Panos microfibra",
    categoria: "Limpeza",
    tipo: "reutilizavel",
    unidade: "unidade",
    qty: 6,
  },
  { nome: "Água 1,5 L", categoria: "Segurança", tipo: "consumivel", unidade: "unidade", qty: 6 },
  {
    nome: "Luvas de trabalho",
    categoria: "Segurança",
    tipo: "reutilizavel",
    unidade: "par",
    qty: 2,
  },
  {
    nome: "Primeiros socorros",
    categoria: "Segurança",
    tipo: "reutilizavel",
    unidade: "caixa",
    qty: 1,
    critical: true,
  },
  {
    nome: "Carregadores",
    categoria: "Escritório",
    tipo: "reutilizavel",
    unidade: "unidade",
    qty: 2,
  },
  {
    nome: "Colete refletor",
    categoria: "Segurança",
    tipo: "reutilizavel",
    unidade: "unidade",
    qty: 2,
    critical: true,
  },
];

export const NOME_LISTA_ESSENCIAIS = "Essenciais de carrinha";
