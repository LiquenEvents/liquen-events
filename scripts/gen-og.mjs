/**
 * Generates the branded Open Graph / social-share card at public/og-liquen.jpg
 * (1200×630). A signature aerial photo, darkened for legibility, with the white
 * Líquen wordmark and a spaced geographic line — the card people see when the
 * site is shared on WhatsApp, Facebook, LinkedIn, etc.
 *
 * Re-run after changing the brand mark or the base photo:
 *   node scripts/gen-og.mjs
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const W = 1200;
const H = 630;
const BASE_PHOTO = path.join(ROOT, "public/imagens/DaniGui_JantarFesta_130.jpg");
const LOGO = path.join(ROOT, "public/logo-liquen-branco.png");
const OUT = path.join(ROOT, "public/og-liquen.jpg");

// Darkening + framing overlay: an even tint for wordmark legibility, deepened
// top and bottom so the mark and the caps line always sit on shadow.
const overlay = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0c0f08" stop-opacity="0.58"/>
        <stop offset="45%" stop-color="#0c0f08" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="#0c0f08" stop-opacity="0.74"/>
      </linearGradient>
      <radialGradient id="c" cx="50%" cy="44%" r="42%">
        <stop offset="0%" stop-color="#0c0f08" stop-opacity="0.50"/>
        <stop offset="100%" stop-color="#0c0f08" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#0c0f08" opacity="0.26"/>
    <rect width="${W}" height="${H}" fill="url(#v)"/>
    <rect width="${W}" height="${H}" fill="url(#c)"/>
  </svg>`,
);

// Caps line + hairline rule, centered below the wordmark.
const CAPS = "ÉVORA · ALENTEJO · PORTUGAL";
const caption = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${W / 2 - 150}" y1="452" x2="${W / 2 + 150}" y2="452"
          stroke="#d6ab3a" stroke-width="1.2" opacity="0.85"/>
    <text x="${W / 2}" y="500" text-anchor="middle"
          font-family="DejaVu Sans, sans-serif" font-size="24" letter-spacing="7"
          fill="#f7f4ee" opacity="0.94">${CAPS}</text>
  </svg>`,
);

const LOGO_W = 430;
const logo = await sharp(LOGO).resize({ width: LOGO_W }).toBuffer();
const logoMeta = await sharp(logo).metadata();

const photo = await sharp(BASE_PHOTO)
  .resize(W, H, { fit: "cover", position: "attention" })
  .toBuffer();

await sharp(photo)
  .composite([
    { input: overlay, top: 0, left: 0 },
    {
      input: logo,
      top: Math.round(H / 2 - logoMeta.height / 2 - 40),
      left: Math.round(W / 2 - LOGO_W / 2),
    },
    { input: caption, top: 0, left: 0 },
  ])
  .jpeg({ quality: 88, progressive: true, mozjpeg: true })
  .toFile(OUT);

const { size } = await fs.stat(OUT);
console.log(`✓ ${path.relative(ROOT, OUT)} — ${W}×${H}, ${(size / 1024).toFixed(0)} KB`);
