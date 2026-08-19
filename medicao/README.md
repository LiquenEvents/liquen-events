# Guiões de medição do PDF de proposta

Não fazem parte da aplicação. Servem o relatório `IDEIAS-PDF.md`.

    ln -s ../../../../../home/user/liquen-events/node_modules node_modules   # se faltar
    npx vitest run --config medicao/vitest.medicao.config.ts   # gera os PDFs
    python3 medicao/analisar.py      # páginas, imagens, DPI, fontes, metadados
    python3 medicao/rasterizar.py    # páginas → PNG em saida/png/
    python3 medicao/transbordos.py   # texto desenhado fora da mancha
    python3 medicao/mancha.py        # quanto de cada página é usado
    node   medicao/dupla-compressao.mjs  # custo da miniatura como origem

`medicao/saida/` não vai para o repositório (PDFs e PNG pesados).
