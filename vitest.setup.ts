// Registers the jest-dom matchers (toBeInTheDocument, toHaveTextContent, …)
// on Vitest's `expect`. Safe under the default `node` environment too — it only
// extends the assertion library; the DOM-touching matchers are used solely by
// the component tests that opt into jsdom via `// @vitest-environment jsdom`.
import "@testing-library/jest-dom/vitest";
