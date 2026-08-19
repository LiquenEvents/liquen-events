#!/usr/bin/env python3
"""Analisa os PDFs gerados: páginas, imagens (px, DPI, peso), fontes, texto."""
import pymupdf as fitz, os, sys, json, glob

SAIDA = os.path.join(os.path.dirname(__file__), "saida")
out = {}
for pdf in sorted(glob.glob(os.path.join(SAIDA, "*.pdf"))):
    nome = os.path.basename(pdf)[:-4]
    d = fitz.open(pdf)
    info = {"paginas": d.page_count, "bytes": os.path.getsize(pdf),
            "linearizado": bool(d.is_fast_webaccess) if hasattr(d, "is_fast_webaccess") else None,
            "metadata": d.metadata, "toc": d.get_toc(), "imagens": [], "fontes": set()}
    vistos = {}
    for pno in range(d.page_count):
        page = d[pno]
        pr = page.rect
        for f in page.get_fonts(full=True):
            info["fontes"].add((f[3], f[2], f[1]))
        for im in page.get_image_info(hashes=False, xrefs=True):
            xref = im["xref"]
            bbox = im["bbox"]
            wpt = bbox[2]-bbox[0]; hpt = bbox[3]-bbox[1]
            px_w, px_h = im["width"], im["height"]
            dpi_x = px_w / (wpt/72) if wpt else 0
            dpi_y = px_h / (hpt/72) if hpt else 0
            try:
                raw = d.extract_image(xref)
                size = len(raw["image"]); ext = raw["ext"]; cs = raw.get("colorspace")
            except Exception:
                size, ext, cs = 0, "?", None
            info["imagens"].append({
                "pag": pno+1, "xref": xref, "px": [px_w, px_h],
                "pt": [round(wpt,1), round(hpt,1)],
                "dpi": [round(dpi_x), round(dpi_y)],
                "kb": round(size/1024,1), "fmt": ext,
                "aspecto_px": round(px_w/px_h, 3) if px_h else 0,
                "aspecto_caixa": round(wpt/hpt, 3) if hpt else 0,
            })
    info["fontes"] = sorted(str(x) for x in info["fontes"])
    info["pagina_pt"] = [round(d[0].rect.width,1), round(d[0].rect.height,1)]
    # peso por página (aproximado pelas imagens únicas nessa página)
    out[nome] = info
    d.close()
print(json.dumps(out, indent=1, ensure_ascii=False))
