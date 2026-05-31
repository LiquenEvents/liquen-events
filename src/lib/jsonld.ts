/**
 * Safely serialise structured data for an inline <script type="application/ld+json">.
 *
 * JSON.stringify does not escape `<`, so a value containing `</script>` could
 * break out of the script tag (XSS). We escape `<` and the U+2028/U+2029 line
 * separators that are valid in JSON but illegal in JS string literals.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
