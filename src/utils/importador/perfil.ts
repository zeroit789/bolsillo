/* =============================================================================
 * perfil.ts — Perfiles de banco y mapeo de columnas / Bank profiles & column mapping
 * -----------------------------------------------------------------------------
 * ES: Modelo de datos del asistente de importación:
 *       - PerfilBanco: cómo leer los extractos de un banco (separador, orden de
 *         la fecha, formato decimal y qué columna es cada cosa). Es JSON plano
 *         (sin funciones ni RegExp) para guardarlo cifrado con el resto de
 *         datos; esPerfilBancoValido lo valida al leerlo de disco.
 *       - Columnas por NOMBRE de cabecera (se compara normalizado: sin
 *         mayúsculas ni acentos) o por ÍNDICE (0 = primera) si el fichero no
 *         trae cabecera. El concepto puede salir de varias columnas juntas.
 *       - Importe en una columna con signo (`importe`) o en dos columnas
 *         (`cargo` = gasto y `abono` = ingreso; Debe/Haber igual).
 *       - firma: cabeceras normalizadas del fichero con el que se creó el
 *         perfil; detectarPerfil la usa para reconocer el banco solo.
 *     Además: detectarCabecera (salta el preámbulo de titular, periodo…) y
 *     sugerirMapeo (propone qué columna es cada cosa por su nombre).
 * EN: Data model of the import wizard:
 *       - PerfilBanco: how to read a bank's statements (separator, date order,
 *         decimal format and which column is what). Plain JSON (no functions or
 *         RegExp) so it is stored encrypted with the rest of the data;
 *         esPerfilBancoValido validates it when read from disk.
 *       - Columns by header NAME (compared normalised: no case or accents) or
 *         by INDEX (0 = first) when the file has no header. The concept may
 *         come from several columns joined.
 *       - Amount in one signed column (`importe`) or in two columns (`cargo` =
 *         expense and `abono` = income; Debe/Haber alike).
 *       - firma: normalised headers of the file the profile was created from;
 *         detectarPerfil uses it to recognise the bank on its own.
 *     Also: detectarCabecera (skips the holder, period… preamble) and
 *     sugerirMapeo (proposes which column is what by its name).
 * ===========================================================================*/
import type { SeparadorCSV } from "./csv";
import type { OrdenFecha } from "./fecha";
import type { FormatoDecimal } from "./importeBanco";
import { normalizarTexto } from "./texto";
import type { Celda } from "./xlsx";

// ── 1. Tipos / Types ─────────────────────────────────────────────────────────

// ES: Referencia a una columna: nombre de cabecera o índice (0 = primera).
// EN: Reference to a column: header name or index (0 = first).
export type ColumnaRef = string | number;

// ES: Qué columna es cada cosa. Hay que dar `importe` O BIEN `cargo` y `abono`.
// EN: Which column is what. Either `importe` OR both `cargo` and `abono`.
export interface MapeoColumnas {
  fecha: ColumnaRef;
  concepto: ColumnaRef | ColumnaRef[]; // ES: varias se juntan con un espacio / EN: several are joined with a space
  importe?: ColumnaRef; // ES: una columna con signo / EN: one signed column
  cargo?: ColumnaRef; // ES: gasto (Cargo, Debe) / EN: expense (debit)
  abono?: ColumnaRef; // ES: ingreso (Abono, Haber) / EN: income (credit)
}

// ES: Perfil guardado de un banco. / EN: Saved bank profile.
export interface PerfilBanco {
  id: string;
  nombre: string;
  separador?: SeparadorCSV; // ES: solo CSV; sin él se detecta / EN: CSV only; detected when absent
  formatoFecha: OrdenFecha;
  formatoDecimal: FormatoDecimal;
  columnas: MapeoColumnas;
  firma?: string[]; // ES: cabeceras normalizadas (crearFirma) / EN: normalised headers (crearFirma)
}

// ── 2. Nombres de cabecera conocidos / Known header names ─────────────────────

