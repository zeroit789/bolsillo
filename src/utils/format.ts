/* =============================================================================
 * format.ts — Currency & date formatting / Formato de moneda y fechas
 * -----------------------------------------------------------------------------
 * EN: Formatting utilities (currency and dates), defaulting to Spanish (Spain).
 *     Currency code and date locale are reactive refs so the whole UI re-renders
 *     automatically when they change.
 * ES: Utilidades de formato (moneda y fechas) por defecto en español de España.
 *     El código de moneda y el locale de fecha son refs reactivos para que toda
 *     la UI se re-renderice sola cuando cambian.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Reactive currency & locale / Moneda y locale reactivos
 *   2. Currency formatter / Formateador de moneda
 *   3. Date formatters / Formateadores de fecha
 *   4. Month arithmetic (YYYY-MM) / Aritmética de meses (YYYY-MM)
 * ===========================================================================*/
import { ref } from "vue";

// ── 1. Reactive currency & locale / Moneda y locale reactivos ─────────────────
// EN: ISO code of the active currency (EUR by default). It is a ref so that
//     formatting amounts is REACTIVE: changing it re-renders all UI using euro().
// ES: Código ISO de la moneda activa (EUR por defecto). Es un ref para que
//     formatear importes sea REACTIVO: al cambiarlo, toda la UI que usa euro()
//     se vuelve a renderizar sola.
export const monedaActual = ref<string>("EUR");

// EN: Changes the active currency. Called by the settings store on sync.
// ES: Cambia la moneda activa. La llama el store de ajustes al sincronizar.
export function setMoneda(codigo: string): void {
  monedaActual.value = codigo;
}

// EN: Active locale for dates (es-ES by default). Reactive: changing it
//     re-renders every formatted date/month in the new language. Synced by the
//     settings store according to the chosen language (es-ES / en-US).
// ES: Locale activo para fechas (es-ES por defecto). Reactivo: al cambiarlo, todas
//     las fechas/meses formateados se re-renderizan en el nuevo idioma. Lo
//     sincroniza el store de ajustes según el idioma elegido (es-ES / en-US).
export const localeFecha = ref<string>("es-ES");
// EN: Changes the active date locale. / ES: Cambia el locale de fecha activo.
export function setLocaleFecha(locale: string): void {
  localeFecha.value = locale;
}

// ── 2. Currency formatter / Formateador de moneda ─────────────────────────────
// EN: Formats a number in the active currency: 1234.5 -> "1.234,50 €" (or $, £...).
//     Important: the formatter is created ON EACH CALL reading monedaActual.value.
//     That way Vue registers monedaActual as a dependency and reacts to changes.
//     (Do NOT cache the formatter at module level or reactivity would be lost.)
// ES: Formatea un número en la moneda activa: 1234.5 -> "1.234,50 €" (o $, £...).
//     Importante: el formateador se crea EN CADA LLAMADA leyendo monedaActual.value.
//     Así Vue registra monedaActual como dependencia y reacciona a sus cambios.
//     (No cachear el formateador a nivel de módulo o se perdería la reactividad.)
export function euro(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: monedaActual.value,
  }).format(n);
}

// ── 3. Date formatters / Formateadores de fecha ───────────────────────────────
// EN: Formats an ISO date ("2026-06-16") as "16 jun 2026" / "16 Jun 2026". The
//     formatter is created ON EACH CALL reading localeFecha.value so it is
//     reactive to language changes (same as euro() with currency).
// ES: Formatea una fecha ISO ("2026-06-16") como "16 jun 2026" / "16 Jun 2026".
//     El formateador se crea EN CADA LLAMADA leyendo localeFecha.value para que
//     sea reactivo al cambio de idioma (igual que euro() con la moneda).
export function fechaLegible(fechaISO: string): string {
  // EN: Guard: on a malformed date return it as-is instead of throwing RangeError
  //     (Intl blows up on Invalid Date) and breaking the render.
  // ES: Guardia: ante una fecha malformada, devolverla tal cual en vez de lanzar
  //     RangeError (Intl revienta con Invalid Date) y romper el render.
  if (!/^\d{4}-\d{2}-\d{2}/.test(fechaISO)) return fechaISO;
  const fmt = new Intl.DateTimeFormat(localeFecha.value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  // EN: Append T00:00 so timezone math doesn't subtract a day.
  // ES: Se añade T00:00 para que no reste un día por zona horaria.
  return fmt.format(new Date(fechaISO + "T00:00:00"));
}

// EN: Turns "YYYY-MM" into something readable: "2026-06" -> "Junio 2026" / "June 2026".
// ES: Convierte "YYYY-MM" en algo legible: "2026-06" -> "Junio 2026" / "June 2026".
export function mesLegible(mes: string): string {
  // EN: Guard: on a malformed month return it as-is instead of throwing
  //     RangeError and breaking the render of whatever uses it.
  // ES: Guardia: ante un mes malformado, devolverlo tal cual en vez de lanzar
  //     RangeError y romper el render del componente que lo use.
  if (!/^\d{4}-\d{2}$/.test(mes)) return mes;
  const [a, m] = mes.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat(localeFecha.value, {
    month: "long",
    year: "numeric",
  });
  const texto = fmt.format(new Date(a, m - 1, 1));
  // EN: Capitalize the first letter of the month. / ES: capitaliza el mes.
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ── 4. Month arithmetic (YYYY-MM) / Aritmética de meses (YYYY-MM) ─────────────
// EN: Current month in "YYYY-MM" format. / ES: Mes actual en formato "YYYY-MM".
export function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// EN: Number of months between two "YYYY-MM" (b - a). Ex: ("2026-01","2026-04") = 3.
// ES: Nº de meses entre dos "YYYY-MM" (b - a). Ej: ("2026-01","2026-04") = 3.
export function diffMeses(a: string, b: string): number {
  const [a1, m1] = a.split("-").map(Number);
  const [a2, m2] = b.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

// EN: Adds n months to a "YYYY-MM" and returns the resulting "YYYY-MM". Works on
//     an absolute month count, so it carries across year boundaries correctly.
// ES: Suma n meses a un "YYYY-MM" y devuelve el "YYYY-MM" resultante. Opera sobre
//     un recuento absoluto de meses, así que cruza bien el cambio de año.
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const año = Math.floor(total / 12);
  const mesNum = (total % 12) + 1;
  return `${año}-${String(mesNum).padStart(2, "0")}`;
}
