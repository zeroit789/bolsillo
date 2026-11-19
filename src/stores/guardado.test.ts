/* =============================================================================
 * guardado.test.ts — Guardado que avisa, reemplazo y bloqueo / Warning save, replace & lock
 * -----------------------------------------------------------------------------
 * ES: H2 del análisis (un guardado que falla no se veía) sobre el fichero
 *     cifrado (Rust simulado), el debounce, que nunca se escriben datos que no
 *     se podrían volver a leer, los dos arreglos ALTA de la revisión de la
 *     Tanda 1 (reemplazar persiste antes de publicar; un reintento nunca
 *     adelanta datos viejos a una operación) y el orden de "Bloquear ahora" y
 *     del autobloqueo (bloquear con cambios pendientes no pierde nada).
 * EN: H2 from the analysis (a failing save was invisible) on the encrypted
 *     file (simulated Rust), the debounce, that data that could not be read
 *     back is never written, the two HIGH fixes from the Tanda 1 review
 *     (replace persists before publishing; a retry never overtakes an
 *     operation with old data) and the order of "Lock now" and auto-lock
 *     (locking with pending changes loses nothing).
 * ===========================================================================*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as almacen from "../utils/almacen";
import { simulador } from "../utils/rustSimulado";
import type { DatosBolsillo } from "../types";
import { useAjustes } from "./ajustes";
import { useFinanzas } from "./finanzas";
import { useSesion } from "./sesion";

// ES: Contenido de datos.bolsillo (simulado). / EN: datos.bolsillo content (simulated).
const enDisco = (): DatosBolsillo => JSON.parse(simulador.estado.principal!.datos);

// ES: Deja que terminen las promesas pendientes. / EN: Lets pending promises settle.
const asentar = () => new Promise((r) => setTimeout(r, 0));

// ES: App recién configurada sin PIN y con el ejemplo. / EN: Freshly set-up app without a PIN and with samples.
async function app(pin: string | null = null) {
  const s = useSesion();
  await s.arrancar();
  await s.completarOnboarding({
    nombre: "",
    bloqueo: pin ? { tipo: "pin", credencial: pin } : null,
    datosIniciales: "ejemplo",
  });
  return s;
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  almacen.usarOfuscacion();
  simulador.reiniciar();
});

afterEach(async () => {
  vi.useRealTimers();
  simulador.estado.fallarGuardado = false;
  await useSesion().vaciarGuardado();
});

describe("H2: el guardado que falla avisa / a failing save warns", () => {
  it("disco lleno: estado de error, el fichero no cambia y Reintentar lo arregla / disk full: error, file unchanged, Retry fixes it", async () => {
    const s = await app();
    const antes = simulador.estado.principal!.datos;
    simulador.estado.fallarGuardado = true;
    useFinanzas().addPlan({ nombre: "Bici", objetivo: 300, aportado: 0 });
    expect(await s.vaciarGuardado()).toBe(false);
    expect(s.estadoGuardado).toBe("error");
    expect(simulador.estado.principal!.datos).toBe(antes);

    simulador.estado.fallarGuardado = false;
    expect(await s.vaciarGuardado()).toBe(true);
    expect(s.estadoGuardado).toBe("ok");
    expect(enDisco().planes.some((p) => p.nombre === "Bici")).toBe(true);
  });

  it("nunca escribe datos que no se podrían volver a leer / never writes unreadable data", async () => {
    const s = await app();
    const antes = simulador.estado.principal!.datos;
    useFinanzas().addPlan({ nombre: "Roto", objetivo: Infinity, aportado: 0 });
    expect(await s.vaciarGuardado()).toBe(false);
    expect(s.estadoGuardado).toBe("error");
    expect(simulador.estado.principal!.datos).toBe(antes);
  });

  it("el debounce agrupa cambios seguidos en una escritura / the debounce groups quick changes", async () => {
    vi.useFakeTimers();
    const s = await app();
    const antes = simulador.estado.escrituras;
    const f = useFinanzas();
    for (let i = 0; i < 5; i++) f.addPlan({ nombre: `P${i}`, objetivo: 10, aportado: 0 });
    expect(s.estadoGuardado).toBe("pendiente");
    await vi.advanceTimersByTimeAsync(400);
    expect(simulador.estado.escrituras - antes).toBe(1);
    expect(s.estadoGuardado).toBe("ok");
  });
});

describe("reemplazar y operaciones (revisión Tanda 1) / replace and operations (Tanda 1 review)", () => {
  it("si guardar el reemplazo falla, la pantalla y lo pendiente siguen igual / failed replace keeps screen and pending", async () => {
    const s = await app();
    const f = useFinanzas();
    f.addPlan({ nombre: "Pendiente", objetivo: 50, aportado: 0 });
    simulador.estado.fallarGuardado = true;
    await expect(s.reemplazarDatos("vacio")).rejects.toThrow();
    // ES: Lo de antes sigue en pantalla, con el cambio pendiente incluido.
    // EN: The previous data is still on screen, with the pending change.
    expect(f.planes.some((p) => p.nombre === "Pendiente")).toBe(true);
    expect(f.recurrentes.length).toBeGreaterThan(0);
    simulador.estado.fallarGuardado = false;
    expect(await s.vaciarGuardado()).toBe(true);
    expect(enDisco().planes.some((p) => p.nombre === "Pendiente")).toBe(true);
  });

  it("un reintento que llega durante un reemplazo no escribe datos viejos encima / a retry during a replace does not write old data", async () => {
    vi.useFakeTimers();
    const s = await app();
    useFinanzas().addPlan({ nombre: "Viejo", objetivo: 50, aportado: 0 });
    simulador.estado.fallarGuardado = true;
    await vi.advanceTimersByTimeAsync(400);
    expect(s.estadoGuardado).toBe("error");
    simulador.estado.fallarGuardado = false;
    await s.reemplazarDatos("vacio");
    // ES: Pasa el tiempo del reintento: no hay nada que guardar y no pisa el reemplazo.
    // EN: The retry time passes: nothing to save and the replacement is not overwritten.
    await vi.advanceTimersByTimeAsync(70_000);
    expect(enDisco().planes).toEqual([]);
    expect(enDisco().recurrentes).toEqual([]);
    expect(s.estadoGuardado).toBe("ok");
  });

  it("un cambio durante el cambio de PIN se guarda después, con el PIN nuevo / a change during the PIN change is saved after", async () => {
    const s = await app();
    const op = s.configurarBloqueo("pin", "4831");
    useFinanzas().addPlan({ nombre: "Durante", objetivo: 10, aportado: 0 });
    await op;
    expect(await s.vaciarGuardado()).toBe(true);
    expect(simulador.estado.principal!.bloqueo).toBe("pin");
    expect(enDisco().planes.some((p) => p.nombre === "Durante")).toBe(true);
  });

  it("si falla al poner PIN, no cambia nada / if setting a PIN fails, nothing changes", async () => {
    const s = await app();
    simulador.estado.fallarGuardado = true;
    await expect(s.configurarBloqueo("pin", "4831")).rejects.toThrow();
    expect(useAjustes().bloqueoActivo).toBe(false);
    expect(simulador.estado.principal!.bloqueo).toBe("ninguno");
    expect(s.claveRecuperacion).toBeNull();
  });
});

describe("bloquear ahora y autobloqueo / lock now and auto-lock", () => {
  it("bloquear con cambios pendientes y desbloquear deja los datos intactos / lock with pending changes keeps data", async () => {
    const s = await app("4831");
    const f = useFinanzas();
    f.addPlan({ nombre: "Antes de bloquear", objetivo: 70, aportado: 0 });
    const esperado = JSON.parse(JSON.stringify(f.snapshot()));
    expect(await s.bloquearAhora()).toBe(true);
    expect(s.desbloqueado).toBe(false);
    expect(simulador.estado.abierta).toBeNull();
    expect(f.planes).toEqual([]);
    await asentar();
    // ES: El vaciado de memoria no se guardó encima. / EN: The memory wipe was not saved on top.
    expect(enDisco()).toEqual(esperado);
    expect(await s.desbloquear("4831")).toBe(true);
    expect(f.snapshot()).toEqual(esperado);
  });

  it("si no se puede guardar, no se bloquea (no se pierden cambios) / if it cannot save, it does not lock", async () => {
    const s = await app("4831");
    useFinanzas().addPlan({ nombre: "Sin guardar", objetivo: 70, aportado: 0 });
    simulador.estado.fallarGuardado = true;
    expect(await s.bloquearAhora()).toBe(false);
    expect(s.desbloqueado).toBe(true);
    expect(useFinanzas().planes.some((p) => p.nombre === "Sin guardar")).toBe(true);
  });

  it("sin PIN no hay nada que bloquear / without a PIN there is nothing to lock", async () => {
    const s = await app();
    expect(await s.bloquearAhora()).toBe(false);
    expect(s.desbloqueado).toBe(true);
  });

  it("el autobloqueo actúa a los minutos configurados / auto-lock acts after the configured minutes", async () => {
    vi.useFakeTimers();
    const s = await app("4831");
    useAjustes().setMinutosAutobloqueo(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.desbloqueado).toBe(true);
    await vi.advanceTimersByTimeAsync(80_000);
    expect(s.desbloqueado).toBe(false);
    expect(simulador.estado.abierta).toBeNull();
    expect(await s.desbloquear("4831")).toBe(true);
    expect(useFinanzas().recurrentes.length).toBeGreaterThan(0);
  });
});
