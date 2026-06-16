/* =============================================================================
 * deuda.ts — Debt amortization logic / Lógica de amortización de deudas
 * -----------------------------------------------------------------------------
 * EN: Debt logic: given a debt and a month, computes how much has been paid, how
 *     much remains, the installment that counts for that month, and whether it is
 *     already settled. The debt amortizes by itself: each month that passes adds
 *     one installment to the amount paid.
 * ES: Lógica de deudas: a partir de una deuda y un mes, calcula cuánto se ha
 *     pagado, cuánto queda, la cuota que cuenta ese mes y si ya está saldada.
 *     La deuda se descuenta sola: cada mes que pasa suma una cuota a lo pagado.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Debt state for a month / Estado de la deuda en un mes
 *   2. Settled-this-month check / Comprobar si se salda este mes
 * ===========================================================================*/
import type { Deuda, EstadoDeuda } from "../types";
import { diffMeses } from "./format";

// ── 1. Debt state for a month / Estado de la deuda en un mes ──────────────────
// EN: Computes the state of a debt at the END of the given month ("YYYY-MM").
// ES: Calcula el estado de una deuda al final del mes indicado ("YYYY-MM").
export function estadoDeuda(deuda: Deuda, mes: string): EstadoDeuda {
  // EN: Months elapsed from the start up to the queried month (inclusive).
  //     Before the start -> 0 installments applied.
  // ES: Meses transcurridos desde el inicio hasta el mes consultado (incluido).
  //     Antes del inicio -> 0 cuotas aplicadas.
  const transcurridos = Math.max(0, diffMeses(deuda.inicioMes, mes) + 1);

  // EN: Paid = what it already carried + the applied installments, capped at total.
  // ES: Pagado = lo que ya llevaba + las cuotas aplicadas, tope en el total.
  const pagadoBruto = deuda.pagadoInicial + deuda.cuotaMensual * transcurridos;
  const pagado = Math.min(deuda.total, pagadoBruto);
  const pendiente = Math.max(0, deuda.total - pagado);
  const terminada = pendiente <= 0;

  // EN: Outstanding AT THE START of this month (before applying this month's
  //     installment), to know whether this month still owes payment and how much
  //     (handles the last, partial installment).
  // ES: Pendiente AL INICIO de este mes (antes de aplicar la cuota de este mes),
  //     para saber si este mes todavía toca pagar y cuánto (última cuota parcial).
  const pagadoMesAnterior = Math.min(
    deuda.total,
    deuda.pagadoInicial + deuda.cuotaMensual * Math.max(0, transcurridos - 1)
  );
  const pendienteInicioMes = Math.max(0, deuda.total - pagadoMesAnterior);
  // EN: Is the queried month at or after the debt's start month?
  // ES: ¿El mes consultado es igual o posterior al mes de inicio de la deuda?
  const dentroDeRango = diffMeses(deuda.inicioMes, mes) >= 0;
  // EN: Installment counted this month: the regular installment, or just the
  //     remaining balance if it is smaller (the final partial payment).
  // ES: Cuota que cuenta este mes: la cuota normal, o solo lo pendiente si es
  //     menor (el último pago parcial).
  const cuotaDelMes =
    dentroDeRango && pendienteInicioMes > 0
      ? Math.min(deuda.cuotaMensual, pendienteInicioMes)
      : 0;

  // EN: Months left to fully settle the debt (rounded up; 0 if no installment).
  // ES: Meses que faltan para saldarla por completo (redondeo arriba; 0 sin cuota).
  const mesesRestantes =
    deuda.cuotaMensual > 0 ? Math.ceil(pendiente / deuda.cuotaMensual) : 0;

  // EN: Progress 0-100 (% paid), clamped; 100 if the total is 0 (nothing to owe).
  // ES: Progreso 0-100 (% pagado), acotado; 100 si el total es 0 (nada que deber).
  const progreso =
    deuda.total > 0 ? Math.min(100, Math.max(0, Math.round((pagado / deuda.total) * 100))) : 100;

  return { deuda, pagado, pendiente, cuotaDelMes, terminada, mesesRestantes, progreso };
}

// ── 2. Settled-this-month check / Comprobar si se salda este mes ──────────────
// EN: Is the debt settled EXACTLY in this month? (used to fire the notification:
//     it was outstanding at the start of the month and reaches zero by its end).
// ES: ¿La deuda se salda EXACTAMENTE en este mes? (para disparar la notificación:
//     estaba pendiente al inicio del mes y queda a cero al terminarlo).
export function seSaldaEnMes(deuda: Deuda, mes: string): boolean {
  const est = estadoDeuda(deuda, mes);
  return est.terminada && est.cuotaDelMes > 0;
}
