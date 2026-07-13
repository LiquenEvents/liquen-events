/**
 * Build a URL to an optimised, right-sized copy of an image through Next's
 * image endpoint — used by the WebGL layers (HeroCanvas / ShaderImage /
 * PhotoWallCanvas) to pull a GPU texture instead of uploading the full-res
 * original.
 *
 * `width` must be one of the project's configured `images.deviceSizes` /
 * `imageSizes`, and quality is fixed at 75 because Next 16 only serves the
 * qualities listed in `images.qualities` (default `[75]`) — any other value
 * returns HTTP 400. Passing a width that matches a next/image request already
 * on the page (e.g. the flat ribbon's 480px texture) lets the browser serve
 * the texture straight from cache instead of downloading a second copy.
 */
export function sizedImageSrc(src: string, width: number): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}
