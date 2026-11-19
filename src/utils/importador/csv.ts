/* =============================================================================
 * csv.ts — Lector de CSV de extractos / Statement CSV reader
 * -----------------------------------------------------------------------------
 * ES: Lector de CSV propio y sin dependencias para los extractos bancarios.
 *     Cubre lo que traen los bancos españoles:
 *       - Separador `;` (el habitual, porque la coma es el decimal), `,` o
 *         tabulador, detectado solo o forzado por el perfil del banco.
 *       - Celdas entre comillas con el separador o saltos de línea dentro y
 *         comillas dobladas ("") como comilla literal (RFC 4180).
 *       - BOM al principio y finales de línea CRLF, LF o CR.
 *     Devuelve una matriz de texto (filas × celdas). Las celdas sin comillas se
 *     recortan; las entrecomilladas se dejan tal cual. Las líneas vacías (o
 *     solo con espacios) se saltan. Una comilla sin cerrar no rompe la lectura:
 *     lo que queda del fichero va a esa celda y la vista previa lo marcará.
 * EN: Dependency-free CSV reader for bank statements. It covers what Spanish
 *     banks produce:
 *       - `;` separator (the usual one, because the comma is the decimal mark),
 *         `,` or tab, detected automatically or forced by the bank profile.
 *       - Quoted cells holding the separator or line breaks, and doubled quotes
 *         ("") as a literal quote (RFC 4180).
 *       - BOM at the start and CRLF, LF or CR line endings.
 *     Returns a text matrix (rows × cells). Unquoted cells are trimmed; quoted
 *     ones are kept as they are. Empty lines (or blanks only) are skipped. An
 *     unclosed quote does not break reading: the rest of the file goes into
 *     that cell and the preview will flag it.
 * ===========================================================================*/

// ES: Separadores admitidos. / EN: Supported separators.
export type SeparadorCSV = ";" | "," | "\t";

// ES: Opciones de lectura: separador forzado (si no, se detecta).
// EN: Reading options: forced separator (otherwise it is detected).
export interface OpcionesCSV {
  separador?: SeparadorCSV;
}

// ES: Candidatos en orden de preferencia en caso de empate.
// EN: Candidates in order of preference when tied.
const CANDIDATOS: SeparadorCSV[] = [";", "\t", ","];

// ES: Cuenta cuántas veces sale `sep` fuera de comillas en cada una de las
//     primeras líneas lógicas (hasta 20). Sirve para elegir el separador.
// EN: Counts how many times `sep` appears outside quotes in each of the first
//     logical lines (up to 20). Used to choose the separator.
function conteosPorLinea(texto: string, sep: string): number[] {
  const conteos: number[] = [];
  let actual = 0;
  let enComillas = false;
  let lineaConContenido = false;
  for (let i = 0; i < texto.length && conteos.length < 20; i++) {
    const c = texto[i];
    if (c === '"') enComillas = !enComillas;
    else if (!enComillas && (c === "\n" || c === "\r")) {
      if (lineaConContenido) conteos.push(actual);
      actual = 0;
      lineaConContenido = false;
      continue;
    } else if (!enComillas && c === sep) actual++;
    if (c.trim() !== "") lineaConContenido = true;
  }
  if (lineaConContenido && conteos.length < 20) conteos.push(actual);
  return conteos;
}

