/* =============================================================================
 * vistaPrevia.ts — Vista previa de la importación / Import preview
 * -----------------------------------------------------------------------------
 * ES: Convierte la matriz leída (leerCSV o leerXLSX) en filas normalizadas
 *     según el mapeo de un perfil, SIN guardar nada: es lo que el asistente
 *     enseña antes de confirmar.
 *       - Cada fila buena sale con fecha "AAAA-MM-DD", concepto, importe en
 *         céntimos POSITIVOS (y en euros, por comodidad) y signo
 *         (ingreso/gasto), como los apuntes de la app.
 *       - Cada fila mala deja uno o varios errores (campo, motivo y el texto
 *         original) y el resto sigue: un fichero con una línea rota no aborta.
 *       - Se ignoran (y se cuentan) las filas sin fecha ni importe: líneas de
 *         separación y pies tipo "Saldo final".
 *       - `linea` es la posición en la matriz leída, empezando en 1 (las líneas
 *         vacías del fichero no cuentan porque el lector ya las quitó).
 *     Reglas de importe: con una columna, el signo decide (negativo = gasto);
 *     con dos (cargo/abono), la columna decide y se toma el valor absoluto.
 *     Las dos rellenas (distintas de 0) o ninguna es un error, igual que un
 *     importe 0 o un concepto vacío.
 * EN: Turns the matrix read (leerCSV or leerXLSX) into normalised rows
 *     following a profile's mapping, WITHOUT saving anything: it is what the
 *     wizard shows before confirming.
 *       - Every good row comes out with a "YYYY-MM-DD" date, concept, amount
 *         in POSITIVE cents (and in euros, for convenience) and sign
 *         (ingreso/gasto), like the app's entries.
 *       - Every bad row leaves one or more errors (field, reason and the
 *         original text) and the rest carries on: one broken line does not
 *         abort the file.
 *       - Rows with no date and no amount are ignored (and counted): separator
 *         lines and "Closing balance" style footers.
 *       - `linea` is the position in the matrix read, starting at 1 (empty
 *         file lines do not count because the reader already dropped them).
 *     Amount rules: with one column, the sign decides (negative = expense);
 *     with two (debit/credit), the column decides and the absolute value is
 *     taken. Both filled (non-zero) or none is an error, as is a 0 amount or
 *     an empty concept.
 * ===========================================================================*/
import { analizarFecha } from "./fecha";
import { analizarImporteBanco, type AnalisisImporteBanco } from "./importeBanco";
import { detectarCabecera, resolverColumna, type ColumnaRef, type PerfilBanco } from "./perfil";
import type { Celda } from "./xlsx";

// ── 1. Tipos / Types ─────────────────────────────────────────────────────────

// ES: Signo de un movimiento (igual que Signo de types/index.ts).
// EN: Sign of a movement (same as Signo in types/index.ts).
export type SignoMovimiento = "ingreso" | "gasto";

// ES: Fila del extracto ya normalizada. / EN: Already normalised statement row.
export interface FilaImportada {
  linea: number; // ES: posición en la matriz (desde 1) / EN: position in the matrix (from 1)
  fecha: string; // ES: "AAAA-MM-DD" / EN: "YYYY-MM-DD"
  concepto: string;
  centimos: number; // ES: entero > 0 / EN: integer > 0
  importe: number; // ES: euros (centimos / 100) / EN: euros (centimos / 100)
  signo: SignoMovimiento;
}

// ES: Error de una fila: qué campo, por qué y el texto original.
// EN: Row error: which field, why and the original text.
export interface ErrorFila {
  linea: number;
  campo: "fecha" | "concepto" | "importe";
  motivo: "vacio" | "invalido" | "excede" | "cero" | "ambos";
  valor: string;
}

// ES: Problema que impide leer cualquier fila (se ve antes que los errores).
// EN: Problem that prevents reading any row (shown before the errors).
export type ProblemaVista =
  | { tipo: "sinCabecera" }
  | {
      tipo: "columna";
      rol: "fecha" | "concepto" | "importe" | "cargo" | "abono";
      columna: ColumnaRef;
    };

