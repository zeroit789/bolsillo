<script setup lang="ts">
/* =============================================================================
 * CalendarioView.vue — Monthly calendar heatmap / Calendario mensual con heatmap
 * -----------------------------------------------------------------------------
 * EN: Renders the selected month as a Monday-to-Sunday day grid. Each cell shows
 *     a heatmap shaded by that day's spending, and clicking a day reveals the
 *     list of one-off transactions for that date.
 * ES: Muestra el mes seleccionado como una rejilla de días (lunes a domingo).
 *     Cada celda lleva un heatmap según el gasto del día, y al pulsar un día se
 *     ve la lista de movimientos puntuales de esa fecha.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports & store / Imports y store
 *   2. Translations (ES/EN) / Traducciones (ES/EN)
 *   3. Selected-day state / Estado del día seleccionado
 *   4. Weekday headers / Cabeceras de la semana
 *   5. Cell type & week offset / Tipo de celda y offset de semana
 *   6. Spending per day & heatmap max / Gasto por día y máximo del heatmap
 *   7. Month cells & leading gaps / Celdas del mes y huecos iniciales
 *   8. Cell heatmap style / Estilo heatmap de la celda
 *   9. Day transactions & selection / Movimientos del día y selección
 * ===========================================================================*/

// ── 1. Imports & store / Imports y store ──────────────────────────────────────
import { ref, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro, mesLegible } from "../utils/format";
import { crearT } from "../i18n";
import type { Puntual } from "../types";

// EN: Central finance store (one-off transactions + selected month).
// ES: Store central de finanzas (puntuales + mes seleccionado).
const f = useFinanzas();

// ── 2. Translations (ES/EN) / Traducciones (ES/EN) ────────────────────────────
// EN: Component translation function: every visible text in ES/EN.
// ES: Función de traducción del componente: todos los textos visibles ES/EN.
const t = crearT({
  titulo: { es: "Calendario", en: "Calendar" },
  sinMovimientos: { es: "Sin movimientos", en: "No transactions" },
  dia: { es: "Día", en: "Day" },
  // EN: Weekday headers (Monday to Sunday), one key per day.
  // ES: Cabeceras de la semana (lunes a domingo), una clave por día.
  diaLun: { es: "L", en: "M" },
  diaMar: { es: "M", en: "T" },
  diaMie: { es: "X", en: "W" },
  diaJue: { es: "J", en: "T" },
  diaVie: { es: "V", en: "F" },
  diaSab: { es: "S", en: "S" },
  diaDom: { es: "D", en: "S" },
});

// ── 3. Selected-day state / Estado del día seleccionado ───────────────────────
// EN: Day selected by the user ("YYYY-MM-DD") or null if none.
// ES: Día seleccionado por el usuario ("YYYY-MM-DD") o null si no hay ninguno.
const diaSeleccionado = ref<string | null>(null);

// ── 4. Weekday headers / Cabeceras de la semana ───────────────────────────────
// EN: Weekday headers, starting on Monday. Computed so it depends on the active
//     language: each entry is translated with t() (ES: L M X J V S D / EN: M T W T F S S).
// ES: Cabeceras de la semana, empezando en lunes. Computed para que dependa del
//     idioma activo: cada entrada se traduce con t() (ES: L M X J V S D / EN: M T W T F S S).
const DIAS_SEMANA = computed<string[]>(() => [
  t("diaLun"),
  t("diaMar"),
  t("diaMie"),
  t("diaJue"),
  t("diaVie"),
  t("diaSab"),
  t("diaDom"),
]);

// ── 5. Cell type & week offset / Tipo de celda y offset de semana ─────────────
// EN: Shape of each calendar cell.
// ES: Estructura de cada celda del calendario.
interface CeldaDia {
  fecha: string; // EN: "YYYY-MM-DD" of the day / ES: "YYYY-MM-DD" del día
  numero: number; // EN: day number within the month (1..31) / ES: número del día dentro del mes (1..31)
  gasto: number; // EN: total spent that day (sum of 'gasto' one-offs) / ES: total gastado ese día (suma de puntuales 'gasto')
}

// EN: Converts JS getDay() (0=Sunday..6=Saturday) to the offset for a week
//     starting on Monday: Monday=0, Tuesday=1, ..., Sunday=6.
// ES: Convierte el getDay() de JS (0=domingo..6=sábado) al offset con la semana
//     empezando en lunes: lunes=0, martes=1, ..., domingo=6.
function offsetLunes(diaSemanaJS: number): number {
  return (diaSemanaJS + 6) % 7;
}

