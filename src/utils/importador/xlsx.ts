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

// ES: Entrada del directorio central de un ZIP (lo que hace falta para medir).
// EN: ZIP central directory entry (what is needed to measure it).
interface EntradaZip {
  metodo: number; // ES: 0 = sin comprimir, 8 = deflate / EN: 0 = stored, 8 = deflate
  comprimido: number;
  descomprimido: number;
  local: number; // ES: posición de su cabecera local / EN: position of its local header
}

// ES: Lee el directorio central del ZIP (un .xlsx es un ZIP) o null si no es
//     coherente: el registro de fin tiene que cerrar el fichero (su comentario
//     llega justo al final, así una firma dentro del comentario no engaña),
//     el directorio tiene que caber antes de ese registro y cada entrada,
//     con su nombre, extra y comentario, tiene que caber en el directorio.
//     ZIP64 (tamaños 0xFFFFFFFF) no se admite.
// EN: Reads the ZIP central directory (an .xlsx is a ZIP) or null if it is
//     not consistent: the end record must close the file (its comment reaches
//     exactly the end, so a signature inside the comment does not fool it),
//     the directory must fit before that record and every entry, with its
//     name, extra and comment, must fit in the directory. ZIP64 (0xFFFFFFFF
//     sizes) is not supported.
function entradasZip(datos: Uint8Array): { entradas: EntradaZip[]; inicioDir: number } | null {
  const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  let fin = -1;
  for (let i = datos.length - 22; i >= Math.max(0, datos.length - 65557); i--) {
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === datos.length
    ) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;
  const total = v.getUint16(fin + 10, true);
  const tamDir = v.getUint32(fin + 12, true);
  const inicioDir = v.getUint32(fin + 16, true);
  // ES: El directorio va justo antes del registro de fin, sin hueco: así no
  //     puede haber cabeceras centrales de más que otro lector (JSZip recorre
  //     mientras encuentra firmas) leería y esta cuenta no.
  // EN: The directory sits right before the end record, with no gap: so there
  //     cannot be extra central headers that another reader (JSZip walks
  //     while it finds signatures) would read and this count would not.
  if (total === 0xffff || inicioDir === 0xffffffff || inicioDir + tamDir !== fin) return null;
  const finDir = inicioDir + tamDir;
  const entradas: EntradaZip[] = [];
  let pos = inicioDir;
  for (let n = 0; n < total; n++) {
    if (pos + 46 > finDir || v.getUint32(pos, true) !== 0x02014b50) return null;
    const largo =
      46 + v.getUint16(pos + 28, true) + v.getUint16(pos + 30, true) + v.getUint16(pos + 32, true);
    if (pos + largo > finDir) return null;
    const e: EntradaZip = {
      metodo: v.getUint16(pos + 10, true),
      comprimido: v.getUint32(pos + 20, true),
      descomprimido: v.getUint32(pos + 24, true),
      local: v.getUint32(pos + 42, true),
    };
    if (e.comprimido === 0xffffffff || e.descomprimido === 0xffffffff) return null;
    entradas.push(e);
    pos += largo;
  }
  // ES: Las entradas declaradas llenan el directorio entero. / EN: The declared entries fill the whole directory.
  if (pos !== finDir) return null;
  return { entradas, inicioDir };
}

// ES: Suma de los tamaños descomprimidos que DECLARA el directorio central,
//     o null si el ZIP no es coherente (ver entradasZip). Primer filtro,
//     barato, antes de descomprimir nada.
// EN: Sum of the uncompressed sizes the central directory DECLARES, or null
//     if the ZIP is not consistent (see entradasZip). First, cheap filter
//     before decompressing anything.
export function tamanoDescomprimido(datos: Uint8Array): number | null {
  const zip = entradasZip(datos);
  return zip ? zip.entradas.reduce((a, e) => a + e.descomprimido, 0) : null;
}

// ES: Bytes que salen DE VERDAD al descomprimir todas las entradas, cortando
//     en cuanto se pasa de `max` ("excede"); null si el ZIP no es coherente,
//     sus datos invaden el directorio, usa un método que no es "sin
//     comprimir" ni deflate o falla al descomprimir. Así un ZIP que
//     miente en sus tamaños tampoco llega a ExcelJS. Usa DecompressionStream
//     ("deflate-raw"), que tienen WebView2 y Node.
// EN: Bytes that REALLY come out when decompressing every entry, stopping as
//     soon as `max` is passed ("excede"); null if the ZIP is not consistent,
//     its data overlaps the directory, it uses a method other than stored or
//     deflate or decompression fails. So a ZIP lying
//     about its sizes does not reach ExcelJS either. Uses DecompressionStream
//     ("deflate-raw"), available in WebView2 and Node.
export async function descomprimidoReal(
  datos: Uint8Array,
  max: number
): Promise<number | "excede" | null> {
  const zip = entradasZip(datos);
  if (!zip) return null;
  // ES: Los datos de cada entrada tienen que ir antes del directorio central.
  // EN: Each entry's data must sit before the central directory.
  const { entradas, inicioDir: finDatos } = zip;
  const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  let total = 0;
  for (const e of entradas) {
    if (e.local + 30 > finDatos || v.getUint32(e.local, true) !== 0x04034b50) return null;
    const inicio = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
    if (inicio + e.comprimido > finDatos) return null;
    const trozo = datos.subarray(inicio, inicio + e.comprimido);
    if (e.metodo === 0) {
      total += trozo.length;
      if (total > max) return "excede";
      continue;
    }
    if (e.metodo !== 8) return null;
    // ES: Crear el flujo y leerlo, todo dentro del try: cualquier fallo es un
    //     ZIP no válido (null), distinto de pasarse del tope ("excede").
    // EN: Creating and reading the stream, all inside the try: any failure is
    //     an invalid ZIP (null), unlike going over the cap ("excede").
    try {
      const lector = new Blob([trozo as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))
        .getReader();
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.length;
        if (total > max) {
          await lector.cancel().catch(() => {});
          return "excede";
        }
      }
    } catch {
      return null;
    }
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
  // ES: Y lo que sale de verdad al descomprimir, con el mismo tope.
  // EN: And what really comes out when decompressing, with the same cap.
  const real = await descomprimidoReal(bytes, MAX_DESCOMPRIMIDO);
  if (real === "excede") throw new ErrorXLSX("bytes");
  if (real === null) throw new Error("ZIP no válido / Invalid ZIP");
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
