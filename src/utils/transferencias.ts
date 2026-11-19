/* =============================================================================
 * transferencias.ts — Transferencias entre cuentas y ajustes de saldo
 *                     / Transfers between accounts and balance adjustments
 * -----------------------------------------------------------------------------
 * ES: Lógica pura (sin store) de dos piezas que faltaban para que las cuentas
 *     y el patrimonio cuadren:
 *       - Transferencia (origen, destino, importe, fecha): resta de una cuenta
 *         y suma a otra. NO es ingreso ni gasto: el resumen del mes no cambia y
 *         el patrimonio total tampoco (lo prueban los tests). Se informa aparte
 *         como "movido entre cuentas".
 *       - AjusteSaldo (conciliación): movimiento con signo que deja una cuenta
 *         en el saldo que dice el banco. DECISIÓN: tampoco cuenta como ingreso
 *         ni gasto (es una corrección, no dinero ganado o gastado ese mes); el
 *         resumen lo da aparte en `ajustes` para que no se esconda.
 *     saldosPorCuenta sigue el mismo criterio que `patrimonio` en
 *     stores/finanzas.ts (saldo inicial + movimientos puntuales de la cuenta)
 *     y le suma transferencias y ajustes. Todo se suma en CÉNTIMOS enteros y
 *     se devuelve en euros, para que 0,1 + 0,1 + 0,1 sea 0,3.
 *     Una transferencia con origen = destino no mueve nada; si una de sus
 *     cuentas ya no existe, la otra sí se mueve (el dinero salió o entró).
 * EN: Pure logic (no store) for two missing pieces so accounts and net worth
 *     add up:
 *       - Transferencia (origin, destination, amount, date): subtracts from
 *         one account and adds to another. It is NOT income or expense: the
 *         month summary does not change and neither does total net worth (the
 *         tests prove it). It is reported separately as "moved between
 *         accounts".
 *       - AjusteSaldo (reconciliation): signed movement that leaves an account
 *         at the balance the bank shows. DECISION: it does not count as income
 *         or expense either (it is a correction, not money earned or spent that
 *         month); the summary reports it separately in `ajustes` so it is not
 *         hidden.
 *     saldosPorCuenta follows the same rule as `patrimonio` in
 *     stores/finanzas.ts (initial balance + the account's one-off movements)
 *     and adds transfers and adjustments. Everything is summed in whole CENTS
 *     and returned in euros, so 0.1 + 0.1 + 0.1 is 0.3.
 *     A transfer with origin = destination moves nothing; if one of its
 *     accounts no longer exists, the other one still moves (money left or
 *     came in).
 * ===========================================================================*/
import { IMPORTE_MAX, redondear2 } from "./importe";

// ── 1. Tipos / Types ─────────────────────────────────────────────────────────

// ES: Transferencia entre dos cuentas (importe positivo).
// EN: Transfer between two accounts (positive amount).
export interface Transferencia {
  id: string;
  origen: string; // ES: id de la cuenta que paga / EN: id of the paying account
  destino: string; // ES: id de la cuenta que recibe / EN: id of the receiving account
  importe: number;
  fecha: string; // ES: "AAAA-MM-DD" / EN: "YYYY-MM-DD"
  concepto?: string;
}

// ES: Ajuste de saldo: importe CON signo (+ sube el saldo, - lo baja).
// EN: Balance adjustment: SIGNED amount (+ raises the balance, - lowers it).
export interface AjusteSaldo {
  id: string;
  cuenta: string;
  importe: number;
  fecha: string; // ES: "AAAA-MM-DD" / EN: "YYYY-MM-DD"
  nota?: string;
}

// ES: Lo que hace falta de una cuenta (una Cuenta encaja tal cual).
// EN: What is needed from an account (a Cuenta fits as is).
export interface CuentaBase {
  id: string;
  saldoInicial: number;
}

// ES: Movimiento normal (un Puntual encaja tal cual). Importe positivo.
// EN: Normal movement (a Puntual fits as is). Positive amount.
export interface MovimientoCuenta {
  cuenta?: string;
  importe: number;
  signo: "ingreso" | "gasto";
  fecha: string;
}

// ES: Resumen de un mes con lo movido y lo ajustado aparte.
// EN: Month summary with moved and adjusted amounts kept apart.
export interface ResumenMovimientos {
  ingresos: number;
  gastos: number;
  neto: number; // ES: ingresos - gastos / EN: income - expenses
  movidoEntreCuentas: number; // ES: suma de transferencias del mes / EN: sum of the month's transfers
  ajustes: number; // ES: suma con signo de los ajustes del mes / EN: signed sum of the month's adjustments
}

// ── 2. Ayudas / Helpers ──────────────────────────────────────────────────────

// ES: Euros -> céntimos enteros (redondeo comercial de redondear2).
// EN: Euros -> whole cents (redondear2's commercial rounding).
const aCentimos = (euros: number) => Math.round(redondear2(euros) * 100);

// ES: Céntimos -> euros sin -0. / EN: Cents -> euros without -0.
const aEuros = (centimos: number) => (centimos === 0 ? 0 : centimos / 100);

