/* =============================================================================
 * export.test.ts — Tests de la exportación / Export tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba lo que se escribe al exportar. Se simulan (mock) el diálogo de
 *     guardar de Tauri y el comando Rust `guardar_archivo` para capturar los
 *     bytes que llegarían a disco: CSV del historial (BOM, separador ';', coma
 *     decimal, escapado), XLSX del mes (se vuelve a abrir con ExcelJS) y PDF.
 * EN: Checks what gets written on export. Tauri's save dialog and the Rust
 *     `guardar_archivo` command are mocked to capture the bytes that would
 *     reach disk: history CSV (BOM, ';' separator, decimal comma, escaping),
 *     month XLSX (reopened with ExcelJS) and PDF.
 * ===========================================================================*/
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { ResumenMes } from "../stores/finanzas";
import type { LineaMes } from "../types";
import { exportarHistorialCSV, exportarHistorialPDF, exportarMesXLSX } from "./export";

// ES: Sustituye las APIs de Tauri (no existen fuera de la app de escritorio).
// EN: Replace the Tauri APIs (they do not exist outside the desktop app).
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// ES: Devuelve los bytes que la exportación mandó al comando Rust.
// EN: Returns the bytes the export sent to the Rust command.
function bytesEscritos(): Uint8Array {
  const llamada = vi.mocked(invoke).mock.calls[0];
  expect(llamada[0]).toBe("guardar_archivo");
  const args = llamada[1] as { ruta: string; contenido: number[] };
  return Uint8Array.from(args.contenido);
}

// ES: Dos meses de historial; el segundo con importes negativos y decimales.
// EN: Two months of history; the second one with negative and decimal amounts.
const historial: ResumenMes[] = [
  {
    mes: "2026-01",
    ingresos: 1500,
    gastosFijos: 700,
    gastosVariables: 80.5,
    totalGastos: 780.5,
    disponible: 719.5,
  },
  {
    mes: "2026-02",
    ingresos: 0,
    gastosFijos: 1234.567,
    gastosVariables: 0,
    totalGastos: 1234.567,
    disponible: -1234.567,
  },
];

beforeEach(() => {
  vi.mocked(save).mockReset().mockResolvedValue("C:/tmp/salida");
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
});

describe("exportarHistorialCSV", () => {
  it("genera el CSV con BOM, ';' y coma decimal / builds the CSV with BOM, ';' and decimal comma", async () => {
    await exportarHistorialCSV(historial);

    expect(vi.mocked(save).mock.calls[0][0]).toMatchObject({
      defaultPath: "Bolsillo - Historial.csv",
    });
    const texto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytesEscritos());
    expect(texto.startsWith("\uFEFF")).toBe(true);
    expect(texto.slice(1).split("\r\n")).toEqual([
      "Mes;Ingresos;Gastos fijos;Gastos variables;Total gastos;Disponible",
      "2026-01;1500,00;700,00;80,50;780,50;719,50",
      "2026-02;0,00;1234,57;0,00;1234,57;-1234,57",
    ]);
  });

  it("escapa los campos con ';' o comillas (RFC 4180) / escapes fields with ';' or quotes", async () => {
    await exportarHistorialCSV([{ ...historial[0], mes: 'raro;"mes"' }]);
    const texto = new TextDecoder().decode(bytesEscritos());
    expect(texto).toContain('"raro;""mes"""');
  });

  it("si se cancela el diálogo no escribe nada / writes nothing if the dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    await exportarHistorialCSV(historial);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("exportarMesXLSX", () => {
  it("el .xlsx se puede volver a abrir con sus datos / the .xlsx reopens with its data", async () => {
    const lineas: LineaMes[] = [
      {
        id: "r1",
        origen: "recurrente",
        concepto: "Nómina",
        categoria: "Nómina",
        signo: "ingreso",
        importe: 1500,
        fijo: true,
      },
      {
        id: "p1",
        origen: "puntual",
        concepto: "Súper",
        categoria: "Comida",
        signo: "gasto",
        importe: 80.5,
        fijo: false,
        fecha: "2026-01-10",
      },
    ];
    await exportarMesXLSX(
      "enero de 2026",
      lineas,
      historial[0],
      [],
      [{ id: "pl1", nombre: "Vacaciones", objetivo: 900, aportado: 150 }]
    );

    // ES: Reabre el libro escrito y busca filas concretas.
    // EN: Reopen the written workbook and look for specific rows.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytesEscritos().buffer as ArrayBuffer);
    const hoja = wb.getWorksheet("Movimientos");
    expect(hoja).toBeDefined();
    const filas: unknown[][] = [];
    hoja!.eachRow((fila) => filas.push((fila.values as unknown[]).slice(1)));

    expect(filas[0]).toEqual(["Concepto", "Categoría", "Tipo", "Importe (€)"]);
    expect(filas).toContainEqual(["Nómina", "Nómina", "Ingreso", 1500]);
    expect(filas).toContainEqual(["Súper", "Comida", "Gasto variable", 80.5]);
    expect(filas.some((f) => f[0] === "Vacaciones" && f[1] === 900 && f[2] === 150)).toBe(true);
  });
});

describe("exportarHistorialPDF", () => {
  it("genera un PDF válido / produces a valid PDF", async () => {
    await exportarHistorialPDF(historial);
    const cabecera = new TextDecoder().decode(bytesEscritos().slice(0, 5));
    expect(cabecera).toBe("%PDF-");
  });
});
