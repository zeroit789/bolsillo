/* =============================================================================
 * sesion.test.ts — Tests del bloqueo con PIN y la importación / PIN lock & import tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba el flujo real de la app con el store de sesión: activar el PIN
 *     en la bienvenida, reabrir la app bloqueada, desbloquear con PIN bueno y
 *     malo, cambiar y quitar el PIN, e importar una copia de seguridad (válida
 *     e inválida) junto con su validador esDatosValidos.
 * EN: Checks the real app flow through the session store: set a PIN during
 *     onboarding, reopen the app locked, unlock with a right and a wrong PIN,
 *     change and remove the PIN, and import a backup (valid and invalid) along
 *     with its validator esDatosValidos.
 * ===========================================================================*/
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { esDatosValidos, type DatosBolsillo } from "../types";
import * as almacen from "../utils/almacen";
import { useAjustes } from "./ajustes";
import { useFinanzas } from "./finanzas";
import { useSesion } from "./sesion";

// ES: Copia de seguridad mínima y válida. / EN: Minimal valid backup.
function copia(): DatosBolsillo {
  return {
    recurrentes: [
      {
        id: "r1",
        concepto: "Nómina",
        importe: 1500,
        signo: "ingreso",
        categoria: "Nómina",
        desde: "2026-01",
        hasta: null,
      },
    ],
    puntuales: [
      {
        id: "p1",
        concepto: "Súper",
        importe: 80,
        signo: "gasto",
        categoria: "Comida",
        fecha: "2026-02-10",
        subdivisiones: [
          { categoria: "Comida", importe: 60 },
          { categoria: "Hogar", importe: 20 },
        ],
      },
    ],
    deudas: [
      {
        id: "d1",
        concepto: "Coche",
        tipo: "coche",
        total: 6000,
        cuotaMensual: 250,
        pagadoInicial: 1000,
        inicioMes: "2026-01",
      },
    ],
    planes: [{ id: "pl1", nombre: "Vacaciones", objetivo: 900, aportado: 150 }],
    presupuestos: [{ categoria: "Comida", limite: 300 }],
    plantillas: [],
    cuentas: [{ id: "c1", nombre: "Banco", saldoInicial: 500 }],
  };
}

// ES: Simula cerrar y volver a abrir la app: stores nuevos, mismo localStorage.
// EN: Simulates closing and reopening the app: fresh stores, same localStorage.
function reabrirApp() {
  setActivePinia(createPinia());
  almacen.usarOfuscacion();
}

beforeEach(() => {
  localStorage.clear();
  reabrirApp();
});

describe("bloqueo con PIN / PIN lock", () => {
  it("la app reabre bloqueada y solo abre con el PIN correcto / reopens locked and only the right PIN opens it", async () => {
    // ES: Primer arranque: bienvenida con PIN 1234.
    // EN: First run: onboarding with PIN 1234.
    const sesion = useSesion();
    await sesion.arrancar();
    expect(sesion.necesitaOnboarding).toBe(true);
    await sesion.completarOnboarding({
      nombre: "  Ana  ",
      bloqueo: { tipo: "pin", credencial: "1234" },
    });
    expect(useAjustes().nombre).toBe("Ana");
    const planesAntes = useFinanzas().snapshot().planes.length;

    // ES: Al reabrir, se queda bloqueada sin cargar nada.
    // EN: On reopening it stays locked without loading anything.
    reabrirApp();
    const s2 = useSesion();
    await s2.arrancar();
    expect(useAjustes().bloqueoActivo).toBe(true);
    expect(s2.desbloqueado).toBe(false);

    // ES: PIN malo: sigue bloqueada y muestra el error.
    // EN: Wrong PIN: stays locked and shows the error.
    expect(await s2.desbloquear("0000")).toBe(false);
    expect(s2.error).toBe("credIncorrecta");
    expect(s2.desbloqueado).toBe(false);

    // ES: PIN bueno: desbloquea y recupera los mismos datos.
    // EN: Right PIN: unlocks and gets the same data back.
    expect(await s2.desbloquear("1234")).toBe(true);
    expect(s2.error).toBe("");
    expect(s2.desbloqueado).toBe(true);
    expect(useFinanzas().snapshot().planes).toHaveLength(planesAntes);
  });

  it("cambiar el PIN exige el antiguo / changing the PIN requires the old one", async () => {
    const sesion = useSesion();
    await sesion.configurarBloqueo("pin", "1111");

    expect(await sesion.cambiarCredencial("9999", "2222", "pin")).toBe(false);
    expect(await almacen.secretoValido("1111")).toBe(true);

    expect(await sesion.cambiarCredencial("1111", "2222", "pin")).toBe(true);
    expect(await almacen.secretoValido("2222")).toBe(true);
    expect(await almacen.secretoValido("1111")).toBe(false);
  });

  it("quitar el PIN vuelve a la ofuscación / removing the PIN goes back to obfuscation", async () => {
    const sesion = useSesion();
    await sesion.configurarBloqueo("pin", "1111");
    await sesion.quitarBloqueo();

    expect(useAjustes().bloqueoActivo).toBe(false);
    expect(await almacen.secretoValido("1111")).toBe(false);
    // ES: Los datos siguen legibles con el secreto de ofuscación.
    // EN: The data is still readable with the obfuscation secret.
    almacen.usarOfuscacion();
    expect(await almacen.cargar()).not.toBeNull();
  });
});

