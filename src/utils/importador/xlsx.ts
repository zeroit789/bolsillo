/* =============================================================================
 * xlsx.ts — Lector de XLSX de extractos / Statement XLSX reader
 * -----------------------------------------------------------------------------
 * ES: Lee una hoja de un libro .xlsx (lo que descargan muchos bancos como
 *     "Excel") y la devuelve como matriz de celdas simples, igual que leerCSV:
 *       - texto recortado (o null si queda vacío), número, Date o null;
 *       - fórmulas -> su resultado guardado; texto enriquecido -> texto plano;
 *         enlaces -> su texto; errores de celda (#N/A…) -> null;
 *       - filas totalmente vacías, fuera; todas las filas con el mismo ancho
 *         (hasta la última columna con contenido), con topes de tamaño.
 *     ExcelJS es pesado: se carga con import() dinámico, como en export.ts, para
 *     que Vite lo saque a un trozo aparte que solo se descarga al importar.
 *     Las fechas de ExcelJS llegan como Date a medianoche UTC: se devuelven tal
 *     cual y analizarFecha (fecha.ts) las lee con getUTC*.
 * EN: Reads one sheet of an .xlsx workbook (what many banks download as
 *     "Excel") and returns it as a matrix of plain cells, like leerCSV:
 *       - trimmed text (or null if it ends up empty), number, Date or null;
 *       - formulas -> their stored result; rich text -> plain text; hyperlinks
 *         -> their text; cell errors (#N/A…) -> null;
 *       - fully empty rows dropped; every row with the same width (up to the
 *         last column with content), with size caps.
 *     ExcelJS is heavy: it is loaded with a dynamic import(), as in export.ts,
 *     so Vite splits it into a separate chunk only fetched when importing.
 *     ExcelJS dates arrive as Date at UTC midnight: they are returned as they
 *     are and analizarFecha (fecha.ts) reads them with getUTC*.
 * ===========================================================================*/

// ES: Celda simple de un extracto (CSV da siempre texto; XLSX, de todo).
// EN: Plain statement cell (CSV always gives text; XLSX, anything).
export type Celda = string | number | Date | null;

// ES: Topes de tamaño: un extracto real cabe de sobra; una hoja más grande
//     (o con una celda perdida en la columna XFD) se rechaza en vez de
//     bloquear la app reservando millones de celdas.
// EN: Size caps: a real statement fits easily; a bigger sheet (or one with a
//     stray cell in column XFD) is rejected instead of freezing the app while
//     allocating millions of cells.
export const MAX_COLUMNAS = 64;
export const MAX_FILAS = 50_000;
export const MAX_BYTES = 20 * 1024 * 1024; // ES: 20 MB / EN: 20 MB
// ES: Tope de lo que DECLARA el ZIP descomprimido (ver tamanoDescomprimido).
// EN: Cap on what the ZIP DECLARES uncompressed (see tamanoDescomprimido).
export const MAX_DESCOMPRIMIDO = 150 * 1024 * 1024;

// ES: Error de hoja demasiado grande (por columnas o por filas).
// EN: Too-large sheet error (by columns or by rows).
export class ErrorXLSX extends Error {
  constructor(public readonly motivo: "columnas" | "filas" | "bytes") {
    super(`Hoja demasiado grande (${motivo}) / Sheet too large (${motivo})`);
    this.name = "ErrorXLSX";
  }
}

// ES: Opciones: hoja por nombre o por índice (0 = la primera, por defecto).
// EN: Options: sheet by name or by index (0 = the first one, by default).
export interface OpcionesXLSX {
  hoja?: string | number;
}