// ES: Elige el separador: el que aparece en más líneas con el mismo número de
//     veces (columnas constantes) y, a igualdad, el que más columnas da. Los
//     extractos con líneas de preámbulo (titular, periodo…) solo restan algo
//     de constancia, no cambian el ganador. Si ninguno aparece, `;`.
// EN: Chooses the separator: the one appearing the same number of times in
//     the most lines (steady column count) and, when tied, the one giving more
//     columns. Statements with preamble lines (holder, period…) only lose a
//     bit of steadiness, they do not change the winner. If none appears, `;`.
export function detectarSeparador(texto: string): SeparadorCSV {
  let mejor: SeparadorCSV = ";";
  let mejorLineas = 0;
  let mejorColumnas = 0;
  for (const sep of CANDIDATOS) {
    const conteos = conteosPorLinea(texto.replace(/^\ufeff/, ""), sep).filter((n) => n > 0);
    if (!conteos.length) continue;
    // ES: Moda: el número de separadores más repetido y en cuántas líneas sale.
    // EN: Mode: the most repeated separator count and in how many lines it shows.
    const frecuencia = new Map<number, number>();
    for (const n of conteos) frecuencia.set(n, (frecuencia.get(n) ?? 0) + 1);
    let moda = 0;
    let lineas = 0;
    for (const [n, veces] of frecuencia) {
      if (veces > lineas || (veces === lineas && n > moda)) {
        moda = n;
        lineas = veces;
      }
    }
    if (lineas > mejorLineas || (lineas === mejorLineas && moda > mejorColumnas)) {
      mejor = sep;
      mejorLineas = lineas;
      mejorColumnas = moda;
    }
  }
  return mejor;
}

// ES: Lee el CSV completo a una matriz de texto. Máquina de estados de un solo
//     recorrido: dentro o fuera de comillas, acumulando la celda actual.
// EN: Reads the whole CSV into a text matrix. Single-pass state machine:
//     inside or outside quotes, accumulating the current cell.
export function leerCSV(texto: string, opciones: OpcionesCSV = {}): string[][] {
  const fuente = texto.replace(/^\ufeff/, "");
  const sep = opciones.separador ?? detectarSeparador(fuente);
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  // ES: La celda actual empezó con comilla (no se recorta al cerrarla).
  // EN: The current cell started with a quote (it is not trimmed when closed).
  let entrecomillada = false;
  let enComillas = false;
  // ES: La fila tiene algo (texto, comillas o separadores); si no, se salta.
  // EN: The row holds something (text, quotes or separators); otherwise skipped.
  let filaConContenido = false;

  // ES: Cierra la celda actual y la añade a la fila.
  // EN: Closes the current cell and appends it to the row.
  const cerrarCelda = () => {
    fila.push(entrecomillada ? celda : celda.trim());
    celda = "";
    entrecomillada = false;
  };
  // ES: Cierra la fila; se descarta si es una línea vacía o solo con espacios.
  // EN: Closes the row; it is dropped if it is an empty or blank-only line.
  const cerrarFila = () => {
    cerrarCelda();
    if (filaConContenido) filas.push(fila);
    fila = [];
    filaConContenido = false;
  };

  for (let i = 0; i < fuente.length; i++) {
    const c = fuente[i];
    if (enComillas) {
      if (c === '"') {
        // ES: "" dentro de comillas es una comilla literal.
        // EN: "" inside quotes is a literal quote.
        if (fuente[i + 1] === '"') {
          celda += '"';
          i++;
        } else enComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"' && !entrecomillada && celda.trim() === "") {
      // ES: Comilla de apertura (se ignoran los espacios previos).
      // EN: Opening quote (leading spaces are ignored).
      celda = "";
      enComillas = true;
      entrecomillada = true;
      filaConContenido = true;
    } else if (c === sep) {
      cerrarCelda();
      filaConContenido = true;
    } else if (c === "\n" || c === "\r") {
      // ES: CRLF cuenta como un solo salto. / EN: CRLF counts as a single break.
      if (c === "\r" && fuente[i + 1] === "\n") i++;
      cerrarFila();
    } else if (!(entrecomillada && c.trim() === "")) {
      // ES: Texto normal (tras cerrar comillas solo se ignoran espacios).
      // EN: Normal text (after closing quotes only spaces are ignored).
      celda += c;
      if (c.trim() !== "") filaConContenido = true;
    }
  }
  // ES: Última fila sin salto final. / EN: Last row without a final break.
  cerrarFila();
  return filas;
}
