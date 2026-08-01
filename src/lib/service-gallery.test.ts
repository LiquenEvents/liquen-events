import { describe, it, expect } from "vitest";
import { pickServiceGallery, SERVICE_GALLERY_SIZE } from "./service-gallery";
import { PHOTOS } from "@/app/[lang]/(site)/galeria/photos-data";
import { SERVICES } from "./services-data";

const srcOf = (labels: string[]) =>
  new Set(PHOTOS.filter((p) => labels.includes(p.label)).map((p) => p.src));

describe("pickServiceGallery", () => {
  it("dá seis fotos, sem repetir nenhuma", () => {
    const g = pickServiceGallery("casamentos")!;
    expect(g).toHaveLength(SERVICE_GALLERY_SIZE);
    expect(new Set(g).size).toBe(SERVICE_GALLERY_SIZE);
  });

  it("só tira fotos do conjunto do serviço", () => {
    const casamentos = srcOf(["Casamento"]);
    for (const src of pickServiceGallery("casamentos")!) expect(casamentos.has(src)).toBe(true);

    const corporativo = srcOf(["Corporativo", "Conferência"]);
    for (const src of pickServiceGallery("eventos-corporativos")!) {
      expect(corporativo.has(src)).toBe(true);
    }
  });

  it("varia entre visitas", () => {
    // O ponto todo da alteração. Com 333 fotografias, vinte sorteios seguidos
    // darem exatamente o mesmo conjunto seria um sorteio partido, não azar.
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(pickServiceGallery("casamentos")!.join("|"));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("cobre todo o conjunto ao longo do tempo, não só o início da lista", () => {
    // Um Fisher-Yates parcial mal escrito tende a devolver sempre as primeiras
    // posições; isto obriga o sorteio a alcançar o fim da lista.
    const pool = [...srcOf(["Casamento"])];
    const tail = new Set(pool.slice(Math.floor(pool.length / 2)));
    const hits = new Set<string>();
    for (let i = 0; i < 60; i++) {
      for (const src of pickServiceGallery("casamentos")!) if (tail.has(src)) hits.add(src);
    }
    expect(hits.size).toBeGreaterThan(20);
  });

  it("recusa-se a servir um serviço sem conjunto próprio", () => {
    // As viaturas clássicas não têm etiqueta na galeria: preferimos devolver
    // `null` (e a página fica com a lista escolhida à mão) a encher a secção
    // de fotos de casamento sem um único carro.
    expect(pickServiceGallery("aluguer-de-viaturas-classicas")).toBeNull();
    expect(pickServiceGallery("servico-que-nao-existe")).toBeNull();
  });

  it("todo o serviço acaba com seis fotos, por sorteio ou pela lista à mão", () => {
    for (const svc of SERVICES) {
      const g = pickServiceGallery(svc.slug) ?? svc.gallery;
      expect(g.length, `${svc.slug} ficou com ${g.length}`).toBe(SERVICE_GALLERY_SIZE);
    }
  });
});
