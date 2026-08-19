#!/usr/bin/env python3
import pymupdf, os, sys, glob
SAIDA = os.path.join(os.path.dirname(__file__), "saida")
alvos = sys.argv[1:] or [os.path.basename(p)[:-4] for p in glob.glob(os.path.join(SAIDA,"*.pdf"))]
for nome in alvos:
    pdf = os.path.join(SAIDA, nome + ".pdf")
    d = pymupdf.open(pdf)
    outdir = os.path.join(SAIDA, "png", nome)
    os.makedirs(outdir, exist_ok=True)
    for i in range(d.page_count):
        pix = d[i].get_pixmap(dpi=110)
        pix.save(os.path.join(outdir, f"p{i+1:02d}.png"))
    print(nome, d.page_count, "páginas")
    d.close()
