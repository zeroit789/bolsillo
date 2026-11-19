/* =============================================================================
 * duplicados.ts — Duplicados al importar / Duplicates on import
 * -----------------------------------------------------------------------------
 * ES: Marca (nunca quita) las filas importadas que podrían estar repetidas,
 *     para que el asistente las enseñe y el usuario decida:
 *       1. "apuntado": casa con un movimiento que ya está en la app: mismo
 *          signo, mismos CÉNTIMOS, concepto normalizado igual (si no se apaga
 *          con compararConcepto: false) y fechas a no más de `toleranciaDias`
 *          días. El emparejamiento es 1 a 1 y global: se ordenan todas las
 *          parejas posibles por distancia en días (luego por línea y por
 *          posición del apunte) y cada fila y cada apunte se usan una sola
 *          vez. Así un café apuntado no tapa los dos cafés del extracto.
 *       2. "fichero": fila idéntica (fecha, céntimos, signo y concepto
 *          normalizado) a otra anterior del mismo fichero. Es solo un aviso:
 *          dos cafés iguales el mismo día son legítimos.
 *     Una fila lleva como mucho una marca; "apuntado" pesa más que "fichero".
 *     Por defecto toleranciaDias = 0 y compararConcepto = true: lo seguro para
 *     reimportar un extracto que se solapa con otro ya importado (mismo texto
 *     del banco). Para cruzar con lo apuntado a mano (otro concepto, otro día)
 *     la interfaz puede pasar compararConcepto: false y unos días de margen.
 *     Fechas comparadas en UTC (sin cambios de hora) con los 10 primeros
 *     caracteres ("AAAA-MM-DD"); importes de lo apuntado pasados a céntimos
 *     con redondear2, para que 0,1 + 0,2 sea 30 céntimos.
 * EN: Flags (never removes) imported rows that might be repeated, so the
 *     wizard shows them and the user decides:
 *       1. "apuntado": matches a movement already in the app: same sign, same
 *          CENTS, equal normalised concept (unless turned off with
 *          compararConcepto: false) and dates no more than `toleranciaDias`
 *          days apart. Pairing is 1 to 1 and global: every possible pair is
 *          sorted by distance in days (then by line and entry position) and
 *          every row and entry is used only once. So one entered coffee does
 *          not hide the two coffees in the statement.
 *       2. "fichero": row identical (date, cents, sign and normalised concept)
 *          to an earlier one in the same file. Only a warning: two equal
 *          coffees on the same day are legit.
 *     A row carries at most one flag; "apuntado" outweighs "fichero".
 *     Defaults toleranciaDias = 0 and compararConcepto = true: the safe choice
 *     to re-import a statement overlapping one already imported (same bank
 *     text). To cross with hand-entered items (another concept, another day)
 *     the UI can pass compararConcepto: false and a few days of margin.
 *     Dates compared in UTC (no DST changes) using the first 10 characters
 *     ("YYYY-MM-DD"); entered amounts turned into cents with redondear2, so
 *     0.1 + 0.2 is 30 cents.
 * ===========================================================================*/
import { redondear2 } from "../importe";
import { normalizarTexto } from "./texto";
import type { FilaImportada, SignoMovimiento } from "./vistaPrevia";

// ES: Movimiento ya apuntado (un Puntual encaja tal cual). Importe en euros.
// EN: Already entered movement (a Puntual fits as is). Amount in euros.
export interface MovimientoComparable {
  id?: string;
  fecha: string;
  concepto: string;
  importe: number;
  signo: SignoMovimiento;
}

// ES: Opciones de la detección. / EN: Detection options.
export interface OpcionesDuplicados {
  toleranciaDias?: number; // ES: ± días; 0 = misma fecha / EN: ± days; 0 = same date
  compararConcepto?: boolean; // ES: true por defecto / EN: true by default
}

