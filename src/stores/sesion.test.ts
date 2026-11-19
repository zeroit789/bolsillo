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
import { esDatosValidos, VERSION_DATOS, type DatosBolsillo } from "../types";
import { prepararDatos } from "../utils/migraciones";
import { datosVacios } from "../data/demo";
import { mesActual } from "../utils/format";
import * as almacen from "../utils/almacen";
import { useAjustes } from "./ajustes";
import { useFinanzas } from "./finanzas";
import { useSesion } from "./sesion";

// ES: Copia de seguridad mínima y válida. / EN: Minimal valid backup.
function copia(): DatosBolsillo {
  return {
    version: VERSION_DATOS,
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
      datosIniciales: "ejemplo",
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
    expect((await almacen.leer()).estado).toBe("ok");
  });
});

describe("importar copia / import backup", () => {
  it("importa y persiste una copia válida / imports and persists a valid backup", async () => {
    const sesion = useSesion();
    await sesion.importarDatos(copia());

    expect(useFinanzas().snapshot()).toEqual(copia());
    // ES: Queda guardada cifrada en disco. / EN: It is saved encrypted on disk.
    expect(await almacen.leer()).toEqual({ estado: "ok", datos: copia() });
  });

  it("rechaza una copia inválida sin tocar los datos / rejects an invalid backup without touching data", async () => {
    const sesion = useSesion();
    await sesion.importarDatos(copia());

    await expect(sesion.importarDatos({ recurrentes: [] })).rejects.toThrow("copia-invalida");
    expect(useFinanzas().snapshot()).toEqual(copia());
  });

  it("migra una copia antigua sin versión en vez de rechazarla / migrates an old unversioned backup instead of rejecting it", async () => {
    // ES: Forma de la 1.1.0: sin version, sin colecciones opcionales y con
    //     descuidos tolerables (comercio null, día de pago como texto).
    // EN: 1.1.0 shape: no version, no optional collections and tolerable slips
    //     (null merchant, payment day as text).
    const { recurrentes, puntuales, deudas } = copia();
    const antigua = {
      recurrentes: [{ ...recurrentes[0], comercio: null, diaPago: "5" }],
      puntuales,
      deudas,
      categoriasCustom: ["Mascotas"],
    };
    await useSesion().importarDatos(antigua);
    const s = useFinanzas().snapshot();
    expect(s.version).toBe(VERSION_DATOS);
    expect(s.recurrentes[0]).toEqual({ ...recurrentes[0], diaPago: 5 });
    expect(s.planes).toEqual([]);
  });

  it("rechaza una copia de una versión más nueva / rejects a backup from a newer version", async () => {
    const sesion = useSesion();
    await expect(sesion.importarDatos({ ...copia(), version: VERSION_DATOS + 1 })).rejects.toThrow(
      "copia-version"
    );
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

  it("las copias antiguas sin colecciones opcionales pasan tras migrar / old backups without optional collections pass after migrating", () => {
    const { recurrentes, puntuales, deudas } = copia();
    expect(esDatosValidos({ recurrentes, puntuales, deudas })).toBe(false);
    expect(prepararDatos({ recurrentes, puntuales, deudas })).toEqual({
      ...copia(),
      planes: [],
      presupuestos: [],
      plantillas: [],
      cuentas: [],
    });
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
    ["sin versión", (d: DatosBolsillo) => delete (d as { version?: number }).version],
    [
      "concepto no texto",
      (d: DatosBolsillo) => ((d.puntuales[0] as { concepto: unknown }).concepto = 1),
    ],
    ["etiqueta no texto", (d: DatosBolsillo) => (d.puntuales[0].tags = [3 as never])],
    [
      "recibo que no es texto",
      (d: DatosBolsillo) => ((d.puntuales[0] as { recibo: unknown }).recibo = 9),
    ],
    [
      "cuenta no texto",
      (d: DatosBolsillo) => ((d.recurrentes[0] as { cuenta: unknown }).cuenta = 7),
    ],
    [
      "comercio no texto",
      (d: DatosBolsillo) => ((d.puntuales[0] as { comercio: unknown }).comercio = {}),
    ],
    ["día de pago 40", (d: DatosBolsillo) => (d.deudas[0].diaPago = 40)],
    ["tipo de deuda raro", (d: DatosBolsillo) => ((d.deudas[0] as { tipo: string }).tipo = "x")],
    ["falta plantillas", (d: DatosBolsillo) => delete (d as { plantillas?: unknown }).plantillas],
  ])("rechaza: %s / rejects a broken field", (_nombre, romper) => {
    const d = copia();
    romper(d);
    expect(esDatosValidos(d)).toBe(false);
  });
});

describe("datos iniciales y reemplazo / initial data and replacement", () => {
  it("nada se guarda hasta terminar la bienvenida / nothing is saved until the welcome ends", async () => {
    const sesion = useSesion();
    await sesion.arrancar();
    expect(sesion.necesitaOnboarding).toBe(true);
    expect(almacen.hayDatos()).toBe(false);

    await sesion.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "vacio" });
    const r = await almacen.leer();
    expect(r.estado === "ok" && r.datos.recurrentes.length === 0).toBe(true);
    expect(useAjustes().configurado).toBe(true);
  });

  it("con ejemplo se guardan los datos de ejemplo / with samples the sample data is saved", async () => {
    const sesion = useSesion();
    await sesion.arrancar();
    await sesion.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "ejemplo" });
    const r = await almacen.leer();
    expect(r.estado === "ok" && r.datos.recurrentes.length > 0).toBe(true);
  });

  it("Empezar de cero y Cargar ejemplo sustituyen y guardan / start from scratch and load samples replace and save", async () => {
    const sesion = useSesion();
    await sesion.arrancar();
    await sesion.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "ejemplo" });

    await sesion.reemplazarDatos("vacio");
    expect(useFinanzas().snapshot().deudas).toEqual([]);
    let r = await almacen.leer();
    expect(r.estado === "ok" && r.datos.deudas.length === 0).toBe(true);

    await sesion.reemplazarDatos("ejemplo");
    r = await almacen.leer();
    expect(r.estado === "ok" && r.datos.deudas.length > 0).toBe(true);
    expect(sesion.estadoGuardado).toBe("ok");
  });
});