// ES: Alias normalizados por papel. Una cabecera encaja si es igual al alias
//     o empieza por él seguido de un espacio ("importe (€)" -> "importe").
// EN: Normalised aliases per role. A header fits if it equals the alias or
//     starts with it followed by a space ("importe (€)" -> "importe").
const ALIAS = {
  fecha: ["fecha operacion", "fecha de operacion", "f. operacion", "fecha", "f. valor", "date"],
  concepto: ["concepto", "descripcion", "movimiento", "detalle", "description", "concept"],
  importe: ["importe", "cantidad", "amount"],
  cargo: ["cargo", "cargos", "debe", "debito", "salidas"],
  abono: ["abono", "abonos", "haber", "credito", "entradas"],
} as const;

type Rol = keyof typeof ALIAS;

// ES: Puntuación de una cabecera para un papel: 0 si no encaja; más cuanto
//     antes salga su alias en la lista (los primeros son los preferidos). La
//     "fecha valor" puntúa poco: se prefiere la de operación si existe.
// EN: Score of a header for a role: 0 if it does not fit; higher the earlier
//     its alias is in the list (the first ones are preferred). The "value
//     date" scores low: the operation date is preferred when present.
function puntuar(cabecera: string, rol: Rol): number {
  const lista: readonly string[] = ALIAS[rol];
  for (let i = 0; i < lista.length; i++) {
    const alias = lista[i];
    if (cabecera === alias || cabecera.startsWith(alias + " ")) {
      if (rol === "fecha" && /\bvalor\b/.test(cabecera)) return 1;
      return 100 - i;
    }
  }
  return 0;
}

// ES: Texto normalizado de una celda de cabecera ("" si está vacía).
// EN: Normalised text of a header cell ("" if empty).
function textoCabecera(c: Celda | undefined): string {
  return c === null || c === undefined || c instanceof Date ? "" : normalizarTexto(String(c));
}

// ── 3. Cabecera y mapeo / Header & mapping ───────────────────────────────────

// ES: Índice de la fila de cabecera entre las primeras `maxFilas`: la primera
//     con al menos dos papeles distintos reconocidos, uno de ellos la fecha.
//     -1 si no hay (fichero sin cabecera).
// EN: Index of the header row among the first `maxFilas`: the first one with
//     at least two different recognised roles, one of them the date. -1 if
//     there is none (file with no header).
export function detectarCabecera(filas: Celda[][], maxFilas = 20): number {
  for (let i = 0; i < Math.min(filas.length, maxFilas); i++) {
    const roles = new Set<Rol>();
    for (const c of filas[i]) {
      const t = textoCabecera(c);
      if (!t) continue;
      for (const rol of Object.keys(ALIAS) as Rol[]) if (puntuar(t, rol) > 0) roles.add(rol);
    }
    if (roles.has("fecha") && roles.size >= 2) return i;
  }
  return -1;
}

// ES: Propone el mapeo a partir de la cabecera (devuelve los nombres tal cual
//     vienen). Para cada papel elige la columna con más puntuación; si hay
//     columna de importe no propone cargo/abono, y cargo/abono solo van juntos.
// EN: Proposes the mapping from the header (returns names as they come). For
//     each role it picks the highest-scoring column; if there is an amount
//     column it does not propose debit/credit, and those only go as a pair.
export function sugerirMapeo(cabecera: Celda[]): Partial<MapeoColumnas> {
  const elegido: Partial<Record<Rol, string>> = {};
  const usadas = new Set<number>();
  for (const rol of Object.keys(ALIAS) as Rol[]) {
    let mejor = -1;
    let mejorPuntos = 0;
    cabecera.forEach((c, i) => {
      const p = usadas.has(i) ? 0 : puntuar(textoCabecera(c), rol);
      if (p > mejorPuntos) {
        mejor = i;
        mejorPuntos = p;
      }
    });
    if (mejor >= 0) {
      elegido[rol] = String(cabecera[mejor]).trim();
      usadas.add(mejor);
    }
  }
  const mapeo: Partial<MapeoColumnas> = {};
  if (elegido.fecha) mapeo.fecha = elegido.fecha;
  if (elegido.concepto) mapeo.concepto = elegido.concepto;
  if (elegido.importe) mapeo.importe = elegido.importe;
  else if (elegido.cargo && elegido.abono) {
    mapeo.cargo = elegido.cargo;
    mapeo.abono = elegido.abono;
  }
  return mapeo;
}

