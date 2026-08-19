# Guiões de medição do PDF de proposta

Não fazem parte da aplicação. Vieram do relatório `IDEIAS-PDF.md` e são os
mesmos: o que aqui está a mais são os RETRATOS — o par antes/depois de cada
página que este lote mudou, em `retratos/`.

    ln -s /home/user/liquen-events/node_modules node_modules   # se faltar
    npx vitest run --config medicao/vitest.medicao.config.ts   # gera os 16 PDFs
    python3 medicao/analisar.py      # páginas, imagens, DPI, fontes, metadados
    python3 medicao/rasterizar.py    # páginas → PNG em saida/png/
    python3 medicao/transbordos.py   # texto desenhado fora da mancha
    python3 medicao/transbordos.py medicao/saida/limites
    python3 medicao/mancha.py        # quanto de cada página é usado
    node   medicao/dupla-compressao.mjs  # custo da miniatura como origem

`medicao/saida/` e `medicao/antes/` não vão para o repositório: são dezasseis
PDFs de cada lado, nove megabytes, e o que interessa guardar são os retratos e
os números. Para refazer o «antes», gerar a partir do commit anterior ao lote e
copiar `medicao/saida/` para `medicao/antes/`.
