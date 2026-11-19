/* =============================================================================
 * finanzas.test.ts — Tests de acciones del store de finanzas / Finance store action tests
 * -----------------------------------------------------------------------------
 * ES: Reproduce el fallo de la revisión con las aportaciones a un plan: el tope
 *     se comprobaba en cada aportación, pero dos aportaciones válidas podían
 *     dejar lo aportado por encima del tope, y luego el plan no se podía
 *     guardar desde el editor. Todos los datos son inventados.
 * EN: Reproduces the review finding about plan contributions: the cap was
 *     checked on each contribution, but two valid contributions could leave
 *     the saved amount above the cap, and then the plan could not be saved
 *     from the editor. All data is made up.
 * ===========================================================================*/
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFinanzas } from "./finanzas";
import { IMPORTE_MAX } from "../utils/importe";

// ES: Un Pinia nuevo por prueba para que no se arrastren planes.
// EN: A fresh Pinia per test so plans do not carry over.
beforeEach(() => {
  setActivePinia(createPinia());
});

// ES: Crea un plan inventado y devuelve su id.
// EN: Creates a made-up plan and returns its id.
function planDePrueba(aportado = 0): string {
  const f = useFinanzas();
  f.addPlan({ nombre: "Viaje", objetivo: 1000, aportado });
  return f.planes[f.planes.length - 1].id;
}

describe("aportarAPlan", () => {
  it("suma y devuelve true con una aportación válida / adds and returns true with a valid contribution", () => {
    const f = useFinanzas();
    const id = planDePrueba(10);
    expect(f.aportarAPlan(id, 2.555)).toBe(true);
    expect(f.planes[0].aportado).toBe(12.56);
  });

  it("rechaza la aportación si el acumulado pasaría del tope / rejects the contribution if the total would exceed the cap", () => {
    const f = useFinanzas();
    const id = planDePrueba();
    expect(f.aportarAPlan(id, 600_000_000)).toBe(true);
    expect(f.aportarAPlan(id, 600_000_000)).toBe(false);
    expect(f.planes[0].aportado).toBe(600_000_000);
  });

  it("admite llegar justo al tope / allows reaching exactly the cap", () => {
    const f = useFinanzas();
    const id = planDePrueba(999_999_999);
    expect(f.aportarAPlan(id, 0.99)).toBe(true);
    expect(f.planes[0].aportado).toBe(IMPORTE_MAX);
    expect(f.aportarAPlan(id, 0.01)).toBe(false);
    expect(f.planes[0].aportado).toBe(IMPORTE_MAX);
  });

  it("rechaza cantidades no válidas y planes que no existen / rejects invalid amounts and missing plans", () => {
    const f = useFinanzas();
    const id = planDePrueba(5);
    for (const c of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e307]) {
      expect(f.aportarAPlan(id, c), String(c)).toBe(false);
    }
    expect(f.aportarAPlan("no-existe", 1)).toBe(false);
    expect(f.planes[0].aportado).toBe(5);
  });
});