// ES: Resultado de la vista previa. / EN: Preview result.
export interface VistaPrevia {
  filaCabecera: number; // ES: -1 = sin cabecera / EN: -1 = no header
  cabecera: string[] | null;
  filas: FilaImportada[];
  errores: ErrorFila[];
  ignoradas: number;
  problema: ProblemaVista | null;
}

// ES: Opciones: fila de cabecera forzada (-1 = no hay); sin ella, se detecta.
// EN: Options: forced header row (-1 = none); without it, it is detected.
export interface OpcionesVista {
  filaCabecera?: number;
}

// ES: Lo que la vista previa necesita de un perfil.
// EN: What the preview needs from a profile.
export type PerfilLectura = Pick<PerfilBanco, "formatoFecha" | "formatoDecimal" | "columnas">;

// ── 2. Ayudas / Helpers ──────────────────────────────────────────────────────

// ES: Texto de una celda para mostrarlo en un error o juntarlo al concepto.
// EN: Text of a cell to show it in an error or join it into the concept.
function texto(c: Celda | undefined): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? "" : c.toISOString().slice(0, 10);
  return String(c).trim();
}

// ES: Celda vacía (null, sin texto o solo espacios).
// EN: Empty cell (null, no text or blanks only).
function vacia(c: Celda | undefined): boolean {
  return texto(c) === "";
}

// ── 3. Vista previa / Preview ────────────────────────────────────────────────

