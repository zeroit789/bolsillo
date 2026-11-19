/* =============================================================================
 * csv.test.ts — Tests del lector de CSV / CSV reader tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba leerCSV y detectarSeparador con extractos inventados: separador
 *     `;`, `,` o tabulador detectado solo, comillas con el separador dentro,
 *     comillas dobladas, saltos de línea dentro de comillas, BOM y finales de
 *     línea de Windows. Todos los datos son inventados.
 * EN: Checks leerCSV and detectarSeparador with made-up statements: `;`, `,`
 *     or tab separator detected on its own, quotes holding the separator,
 *     doubled quotes, line breaks inside quotes, BOM and Windows line endings.
 *     All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { detectarSeparador, leerCSV } from "./csv";

describe("detectarSeparador", () => {
  it("punto y coma, el habitual en bancos españoles / semicolon, the usual one in Spanish banks", () => {
    expect(detectarSeparador("Fecha;Concepto;Importe\n01/02/2026;Pan;-1,20")).toBe(";");
  });

  it("coma / comma", () => {
    expect(detectarSeparador("Fecha,Concepto,Importe\n2026-02-01,Pan,-1.20")).toBe(",");
  });

  it("tabulador / tab", () => {
    expect(detectarSeparador("Fecha\tConcepto\tImporte\n01/02/2026\tPan\t-1,20")).toBe("\t");
  });

  it("las comas decimales entre comillas no engañan / decimal commas inside quotes do not fool it", () => {
    const texto = 'Fecha;Concepto;Importe\n01/02/2026;"Pan, leche";"-1,20"\n02/02/2026;Bus;"-1,50"';
    expect(detectarSeparador(texto)).toBe(";");
  });
});

describe("leerCSV", () => {
  it("lee filas y columnas con BOM y CRLF / reads rows and columns with BOM and CRLF", () => {
    const texto = "\ufeffFecha;Concepto;Importe\r\n01/02/2026;Pan;-1,20\r\n";
    expect(leerCSV(texto)).toEqual([
      ["Fecha", "Concepto", "Importe"],
      ["01/02/2026", "Pan", "-1,20"],
    ]);
  });

  it("comillas con separador, comillas dobladas y salto de línea dentro / quotes with separator, doubled quotes and a line break inside", () => {
    const texto =
      'Fecha;Concepto;Importe\r\n01/02/2026;"Compra; ""oferta""\r\nsegunda línea";"-1.234,56"\r\n';
    expect(leerCSV(texto)).toEqual([
      ["Fecha", "Concepto", "Importe"],
      ["01/02/2026", 'Compra; "oferta"\r\nsegunda línea', "-1.234,56"],
    ]);
  });

  it("separador forzado / forced separator", () => {
    expect(leerCSV("a,b;c", { separador: ";" })).toEqual([["a,b", "c"]]);
  });

  it("líneas vacías se saltan y las celdas se recortan / empty lines are skipped and cells trimmed", () => {
    expect(leerCSV("a ; b\n\n  \nc;d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("última línea sin salto final y celdas vacías / last line without final break and empty cells", () => {
    expect(leerCSV("a;;c\n;;")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("comilla sin cerrar: lo que queda va a la celda / unclosed quote: the rest goes into the cell", () => {
    expect(leerCSV('a;"b;c\nd')).toEqual([["a", "b;c\nd"]]);
  });

  it("solo retornos de carro antiguos (CR) / legacy carriage returns only (CR)", () => {
    expect(leerCSV("a;b\rc;d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});