describe("importar copia / import backup", () => {
  it("importa y persiste una copia válida / imports and persists a valid backup", async () => {
    const sesion = useSesion();
    await sesion.importarDatos(copia());

    expect(useFinanzas().snapshot()).toEqual(copia());
    // ES: Queda guardada cifrada en disco. / EN: It is saved encrypted on disk.
    expect(await almacen.cargar()).toEqual(copia());
  });

  it("rechaza una copia inválida sin tocar los datos / rejects an invalid backup without touching data", async () => {
    const sesion = useSesion();
    await sesion.importarDatos(copia());

    await expect(sesion.importarDatos({ recurrentes: [] })).rejects.toThrow("copia-invalida");
    expect(useFinanzas().snapshot()).toEqual(copia());
  });

  it("la exportación (snapshot en JSON) se vuelve a importar igual / an export round-trips", async () => {
    const sesion = useSesion();
    await sesion.importarDatos(copia());

    // ES: Igual que AjustesView: snapshot serializado a JSON y vuelto a leer.
    // EN: Same as AjustesView: snapshot serialized to JSON and read back.
    const json = JSON.stringify(useFinanzas().snapshot(), null, 2);
    reabrirApp();
    await useSesion().importarDatos(JSON.parse(json));
    expect(useFinanzas().snapshot()).toEqual(copia());
  });
});

describe("esDatosValidos", () => {
  it("acepta una copia completa / accepts a full backup", () => {
    expect(esDatosValidos(copia())).toBe(true);
  });

  it("acepta copias antiguas sin las colecciones opcionales / accepts old backups without optional collections", () => {
    const { recurrentes, puntuales, deudas } = copia();
    expect(esDatosValidos({ recurrentes, puntuales, deudas })).toBe(true);
  });

  it("rechaza lo que no es un objeto / rejects non-objects", () => {
    expect(esDatosValidos(null)).toBe(false);
    expect(esDatosValidos("hola")).toBe(false);
    expect(esDatosValidos([])).toBe(false);
  });

  it("rechaza si falta una colección núcleo / rejects a missing core collection", () => {
    const { recurrentes, puntuales } = copia();
    expect(esDatosValidos({ recurrentes, puntuales })).toBe(false);
  });

  // ES: Cada caso rompe un solo campo de una copia por lo demás válida.
  // EN: Each case breaks a single field of an otherwise valid backup.
  it.each([
    ["importe NaN", (d: DatosBolsillo) => (d.recurrentes[0].importe = Number.NaN)],
    ["signo raro", (d: DatosBolsillo) => ((d.puntuales[0] as { signo: string }).signo = "x")],
    ["mes mal formado", (d: DatosBolsillo) => (d.recurrentes[0].desde = "2026-1")],
    ["fecha mal formada", (d: DatosBolsillo) => (d.puntuales[0].fecha = "10/02/2026")],
    [
      "subdivisión sin importe",
      (d: DatosBolsillo) => (d.puntuales[0].subdivisiones = [{ categoria: "X" } as never]),
    ],
    ["deuda sin inicio", (d: DatosBolsillo) => (d.deudas[0].inicioMes = "")],
    ["plan sin nombre", (d: DatosBolsillo) => ((d.planes[0] as { nombre: unknown }).nombre = 5)],
    ["cuenta sin saldo", (d: DatosBolsillo) => (d.cuentas[0].saldoInicial = Infinity)],
    ["elemento null", (d: DatosBolsillo) => (d.deudas as unknown[]).push(null)],
  ])("rechaza: %s / rejects a broken field", (_nombre, romper) => {
    const d = copia();
    romper(d);
    expect(esDatosValidos(d)).toBe(false);
  });
});
