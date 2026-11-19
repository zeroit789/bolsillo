/* =============================================================================
 * csv.ts — Lector de CSV de extractos / Statement CSV reader
 * -----------------------------------------------------------------------------
 * ES: Lector de CSV propio y sin dependencias para los extractos bancarios.
 *     Cubre lo que traen los bancos españoles:
 *       - Separador `;` (el habitual, porque la coma es el decimal), `,` o
 *         tabulador, detectado solo o forzado por el perfil del banco.
 *       - Celdas entre comillas con el separador o saltos de línea dentro y
 *         comillas dobladas ("") como comilla literal (RFC 4180). Una comilla
 *         solo abre si va al principio de la celda; en mitad de una celda sin
 *         comillas (BAR "PEPE) es texto normal.
 *       - BOM al principio y finales de línea CRLF, LF o CR.
 *     Devuelve una matriz de texto (filas × celdas). Las celdas sin comillas se
 *     recortan; las entrecomilladas se dejan tal cual. Las líneas vacías (o
 *     solo con espacios) se saltan. Una comilla sin cerrar lanza ErrorCSV con
 *     la fila donde empieza: si no, se tragaría en silencio el resto del
 *     fichero y se perderían movimientos.
 *     La detección del separador usa el MISMO recorrido que la lectura, así
 *     que las dos entienden igual las comillas.
 * EN: Dependency-free CSV reader for bank statements. It covers what Spanish
 *     banks produce:
 *       - `;` separator (the usual one, because the comma is the decimal mark),
 *         `,` or tab, detected automatically or forced by the bank profile.
 *       - Quoted cells holding the separator or line breaks, and doubled quotes
 *         ("") as a literal quote (RFC 4180). A quote only opens at the start
 *         of a cell; in the middle of an unquoted cell (BAR "PEPE) it is plain
 *         text.
 *       - BOM at the start and CRLF, LF or CR line endings.
 *     Returns a text matrix (rows × cells). Unquoted cells are trimmed; quoted
 *     ones are kept as they are. Empty lines (or blanks only) are skipped. An
 *     unclosed quote throws ErrorCSV with the row where it starts: otherwise
 *     the rest of the file would be silently swallowed and movements lost.
 *     Separator detection uses the SAME pass as reading, so both understand
 *     quotes the same way.
 * ===========================================================================*/

// ES: Separadores admitidos. / EN: Supported separators.
export type SeparadorCSV = ";" | "," | "\t";

// ES: Opciones de lectura: separador forzado (si no, se detecta).
// EN: Reading options: forced separator (otherwise it is detected).
export interface OpcionesCSV {
  separador?: SeparadorCSV;
}

// ES: Error de formato del CSV; `fila` es la fila (desde 1, en la matriz
//     leída) donde empieza la comilla sin cerrar.
// EN: CSV format error; `fila` is the row (from 1, in the matrix read) where
//     the unclosed quote starts.
export class ErrorCSV extends Error {
  constructor(public readonly fila: number) {
    super(`Comilla sin cerrar en la fila ${fila} / Unclosed quote on row ${fila}`);
    this.name = "ErrorCSV";
  }
}

// ES: Candidatos en orden de preferencia en caso de empate.
// EN: Candidates in order of preference when tied.
const CANDIDATOS: SeparadorCSV[] = [";", "\t", ","];

// ES: Recorrido único que comparten lectura y detección. Lee hasta `limite`
//     filas y dice si terminó dentro de una comilla abierta (y en qué fila).
// EN: Single pass shared by reading and detection. Reads up to `limite` rows
//     and tells whether it ended inside an open quote (and on which row).
function recorrer(
  fuente: string,
  sep: string,
  limite = Number.POSITIVE_INFINITY
): {
  filas: string[][];
  comillaSinCerrar: number | null;
  sueltas: number;
  sueltasPorFila: number[];
} {
  // ES: Comillas fuera de sitio (ver más abajo); sirve para elegir separador.
  // EN: Out-of-place quotes (see below); used to choose the separator.
  let sueltas = 0;
  // ES: Comillas sueltas de cada fila guardada y de la fila en curso.
  // EN: Stray quotes of every stored row and of the current row.
  const sueltasPorFila: number[] = [];
  let sueltasFila = 0;
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
    if (filaConContenido) {
      filas.push(fila);
      sueltasPorFila.push(sueltasFila);
    }
    sueltasFila = 0;
    fila = [];
    filaConContenido = false;
  };

  for (let i = 0; i < fuente.length && filas.length < limite; i++) {
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
      // ES: Comilla de apertura (solo al principio de la celda).
      // EN: Opening quote (only at the start of the cell).
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
      // ES: Texto normal (tras cerrar comillas solo se ignoran espacios). Una
      //     comilla en mitad de una celda o texto tras cerrar comillas cuenta
      //     como "suelta": con el separador bueno casi nunca pasa.
      // EN: Normal text (after closing quotes only spaces are ignored). A
      //     quote in the middle of a cell or text after closing quotes counts
      //     as "stray": with the right separator it almost never happens.
      if ((c === '"' && !entrecomillada) || entrecomillada) {
        sueltas++;
        sueltasFila++;
      }
      celda += c;
      if (c.trim() !== "") filaConContenido = true;
    }
  }
  // ES: Fila donde quedó abierta la comilla (la que se está leyendo).
  // EN: Row where the quote was left open (the one being read).
  const comillaSinCerrar = enComillas ? filas.length + 1 : null;
  if (filas.length < limite) cerrarFila();
  return { filas, comillaSinCerrar, sueltas, sueltasPorFila };
}

