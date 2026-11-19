/* =============================================================================
 * fecha.ts — Fechas de los extractos / Statement dates
 * -----------------------------------------------------------------------------
 * ES: Convierte la fecha de una celda de extracto en "AAAA-MM-DD" con
 *     validación de calendario real (bisiestos incluidos) o null si no vale.
 *       - Orden "dma" (día-mes-año): dd/mm/aaaa, d/m/aaaa, dd-mm-aa, dd.mm.aaaa.
 *       - Orden "amd" (año-mes-día): aaaa-mm-dd, aaaa/m/d.
 *       - El separador (/, - o .) tiene que ser el mismo en toda la fecha.
 *       - Si detrás viene una hora ("01/02/2026 10:30" o "…T10:30"), se ignora.
 *       - Año de dos cifras: siempre 20aa (pivote fijo). Un extracto bancario
 *         es de este siglo; "99" se lee como 2099, y la vista previa mostrará
 *         la fecha para que se vea si algo no cuadra.
 *       - Date (lo que da ExcelJS en celdas de fecha): ExcelJS las guarda a
 *         medianoche UTC, así que se leen con getUTC* (con la hora local, en
 *         España saldría el día anterior o siguiente según el cambio de hora).
 *       - Número: número de serie de Excel (sistema de 1900; desde el 61, que
 *         es el 1-3-1900, para saltarse el 29-2-1900 que Excel inventa).
 *     Toda la aritmética de fechas va en UTC (Date.UTC), nunca en hora local.
 * EN: Turns a statement cell date into "YYYY-MM-DD" with real calendar
 *     validation (leap years included) or null when it is not valid.
 *       - "dma" order (day-month-year): dd/mm/yyyy, d/m/yyyy, dd-mm-yy,
 *         dd.mm.yyyy.
 *       - "amd" order (year-month-day): yyyy-mm-dd, yyyy/m/d.
 *       - The separator (/, - or .) must be the same across the date.
 *       - A trailing time ("01/02/2026 10:30" or "…T10:30") is ignored.
 *       - Two-digit year: always 20yy (fixed pivot). A bank statement belongs
 *         to this century; "99" reads as 2099, and the preview will show the
 *         date so anything odd is visible.
 *       - Date (what ExcelJS gives for date cells): ExcelJS stores them at UTC
 *         midnight, so they are read with getUTC* (with local time, in Spain
 *         the previous or next day could show up around DST changes).
 *       - Number: Excel serial number (1900 system; from 61, which is
 *         1-3-1900, to skip the 29-2-1900 Excel makes up).
 *     All date arithmetic is done in UTC (Date.UTC), never in local time.
 * ===========================================================================*/

// ES: Orden de los componentes de la fecha. / EN: Order of the date parts.
export type OrdenFecha = "dma" | "amd";

// ES: Milisegundos de un día. / EN: Milliseconds in a day.
const MS_DIA = 86_400_000;

// ES: Días de un mes (mes 1-12) en un año, con bisiestos gregorianos.
// EN: Days in a month (month 1-12) of a year, with Gregorian leap years.
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

// ES: Monta "AAAA-MM-DD" si año, mes y día forman una fecha real; si no, null.
// EN: Builds "YYYY-MM-DD" if year, month and day make a real date; else null.
function componer(anio: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(anio) || anio < 1000 || anio > 9999) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes(anio, mes)) return null;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ES: "AAAA-MM-DD" de un Date leyendo sus componentes UTC.
// EN: "YYYY-MM-DD" of a Date reading its UTC components.
export function fechaUTC(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  return componer(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// ES: Patrones por orden; \2 obliga a repetir el mismo separador.
// EN: Patterns per order; \2 forces the same separator to be repeated.
const PATRON: Record<OrdenFecha, RegExp> = {
  dma: /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})$/,
  amd: /^(\d{4})([/.-])(\d{1,2})\2(\d{1,2})$/,
};

// ES: Analiza una fecha de extracto (texto, Date o número de serie de Excel).
// EN: Parses a statement date (text, Date or Excel serial number).
export function analizarFecha(
  valor: string | number | Date | null | undefined,
  orden: OrdenFecha
): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return fechaUTC(valor);
  if (typeof valor === "number") {
    // ES: Serie de Excel: días desde el 30-12-1899; la parte decimal es la hora.
    // EN: Excel serial: days since 30-12-1899; the fraction is the time of day.
    if (!Number.isFinite(valor) || valor < 61) return null;
    return fechaUTC(new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * MS_DIA));
  }

  // ES: Solo la parte de la fecha (lo que va antes de un espacio o una "T").
  // EN: Only the date part (what comes before a space or a "T").
  const texto = valor.trim().split(/[\sT]/)[0];
  const m = PATRON[orden].exec(texto);
  if (!m) return null;
  if (orden === "amd") return componer(Number(m[1]), Number(m[3]), Number(m[4]));
  const anio = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
  return componer(anio, Number(m[3]), Number(m[1]));
}

// ES: Sugiere el orden con el que se leen TODAS las muestras no vacías: primero
//     "amd" (inequívoco por el año delante) y luego "dma". null si ninguno.
// EN: Suggests the order that reads ALL non-empty samples: "amd" first
//     (unambiguous with the year in front) and then "dma". null if neither.
export function sugerirOrdenFecha(muestras: (string | number | Date | null)[]): OrdenFecha | null {
  const utiles = muestras.filter((m) => m !== null && String(m).trim() !== "");
  if (!utiles.length) return null;
  for (const orden of ["amd", "dma"] as const) {
    if (utiles.every((m) => analizarFecha(m, orden) !== null)) return orden;
  }
  return null;
}
