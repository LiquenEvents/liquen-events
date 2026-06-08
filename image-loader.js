/**
 * Custom next/image loader for serving /imagens from a CDN (Supabase Storage).
 *
 * DORMANT by default — it is NOT wired into next.config.ts. To activate, after
 * running `npm run upload:images` and verifying locally:
 *
 *   1. Set NEXT_PUBLIC_IMAGE_CDN (the script prints the exact value), e.g.
 *      NEXT_PUBLIC_IMAGE_CDN=https://xxxx.supabase.co/storage/v1/object/public/imagens
 *   2. In next.config.ts, inside `images`, add:
 *        loader: "custom",
 *        loaderFile: "./image-loader.js",
 *   3. `npm run dev`, open the site, confirm images load from the CDN
 *      (Network tab → requests hit supabase.co). Only deploy once verified.
 *
 * Behaviour:
 *   - CDN unset  → identical to Next's built-in optimizer (zero change).
 *   - CDN set    → only /imagens/* is served from the bucket; logos/icons and
 *                  any other assets keep using Next's optimizer.
 */
const CDN = process.env.NEXT_PUBLIC_IMAGE_CDN;

export default function liquenImageLoader({ src, width, quality }) {
  // Already-absolute URLs pass through untouched.
  if (/^https?:\/\//.test(src)) return src;

  if (CDN && src.startsWith("/imagens/")) {
    // Plain public object URL — works on any Supabase plan (serves the original
    // file). On a plan with Storage image transformations you can resize per
    // width instead, by pointing at the render endpoint:
    //   const base = CDN.replace("/object/", "/render/image/");
    //   return `${base}${src.replace(/^\/imagens/, "")}?width=${width}&quality=${quality || 75}`;
    return `${CDN.replace(/\/$/, "")}${src.replace(/^\/imagens/, "")}`;
  }

  // Default: Next.js' own optimizer (the built-in behaviour).
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
}
