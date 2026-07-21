import { describe, it, expect, vi } from "vitest";

/**
 * Adversarial QA for the back-office SUPPLIERS + INVENTORY stores and the
 * production-plan seeding template.
 *
 * These are pure-mapper / pure-transform assertions (no disk, no Supabase), so
 * `./repository` is stubbed with a no-op factory — the modules only call
 * `createRepository(mapper)` at import time and we never exercise the repo here.
 *
 * Scope of the hunt: quantity coercion NaN-safety (the fix under test), plus
 * regression pins confirming the suppliers mapper and the production template
 * stay well-behaved on the same adversarial inputs.
 */

vi.mock("./repository", () => ({
  createRepository: () => ({}),
}));

import { mapper as inventoryMapper } from "./inventory-store";
import { mapper as suppliersMapper } from "./suppliers-store";
import { buildProductionPlanItems } from "./production-templates";

describe("inventory mapper — quantity is always a finite number (no NaN leak)", () => {
  // The mapper is the READ path for persisted rows and already defends every
  // other field with a safe default (name → "", category → "Outro",
  // condition → "bom"). `quantity: Number(r.quantity ?? 0)` intends the same
  // "default a bad value to 0", but `??` only catches null/undefined — a
  // non-numeric string / object slipped straight through as NaN, which then
  // renders as "NaN" in the Inventário view and corrupts any stock rollup.
  it("coerces a non-numeric quantity to 0 instead of leaking NaN", () => {
    const back = inventoryMapper.fromRow({ id: "x", name: "Vaso", quantity: "abc" });
    expect(Number.isNaN(back.quantity)).toBe(false);
    expect(back.quantity).toBe(0);
  });

  it("coerces a malformed object quantity to 0", () => {
    const back = inventoryMapper.fromRow({ id: "x", name: "Vaso", quantity: {} });
    expect(back.quantity).toBe(0);
  });

  it("still coerces a valid numeric string and passes real numbers through", () => {
    expect(inventoryMapper.fromRow({ id: "x", name: "n", quantity: "15" }).quantity).toBe(15);
    expect(inventoryMapper.fromRow({ id: "x", name: "n", quantity: 7 }).quantity).toBe(7);
    expect(inventoryMapper.fromRow({ id: "x", name: "n" }).quantity).toBe(0);
  });
});

describe("suppliers mapper — regression pins (reviewed, no bug found)", () => {
  it("null contact columns read back as undefined, not NaN/empty", () => {
    const back = suppliersMapper.fromRow({ id: "s", name: "F", category: "Flores", email: null });
    expect(back.email).toBeUndefined();
    expect(back.name).toBe("F");
  });
});

describe("production template — seeding stays idempotent (reviewed, no bug found)", () => {
  it("re-applying with the already-present labels adds nothing", () => {
    const first = buildProductionPlanItems(() => Math.random().toString(36));
    const existing = new Set(first.map((i) => i.label));
    const again = buildProductionPlanItems(() => Math.random().toString(36), existing);
    expect(again).toEqual([]);
  });
});
