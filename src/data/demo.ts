/* =============================================================================
 * demo.ts — Generic demo dataset / Conjunto de datos DEMO genérico
 * -----------------------------------------------------------------------------
 * EN: Generic, made-up demo data (belongs to nobody real) so the app starts with
 *     some content. Includes recurring entries, one-off entries, sample debts,
 *     plans, budgets, quick-add templates and accounts.
 * ES: Datos DEMO genéricos (inventados, de nadie real) para que la app arranque
 *     con contenido. Incluye recurrentes, puntuales, deudas de ejemplo, planes,
 *     presupuestos, plantillas de alta rápida y cuentas.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports / Importaciones
 *   2. ID generator / Generador de IDs
 *   3. Demo data builder / Constructor de datos demo
 * ===========================================================================*/

// ── 1. Imports / Importaciones ────────────────────────────────────────────────
// EN: Domain type for the whole dataset, plus date helpers (current month and
//     month arithmetic) used to anchor the demo data to "today".
// ES: Tipo de dominio del conjunto completo, más utilidades de fecha (mes actual
//     y aritmética de meses) usadas para anclar los datos demo a "hoy".
import type { DatosBolsillo } from "../types";
import { mesActual, sumarMeses } from "../utils/format";

// ── 2. ID generator / Generador de IDs ────────────────────────────────────────
// EN: Cheap unique-ish ID: base36 timestamp + a short random suffix. Good enough
//     to distinguish demo records (not a cryptographic identifier).
// ES: ID único barato: timestamp en base36 + sufijo aleatorio corto. Suficiente
//     para distinguir registros demo (no es un identificador criptográfico).
function nuevoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── 3. Demo data builder / Constructor de datos demo ──────────────────────────
// EN: Builds the full demo dataset. Dates are computed relative to the current
//     month so the sample data always looks recent.
// ES: Construye el conjunto demo completo. Las fechas se calculan en relación al
//     mes actual para que los datos de ejemplo siempre parezcan recientes.
export function datosDemo(): DatosBolsillo {
  const mes = mesActual();
  // EN: helper -> the month "n" months before the current one.
  // ES: ayuda -> el mes "n" meses antes del actual.
  const haceMeses = (n: number) => sumarMeses(mes, -n);
  // EN: helper -> a YYYY-MM-DD date for day "d" within the current month.
  // ES: ayuda -> una fecha YYYY-MM-DD para el día "d" dentro del mes actual.
  const dia = (d: number) => `${mes}-${String(d).padStart(2, "0")}`;

  return {
    // EN: Recurring entries (repeat every month from their start date).
    // ES: Recurrentes (se repiten cada mes desde su alta).
    recurrentes: [
      { id: nuevoId(), concepto: "Nómina", importe: 1800, signo: "ingreso", categoria: "Nómina", desde: haceMeses(5), hasta: null },
      { id: nuevoId(), concepto: "Alquiler", importe: 650, signo: "gasto", categoria: "Alquiler", desde: haceMeses(5), hasta: null },
      { id: nuevoId(), concepto: "Fibra + móvil", importe: 45, signo: "gasto", categoria: "Internet", desde: haceMeses(5), hasta: null },
      { id: nuevoId(), concepto: "Suscripciones", importe: 25, signo: "gasto", categoria: "Suscripciones", desde: haceMeses(5), hasta: null },
      { id: nuevoId(), concepto: "Gimnasio", importe: 30, signo: "gasto", categoria: "Gimnasio", desde: haceMeses(3), hasta: null },
    ],
    // EN: One-off entries for the current month.
    // ES: Puntuales del mes en curso.
    puntuales: [
      { id: nuevoId(), concepto: "Compra semanal", importe: 95, signo: "gasto", categoria: "Supermercado", fecha: dia(8) },
      { id: nuevoId(), concepto: "Gasolina", importe: 60, signo: "gasto", categoria: "Gasolina", fecha: dia(10) },
      { id: nuevoId(), concepto: "Cena fuera", importe: 38, signo: "gasto", categoria: "Restaurantes", fecha: dia(14) },
      { id: nuevoId(), concepto: "Venta de segunda mano", importe: 50, signo: "ingreso", categoria: "Ventas", fecha: dia(15) },
    ],
    // EN: Sample debts.
    // ES: Deudas de ejemplo.
    deudas: [
      { id: nuevoId(), concepto: "Coche", tipo: "coche", total: 12000, cuotaMensual: 280, pagadoInicial: 3500, inicioMes: haceMeses(5) },
      { id: nuevoId(), concepto: "Tarjeta de crédito", tipo: "tarjeta", total: 1500, cuotaMensual: 150, pagadoInicial: 300, inicioMes: haceMeses(3) },
    ],
    // EN: Sample plans / goals.
    // ES: Planes / metas de ejemplo.
    planes: [
      { id: nuevoId(), nombre: "Vacaciones de verano", objetivo: 800, aportado: 250 },
      { id: nuevoId(), nombre: "Pintar el salón", objetivo: 120, aportado: 40 },
    ],
    // EN: Sample budgets (per-category caps).
    // ES: Presupuestos de ejemplo (topes por categoría).
    presupuestos: [
      { categoria: "Comida", limite: 350 },
      { categoria: "Ocio", limite: 100 },
    ],
    // EN: Quick-add templates.
    // ES: Plantillas de alta rápida.
    plantillas: [
      { id: nuevoId(), concepto: "Café", importe: 1.5, signo: "gasto", categoria: "Cafetería" },
      { id: nuevoId(), concepto: "Gasolina", importe: 50, signo: "gasto", categoria: "Gasolina" },
      { id: nuevoId(), concepto: "Compra súper", importe: 60, signo: "gasto", categoria: "Supermercado" },
    ],
    // EN: Sample accounts (for the net-worth view).
    // ES: Cuentas de ejemplo (para el patrimonio).
    cuentas: [
      { id: nuevoId(), nombre: "Efectivo", saldoInicial: 200 },
      { id: nuevoId(), nombre: "Banco", saldoInicial: 1500 },
    ],
  };
}
