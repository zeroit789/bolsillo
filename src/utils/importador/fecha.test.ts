/* =============================================================================
 * fecha.test.ts — Tests de fechas de extractos / Statement date tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba analizarFecha (dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd, fechas con
 *     hora, fechas de ExcelJS y números de serie de Excel) con validación de
 *     calendario real, y sugerirOrdenFecha a partir de unas muestras.
 *     Todos los datos son inventados.
 * EN: Checks analizarFecha (dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, dates with a
 *     time, ExcelJS dates and Excel serial numbers) with real calendar
 *     validation, and sugerirOrdenFecha from a few samples.
 *     All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { analizarFecha, sugerirOrdenFecha } from "./fecha";

describe("analizarFecha día-mes-año / day-month-year", () => {
  it("formatos habituales / usual formats", () => {
    expect(analizarFecha("01/02/2026", "dma")).toBe("2026-02-01");
    expect(analizarFecha("1/2/2026", "dma")).toBe("2026-02-01");
    expect(analizarFecha("01-02-26", "dma")).toBe("2026-02-01");
    expect(analizarFecha("01.02.2026", "dma")).toBe("2026-02-01");
    expect(analizarFecha(" 31/12/2025 ", "dma")).toBe("2025-12-31");
  });

  it("año de dos cifras: siempre 20aa / two-digit year: always 20yy", () => {
    expect(analizarFecha("15/03/99", "dma")).toBe("2099-03-15");
    expect(analizarFecha("15/03/00", "dma")).toBe("2000-03-15");
  });

  it("con hora detrás / with a time after it", () => {
    expect(analizarFecha("01/02/2026 10:30", "dma")).toBe("2026-02-01");
  });

  it("valida el calendario / validates the calendar", () => {
    expect(analizarFecha("29/02/2028", "dma")).toBe("2028-02-29");
    expect(analizarFecha("29/02/2026", "dma")).toBeNull();
    expect(analizarFecha("31/04/2026", "dma")).toBeNull();
    expect(analizarFecha("00/01/2026", "dma")).toBeNull();
    expect(analizarFecha("10/13/2026", "dma")).toBeNull();
    expect(analizarFecha("29/02/2100", "dma")).toBeNull();
    expect(analizarFecha("29/02/2000", "dma")).toBe("2000-02-29");
  });

  it("separadores mezclados o basura / mixed separators or garbage", () => {
    expect(analizarFecha("01/02-2026", "dma")).toBeNull();
    expect(analizarFecha("2026-02-01", "dma")).toBeNull();
    expect(analizarFecha("hoy", "dma")).toBeNull();
    expect(analizarFecha("", "dma")).toBeNull();
    expect(analizarFecha(null, "dma")).toBeNull();
  });
});

describe("analizarFecha año-mes-día / year-month-day", () => {
  it("ISO y variantes / ISO and variants", () => {
    expect(analizarFecha("2026-02-01", "amd")).toBe("2026-02-01");
    expect(analizarFecha("2026/2/1", "amd")).toBe("2026-02-01");
    expect(analizarFecha("2026-02-01T23:59:00", "amd")).toBe("2026-02-01");
    expect(analizarFecha("2026-02-30", "amd")).toBeNull();
    expect(analizarFecha("01/02/2026", "amd")).toBeNull();
  });
});

describe("analizarFecha con valores de hoja de cálculo / with spreadsheet values", () => {
  it("Date de ExcelJS (medianoche UTC) / ExcelJS Date (UTC midnight)", () => {
    expect(analizarFecha(new Date(Date.UTC(2026, 1, 1)), "dma")).toBe("2026-02-01");
  });

  it("Date no válido / invalid Date", () => {
    expect(analizarFecha(new Date("x"), "dma")).toBeNull();
  });

  it("número de serie de Excel / Excel serial number", () => {
    // ES: 46054 es el 1 de febrero de 2026 en el sistema de 1900.
    // EN: 46054 is 1 February 2026 in the 1900 system.
    expect(analizarFecha(46054, "dma")).toBe("2026-02-01");
    expect(analizarFecha(46054.75, "amd")).toBe("2026-02-01");
    expect(analizarFecha(-3, "dma")).toBeNull();
    expect(analizarFecha(Number.NaN, "dma")).toBeNull();
  });
});

describe("sugerirOrdenFecha", () => {
  it("elige el orden con el que se leen todas las muestras / chooses the order all samples read with", () => {
    expect(sugerirOrdenFecha(["01/02/2026", "28/02/2026"])).toBe("dma");
    expect(sugerirOrdenFecha(["2026-02-01", "2026-02-28"])).toBe("amd");
  });

  it("ignora vacíos y devuelve null si nada encaja / ignores blanks and returns null if nothing fits", () => {
    expect(sugerirOrdenFecha(["", "01/02/2026"])).toBe("dma");
    expect(sugerirOrdenFecha(["hola", "01/02/2026"])).toBeNull();
    expect(sugerirOrdenFecha([])).toBeNull();
  });
});
