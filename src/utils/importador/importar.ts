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
 *       - marcarDuplicados: marcas de duplicado de la vista previa. Con
 *         cuenta destino solo mira esa cuenta y lo que no tiene cuenta (un
 *         cargo igual en otra cuenta es otro movimiento). Primero empareja
 *         lo importado (por su huella), luego lo apuntado a mano exacto y,
 *         si se pide, una pasada tolerante (±3 días, sin concepto) con lo
 *         manual que queda, sin reutilizar filas ni apuntes ya emparejados. Los
 *         conceptos se comparan normalizados y recortados a 500 caracteres,
 *         igual que en la huella.
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
 *       - marcarDuplicados: duplicate flags for the preview. With a
 *         destination account it only looks at that account and at items
 *         without an account (an equal charge in another account is another
 *         movement). It first pairs imported items (by fingerprint), then
 *         exact hand-entered ones and, if asked, a tolerant pass (±3 days,
 *         no concept) with the manual ones left, without reusing already
 *         paired rows or entries. Concepts are compared normalised and cut to 500
 *         characters, the same as in the fingerprint.
 *       - filasAImportar: which rows go in. By default the "apuntado" flag is
 *         skipped (already in the app) and the "fichero" flag goes in (two
 *         equal coffees on the same day are legit); the user decides row by
 *         row.
 *       - crearPuntualesImportados: rows -> one-off entries with "importado"
 *         origin, their fingerprint, the chosen account and the category of
 *         the first matching rule (or the default category, "Otros").
 * ===========================================================================*/
import { IMPORT_ID_MAX, type Puntual } from "../../types";
import { detectarDuplicados, type MarcaDuplicado, type MovimientoComparable } from "./duplicados";
import { categorizar, type ReglaCategoria } from "./reglas";
import { normalizarTexto } from "./texto";
import type { FilaImportada } from "./vistaPrevia";

// ── 1. Huella / Fingerprint ──────────────────────────────────────────────────

// ES: Caracteres del concepto normalizado que cuentan para comparar y para la huella.
// EN: Characters of the normalised concept that count for comparing and for the fingerprint.
const MAX_CONCEPTO = 500;

// ES: Concepto en la forma en que se compara. / EN: Concept in the form it is compared.
function conceptoComparable(concepto: string): string {
  return normalizarTexto(concepto).slice(0, MAX_CONCEPTO);
}

// ES: Huella de una fila del extracto, recortada al tope de longitud.
// EN: Fingerprint of a statement row, trimmed to the length cap.
export function huellaFila(
  f: Pick<FilaImportada, "fecha" | "signo" | "centimos" | "concepto">
): string {
  return `${f.fecha}|${f.signo}|${f.centimos}|${conceptoComparable(f.concepto)}`.slice(
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

// ES: Opciones de marcarDuplicados. / EN: marcarDuplicados options.
export interface OpcionesMarcar {
  cuenta?: string; // ES: cuenta destino de la importación / EN: import destination account
  manuales?: boolean; // ES: pasada tolerante sobre lo apuntado a mano / EN: tolerant pass over hand-entered items
}

// ES: Marcas de duplicado de las filas frente a lo apuntado (ver cabecera).
// EN: Duplicate flags of the rows against what is entered (see header).
export function marcarDuplicados(
  filas: FilaImportada[],
  puntuales: Puntual[],
  opciones: OpcionesMarcar
): MarcaDuplicado[] {
  const candidatos = opciones.cuenta
    ? puntuales.filter((p) => !p.cuenta || p.cuenta === opciones.cuenta)
    : puntuales;
  const recortar = <T extends { concepto: string }>(x: T): T => ({
    ...x,
    concepto: conceptoComparable(x.concepto),
  });
  const filasC = filas.map(recortar);
  const importados = candidatos.filter((p) => p.origen === "importado");
  const manuales = candidatos.filter((p) => p.origen !== "importado");
  // ES: Pasada 1: lo importado, por su huella (texto del banco). Da también
  //     las marcas "fichero" de todas las filas.
  // EN: Pass 1: imported items, by their fingerprint (bank text). It also
  //     gives the "fichero" flags of every row.
  const porLinea = new Map(
    detectarDuplicados(filasC, comparablesDe(importados).map(recortar)).map((m) => [m.linea, m])
  );
  // ES: Filas aún sin pareja y apuntes ya usados (no se reutilizan).
  // EN: Rows still unpaired and entries already used (never reused).
  const libres = () => filasC.filter((f) => porLinea.get(f.linea)?.tipo !== "apuntado");
  const usados = () =>
    new Set([...porLinea.values()].flatMap((m) => (m.tipo === "apuntado" ? [m.id] : [])));
  // ES: Pasada 2: lo apuntado a mano, exacto, con las filas que quedan.
  // EN: Pass 2: hand-entered items, exact, with the remaining rows.
  for (const m of detectarDuplicados(libres(), comparablesDe(manuales).map(recortar))) {
    if (m.tipo === "apuntado") porLinea.set(m.linea, m);
  }
  // ES: Pasada 3 (si se pide): tolerante, con lo manual que sigue libre.
  // EN: Pass 3 (if asked): tolerant, with the manual items still free.
  if (opciones.manuales) {
    const usadosYa = usados();
    const extra = detectarDuplicados(
      libres(),
      comparablesDe(manuales.filter((p) => !usadosYa.has(p.id))).map(recortar),
      { toleranciaDias: 3, compararConcepto: false }
    );
    for (const m of extra) if (m.tipo === "apuntado") porLinea.set(m.linea, m);
  }
  return [...porLinea.values()].sort((a, b) => a.linea - b.linea);
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