// ES: Índice de una columna en la cabecera (por nombre normalizado o índice
//     entero no negativo). -1 si no está o la referencia no vale.
// EN: Index of a column in the header (by normalised name or non-negative
//     integer index). -1 if missing or the reference is not valid.
export function resolverColumna(cabecera: Celda[] | null, ref: ColumnaRef): number {
  if (typeof ref === "number") return Number.isInteger(ref) && ref >= 0 ? ref : -1;
  if (!cabecera) return -1;
  const buscado = normalizarTexto(ref);
  return cabecera.findIndex((c) => textoCabecera(c) === buscado);
}

// ── 4. Firma y detección de perfil / Signature & profile detection ───────────

// ES: Firma de una cabecera: sus nombres normalizados, sin los vacíos.
// EN: Signature of a header: its normalised names, without empty ones.
export function crearFirma(cabecera: Celda[]): string[] {
  return cabecera.map(textoCabecera).filter((t) => t !== "");
}

// ES: Nombres de columna que usa el mapeo de un perfil (los índices no cuentan).
// EN: Column names used by a profile's mapping (indexes do not count).
function nombresDelMapeo(m: MapeoColumnas): string[] {
  const refs = [m.fecha, ...(Array.isArray(m.concepto) ? m.concepto : [m.concepto])];
  refs.push(...[m.importe, m.cargo, m.abono].filter((r) => r !== undefined));
  return refs.filter((r): r is string => typeof r === "string").map(normalizarTexto);
}

// ES: Reconoce el banco: un perfil encaja si TODOS los nombres de su firma (o,
//     sin firma, los de su mapeo) están en la cabecera. Gana el que más
//     nombres exige (el más concreto); a igualdad, el primero de la lista.
// EN: Recognises the bank: a profile fits if ALL the names of its signature
//     (or, without one, those of its mapping) are in the header. The one
//     requiring the most names (the most specific) wins; if tied, the first.
export function detectarPerfil(cabecera: Celda[], perfiles: PerfilBanco[]): PerfilBanco | null {
  const presentes = new Set(crearFirma(cabecera));
  let mejor: PerfilBanco | null = null;
  let mejorTam = 0;
  for (const p of perfiles) {
    const exigidos = p.firma?.length ? p.firma : nombresDelMapeo(p.columnas);
    if (!exigidos.length || !exigidos.every((n) => presentes.has(n))) continue;
    if (exigidos.length > mejorTam) {
      mejor = p;
      mejorTam = exigidos.length;
    }
  }
  return mejor;
}

// ── 5. Validación al leer de disco / Validation when read from disk ──────────

// ES: true si `x` es un PerfilBanco bien formado: campos y valores conocidos,
//     columnas con nombre no vacío o índice entero >= 0, y `importe` o la
//     pareja `cargo`+`abono` (no ambas cosas ni media pareja).
// EN: true if `x` is a well-formed PerfilBanco: known fields and values,
//     columns with a non-empty name or an integer index >= 0, and `importe`
//     or the `cargo`+`abono` pair (not both, nor half a pair).
export function esPerfilBancoValido(x: unknown): x is PerfilBanco {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  const ref = (r: unknown) =>
    (typeof r === "string" && r.trim() !== "") ||
    (typeof r === "number" && Number.isInteger(r) && r >= 0);
  if (typeof o.id !== "string" || typeof o.nombre !== "string") return false;
  if (o.separador !== undefined && ![";", ",", "\t"].includes(o.separador as string)) return false;
  if (o.formatoFecha !== "dma" && o.formatoFecha !== "amd") return false;
  if (o.formatoDecimal !== "coma" && o.formatoDecimal !== "punto") return false;
  if (o.firma !== undefined) {
    if (!Array.isArray(o.firma) || !o.firma.every((f) => typeof f === "string")) return false;
  }
  const c = o.columnas as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return false;
  if (!ref(c.fecha)) return false;
  const conceptoOk = Array.isArray(c.concepto)
    ? c.concepto.length > 0 && c.concepto.every(ref)
    : ref(c.concepto);
  if (!conceptoOk) return false;
  const conImporte = c.importe !== undefined;
  const conCargo = c.cargo !== undefined;
  const conAbono = c.abono !== undefined;
  if (conImporte) return ref(c.importe) && !conCargo && !conAbono;
  return conCargo && conAbono && ref(c.cargo) && ref(c.abono);
}
