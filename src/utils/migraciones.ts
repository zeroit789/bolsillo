/* =============================================================================
 * migraciones.ts — Versiones del esquema y migraciones / Schema versions & migrations
 * -----------------------------------------------------------------------------
 * ES: Lleva cualquier dato guardado o importado (blob descifrado o copia .json)
 *     a la versión actual del esquema (VERSION_DATOS) y lo valida. Es el ÚNICO
 *     camino para convertir algo de fuera en DatosBolsillo: lo usan la carga
 *     del almacén y la importación de copias. Los datos sin `version` son la v1.
 *     Cada migración pasa de la versión v a la v+1 y se encadenan en orden.
 * EN: Brings any stored or imported data (decrypted blob or .json backup) to
 *     the current schema version (VERSION_DATOS) and validates it. It is the
 *     ONLY path to turn something external into DatosBolsillo: both the store
 *     load and the backup import use it. Data without `version` is v1. Each
 *     migration goes from version v to v+1 and they are chained in order.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y errores / Imports & errors
 *   2. Versión de unos datos / Version of some data
 *   3. Migración v1 → v2 / Migration v1 → v2
 *   4. Migración v2 → v3 / Migration v2 → v3
 *   5. Cadena de migraciones / Migration chain
 *   6. Preparar datos (migrar + validar) / Prepare data (migrate + validate)
 * ===========================================================================*/

// ── 1. Importaciones y errores / Imports & errors ────────────────────────────
import {
  diasDelMes,
  esDatosValidos,
  esFechaValida,
  esMesValido,
  VERSION_DATOS,
  type DatosBolsillo,
} from "../types";

// ES: Error de datos con su motivo: "invalido" (no tiene la forma esperada ni
//     tras migrar) o "version" (lo escribió una versión MÁS NUEVA de Bolsillo:
//     nunca se baja de versión ni se sobrescribe).
// EN: Data error with its reason: "invalido" (it does not have the expected
//     shape even after migrating) or "version" (it was written by a NEWER
//     Bolsillo version: it is never downgraded nor overwritten).
export class ErrorDatos extends Error {
  constructor(public readonly motivo: "invalido" | "version") {
    super(motivo === "version" ? "datos-version-nueva" : "datos-invalidos");
    this.name = "ErrorDatos";
  }
}

// ES: Objeto plano con claves de texto (forma genérica antes de validar).
// EN: Plain object with string keys (generic shape before validating).
type Obj = Record<string, unknown>;
const esObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);

// ── 2. Versión de unos datos / Version of some data ──────────────────────────
// ES: Devuelve la versión de unos datos: sin campo `version` = 1. Lanza
//     ErrorDatos("invalido") si el campo existe pero no es un entero >= 1.
// EN: Returns the version of some data: no `version` field = 1. Throws
//     ErrorDatos("invalido") if the field exists but is not an integer >= 1.
export function versionDe(datos: Obj): number {
  if (datos.version === undefined) return 1;
  const v = datos.version;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new ErrorDatos("invalido");
  return v;
}

// ── 3. Migración v1 → v2 / Migration v1 → v2 ──────────────────────────────────
// ES: Limpia un campo opcional: null o "" (descuidos tolerables) pasan a "no está".
// EN: Cleans an optional field: null or "" (tolerable slips) become "absent".
function limpiarOpcional(o: Obj, campo: string) {
  if (o[campo] === null || o[campo] === "") delete o[campo];
}

// ES: Normaliza el día de pago: número o texto numérico entre 1 y 31 → entero;
//     cualquier otra cosa se quita (solo servía para recordatorios).
// EN: Normalizes the payment day: number or numeric text between 1 and 31 →
//     integer; anything else is removed (it was only used for reminders).
function limpiarDiaPago(o: Obj) {
  if (o.diaPago === undefined) return;
  const d = Math.trunc(Number(o.diaPago));
  if (Number.isFinite(d) && d >= 1 && d <= 31) o.diaPago = d;
  else delete o.diaPago;
}

// ES: Normaliza las etiquetas: se quedan solo los textos no vacíos; sin ninguno, se quita.
// EN: Normalizes tags: only non-empty strings stay; with none left, it is removed.
function limpiarTags(o: Obj) {
  if (o.tags === undefined) return;
  const tags = Array.isArray(o.tags)
    ? o.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "")
    : [];
  if (tags.length > 0) o.tags = tags;
  else delete o.tags;
}