describe("lo que escribe la app pasa la validación / what the app writes passes validation", () => {
  it("altas reales con y sin opcionales, tras JSON / real entries with and without optionals, after JSON", () => {
    const f = useFinanzas();
    f.hidratar(datosVacios());
    f.addCuenta({ nombre: "Banco", saldoInicial: 100 });
    const cuenta = f.snapshot().cuentas[0].id;
    // ES: Sin opcionales y con todos (como los emite ModalMovimiento y DeudasView).
    // EN: Without optionals and with all of them (as ModalMovimiento and DeudasView emit them).
    const base = { concepto: "X", importe: 10, categoria: "Ocio" };
    f.addRecurrente({ ...base, signo: "gasto", desde: "2026-01", hasta: null });
    f.addRecurrente({
      ...base,
      signo: "ingreso",
      desde: "2026-01",
      hasta: "2026-12",
      diaPago: undefined,
      comercio: undefined,
      tags: undefined,
      cuenta: undefined,
    });
    f.addRecurrente({
      ...base,
      signo: "gasto",
      desde: "2026-01",
      hasta: null,
      diaPago: 5,
      comercio: "Tienda",
      tags: ["casa"],
      cuenta,
    });
    f.addPuntual({ ...base, signo: "gasto", fecha: "2026-02-03" });
    f.addPuntual({
      ...base,
      signo: "gasto",
      fecha: "2026-02-03",
      comercio: "Súper",
      tags: ["a", "b"],
      recibo: "data:image/jpeg;base64,AAAA",
      cuenta,
      subdivisiones: [
        { categoria: "Ocio", importe: 6 },
        { categoria: "Hogar", importe: 4 },
      ],
    });
    f.addDeuda({
      concepto: "Moto",
      tipo: "moto",
      total: 1000,
      cuotaMensual: 100,
      pagadoInicial: 0,
      inicioMes: "2026-01",
    });
    f.addDeuda({
      concepto: "Tarjeta",
      tipo: "tarjeta",
      total: 500,
      cuotaMensual: 50,
      pagadoInicial: 10,
      inicioMes: "2026-01",
      diaPago: 28,
    });
    f.addPlan({ nombre: "Viaje", objetivo: 900, aportado: 0 });
    f.addPlantilla({ concepto: "Café", importe: 1.5, signo: "gasto", categoria: "Ocio" });
    f.setPresupuesto("Ocio", 200);

    const enDisco = JSON.parse(JSON.stringify(f.snapshot()));
    expect(esDatosValidos(enDisco)).toBe(true);
    expect(esDatosValidos(f.snapshot())).toBe(true);
  });

  it("con datos vacíos el mes actual existe y los totales son números / with empty data the current month exists and totals are numbers", () => {
    const f = useFinanzas();
    f.hidratar(datosVacios());
    expect(f.mesesDisponibles).toContain(mesActual());
    const r = f.resumenDe(mesActual());
    for (const v of [r.ingresos, r.gastosFijos, r.gastosVariables, r.totalGastos, r.disponible])
      expect(Number.isFinite(v)).toBe(true);
  });
});