// ES: Crea la vista previa de la matriz con el perfil dado (ver cabecera).
// EN: Builds the preview of the matrix with the given profile (see header).
export function crearVistaPrevia(
  matriz: Celda[][],
  perfil: PerfilLectura,
  opciones: OpcionesVista = {}
): VistaPrevia {
  const filaCabecera = opciones.filaCabecera ?? detectarCabecera(matriz);
  const cabecera = filaCabecera >= 0 ? (matriz[filaCabecera] ?? []).map(texto) : null;
  const base: VistaPrevia = {
    filaCabecera,
    cabecera,
    filas: [],
    errores: [],
    ignoradas: 0,
    problema: null,
  };

  // ES: Resuelve cada columna del mapeo; si alguna falta, nada se puede leer.
  // EN: Resolves every mapped column; if one is missing, nothing can be read.
  const col = perfil.columnas;
  const usaNombres = [col.fecha, col.importe, col.cargo, col.abono]
    .concat(Array.isArray(col.concepto) ? col.concepto : [col.concepto])
    .some((r) => typeof r === "string");
  if (!cabecera && usaNombres) return { ...base, problema: { tipo: "sinCabecera" } };

  // ES: Índice de la columna de un papel o el problema si no está.
  // EN: Index of a role's column or the problem when it is missing.
  type Rol = "fecha" | "concepto" | "importe" | "cargo" | "abono";
  const indice = (rol: Rol, ref: ColumnaRef): { i: number } | { problema: ProblemaVista } => {
    const i = resolverColumna(cabecera, ref);
    return i < 0 ? { problema: { tipo: "columna", rol, columna: ref } } : { i };
  };
  const fecha = indice("fecha", col.fecha);
  if ("problema" in fecha) return { ...base, problema: fecha.problema };
  const conceptos: number[] = [];
  for (const ref of Array.isArray(col.concepto) ? col.concepto : [col.concepto]) {
    const r = indice("concepto", ref);
    if ("problema" in r) return { ...base, problema: r.problema };
    conceptos.push(r.i);
  }
  let importe = -1;
  let cargo = -1;
  let abono = -1;
  if (col.importe !== undefined) {
    const r = indice("importe", col.importe);
    if ("problema" in r) return { ...base, problema: r.problema };
    importe = r.i;
  } else {
    const rc = indice("cargo", col.cargo ?? "");
    if ("problema" in rc) return { ...base, problema: rc.problema };
    const ra = indice("abono", col.abono ?? "");
    if ("problema" in ra) return { ...base, problema: ra.problema };
    cargo = rc.i;
    abono = ra.i;
  }

  // ES: Recorre las filas de datos (las que van tras la cabecera).
  // EN: Walks the data rows (the ones after the header).
  for (let n = filaCabecera + 1; n < matriz.length; n++) {
    const fila = matriz[n];
    const linea = n + 1;
    const celdasImporte = importe >= 0 ? [fila[importe]] : [fila[cargo], fila[abono]];

    // ES: Sin fecha ni importe: separación o pie del extracto.
    // EN: No date and no amount: separator or statement footer.
    if (vacia(fila[fecha.i]) && celdasImporte.every(vacia)) {
      base.ignoradas++;
      continue;
    }
    const errores: ErrorFila[] = [];

    // ES: Fecha. / EN: Date.
    const f = analizarFecha(fila[fecha.i], perfil.formatoFecha);
    if (!f) {
      errores.push({
        linea,
        campo: "fecha",
        motivo: vacia(fila[fecha.i]) ? "vacio" : "invalido",
        valor: texto(fila[fecha.i]),
      });
    }

    // ES: Concepto (varias columnas se juntan con un espacio).
    // EN: Concept (several columns are joined with a space).
    const concepto = conceptos
      .map((i) => texto(fila[i]))
      .filter((t) => t !== "")
      .join(" ");
    if (!concepto) errores.push({ linea, campo: "concepto", motivo: "vacio", valor: "" });

    // ES: Importe y signo. / EN: Amount and sign.
    const leer = (c: Celda | undefined): AnalisisImporteBanco =>
      analizarImporteBanco(c instanceof Date ? texto(c) : c, perfil.formatoDecimal);
    let centimos = 0;
    let signo: SignoMovimiento = "gasto";
    let errorImporte: ErrorFila | null = null;
    const valorImporte = celdasImporte
      .map(texto)
      .join(" | ")
      .replace(/^ \| $/, "");
    if (importe >= 0) {
      const r = leer(fila[importe]);
      if (r.tipo !== "valido") {
        errorImporte = { linea, campo: "importe", motivo: r.tipo, valor: texto(fila[importe]) };
      } else {
        centimos = Math.abs(r.centimos);
        signo = r.centimos < 0 ? "gasto" : "ingreso";
      }
    } else {
      const rc = leer(fila[cargo]);
      const ra = leer(fila[abono]);
      // ES: Un 0 en una de las dos columnas cuenta como vacía.
      // EN: A 0 in one of the two columns counts as empty.
      const tieneC = rc.tipo !== "vacio" && !(rc.tipo === "valido" && rc.centimos === 0);
      const tieneA = ra.tipo !== "vacio" && !(ra.tipo === "valido" && ra.centimos === 0);
      if (tieneC && tieneA) {
        errorImporte = { linea, campo: "importe", motivo: "ambos", valor: valorImporte };
      } else if (!tieneC && !tieneA) {
        const algunCero = rc.tipo === "valido" || ra.tipo === "valido";
        errorImporte = {
          linea,
          campo: "importe",
          motivo: algunCero ? "cero" : "vacio",
          valor: valorImporte,
        };
      } else {
        const r = tieneC ? rc : ra;
        if (r.tipo !== "valido") {
          errorImporte = {
            linea,
            campo: "importe",
            motivo: r.tipo,
            valor: texto(tieneC ? fila[cargo] : fila[abono]),
          };
        } else {
          centimos = Math.abs(r.centimos);
          signo = tieneC ? "gasto" : "ingreso";
        }
      }
    }
    if (!errorImporte && centimos === 0) {
      errorImporte = { linea, campo: "importe", motivo: "cero", valor: valorImporte };
    }
    if (errorImporte) errores.push(errorImporte);

    if (errores.length || !f) {
      base.errores.push(...errores);
      continue;
    }
    base.filas.push({ linea, fecha: f, concepto, centimos, importe: centimos / 100, signo });
  }
  return base;
}
