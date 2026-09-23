<script setup lang="ts">
/* =============================================================================
 * CalendarioView.vue — Calendario mensual con heatmap / Monthly calendar heatmap
 * -----------------------------------------------------------------------------
 * ES: Muestra el mes seleccionado como una rejilla de días (lunes a domingo).
 *     Cada celda lleva un heatmap según el gasto del día, y al pulsar un día se
 *     ve la lista de movimientos puntuales de esa fecha.
 * EN: Renders the selected month as a Monday-to-Sunday day grid. Each cell shows
 *     a heatmap shaded by that day's spending, and clicking a day reveals the
 *     list of one-off transactions for that date.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y store / Imports & store
 *   2. Traducciones (ES/EN) / Translations (ES/EN)
 *   3. Estado del día seleccionado / Selected-day state
 *   4. Cabeceras de la semana / Weekday headers
 *   5. Tipo de celda y offset de semana / Cell type & week offset
 *   6. Gasto por día y máximo del heatmap / Spending per day & heatmap max
 *   7. Celdas del mes y huecos iniciales / Month cells & leading gaps
 *   8. Estilo heatmap de la celda / Cell heatmap style
 *   9. Movimientos del día y selección / Day transactions & selection
 * ===========================================================================*/

// ── 1. Imports y store / Imports & store ──────────────────────────────────────
import { ref, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro, mesLegible } from "../utils/format";
import { crearT } from "../i18n";
import type { Puntual } from "../types";

// ES: Store central de finanzas (puntuales + mes seleccionado).
// EN: Central finance store (one-off transactions + selected month).
const f = useFinanzas();

// ── 2. Traducciones (ES/EN) / Translations (ES/EN) ────────────────────────────
// ES: Función de traducción del componente: todos los textos visibles ES/EN.
// EN: Component translation function: every visible text in ES/EN.
const t = crearT({
  titulo: { es: "Calendario", en: "Calendar" },
  sinMovimientos: { es: "Sin movimientos", en: "No transactions" },
  dia: { es: "Día", en: "Day" },
  // ES: Cabeceras de la semana (lunes a domingo), una clave por día.
  // EN: Weekday headers (Monday to Sunday), one key per day.
  diaLun: { es: "L", en: "M" },
  diaMar: { es: "M", en: "T" },
  diaMie: { es: "X", en: "W" },
  diaJue: { es: "J", en: "T" },
  diaVie: { es: "V", en: "F" },
  diaSab: { es: "S", en: "S" },
  diaDom: { es: "D", en: "S" },
});

// ── 3. Estado del día seleccionado / Selected-day state ───────────────────────
// ES: Día seleccionado por el usuario ("YYYY-MM-DD") o null si no hay ninguno.
// EN: Day selected by the user ("YYYY-MM-DD") or null if none.
const diaSeleccionado = ref<string | null>(null);

// ── 4. Cabeceras de la semana / Weekday headers ───────────────────────────────
// ES: Cabeceras de la semana, empezando en lunes. Computed para que dependa del
//     idioma activo: cada entrada se traduce con t() (ES: L M X J V S D / EN: M T W T F S S).
// EN: Weekday headers, starting on Monday. Computed so it depends on the active
//     language: each entry is translated with t() (ES: L M X J V S D / EN: M T W T F S S).
const DIAS_SEMANA = computed<string[]>(() => [
  t("diaLun"),
  t("diaMar"),
  t("diaMie"),
  t("diaJue"),
  t("diaVie"),
  t("diaSab"),
  t("diaDom"),
]);

// ── 5. Tipo de celda y offset de semana / Cell type & week offset ─────────────
// ES: Estructura de cada celda del calendario.
// EN: Shape of each calendar cell.
interface CeldaDia {
  fecha: string; // ES: "YYYY-MM-DD" del día / EN: "YYYY-MM-DD" of the day
  numero: number; // ES: número del día dentro del mes (1..31) / EN: day number within the month (1..31)
  gasto: number; // ES: total gastado ese día (suma de puntuales 'gasto') / EN: total spent that day (sum of 'gasto' one-offs)
}

