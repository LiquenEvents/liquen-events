import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/components/LocaleProvider";
import { pickChromeDict } from "@/lib/i18n";
import { pt } from "@/lib/i18n/pt";
import { FOTOGRAFIAS_DA_ENTRADA } from "@/data/fotografias-da-entrada";
import {
  EntradaComFotografia,
  RodapeDaEntrada,
  fotografiaDoDia,
  periodoDoDia,
} from "./EntradaComFotografia";

const DICT = pickChromeDict(pt);

function desenharNoServidor(no: ReactNode): string {
  return renderToStaticMarkup(
    <LocaleProvider locale="pt" dict={DICT}>
      {no}
    </LocaleProvider>,
  );
}

/** O componente sem cartão nenhum lá dentro: aqui mede-se a moldura. */
function molduraNoServidor(): string {
  return desenharNoServidor(<EntradaComFotografia>{null}</EntradaComFotografia>);
}

// ── Contraste (WCAG 2.x), a mesma conta de scripts/medir-entrada-admin.mjs ──
function canalLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminancia([r, g, b]: [number, number, number]): number {
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}
/** Uma cor com alfa composta sobre um fundo opaco. */
function compor(
  [r, g, b]: [number, number, number],
  alfa: number,
  fundo: [number, number, number],
): [number, number, number] {
  return [
    r * alfa + fundo[0] * (1 - alfa),
    g * alfa + fundo[1] * (1 - alfa),
    b * alfa + fundo[2] * (1 - alfa),
  ];
}
function contraste(a: number, b: number): number {
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}

describe("a saudação conforme a hora", () => {
  /**
   * As horas são dadas em UTC e lidas em Lisboa DE PROPÓSITO: é essa a
   * diferença que fazia a saudação divergir entre o servidor (UTC) e o browser
   * (fuso de quem abre). Agosto está em hora de Verão, ou seja Lisboa = UTC+1.
   */
  it("conta as horas em Lisboa e não no fuso da máquina", () => {
    expect(periodoDoDia(new Date("2026-08-12T06:00:00Z"))).toBe("bomDia"); // 07h em Lisboa
    expect(periodoDoDia(new Date("2026-08-12T10:59:00Z"))).toBe("bomDia"); // 11h59
    expect(periodoDoDia(new Date("2026-08-12T11:00:00Z"))).toBe("boaTarde"); // 12h00
    expect(periodoDoDia(new Date("2026-08-12T18:59:00Z"))).toBe("boaTarde"); // 19h59
    expect(periodoDoDia(new Date("2026-08-12T19:00:00Z"))).toBe("boaNoite"); // 20h00
    expect(periodoDoDia(new Date("2026-08-12T23:30:00Z"))).toBe("boaNoite"); // 00h30 do dia seguinte
  });

  it("em Janeiro, com Lisboa em UTC, as fronteiras andam a hora certa", () => {
    // Inverno: Lisboa = UTC. Se alguém trocasse o fuso por um desvio fixo, esta
    // é a linha que apanhava o erro.
    expect(periodoDoDia(new Date("2026-01-15T11:59:00Z"))).toBe("bomDia");
    expect(periodoDoDia(new Date("2026-01-15T12:00:00Z"))).toBe("boaTarde");
  });

  it("a madrugada é noite, e não manhã", () => {
    expect(periodoDoDia(new Date("2026-08-12T02:00:00Z"))).toBe("boaNoite"); // 03h em Lisboa
  });

  /**
   * ── O QUE IMPEDE O ERRO DE HIDRATAÇÃO ─────────────────────────────────────
   * O HTML do servidor sai SEM saudação (`getServerSnapshot` devolve `null`),
   * portanto a primeira renderização do cliente concorda com ele por
   * construção, seja qual for a hora de cada um. Se um dia alguém trocar isto
   * por um `new Date()` lido durante o desenho, este teste passa a falhar — e é
   * para isso que ele existe.
   */
  it("o HTML do servidor não traz saudação nenhuma", () => {
    const html = molduraNoServidor();
    for (const frase of [
      pt.common.entradaAdmin.bomDia,
      pt.common.entradaAdmin.boaTarde,
      pt.common.entradaAdmin.boaNoite,
    ]) {
      expect(html).not.toContain(frase);
    }
  });
});

