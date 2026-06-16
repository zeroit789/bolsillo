<script setup lang="ts">
/* ===========================================================================
   Comparativa de periodos.
   Compara el MES SELECCIONADO (store) con el mes ANTERIOR y muestra
   ingresos, gastos totales y disponible de ambos, junto con la variación
   (importe y %). Reglas de color:
     - Gasto: sube = malo (rojo), baja = bueno (verde).
     - Ingresos / disponible: sube = bueno (verde), baja = malo (rojo).
   =========================================================================== */
import { computed } from "vue";
// Store de finanzas (Pinia): expone resumenDe(mes) y mesSeleccionado.
import { useFinanzas } from "../stores/finanzas";
// Utilidades de formato: euro(), mesLegible() y sumarMeses() para el mes previo.
import { euro, mesLegible, sumarMeses } from "../utils/format";
// Sistema de traducción propio (ES/EN): crea la función t() del componente.
import { crearT } from "../i18n";

// Textos visibles del componente con sus traducciones ES/EN.
const t = crearT({
  titulo: { es: "Comparativa con el mes anterior", en: "Comparison with previous month" },
  frenteA: { es: "frente a", en: "vs" }, // une los dos meses en el subtítulo
  ingresos: { es: "Ingresos", en: "Income" },
  gastosTotales: { es: "Gastos totales", en: "Total expenses" },
  disponible: { es: "Disponible", en: "Available" },
  antes: { es: "Antes:", en: "Before:" }, // prefijo del valor del mes anterior
  noDisponible: { es: "n/d", en: "n/a" }, // % sin base de comparación
});

// Instancia reactiva de la store.
const finanzas = useFinanzas();

// Mes actual seleccionado ("YYYY-MM") y el inmediatamente anterior.
const mesActualSel = computed<string>(() => finanzas.mesSeleccionado);
const mesAnterior = computed<string>(() => sumarMeses(mesActualSel.value, -1));

// Resúmenes de KPIs de ambos meses (los calcula la store).
const actual = computed(() => finanzas.resumenDe(mesActualSel.value));
const anterior = computed(() => finanzas.resumenDe(mesAnterior.value));

// Estructura de una fila de comparación ya calculada para la plantilla.
interface FilaComparativa {
  clave: string; // clave i18n de la métrica (sirve de :key y de texto traducido)
  valorActual: number; // importe del mes seleccionado
  valorAnterior: number; // importe del mes anterior
  variacion: number; // diferencia (actual - anterior)
  porcentaje: number | null; // % de variación (null si no se puede calcular)
  subirEsBueno: boolean; // true en ingresos/disponible, false en gasto
}

// Calcula la variación en % protegiendo la división por cero.
// Si el mes anterior es 0: devolvemos null (no hay base de comparación).
function porcentajeVariacion(actualV: number, anteriorV: number): number | null {
  if (anteriorV === 0) return null;
  return ((actualV - anteriorV) / Math.abs(anteriorV)) * 100;
}

// Construye una fila de comparación a partir de los dos valores y la regla de color.
function construirFila(
  clave: string,
  valorActual: number,
  valorAnterior: number,
  subirEsBueno: boolean
): FilaComparativa {
  return {
    clave,
    valorActual,
    valorAnterior,
    variacion: valorActual - valorAnterior,
    porcentaje: porcentajeVariacion(valorActual, valorAnterior),
    subirEsBueno,
  };
}

// Las tres filas que se muestran: ingresos, gastos totales y disponible.
const filas = computed<FilaComparativa[]>(() => [
  // Ingresos: subir es bueno (verde).
  construirFila("ingresos", actual.value.ingresos, anterior.value.ingresos, true),
  // Gastos totales: subir es malo (rojo).
  construirFila("gastosTotales", actual.value.totalGastos, anterior.value.totalGastos, false),
  // Disponible: subir es bueno (verde).
  construirFila("disponible", actual.value.disponible, anterior.value.disponible, true),
]);

// Devuelve la clase de color de la variación según la regla de cada métrica.
// Sin cambio (variación 0) -> texto apagado.
function claseVariacion(fila: FilaComparativa): string {
  if (fila.variacion === 0) return "text-faint";
  // ¿La variación es "buena"? Depende de si subir es bueno o malo.
  const esBuena = fila.subirEsBueno ? fila.variacion > 0 : fila.variacion < 0;
  return esBuena ? "text-ok" : "text-danger";
}

// Flecha según el signo de la variación (▲ sube, ▼ baja, — sin cambio).
function flecha(variacion: number): string {
  if (variacion > 0) return "▲";
  if (variacion < 0) return "▼";
  return "—";
}

// Texto del porcentaje formateado con signo, o "n/d" si no hay base de cálculo.
function textoPorcentaje(porcentaje: number | null): string {
  if (porcentaje === null) return t("noDisponible");
  const signo = porcentaje > 0 ? "+" : ""; // los negativos ya llevan su signo
  return `${signo}${porcentaje.toFixed(1)} %`;
}
</script>

<template>
  <!-- Tarjeta de comparativa con el mes anterior -->
  <section class="rounded-2xl bg-surface border border-border p-5">
    <!-- Título y subtítulo con los dos meses comparados -->
    <h2 class="font-display font-bold text-lg text-ink">{{ t("titulo") }}</h2>
    <p class="mt-1 text-sm text-muted">
      {{ mesLegible(mesActualSel) }} {{ t("frenteA") }} {{ mesLegible(mesAnterior) }}
    </p>

    <!-- Una fila por métrica: ingresos, gastos totales y disponible -->
    <div class="mt-4 space-y-4">
      <div
        v-for="fila in filas"
        :key="fila.clave"
        class="grid grid-cols-3 items-center gap-3"
      >
        <!-- Columna 1: nombre de la métrica + valor del mes anterior -->
        <div>
          <p class="text-sm text-ink">{{ t(fila.clave) }}</p>
          <p class="text-xs text-faint">{{ t("antes") }} {{ euro(fila.valorAnterior) }}</p>
        </div>

        <!-- Columna 2: valor del mes seleccionado (el destacado) -->
        <div class="text-right">
          <p class="font-display font-bold text-ink">{{ euro(fila.valorActual) }}</p>
        </div>

        <!-- Columna 3: variación (flecha + importe + %) con color según regla -->
        <div class="text-right" :class="claseVariacion(fila)">
          <p class="font-medium">
            {{ flecha(fila.variacion) }} {{ euro(fila.variacion) }}
          </p>
          <p class="text-xs">{{ textoPorcentaje(fila.porcentaje) }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