// ES: Convierte el getDay() de JS (0=domingo..6=sábado) al offset con la semana
//     empezando en lunes: lunes=0, martes=1, ..., domingo=6.
// EN: Converts JS getDay() (0=Sunday..6=Saturday) to the offset for a week
//     starting on Monday: Monday=0, Tuesday=1, ..., Sunday=6.
function offsetLunes(diaSemanaJS: number): number {
  return (diaSemanaJS + 6) % 7;
}

// ── 6. Gasto por día y máximo del heatmap / Spending per day & heatmap max ────
// ES: Mapa fecha -> gasto del día para el mes seleccionado. Solo suma los
//     puntuales con signo 'gasto' de ese mes.
// EN: Map date -> day spending for the selected month. Only sums one-offs with
//     'gasto' sign belonging to that month.
const gastoPorDia = computed<Map<string, number>>(() => {
  const mapa = new Map<string, number>();
  const mes = f.mesSeleccionado; // "YYYY-MM"
  for (const p of f.puntuales as Puntual[]) {
    // ES: Filtra por mes y por signo gasto.
    // EN: Filter by month and by 'gasto' sign.
    if (p.signo !== "gasto") continue;
    if (p.fecha.slice(0, 7) !== mes) continue;
    mapa.set(p.fecha, (mapa.get(p.fecha) ?? 0) + p.importe);
  }
  return mapa;
});

// ES: Gasto máximo de un día en el mes (referencia para la intensidad del heatmap).
// EN: Highest single-day spending in the month (reference for heatmap intensity).
const gastoMaximo = computed<number>(() => {
  let max = 0;
  for (const v of gastoPorDia.value.values()) {
    if (v > max) max = v;
  }
  return max;
});

// ── 7. Celdas del mes y huecos iniciales / Month cells & leading gaps ─────────
// ES: Lista de celdas reales del mes (un objeto por día del 1 al último).
// EN: List of real month cells (one object per day from 1 to the last).
const celdas = computed<CeldaDia[]>(() => {
  const [anio, mes] = f.mesSeleccionado.split("-").map(Number);
  // ES: Día 0 del mes siguiente = último día del mes actual -> nº de días del mes.
  // EN: Day 0 of next month = last day of current month -> number of days.
  const diasDelMes = new Date(anio, mes, 0).getDate();
  const lista: CeldaDia[] = [];
  for (let d = 1; d <= diasDelMes; d++) {
    // ES: Construye la fecha "YYYY-MM-DD" con ceros a la izquierda.
    // EN: Build the "YYYY-MM-DD" date with leading zeros.
    const fecha = `${f.mesSeleccionado}-${String(d).padStart(2, "0")}`;
    lista.push({
      fecha,
      numero: d,
      gasto: gastoPorDia.value.get(fecha) ?? 0,
    });
  }
  return lista;
});

// ES: Nº de celdas vacías al inicio (offset del primer día del mes hasta el lunes).
// EN: Number of empty cells at the start (offset from the month's first day to Monday).
const huecosIniciales = computed<number>(() => {
  const [anio, mes] = f.mesSeleccionado.split("-").map(Number);
  // ES: getDay del día 1 del mes, ajustado a semana que empieza en lunes.
  // EN: getDay of the 1st of the month, adjusted to a week starting on Monday.
  const primerDia = new Date(anio, mes - 1, 1).getDay();
  return offsetLunes(primerDia);
});