// ── 6. Spending per day & heatmap max / Gasto por día y máximo del heatmap ────
// EN: Map date -> day spending for the selected month. Only sums one-offs with
//     'gasto' sign belonging to that month.
// ES: Mapa fecha -> gasto del día para el mes seleccionado. Solo suma los
//     puntuales con signo 'gasto' de ese mes.
const gastoPorDia = computed<Map<string, number>>(() => {
  const mapa = new Map<string, number>();
  const mes = f.mesSeleccionado; // "YYYY-MM"
  for (const p of f.puntuales as Puntual[]) {
    // EN: Filter by month and by 'gasto' sign.
    // ES: Filtra por mes y por signo gasto.
    if (p.signo !== "gasto") continue;
    if (p.fecha.slice(0, 7) !== mes) continue;
    mapa.set(p.fecha, (mapa.get(p.fecha) ?? 0) + p.importe);
  }
  return mapa;
});

// EN: Highest single-day spending in the month (reference for heatmap intensity).
// ES: Gasto máximo de un día en el mes (referencia para la intensidad del heatmap).
const gastoMaximo = computed<number>(() => {
  let max = 0;
  for (const v of gastoPorDia.value.values()) {
    if (v > max) max = v;
  }
  return max;
});

// ── 7. Month cells & leading gaps / Celdas del mes y huecos iniciales ─────────
// EN: List of real month cells (one object per day from 1 to the last).
// ES: Lista de celdas reales del mes (un objeto por día del 1 al último).
const celdas = computed<CeldaDia[]>(() => {
  const [anio, mes] = f.mesSeleccionado.split("-").map(Number);
  // EN: Day 0 of next month = last day of current month -> number of days.
  // ES: Día 0 del mes siguiente = último día del mes actual -> nº de días del mes.
  const diasDelMes = new Date(anio, mes, 0).getDate();
  const lista: CeldaDia[] = [];
  for (let d = 1; d <= diasDelMes; d++) {
    // EN: Build the "YYYY-MM-DD" date with leading zeros.
    // ES: Construye la fecha "YYYY-MM-DD" con ceros a la izquierda.
    const fecha = `${f.mesSeleccionado}-${String(d).padStart(2, "0")}`;
    lista.push({
      fecha,
      numero: d,
      gasto: gastoPorDia.value.get(fecha) ?? 0,
    });
  }
  return lista;
});

// EN: Number of empty cells at the start (offset from the month's first day to Monday).
// ES: Nº de celdas vacías al inicio (offset del primer día del mes hasta el lunes).
const huecosIniciales = computed<number>(() => {
  const [anio, mes] = f.mesSeleccionado.split("-").map(Number);
  // EN: getDay of the 1st of the month, adjusted to a week starting on Monday.
  // ES: getDay del día 1 del mes, ajustado a semana que empieza en lunes.
  const primerDia = new Date(anio, mes - 1, 1).getDay();
  return offsetLunes(primerDia);
});

// ── 8. Cell heatmap style / Estilo heatmap de la celda ────────────────────────
// EN: Background style of each cell based on its spending (heatmap via color-mix).
//     Days with no spending -> neutral background; with spending -> bg-danger mix
//     scaled by intensity.
// ES: Estilo de fondo de cada celda según su gasto (heatmap con color-mix).
//     Días sin gasto -> fondo neutro; con gasto -> mezcla de bg-danger según
//     intensidad.
function estiloCelda(celda: CeldaDia): Record<string, string> {
  // EN: No spending: no inline style applied (the neutral bg-surface-2 class is used).
  // ES: Sin gasto: no aplicamos estilo inline (se usa la clase neutra bg-surface-2).
  if (celda.gasto <= 0 || gastoMaximo.value <= 0) return {};
  // EN: Intensity relative to the highest-spending day (~12% to 85% so it shows).
  // ES: Intensidad relativa al día de mayor gasto (entre ~12% y 85% para que se vea).
  const ratio = celda.gasto / gastoMaximo.value;
  const porcentaje = Math.round(12 + ratio * 73); // 12%..85%
  // EN: Mix the danger red with transparency: more spending = more intense background.
  // ES: Mezcla el rojo de peligro con transparencia: a más gasto, fondo más intenso.
  return {
    background: `color-mix(in srgb, var(--color-danger) ${porcentaje}%, transparent)`,
  };
}

// ── 9. Day transactions & selection / Movimientos del día y selección ─────────
// EN: Returns the one-off transactions (all signs) for a specific date.
// ES: Devuelve los movimientos puntuales (todos los signos) de una fecha concreta.
function movimientosDelDia(fecha: string): Puntual[] {
  return (f.puntuales as Puntual[])
    .filter((p) => p.fecha === fecha)
    .sort((a, b) => {
      // EN: Income first, then by descending amount (same as the monthly list).
      // ES: Ingresos primero, luego por importe descendente (igual que la lista del mes).
      if (a.signo !== b.signo) return a.signo === "ingreso" ? -1 : 1;
      return b.importe - a.importe;
    });
}

// EN: Transactions of the currently selected day (empty if no day is chosen).
// ES: Movimientos del día actualmente seleccionado (vacío si no hay día elegido).
const movimientosSeleccion = computed<Puntual[]>(() => {
  if (!diaSeleccionado.value) return [];
  return movimientosDelDia(diaSeleccionado.value);
});

