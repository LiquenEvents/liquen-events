#!/usr/bin/env python3
"""Quanto de cada página é usado: extensão vertical e horizontal do conteúdo."""
import pymupdf, os, sys, glob
M=68.0; W=841.89; H=595.28
SAIDA = sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(__file__), "saida")
for pdf in sorted(glob.glob(os.path.join(SAIDA,"*.pdf"))):
    nome=os.path.basename(pdf)[:-4]
    d=pymupdf.open(pdf); print("==",nome)
    for pno in range(d.page_count):
        page=d[pno]
        caixas=[]
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines",[]):
                for s in l["spans"]:
                    if s["text"].strip(): caixas.append(s["bbox"])
        for im in page.get_image_info(): caixas.append(im["bbox"])
        if not caixas: print(f"  p{pno+1:02d} VAZIA"); continue
        # ignora cabeçalho (y<110) e rodapé (y>520) para medir o CORPO
        corpo=[c for c in caixas if c[1]>110 and c[3]<525]
        if not corpo: print(f"  p{pno+1:02d} só moldura"); continue
        y0=min(c[1] for c in corpo); y1=max(c[3] for c in corpo)
        x1=max(c[2] for c in corpo)
        util=H-M-110  # altura do corpo disponível ~ 417pt
        print(f"  p{pno+1:02d} corpo y {y0:6.1f}→{y1:6.1f} ({y1-y0:5.1f}pt de {util:.0f}, {100*(y1-y0)/util:4.0f}%)  direita máx x={x1:6.1f} (mancha até {W-M:.0f})")
    d.close()
