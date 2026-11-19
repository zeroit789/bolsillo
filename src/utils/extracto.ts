/* =============================================================================
 * extracto.ts — Abrir un extracto bancario / Opening a bank statement
 * -----------------------------------------------------------------------------
 * ES: Puente entre el fichero que elige el usuario y la vista previa del
 *     importador:
 *       - elegirExtractoNativo: en la app (Tauri), Rust abre el diálogo y
 *         devuelve los bytes (la ruta no sale de Rust). En el navegador de
 *         desarrollo no existe y la vista usa un <input type="file">.
 *       - abrirExtracto: bytes de cualquier origen -> XLSX (firma ZIP
 *         "PK\x03\x04", se lee la primera hoja) o CSV (texto UTF-8 o
 *         Windows-1252). El CSV se guarda como texto para poder releerlo con
 *         otro separador si el perfil del banco lo fija.
 *       - matrizDe: la matriz de celdas que espera crearVistaPrevia.
 *     Los fallos salen como ErrorExtracto con un código que la vista traduce:
 *     "vacio", "grande", "xls" (formato antiguo de Excel, no admitido),
 *     "xlsx" (no se pudo leer el libro), "hoja" (demasiadas filas o columnas)
 *     y "comillas" (CSV con una comilla sin cerrar, con su fila).
 * EN: Bridge between the file the user picks and the importer's preview:
 *       - elegirExtractoNativo: in the app (Tauri), Rust opens the dialog and
 *         returns the bytes (the path never leaves Rust). It does not exist in
 *         the development browser, where the view uses an <input type="file">.
 *       - abrirExtracto: bytes from any source -> XLSX (ZIP signature
 *         "PK\x03\x04", the first sheet is read) or CSV (UTF-8 or Windows-1252
 *         text). The CSV is kept as text so it can be re-read with another
 *         separator if the bank profile sets one.
 *       - matrizDe: the cell matrix crearVistaPrevia expects.
 *     Failures come out as ErrorExtracto with a code the view translates:
 *     "vacio", "grande", "xls" (old Excel format, not supported), "xlsx"
 *     (the workbook could not be read), "hoja" (too many rows or columns) and
 *     "comillas" (CSV with an unclosed quote, with its row).
 * ===========================================================================*/
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ErrorCSV, leerCSV, type SeparadorCSV } from "./importador/csv";
import { decodificarBytes } from "./importador/texto";
import { ErrorXLSX, leerXLSX, MAX_BYTES, type Celda } from "./importador/xlsx";

// ── 1. Tipos y errores / Types & errors ──────────────────────────────────────

// ES: Extracto abierto: texto de un CSV o matriz ya leída de un XLSX.
// EN: Opened statement: a CSV's text or an already read XLSX matrix.
export type FicheroExtracto = { tipo: "csv"; texto: string } | { tipo: "xlsx"; matriz: Celda[][] };

// ES: Código de fallo al abrir o leer un extracto (ver cabecera).
// EN: Failure code when opening or reading a statement (see header).
export type CodigoExtracto = "vacio" | "grande" | "xls" | "xlsx" | "hoja" | "comillas";

// ES: Error con su código y, para "comillas", la fila donde empieza.
// EN: Error with its code and, for "comillas", the row where it starts.
export class ErrorExtracto extends Error {
  constructor(
    public readonly codigo: CodigoExtracto,
    public readonly fila?: number
  ) {
    super(`extracto-${codigo}`);
    this.name = "ErrorExtracto";
  }
}

// ── 2. Elegir el fichero / Picking the file ──────────────────────────────────

// ES: ¿Hay diálogo nativo? (solo dentro de la app). / EN: Is there a native dialog? (inside the app only).
export function hayDialogoNativo(): boolean {
  return isTauri();
}

// ES: Abre el diálogo nativo desde Rust y devuelve los bytes, o null si se
//     cancela. Rust ya corta en 20 MB ("extracto-grande").
// EN: Opens the native dialog from Rust and returns the bytes, or null if
//     cancelled. Rust already stops at 20 MB ("extracto-grande").
export async function elegirExtractoNativo(): Promise<Uint8Array | null> {
  try {
    const r = await invoke<ArrayBuffer>("elegir_extracto");
    const bytes = new Uint8Array(r);
    return bytes.byteLength ? bytes : null;
  } catch (e) {
    if (e === "extracto-grande") throw new ErrorExtracto("grande");
    throw e;
  }
}

// ── 3. Abrir y leer / Opening & reading ──────────────────────────────────────

// ES: ¿Empiezan los bytes por esta firma? / EN: Do the bytes start with this signature?
function empiezaPor(b: Uint8Array, firma: number[]): boolean {
  return b.length >= firma.length && firma.every((x, i) => b[i] === x);
}

// ES: Abre unos bytes como extracto (ver cabecera).
// EN: Opens some bytes as a statement (see header).
export async function abrirExtracto(bytes: Uint8Array): Promise<FicheroExtracto> {
  if (bytes.byteLength === 0) throw new ErrorExtracto("vacio");
  if (bytes.byteLength > MAX_BYTES) throw new ErrorExtracto("grande");
  // ES: Firma de los .xls antiguos (OLE2). / EN: Signature of old .xls files (OLE2).
  if (empiezaPor(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw new ErrorExtracto("xls");
  }
  if (empiezaPor(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    try {
      return { tipo: "xlsx", matriz: await leerXLSX(bytes) };
    } catch (e) {
      throw new ErrorExtracto(e instanceof ErrorXLSX ? "hoja" : "xlsx");
    }
  }
  const texto = decodificarBytes(bytes);
  if (!texto.trim()) throw new ErrorExtracto("vacio");
  return { tipo: "csv", texto };
}

// ES: Matriz de celdas del extracto; en un CSV, con el separador dado o
//     detectado. Lanza ErrorExtracto("comillas", fila) si una comilla no cierra.
// EN: Cell matrix of the statement; for a CSV, with the given or detected
//     separator. Throws ErrorExtracto("comillas", row) if a quote is unclosed.
export function matrizDe(f: FicheroExtracto, separador?: SeparadorCSV): Celda[][] {
  if (f.tipo === "xlsx") return f.matriz;
  try {
    return leerCSV(f.texto, separador ? { separador } : {});
  } catch (e) {
    if (e instanceof ErrorCSV) throw new ErrorExtracto("comillas", e.fila);
    throw e;
  }
}
