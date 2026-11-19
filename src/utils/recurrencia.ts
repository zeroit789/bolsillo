/* =============================================================================
 * recurrencia.ts — Recurrentes reales / Real recurring entries
 * -----------------------------------------------------------------------------
 * ES: Cálculo puro de cuándo toca un recurrente con frecuencia semanal,
 *     mensual, trimestral o anual, con fin por fecha o por número de cuotas.
 *     ocurrenciasEnMes dice, para un mes "AAAA-MM", en qué fechas exactas toca
 *     y cuánto suma (en céntimos enteros y en euros).
 *     Compatibilidad: un Recurrente de hoy (sin `frecuencia`, `fechaInicio`,
 *     `fechaFin` ni `cuotas`) toca exactamente UNA vez en cada mes entre
 *     `desde` y `hasta`, igual que recurrenteVivo en stores/finanzas.ts.
 *     Reglas:
 *       - Inicio S: `fechaInicio` si existe; si no, el día 1 de `desde`.
 *       - Mensual, trimestral (cada 3 meses) y anual (cada 12): el ciclo
 *         arranca en el mes de S; el día es `diaPago` o, si no hay, el día de
 *         `fechaInicio` (o el 1). Si el mes es más corto, se recorta al último
 *         día (31 -> 30 o 28/29; anual del 29-2 -> 28-2), sin saltarse el mes
 *         y sin mover el día de los meses siguientes. Un cobro del primer ciclo
 *         anterior a S no cuenta (alta el 20 con pago el día 5: empieza el
 *         ciclo siguiente).
 *       - Semanal: cada 7 días desde S (el día de la semana lo da S; diaPago no
 *         se usa). Sale 4 o 5 veces según el mes.
 *       - Fin: `hasta` (mes incluido), `fechaFin` (día incluido) y `cuotas`
 *         (número total de cobros, contados desde el primero real). Se aplican
 *         todos los que haya. `cuotas` <= 0 o no entero: no toca nunca.
 *     Las fechas se calculan con días UTC (Date.UTC): el cambio de hora no
 *     mueve ningún cobro. Las cuotas se cuentan por índice aritmético, sin
 *     recorrer los meses anteriores.
 * EN: Pure calculation of when a recurring entry falls due with a weekly,
 *     monthly, quarterly or yearly frequency, ending by date or by number of
 *     instalments. ocurrenciasEnMes tells, for a "YYYY-MM" month, on which
 *     exact dates it falls and how much it adds up to (in whole cents and in
 *     euros).
 *     Compatibility: today's Recurrente (no `frecuencia`, `fechaInicio`,
 *     `fechaFin` or `cuotas`) falls exactly ONCE in every month between
 *     `desde` and `hasta`, like recurrenteVivo in stores/finanzas.ts.
 *     Rules:
 *       - Start S: `fechaInicio` if present; otherwise day 1 of `desde`.
 *       - Monthly, quarterly (every 3 months) and yearly (every 12): the cycle
 *         starts in S's month; the day is `diaPago` or, if missing, the day of
 *         `fechaInicio` (or the 1st). If the month is shorter, it is clipped to
 *         the last day (31 -> 30 or 28/29; yearly on 29-2 -> 28-2), without
 *         skipping the month and without moving the day of later months. A
 *         first-cycle charge before S does not count (created on the 20th with
 *         payment on the 5th: it starts on the next cycle).
 *       - Weekly: every 7 days from S (S sets the weekday; diaPago is not
 *         used). It happens 4 or 5 times depending on the month.
 *       - End: `hasta` (month included), `fechaFin` (day included) and
 *         `cuotas` (total number of charges, counted from the first real one).
 *         Every one present applies. `cuotas` <= 0 or non-integer: never due.
 *     Dates are computed with UTC days (Date.UTC): DST changes never move a
 *     charge. Instalments are counted by arithmetic index, without walking
 *     the earlier months.
 * ===========================================================================*/
import { redondear2 } from "./importe";

// ── 1. Tipos / Types ─────────────────────────────────────────────────────────

// ES: Frecuencias admitidas (sin frecuencia = mensual).
// EN: Supported frequencies (no frequency = monthly).
export type Frecuencia = "semanal" | "mensual" | "trimestral" | "anual";

// ES: Lo que el cálculo necesita de un recurrente. Un Recurrente de
//     types/index.ts encaja tal cual; los campos nuevos son opcionales.
// EN: What the calculation needs from a recurring entry. A Recurrente from
//     types/index.ts fits as is; the new fields are optional.
export interface RecurrenteProgramable {
  importe: number; // ES: euros, positivo / EN: euros, positive
  desde: string; // ES: "AAAA-MM" / EN: "YYYY-MM"
  hasta: string | null; // ES: "AAAA-MM" incluido o null / EN: "YYYY-MM" included or null
  diaPago?: number; // ES: 1-31 / EN: 1-31
  frecuencia?: Frecuencia;
  fechaInicio?: string; // ES: "AAAA-MM-DD" / EN: "YYYY-MM-DD"
  fechaFin?: string; // ES: "AAAA-MM-DD" incluido / EN: "YYYY-MM-DD" included
  cuotas?: number; // ES: número total de cobros / EN: total number of charges
}