// ES: Copia superficial de cada elemento de una lista (si lo es) para no mutar
//     la entrada; lo que no sea objeto se deja tal cual y la validación lo rechaza.
// EN: Shallow copy of each item of a list (if it is one) so the input is not
//     mutated; non-objects are left as they are and validation rejects them.
function copiarLista(x: unknown): unknown {
  return Array.isArray(x) ? x.map((e) => (esObj(e) ? { ...e } : e)) : x;
}

// ES: v1 → v2. La v1 (hasta la 1.1.0) no tenía `version`, las colecciones
//     planes/presupuestos/plantillas/cuentas podían faltar y los opcionales no
//     se validaban. Aquí: se rellenan las colecciones que falten con [], se
//     limpian los opcionales con descuidos tolerables (null, "", día de pago
//     como texto, etiquetas vacías, recibo que no es texto) y se marca v2.
//     No inventa importes ni fechas: lo que rompa los cálculos lo rechaza luego
//     la validación.
// EN: v1 → v2. v1 (up to 1.1.0) had no `version`, the planes/presupuestos/
//     plantillas/cuentas collections could be missing and the optionals were
//     not validated. Here: missing collections are filled with [], optionals
//     with tolerable slips (null, "", payment day as text, empty tags, receipt
//     that is not text) are cleaned and v2 is set. It never invents amounts
//     or dates: whatever breaks the maths is rejected later by validation.
function v1aV2(d: Obj): Obj {
  const o: Obj = { ...d };
  for (const k of ["recurrentes", "puntuales", "deudas"]) o[k] = copiarLista(o[k]);
  for (const k of ["planes", "presupuestos", "plantillas", "cuentas"])
    o[k] = o[k] === undefined || o[k] === null ? [] : copiarLista(o[k]);

  // ES: Opcionales de los apuntes (recurrentes y puntuales).
  // EN: Optionals of the entries (recurring and one-off).
  for (const k of ["recurrentes", "puntuales"]) {
    const lista = o[k];
    if (!Array.isArray(lista)) continue;
    for (const e of lista) {
      if (!esObj(e)) continue;
      for (const c of ["comercio", "cuenta", "recibo", "diaPago", "tags", "subdivisiones"])
        limpiarOpcional(e, c);
      limpiarDiaPago(e);
      limpiarTags(e);
      // ES: Un recibo que no es texto no se puede pintar: se quita.
      // EN: A receipt that is not text cannot be rendered: it is removed.
      if (e.recibo !== undefined && typeof e.recibo !== "string") delete e.recibo;
    }
  }
  // ES: Día de pago de las deudas. / EN: Payment day of the debts.
  if (Array.isArray(o.deudas)) {
    for (const e of o.deudas) {
      if (!esObj(e)) continue;
      limpiarOpcional(e, "diaPago");
      limpiarDiaPago(e);
    }
  }
  o.version = 2;
  return o;
}

// ── 4. Migración v2 → v3 / Migration v2 → v3 ──────────────────────────────────
// ES: Lleva un mes "AAAA-MM" (la v2 garantizaba esa forma) al mes real más
//     cercano: 00 → 01 y > 12 → 12.
// EN: Brings a "YYYY-MM" month (v2 guaranteed that shape) to the nearest real
//     month: 00 → 01 and > 12 → 12.
function corregirMes(s: string): string {
  const año = s.slice(0, 4);
  const mes = Math.min(Math.max(Number(s.slice(5, 7)), 1), 12);
  return `${año}-${String(mes).padStart(2, "0")}`;
}

// ES: Lleva una fecha que empieza por "AAAA-MM-DD" (lo que exigía la v2) a la
//     fecha real más cercana: se quita lo que vaya detrás, el mes se acota a
//     01-12 y el día a los días de ese mes.
// EN: Brings a date that starts with "YYYY-MM-DD" (what v2 required) to the
//     nearest real date: trailing text is dropped, the month is clamped to
//     01-12 and the day to the days of that month.
function corregirFecha(s: string): string {
  const mes = corregirMes(s.slice(0, 7));
  const tope = diasDelMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)));
  const dia = Math.min(Math.max(Number(s.slice(8, 10)), 1), tope);
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

