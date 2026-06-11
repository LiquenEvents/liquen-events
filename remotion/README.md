# Líquen Events — Filme do site (Remotion)

Filme promocional cinematográfico do site, em **duas versões**:

| Composição | Formato | Uso | Mockup |
|---|---|---|---|
| `Walkthrough` | 1920×1080 (16:9) | YouTube, site, apresentações | Browser flutuante |
| `WalkthroughVertical` | 1080×1920 (9:16) | Reels, TikTok, Stories | iPhone com dynamic island |

## Estrutura do filme (~70s)

1. **Intro (4.5s)** — cortina de cinema abre; raios de luz rotativos; logo resolve de blur com shimmer; partículas douradas
2. **Início (12s)** — scroll secção-a-secção no mockup, ghost word "Líquen"
3. **Footage (6s)** — clip real; entra com wipe de linha dourada, letterbox, grade de cor
4. **Sobre Nós (11s)** — ghost word "História"
5. **Serviços (12s)** — ghost word "Serviços"
6. **Footage (6s)** — team building
7. **Galeria (10s)** — ghost word "Momentos"
8. **Pedir Orçamento (7s)** — cursor animado clica no CTA com ripple dourado
9. **Outro (6s)** — headline, logo, botão "Pedir Orçamento" com shine, domínio + Instagram

Acabamento global: transições cross-zoom, tilt 3D nos mockups, grão de filme,
vinheta, grade de contraste/saturação, Playfair Display + Inter reais.

Tudo configurável em `src/constants.ts` (`SCENES`, durações, offsets do footage,
posição do cursor).

## Workflow

```bash
# 1. Site a correr na porta 3001 (noutra consola, na raiz do repo)
$env:PORT = "3001"; npm run dev

# 2. Capturar screenshots (desktop + mobile)
cd remotion
npm run capture

# 3. Pré-visualizar / afinar
npm run studio

# 4. Renderizar
npm run render            # → out/walkthrough.mp4 (16:9)
npm run render:vertical   # → out/walkthrough-vertical.mp4 (9:16)
```

## Footage real

O vídeo fonte vive em `reference/` (ignorado pelo git) e é copiado para
`public/footage.mp4`. Pontos de corte: `startFromSeconds` em `src/constants.ts`.

## Banda sonora (opcional)

Coloque um `music.mp3` em `public/` e mude `MUSIC_FILE` em `src/constants.ts`
para `"music.mp3"`. Fade in/out automático.

## Notas

- Screenshots e vídeos não vão para o git; só o `manifest.json` é versionado.
- O capture usa `reducedMotion` (revela secções AnimateIn) e força
  `content-visibility: visible` (pinta a masonry da galeria fora do ecrã).