// ES: Resultado para un mes. / EN: Result for one month.
export interface OcurrenciasMes {
  fechas: string[]; // ES: "AAAA-MM-DD" en orden / EN: "YYYY-MM-DD" in order
  veces: number;
  centimos: number; // ES: veces × importe en céntimos / EN: times × amount in cents
  importe: number; // ES: euros / EN: euros
}

// ── 2. Fechas en días UTC / Dates in UTC days ────────────────────────────────

const MS_DIA = 86_400_000;

// ES: Días desde 1970 de un año, mes (1-12) y día, en UTC.
// EN: Days since 1970 for a year, month (1-12) and day, in UTC.
function dia(anio: number, mes: number, d: number): number {
  return Date.UTC(anio, mes - 1, d) / MS_DIA;
}

// ES: "AAAA-MM-DD" de un número de días UTC.
// EN: "YYYY-MM-DD" of a UTC day number.
function iso(dias: number): string {
  return new Date(dias * MS_DIA).toISOString().slice(0, 10);
}

// ES: Días de un mes (1-12). / EN: Days in a month (1-12).
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

// ES: Lee "AAAA-MM" (mes 1-12) o null. / EN: Reads "YYYY-MM" (month 1-12) or null.
function leerMes(texto: string): { anio: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(texto);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return { anio: Number(m[1]), mes: Number(m[2]) };
}

// ES: Lee "AAAA-MM-DD…" a días UTC o null. / EN: Reads "YYYY-MM-DD…" into UTC days or null.
function leerFecha(texto: string | undefined): number | null {
  const m = texto ? /^(\d{4})-(\d{2})-(\d{2})/.exec(texto) : null;
  return m ? dia(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

// ── 3. Ocurrencias / Occurrences ─────────────────────────────────────────────

// ES: Fechas (en días UTC) en las que toca el recurrente dentro del mes, con
//     su número de cobro (0 = el primero), antes de aplicar el fin.
// EN: Dates (in UTC days) the entry falls on within the month, with their
//     charge number (0 = the first), before applying the end.
function candidatas(
  r: RecurrenteProgramable,
  anio: number,
  mes: number
): { dia: number; n: number }[] {
  const inicioMes = leerMes(r.desde);
  const s = leerFecha(r.fechaInicio) ?? (inicioMes ? dia(inicioMes.anio, inicioMes.mes, 1) : null);
  if (s === null) return [];
  const inicio = new Date(s * MS_DIA);
  const aS = inicio.getUTCFullYear();
  const mS = inicio.getUTCMonth() + 1;
  const primero = dia(anio, mes, 1);
  const ultimo = dia(anio, mes, diasDelMes(anio, mes));

  // ES: Semanal: n-ésimo cobro en S + 7n; se buscan los n que caen en el mes.
  // EN: Weekly: n-th charge at S + 7n; find the n falling within the month.
  if (r.frecuencia === "semanal") {
    const nMin = Math.max(0, Math.ceil((primero - s) / 7));
    const nMax = Math.floor((ultimo - s) / 7);
    const lista: { dia: number; n: number }[] = [];
    for (let n = nMin; n <= nMax; n++) lista.push({ dia: s + 7 * n, n });
    return lista;
  }

  // ES: Por meses: paso k y día de anclaje (recortado al final de cada mes).
  // EN: By months: step k and anchor day (clipped to each month's end).
  const k = r.frecuencia === "trimestral" ? 3 : r.frecuencia === "anual" ? 12 : 1;
  const ancla = r.diaPago ?? (r.fechaInicio ? inicio.getUTCDate() : 1);
  const recortado = (a: number, m: number) => dia(a, m, Math.min(ancla, diasDelMes(a, m)));
  const diff = (anio - aS) * 12 + (mes - mS);
  if (diff < 0 || diff % k !== 0) return [];
  // ES: Si el cobro del primer ciclo cae antes de S, se salta (desfase 1).
  // EN: If the first-cycle charge falls before S, it is skipped (offset 1).
  const desfase = recortado(aS, mS) < s ? 1 : 0;
  const i = diff / k;
  if (i < desfase) return [];
  return [{ dia: recortado(anio, mes), n: i - desfase }];
}

// ES: Ocurrencias de un recurrente en un mes "AAAA-MM" (ver cabecera).
// EN: Occurrences of a recurring entry in a "YYYY-MM" month (see header).
export function ocurrenciasEnMes(r: RecurrenteProgramable, mes: string): OcurrenciasMes {
  const vacio: OcurrenciasMes = { fechas: [], veces: 0, centimos: 0, importe: 0 };
  const m = leerMes(mes);
  if (!m) return vacio;
  if (r.cuotas !== undefined && !(Number.isInteger(r.cuotas) && r.cuotas > 0)) return vacio;
  if (r.hasta !== null && mes > r.hasta) return vacio;
  const fin = leerFecha(r.fechaFin);

  const fechas = candidatas(r, m.anio, m.mes)
    .filter((c) => (fin === null || c.dia <= fin) && (r.cuotas === undefined || c.n < r.cuotas))
    .map((c) => iso(c.dia));
  const centimos = fechas.length * Math.round(redondear2(r.importe) * 100);
  return { fechas, veces: fechas.length, centimos, importe: centimos / 100 };
}