// ES: Corrige un campo de fecha/mes si no es válido. Si el valor cambia de
//     verdad (no solo se quita la hora de detrás), el original se guarda en
//     una etiqueta "<campo>-original:<valor>" para que no se pierda nada y el
//     usuario lo vea. Las deudas no tienen etiquetas: solo se corrigen.
// EN: Fixes a date/month field if it is not valid. If the value really
//     changes (not just the trailing time dropped), the original is kept in a
//     "<field>-original:<value>" tag so nothing is lost and the user sees it.
//     Debts have no tags: they are only fixed.
function corregirCampo(o: Obj, campo: string, tipo: "mes" | "fecha", conEtiqueta: boolean) {
  const v = o[campo];
  if (typeof v !== "string") return;
  const valido = tipo === "mes" ? esMesValido(v) : esFechaValida(v);
  if (valido) return;
  // ES: Lo que la v2 ya rechazaba no se toca: lo rechazará la validación.
  // EN: What v2 already rejected is left alone: validation will reject it.
  const formaV2 = tipo === "mes" ? /^\d{4}-\d{2}$/.test(v) : /^\d{4}-\d{2}-\d{2}/.test(v);
  if (!formaV2) return;
  const corregido = tipo === "mes" ? corregirMes(v) : corregirFecha(v);
  o[campo] = corregido;
  if (conEtiqueta && corregido !== v.slice(0, corregido.length)) {
    const tags = Array.isArray(o.tags) ? [...(o.tags as unknown[])] : [];
    tags.push(`${campo}-original:${v}`);
    o.tags = tags;
  }
}

// ES: v2 → v3. La v3 valida el calendario de verdad y admite `reciboId`
//     (recibo cifrado en su propio fichero; el data URL en `recibo` sigue
//     siendo válido en memoria y en las copias). Aquí se corrigen las fechas
//     y meses imposibles que la v2 dejaba pasar, sin perder ningún apunte.
// EN: v2 → v3. v3 really validates the calendar and allows `reciboId`
//     (receipt encrypted in its own file; the data URL in `recibo` is still
//     valid in memory and in backups). Here the impossible dates and months
//     v2 let through are fixed, without losing any entry.
function v2aV3(d: Obj): Obj {
  const o: Obj = { ...d };
  for (const k of ["recurrentes", "puntuales", "deudas"]) o[k] = copiarLista(o[k]);
  if (Array.isArray(o.recurrentes))
    for (const e of o.recurrentes) {
      if (!esObj(e)) continue;
      corregirCampo(e, "desde", "mes", true);
      corregirCampo(e, "hasta", "mes", true);
    }
  if (Array.isArray(o.puntuales))
    for (const e of o.puntuales) if (esObj(e)) corregirCampo(e, "fecha", "fecha", true);
  if (Array.isArray(o.deudas))
    for (const e of o.deudas) if (esObj(e)) corregirCampo(e, "inicioMes", "mes", false);
  o.version = 3;
  return o;
}

// ── 5. Cadena de migraciones / Migration chain ────────────────────────────────
// ES: Migración que lleva de la versión `clave` a `clave + 1`. Para un cambio de
//     esquema nuevo: sube VERSION_DATOS y añade aquí la migración de la anterior.
// EN: Migration that takes version `key` to `key + 1`. For a new schema change:
//     bump VERSION_DATOS and add the migration from the previous one here.
const MIGRACIONES: Record<number, (d: Obj) => Obj> = {
  1: v1aV2,
  2: v2aV3,
};

// ES: Lleva unos datos a VERSION_DATOS aplicando las migraciones en orden. No
//     muta la entrada. Lanza ErrorDatos("version") si son de una versión más
//     nueva y ErrorDatos("invalido") si no es un objeto o falta un paso.
// EN: Brings some data to VERSION_DATOS by applying the migrations in order.
//     Does not mutate the input. Throws ErrorDatos("version") if they come from
//     a newer version and ErrorDatos("invalido") if it is not an object or a
//     step is missing.
export function migrar(datos: unknown): Obj {
  if (!esObj(datos)) throw new ErrorDatos("invalido");
  let v = versionDe(datos);
  if (v > VERSION_DATOS) throw new ErrorDatos("version");
  let o: Obj = datos;
  while (v < VERSION_DATOS) {
    const paso = MIGRACIONES[v];
    if (!paso) throw new ErrorDatos("invalido");
    o = paso(o);
    v++;
  }
  return o;
}

// ── 6. Preparar datos (migrar + validar) / Prepare data (migrate + validate) ──
// ES: Migra y valida. Devuelve DatosBolsillo listo para hidratar o lanza
//     ErrorDatos con el motivo.
// EN: Migrates and validates. Returns DatosBolsillo ready to hydrate or throws
//     ErrorDatos with the reason.
export function prepararDatos(crudo: unknown): DatosBolsillo {
  const datos = migrar(crudo);
  if (!esDatosValidos(datos)) throw new ErrorDatos("invalido");
  return datos;
}
