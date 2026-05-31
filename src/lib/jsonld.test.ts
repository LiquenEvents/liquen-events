import { describe, it, expect } from "vitest";
import { jsonLd } from "./jsonld";

describe("jsonLd — safe JSON-LD serialisation", () => {
  it("escapes < so a value cannot break out of the script tag", () => {
    const out = jsonLd({ name: "Evil </script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });

  it("escapes the U+2028/U+2029 line separators", () => {
    const sep = String.fromCharCode(0x2028) + String.fromCharCode(0x2029);
    const out = jsonLd({ a: `x${sep}y` });
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  it("still produces valid, parseable JSON", () => {
    const data = { "@type": "Organization", name: "Liquen", tags: ["a < b", "c"] };
    expect(JSON.parse(jsonLd(data))).toEqual(data);
  });
});
