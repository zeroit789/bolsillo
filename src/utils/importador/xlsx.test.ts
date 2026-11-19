/* =============================================================================
 * xlsx.test.ts — Tests del lector de XLSX / XLSX reader tests
 * -----------------------------------------------------------------------------
 * ES: Genera en memoria con ExcelJS una hoja inventada (preámbulo, fecha como
 *     fecha, número, fórmula con resultado, texto enriquecido, enlace, error y
 *     fila vacía) y comprueba que leerXLSX la deja como matriz de celdas
 *     simples, y valorCelda con cada tipo de valor de ExcelJS.
 * EN: Builds a made-up sheet in memory with ExcelJS (preamble, date as a date,
 *     number, formula with result, rich text, hyperlink, error and empty row)
 *     and checks that leerXLSX turns it into a matrix of plain cells, and
 *     valorCelda with every ExcelJS value type.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  ErrorXLSX,
  leerXLSX,
  MAX_BYTES,
  MAX_DESCOMPRIMIDO,
  tamanoDescomprimido,
  valorCelda,
} from "./xlsx";

// ES: Crea un libro con una hoja de extracto inventada y lo devuelve en bytes.
// EN: Creates a workbook with a made-up statement sheet and returns its bytes.
async function libroDePrueba(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const otra = libro.addWorksheet("Portada");
  otra.addRow(["Nada que ver"]);
  const hoja = libro.addWorksheet("Movimientos");
  hoja.addRow(["Extracto de prueba"]);
  hoja.addRow([]);
  hoja.addRow(["Fecha", "Concepto", "Importe"]);
  hoja.addRow([new Date(Date.UTC(2026, 1, 1)), "NOMINA", 1850]);
  hoja.addRow([
    new Date(Date.UTC(2026, 1, 3)),
    { richText: [{ text: "COMPRA " }, { text: "PAN" }] },
    -1.2,
  ]);
  hoja.addRow([
    "04/02/2026",
    { text: "WEB", hyperlink: "https://example.com" },
    { formula: "1+1", result: 2 },
  ]);
  const buffer = await libro.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe("leerXLSX", () => {
  it("lee la hoja pedida por nombre y salta filas vacías / reads the sheet requested by name and skips empty rows", async () => {
    const filas = await leerXLSX(await libroDePrueba(), { hoja: "Movimientos" });
    expect(filas).toEqual([
      ["Extracto de prueba", null, null],
      ["Fecha", "Concepto", "Importe"],
      [new Date(Date.UTC(2026, 1, 1)), "NOMINA", 1850],
      [new Date(Date.UTC(2026, 1, 3)), "COMPRA PAN", -1.2],
      ["04/02/2026", "WEB", 2],
    ]);
  });

  it("por defecto, la primera hoja / by default, the first sheet", async () => {
    expect(await leerXLSX(await libroDePrueba())).toEqual([["Nada que ver"]]);
  });

  it("hoja por índice e inexistente / sheet by index and missing one", async () => {
    const datos = await libroDePrueba();
    expect((await leerXLSX(datos, { hoja: 1 }))[1]).toEqual(["Fecha", "Concepto", "Importe"]);
    await expect(leerXLSX(datos, { hoja: "No existe" })).rejects.toThrow();
  });
});

describe("leerXLSX con hojas dispersas o enormes / with sparse or huge sheets", () => {
  // ES: Libro con datos normales y una celda suelta en `direccion`.
  // EN: Workbook with normal data and a stray cell at `direccion`.
  async function conCeldaSuelta(direccion: string): Promise<ArrayBuffer> {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Movimientos");
    hoja.addRow(["Fecha", "Concepto", "Importe"]);
    hoja.addRow(["01/02/2026", "PAN", -1.2]);
    hoja.getCell(direccion).value = "suelta";
    return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
  }

  it("una celda muy abajo no obliga a recorrer el hueco / a cell far down does not force walking the gap", async () => {
    const filas = await leerXLSX(await conCeldaSuelta("A900000"));
    expect(filas).toEqual([
      ["Fecha", "Concepto", "Importe"],
      ["01/02/2026", "PAN", -1.2],
      ["suelta", null, null],
    ]);
  });

  it("un fichero demasiado grande se rechaza sin abrirlo / a too-large file is rejected without opening it", async () => {
    await expect(leerXLSX(new Uint8Array(MAX_BYTES + 1))).rejects.toBeInstanceOf(ErrorXLSX);
  });

  it("una hoja demasiado ancha se rechaza / a too-wide sheet is rejected", async () => {
    await expect(leerXLSX(await conCeldaSuelta("XFD1"))).rejects.toBeInstanceOf(ErrorXLSX);
  });
});

describe("valorCelda", () => {
  it("convierte cada tipo de valor de ExcelJS / converts every ExcelJS value type", () => {
    expect(valorCelda(null)).toBeNull();
    expect(valorCelda(undefined)).toBeNull();
    expect(valorCelda("  texto ")).toBe("texto");
    expect(valorCelda("   ")).toBeNull();
    expect(valorCelda(3.5)).toBe(3.5);
    expect(valorCelda(true)).toBe("true");
    expect(valorCelda({ formula: "A1", result: 7 })).toBe(7);
    expect(valorCelda({ sharedFormula: "A1", result: "x" })).toBe("x");
    expect(valorCelda({ formula: "A1" })).toBeNull();
    expect(valorCelda({ richText: [{ text: "a" }, { text: "b" }] })).toBe("ab");
    expect(valorCelda({ text: "enlace", hyperlink: "https://example.com" })).toBe("enlace");
    expect(valorCelda({ error: "#N/A" })).toBeNull();
    const fecha = new Date(Date.UTC(2026, 0, 31));
    expect(valorCelda(fecha)).toEqual(fecha);
  });
});

// ES: ZIP mínimo a mano: una entrada del directorio central que DECLARA
//     `tam` bytes descomprimidos, y el registro de fin de directorio.
// EN: Hand-made minimal ZIP: one central directory entry that DECLARES `tam`
//     uncompressed bytes, and the end-of-directory record.
function zipFalso(tam: number): Uint8Array {
  const cd = new Uint8Array(46 + 1);
  const v = new DataView(cd.buffer);
  v.setUint32(0, 0x02014b50, true);
  v.setUint32(24, tam, true);
  v.setUint16(28, 1, true);
  cd[46] = 0x61;
  const fin = new Uint8Array(22);
  const w = new DataView(fin.buffer);
  w.setUint32(0, 0x06054b50, true);
  w.setUint16(8, 1, true);
  w.setUint16(10, 1, true);
  w.setUint32(12, cd.length, true);
  w.setUint32(16, 4, true);
  const cabecera = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  return new Uint8Array([...cabecera, ...cd, ...fin]);
}

describe("tamaño descomprimido / uncompressed size", () => {
  it("suma lo que declara un libro real / adds up what a real workbook declares", async () => {
    const t = tamanoDescomprimido(new Uint8Array(await libroDePrueba()));
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(MAX_DESCOMPRIMIDO);
  });

  it("lee el directorio central de un ZIP hecho a mano / reads the central directory of a hand-made ZIP", () => {
    expect(tamanoDescomprimido(zipFalso(1234))).toBe(1234);
    expect(tamanoDescomprimido(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("rechaza antes de abrir un libro que se descomprimiría enorme / rejects before opening a workbook that would decompress huge", async () => {
    await expect(leerXLSX(zipFalso(MAX_DESCOMPRIMIDO + 1))).rejects.toEqual(new ErrorXLSX("bytes"));
    await expect(leerXLSX(zipFalso(0xffffffff))).rejects.toThrow("ZIP");
  }); // prettier-ignore
});
