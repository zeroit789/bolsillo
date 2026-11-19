/* =============================================================================
 * duplicados.test.ts — Tests de duplicados al importar / Import duplicate tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba detectarDuplicados: contra lo ya apuntado (misma fecha o
 *     dentro de la tolerancia, mismos céntimos y signo, concepto normalizado),
 *     emparejando 1 a 1 para que un café apuntado no tape dos del fichero, y
 *     dentro del propio fichero (filas idénticas: posibles duplicados, nunca
 *     descartadas). Todos los datos son inventados.
 * EN: Checks detectarDuplicados: against what is already entered (same date
 *     or within tolerance, same cents and sign, normalised concept), pairing
 *     1 to 1 so one entered coffee does not hide two in the file, and within
 *     the file itself (identical rows: possible duplicates, never dropped).
 *     All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { detectarDuplicados, type MovimientoComparable } from "./duplicados";
import type { FilaImportada } from "./vistaPrevia";

// ES: Fila importada de prueba. / EN: Test imported row.
function fila(
  linea: number,
  fecha: string,
  concepto: string,
  centimos: number,
  signo: "ingreso" | "gasto" = "gasto"
): FilaImportada {
  return { linea, fecha, concepto, centimos, importe: centimos / 100, signo };
}

// ES: Movimiento ya apuntado de prueba (forma de un Puntual).
// EN: Test already-entered movement (shape of a Puntual).
function apunte(
  id: string,
  fecha: string,
  concepto: string,
  importe: number,
  signo: "ingreso" | "gasto" = "gasto"
): MovimientoComparable {
  return { id, fecha, concepto, importe, signo };
}

describe("detectarDuplicados contra lo apuntado / against what is entered", () => {
  it("misma fecha, importe y concepto normalizado / same date, amount and normalised concept", () => {
    const marcas = detectarDuplicados(
      [fila(2, "2026-02-03", "Cafetería  CENTRAL", 250)],
      [apunte("p1", "2026-02-03", "cafeteria central", 2.5)]
    );
    expect(marcas).toEqual([{ linea: 2, tipo: "apuntado", id: "p1", dias: 0 }]);
  });

  it("un café apuntado y dos en el fichero: solo uno casa con lo apuntado / one entered coffee and two in the file: only one matches", () => {
    const marcas = detectarDuplicados(
      [fila(2, "2026-02-03", "CAFE", 250), fila(3, "2026-02-03", "CAFE", 250)],
      [apunte("p1", "2026-02-03", "Café", 2.5)]
    );
    expect(marcas).toEqual([
      { linea: 2, tipo: "apuntado", id: "p1", dias: 0 },
      { linea: 3, tipo: "fichero", lineaOriginal: 2 },
    ]);
  });

  it("dos cafés iguales en el fichero son legítimos: se marcan, no se quitan / two equal coffees in the file are legit: flagged, not removed", () => {
    const filas = [fila(2, "2026-02-03", "CAFE", 250), fila(3, "2026-02-03", "CAFE", 250)];
    const marcas = detectarDuplicados(filas, []);
    expect(marcas).toEqual([{ linea: 3, tipo: "fichero", lineaOriginal: 2 }]);
    expect(filas).toHaveLength(2);
  });

  it("tolerancia de días configurable y se prefiere la fecha más cercana / configurable day tolerance and the closest date wins", () => {
    const filas = [fila(2, "2026-02-03", "RECIBO AGUA", 2050)];
    const apuntados = [
      apunte("lejos", "2026-02-01", "Recibo agua", 20.5),
      apunte("cerca", "2026-02-04", "Recibo agua", 20.5),
    ];
    expect(detectarDuplicados(filas, apuntados)).toEqual([]);
    expect(detectarDuplicados(filas, apuntados, { toleranciaDias: 2 })).toEqual([
      { linea: 2, tipo: "apuntado", id: "cerca", dias: 1 },
    ]);
  });

  it("la tolerancia cruza meses y años en UTC / tolerance crosses months and years in UTC", () => {
    expect(
      detectarDuplicados([fila(2, "2026-01-01", "X", 100)], [apunte("p1", "2025-12-30", "x", 1)], {
        toleranciaDias: 2,
      })
    ).toEqual([{ linea: 2, tipo: "apuntado", id: "p1", dias: 2 }]);
    expect(
      detectarDuplicados([fila(2, "2026-03-30", "X", 100)], [apunte("p1", "2026-03-28", "x", 1)], {
        toleranciaDias: 2,
      })
    ).toEqual([{ linea: 2, tipo: "apuntado", id: "p1", dias: 2 }]);
  });

  it("el emparejamiento global no deja una fila sin pareja por culpa del orden / global pairing does not leave a row unpaired because of the order", () => {
    // ES: La fila 2 podría quedarse "ayer" (a 1 día) y dejar sin pareja a la
    //     fila 3, que solo casa con "ayer" a 0 días. Gana la distancia menor.
    // EN: Row 2 could take "ayer" (1 day away) and leave row 3 unpaired, which
    //     only matches "ayer" at 0 days. The smaller distance wins.
    const marcas = detectarDuplicados(
      [fila(2, "2026-02-03", "PAN", 100), fila(3, "2026-02-02", "PAN", 100)],
      [apunte("ayer", "2026-02-02", "pan", 1), apunte("hoy", "2026-02-03", "pan", 1)],
      { toleranciaDias: 1 }
    );
    expect(marcas).toEqual([
      { linea: 2, tipo: "apuntado", id: "hoy", dias: 0 },
      { linea: 3, tipo: "apuntado", id: "ayer", dias: 0 },
    ]);
  });

  it("distinto signo, importe o concepto no casan / different sign, amount or concept do not match", () => {
    const filas = [fila(2, "2026-02-03", "BIZUM", 1500, "ingreso")];
    expect(detectarDuplicados(filas, [apunte("a", "2026-02-03", "Bizum", 15, "gasto")])).toEqual(
      []
    );
    expect(
      detectarDuplicados(filas, [apunte("b", "2026-02-03", "Bizum", 15.01, "ingreso")])
    ).toEqual([]);
    expect(detectarDuplicados(filas, [apunte("c", "2026-02-03", "Otro", 15, "ingreso")])).toEqual(
      []
    );
  });

  it("sin comparar el concepto (lo apuntado a mano se llama distinto) / without comparing the concept (hand entries are named differently)", () => {
    expect(
      detectarDuplicados(
        [fila(2, "2026-02-03", "COMPRA TARJ. 1234 SUPER", 4567)],
        [apunte("p1", "2026-02-02", "Súper", 45.67)],
        { toleranciaDias: 1, compararConcepto: false }
      )
    ).toEqual([{ linea: 2, tipo: "apuntado", id: "p1", dias: 1 }]);
  });

  it("importes con ruido binario y fechas con hora / amounts with binary noise and dates with time", () => {
    expect(
      detectarDuplicados(
        [fila(2, "2026-02-03", "X", 30)],
        [apunte("p1", "2026-02-03T10:00:00", "x", 0.1 + 0.2)]
      )
    ).toEqual([{ linea: 2, tipo: "apuntado", id: "p1", dias: 0 }]);
  });

  it("apuntes sin id usan su posición / entries without id use their position", () => {
    const sinId = { fecha: "2026-02-03", concepto: "x", importe: 1, signo: "gasto" as const };
    expect(detectarDuplicados([fila(2, "2026-02-03", "X", 100)], [sinId, sinId])).toEqual([
      { linea: 2, tipo: "apuntado", id: "0", dias: 0 },
    ]);
  });
});
