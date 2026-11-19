/* =============================================================================
 * extracto.test.ts — Tests de la apertura de extractos / Statement opening tests
 * -----------------------------------------------------------------------------
 * ES: El asistente recibe bytes de cualquier origen (diálogo nativo de Rust o
 *     <input type="file"> en el navegador) y abrirExtracto decide si es un
 *     XLSX (por su firma ZIP) o un CSV (texto en UTF-8 o Windows-1252). Un
 *     .xls antiguo, un fichero vacío o uno enorme se rechazan con un código
 *     que la vista traduce. Los extractos son los sintéticos de __fixtures__.
 * EN: The wizard gets bytes from any source (Rust's native dialog or an
 *     <input type="file"> in the browser) and abrirExtracto decides whether it
 *     is an XLSX (by its ZIP signature) or a CSV (UTF-8 or Windows-1252 text).
 *     An old .xls, an empty file or a huge one is rejected with a code the
 *     view translates. Statements are the synthetic ones in __fixtures__.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { abrirExtracto, ErrorExtracto, matrizDe } from "./extracto";
import { EXTRACTO_CARGO_ABONO, EXTRACTO_UNA_COLUMNA } from "./importador/__fixtures__/extractos";
import { MAX_BYTES } from "./importador/xlsx";

const utf8 = (s: string) => new TextEncoder().encode(s);

describe("abrirExtracto / abrirExtracto", () => {
  it("un CSV en UTF-8 con BOM se lee como texto y luego como matriz / a UTF-8 CSV with BOM is read as text then as a matrix", async () => {
    const f = await abrirExtracto(utf8(EXTRACTO_UNA_COLUMNA));
    expect(f.tipo).toBe("csv");
    const m = matrizDe(f);
    expect(m[4]).toEqual(["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo"]);
  });

  it("un CSV en Windows-1252 conserva los acentos / a Windows-1252 CSV keeps the accents", async () => {
    // ES: "Descripción" con ó = 0xF3 en Windows-1252. / EN: "Descripción" with ó = 0xF3 in Windows-1252.
    const bytes = new Uint8Array([...utf8("Fecha;Descripci"), 0xf3, ...utf8("n;Cargo;Abono\n")]);
    const m = matrizDe(await abrirExtracto(bytes));
    expect(m[0][1]).toBe("Descripción");
  });

  it("el separador forzado cambia la lectura / a forced separator changes the reading", async () => {
    const f = await abrirExtracto(utf8(EXTRACTO_CARGO_ABONO));
    expect(matrizDe(f)[0]).toEqual(["Fecha", "Descripción", "Cargo", "Abono"]);
    expect(matrizDe(f, ",")[0]).toEqual(["Fecha;Descripción;Cargo;Abono"]);
  });

  it("un XLSX se reconoce por su firma y se lee la primera hoja / an XLSX is recognised by its signature", async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Hoja");
    hoja.addRow(["Fecha", "Concepto", "Importe"]);
    hoja.addRow(["01/02/2026", "NOMINA", 1850]);
    const bytes = new Uint8Array((await libro.xlsx.writeBuffer()) as ArrayBuffer);
    const f = await abrirExtracto(bytes);
    expect(f.tipo).toBe("xlsx");
    expect(matrizDe(f)).toEqual([
      ["Fecha", "Concepto", "Importe"],
      ["01/02/2026", "NOMINA", 1850],
    ]);
  });

  it.each([
    ["vacío / empty", new Uint8Array(), "vacio"],
    ["xls antiguo / old xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "xls"],
    ["zip que no es un libro / zip that is not a workbook", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "xlsx"],
    ["demasiado grande / too large", new Uint8Array(MAX_BYTES + 1), "grande"],
  ])("rechaza %s / rejects", async (_n, bytes, codigo) => {
    await expect(abrirExtracto(bytes)).rejects.toEqual(new ErrorExtracto(codigo as ErrorExtracto["codigo"]));
  }); // prettier-ignore

  it("una comilla sin cerrar sale como error con su fila / an unclosed quote comes out as an error with its row", async () => {
    const f = await abrirExtracto(utf8('Fecha;Concepto\n01/02/2026;"ROTO\n'));
    expect(() => matrizDe(f)).toThrow(ErrorExtracto);
    try {
      matrizDe(f);
    } catch (e) {
      expect((e as ErrorExtracto).codigo).toBe("comillas");
      expect((e as ErrorExtracto).fila).toBe(2);
    }
  });
});
