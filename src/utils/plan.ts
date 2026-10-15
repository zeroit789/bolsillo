/* =============================================================================
 * plan.ts — Cálculos de los planes de ahorro / Savings plan calculations
 * -----------------------------------------------------------------------------
 * ES: Lógica pura de los planes (metas de ahorro): redondeo a céntimos,
 *     progreso, lo que falta y si ya está conseguido. Sale de PlanesView.vue
 *     para poder probarla con tests sin montar el componente.
 * EN: Pure savings-plan (goal) logic: rounding to cents, progress, what is left
 *     and whether it is achieved. Moved out of PlanesView.vue so it can be
 *     tested without mounting the component.
 * ===========================================================================*/
import type { Plan } from "../types";

// ES: Redondea un número a 2 decimales (céntimos). Acepta coma o punto decimal.
// EN: Rounds a number to 2 decimals (cents). Accepts decimal comma or dot.
export function r2(valor: number | string): number {
  // ES: Si viene como texto con coma decimal ("12,50") se normaliza a punto.
  // EN: If it comes as text with decimal comma ("12,50") it's normalized to dot.
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ES: Porcentaje de progreso de un plan, recortado (clamp) al rango 0..100.
// EN: Progress percentage of a plan, clamped to the 0..100 range.
export function progreso(plan: Plan): number {
  // ES: Si el objetivo es 0 o negativo no se puede calcular: se considera 0%.
  // EN: If the goal is 0 or negative it can't be computed: treated as 0%.
  if (plan.objetivo <= 0) return 0;
  const pct = (plan.aportado / plan.objetivo) * 100;
  // ES: clamp 0..100 para que la barra nunca se desborde ni quede negativa.
  // EN: clamp 0..100 so the bar never overflows nor goes negative.
  return Math.min(100, Math.max(0, pct));
}

// ES: Lo que falta para llegar al objetivo (nunca negativo).
// EN: What's left to reach the goal (never negative).
export function restante(plan: Plan): number {
  return Math.max(0, r2(plan.objetivo - plan.aportado));
}

// ES: true si el plan ya está conseguido (aportado >= objetivo).
// EN: true if the plan is already achieved (saved >= goal).
export function conseguido(plan: Plan): boolean {
  // ES: Requiere objetivo válido (>0) para no marcar "conseguido" un plan a 0.
  // EN: Requires a valid goal (>0) so a plan at 0 isn't flagged "achieved".
  return plan.objetivo > 0 && plan.aportado >= plan.objetivo;
}
