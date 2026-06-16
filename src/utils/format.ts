/* ===========================================================================
   Utilidades de formato (moneda y fechas) en español de España.
   =========================================================================== */
import { ref } from "vue";

// Código ISO de la moneda activa (EUR por defecto). Es un ref para que
// formatear importes sea REACTIVO: al cambiarlo, toda la UI que usa euro()
// se vuelve a renderizar sola.
export const monedaActual = ref<string>("EUR");

// Cambia la moneda activa. La llama el store de ajustes al sincronizar.
export function setMoneda(codigo: string): void {
  monedaActual.value = codigo;
}

// Formatea un número en la moneda activa: 1234.5 -> "1.234,50 €" (o $, £...).
// Importante: el formateador se crea EN CADA LLAMADA leyendo monedaActual.value.
// Así Vue registra monedaActual como dependencia y reacciona a sus cambios.
// (No cachear el formateador a nivel de módulo o se perdería la reactividad.)
export function euro(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: monedaActual.value,
  }).format(n);
}

// Formatea una fecha ISO ("2026-06-16") como "16 jun 2026"
const FORMATO_FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function fechaLegible(fechaISO: string): string {
  // Se añade T00:00 para que no reste un día por zona horaria
  return FORMATO_FECHA.format(new Date(fechaISO + "T00:00:00"));
}

// Convierte "YYYY-MM" en algo legible: "2026-06" -> "Junio 2026"
const FORMATO_MES = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
});

export function mesLegible(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const texto = FORMATO_MES.format(new Date(a, m - 1, 1));
  return texto.charAt(0).toUpperCase() + texto.slice(1); // "Junio 2026"
}

// Mes actual en formato "YYYY-MM"
export function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Nº de meses entre dos "YYYY-MM" (b - a). Ej: ("2026-01","2026-04") = 3
export function diffMeses(a: string, b: string): number {
  const [a1, m1] = a.split("-").map(Number);
  const [a2, m2] = b.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

// Suma n meses a un "YYYY-MM" y devuelve el "YYYY-MM" resultante.
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const año = Math.floor(total / 12);
  const mesNum = (total % 12) + 1;
  return `${año}-${String(mesNum).padStart(2, "0")}`;
}
