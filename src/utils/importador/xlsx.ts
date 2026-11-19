/* =============================================================================
 * xlsx.ts — Lector de XLSX de extractos / Statement XLSX reader
 * -----------------------------------------------------------------------------
 * ES: Lee una hoja de un libro .xlsx (lo que descargan muchos bancos como
 *     "Excel") y la devuelve como matriz de celdas simples, igual que leerCSV:
 *       - texto recortado (o null si queda vacío), número, Date o null;
 *       - fórmulas -> su resultado guardado; texto enriquecido -> texto plano;
 *         enlaces -> su texto; errores de celda (#N/A…) -> null;
 *       - filas totalmente vacías, fuera; todas las filas con el mismo ancho
 *         (el número de columnas de la hoja).
 *     ExcelJS es pesado: se carga con import() dinámico, como en export.ts, para
 *     que Vite lo saque a un trozo aparte que solo se descarga al importar.
 *     Las fechas de ExcelJS llegan como Date a medianoche UTC: se devuelven tal
 *     cual y analizarFecha (fecha.ts) las lee con getUTC*.
 * EN: Reads one sheet of an .xlsx workbook (what many banks download as
 *     "Excel") and returns it as a matrix of plain cells, like leerCSV:
 *       - trimmed text (or null if it ends up empty), number, Date or null;
 *       - formulas -> their stored result; rich text -> plain text; hyperlinks
 *         -> their text; cell errors (#N/A…) -> null;
 *       - fully empty rows dropped; every row with the same width (the sheet's
 *         column count).
 *     ExcelJS is heavy: it is loaded with a dynamic import(), as in export.ts,
 *     so Vite splits it into a separate chunk only fetched when importing.
 *     ExcelJS dates arrive as Date at UTC midnight: they are returned as they
 *     are and analizarFecha (fecha.ts) reads them with getUTC*.
 * ===========================================================================*/

// ES: Celda simple de un extracto (CSV da siempre texto; XLSX, de todo).
// EN: Plain statement cell (CSV always gives text; XLSX, anything).
export type Celda = string | number | Date | null;

// ES: Opciones: hoja por nombre o por índice (0 = la primera, por defecto).
// EN: Options: sheet by name or by index (0 = the first one, by default).
export interface OpcionesXLSX {
  hoja?: string | number;
}

// ES: Carga ExcelJS bajo demanda (ver cabecera).
// EN: Loads ExcelJS on demand (see header).
async function cargarExcelJS() {
  return (await import("exceljs")).default;
}

// ES: Convierte un valor de celda de ExcelJS (CellValue) en una Celda simple.
//     Se tipa como unknown para cubrir también formas que el tipo no recoge.
// EN: Turns an ExcelJS cell value (CellValue) into a plain Celda. Typed as
//     unknown to also cover shapes the type does not list.
export function valorCelda(v: unknown): Celda {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // ES: Fórmula (normal o compartida): vale su resultado guardado.
    // EN: Formula (plain or shared): its stored result counts.
    if ("formula" in o || "sharedFormula" in o) return valorCelda(o.result);
    // ES: Texto enriquecido: se juntan sus trozos.
    // EN: Rich text: its runs are joined.
    if (Array.isArray(o.richText)) {
      return valorCelda(
        o.richText.map((r) => (r && typeof r === "object" ? String(r.text ?? "") : "")).join("")
      );
    }
    // ES: Enlace: su texto visible (que a su vez puede ser enriquecido).
    // EN: Hyperlink: its visible text (which may itself be rich text).
    if ("hyperlink" in o || "text" in o) return valorCelda(o.text);
    // ES: Error de celda (#N/A, #DIV/0!…): sin valor.
    // EN: Cell error (#N/A, #DIV/0!…): no value.
    if ("error" in o) return null;
  }
  return null;
}

// ES: Lee la hoja pedida del libro a una matriz de celdas simples. Lanza si el
//     fichero no es un .xlsx válido o la hoja no existe.
// EN: Reads the requested sheet of the workbook into a matrix of plain cells.
//     Throws if the file is not a valid .xlsx or the sheet does not exist.
export async function leerXLSX(
  datos: ArrayBuffer | Uint8Array,
  opciones: OpcionesXLSX = {}
): Promise<Celda[][]> {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  await libro.xlsx.load(bytes as unknown as ArrayBuffer);

  // ES: Hoja por nombre o por posición en el libro (no por su id interno).
  // EN: Sheet by name or by position in the workbook (not by its inner id).
  const pedida = opciones.hoja ?? 0;
  const hoja = typeof pedida === "string" ? libro.getWorksheet(pedida) : libro.worksheets[pedida];
  if (!hoja) throw new Error(`Hoja no encontrada / Sheet not found: ${String(pedida)}`);

  const ancho = hoja.columnCount;
  const filas: Celda[][] = [];
  for (let r = 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r);
    const celdas: Celda[] = [];
    for (let c = 1; c <= ancho; c++) celdas.push(valorCelda(fila.getCell(c).value));
    // ES: Filas totalmente vacías, fuera (como las líneas vacías del CSV).
    // EN: Fully empty rows dropped (like empty CSV lines).
    if (celdas.some((x) => x !== null)) filas.push(celdas);
  }
  return filas;
}
