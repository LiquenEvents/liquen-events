#!/usr/bin/env python3
"""Procura texto desenhado fora da mancha (ou por cima de fotografias)."""
import pymupdf, os, sys, glob
M = 68.0; W = 841.89; H = 595.28
SAIDA = sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(__file__), "saida")
for pdf in sorted(glob.glob(os.path.join(SAIDA, "*.pdf"))):
    nome = os.path.basename(pdf)[:-4]
    d = pymupdf.open(pdf)
    achados = []
    for pno in range(d.page_count):
        page = d[pno]
        fotos = [im["bbox"] for im in page.get_image_info()]
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    x0,y0,x1,y1 = s["bbox"]
                    txt = s["text"].strip()
                    if not txt: continue
                    prob = []
                    if x1 > W - M + 0.5: prob.append(f"passa a margem direita em {x1-(W-M):.1f}pt")
                    if x0 < M - 0.5: prob.append(f"passa a margem esquerda em {M-x0:.1f}pt")
                    if y1 > H - 30: prob.append("abaixo do rodapé")
                    for f in fotos:
                        if x0 < f[2] and x1 > f[0] and y0 < f[3] and y1 > f[1]:
                            prob.append("por cima de uma fotografia")
                            break
                    if prob:
                        achados.append((pno+1, txt[:70], round(x0,1), round(x1,1), "; ".join(prob)))
    if achados:
        print(f"== {nome}")
        for a in achados: print("  p%-2d x %6.1f→%6.1f  %-45s  %s" % (a[0], a[2], a[3], a[1], a[4]))
    else:
        print(f"== {nome}: sem transbordos")
    d.close()
