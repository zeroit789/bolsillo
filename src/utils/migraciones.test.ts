/* =============================================================================
 * migraciones.test.ts — Tests de la migración v2 → v3 / v2 → v3 migration tests
 * -----------------------------------------------------------------------------
 * ES: La v3 valida el calendario de verdad (mes 01-12, día que exista en ese
 *     mes, nada de texto detrás) y añade `reciboId` (recibo guardado aparte).
 *     Los datos v2 que la v2 aceptaba NUNCA se pierden: las fechas imposibles
 *     se corrigen al valor válido más cercano y el original queda en una
 *     etiqueta "fecha-original:…" visible para el usuario.
 * EN: v3 really validates the calendar (month 01-12, a day that exists in
 *     that month, no trailing text) and adds `reciboId` (receipt stored
 *     separately). v2 data that v2 accepted is NEVER lost: impossible dates
 *     are corrected to the nearest valid value and the original stays in a
 *     "fecha-original:…" tag visible to the user.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { esDatosValidos, VERSION_DATOS } from "../types";
import { migrar, prepararDatos } from "./migraciones";

// ES: Datos v2 mínimos con un apunte de cada tipo. / EN: Minimal v2 data with one entry of each kind.
function v2(cambios: Record<string, unknown> = {}) {
  return {
    version: 2,
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
      },
    ],
    deudas: [
      {
        id: "d1",
        concepto: "Coche",
        tipo: "coche",
        total: 6000,
        cuotaMensual: 250,
        pagadoInicial: 0,
        inicioMes: "2026-01",
      },
    ],
    planes: [],
    presupuestos: [],
    plantillas: [],
    cuentas: [],
    ...cambios,
  };
}

describe("v3: calendario estricto / strict calendar", () => {
  it("la versión actual es la 3 / current version is 3", () => {
    expect(VERSION_DATOS).toBe(3);
  });

  it.each([
    ["mes 13 / month 13", { desde: "2026-13" }],
    ["mes 00 / month 00", { desde: "2026-00" }],
    ["hasta imposible / impossible end", { hasta: "2026-99" }],
  ])("rechaza en v3 %s / rejects in v3", (_n, cambio) => {
    const d = prepararDatos(v2()) as unknown as Record<string, unknown[]>;
    const r = { ...(d.recurrentes[0] as object), ...cambio };
    expect(esDatosValidos({ ...d, recurrentes: [r] })).toBe(false);
  });

  it.each([
    ["31 de febrero / 31 February", "2026-02-31"],
    ["29 de febrero no bisiesto / 29 Feb non-leap", "2026-02-29"],
    ["día 00 / day 00", "2026-03-00"],
    ["texto detrás / trailing text", "2026-03-10T10:00:00Z"],
  ])("rechaza la fecha %s en v3 / rejects the date in v3", (_n, fecha) => {
    const d = prepararDatos(v2()) as unknown as Record<string, unknown[]>;
    const p = { ...(d.puntuales[0] as object), fecha };
    expect(esDatosValidos({ ...d, puntuales: [p] })).toBe(false);
  });

  it("acepta el 29 de febrero bisiesto / accepts 29 Feb on a leap year", () => {
    const d = prepararDatos(v2()) as unknown as Record<string, unknown[]>;
    const p = { ...(d.puntuales[0] as object), fecha: "2028-02-29" };
    expect(esDatosValidos({ ...d, puntuales: [p] })).toBe(true);
  });
});

describe("migración v2 → v3 / v2 → v3 migration", () => {
  it("datos v2 válidos pasan sin cambios salvo la versión / valid v2 data passes unchanged except the version", () => {
    const d = prepararDatos(v2());
    expect(d.version).toBe(3);
    expect(d.puntuales[0].fecha).toBe("2026-02-10");
    expect(d.puntuales[0].tags).toBeUndefined();
  });

  it("corrige fechas imposibles sin perder el apunte y deja el original en una etiqueta / fixes impossible dates", () => {
    const entrada = v2({
      puntuales: [
        {
          id: "p1",
          concepto: "Febrero",
          importe: 1,
          signo: "gasto",
          categoria: "Otros",
          fecha: "2026-02-31",
          tags: ["casa"],
        },
        {
          id: "p2",
          concepto: "Con hora",
          importe: 2,
          signo: "gasto",
          categoria: "Otros",
          fecha: "2026-03-10T10:00:00Z",
        },
        {
          id: "p3",
          concepto: "Mes 13",
          importe: 3,
          signo: "gasto",
          categoria: "Otros",
          fecha: "2026-13-40",
        },
      ],
      recurrentes: [
        {
          id: "r1",
          concepto: "Raro",
          importe: 10,
          signo: "gasto",
          categoria: "Otros",
          desde: "2026-00",
          hasta: "2026-99",
        },
      ],
    });
    const d = prepararDatos(entrada);
    expect(d.puntuales.map((p) => p.fecha)).toEqual(["2026-02-28", "2026-03-10", "2026-12-31"]);
    expect(d.puntuales[0].tags).toEqual(["casa", "fecha-original:2026-02-31"]);
    // ES: Solo la parte de fecha válida: no hace falta etiqueta. / EN: Only the valid date part: no tag needed.
    expect(d.puntuales[1].tags).toBeUndefined();
    expect(d.puntuales[2].tags).toEqual(["fecha-original:2026-13-40"]);
    expect(d.recurrentes[0].desde).toBe("2026-01");
    expect(d.recurrentes[0].hasta).toBe("2026-12");
    expect(d.recurrentes[0].tags).toEqual(["desde-original:2026-00", "hasta-original:2026-99"]);
    // ES: La entrada no se muta. / EN: The input is not mutated.
    expect(entrada.puntuales[0]).toMatchObject({ fecha: "2026-02-31", tags: ["casa"] });
  });

  it("corrige el mes de inicio de una deuda / fixes a debt start month", () => {
    const d = prepararDatos(
      v2({
        deudas: [
          {
            id: "d1",
            concepto: "Coche",
            tipo: "coche",
            total: 6000,
            cuotaMensual: 250,
            pagadoInicial: 0,
            inicioMes: "2026-14",
          },
        ],
      })
    );
    expect(d.deudas[0].inicioMes).toBe("2026-12");
  });

  it("una v1 llega hasta la v3 en cadena / a v1 reaches v3 through the chain", () => {
    const v1 = { recurrentes: [], puntuales: v2().puntuales, deudas: [] };
    const d = prepararDatos(v1);
    expect(d.version).toBe(3);
    expect(d.planes).toEqual([]);
  });

  it("reciboId: válido si es un id seguro / valid if it is a safe id", () => {
    const d = migrar(v2()) as unknown as Record<string, unknown[]>;
    const con = (reciboId: unknown) => ({
      ...d,
      puntuales: [{ ...(d.puntuales[0] as object), reciboId }],
    });
    expect(esDatosValidos(con("0f8c3a2e-1b2c-4d5e-8f90-123456789abc"))).toBe(true);
    expect(esDatosValidos(con("../x"))).toBe(false);
    expect(esDatosValidos(con(5))).toBe(false);
  });
});
