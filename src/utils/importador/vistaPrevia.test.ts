/* =============================================================================
 * vistaPrevia.test.ts — Tests de la vista previa / Preview tests
 * -----------------------------------------------------------------------------
 * ES: Pasa los extractos inventados de __fixtures__ por crearVistaPrevia y
 *     comprueba que las filas buenas salen normalizadas (fecha ISO, céntimos
 *     positivos, signo) y que cada fila mala deja sus errores sin abortar el
 *     resto: fecha imposible, importe roto, dos columnas rellenas o ninguna,
 *     importe cero y concepto vacío. Datos inventados.
 * EN: Runs the made-up statements in __fixtures__ through crearVistaPrevia and
 *     checks that good rows come out normalised (ISO date, positive cents,
 *     sign) and that every bad row leaves its errors without aborting the rest:
 *     impossible date, broken amount, both columns filled or none, zero amount
 *     and empty concept. Made-up data.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { leerCSV } from "./csv";
import {
  EXTRACTO_CARGO_ABONO,
  EXTRACTO_DEBE_HABER,
  EXTRACTO_UNA_COLUMNA,
} from "./__fixtures__/extractos";
import { crearVistaPrevia } from "./vistaPrevia";

describe("crearVistaPrevia con una columna de importe / with one amount column", () => {
  const vista = crearVistaPrevia(leerCSV(EXTRACTO_UNA_COLUMNA), {
    formatoFecha: "dma",
    formatoDecimal: "coma",
    columnas: { fecha: "Fecha operación", concepto: "Concepto", importe: "Importe" },
  });

  it("detecta la cabecera tras el preámbulo / detects the header after the preamble", () => {
    expect(vista.problema).toBeNull();
    expect(vista.filaCabecera).toBe(4);
    expect(vista.cabecera?.[2]).toBe("Concepto");
  });

  it("normaliza las filas buenas / normalises the good rows", () => {
    expect(vista.filas).toHaveLength(6);
    expect(vista.filas[0]).toEqual({
      linea: 6,
      fecha: "2026-02-01",
      concepto: "NOMINA EMPRESA EJEMPLO SL",
      centimos: 185000,
      importe: 1850,
      signo: "ingreso",
    });
    expect(vista.filas[1]).toMatchObject({ centimos: 4567, importe: 45.67, signo: "gasto" });
    expect(vista.filas[4]).toMatchObject({
      concepto: "BIZUM DE NOMBRE INVENTADO",
      signo: "ingreso",
    });
  });

  it("las filas malas dejan errores y no paran el resto / bad rows leave errors and do not stop the rest", () => {
    expect(vista.errores).toEqual([
      { linea: 12, campo: "fecha", motivo: "invalido", valor: "31/02/2026" },
      { linea: 13, campo: "importe", motivo: "invalido", valor: "-1.23,4" },
    ]);
  });

  it("el pie sin fecha ni importe se ignora / the footer without date or amount is ignored", () => {
    expect(vista.ignoradas).toBe(2);
  });
});

describe("crearVistaPrevia con cargo y abono / with debit and credit", () => {
  const vista = crearVistaPrevia(leerCSV(EXTRACTO_CARGO_ABONO), {
    formatoFecha: "dma",
    formatoDecimal: "coma",
    columnas: { fecha: "Fecha", concepto: "Descripción", cargo: "Cargo", abono: "Abono" },
  });

  it("cargo es gasto y abono ingreso / debit is expense and credit is income", () => {
    expect(vista.filas).toEqual([
      {
        linea: 2,
        fecha: "2026-02-01",
        concepto: "TRANSFERENCIA; ALQUILER FEBRERO",
        centimos: 65000,
        importe: 650,
        signo: "gasto",
      },
      {
        linea: 3,
        fecha: "2026-02-02",
        concepto: "DEVOLUCION COMPRA",
        centimos: 1299,
        importe: 12.99,
        signo: "ingreso",
      },
    ]);
  });

  it("ambas columnas o ninguna es un error de fila / both columns or none is a row error", () => {
    expect(vista.errores).toEqual([
      { linea: 4, campo: "importe", motivo: "ambos", valor: "5,00 | 5,00" },
      { linea: 5, campo: "importe", motivo: "vacio", valor: "" },
    ]);
  });
});

describe("crearVistaPrevia con Debe/Haber, tabulador y punto decimal / with Debe/Haber, tab and decimal point", () => {
  it("lee el formato con punto / reads the dot format", () => {
    const vista = crearVistaPrevia(leerCSV(EXTRACTO_DEBE_HABER), {
      formatoFecha: "amd",
      formatoDecimal: "punto",
      columnas: { fecha: "Fecha", concepto: "Concepto", cargo: "Debe", abono: "Haber" },
    });
    expect(vista.errores).toEqual([]);
    expect(vista.filas.map((f) => [f.fecha, f.centimos, f.signo])).toEqual([
      ["2026-02-01", 123456, "gasto"],
      ["2026-02-15", 42, "ingreso"],
    ]);
  });
});

describe("crearVistaPrevia: casos límite / edge cases", () => {
  const perfil = {
    formatoFecha: "dma" as const,
    formatoDecimal: "coma" as const,
    columnas: { fecha: "Fecha", concepto: "Concepto", importe: "Importe" },
  };

  it("importe cero y concepto vacío son errores / zero amount and empty concept are errors", () => {
    const vista = crearVistaPrevia(
      [
        ["Fecha", "Concepto", "Importe"],
        ["01/02/2026", "CERO", "0,00"],
        ["01/02/2026", "", "-3,00"],
      ],
      perfil
    );
    expect(vista.filas).toEqual([]);
    expect(vista.errores).toEqual([
      { linea: 2, campo: "importe", motivo: "cero", valor: "0,00" },
      { linea: 3, campo: "concepto", motivo: "vacio", valor: "" },
    ]);
  });

  it("varios errores en la misma fila / several errors on the same row", () => {
    const vista = crearVistaPrevia(
      [
        ["Fecha", "Concepto", "Importe"],
        ["ayer", "", "mucho"],
      ],
      perfil
    );
    expect(vista.errores.map((e) => e.campo)).toEqual(["fecha", "concepto", "importe"]);
  });

  it("columna del perfil que no está en la cabecera / profile column missing from the header", () => {
    const vista = crearVistaPrevia([["Fecha", "Concepto", "Cantidad"]], perfil);
    expect(vista.problema).toEqual({ tipo: "columna", rol: "importe", columna: "Importe" });
    expect(vista.filas).toEqual([]);
  });

  it("sin cabecera, columnas por índice / without header, columns by index", () => {
    const vista = crearVistaPrevia(
      [
        ["01/02/2026", "PAN", "-1,20"],
        ["02/02/2026", "LECHE", "-0,95"],
      ],
      { ...perfil, columnas: { fecha: 0, concepto: 1, importe: 2 } },
      { filaCabecera: -1 }
    );
    expect(vista.cabecera).toBeNull();
    expect(vista.filas.map((f) => [f.linea, f.centimos])).toEqual([
      [1, 120],
      [2, 95],
    ]);
  });

  it("no hay cabecera y el perfil usa nombres / no header and the profile uses names", () => {
    const vista = crearVistaPrevia([["01/02/2026", "PAN", "-1,20"]], perfil);
    expect(vista.problema).toEqual({ tipo: "sinCabecera" });
  });

  it("concepto en varias columnas y celdas de XLSX / concept across columns and XLSX cells", () => {
    const vista = crearVistaPrevia(
      [
        ["Fecha", "Concepto", "Más datos", "Importe"],
        [new Date(Date.UTC(2026, 1, 1)), "RECIBO", "  AGUA  ", -20.5],
        [46054, "COMPRA", null, 3],
      ],
      {
        ...perfil,
        columnas: { fecha: "Fecha", concepto: ["Concepto", "Más datos"], importe: "Importe" },
      }
    );
    expect(vista.errores).toEqual([]);
    expect(vista.filas.map((f) => [f.fecha, f.concepto, f.centimos, f.signo])).toEqual([
      ["2026-02-01", "RECIBO AGUA", 2050, "gasto"],
      ["2026-02-01", "COMPRA", 300, "ingreso"],
    ]);
  });
});