// ES: Elige el separador mirando las primeras 20 filas: primero, el que no
//     deja una comilla sin cerrar; luego, el que da el mismo número de
//     celdas (más de una) en más filas sin comillas sueltas; a igualdad, el que deja menos
//     comillas fuera de sitio (el que respeta las celdas entrecomilladas) y,
//     al final, el que más celdas da. Los extractos con líneas de preámbulo (titular,
//     periodo…) solo restan algo de constancia, no cambian el ganador. Si
//     ninguno aparece, `;`.
// EN: Chooses the separator looking at the first 20 rows: first, the one
//     leaving no unclosed quote; then, the one giving the same number of
//     cells (more than one) in the most rows without stray quotes; when tied, the one leaving the
//     fewest out-of-place quotes (the one respecting quoted cells) and, last,
//     the one giving more cells. Statements with preamble lines (holder, period…) only lose a
//     bit of steadiness, they do not change the winner. If none appears, `;`.
export function detectarSeparador(texto: string): SeparadorCSV {
  const fuente = texto.replace(/^\ufeff/, "");
  let mejor: SeparadorCSV = ";";
  let mejorSinCerrar = Number.POSITIVE_INFINITY;
  let mejorSueltas = Number.POSITIVE_INFINITY;
  let mejorFilas = 0;
  let mejorCeldas = 0;
  for (const sep of CANDIDATOS) {
    const recorrido = recorrer(fuente, sep, 20);
    const sinCerrar = recorrido.comillaSinCerrar !== null ? 1 : 0;
    const sueltas = recorrido.sueltas;
    // ES: Una fila con comillas sueltas está mal partida con este separador:
    //     no cuenta para la constancia.
    // EN: A row with stray quotes is badly split by this separator: it does
    //     not count towards steadiness.
    const anchos = recorrido.filas
      .filter((_, i) => recorrido.sueltasPorFila[i] === 0)
      .map((f) => f.length)
      .filter((n) => n > 1);
    // ES: Moda: el ancho más repetido y en cuántas filas sale.
    // EN: Mode: the most repeated width and in how many rows it shows.
    const frecuencia = new Map<number, number>();
    for (const n of anchos) frecuencia.set(n, (frecuencia.get(n) ?? 0) + 1);
    let moda = 0;
    let filas = 0;
    for (const [n, veces] of frecuencia) {
      if (veces > filas || (veces === filas && n > moda)) {
        moda = n;
        filas = veces;
      }
    }
    // ES: Un separador que no aparece no compite.
    // EN: A separator that does not appear does not compete.
    if (filas === 0) continue;
    // ES: Orden: sin comilla abierta, más filas constantes, menos comillas
    //     sueltas y más celdas.
    // EN: Order: no open quote, more steady rows, fewer stray quotes and more
    //     cells.
    const clave = [-sinCerrar, filas, -sueltas, moda];
    const mejorClave = [-mejorSinCerrar, mejorFilas, -mejorSueltas, mejorCeldas];
    const i = clave.findIndex((v, j) => v !== mejorClave[j]);
    const gana = i >= 0 && clave[i] > mejorClave[i];
    if (gana) {
      mejor = sep;
      mejorSinCerrar = sinCerrar;
      mejorSueltas = sueltas;
      mejorFilas = filas;
      mejorCeldas = moda;
    }
  }
  return mejor;
}

// ES: Lee el CSV completo a una matriz de texto. Lanza ErrorCSV si queda una
//     comilla sin cerrar.
// EN: Reads the whole CSV into a text matrix. Throws ErrorCSV if a quote is
//     left unclosed.
export function leerCSV(texto: string, opciones: OpcionesCSV = {}): string[][] {
  const fuente = texto.replace(/^\ufeff/, "");
  const sep = opciones.separador ?? detectarSeparador(fuente);
  const { filas, comillaSinCerrar } = recorrer(fuente, sep);
  if (comillaSinCerrar !== null) throw new ErrorCSV(comillaSinCerrar);
  return filas;
}