describe("a rotação das fotografias", () => {
  it("é a mesma durante o dia inteiro", () => {
    const manha = fotografiaDoDia(new Date("2026-08-12T06:00:00Z"));
    const noite = fotografiaDoDia(new Date("2026-08-12T21:00:00Z"));
    expect(manha).toBe(noite);
  });

  it("muda de um dia para o outro", () => {
    const hoje = fotografiaDoDia(new Date("2026-08-12T09:00:00Z"));
    const amanha = fotografiaDoDia(new Date("2026-08-13T09:00:00Z"));
    expect(hoje).not.toBe(amanha);
  });

  it("percorre TODAS as fotografias da lista, sem saltar nenhuma", () => {
    const vistas = new Set<string>();
    for (let d = 0; d < FOTOGRAFIAS_DA_ENTRADA.length * 3; d++) {
      const dia = new Date(Date.UTC(2026, 7, 1 + d, 9, 0, 0));
      const foto = fotografiaDoDia(dia);
      if (foto) vistas.add(foto.ficheiro);
    }
    expect(vistas.size).toBe(FOTOGRAFIAS_DA_ENTRADA.length);
  });
});

describe("o painel da fotografia sai do HTML do servidor", () => {
  const html = molduraNoServidor();

  /**
   * O elemento de LCP na secretária é esta fotografia. Se ela dependesse do
   * JavaScript para existir, o preload scanner não a via e o LCP passava a
   * contar a hidratação inteira — que é exactamente o que a meta de 1,2 s não
   * comporta.
   */
  it("traz o <img> já no HTML, eager e com prioridade alta", () => {
    expect(html).toContain("<img");
    expect(html).toMatch(/fetchpriority="high"/i);
    expect(html).toContain('loading="eager"');
  });

  it("oferece AVIF antes de WebP, das derivadas já pré-geradas", () => {
    const avif = html.indexOf('type="image/avif"');
    const webp = html.indexOf('type="image/webp"');
    expect(avif).toBeGreaterThan(-1);
    expect(webp).toBeGreaterThan(avif);
    expect(html).toContain("/_img/g/");
    // Nunca o original de /imagens/: seriam ~380 KB de JPEG numa página de
    // entrada, que é o erro que este componente existe para não cometer.
    expect(html).not.toContain('src="/imagens/');
  });

  it("nasce com o desfocado inline, sem um pedido de rede", () => {
    expect(html).toContain("data:image/webp;base64,");
  });

  it("é decorativo para quem usa leitor de ecrã", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/<img[^>]*alt=""/);
  });
});

describe("o rodapé «Líquen Events · Portugal»", () => {
  it("deixou de ser branco sobre branco", () => {
    const html = renderToStaticMarkup(<RodapeDaEntrada />);
    expect(html).toContain("Líquen Events · Portugal");
    expect(html).not.toContain("text-white/25");
  });

  /**
   * A cor está escrita por extenso no componente; esta é a conta que a
   * justifica. Sobre os dois extremos do gradiente da coluna do formulário
   * (#ffffff no topo, #f4f5f3 em baixo) tem de passar os 4,5:1 do texto
   * corrido — o `text-white/25` que lá estava media 1,01:1, ou seja não se via.
   */
  it("passa os 4,5:1 sobre os dois extremos do gradiente do formulário", () => {
    const tinta: [number, number, number] = [13, 13, 13];
    const alfa = 0.64;
    for (const fundo of [
      [255, 255, 255],
      [244, 245, 243],
    ] as [number, number, number][]) {
      const racio = contraste(luminancia(compor(tinta, alfa, fundo)), luminancia(fundo));
      expect(racio, `contraste sobre rgb(${fundo.join(",")})`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