// ── 8. Estilo heatmap de la celda / Cell heatmap style ────────────────────────
// ES: Estilo de fondo de cada celda según su gasto (heatmap con color-mix).
//     Días sin gasto -> fondo neutro; con gasto -> mezcla de bg-danger según
//     intensidad.
// EN: Background style of each cell based on its spending (heatmap via color-mix).
//     Days with no spending -> neutral background; with spending -> bg-danger mix
//     scaled by intensity.
function estiloCelda(celda: CeldaDia): Record<string, string> {
  // ES: Sin gasto: no aplicamos estilo inline (se usa la clase neutra bg-surface-2).
  // EN: No spending: no inline style applied (the neutral bg-surface-2 class is used).
  if (celda.gasto <= 0 || gastoMaximo.value <= 0) return {};
  // ES: Intensidad relativa al día de mayor gasto (entre ~12% y 85% para que se vea).
  // EN: Intensity relative to the highest-spending day (~12% to 85% so it shows).
  const ratio = celda.gasto / gastoMaximo.value;
  const porcentaje = Math.round(12 + ratio * 73); // 12%..85%
  // ES: Mezcla el rojo de peligro con transparencia: a más gasto, fondo más intenso.
  // EN: Mix the danger red with transparency: more spending = more intense background.
  return {
    background: `color-mix(in srgb, var(--color-danger) ${porcentaje}%, transparent)`,
  };
}

// ── 9. Movimientos del día y selección / Day transactions & selection ─────────
// ES: Devuelve los movimientos puntuales (todos los signos) de una fecha concreta.
// EN: Returns the one-off transactions (all signs) for a specific date.
function movimientosDelDia(fecha: string): Puntual[] {
  return (f.puntuales as Puntual[])
    .filter((p) => p.fecha === fecha)
    .sort((a, b) => {
      // ES: Ingresos primero, luego por importe descendente (igual que la lista del mes).
      // EN: Income first, then by descending amount (same as the monthly list).
      if (a.signo !== b.signo) return a.signo === "ingreso" ? -1 : 1;
      return b.importe - a.importe;
    });
}

// ES: Movimientos del día actualmente seleccionado (vacío si no hay día elegido).
// EN: Transactions of the currently selected day (empty if no day is chosen).
const movimientosSeleccion = computed<Puntual[]>(() => {
  if (!diaSeleccionado.value) return [];
  return movimientosDelDia(diaSeleccionado.value);
});

// ES: Texto legible del día seleccionado para la cabecera del panel inferior.
// EN: Readable label of the selected day for the bottom panel header.
const tituloSeleccion = computed<string>(() => {
  if (!diaSeleccionado.value) return "";
  const [, , d] = diaSeleccionado.value.split("-");
  // ES: "Día N · mes" (ES) / "Day N · month" (EN); el número y el mes no se traducen.
  // EN: "Day N · month" (EN) / "Día N · mes" (ES); number and month are not translated.
  return `${t("dia")} ${Number(d)} · ${mesLegible(f.mesSeleccionado)}`;
});

// ES: Marca/desmarca el día al hacer clic (segundo clic en el mismo día lo cierra).
// EN: Toggles the day on click (a second click on the same day closes it).
function seleccionarDia(fecha: string): void {
  diaSeleccionado.value = diaSeleccionado.value === fecha ? null : fecha;
}
</script>

