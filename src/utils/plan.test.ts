/* =============================================================================
 * plan.test.ts — Tests de los planes de ahorro / Savings plan tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba los cálculos puros de utils/plan.ts y las acciones de planes
 *     del store de finanzas (alta, edición, aportar y borrar).
 * EN: Checks the pure calculations in utils/plan.ts and the plan actions of the
 *     finance store (create, edit, add funds and delete).
 * ===========================================================================*/
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Plan } from "../types";
import { useFinanzas } from "../stores/finanzas";
import { conseguido, progreso, r2, restante } from "./plan";

// ES: Plan de ejemplo con objetivo 110 € (el "pintar el salón" del README).
// EN: Sample plan with a 110 € goal (the "paint the living room" from the README).
function plan(aportado: number, objetivo = 110): Plan {
  return { id: "p1", nombre: "Pintar el salón", objetivo, aportado };
}

describe("r2", () => {
  it("redondea a céntimos / rounds to cents", () => {
    expect(r2(12.345)).toBe(12.35);
    expect(r2(0.1 + 0.2)).toBe(0.3);
  });

  it("acepta coma decimal en texto / accepts a decimal comma in text", () => {
    expect(r2("12,50")).toBe(12.5);
  });

  it("lo que no es número cuenta como 0 / non-numbers count as 0", () => {
    expect(r2("abc")).toBe(0);
  });
});

describe("progreso / restante / conseguido", () => {
  it("calcula el progreso en % / computes the progress %", () => {
    expect(progreso(plan(55))).toBe(50);
  });

  it("acota el progreso entre 0 y 100 / clamps the progress to 0..100", () => {
    expect(progreso(plan(500))).toBe(100);
    expect(progreso(plan(-10))).toBe(0);
  });

  it("objetivo 0 da 0 % y no está conseguido / a 0 goal gives 0 % and is not achieved", () => {
    expect(progreso(plan(10, 0))).toBe(0);
    expect(conseguido(plan(10, 0))).toBe(false);
  });

  it("lo que falta nunca es negativo / what is left is never negative", () => {
    expect(restante(plan(40.1))).toBe(69.9);
    expect(restante(plan(200))).toBe(0);
  });

  it("se consigue al llegar al objetivo / is achieved when the goal is reached", () => {
    expect(conseguido(plan(109.99))).toBe(false);
    expect(conseguido(plan(110))).toBe(true);
  });
});

describe("acciones de planes del store / store plan actions", () => {
  // ES: Store limpio en cada test. / EN: Fresh store for every test.
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("crea, aporta, edita y borra un plan / creates, funds, edits and deletes a plan", () => {
    const f = useFinanzas();
    f.addPlan({ nombre: "Sofá", objetivo: 300, aportado: 0 });
    expect(f.planes).toHaveLength(1);
    const id = f.planes[0].id;

    // ES: Las aportaciones se suman redondeando a céntimos.
    // EN: Contributions are added and rounded to cents.
    f.aportarAPlan(id, 0.1);
    f.aportarAPlan(id, 0.2);
    expect(f.planes[0].aportado).toBe(0.3);

    f.actualizarPlan(id, { objetivo: 250 });
    expect(f.planes[0]).toMatchObject({ nombre: "Sofá", objetivo: 250, aportado: 0.3 });

    f.eliminarPlan(id);
    expect(f.planes).toHaveLength(0);
  });

  it("ignora aportaciones no válidas / ignores invalid contributions", () => {
    const f = useFinanzas();
    f.addPlan({ nombre: "Sofá", objetivo: 300, aportado: 10 });
    const id = f.planes[0].id;
    f.aportarAPlan(id, 0);
    f.aportarAPlan(id, -5);
    f.aportarAPlan(id, Number.NaN);
    f.aportarAPlan("no-existe", 50);
    expect(f.planes[0].aportado).toBe(10);
  });
});
