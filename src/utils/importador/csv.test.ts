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
import { detectarSeparador, ErrorCSV, leerCSV } from "./csv";

describe("detectarSeparador", () => {
  it("punto y coma, el habitual en bancos españoles / semicolon, the usual one in Spanish banks", () => {
    expect(detectarSeparador("Fecha;Concepto;Importe\n01/02/2026;Pan;-1,20")).toBe(";");
  });

  it("coma / comma", () => {
    expect(detectarSeparador("Fecha,Concepto,Importe\n2026-02-01,Pan,-1.20")).toBe(",");
  });

  it("gana el separador que respeta las comillas aunque dé menos columnas / the separator that respects quotes wins even with fewer columns", () => {
    expect(detectarSeparador('a;"b,c,d"\ne;"f,g,h"')).toBe(";");
    expect(leerCSV('a;"b,c,d"\ne;"f,g,h"')).toEqual([
      ["a", "b,c,d"],
      ["e", "f,g,h"],
    ]);
  });

  it("una sola celda rara con comillas no cambia el separador del fichero / a single odd quoted cell does not change the file separator", () => {
    const texto =
      'Fecha;Concepto;Importe\n01/02/2026;PAN;-1,20\n02/02/2026;"EL RINCON" BAR;-2,50\n03/02/2026;LECHE;-0,95\n';
    expect(detectarSeparador(texto)).toBe(";");
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

  it("comilla sin cerrar: error con la fila donde empieza / unclosed quote: error with the row where it starts", () => {
    expect(() => leerCSV('a;b\nc;"d;e\nf')).toThrow(ErrorCSV);
    try {
      leerCSV('a;b\nc;"d;e\nf');
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorCSV);
      expect((e as ErrorCSV).fila).toBe(2);
    }
  });

  it("una comilla en mitad de una celda sin comillas es texto / a quote in the middle of an unquoted cell is text", () => {
    const texto = 'Fecha;Concepto;Importe\n01/02/2026;BAR "PEPE;-1,20\n02/02/2026;PAN;-2,00\n';
    expect(detectarSeparador(texto)).toBe(";");
    expect(leerCSV(texto)).toEqual([
      ["Fecha", "Concepto", "Importe"],
      ["01/02/2026", 'BAR "PEPE', "-1,20"],
      ["02/02/2026", "PAN", "-2,00"],
    ]);
  });

  it("solo retornos de carro antiguos (CR) / legacy carriage returns only (CR)", () => {
    expect(leerCSV("a;b\rc;d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});
