# Adicionar fotos à galeria

O objetivo é simples: **quando quiser adicionar fotos, basta dizer.** Este guia
explica o que acontece por trás e como é rápido.

## A forma mais fácil (recomendada)

1. Diga-me **"quero adicionar fotos"** e diga a que dizem respeito
   (ex.: _"são do casamento da Sofia e do André"_ ou _"é um evento corporativo"_).
2. Coloque as fotos originais (boa qualidade) na pasta de entrada do projeto:
   `public/imagens/_intake/`
   — no GitHub, isto faz-se a arrastar os ficheiros para dentro dessa pasta no site.
3. Eu trato do resto: correr um comando, rever, e publicar.

Não precisa de saber categorias, nomes de ficheiros, nem nada técnico. Só as fotos
e o contexto.

## O que acontece nos bastidores

Existe um comando único que faz **tudo** de uma vez:

```bash
npm run gallery:sync -- --label Casamento --collection "Sofia & André" --match sofia-andre
```

Para cada foto nova na pasta `_intake/`, ele:

- move-a para `public/imagens/`;
- escolhe a **categoria** (Casamento, Corporativo, Conferência, Aéreo, Evento);
- regista o **casal / evento** (para as legendas e o texto das imagens);
- adiciona-a à lista da galeria (`photos-data.ts`);
- regenera automaticamente os _placeholders_ (efeito de desfoque ao carregar) e as
  dimensões das imagens.

O texto alternativo (SEO / acessibilidade) e as legendas são gerados sozinhos a
partir da categoria + casal — não há nada a escrever à mão.

### Opções do comando

- `--label <Categoria>` — força a categoria de todas as fotos novas
  (`Casamento`, `Corporativo`, `Conferência`, `Aéreo`, `Evento`).
- `--collection "<Nome>"` — o casal/evento (ex.: `"Sofia & André"`).
- `--match <pedaço-do-nome>` — o pedaço de nome de ficheiro que identifica esse
  casal (ex.: `sofia-andre`). Só é preciso na **primeira** vez que se regista um casal.
- `--dry` — pré-visualiza sem alterar nada.
- Também aceita nomes de ficheiros diretamente:
  `npm run gallery:sync -- IMG_1.jpg IMG_2.jpg --label Aéreo`.

## Notas importantes

- **Fotos removidas ficam removidas.** Há ~130 ficheiros que já estavam no site e
  foram retirados da galeria de propósito. O sistema só adiciona o que está na pasta
  `_intake/`, por isso essas nunca voltam sozinhas.
- **Depois de adicionar, é preciso publicar** (integrar na branch principal → o
  Vercel faz o deploy). Eu faço isso.
- **Qualidade:** envie os originais sempre que possível; as imagens são otimizadas
  automaticamente no site, mas partir de boa qualidade dá melhor resultado.
