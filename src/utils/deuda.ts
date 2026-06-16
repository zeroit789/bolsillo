/* ===========================================================================
   Lógica de deudas: a partir de una deuda y un mes, calcula cuánto se ha
   pagado, cuánto queda, la cuota que cuenta ese mes y si ya está saldada.
   La deuda se descuenta sola: cada mes que pasa suma una cuota a lo pagado.
   =========================================================================== */
import type { Deuda, EstadoDeuda } from "../types";
import { diffMeses } from "./format";

// Calcula el estado de una deuda al final del mes indicado ("YYYY-MM").
export function estadoDeuda(deuda: Deuda, mes: string): EstadoDeuda {
  // Meses transcurridos desde el inicio hasta el mes consultado (incluido).
  // Antes del inicio -> 0 cuotas aplicadas.
  const transcurridos = Math.max(0, diffMeses(deuda.inicioMes, mes) + 1);

  // Pagado = lo que ya llevaba + las cuotas aplicadas, tope en el total.
  const pagadoBruto = deuda.pagadoInicial + deuda.cuotaMensual * transcurridos;
  const pagado = Math.min(deuda.total, pagadoBruto);
  const pendiente = Math.max(0, deuda.total - pagado);
  const terminada = pendiente <= 0;

  // Pendiente AL INICIO de este mes (antes de aplicar la cuota de este mes),
  // para saber si este mes todavía toca pagar y cuánto (última cuota parcial).
  const pagadoMesAnterior = Math.min(
    deuda.total,
    deuda.pagadoInicial + deuda.cuotaMensual * Math.max(0, transcurridos - 1)
  );
  const pendienteInicioMes = Math.max(0, deuda.total - pagadoMesAnterior);
  const dentroDeRango = diffMeses(deuda.inicioMes, mes) >= 0;
  const cuotaDelMes =
    dentroDeRango && pendienteInicioMes > 0
      ? Math.min(deuda.cuotaMensual, pendienteInicioMes)
      : 0;

  // Meses que faltan para saldarla por completo.
  const mesesRestantes =
    deuda.cuotaMensual > 0 ? Math.ceil(pendiente / deuda.cuotaMensual) : 0;

  const progreso = deuda.total > 0 ? Math.round((pagado / deuda.total) * 100) : 100;

  return { deuda, pagado, pendiente, cuotaDelMes, terminada, mesesRestantes, progreso };
}

// ¿La deuda se salda EXACTAMENTE en este mes? (para disparar la notificación:
// estaba pendiente al inicio del mes y queda a cero al terminarlo).
export function seSaldaEnMes(deuda: Deuda, mes: string): boolean {
  const est = estadoDeuda(deuda, mes);
  return est.terminada && est.cuotaDelMes > 0;
}