// EN: Readable label of the selected day for the bottom panel header.
// ES: Texto legible del día seleccionado para la cabecera del panel inferior.
const tituloSeleccion = computed<string>(() => {
  if (!diaSeleccionado.value) return "";
  const [, , d] = diaSeleccionado.value.split("-");
  // EN: "Day N · month" (EN) / "Día N · mes" (ES); number and month are not translated.
  // ES: "Día N · mes" (ES) / "Day N · month" (EN); el número y el mes no se traducen.
  return `${t("dia")} ${Number(d)} · ${mesLegible(f.mesSeleccionado)}`;
});

// EN: Toggles the day on click (a second click on the same day closes it).
// ES: Marca/desmarca el día al hacer clic (segundo clic en el mismo día lo cierra).
function seleccionarDia(fecha: string): void {
  diaSeleccionado.value = diaSeleccionado.value === fecha ? null : fecha;
}
</script>

<template>
  <div>
    <!-- EN: Header: view title + readable month -->
    <!-- ES: Cabecera: título de la vista + mes legible -->
    <div class="mb-6">
      <h2 class="font-display text-2xl font-bold">{{ t("titulo") }}</h2>
      <p class="text-muted mt-0.5">{{ mesLegible(f.mesSeleccionado) }}</p>
    </div>

    <!-- EN: Card holding the month grid / ES: Tarjeta con la rejilla del mes -->
    <div class="rounded-2xl bg-surface border border-border p-5">
      <!-- EN: Weekday headers (ES: L M X J V S D / EN: M T W T F S S) -->
      <!-- ES: Cabeceras de la semana (ES: L M X J V S D / EN: M T W T F S S) -->
      <!-- EN: key by index: English has repeated letters (T, S) that must not collide -->
      <!-- ES: key por índice: en inglés hay letras repetidas (T, S) y no pueden colisionar -->
      <div class="grid grid-cols-7 gap-1.5 mb-1.5">
        <div
          v-for="(dia, i) in DIAS_SEMANA"
          :key="i"
          class="text-center text-faint text-xs font-medium py-1"
        >
          {{ dia }}
        </div>
      </div>

      <!-- EN: Day grid: first the gaps, then each day of the month -->
      <!-- ES: Rejilla de días: primero los huecos, luego cada día del mes -->
      <div class="grid grid-cols-7 gap-1.5">
        <!-- EN: Gaps before the first day (offset up to Monday) -->
        <!-- ES: Huecos antes del primer día (offset hasta el lunes) -->
        <div v-for="n in huecosIniciales" :key="'hueco-' + n" class="aspect-square" />

        <!-- EN: One cell per day of the month / ES: Celda por cada día del mes -->
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
          <!-- EN: Day number / ES: Número del día -->
          <span
            class="text-xs font-medium"
            :class="celda.gasto > 0 ? 'text-ink' : 'text-muted'"
          >
            {{ celda.numero }}
          </span>
          <!-- EN: Amount spent that day (only if there is spending) -->
          <!-- ES: Importe gastado ese día (solo si hay gasto) -->
          <span
            v-if="celda.gasto > 0"
            class="text-[0.625rem] leading-tight font-medium tabular-nums text-ink truncate"
          >
            {{ euro(celda.gasto) }}
          </span>
        </button>
      </div>
    </div>

    <!-- EN: Bottom panel: transactions of the selected day -->
    <!-- ES: Panel inferior: movimientos del día seleccionado -->
    <div
      v-if="diaSeleccionado"
      class="mt-5 rounded-2xl bg-surface border border-border p-5"
    >
      <h3 class="font-display font-bold mb-4">{{ tituloSeleccion }}</h3>

      <!-- EN: No transactions that day / ES: Sin movimientos ese día -->
      <p v-if="!movimientosSeleccion.length" class="text-muted text-sm">
        {{ t("sinMovimientos") }}
      </p>

      <!-- EN: List of one-off transactions for the day -->
      <!-- ES: Lista de movimientos puntuales del día -->
      <ul v-else class="divide-y divide-border">
        <li
          v-for="m in movimientosSeleccion"
          :key="m.id"
          class="flex items-center gap-3 py-3"
        >
          <!-- EN: Colored dot according to the sign / ES: Punto de color según el signo -->
          <span
            class="size-2.5 rounded-full shrink-0"
            :class="m.signo === 'ingreso' ? 'bg-ok' : 'bg-danger'"
          />

          <!-- EN: Concept + category / ES: Concepto + categoría -->
          <div class="min-w-0 flex-1">
            <p class="truncate">{{ m.concepto }}</p>
            <p class="text-faint text-xs mt-0.5">
              <span class="rounded-full bg-surface-2 px-2 py-0.5">{{ m.categoria }}</span>
            </p>
          </div>

          <!-- EN: Amount colored by sign / ES: Importe con color por signo -->
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