// ES: Marca de posible duplicado de una fila importada.
// EN: Possible-duplicate flag of an imported row.
export type MarcaDuplicado =
  | { linea: number; tipo: "apuntado"; id: string; dias: number }
  | { linea: number; tipo: "fichero"; lineaOriginal: number };

// ES: Días desde 1970 de una fecha "AAAA-MM-DD…" (UTC); NaN si no se lee.
// EN: Days since 1970 of a "YYYY-MM-DD…" date (UTC); NaN if unreadable.
function diaUTC(fecha: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

// ES: Detecta los posibles duplicados (ver cabecera). Devuelve las marcas
//     ordenadas por línea; las filas no se tocan.
// EN: Detects possible duplicates (see header). Returns the flags sorted by
//     line; rows are left untouched.
export function detectarDuplicados(
  filas: FilaImportada[],
  apuntados: MovimientoComparable[],
  opciones: OpcionesDuplicados = {}
): MarcaDuplicado[] {
  const tolerancia = Math.max(0, Math.floor(opciones.toleranciaDias ?? 0));
  const conConcepto = opciones.compararConcepto ?? true;
  const marcas = new Map<number, MarcaDuplicado>();

  // ES: Clave de agrupación: signo + céntimos (+ concepto si se compara).
  // EN: Grouping key: sign + cents (+ concept when compared).
  const clave = (signo: string, centimos: number, concepto: string) =>
    `${signo}|${centimos}|${conConcepto ? normalizarTexto(concepto) : ""}`;

  // ── 1. Contra lo apuntado / Against what is entered ────────────────────────
  const grupos = new Map<string, { indice: number; dia: number }[]>();
  apuntados.forEach((a, indice) => {
    const centimos = Math.round(redondear2(Math.abs(a.importe)) * 100);
    const k = clave(a.signo, centimos, a.concepto);
    const lista = grupos.get(k) ?? [];
    lista.push({ indice, dia: diaUTC(a.fecha) });
    grupos.set(k, lista);
  });
  const parejas: { fila: number; apunte: number; dias: number }[] = [];
  filas.forEach((f, posicion) => {
    const candidatos = grupos.get(clave(f.signo, f.centimos, f.concepto));
    if (!candidatos) return;
    const dia = diaUTC(f.fecha);
    for (const c of candidatos) {
      const dias = Math.abs(dia - c.dia);
      if (dias <= tolerancia) parejas.push({ fila: posicion, apunte: c.indice, dias });
    }
  });
  parejas.sort(
    (a, b) => a.dias - b.dias || filas[a.fila].linea - filas[b.fila].linea || a.apunte - b.apunte
  );
  const filasUsadas = new Set<number>();
  const apuntesUsados = new Set<number>();
  for (const p of parejas) {
    if (filasUsadas.has(p.fila) || apuntesUsados.has(p.apunte)) continue;
    filasUsadas.add(p.fila);
    apuntesUsados.add(p.apunte);
    const linea = filas[p.fila].linea;
    const id = apuntados[p.apunte].id ?? String(p.apunte);
    marcas.set(linea, { linea, tipo: "apuntado", id, dias: p.dias });
  }

  // ── 2. Dentro del fichero / Within the file ────────────────────────────────
  // ES: Aquí el concepto se compara siempre: son filas del mismo banco.
  // EN: Here the concept is always compared: they are rows from the same bank.
  const vistas = new Map<string, number>();
  for (const f of filas) {
    const k = `${f.fecha.slice(0, 10)}|${f.signo}|${f.centimos}|${normalizarTexto(f.concepto)}`;
    const primera = vistas.get(k);
    if (primera === undefined) vistas.set(k, f.linea);
    else if (!marcas.has(f.linea)) {
      marcas.set(f.linea, { linea: f.linea, tipo: "fichero", lineaOriginal: primera });
    }
  }

  return [...marcas.values()].sort((a, b) => a.linea - b.linea);
}
