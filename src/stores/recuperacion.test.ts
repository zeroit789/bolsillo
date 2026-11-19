/* =============================================================================
 * recuperacion.test.ts — Datos ilegibles / Unreadable data
 * -----------------------------------------------------------------------------
 * ES: Reproduce H1 del análisis (arrancar con un blob que no se puede leer, que
 *     la app sustituía en silencio por los datos de ejemplo) y prueba las salidas
 *     de la pantalla de error. H2 (guardado que falla) está en guardado.test.ts.
 *     Todos los datos son inventados.
 * EN: Reproduces H1 from the analysis (booting with a blob that cannot be read,
 *     which the app silently replaced with the sample data) and tests the ways
 *     out of the error screen. H2 (failing save) lives in guardado.test.ts. All
 *     data is made up.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Utilidades de prueba / Test helpers
 *   2. H1: datos ilegibles / H1: unreadable data
 *   3. Salidas de la pantalla de error / Ways out of the error screen
 * ===========================================================================*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as almacen from "../utils/almacen";
import { cifrar } from "../utils/cripto";
import { useAjustes } from "./ajustes";
import { useSesion } from "./sesion";

// ── 1. Utilidades de prueba / Test helpers ────────────────────────────────────
// ES: Claves de localStorage que usa la app. / EN: localStorage keys used by the app.
const CLAVE_DATOS = "bolsillo.datos.cif";
const CLAVE_AJUSTES = "bolsillo.ajustes";

// ES: Vacía cualquier guardado pendiente del store activo (si la API existe),
//     para que un temporizador de una prueba no escriba en la siguiente.
// EN: Flushes any pending save of the active store (if the API exists), so a
//     timer from one test never writes into the next one.
async function vaciarPendientes() {
  const s = useSesion() as unknown as { vaciarGuardado?: () => Promise<boolean> };
  if (typeof s.vaciarGuardado === "function") await s.vaciarGuardado();
}

// ES: Simula cerrar y volver a abrir la app: stores nuevos, mismo localStorage.
// EN: Simulates closing and reopening the app: fresh stores, same localStorage.
async function reabrirApp() {
  await vaciarPendientes();
  setActivePinia(createPinia());
  almacen.usarOfuscacion();
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

// ── 2. H1: datos ilegibles / H1: unreadable data ──────────────────────────────
describe("H1: nunca se pisan datos ilegibles / unreadable data is never overwritten", () => {
  it.each([
    ["JSON del blob roto / broken blob JSON", "{esto no es json"],
    ["base64 roto / broken base64", JSON.stringify({ v: 1, salt: "@@@", iv: "!!", ct: "??" })],
    ["faltan campos / missing fields", JSON.stringify({ v: 1, salt: "AAAA" })],
  ])("sin bloqueo, blob dañado (%s) / no lock, damaged blob", async (_n, blob) => {
    await primerArranque(null);
    localStorage.setItem(CLAVE_DATOS, blob);

    await reabrirApp();
    const sesion = useSesion();
    await sesion.arrancar();
    await vaciarPendientes();

    // ES: El blob sigue igual, byte a byte. / EN: The blob is byte-for-byte unchanged.
    expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
    expect(sesion.desbloqueado).toBe(false);
    expect((sesion as unknown as { fallo: string | null }).fallo).toBe("danado");
  });

  it("sin bloqueo, descifra pero no valida / no lock, decrypts but does not validate", async () => {
    await primerArranque(null);
    localStorage.setItem(
      CLAVE_DATOS,
      await cifrar(JSON.stringify({ hola: 1 }), almacen.SECRETO_OFUSCACION)
    );
    const blob = localStorage.getItem(CLAVE_DATOS);

    await reabrirApp();
    const sesion = useSesion();
    await sesion.arrancar();
    await vaciarPendientes();

    expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
    expect(sesion.desbloqueado).toBe(false);
    expect((sesion as unknown as { fallo: string | null }).fallo).toBe("invalido");
  });

  it("con PIN y sin bolsillo.ajustes no se pisa nada / PIN set and settings lost: nothing is overwritten", async () => {
    await primerArranque("1234");
    const blob = localStorage.getItem(CLAVE_DATOS);
    localStorage.removeItem(CLAVE_AJUSTES);

    await reabrirApp();
    const sesion = useSesion();
    await sesion.arrancar();
    await vaciarPendientes();

    // ES: Mismo blob y sigue abriéndose con el PIN de siempre.
    // EN: Same blob and it still opens with the usual PIN.
    expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
    expect(await almacen.secretoValido("1234")).toBe(true);
    expect(sesion.necesitaOnboarding).toBe(false);
    expect(sesion.desbloqueado).toBe(false);
    expect((sesion as unknown as { fallo: string | null }).fallo).toBe("credencial");
  });
});

// ── 3. Salidas de la pantalla de error / Ways out of the error screen ────────
describe("pantalla de error: salidas / error screen: ways out", () => {
  // ES: Deja la app en fallo "danado" con un blob roto inventado.
  // EN: Leaves the app in a "danado" failure with a made-up broken blob.
  async function conBlobRoto() {
    await primerArranque(null);
    localStorage.setItem(CLAVE_DATOS, "{roto");
    await reabrirApp();
    const sesion = useSesion();
    await sesion.arrancar();
    return sesion;
  }

  it("empezar de cero conserva el rescate y luego guarda lo nuevo / start from scratch keeps the rescue", async () => {
    const sesion = await conBlobRoto();
    const rescate = sesion.rescate;
    expect(rescate).not.toBeNull();
    expect(localStorage.getItem(rescate!)).toBe("{roto");

    expect(sesion.empezarDeCero()).toBe(true);
    expect(sesion.necesitaOnboarding).toBe(true);
    // ES: Hasta terminar la bienvenida no se toca el blob. / EN: Blob untouched until the welcome ends.
    expect(localStorage.getItem(CLAVE_DATOS)).toBe("{roto");

    await sesion.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "vacio" });
    expect((await almacen.leer()).estado).toBe("ok");
    expect(localStorage.getItem(rescate!)).toBe("{roto");
  });

  it("sin espacio para el rescate no se empieza de cero sin forzar / no rescue space: no restart unless forced", async () => {
    await primerArranque(null);
    localStorage.setItem(CLAVE_DATOS, "{roto");
    await reabrirApp();
    const original = localStorage.setItem.bind(localStorage);
    const espia = vi.spyOn(localStorage, "setItem").mockImplementation((k: string, v: string) => {
      if (k.startsWith(almacen.PREFIJO_RESCATE))
        throw new DOMException("lleno", "QuotaExceededError");
      original(k, v);
    });
    const sesion = useSesion();
    await sesion.arrancar();
    expect(sesion.rescateFallido).toBe(true);
    expect(sesion.empezarDeCero()).toBe(false);
    expect(sesion.necesitaOnboarding).toBe(false);
    await expect(
      sesion.importarDatos({ recurrentes: [], puntuales: [], deudas: [] })
    ).rejects.toThrow("sin-rescate");
    expect(localStorage.getItem(CLAVE_DATOS)).toBe("{roto");
    espia.mockRestore();
  });

  it("importar una copia v1 desde el fallo entra sin bloqueo / importing a v1 backup from the failure enters unlocked", async () => {
    const sesion = await conBlobRoto();
    await sesion.importarDatos({ recurrentes: [], puntuales: [], deudas: [] });
    expect(sesion.fallo).toBeNull();
    expect(sesion.desbloqueado).toBe(true);
    expect(useAjustes().bloqueoActivo).toBe(false);
    expect((await almacen.leer()).estado).toBe("ok");
    expect(localStorage.getItem(sesion.rescate!)).toBe("{roto");
  });

  it("con ajustes perdidos, el PIN de siempre abre y repone el bloqueo / settings lost: the usual PIN opens and restores the lock", async () => {
    await primerArranque("1234");
    localStorage.removeItem(CLAVE_AJUSTES);
    await reabrirApp();
    const sesion = useSesion();
    await sesion.arrancar();
    expect(sesion.fallo).toBe("credencial");
    // ES: Con fallo de credencial no se hace rescate todavía. / EN: No rescue yet on a credential failure.
    expect(sesion.rescate).toBeNull();

    expect(await sesion.desbloquear("0000")).toBe(false);
    expect(sesion.error).toBe("credIncorrecta");
    expect(await sesion.desbloquear("1234")).toBe(true);
    expect(sesion.fallo).toBeNull();
    expect(useAjustes().bloqueoActivo).toBe(true);
    expect(useAjustes().bloqueoTipo).toBe("pin");
  });
});

describe("bloqueo en ajustes con datos solo ofuscados / lock in settings with only-obfuscated data", () => {
  it("la recuperación abre y corrige los ajustes / recovery opens and fixes the settings", async () => {
    await primerArranque(null);
    // ES: Ajustes que dicen "PIN" sobre un blob solo ofuscado (estado de la 1.1.0).
    // EN: Settings saying "PIN" over an only-obfuscated blob (1.1.0 state).
    useAjustes().setBloqueo(true, "pin");
    await reabrirApp();
    const sesion = useSesion();
    await sesion.arrancar();
    expect(sesion.desbloqueado).toBe(false);
    await sesion.mostrarRecuperacion();
    expect(sesion.desbloqueado).toBe(true);
    expect(useAjustes().bloqueoActivo).toBe(false);
  });
});