<template>
  <div>
    <!-- ES: Cabecera: título de la vista + mes legible -->
    <!-- EN: Header: view title + readable month -->
    <div class="mb-6">
      <h2 class="font-display text-2xl font-bold">{{ t("titulo") }}</h2>
      <p class="text-muted mt-0.5">{{ mesLegible(f.mesSeleccionado) }}</p>
    </div>

    <!-- ES: Tarjeta con la rejilla del mes / EN: Card holding the month grid -->
    <div class="rounded-2xl bg-surface border border-border p-5">
      <!-- ES: Cabeceras de la semana (ES: L M X J V S D / EN: M T W T F S S) -->
      <!-- EN: Weekday headers (ES: L M X J V S D / EN: M T W T F S S) -->
      <!-- ES: key por índice: en inglés hay letras repetidas (T, S) y no pueden colisionar -->
      <!-- EN: key by index: English has repeated letters (T, S) that must not collide -->
      <div class="grid grid-cols-7 gap-1.5 mb-1.5">
        <div
          v-for="(dia, i) in DIAS_SEMANA"
          :key="i"
          class="text-center text-faint text-xs font-medium py-1"
        >
          {{ dia }}
        </div>
      </div>

      <!-- ES: Rejilla de días: primero los huecos, luego cada día del mes -->
      <!-- EN: Day grid: first the gaps, then each day of the month -->
      <div class="grid grid-cols-7 gap-1.5">
        <!-- ES: Huecos antes del primer día (offset hasta el lunes) -->
        <!-- EN: Gaps before the first day (offset up to Monday) -->
        <div v-for="n in huecosIniciales" :key="'hueco-' + n" class="aspect-square" />

        <!-- ES: Celda por cada día del mes / EN: One cell per day of the month -->
        <button
          v-for="celda in celdas"
          :key="celda.fecha"
          type="button"
          class="aspect-square rounded-xl border p-1.5 flex flex-col justify-between text-left transition-colors"
          :class="[
            celda.gasto > 0 ? 'border-transparent' : 'bg-surface-2 border-border',
            diaSeleccionado === celda.fecha ? '!border-brand' : '',
          ]"
          :style="estiloCelda(celda)"
          @click="seleccionarDia(celda.fecha)"
        >
          <!-- ES: Número del día / EN: Day number -->
          <span
            class="text-xs font-medium"
            :class="celda.gasto > 0 ? 'text-ink' : 'text-muted'"
          >
            {{ celda.numero }}
          </span>
          <!-- ES: Importe gastado ese día (solo si hay gasto) -->
          <!-- EN: Amount spent that day (only if there is spending) -->
          <span
            v-if="celda.gasto > 0"
            class="text-[0.625rem] leading-tight font-medium tabular-nums text-ink truncate"
          >
            {{ euro(celda.gasto) }}
          </span>
        </button>
      </div>
    </div>

    <!-- ES: Panel inferior: movimientos del día seleccionado -->
    <!-- EN: Bottom panel: transactions of the selected day -->
    <div
      v-if="diaSeleccionado"
      class="mt-5 rounded-2xl bg-surface border border-border p-5"
    >
      <h3 class="font-display font-bold mb-4">{{ tituloSeleccion }}</h3>

      <!-- ES: Sin movimientos ese día / EN: No transactions that day -->
      <p v-if="!movimientosSeleccion.length" class="text-muted text-sm">
        {{ t("sinMovimientos") }}
      </p>

      <!-- ES: Lista de movimientos puntuales del día -->
      <!-- EN: List of one-off transactions for the day -->
      <ul v-else class="divide-y divide-border">
        <li
          v-for="m in movimientosSeleccion"
          :key="m.id"
          class="flex items-center gap-3 py-3"
        >
          <!-- ES: Punto de color según el signo / EN: Colored dot according to the sign -->
          <span
            class="size-2.5 rounded-full shrink-0"
            :class="m.signo === 'ingreso' ? 'bg-ok' : 'bg-danger'"
          />

          <!-- ES: Concepto + categoría / EN: Concept + category -->
          <div class="min-w-0 flex-1">
            <p class="truncate">{{ m.concepto }}</p>
            <p class="text-faint text-xs mt-0.5">
              <span class="rounded-full bg-surface-2 px-2 py-0.5">{{ m.categoria }}</span>
            </p>
          </div>

          <!-- ES: Importe con color por signo / EN: Amount colored by sign -->
          <span
            class="font-medium tabular-nums shrink-0"
            :class="m.signo === 'ingreso' ? 'text-ok' : 'text-danger'"
          >
            {{ m.signo === "ingreso" ? "+" : "−" }}{{ euro(m.importe) }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
