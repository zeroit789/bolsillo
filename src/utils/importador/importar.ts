/* =============================================================================
 * importar.ts — Paso final de la importación de extractos / Final statement import step
 * -----------------------------------------------------------------------------
 * ES: Une la vista previa, los duplicados y las reglas con el modelo:
 *       - huellaFila / leerHuella: huella "fecha|signo|céntimos|concepto
 *         normalizado" de cada fila del banco. Se guarda en el puntual
 *         (`importId`) para reconocer el mismo movimiento al reimportar un
 *         extracto que se solapa, aunque el usuario edite luego el concepto,
 *         la fecha o el importe del apunte.
 *       - comparablesDe: lo que ya está apuntado en la forma que espera
 *         detectarDuplicados (los importados, con los datos de su huella).
 *       - filasAImportar: qué filas entran. Por defecto se salta la marca
 *         "apuntado" (ya está en la app) y entra la marca "fichero" (dos cafés
 *         iguales el mismo día son legítimos); el usuario decide fila a fila.
 *       - crearPuntualesImportados: filas -> puntuales con origen "importado",
 *         su huella, la cuenta elegida y la categoría de la primera regla que
 *         encaje (o la categoría por defecto, "Otros").
 * EN: Joins the preview, the duplicates and the rules with the model:
 *       - huellaFila / leerHuella: "date|sign|cents|normalised concept"
 *         fingerprint of each bank row. It is stored on the one-off entry
 *         (`importId`) to recognise the same movement when re-importing an
 *         overlapping statement, even if the user later edits the entry's
 *         concept, date or amount.
 *       - comparablesDe: what is already entered, in the shape
 *         detectarDuplicados expects (imported ones, with their fingerprint's
 *         data).
 *       - filasAImportar: which rows go in. By default the "apuntado" flag is
 *         skipped (already in the app) and the "fichero" flag goes in (two
 *         equal coffees on the same day are legit); the user decides row by
 *         row.
 *       - crearPuntualesImportados: rows -> one-off entries with "importado"
 *         origin, their fingerprint, the chosen account and the category of
 *         the first matching rule (or the default category, "Otros").
 * ===========================================================================*/
import { IMPORT_ID_MAX, type Puntual } from "../../types";
import type { MarcaDuplicado, MovimientoComparable } from "./duplicados";
import { categorizar, type ReglaCategoria } from "./reglas";
import { normalizarTexto } from "./texto";
import type { FilaImportada } from "./vistaPrevia";

// ── 1. Huella / Fingerprint ──────────────────────────────────────────────────

// ES: Huella de una fila del extracto, recortada al tope de longitud.
// EN: Fingerprint of a statement row, trimmed to the length cap.
export function huellaFila(
  f: Pick<FilaImportada, "fecha" | "signo" | "centimos" | "concepto">
): string {
  return `${f.fecha}|${f.signo}|${f.centimos}|${normalizarTexto(f.concepto)}`.slice(
    0,
    IMPORT_ID_MAX
  );
}

// ES: Lee una huella; null si no tiene la forma esperada. El concepto es todo
//     lo que va tras el tercer "|" (puede llevar "|" dentro).
// EN: Reads a fingerprint; null if it does not have the expected shape. The
//     concept is everything after the third "|" (it may contain "|").
export function leerHuella(h: string): Omit<MovimientoComparable, "id"> | null {
  const m = /^(\d{4}-\d{2}-\d{2})\|(ingreso|gasto)\|(\d+)\|(.*)$/s.exec(h);
  if (!m) return null;
  return {
    fecha: m[1],
    signo: m[2] as "ingreso" | "gasto",
    importe: Number(m[3]) / 100,
    concepto: m[4],
  };
}

// ── 2. Lo ya apuntado / What is already entered ──────────────────────────────

// ES: Puntuales en la forma de detectarDuplicados. Los importados usan los
//     datos de su huella (el texto del banco); el resto, los suyos.
// EN: One-off entries in detectarDuplicados' shape. Imported ones use their
//     fingerprint's data (the bank text); the rest, their own.
export function comparablesDe(puntuales: Puntual[]): MovimientoComparable[] {
  return puntuales.map((p) => {
    const h = p.importId ? leerHuella(p.importId) : null;
    if (h) return { id: p.id, ...h };
    return { id: p.id, fecha: p.fecha, concepto: p.concepto, importe: p.importe, signo: p.signo };
  });
}

// ── 3. Qué filas entran / Which rows go in ───────────────────────────────────

// ES: Filas a importar según sus marcas y la decisión del usuario (línea ->
//     incluir sí/no). Sin decisión: fuera las "apuntado", dentro el resto.
// EN: Rows to import according to their flags and the user's decision (line
//     -> include yes/no). Without a decision: "apuntado" out, the rest in.
export function filasAImportar(
  filas: FilaImportada[],
  marcas: MarcaDuplicado[],
  decision: Map<number, boolean>
): FilaImportada[] {
  const porLinea = new Map(marcas.map((m) => [m.linea, m]));
  return filas.filter((f) => {
    const d = decision.get(f.linea);
    if (d !== undefined) return d;
    return porLinea.get(f.linea)?.tipo !== "apuntado";
  });
}

// ── 4. Filas -> puntuales / Rows -> one-off entries ──────────────────────────

// ES: Opciones: cuenta destino (opcional) y categoría si ninguna regla encaja.
// EN: Options: destination account (optional) and category if no rule matches.
export interface OpcionesImportar {
  cuenta?: string;
  categoriaPorDefecto?: string;
}

// ES: Convierte las filas en puntuales sin id (los pone el store al guardar).
// EN: Turns the rows into one-off entries without id (the store sets them on save).
export function crearPuntualesImportados(
  filas: FilaImportada[],
  reglas: ReglaCategoria[],
  opciones: OpcionesImportar = {}
): Omit<Puntual, "id">[] {
  const porDefecto = opciones.categoriaPorDefecto ?? "Otros";
  return filas.map((f) => ({
    concepto: f.concepto.trim(),
    importe: f.importe,
    signo: f.signo,
    categoria: categorizar(f.concepto, f.signo, reglas)?.categoria ?? porDefecto,
    fecha: f.fecha,
    ...(opciones.cuenta ? { cuenta: opciones.cuenta } : {}),
    origen: "importado" as const,
    importId: huellaFila(f),
  }));
}
