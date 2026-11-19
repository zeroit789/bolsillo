/* =============================================================================
 * perfil.test.ts — Tests de perfiles de banco / Bank profile tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba la detección de la fila de cabecera (con preámbulo delante), la
 *     sugerencia de mapeo de columnas, la firma y detección automática de un
 *     perfil guardado, la resolución de columnas por nombre o por índice y la
 *     validación de un perfil leído de disco. Datos inventados.
 * EN: Checks header row detection (with a preamble before it), the column
 *     mapping suggestion, the signature and automatic detection of a saved
 *     profile, column resolution by name or by index and validation of a
 *     profile read from disk. Made-up data.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { leerCSV } from "./csv";
import { EXTRACTO_CARGO_ABONO, EXTRACTO_UNA_COLUMNA } from "./__fixtures__/extractos";
import {
  crearFirma,
  detectarCabecera,
  detectarPerfil,
  esPerfilBancoValido,
  resolverColumna,
  sugerirMapeo,
  type PerfilBanco,
} from "./perfil";

// ES: Perfil de ejemplo de un banco inventado con una sola columna de importe.
// EN: Example profile of a made-up bank with a single amount column.
const PERFIL_A: PerfilBanco = {
  id: "banco-a",
  nombre: "Banco A",
  separador: ";",
  formatoFecha: "dma",
  formatoDecimal: "coma",
  columnas: { fecha: "Fecha operación", concepto: "Concepto", importe: "Importe" },
  firma: ["fecha operacion", "fecha valor", "concepto", "importe", "saldo"],
};

// ES: Perfil de otro banco inventado con cargo y abono.
// EN: Profile of another made-up bank with debit and credit columns.
const PERFIL_B: PerfilBanco = {
  id: "banco-b",
  nombre: "Banco B",
  formatoFecha: "dma",
  formatoDecimal: "coma",
  columnas: { fecha: "Fecha", concepto: "Descripción", cargo: "Cargo", abono: "Abono" },
  firma: ["fecha", "descripcion", "cargo", "abono"],
};

describe("detectarCabecera", () => {
  it("salta el preámbulo del banco / skips the bank preamble", () => {
    expect(detectarCabecera(leerCSV(EXTRACTO_UNA_COLUMNA))).toBe(4);
  });

  it("cabecera en la primera fila / header in the first row", () => {
    expect(detectarCabecera(leerCSV(EXTRACTO_CARGO_ABONO))).toBe(0);
  });

  it("sin cabecera reconocible / no recognisable header", () => {
    expect(detectarCabecera([["01/02/2026", "Pan", "-1,20"]])).toBe(-1);
    expect(detectarCabecera([])).toBe(-1);
  });
});

describe("sugerirMapeo", () => {
  it("prefiere la fecha de operación a la de valor / prefers the operation date to the value date", () => {
    expect(
      sugerirMapeo(["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo"])
    ).toEqual({ fecha: "Fecha operación", concepto: "Concepto", importe: "Importe" });
  });

  it("dos columnas Cargo/Abono y Debe/Haber / two Cargo/Abono and Debe/Haber columns", () => {
    expect(sugerirMapeo(["Fecha", "Descripción", "Cargo", "Abono"])).toEqual({
      fecha: "Fecha",
      concepto: "Descripción",
      cargo: "Cargo",
      abono: "Abono",
    });
    expect(sugerirMapeo(["F. Valor", "Movimiento", "Debe", "Haber"])).toEqual({
      fecha: "F. Valor",
      concepto: "Movimiento",
      cargo: "Debe",
      abono: "Haber",
    });
  });

  it("importe con moneda en la cabecera / amount with currency in the header", () => {
    expect(sugerirMapeo(["Fecha", "Concepto", "Importe (€)", "Saldo (€)"])).toEqual({
      fecha: "Fecha",
      concepto: "Concepto",
      importe: "Importe (€)",
    });
  });

  it("nada reconocible / nothing recognisable", () => {
    expect(sugerirMapeo(["a", "b", null])).toEqual({});
  });
});

describe("crearFirma y detectarPerfil / crearFirma and detectarPerfil", () => {
  it("la firma son las cabeceras normalizadas / the signature is the normalised headers", () => {
    expect(crearFirma(["Fecha operación", " Concepto ", "", null, "IMPORTE"])).toEqual([
      "fecha operacion",
      "concepto",
      "importe",
    ]);
  });

  it("reconoce el banco por su cabecera / recognises the bank by its header", () => {
    const cabeceraA = ["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo"];
    expect(detectarPerfil(cabeceraA, [PERFIL_B, PERFIL_A])?.id).toBe("banco-a");
    expect(
      detectarPerfil(["FECHA", "Descripción", "Cargo", "Abono"], [PERFIL_A, PERFIL_B])?.id
    ).toBe("banco-b");
  });

  it("sin firma usa las columnas del mapeo / without a signature it uses the mapping columns", () => {
    const sinFirma = { ...PERFIL_B, firma: undefined };
    expect(
      detectarPerfil(["Fecha", "Descripción", "Cargo", "Abono", "Saldo"], [sinFirma])?.id
    ).toBe("banco-b");
  });

  it("gana el perfil más concreto / the most specific profile wins", () => {
    const generico: PerfilBanco = {
      ...PERFIL_A,
      id: "generico",
      firma: ["concepto", "importe"],
    };
    const cabecera = ["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo"];
    expect(detectarPerfil(cabecera, [generico, PERFIL_A])?.id).toBe("banco-a");
  });

  it("ninguno encaja / none fits", () => {
    expect(detectarPerfil(["Fecha", "Concepto", "Importe"], [PERFIL_B])).toBeNull();
  });
});

describe("resolverColumna", () => {
  it("por nombre normalizado o por índice / by normalised name or by index", () => {
    const cabecera = ["Fecha", "Descripción", "Importe"];
    expect(resolverColumna(cabecera, "descripcion")).toBe(1);
    expect(resolverColumna(cabecera, 2)).toBe(2);
    expect(resolverColumna(cabecera, "Saldo")).toBe(-1);
    expect(resolverColumna(null, 0)).toBe(0);
    expect(resolverColumna(null, "Fecha")).toBe(-1);
    expect(resolverColumna(cabecera, -1)).toBe(-1);
    expect(resolverColumna(cabecera, 1.5)).toBe(-1);
  });
});

describe("esPerfilBancoValido", () => {
  it("acepta perfiles bien formados (sobreviven a JSON) / accepts well-formed profiles (they survive JSON)", () => {
    expect(esPerfilBancoValido(JSON.parse(JSON.stringify(PERFIL_A)))).toBe(true);
    expect(esPerfilBancoValido(JSON.parse(JSON.stringify(PERFIL_B)))).toBe(true);
    expect(
      esPerfilBancoValido({ ...PERFIL_A, columnas: { fecha: 0, concepto: [2, 3], importe: 4 } })
    ).toBe(true);
  });

  it("rechaza perfiles incompletos o incoherentes / rejects incomplete or inconsistent profiles", () => {
    expect(esPerfilBancoValido(null)).toBe(false);
    expect(esPerfilBancoValido({ ...PERFIL_A, formatoFecha: "mda" })).toBe(false);
    expect(esPerfilBancoValido({ ...PERFIL_A, formatoDecimal: "x" })).toBe(false);
    expect(esPerfilBancoValido({ ...PERFIL_A, separador: "|" })).toBe(false);
    expect(esPerfilBancoValido({ ...PERFIL_A, columnas: { fecha: "Fecha", concepto: "C" } })).toBe(
      false
    );
    expect(
      esPerfilBancoValido({
        ...PERFIL_A,
        columnas: { fecha: "F", concepto: "C", importe: "I", cargo: "X", abono: "Y" },
      })
    ).toBe(false);
    expect(
      esPerfilBancoValido({ ...PERFIL_A, columnas: { fecha: "F", concepto: "C", cargo: "X" } })
    ).toBe(false);
    expect(esPerfilBancoValido({ ...PERFIL_A, firma: [1, 2] })).toBe(false);
    expect(esPerfilBancoValido({ ...PERFIL_A, nombre: 3 })).toBe(false);
  });
});
