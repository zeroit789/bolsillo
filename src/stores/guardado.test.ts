/* =============================================================================
 * guardado.test.ts — Guardado que avisa / Save that warns
 * -----------------------------------------------------------------------------
 * ES: Reproduce H2 (un guardado que falla, p. ej. almacenamiento lleno, se
 *     tragaba en silencio) y prueba el guardado nuevo: estado de error, reintento,
 *     debounce y cambio de credencial que no deja el disco descuadrado. Todos
 *     los datos son inventados.
 * EN: Reproduces H2 (a failing save, e.g. storage full, was silently
 *     swallowed) and tests the new save: error state, retry, debounce and a
 *     credential change that never leaves the disk out of step. All data is
 *     made up.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Utilidades de prueba / Test helpers
 *   2. H2: guardado que falla / H2: failing save
 * ===========================================================================*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import * as almacen from "../utils/almacen";
import { useAjustes } from "./ajustes";
import { useFinanzas } from "./finanzas";
import { useSesion } from "./sesion";

// ── 1. Utilidades de prueba / Test helpers ────────────────────────────────────
// ES: Clave de localStorage de los datos cifrados. / EN: localStorage key of the encrypted data.
const CLAVE_DATOS = "bolsillo.datos.cif";

// ES: Vacía cualquier guardado pendiente del store activo (si la API existe),
//     para que un temporizador de una prueba no escriba en la siguiente.
// EN: Flushes any pending save of the active store (if the API exists), so a
//     timer from one test never writes into the next one.
async function vaciarPendientes() {
  const s = useSesion() as unknown as { vaciarGuardado?: () => Promise<boolean> };
  if (typeof s.vaciarGuardado === "function") await s.vaciarGuardado();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  localStorage.clear();
  almacen.usarOfuscacion();
});

afterEach(async () => {
  // ES: vi.restoreAllMocks no restaura el espía de localStorage de happy-dom:
  //     se restaura a mano para que un fallo no contamine la prueba siguiente.
  // EN: vi.restoreAllMocks does not restore happy-dom's localStorage spy: it is
  //     restored by hand so a failure does not leak into the next test.
  if (vi.isMockFunction(localStorage.setItem)) vi.mocked(localStorage.setItem).mockRestore();
  await vaciarPendientes();
});

// ES: Primer arranque completo: bienvenida con o sin PIN y datos de ejemplo.
// EN: Full first run: onboarding with or without a PIN and the sample data.
async function primerArranque(pin: string | null) {
  const sesion = useSesion();
  await sesion.arrancar();
  await sesion.completarOnboarding({
    nombre: "Prueba",
    bloqueo: pin ? { tipo: "pin", credencial: pin } : null,
    datosIniciales: "ejemplo",
  } as Parameters<typeof sesion.completarOnboarding>[0]);
  await vaciarPendientes();
}

// ES: Hace que escribir la clave de datos lance QuotaExceededError hasta restaurar.
// EN: Makes writing the data key throw QuotaExceededError until restored.
function llenarAlmacenamiento() {
  const original = localStorage.setItem.bind(localStorage);
  return vi.spyOn(localStorage, "setItem").mockImplementation((k: string, v: string) => {
    if (k === CLAVE_DATOS) throw new DOMException("lleno", "QuotaExceededError");
    original(k, v);
  });
}

// ── 2. H2: guardado que falla / H2: failing save ──────────────────────────────
describe("H2: el guardado que falla avisa / a failing save warns", () => {
  it("almacenamiento lleno: estado de error y el blob no cambia / storage full: error state, blob unchanged", async () => {
    await primerArranque(null);
    const blob = localStorage.getItem(CLAVE_DATOS);

    // ES: Simula QuotaExceededError solo al escribir la clave de datos.
    // EN: Simulates QuotaExceededError only when writing the data key.
    const espia = llenarAlmacenamiento();

    useFinanzas().addPlan({ nombre: "Bici", objetivo: 300, aportado: 0 });
    await nextTick();
    await vaciarPendientes();
    // ES: Margen para el guardado asíncrono del código antiguo.
    // EN: Leeway for the old code's async save.
    await new Promise((r) => setTimeout(r, 400));

    const sesion = useSesion() as unknown as { estadoGuardado?: string };
    expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
    expect(sesion.estadoGuardado).toBe("error");
    espia.mockRestore();
  });
});

describe("guardado: reintento, debounce y credencial / save: retry, debounce and credential", () => {
  it("tras liberar espacio, Reintentar guarda y vuelve a ok / after freeing space, Retry saves and goes back to ok", async () => {
    await primerArranque(null);
    const espia = llenarAlmacenamiento();
    useFinanzas().addPlan({ nombre: "Bici", objetivo: 300, aportado: 0 });
    const sesion = useSesion();
    expect(sesion.estadoGuardado).toBe("pendiente");
    expect(await sesion.vaciarGuardado()).toBe(false);
    expect(sesion.estadoGuardado).toBe("error");

    espia.mockRestore();
    expect(await sesion.vaciarGuardado()).toBe(true);
    expect(sesion.estadoGuardado).toBe("ok");
    const r = await almacen.leer();
    expect(r.estado === "ok" && r.datos.planes.some((p) => p.nombre === "Bici")).toBe(true);
  });

  it("el debounce agrupa cambios seguidos en una escritura / the debounce groups quick changes into one write", async () => {
    await primerArranque(null);
    const espia = vi.spyOn(localStorage, "setItem");
    const f = useFinanzas();
    f.addPlan({ nombre: "A", objetivo: 1, aportado: 0 });
    f.addPlan({ nombre: "B", objetivo: 1, aportado: 0 });
    f.addPlan({ nombre: "C", objetivo: 1, aportado: 0 });
    await new Promise((r) => setTimeout(r, 600));
    const escrituras = espia.mock.calls.filter(([k]) => k === CLAVE_DATOS).length;
    espia.mockRestore();
    expect(escrituras).toBe(1);
    expect(useSesion().estadoGuardado).toBe("ok");
  });

  it("si falla el guardado al poner PIN, no cambia nada / if saving fails when setting a PIN, nothing changes", async () => {
    await primerArranque(null);
    const sesion = useSesion();
    const espia = llenarAlmacenamiento();
    await expect(sesion.configurarBloqueo("pin", "1234")).rejects.toThrow();
    espia.mockRestore();

    // ES: Ajustes sin bloqueo y el disco sigue con la ofuscación.
    // EN: Settings without lock and the disk still uses obfuscation.
    expect(useAjustes().bloqueoActivo).toBe(false);
    expect(await almacen.secretoValido("1234")).toBe(false);
    // ES: Los guardados siguientes usan también la ofuscación.
    // EN: Later saves also use obfuscation.
    useFinanzas().addPlan({ nombre: "Tras fallo", objetivo: 1, aportado: 0 });
    expect(await sesion.vaciarGuardado()).toBe(true);
    almacen.usarOfuscacion();
    expect((await almacen.leer()).estado).toBe("ok");
  });

  it("un cambio durante el cambio de PIN se guarda con el PIN nuevo / a change during the PIN change is saved with the new PIN", async () => {
    await primerArranque(null);
    const sesion = useSesion();
    const promesa = sesion.configurarBloqueo("pin", "4321");
    useFinanzas().addPlan({ nombre: "Durante", objetivo: 1, aportado: 0 });
    await promesa;
    expect(await sesion.vaciarGuardado()).toBe(true);
    const r = await almacen.leer("4321");
    expect(r.estado === "ok" && r.datos.planes.some((p) => p.nombre === "Durante")).toBe(true);
  });
});