// ES: ¿La fecha "AAAA-MM-DD…" entra hasta `hasta` (incluido)? Sin tope, sí.
// EN: Does the "YYYY-MM-DD…" date fall up to `hasta` (included)? No cap: yes.
const dentro = (fecha: string, hasta?: string) => !hasta || fecha.slice(0, 10) <= hasta;

// ── 3. Validación / Validation ───────────────────────────────────────────────

// ES: Comprueba una transferencia antes de guardarla.
// EN: Checks a transfer before saving it.
export function validarTransferencia(
  t: Pick<Transferencia, "origen" | "destino" | "importe">
): { ok: true } | { ok: false; error: "sinCuenta" | "mismaCuenta" | "importe" } {
  if (!t.origen.trim() || !t.destino.trim()) return { ok: false, error: "sinCuenta" };
  if (t.origen === t.destino) return { ok: false, error: "mismaCuenta" };
  const importe = redondear2(t.importe);
  if (!Number.isFinite(t.importe) || importe <= 0 || importe > IMPORTE_MAX) {
    return { ok: false, error: "importe" };
  }
  return { ok: true };
}

// ── 4. Saldos y resumen / Balances & summary ─────────────────────────────────

// ES: Saldo de cada cuenta (en el orden de `cuentas`) con movimientos,
//     transferencias y ajustes hasta `hasta` ("AAAA-MM-DD", incluido) o todos.
// EN: Balance of each account (in `cuentas` order) with movements, transfers
//     and adjustments up to `hasta` ("YYYY-MM-DD", included) or all of them.
export function saldosPorCuenta(
  cuentas: CuentaBase[],
  movimientos: MovimientoCuenta[],
  transferencias: Transferencia[] = [],
  ajustes: AjusteSaldo[] = [],
  hasta?: string
): { id: string; saldo: number }[] {
  const saldo = new Map<string, number>(cuentas.map((c) => [c.id, aCentimos(c.saldoInicial)]));
  // ES: Suma céntimos a una cuenta solo si existe en la lista.
  // EN: Adds cents to an account only if it is in the list.
  const sumar = (id: string | undefined, centimos: number) => {
    if (id !== undefined && saldo.has(id)) saldo.set(id, (saldo.get(id) ?? 0) + centimos);
  };
  for (const m of movimientos) {
    if (!dentro(m.fecha, hasta)) continue;
    const c = aCentimos(Math.abs(m.importe));
    sumar(m.cuenta, m.signo === "ingreso" ? c : -c);
  }
  for (const t of transferencias) {
    if (!dentro(t.fecha, hasta) || t.origen === t.destino) continue;
    const c = aCentimos(Math.abs(t.importe));
    sumar(t.origen, -c);
    sumar(t.destino, c);
  }
  for (const a of ajustes) {
    if (dentro(a.fecha, hasta)) sumar(a.cuenta, aCentimos(a.importe));
  }
  return cuentas.map((c) => ({ id: c.id, saldo: aEuros(saldo.get(c.id) ?? 0) }));
}

// ES: Resumen de un mes "AAAA-MM": ingresos y gastos solo de movimientos
//     normales; transferencias y ajustes van aparte (ver cabecera).
// EN: Summary of a "YYYY-MM" month: income and expenses only from normal
//     movements; transfers and adjustments are kept apart (see header).
export function resumenMensual(
  mes: string,
  movimientos: MovimientoCuenta[],
  transferencias: Transferencia[] = [],
  ajustes: AjusteSaldo[] = []
): ResumenMovimientos {
  const delMes = (fecha: string) => fecha.slice(0, 7) === mes;
  let ingresos = 0;
  let gastos = 0;
  for (const m of movimientos) {
    if (!delMes(m.fecha)) continue;
    if (m.signo === "ingreso") ingresos += aCentimos(Math.abs(m.importe));
    else gastos += aCentimos(Math.abs(m.importe));
  }
  const movido = transferencias
    .filter((t) => delMes(t.fecha) && t.origen !== t.destino)
    .reduce((a, t) => a + aCentimos(Math.abs(t.importe)), 0);
  const ajustado = ajustes
    .filter((a) => delMes(a.fecha))
    .reduce((a, x) => a + aCentimos(x.importe), 0);
  return {
    ingresos: aEuros(ingresos),
    gastos: aEuros(gastos),
    neto: aEuros(ingresos - gastos),
    movidoEntreCuentas: aEuros(movido),
    ajustes: aEuros(ajustado),
  };
}

// ── 5. Conciliación / Reconciliation ─────────────────────────────────────────

// ES: Ajuste que lleva la cuenta de `saldoActual` a `saldoObjetivo` (el que
//     dice el banco) en la fecha dada; null si ya cuadran al céntimo. Sin id:
//     lo pone quien lo guarda, como en el resto de altas del store.
// EN: Adjustment taking the account from `saldoActual` to `saldoObjetivo` (the
//     one the bank shows) on the given date; null if they already match to the
//     cent. No id: whoever saves it sets one, like every other store insert.
export function crearAjusteSaldo(
  cuenta: string,
  saldoActual: number,
  saldoObjetivo: number,
  fecha: string
): Omit<AjusteSaldo, "id"> | null {
  const diferencia = aCentimos(saldoObjetivo) - aCentimos(saldoActual);
  if (diferencia === 0) return null;
  return { cuenta, importe: aEuros(diferencia), fecha };
}
