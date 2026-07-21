import { describe, it, expect } from "vitest";
import {
  DECOR_PRODUCTION,
  PRODUCTION_PHASE_SEP,
  buildProductionChecklist,
  buildProductionPlanItems,
  productionPhaseLabel,
} from "./production-templates";

/** Deterministic id generator: p0, p1, p2, … so tests can assert 1 call/item. */
function counterIds() {
  let n = 0;
  const gen = () => `p${n++}`;
  return { gen, calls: () => n };
}

describe("production-templates — DECOR_PRODUCTION shape", () => {
  it("has the five studio phases in a stable order", () => {
    expect(DECOR_PRODUCTION.map((p) => p.key)).toEqual([
      "sourcing",
      "condicionamento",
      "montagem",
      "instalacao",
      "strike",
    ]);
  });

  it("has unique phase keys and unique phase labels", () => {
    expect(new Set(DECOR_PRODUCTION.map((p) => p.key)).size).toBe(DECOR_PRODUCTION.length);
    expect(new Set(DECOR_PRODUCTION.map((p) => p.label)).size).toBe(DECOR_PRODUCTION.length);
  });

  it("gives every phase at least one task, all non-empty and trimmed", () => {
    for (const phase of DECOR_PRODUCTION) {
      expect(phase.key.trim()).toBe(phase.key);
      expect(phase.label.trim().length).toBeGreaterThan(0);
      expect(phase.tasks.length).toBeGreaterThan(0);
      for (const task of phase.tasks) {
        expect(task.trim()).toBe(task);
        expect(task.length).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate task text across the whole template", () => {
    const all = DECOR_PRODUCTION.flatMap((p) => p.tasks);
    expect(new Set(all).size).toBe(all.length);
  });

  it("uses slug-style keys (lowercase, no separator/whitespace)", () => {
    for (const p of DECOR_PRODUCTION) {
      expect(p.key).toMatch(/^[a-z]+$/);
    }
  });
});

describe("production-templates — buildProductionChecklist", () => {
  const flat = buildProductionChecklist();
  const totalTasks = DECOR_PRODUCTION.reduce((n, p) => n + p.tasks.length, 0);

  it("flattens to one entry per task, all initially not done", () => {
    expect(flat.length).toBe(totalTasks);
    expect(flat.every((t) => t.done === false)).toBe(true);
  });

  it("tags each entry with its phase LABEL (not the key) and preserves order", () => {
    expect(flat[0]).toEqual({
      phase: "Sourcing",
      label: DECOR_PRODUCTION[0].tasks[0],
      done: false,
    });
    // Last entry belongs to the last phase.
    expect(flat[flat.length - 1].phase).toBe(DECOR_PRODUCTION[DECOR_PRODUCTION.length - 1].label);
  });

  it("returns a fresh array each call (no shared mutable state)", () => {
    expect(buildProductionChecklist()).not.toBe(flat);
  });
});

describe("production-templates — productionPhaseLabel", () => {
  it("joins phase and task with the single-source separator", () => {
    expect(productionPhaseLabel("Sourcing", "Encomendar")).toBe(
      `Sourcing${PRODUCTION_PHASE_SEP}Encomendar`,
    );
    expect(PRODUCTION_PHASE_SEP).toBe(" · ");
  });
});

describe("production-templates — buildProductionPlanItems", () => {
  const totalTasks = DECOR_PRODUCTION.reduce((n, p) => n + p.tasks.length, 0);

  it("produces one ChecklistItem per task with unique ids, prefixed labels, done=false", () => {
    const { gen } = counterIds();
    const items = buildProductionPlanItems(gen);
    expect(items.length).toBe(totalTasks);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.every((i) => i.done === false)).toBe(true);
    // Every label carries a phase prefix + separator.
    for (const i of items) {
      expect(i.label).toContain(PRODUCTION_PHASE_SEP);
    }
    expect(items[0].label).toBe(productionPhaseLabel("Sourcing", DECOR_PRODUCTION[0].tasks[0]));
  });

  it("calls makeId exactly once per emitted (unfiltered) item", () => {
    const { gen, calls } = counterIds();
    buildProductionPlanItems(gen);
    expect(calls()).toBe(totalTasks);
  });

  it("is idempotent: re-applying with the already-present labels adds nothing", () => {
    const first = buildProductionPlanItems(counterIds().gen);
    const existing = new Set(first.map((i) => i.label));
    const second = buildProductionPlanItems(counterIds().gen, existing);
    expect(second).toEqual([]);
  });

  it("only adds the missing items when some labels already exist", () => {
    const all = buildProductionPlanItems(counterIds().gen);
    const keepFirstTwo = new Set(all.slice(0, 2).map((i) => i.label));
    const added = buildProductionPlanItems(counterIds().gen, keepFirstTwo);
    expect(added.length).toBe(totalTasks - 2);
    expect(added.some((i) => keepFirstTwo.has(i.label))).toBe(false);
  });

  it("matches on the FULL prefixed label — an unprefixed task text does not filter anything", () => {
    // A caller must dedupe against the composed label, not the raw task.
    const rawTask = new Set([DECOR_PRODUCTION[0].tasks[0]]);
    const items = buildProductionPlanItems(counterIds().gen, rawTask);
    expect(items.length).toBe(totalTasks);
  });

  it("treats an empty existingLabels set as 'nothing present' (emits all)", () => {
    const items = buildProductionPlanItems(counterIds().gen, new Set());
    expect(items.length).toBe(totalTasks);
  });
});
