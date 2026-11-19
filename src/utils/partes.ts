/* =============================================================================
 * partes.ts — Validación del gasto dividido / Split-expense validation
 * -----------------------------------------------------------------------------
 * ES: Lógica pura del gasto dividido en varias categorías (ModalMovimiento).
 *     Antes el total con el que se comprobaba el tope sumaba TODAS las filas
 *     (también las negativas), pero al guardar solo se quedaban las mayores
 *     que 0: 600.000.000 + 600.000.000 − 300.000.000 pasaba con un total de
 *     900 M y guardaba partes por 1.200 M. Ahora el total sale exactamente de
 *     las partes que se guardan, y lo que no es una parte válida se rechaza
 *     con un error en vez de descartarse en silencio:
 *       - vacía o 0 -> se descarta (como antes: las filas vacías son normales).
 *       - negativa -> error "negativa".
 *       - no es un número -> error "invalida".
 *       - pasa del tope (sola o el total) -> error "excede".
 *       - menos de 2 partes mayores que 0 -> error "pocas".
 * EN: Pure logic of the expense split across several categories
 *     (ModalMovimiento). Before, the total checked against the cap summed ALL
 *     rows (negative ones too), but saving only kept those above 0:
 *     600,000,000 + 600,000,000 − 300,000,000 passed with a 900 M total and
 *     saved parts worth 1,200 M. Now the total comes exactly from the parts
 *     that are saved, and anything that is not a valid part is rejected with
 *     an error instead of being silently dropped:
 *       - empty or 0 -> dropped (as before: empty rows are normal).
 *       - negative -> "negativa" error.
 *       - not a number -> "invalida" error.
 *       - above the cap (on its own or the total) -> "excede" error.
 *       - fewer than 2 parts above 0 -> "pocas" error.
 * ===========================================================================*/
import type { Subdivision } from "../types";
import { analizarImporte, importeDentroDeRango, redondear2 } from "./importe";

// ES: Una fila del formulario: categoría e importe tal como se escribió.
// EN: A form row: category and the amount as typed.
export interface FilaParte {
  categoria: string;
  importe: string | number;
}

// ES: Resultado: las subdivisiones a guardar y su total, o el motivo del error.
// EN: Result: the subdivisions to save and their total, or the error reason.
export type ResultadoPartes =
  | { ok: true; subdivisiones: Subdivision[]; total: number }
  | { ok: false; error: "pocas" | "invalida" | "negativa" | "excede" };

// ES: Valida las filas con las reglas de la cabecera. Manda el primer fallo
//     por fila (en el orden de las filas); después se comprueban el número de
//     partes y el total.
// EN: Validates the rows with the rules in the header. The first per-row
//     failure wins (in row order); then the number of parts and the total are
//     checked.
export function validarPartes(filas: FilaParte[]): ResultadoPartes {
  const subdivisiones: Subdivision[] = [];
  for (const fila of filas) {
    const a = analizarImporte(fila.importe);
    if (a.tipo === "invalido") return { ok: false, error: "invalida" };
    if (a.tipo === "excede") return { ok: false, error: "excede" };
    // ES: Vacía o 0: no aporta nada y se descarta.
    // EN: Empty or 0: adds nothing and is dropped.
    if (a.tipo === "vacio" || a.valor === 0) continue;
    if (a.valor < 0) return { ok: false, error: "negativa" };
    subdivisiones.push({ categoria: fila.categoria, importe: a.valor });
  }
  if (subdivisiones.length < 2) return { ok: false, error: "pocas" };

  // ES: El total sale de las mismas partes que se guardan.
  // EN: The total comes from the very parts that are saved.
  const total = sumar(subdivisiones);
  if (!importeDentroDeRango(total)) return { ok: false, error: "excede" };
  return { ok: true, subdivisiones, total };
}

// ES: Total que se muestra mientras se escribe ("Total dividido"): suma solo
//     las filas que se guardarían (válidas y mayores que 0), con el mismo
//     criterio que validarPartes.
// EN: Total shown while typing ("Split total"): sums only the rows that would
//     be saved (valid and above 0), with the same criteria as validarPartes.
export function totalPartes(filas: FilaParte[]): number {
  const validas: Subdivision[] = [];
  for (const fila of filas) {
    const a = analizarImporte(fila.importe);
    if (a.tipo === "valido" && a.valor > 0) {
      validas.push({ categoria: fila.categoria, importe: a.valor });
    }
  }
  return sumar(validas);
}

// ES: Suma de importes redondeada a céntimos.
// EN: Sum of amounts rounded to cents.
function sumar(partes: Subdivision[]): number {
  return redondear2(partes.reduce((acc, p) => acc + p.importe, 0));
}