// ES: Suma de los tamaños descomprimidos que declara el directorio central
//     del ZIP (un .xlsx es un ZIP), o null si no se encuentra o es ZIP64.
//     Así un libro pequeño que se descomprimiría en cientos de MB se rechaza
//     ANTES de que ExcelJS lo descomprima en memoria. Es una defensa parcial:
//     se fía de lo que declara el fichero.
// EN: Sum of the uncompressed sizes the ZIP central directory declares (an
//     .xlsx is a ZIP), or null if it cannot be found or is ZIP64. So a small
//     workbook that would decompress into hundreds of MB is rejected BEFORE
//     ExcelJS decompresses it in memory. It is a partial defence: it trusts
//     what the file declares.
export function tamanoDescomprimido(datos: Uint8Array): number | null {
  const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  // ES: Fin del directorio central: firma 0x06054b50 en los últimos 64 KB + 22.
  // EN: End of central directory: signature 0x06054b50 in the last 64 KB + 22.
  let fin = -1;
  for (let i = datos.length - 22; i >= Math.max(0, datos.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;
  const entradas = v.getUint16(fin + 10, true);
  let pos = v.getUint32(fin + 16, true);
  if (entradas === 0xffff || pos === 0xffffffff) return null;
  let total = 0;
  for (let n = 0; n < entradas; n++) {
    if (pos + 46 > datos.length || v.getUint32(pos, true) !== 0x02014b50) return null;
    const tam = v.getUint32(pos + 24, true);
    if (tam === 0xffffffff) return null;
    total += tam;
    pos +=
      46 + v.getUint16(pos + 28, true) + v.getUint16(pos + 30, true) + v.getUint16(pos + 32, true);
  }
  return total;
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
  // ES: Un fichero enorme ni se abre: cargarlo ya bloquearía la app.
  // EN: A huge file is not even opened: loading it would already freeze the app.
  if (datos.byteLength > MAX_BYTES) throw new ErrorXLSX("bytes");
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  // ES: Ni se descomprime un libro que declara más de MAX_DESCOMPRIMIDO; si
  //     su tamaño no se puede leer (ZIP64 o directorio roto), no es válido.
  // EN: A workbook declaring more than MAX_DESCOMPRIMIDO is not even
  //     decompressed; if its size cannot be read (ZIP64 or a broken
  //     directory), it is not valid.
  const descomprimido = tamanoDescomprimido(bytes);
  if (descomprimido === null) throw new Error("ZIP no válido / Invalid ZIP");
  if (descomprimido > MAX_DESCOMPRIMIDO) throw new ErrorXLSX("bytes");
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes as unknown as ArrayBuffer);

  // ES: Hoja por nombre o por posición en el libro (no por su id interno).
  // EN: Sheet by name or by position in the workbook (not by its inner id).
  const pedida = opciones.hoja ?? 0;
  const hoja = typeof pedida === "string" ? libro.getWorksheet(pedida) : libro.worksheets[pedida];
  if (!hoja) throw new Error(`Hoja no encontrada / Sheet not found: ${String(pedida)}`);

  // ES: Solo se recorren filas y celdas CON contenido (eachRow/eachCell), así
  //     una celda suelta en la fila 900.000 no obliga a recorrer el hueco. Se
  //     guardan dispersas y luego se rellenan al ancho real con null.
  // EN: Only rows and cells WITH content are walked (eachRow/eachCell), so a
  //     stray cell on row 900,000 does not force walking the gap. They are
  //     stored sparse and then padded with null to the real width.
  const dispersas: Map<number, Celda>[] = [];
  let ancho = 0;
  hoja.eachRow((fila) => {
    const celdas = new Map<number, Celda>();
    fila.eachCell((celda, columna) => {
      const v = valorCelda(celda.value);
      if (v === null) return;
      // ES: Se corta en cuanto se pasa un tope, sin seguir acumulando.
      // EN: Stop as soon as a cap is exceeded, without accumulating further.
      if (columna > MAX_COLUMNAS) throw new ErrorXLSX("columnas");
      celdas.set(columna, v);
      ancho = Math.max(ancho, columna);
    });
    // ES: Filas sin nada útil, fuera (como las líneas vacías del CSV).
    // EN: Rows with nothing useful dropped (like empty CSV lines).
    if (celdas.size) dispersas.push(celdas);
    if (dispersas.length > MAX_FILAS) throw new ErrorXLSX("filas");
  });
  return dispersas.map((celdas) =>
    Array.from({ length: ancho }, (_, i) => celdas.get(i + 1) ?? null)
  );
}
